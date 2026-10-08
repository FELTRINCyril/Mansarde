import { closeNumericInput, submitNumeric } from './numericOverlay';
import type { EditorStore } from './store';
import { TOOLS } from './tools/registry';
import type { ToolContext } from './tools/types';

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

/**
 * Tab (Shift+Tab: backward = true): offered to the active tool's onNumericTab with the parsed value
 * (null for an empty field).
 * 'unhandled' when the tool has no such handler (Tab keeps its browser default), 'invalid' when the
 * text does not parse (the field stays open), else 'ok'.
 */
export function tabNumericInput(
  store: EditorStore,
  ctx: ToolContext,
  text: string,
  backward = false,
): 'unhandled' | 'invalid' | 'ok' {
  const ni = store.getState().overlay.numericInput;
  const tool = TOOLS[store.getState().tool];
  if (!ni || !tool?.onNumericTab) return 'unhandled';
  if (text.trim() === '') {
    tool.onNumericTab(null, ctx, backward);
    return 'ok';
  }
  const r = submitNumeric(text, ni.kind);
  if (!r.ok) return 'invalid';
  tool.onNumericTab(r.value, ctx, backward);
  return 'ok';
}

/** Escape or blur: closes the field and tells the active tool. Does nothing when the field is already closed. */
export function cancelNumericInput(store: EditorStore, ctx: ToolContext): void {
  if (!store.getState().overlay.numericInput) return;
  closeNumericInput(store);
  TOOLS[store.getState().tool]?.onNumericCancel?.(ctx);
}
