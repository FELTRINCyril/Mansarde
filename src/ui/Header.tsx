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

const headerIcon = (d: string): JSX.Element => (
  <svg className="header-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * Editor header: back to projects, project name, undo/redo, view switch with the alert counter,
 * the "Affichage" menu (ruling V2-R30), save status (fixed width: the name never moves), settings,
 * export. Below 1300 px wide, undo and redo show an icon instead of their word (same accessible
 * name and title) and the spacing tightens, so that the header fits down to 1100 px with at least
 * 12 characters of the project name visible.
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
        <button
          type="button"
          className="btn btn-icon-compact"
          disabled={!canUndo}
          aria-label="Annuler"
          title={`Annuler (${MOD_LABEL}+Z)`}
          onClick={() => useEditor.getState().undo()}
        >
          {headerIcon('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11')}
          <span className="header-label">Annuler</span>
        </button>
        <button
          type="button"
          className="btn btn-icon-compact"
          disabled={!canRedo}
          aria-label="Rétablir"
          title={`Rétablir (${MOD_LABEL}+Maj+Z)`}
          onClick={() => useEditor.getState().redo()}
        >
          {headerIcon('m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13')}
          <span className="header-label">Rétablir</span>
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
