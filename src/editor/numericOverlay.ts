import type { Vec2 } from '@/core/model/types';
import { commitNumericAs, type NumericKind, type NumericResult } from '@/ui/numeric';
import type { EditorStore } from './store';
import { TOOLS, type ToolContext } from './tools/types';

/** Size of the field box (px) used to keep it inside the canvas, and its offset from the cursor. */
export const NUMERIC_FIELD_SIZE: Vec2 = { x: 150, y: 34 };
export const NUMERIC_FIELD_OFFSET: Vec2 = { x: 14, y: 14 };

/** Opens (or replaces) the shared numeric field. `initial` is the text already typed (the first digit). */
export function openNumericInput(
  store: EditorStore,
  opts: { initial: string; screen: Vec2; kind: NumericKind; label?: string },
): void {
  const numericInput = { value: opts.initial, screen: opts.screen, kind: opts.kind, label: opts.label };
  store.getState().setOverlay({ numericInput });
}

export function closeNumericInput(store: EditorStore): void {
  if (store.getState().overlay.numericInput) store.getState().setOverlay({ numericInput: null });
}

/** Pure parsing of the typed text with the rules of its kind (same as the properties panel fields). */
export function submitNumeric(text: string, kind: NumericKind): NumericResult {
  return commitNumericAs(text, kind);
}

/**
 * Enter: parses the typed text; invalid -> false and the field stays open; valid -> closes the field,
 * then hands the value to the active tool's onNumericSubmit and returns true.
 */
export function applyNumericInput(store: EditorStore, ctx: ToolContext, text: string): boolean {
  const ni = store.getState().overlay.numericInput;
  if (!ni) return false;
  const r = submitNumeric(text, ni.kind);
  if (!r.ok) return false;
  closeNumericInput(store);
  TOOLS[store.getState().tool]?.onNumericSubmit?.(r.value, ctx);
  return true;
}

/** Escape or blur: closes the field and tells the active tool. Does nothing when the field is already closed. */
export function cancelNumericInput(store: EditorStore, ctx: ToolContext): void {
  if (!store.getState().overlay.numericInput) return;
  closeNumericInput(store);
  TOOLS[store.getState().tool]?.onNumericCancel?.(ctx);
}

/** Top-left of the field box (px): next to the cursor, kept inside a canvas of the given size. */
export function placeNumericField(screen: Vec2, canvas: { width: number; height: number }): Vec2 {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  return {
    x: clamp(screen.x + NUMERIC_FIELD_OFFSET.x, canvas.width - NUMERIC_FIELD_SIZE.x),
    y: clamp(screen.y + NUMERIC_FIELD_OFFSET.y, canvas.height - NUMERIC_FIELD_SIZE.y),
  };
}
