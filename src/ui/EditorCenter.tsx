import { useRef, type JSX, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { useEditor } from '@/editor/store';
import { Plan3DView } from './Plan3DView';

/** Bounds of the plan share in 'split' (display.splitRatio) and the step of the arrow keys. */
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const KEY_STEP = 0.05;
const clampRatio = (r: number): number => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

/** Draggable separator between the plan and the 3D view; arrow keys move it too. */
function SplitHandle(p: { container: RefObject<HTMLElement | null>; ratio: number }): JSX.Element {
  const setDisplay = useEditor((s) => s.setDisplay);
  const drag = useRef<number | null>(null);
  const moveTo = (clientX: number) => {
    const r = p.container.current?.getBoundingClientRect();
    if (r && r.width > 0) setDisplay({ splitRatio: clampRatio((clientX - r.left) / r.width) });
  };
  return (
    <div
      className="split-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Séparation entre le plan et la 3D"
      aria-valuemin={MIN_RATIO * 100}
      aria-valuemax={MAX_RATIO * 100}
      aria-valuenow={Math.round(p.ratio * 100)}
      tabIndex={0}
      data-testid="split-handle"
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        drag.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (drag.current === e.pointerId) moveTo(e.clientX);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : 0;
        if (step === 0) return;
        e.preventDefault();
        setDisplay({ splitRatio: clampRatio(p.ratio + step) });
      }}
    />
  );
}

/**
 * Center of the editor in the layout chosen by the view switch (ruling V2-R19, spec 8.3): the plan,
 * the 3D view at full width, or both side by side with a draggable separator. In '3d' the plan stays
 * mounted but hidden: it owns the editor's keyboard handler (undo, delete, shortcuts).
 */
export function EditorCenter(p: { plan: ReactNode }): JSX.Element {
  const view = useEditor((s) => s.display.view);
  const ratio = useEditor((s) => s.display.splitRatio);
  const ref = useRef<HTMLElement>(null);
  return (
    <main className="editor-center" ref={ref} data-view={view}>
      <div
        className="plan-pane"
        data-testid="plan-pane"
        hidden={view === '3d'}
        style={view === 'split' ? { flex: `0 0 ${ratio * 100}%` } : undefined}
      >
        {p.plan}
      </div>
      {view === 'split' && <SplitHandle container={ref} ratio={ratio} />}
      {view !== 'plan' && (
        <div className="view3d-pane" data-testid="view3d-pane">
          <Plan3DView />
        </div>
      )}
    </main>
  );
}
