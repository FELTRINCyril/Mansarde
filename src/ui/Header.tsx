import type { JSX } from 'react';
import { renameProject } from '@/core/commands/project';
import { MOD_LABEL } from '@/editor/keyboard';
import { useEditor } from '@/editor/store';
import type { SaveStatus } from '@/storage/autosave';
import { AlertCounter } from './ChecksPanel';
import { DisplayMenu } from './DisplayMenu';
import { run } from './run';
import { ViewSwitch } from './ViewSwitch';

function SaveIndicator({ status }: { status: SaveStatus }): JSX.Element {
  if (status.state === 'error') {
    return (
      <span className="save-status save-status-error" data-testid="save-status">
        Non enregistré
      </span>
    );
  }
  return (
    <span className="save-status" data-testid="save-status">
      {status.state === 'saving' ? 'Enregistrement...' : 'Enregistré'}
    </span>
  );
}

/**
 * Editor header: back to projects, project name, undo/redo, view switch with the alert counter,
 * the "Affichage" menu (ruling V2-R30), save status (fixed width: the name never moves), settings,
 * export.
 */
export function Header(p: { saveStatus: SaveStatus; onBack(): void; onSettings(): void; onExport(): void }): JSX.Element | null {
  const name = useEditor((s) => s.project?.name);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  if (name === undefined) return null;
  return (
    <header className="header">
      <button type="button" className="btn btn-ghost" onClick={p.onBack} data-testid="back-to-projects">
        Projets
      </button>
      <input
        key={name}
        className="input project-name"
        aria-label="Nom du projet"
        data-testid="project-name"
        defaultValue={name}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v === '') e.currentTarget.value = name;
          else if (v !== name) run('Renommer le projet', renameProject(v));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = name;
            e.currentTarget.blur();
          }
        }}
      />
      <div className="header-group">
        <button type="button" className="btn" disabled={!canUndo} title={`Annuler (${MOD_LABEL}+Z)`} onClick={() => useEditor.getState().undo()}>
          Annuler
        </button>
        <button type="button" className="btn" disabled={!canRedo} title={`Rétablir (${MOD_LABEL}+Maj+Z)`} onClick={() => useEditor.getState().redo()}>
          Rétablir
        </button>
      </div>
      <div className="header-group">
        <ViewSwitch />
        <AlertCounter />
      </div>
      <div className="header-group">
        <DisplayMenu />
      </div>
      <div className="header-spacer" />
      <SaveIndicator status={p.saveStatus} />
      <button type="button" className="btn" onClick={p.onSettings} data-testid="open-settings">
        Réglages
      </button>
      <button type="button" className="btn btn-primary" onClick={p.onExport} data-testid="open-export">
        Exporter
      </button>
    </header>
  );
}
