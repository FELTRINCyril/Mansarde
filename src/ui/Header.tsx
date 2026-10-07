import type { JSX } from 'react';
import { renameProject } from '@/core/commands/project';
import { useEditor, type EditorState } from '@/editor/store';
import type { SaveStatus } from '@/storage/autosave';
import { run } from './run';

const DIM_MODES: Array<[EditorState['display']['dimMode'], string]> = [
  ['all', 'Toutes les cotes'],
  ['manual', 'Cotes manuelles'],
  ['none', 'Aucune cote'],
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? 'Cmd' : 'Ctrl';

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

/** Editor header: back to projects, project name, undo/redo, display options, settings, export, save status. */
export function Header(p: { saveStatus: SaveStatus; onBack(): void; onSettings(): void; onExport(): void }): JSX.Element | null {
  const name = useEditor((s) => s.project?.name);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const display = useEditor((s) => s.display);
  const setDisplay = useEditor((s) => s.setDisplay);
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
        <button type="button" className="btn" disabled={!canUndo} title={`Annuler (${MOD}+Z)`} onClick={() => useEditor.getState().undo()}>
          Annuler
        </button>
        <button type="button" className="btn" disabled={!canRedo} title={`Rétablir (${MOD}+Maj+Z)`} onClick={() => useEditor.getState().redo()}>
          Rétablir
        </button>
      </div>
      <div className="header-group">
        <select
          className="input"
          aria-label="Affichage des cotes"
          data-testid="dim-mode"
          value={display.dimMode}
          onChange={(e) => setDisplay({ dimMode: e.target.value as EditorState['display']['dimMode'] })}
        >
          {DIM_MODES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={display.showLowerLevel} onChange={(e) => setDisplay({ showLowerLevel: e.target.checked })} />
          Niveau inférieur en filigrane
        </label>
        <label className="check">
          <input type="checkbox" checked={display.showGrid} onChange={(e) => setDisplay({ showGrid: e.target.checked })} />
          Grille
        </label>
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
