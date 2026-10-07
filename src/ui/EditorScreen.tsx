import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import type { Id, Project } from '@/core/model/types';
import { placeObjectAt } from '@/editor/placeObject';
import { useEditor } from '@/editor/store';
import { screenToWorld } from '@/editor/view';
import { startAutosave, type SaveStatus } from '@/storage/autosave';
import type { ProjectStore } from '@/storage/db';
import { Banner } from './Banner';
import { CatalogPanel } from './CatalogPanel';
import { ExportDialog } from './ExportDialog';
import { Header } from './Header';
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
  onExportProject(p: Project): void;
  onClose(): void;
}

/**
 * Loads the project (pruning unreferenced images, R15), creates object URLs for its images,
 * opens it in the store and autosaves it. Teardown and 'pagehide' call the autosave unsubscribe,
 * which flushes the pending save (R18).
 */
function useOpenProject(
  p: EditorScreenProps,
  onSaveStatus: (s: SaveStatus) => void,
): { imageUrls: Record<Id, string>; error: string | null; ready: boolean } {
  const [imageUrls, setImageUrls] = useState<Record<Id, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { projectId, projectStore, initialProject, saver } = p;

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    const urls: string[] = [];
    const start = () => {
      stop = startAutosave(useEditor, saver, onSaveStatus);
    };
    const onHide = () => {
      stop?.();
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
      const images = await projectStore.listImages(project.id);
      if (cancelled) return;
      const map: Record<Id, string> = {};
      for (const img of images) {
        const url = URL.createObjectURL(img.blob);
        urls.push(url);
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
      stop?.();
      useEditor.getState().closeProject();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [projectId, projectStore, initialProject, saver, onSaveStatus]);

  return { imageUrls, error, ready };
}

export function EditorScreen(p: EditorScreenProps): JSX.Element {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const { imageUrls, error, ready } = useOpenProject(p, setSaveStatus);
  const [dialog, setDialog] = useState<'settings' | 'export' | null>(null);
  const size = useRef<Size>({ width: 0, height: 0 });
  const onResize = useCallback((s: Size) => {
    size.current = s;
  }, []);

  const placeAtCenter = useCallback((ref: string) => {
    const s = size.current;
    placeObjectAt(useEditor, ref, screenToWorld(useEditor.getState().view, { x: s.width / 2, y: s.height / 2 }));
  }, []);

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
      <Header saveStatus={saveStatus} onBack={p.onClose} onSettings={() => setDialog('settings')} onExport={() => setDialog('export')} />
      <div className="editor-main">
        <Toolbar />
        <CatalogPanel onPlace={placeAtCenter} />
        <main className="editor-center">
          <PlanCanvas imageUrls={imageUrls} onResize={onResize} />
        </main>
        <PropertiesPanel />
      </div>
      <LevelTabs />
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog projectStore={p.projectStore} onExportJson={p.onExportProject} onClose={() => setDialog(null)} />}
    </div>
  );
}
