import { useId, useState, type JSX } from 'react';

/** Navigation of the plan (PlanCanvas, src/editor/wheel.ts, src/editor/keyboard.ts). */
const PLAN_NAVIGATION: readonly string[] = [
  'Déplacer : deux doigts ou clic droit maintenu',
  'Zoomer : pincer ou molette',
  'Flèches : déplacer la vue (sans sélection)',
];

/** Navigation of the 3D view (scene3d CameraRig). */
const SCENE3D_NAVIGATION: readonly string[] = [
  'Tourner : glisser',
  'Déplacer : deux doigts, clic droit maintenu ou Maj + glisser',
  'Zoomer : pincer ou molette',
  'Flèches : déplacer la vue (après un clic dans la 3D)',
];

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * A small "?" in a corner of a view that shows how to move and zoom (the trackpad and the right
 * button are not obvious); its pointer events stay out of the view under it (no tool click on the
 * plan, no orbit in 3D).
 */
export function NavigationHint(p: { view: 'plan' | '3d' }): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  const lines = p.view === 'plan' ? PLAN_NAVIGATION : SCENE3D_NAVIGATION;
  return (
    <div
      className="nav-hint"
      data-testid={p.view === 'plan' ? 'plan-navigation-hint' : 'scene3d-navigation-hint'}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onDoubleClick={stop}
    >
      {open && (
        <ul className="nav-hint-list" id={id}>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="nav-hint-toggle"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Aide à la navigation"
        title={open ? undefined : lines.join('\n')}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
    </div>
  );
}
