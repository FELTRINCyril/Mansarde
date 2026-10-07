import { useEffect, useRef, useState, type JSX } from 'react';
import { applyNumericInput, cancelNumericInput, placeNumericField, tabNumericInput } from '@/editor/numericOverlay';
import { useEditor } from '@/editor/store';
import type { ToolContext } from '@/editor/tools/types';

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * Shared numeric field of the drawing tools (overlay.numericInput), absolutely positioned over the
 * canvas next to the cursor and kept inside it. The first typed digit is already in the value; the
 * caret starts at the end. Enter validates through the rules of its kind (invalid: red border, the
 * field stays open) then calls the active tool's onNumericSubmit; Escape and blur close it and call
 * onNumericCancel. As an input it is covered by the keyboard typing guard, and Escape is
 * preventDefault-ed so the global handler leaves it alone. Pointer events never reach the plan.
 */
export function NumericOverlayInput(p: {
  ctx: ToolContext;
  canvas: { width: number; height: number };
  /** Gives the focus back to the plan once the field is closed. */
  restoreFocus(): void;
}): JSX.Element | null {
  const ni = useEditor((s) => s.overlay.numericInput);
  const open = ni !== null;
  const ref = useRef<HTMLInputElement>(null);
  const leaving = useRef(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!open) return;
    leaving.current = false;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [open]);

  if (!ni) return null;
  const at = placeNumericField(ni.screen, p.canvas);

  const leave = (action: () => boolean | void) => {
    leaving.current = true; // the focus change below must not count as a blur
    const done = action();
    if (done === false) {
      leaving.current = false;
      return;
    }
    setInvalid(false);
    p.restoreFocus();
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
            const r = tabNumericInput(useEditor, p.ctx, e.currentTarget.value);
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
          if (!leaving.current) cancelNumericInput(useEditor, p.ctx);
        }}
      />
      <span className="numeric-overlay-unit">{ni.kind === 'angle' ? '\u00b0' : 'cm'}</span>
    </div>
  );
}
