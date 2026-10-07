import type { Recipe } from '@/core/commands/apply';
import { moveObjects, pasteObjects } from '@/core/commands/objects';
import { moveOpening } from '@/core/commands/openings';
import { moveNodes } from '@/core/commands/walls';
import { dot } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import type { Id, PlacedObject, Vec2 } from '@/core/model/types';
import { deletableCount, deleteSelectionRecipe } from './deleteSelection';
import type { SelectionItem } from './selection';
import { activeLevel, type EditorStore, type ToolId } from './store';
import { TOOLS, type ToolContext } from './tools/types';

/** Offset of pasted and duplicated objects (cm). */
export const PASTE_OFFSET: Vec2 = { x: 20, y: 20 };
const NUDGE = 1;
const NUDGE_SHIFT = 10;

const TOOL_KEYS: Record<string, ToolId> = { v: 'select', m: 'wall', r: 'rect', p: 'door', f: 'window', c: 'dimension' };
const ARROWS: Record<string, Vec2> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** macOS (and iOS): the shortcut modifier is Cmd, elsewhere Ctrl. */
export function isMacPlatform(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string } }).navigator;
  return /Mac|iPhone|iPad/.test(nav?.platform ?? '');
}

/** Label of the shortcut modifier for tooltips. */
export const MOD_LABEL = isMacPlatform() ? 'Cmd' : 'Ctrl';

const isMod = (e: KeyboardEvent): boolean => (isMacPlatform() ? e.metaKey : e.ctrlKey);

/**
 * The single typing guard of the editor: true for input, textarea, select and contenteditable
 * elements. Duck-typed (tagName / isContentEditable) so that it works on any EventTarget.
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof t !== 'object') return false;
  const el = t as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === 'string' && TYPING_TAGS.has(el.tagName.toUpperCase());
}

/** True while a modal dialog is open ([aria-modal="true"] in the document; always false outside a browser). */
export function isModalOpen(): boolean {
  const doc = (globalThis as { document?: { querySelector(selector: string): unknown } }).document;
  return !!doc?.querySelector('[aria-modal="true"]');
}

/**
 * Keys the plan must ignore: typed in a field (isTypingTarget), already used by someone else
 * (defaultPrevented, e.g. Escape reverting a field draft or closing a dialog), or pressed while a
 * modal dialog is open (its shortcuts must not act on the plan behind it).
 */
export function isIgnoredKey(e: KeyboardEvent): boolean {
  return e.defaultPrevented || isTypingTarget(e.target) || isModalOpen();
}

const idsOf = (selection: SelectionItem[], kind: SelectionItem['kind']): Id[] =>
  [...new Set(selection.filter((i) => i.kind === kind).map((i) => i.id))];

/** Deletes the selected walls, openings, objects and manual dimensions (one history entry); rooms and nodes are ignored. */
export function deleteSelection(store: EditorStore): void {
  const s = store.getState();
  const level = activeLevel(s);
  if (!level || deletableCount(s.selection) === 0) return;
  if (s.execute('Supprimer', deleteSelectionRecipe(level.id, s.selection))) store.getState().setSelection([]);
}

function selectedObjects(store: EditorStore): PlacedObject[] {
  const s = store.getState();
  const level = activeLevel(s);
  if (!level) return [];
  return idsOf(s.selection, 'object')
    .map((id) => level.objects[id])
    .filter((o): o is PlacedObject => !!o);
}

/** Adds copies of the objects at +PASTE_OFFSET (one history entry) and selects them; the new ids, or null when refused. */
function pasteCopies(store: EditorStore, label: string, objects: PlacedObject[]): Id[] | null {
  const s = store.getState();
  const level = activeLevel(s);
  if (!level || objects.length === 0) return null;
  const out = { ids: [] as Id[] };
  if (!s.execute(label, pasteObjects(level.id, objects, PASTE_OFFSET, out))) return null;
  store.getState().setSelection(out.ids.map((id) => ({ kind: 'object', id })));
  return out.ids;
}

function copySelection(store: EditorStore): boolean {
  const objects = selectedObjects(store);
  if (objects.length === 0) return false;
  store.getState().setClipboard(objects.map((o) => structuredClone(o)));
  return true;
}

/** Pastes the clipboard; the clipboard then follows the copies, so that pasting again cascades. */
function paste(store: EditorStore): boolean {
  const clipboard = store.getState().clipboard;
  if (clipboard.length === 0) return false;
  if (pasteCopies(store, 'Coller', clipboard)) {
    store.getState().setClipboard(clipboard.map((o) => ({ ...o, x: o.x + PASTE_OFFSET.x, y: o.y + PASTE_OFFSET.y })));
  }
  return true;
}

