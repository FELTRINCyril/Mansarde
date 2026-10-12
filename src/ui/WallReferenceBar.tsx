import type { JSX, MouseEvent } from 'react';
import { useEditor, type WallReference } from '@/editor/store';
import { REFERENCE_LABELS } from '@/editor/tools/wallMachine';

const CHOICES: WallReference[] = ['axis', 'left', 'right'];

const focusPlan = (e: MouseEvent<HTMLElement>) => {
  // the plan takes the focus (Space flips the side, a digit opens the length field), never the
  // button, and the press never reaches the tool under the bar
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.closest<HTMLElement>('.plan-canvas')?.focus({ preventScroll: true });
};
const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * Option bar of the wall tool (spec 6), over the top of the plan: the reference line of the walls
 * drawn, "Axe" (default), "Face gauche" or "Face droite"; Space on the plan flips left and right.
 * The choice lives in the editor store for the session.
 */
export function WallReferenceBar(): JSX.Element | null {
  const tool = useEditor((s) => s.tool);
  const reference = useEditor((s) => s.wallReference);
  const setReference = useEditor((s) => s.setWallReference);
  if (tool !== 'wall') return null;
  return (
    <div
      className="wall-reference-bar"
      data-testid="wall-reference-bar"
      role="group"
      aria-label="Ligne de référence du mur"
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onDoubleClick={stop}
    >
      <span className="wall-reference-title">Tracer sur</span>
      {CHOICES.map((r) => (
        <button
          key={r}
          type="button"
          className={r === reference ? 'wall-reference-choice wall-reference-active' : 'wall-reference-choice'}
          aria-pressed={r === reference}
          onMouseDown={focusPlan}
          onClick={() => setReference(r)}
        >
          {REFERENCE_LABELS[r]}
        </button>
      ))}
      <span className="wall-reference-hint">Espace : changer de face</span>
    </div>
  );
}
