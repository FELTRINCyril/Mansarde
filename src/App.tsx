import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import type { Id, Project } from '@/core/model/types';
import { useEditor } from '@/editor/store';
import { openDb, ProjectStore } from '@/storage/db';
import { downloadProject } from '@/storage/projectActions';
import { Banner } from '@/ui/Banner';
import { EditorScreen } from '@/ui/EditorScreen';
import { HomeScreen } from '@/ui/HomeScreen';
import { Toast } from '@/ui/Toast';

declare global {
  interface Window {
    /** Development only: handles for the e2e tests. */
    __planMaison?: { store: typeof useEditor; projectStore: ProjectStore };
  }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Last failed save of a project: the unsaved version is kept so it can still be exported. */
interface SaveFailure { project: Project; message: string }

interface OpenTarget { id: Id; initial?: Project }

function SaveFailureBanners(p: { failures: Record<Id, SaveFailure>; openId: Id | null; onExport(f: SaveFailure): void }): JSX.Element {
  return (
    <>
      {Object.values(p.failures).map((f) => (
        <Banner
          key={f.project.id}
          kind="error"
          testId="save-error"
          action={{ label: 'Exporter en .json', onClick: () => p.onExport(f) }}
        >
          {f.project.id === p.openId
            ? `La sauvegarde a échoué : ${f.message}. Exportez votre projet en .json pour ne rien perdre.`
            : `La sauvegarde du projet "${f.project.name}" a échoué : ${f.message}. Exportez ce projet en .json pour ne rien perdre.`}
        </Banner>
      ))}
    </>
  );
}

export default function App(): JSX.Element {
  const [projectStore, setProjectStore] = useState<ProjectStore | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [failures, setFailures] = useState<Record<Id, SaveFailure>>({});
  // saves flushed by a closing editor: the project list is read only once they completed
  const savesDone = useRef<Promise<void>>(Promise.resolve());
  const trackSaves = useCallback((done: Promise<void>) => {
    savesDone.current = Promise.all([savesDone.current, done]).then(() => undefined);
  }, []);
  const waitForSaves = useCallback(() => savesDone.current, []);
  const failuresRef = useRef(failures);
  useEffect(() => {
    failuresRef.current = failures;
  }, [failures]);

  useEffect(() => {
    openDb()
      .then((db) => {
        const store = new ProjectStore(db);
        setProjectStore(store);
        if (import.meta.env.DEV) window.__planMaison = { store: useEditor, projectStore: store };
      })
      .catch((e: unknown) => setDbError(messageOf(e)));
  }, []);

  const saver = useCallback(
    async (p: Project) => {
      if (!projectStore) throw new Error('Stockage indisponible');
      try {
        await projectStore.saveProject(p);
      } catch (e) {
        setFailures((f) => ({ ...f, [p.id]: { project: p, message: messageOf(e) } }));
        throw e;
      }
      setFailures((f) => {
        if (!Object.hasOwn(f, p.id)) return f;
        const { [p.id]: _saved, ...rest } = f;
        return rest;
      });
    },
    [projectStore],
  );

  const exportProject = useCallback(
    async (p: Project) => {
      if (!projectStore) return;
      try {
        await downloadProject(projectStore, p);
      } catch (e) {
        useEditor.getState().showToast(`Export impossible : ${messageOf(e)}`);
      }
    },
    [projectStore],
  );

  /** Export from the banner: the open project is exported in its current state. */
  const exportFailure = (f: SaveFailure) => {
    const current = useEditor.getState().project;
    void exportProject(current && current.id === f.project.id ? current : f.project);
  };

  const exportById = useCallback(
    async (id: Id) => {
      if (!projectStore) return;
      const p = failuresRef.current[id]?.project ?? (await projectStore.getProject(id));
      if (!p) throw new Error('Projet introuvable');
      await downloadProject(projectStore, p);
    },
    [projectStore],
  );

  const openProject = useCallback((id: Id) => {
    // a project whose last save failed is reopened from its newer, unsaved version
    setOpen({ id, initial: failuresRef.current[id]?.project });
  }, []);
  const closeProject = useCallback(() => setOpen(null), []);
  const onExportOpen = useCallback((p: Project) => void exportProject(p), [exportProject]);

  let screen: JSX.Element;
  if (dbError) {
    screen = (
      <div className="home">
        <h1 className="home-title">Mansarde</h1>
        <Banner kind="error">
          Le stockage du navigateur est indisponible ({dbError}). Les projets ne peuvent pas être enregistrés : vérifiez que
          la navigation privée est désactivée.
        </Banner>
      </div>
    );
  } else if (!projectStore) {
    screen = <div className="loading">Chargement...</div>;
  } else if (open) {
    screen = (
      <EditorScreen
        key={open.id}
        projectId={open.id}
        initialProject={open.initial}
        projectStore={projectStore}
        saver={saver}
        onSavesPending={trackSaves}
        onExportProject={onExportOpen}
        onClose={closeProject}
      />
    );
  } else {
    screen = (
      <HomeScreen
        projectStore={projectStore}
        onOpen={openProject}
        onExport={exportById}
        waitForSaves={waitForSaves}
        onDeleted={(id) =>
          setFailures((f) => {
            const { [id]: _deleted, ...rest } = f;
            return rest;
          })
        }
      />
    );
  }

  return (
    <div className="app">
      <SaveFailureBanners failures={failures} openId={open?.id ?? null} onExport={exportFailure} />
      {screen}
      <Toast />
    </div>
  );
}