function duplicateSelection(store: EditorStore): boolean {
  const objects = selectedObjects(store);
  if (objects.length === 0) return false;
  pasteCopies(store, 'Dupliquer', objects);
  return true;
}

/**
 * Recipe moving the selection by delta: objects, the nodes of the selected walls plus the selected
 * nodes (each once), and the selected openings along their wall by the projection of delta (those
 * whose wall moves are left alone, they follow it). Null when nothing can move.
 */
function nudgeRecipe(store: EditorStore, delta: Vec2): Recipe | null {
  const s = store.getState();
  const level = activeLevel(s);
  if (!level) return null;
  const objectIds = idsOf(s.selection, 'object').filter((id) => Object.hasOwn(level.objects, id));
  const nodeIds = new Set(idsOf(s.selection, 'node').filter((id) => Object.hasOwn(level.nodes, id)));
  for (const id of idsOf(s.selection, 'wall')) {
    const w = level.walls[id];
    if (!w) continue;
    nodeIds.add(w.startNodeId);
    nodeIds.add(w.endNodeId);
  }
  const moves = [...nodeIds].map((nodeId) => {
    const n = level.nodes[nodeId]!;
    return { nodeId, to: { x: n.x + delta.x, y: n.y + delta.y } };
  });
  const openings = idsOf(s.selection, 'opening')
    .map((id) => level.openings[id])
    .filter((o) => !!o && !!level.walls[o.wallId])
    .filter((o) => {
      const w = level.walls[o!.wallId]!;
      return !(nodeIds.has(w.startNodeId) && nodeIds.has(w.endNodeId));
    })
    .map((o) => ({ o: o!, along: dot(delta, wallFrame(level, o!.wallId).dir) }))
    .filter(({ along }) => Math.abs(along) > 1e-9);
  if (objectIds.length === 0 && moves.length === 0 && openings.length === 0) return null;
  const levelId = level.id;
  return (draft) => {
    if (objectIds.length > 0) moveObjects(levelId, objectIds, delta)(draft);
    if (moves.length > 0) moveNodes(levelId, moves)(draft);
    for (const { o, along } of openings) moveOpening(levelId, o.id, o.wallId, o.offset + along)(draft);
  };
}

/**
 * Global keyboard handling of the editor; returns true when the key was used (the caller then
 * prevents the browser default). Order:
 * 1. a key typed in a field (isTypingTarget) is never handled: the field keeps its own Cmd+Z,
 *    Backspace and letters; nor is a key already handled (defaultPrevented) or pressed while a
 *    modal dialog is open (isIgnoredKey);
 * 2. the active tool's onKeyDown;
 * 3. global shortcuts: V M R P F C tools; Escape cancels the gesture or clears the selection;
 *    Delete / Backspace deletes the selection; Mod+Z undo, Mod+Shift+Z and Mod+Y redo; Mod+C copies
 *    the selected objects, Mod+V pastes them at +20 +20, Mod+D duplicates them; arrows nudge the
 *    selection by 1 cm (10 with Shift), one history entry per press; 0 fits the view.
 * Mod is Cmd on macOS, Ctrl elsewhere.
 */
export function handleGlobalKey(e: KeyboardEvent, store: EditorStore, ctx: ToolContext): boolean {
  if (isIgnoredKey(e)) return false;
  const s = store.getState();
  if (!s.project) return false;
  if (TOOLS[s.tool]?.onKeyDown?.(e, ctx)) return true;

  const k = e.key.toLowerCase();
  if (isMod(e)) {
    if (e.altKey) return false;
    switch (k) {
      case 'z':
        if (e.shiftKey) s.redo();
        else s.undo();
        return true;
      case 'y':
        s.redo();
        return true;
      case 'c':
        return copySelection(store);
      case 'v':
        return paste(store);
      case 'd':
        return duplicateSelection(store);
      default:
        return false;
    }
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return false;

  const tool = TOOL_KEYS[k];
  if (tool) {
    if (s.tool !== tool) s.setTool(tool);
    return true;
  }
  const arrow = ARROWS[k];
  if (arrow) {
    const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
    const recipe = nudgeRecipe(store, { x: arrow.x * step, y: arrow.y * step });
    if (!recipe) return false;
    s.execute('Décaler', recipe);
    return true;
  }
  switch (k) {
    case 'escape':
      if (s.gesture) s.cancelGesture();
      else if (s.selection.length > 0) s.setSelection([]);
      else return false;
      return true;
    case 'delete':
    case 'backspace':
      if (deletableCount(s.selection) === 0) return false;
      deleteSelection(store);
      return true;
    case '0':
      ctx.fitView();
      return true;
    default:
      return false;
  }
}
