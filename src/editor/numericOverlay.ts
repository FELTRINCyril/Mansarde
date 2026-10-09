import type { Vec2 } from '@/core/model/types';
import { commitNumericAs, type NumericKind, type NumericResult } from '@/ui/numeric';
import type { EditorStore } from './store';

/*
 * The shared numeric field: opening, closing, parsing and placement. Handing a typed value to the
 * active tool is numericDispatch.ts (it needs the tool registry, which the tools must not import).
 */

/** Size of the field box (px) used to keep it inside the canvas, and its offset from the cursor. */
export const NUMERIC_FIELD_SIZE: Vec2 = { x: 150, y: 34 };
export const NUMERIC_FIELD_OFFSET: Vec2 = { x: 14, y: 14 };

let session = 0;

/** Counter bumped by every openNumericInput: the UI keys its field on it, so each opening starts fresh. */
export const numericSession = (): number => session;

/**
 * Opens (or replaces) the shared numeric field. `initial` is the text already typed (the first digit);
 * `invalid` opens it with the red invalid border (a refused value given back to the user to correct);
 * `select` selects the initial text (a current value shown for editing: typing replaces it).
 */
export function openNumericInput(
  store: EditorStore,
  opts: { initial: string; screen: Vec2; kind: NumericKind; label?: string; invalid?: boolean; select?: boolean },
): void {
  session++;
  const numericInput = {
    value: opts.initial, screen: opts.screen, kind: opts.kind, label: opts.label,
    ...(opts.invalid ? { invalid: true } : {}),
    ...(opts.select ? { select: true } : {}),
  };
  store.getState().setOverlay({ numericInput });
}

export function closeNumericInput(store: EditorStore): void {
  if (store.getState().overlay.numericInput) store.getState().setOverlay({ numericInput: null });
}

/** Pure parsing of the typed text with the rules of its kind (same as the properties panel fields). */
export function submitNumeric(text: string, kind: NumericKind): NumericResult {
  return commitNumericAs(text, kind);
}

/** Top-left of the field box (px): next to the cursor, kept inside a canvas of the given size. */
export function placeNumericField(screen: Vec2, canvas: { width: number; height: number }): Vec2 {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  return {
    x: clamp(screen.x + NUMERIC_FIELD_OFFSET.x, canvas.width - NUMERIC_FIELD_SIZE.x),
    y: clamp(screen.y + NUMERIC_FIELD_OFFSET.y, canvas.height - NUMERIC_FIELD_SIZE.y),
  };
}
