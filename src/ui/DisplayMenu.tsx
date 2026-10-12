import { useEffect, useRef, useState, type JSX } from 'react';
import { useEditor, type EditorState } from '@/editor/store';

const DIM_MODES: Array<[EditorState['display']['dimMode'], string]> = [
  ['all', 'Toutes les cotes'],
  ['manual', 'Cotes manuelles'],
  ['none', 'Aucune cote'],
];

/**
 * "Affichage" button of the header (ruling V2-R30): a small menu with the dimension mode, the lower
 * level watermark and the grid, so that the header keeps room for the project name. The menu
 * closes on a press outside it, when the focus leaves it (Tab), on Escape (focus back on the
 * button) or on the button again; the options apply at once.
 */
export function DisplayMenu(): JSX.Element {
  const display = useEditor((s) => s.display);
  const setDisplay = useEditor((s) => s.setDisplay);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  return (
    <div
      ref={root}
      className="display-menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        // the focus went to another element outside the menu (Tab, Shift+Tab). A null relatedTarget
        // (a press on a label of the menu, or outside: handled by the pointerdown above) keeps it open.
        if (open && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="btn"
        aria-expanded={open}
        aria-haspopup="true"
        data-testid="display-menu"
        onClick={() => setOpen((v) => !v)}
      >
        Affichage
      </button>
      {open && (
        <div className="display-menu-panel" role="group" aria-label="Affichage" data-testid="display-menu-panel">
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
      )}
    </div>
  );
}
