import { useEffect, useRef, useState, type JSX } from 'react';
import { applyNumericInput, cancelNumericInput, tabNumericInput } from '@/editor/numericDispatch';
import { numericSession, placeNumericField } from '@/editor/numericOverlay';
import { useEditor } from '@/editor/store';
import type { ToolContext } from '@/editor/tools/types';

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * Shared numeric field of the drawing tools (overlay.numericInput), absolutely positioned over the
 * canvas next to the cursor and kept inside it. The first typed digit is already in the value; the
 * caret starts at the end (or the whole value is selected, `select`). Enter validates through the rules of its kind (invalid: red border, the
 * field stays open) then calls the active tool's onNumericSubmit; Escape and blur close it and call
 * onNumericCancel. As an input it is covered by the keyboard typing guard, and Escape is
 * preventDefault-ed so the global handler leaves it alone. Pointer events never reach the plan.
 * The field is keyed on the opening (numericSession), so a reopening, even a synchronous one from
 * onNumericSubmit, starts with a fresh state: no stale red border, unless the tool reopens it with
 * `invalid` (a refused value given back to correct).
 */
export function NumericOverlayInput(p: {
  ctx: ToolContext;
  canvas: { width: number; height: number };
  /** Gives the focus back to the plan once the field is closed. */
  restoreFocus(): void;
}): JSX.Element | null {
  // subscribed to the field object itself (not a boolean): a close and reopen in the same batch
  // still re-renders here and reads the new session, so the field remounts fresh. PlanCanvas does
  // not re-render on overlay changes (the overlay has its own subscriber).
  const ni = useEditor((s) => s.overlay.numericInput);
  if (!ni) return null;
  const session = numericSession();
  return <NumericField key={session} session={session} {...p} />;
}

function NumericField(p: {
  session: number;
  ctx: ToolContext;
  canvas: { width: number; height: number };
  restoreFocus(): void;
}): JSX.Element | null {
  const ni = useEditor((s) => s.overlay.numericInput);
  const ref = useRef<HTMLInputElement>(null);
  const leaving = useRef(false);
  const [invalid, setInvalid] = useState(ni?.invalid === true); // read once: the field is remounted per opening

  const selectAll = ni?.select === true; // read once, like `invalid`
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (selectAll) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [selectAll]);

  if (!ni) return null;
  const at = placeNumericField(ni.screen, p.canvas);

  const leave = (action: () => boolean | void) => {
    leaving.current = true; // the focus change below must not count as a blur
    const done = action();
    if (done === false) {
      leaving.current = false;
      return;
    }
    // a tool that reopened the field from its callback keeps the focus for the new field
    if (!useEditor.getState().overlay.numericInput) p.restoreFocus();
  };

  return (
    <div
      className="numeric-overlay"
      data-testid="numeric-overlay"
      style={{ left: at.x, top: at.y }}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onDoubleClick={stop}
    >
      {ni.label && <span className="numeric-overlay-label">{ni.label}</span>}
      <input
        ref={ref}
        className={invalid ? 'input input-num input-invalid' : 'input input-num'}
        data-testid="numeric-overlay-input"
        inputMode="decimal"
        aria-label={ni.label ?? 'Valeur'}
        aria-invalid={invalid}
        value={ni.value}
        onChange={(e) => {
          setInvalid(false);
          useEditor.getState().setOverlay({ numericInput: { ...ni, value: e.target.value } });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            leave(() => {
              const ok = applyNumericInput(useEditor, p.ctx, e.currentTarget.value);
              if (!ok) setInvalid(true);
              return ok;
            });
          } else if (e.key === 'Tab') {
            // only for tools with several values (onNumericTab); otherwise Tab leaves the field
            const r = tabNumericInput(useEditor, p.ctx, e.currentTarget.value, e.shiftKey);
            if (r !== 'unhandled') {
              e.preventDefault();
              setInvalid(r === 'invalid');
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            leave(() => cancelNumericInput(useEditor, p.ctx));
          }
        }}
        onBlur={() => {
          // ignore the blur of a field already replaced by a newer opening
          if (!leaving.current && p.session === numericSession()) cancelNumericInput(useEditor, p.ctx);
        }}
      />
      <span className="numeric-overlay-unit">{ni.kind === 'angle' ? '\u00b0' : 'cm'}</span>
    </div>
  );
}
