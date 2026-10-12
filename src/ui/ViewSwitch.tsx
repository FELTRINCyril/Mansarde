import type { JSX } from 'react';
import { useEditor, type ViewMode } from '@/editor/store';

const VIEWS: Array<[ViewMode, string]> = [
  ['plan', 'Plan'],
  ['3d', '3D'],
  ['split', 'Plan + 3D'],
];

/** Header buttons "Plan", "3D", "Plan + 3D" (spec 7.4, ruling V2-R19); the choice is kept in the editor display. */
export function ViewSwitch(): JSX.Element {
  const view = useEditor((s) => s.display.view);
  const setDisplay = useEditor((s) => s.setDisplay);
  return (
    <div className="segmented" role="group" aria-label="Affichage">
      {VIEWS.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={v === view ? 'segmented-item segmented-item-active' : 'segmented-item'}
          aria-pressed={v === view}
          data-testid={`view-${v}`}
          onClick={() => setDisplay({ view: v })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
