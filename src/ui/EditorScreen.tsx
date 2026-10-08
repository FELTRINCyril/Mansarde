import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { Id, Project } from '@/core/model/types';
import { watchBackgroundMode } from '@/editor/background';
import { placeObjectAt } from '@/editor/placeObject';
import { useEditor } from '@/editor/store';
import { screenToWorld } from '@/editor/view';
import { startAutosave, type SaveStatus } from '@/storage/autosave';
import type { ProjectStore, StoredImage } from '@/storage/db';
import { imageSize } from '@/storage/files';
import { Banner } from './Banner';
import { BackgroundServicesContext, type BackgroundServices } from './backgroundServices';
import { CatalogPanel } from './CatalogPanel';
import { ExportDialog } from './ExportDialog';
import { Header } from './Header';
import { levelsWithMissingImages, missingImageMessage } from './imageCheck';
import { LevelTabs } from './LevelTabs';
import { PlanCanvas, type Size } from './PlanCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { SettingsDialog } from './SettingsDialog';
import { Toolbar } from './Toolbar';

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface EditorScreenProps {
  projectId: Id;
  projectStore: ProjectStore;
  /** Newer in-memory version of the project (its last save failed); loaded from the store otherwise. */
  initialProject?: Project;
  saver(p: Project): Promise<void>;
  /** Receives the promise of the saves flushed when the editor closes (settled once they completed). */
  onSavesPending(done: Promise<void>): void;
  onExportProject(p: Project): void;
  onClose(): void;
}

/** The stored images the browser can decode; the others are reported as missing backgrounds. */
async function readableImages(images: StoredImage[]): Promise<StoredImage[]> {
  const decoded = await Promise.allSettled(images.map((img) => imageSize(img.blob)));
  return images.filter((_, i) => decoded[i]!.status === 'fulfilled');
}

/**
 * Loads the project (pruning unreferenced images, R15), creates object URLs for its images,
 * opens it in the store and autosaves it. Teardown and 'pagehide' call the autosave unsubscribe,
 * which flushes the pending save (R18).
 */
function useOpenProject(
  p: EditorScreenProps,
  onSaveStatus: (s: SaveStatus) => void,
): {
  imageUrls: Record<Id, string>;
  registerImage(imageId: Id, blob: Blob): void;
  imageProblems: string[];
  error: string | null;
  ready: boolean;
} {
  const [imageUrls, setImageUrls] = useState<Record<Id, string>>({});
  const [imageProblems, setImageProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { projectId, projectStore, initialProject, saver, onSavesPending } = p;
  // every object URL created for this editor session, revoked when it closes (a deleted or replaced
  // background keeps its URL meanwhile: undo can bring it back)
  const urls = useRef<string[]>([]);
  const registerImage = useCallback((imageId: Id, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    setImageUrls((m) => ({ ...m, [imageId]: url }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;
    const start = () => {
      stop = startAutosave(useEditor, saver, onSaveStatus);
    };
    const onHide = () => {
      if (stop) onSavesPending(stop());
      stop = null;
    };
    const onShow = (e: PageTransitionEvent) => {
      // back from the bfcache: the page lives again, so does the autosave
      if (e.persisted && !stop && !cancelled && useEditor.getState().project) start();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);

    (async () => {
      const project = initialProject ?? (await projectStore.getProject(projectId));
      if (!project) throw new Error('Projet introuvable');
      try {
        await projectStore.deleteUnreferencedImages(project);
      } catch (e) {
        console.warn('Could not prune unreferenced images', e);
      }
      const images = await readableImages(await projectStore.listImages(project.id));
      if (cancelled) return;
      setImageProblems(levelsWithMissingImages(project, new Set(images.map((i) => i.id))).map(missingImageMessage));
      const map: Record<Id, string> = {};
      for (const img of images) {
        const url = URL.createObjectURL(img.blob);
        urls.current.push(url);
        map[img.id] = url;
      }
      setImageUrls(map);
      start();
      useEditor.getState().openProject(project);
      setReady(true);
    })().catch((e: unknown) => {
      if (!cancelled) setError(messageOf(e));
    });

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      if (stop) onSavesPending(stop());
      useEditor.getState().closeProject();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, [projectId, projectStore, initialProject, saver, onSaveStatus, onSavesPending]);

  return { imageUrls, registerImage, imageProblems, error, ready };
}

export function EditorScreen(p: EditorScreenProps): JSX.Element {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const { imageUrls, registerImage, imageProblems, error, ready } = useOpenProject(p, setSaveStatus);
  const [imageProblemsClosed, setImageProblemsClosed] = useState(false);
  const [dialog, setDialog] = useState<'settings' | 'export' | null>(null);
  const size = useRef<Size>({ width: 0, height: 0 });
  const onResize = useCallback((s: Size) => {
    size.current = s;
  }, []);
  // the move mode of the tracing image ends by itself when the image gets locked, hidden or removed
  useEffect(() => watchBackgroundMode(useEditor), []);

  const placeAtCenter = useCallback((ref: string) => {
    const s = size.current;
    placeObjectAt(useEditor, ref, screenToWorld(useEditor.getState().view, { x: s.width / 2, y: s.height / 2 }));
  }, []);

  const backgroundServices = useMemo<BackgroundServices>(
    () => ({
      projectStore: p.projectStore,
      registerImage,
      viewCenter: () => screenToWorld(useEditor.getState().view, { x: size.current.width / 2, y: size.current.height / 2 }),
    }),
    [p.projectStore, registerImage],
  );

  if (error) {
    return (
      <div className="editor-error">
        <Banner kind="error">Impossible d'ouvrir le projet : {error}</Banner>
        <button type="button" className="btn" onClick={p.onClose}>
          Retour aux projets
        </button>
      </div>
    );
  }
  if (!ready) return <div className="loading">Chargement du projet...</div>;

  return (
    <div className="editor" data-testid="editor">
      {!imageProblemsClosed && imageProblems.length > 0 && (
        <Banner kind="error" testId="image-error" onClose={() => setImageProblemsClosed(true)}>
          {imageProblems.join(' ')}
        </Banner>
      )}
      <Header saveStatus={saveStatus} onBack={p.onClose} onSettings={() => setDialog('settings')} onExport={() => setDialog('export')} />
      <div className="editor-main">
        <Toolbar />
        <CatalogPanel onPlace={placeAtCenter} />
        <main className="editor-center">
          <PlanCanvas imageUrls={imageUrls} onResize={onResize} />
        </main>
        <BackgroundServicesContext.Provider value={backgroundServices}>
          <PropertiesPanel />
        </BackgroundServicesContext.Provider>
      </div>
      <LevelTabs />
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog projectStore={p.projectStore} onExportJson={p.onExportProject} onClose={() => setDialog(null)} />}
    </div>
  );
}
