import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import type { Id } from '@/core/model/types';
import type { ProjectMeta, ProjectStore } from '@/storage/db';
import { readFileAsText } from '@/storage/files';
import {
  createNamedProject,
  DEFAULT_PROJECT_NAME,
  duplicateProject,
  importProjectText,
  renameStoredProject,
} from '@/storage/projectActions';
import { Banner } from './Banner';
import { ConfirmDialog, PromptDialog } from './ConfirmDialog';
import { formatModified } from './dateFormat';

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

type Dialog = { kind: 'new' } | { kind: 'rename'; meta: ProjectMeta } | { kind: 'delete'; meta: ProjectMeta };

const levelCount = (n: number): string => (n > 1 ? `${n} niveaux` : `${n} niveau`);

/** Project list: create, open, rename, duplicate, export, import, delete. */
export function HomeScreen(p: { projectStore: ProjectStore; onOpen(id: Id): void; onExport(id: Id): Promise<void>; onDeleted(id: Id): void }): JSX.Element {
  const { projectStore } = p;
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await projectStore.listProjects());
    } catch (e) {
      setError(`Impossible de lire la liste des projets : ${messageOf(e)}`);
      setProjects([]);
    }
  }, [projectStore]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs an action, shows its failure in the error banner, refreshes the list. */
  const attempt = async (what: string, action: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(`${what} : ${messageOf(e)}`);
    }
    await refresh();
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    await attempt('Import impossible', async () => {
      const r = await importProjectText(projectStore, await readFileAsText(file));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(`Projet importé : ${r.project.name}`);
    });
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="home" data-testid="home">
      <header className="home-header">
        <h1 className="home-title">Plan Maison</h1>
        <div className="home-actions">
          <button type="button" className="btn btn-primary" data-testid="new-project" onClick={() => setDialog({ kind: 'new' })}>
            Nouveau projet
          </button>
          <label className="btn">
            Importer un projet
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              data-testid="import-input"
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
          </label>
        </div>
      </header>

      {error && (
        <Banner kind="error" testId="home-error" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}
      {notice && (
        <Banner kind="info" onClose={() => setNotice(null)}>
          {notice}
        </Banner>
      )}

      <main className="home-main">
        {projects === null && <p className="hint">Chargement...</p>}
        {projects?.length === 0 && (
          <div className="home-empty">
            <p>Aucun projet pour l'instant.</p>
            <p className="hint">Créez un nouveau projet ou importez un fichier .json exporté depuis Plan Maison.</p>
          </div>
        )}
        {projects && projects.length > 0 && (
          <ul className="project-list" aria-label="Projets">
            {projects.map((m) => (
              <li key={m.id} className="project-card" data-testid="project-item">
                <button type="button" className="project-open" onClick={() => p.onOpen(m.id)}>
                  <span className="project-title" data-testid="project-name-cell">
                    {m.name}
                  </span>
                  <span className="project-meta">
                    {formatModified(m.updatedAt)} - {levelCount(m.levelCount)}
                  </span>
                </button>
                <div className="project-actions">
                  <button type="button" className="btn btn-small" onClick={() => p.onOpen(m.id)}>
                    Ouvrir
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setDialog({ kind: 'rename', meta: m })}>
                    Renommer
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void attempt('Duplication impossible', async () => void (await duplicateProject(projectStore, m.id)))}
                  >
                    Dupliquer
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => void attempt('Export impossible', () => p.onExport(m.id))}>
                    Exporter
                  </button>
                  <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setDialog({ kind: 'delete', meta: m })}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {dialog?.kind === 'new' && (
        <PromptDialog
          title="Nouveau projet"
          label="Nom du projet"
          initialValue={DEFAULT_PROJECT_NAME}
          confirmLabel="Créer"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            setDialog(null);
            void attempt('Création impossible', async () => p.onOpen((await createNamedProject(projectStore, name)).id));
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <PromptDialog
          title="Renommer le projet"
          label="Nom du projet"
          initialValue={dialog.meta.name}
          confirmLabel="Renommer"
          onCancel={() => setDialog(null)}
          onConfirm={(name) => {
            setDialog(null);
            void attempt('Renommage impossible', async () => {
              const r = await renameStoredProject(projectStore, dialog.meta.id, name);
              if (!r.ok) throw new Error(r.error);
            });
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Supprimer le projet"
          message={
            <p>
              Supprimer définitivement le projet "{dialog.meta.name}" ? Cette action est irréversible : exportez-le
              d'abord en .json si vous voulez le garder.
            </p>
          }
          confirmLabel="Supprimer"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void attempt('Suppression impossible', async () => {
              await projectStore.deleteProject(dialog.meta.id);
              p.onDeleted(dialog.meta.id);
            });
          }}
        />
      )}
    </div>
  );
}
