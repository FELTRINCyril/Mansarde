import type { Recipe } from '@/core/commands/apply';
import { moveBeams } from '@/core/commands/beams';
import { moveCupboard } from '@/core/commands/cupboards';
import { moveObjects } from '@/core/commands/objects';
import { moveOpening } from '@/core/commands/openings';
import { moveSlopes } from '@/core/commands/slopes';
import { moveNodes } from '@/core/commands/walls';
import { fitCupboardOnWall } from '@/core/geometry/clearances';
import { dot } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import type { Id, Vec2 } from '@/core/model/types';
import { deletableCount, deleteSelectionRecipe } from './deleteSelection';
import { copySelection, duplicateSelection, paste } from './duplicate';
import type { SelectionItem } from './selection';
import { withPose } from './settlePose';
import { activeLevel, type EditorStore, type ToolId } from './store';
import { TOOLS } from './tools/registry';
import type { ToolContext } from './tools/types';

const NUDGE = 1;
const NUDGE_SHIFT = 10;
/** Pan of the view (screen px) by an arrow key when nothing is selected, and with Shift. */
export const PAN_STEP = 40;
export const PAN_STEP_SHIFT = 200;

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select', m: 'wall', r: 'rect', p: 'door', f: 'window', c: 'dimension', t: 'slope', b: 'beam', k: 'cupboard',
};
const ARROWS: Record<string, Vec2> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};
const TYPING_TAGS = new Set(['TEXTAREA', 'SELECT']);
/** Inputs where nothing is typed: the plan shortcuts keep working when one of them has the focus. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden']);
/** Inputs that use the arrow keys themselves. */
const ARROW_INPUTS = new Set(['range', 'radio']);

interface ElementLike { tagName?: unknown; type?: unknown; isContentEditable?: unknown }
const inputType = (el: ElementLike): string => (typeof el.type === 'string' ? el.type.toLowerCase() : '');
const isInput = (el: ElementLike): boolean => typeof el.tagName === 'string' && el.tagName.toUpperCase() === 'INPUT';

/** macOS (and iOS): the shortcut modifier is Cmd, elsewhere Ctrl. */
export function isMacPlatform(): boolean {
  const nav = (globalThis as { navigator?: { platform?: string } }).navigator;
  return /Mac|iPhone|iPad/.test(nav?.platform ?? '');
}

/** Label of the shortcut modifier for tooltips. */
export const MOD_LABEL = isMacPlatform() ? 'Cmd' : 'Ctrl';

const isMod = (e: KeyboardEvent): boolean => (isMacPlatform() ? e.metaKey : e.ctrlKey);

/**
 * The single typing guard of the editor: true for text-like inputs (text, search, number, email,
 * url, tel, password, no type...), textarea, select and contenteditable elements. A checkbox, radio,
 * button, range, color or file input is not a typing target: shortcuts still act while it has the
 * focus. Duck-typed (tagName / type / isContentEditable) so that it works on any EventTarget.
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof t !== 'object') return false;
  const el = t as ElementLike;
  if (el.isContentEditable === true) return true;
  if (isInput(el)) return !NON_TEXT_INPUTS.has(inputType(el));
  return typeof el.tagName === 'string' && TYPING_TAGS.has(el.tagName.toUpperCase());
}

/** A focused slider or radio button moves with the arrows: they are not plan nudges then. */
function ownsArrows(t: EventTarget | null): boolean {
  if (!t || typeof t !== 'object') return false;
  const el = t as ElementLike;
  return isInput(el) && ARROW_INPUTS.has(inputType(el));
}

/**
 * Abandons the gesture in progress, if any: the tool's onCancel (drops its drag state), then the
 * gesture itself if the tool left it open. Nothing else is undone. False when there was no gesture.
 */
export function cancelInteraction(store: EditorStore, ctx: ToolContext): boolean {
  const s = store.getState();
  if (!s.gesture) return false;
  TOOLS[s.tool]?.onCancel?.(ctx);
  if (store.getState().gesture) store.getState().cancelGesture();
  return true;
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

/**
 * Recipe moving the selection by delta, with the commands of a drag: objects, slopes and beams
 * (moveObjects, moveSlopes, moveBeams), the nodes of the selected walls plus the selected nodes
 * (each once), the selected openings along their wall by the projection of delta (those whose
 * wall moves are left alone, they follow it), and the selected cupboards along their wall by that
 * projection, kept on the free stretch of their face (fitCupboardOnWall, moveCupboard, as a
 * cupboard drag; those whose wall moves follow it). The moved 'onTop' objects are then posed on
 * their support (withPose, as after a typed distance). Null when nothing can move.
 */
function nudgeRecipe(store: EditorStore, delta: Vec2): Recipe | null {
  const s = store.getState();
  const level = activeLevel(s);
  if (!level || !s.project) return null;
  const objectIds = idsOf(s.selection, 'object').filter((id) => Object.hasOwn(level.objects, id));
  const slopeIds = idsOf(s.selection, 'slope').filter((id) => Object.hasOwn(level.slopes, id));
  const beamIds = idsOf(s.selection, 'beam').filter((id) => Object.hasOwn(level.beams, id));
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
  const cupboards: Array<{ id: Id; wallId: Id; offset: number }> = [];
  for (const id of idsOf(s.selection, 'cupboard')) {
    const c = level.cupboards[id];
    const w = c && level.walls[c.wallId];
    // a cupboard whose wall changes follows it (the walls are reconciled), it is not slid as well
    if (!c || !w || nodeIds.has(w.startNodeId) || nodeIds.has(w.endNodeId)) continue;
    const along = dot(delta, wallFrame(level, c.wallId).dir);
    if (Math.abs(along) <= 1e-9) continue;
    const fit = fitCupboardOnWall(level, c.wallId, c.side, c.width, c.offset + along, true);
    if (fit.fits && Math.abs(fit.offset - c.offset) > 1e-9) cupboards.push({ id, wallId: c.wallId, offset: fit.offset });
  }
  if (objectIds.length + slopeIds.length + beamIds.length + moves.length + openings.length + cupboards.length === 0) return null;
  const levelId = level.id;
  const move: Recipe = (draft) => {
    if (objectIds.length > 0) moveObjects(levelId, objectIds, delta)(draft);
    if (slopeIds.length > 0) moveSlopes(levelId, slopeIds, delta)(draft);
    if (beamIds.length > 0) moveBeams(levelId, beamIds, delta)(draft);
    if (moves.length > 0) moveNodes(levelId, moves)(draft);
    for (const { o, along } of openings) moveOpening(levelId, o.id, o.wallId, o.offset + along)(draft);
    for (const c of cupboards) moveCupboard(levelId, c.id, c.wallId, c.offset)(draft);
  };
  return withPose(s.project, levelId, move, objectIds);
}

/**
 * Global keyboard handling of the editor; returns true when the key was used (the caller then
 * prevents the browser default). Order:
 * 1. a key typed in a field (isTypingTarget) is never handled: the field keeps its own Cmd+Z,
 *    Backspace and letters; nor is a key already handled (defaultPrevented) or pressed while a
 *    modal dialog is open (isIgnoredKey);
 * 2. the active tool's onKeyDown;
 * 3. global shortcuts: V M R P F C T B K tools; Escape cancels the gesture or clears the selection;
 *    Delete / Backspace deletes the selection; Mod+Z undo, Mod+Shift+Z and Mod+Y redo (during a
 *    gesture all three only cancel it); Mod+C copies
 *    the selected objects, Mod+V pastes them at +20 +20, Mod+D duplicates them; arrows nudge the
 *    selection by 1 cm (10 with Shift), one history entry per press, or, with nothing selected,
 *    pan the view by PAN_STEP px (PAN_STEP_SHIFT with Shift; not while the plan is hidden behind
 *    the 3D view); 0 fits the view.
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
      case 'y':
        // during a drag, undo / redo only abandon the gesture: the previous entry stays
        if (cancelInteraction(store, ctx)) return true;
        if (k === 'z' && !e.shiftKey) s.undo();
        else s.redo();
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
  if (arrow && !ownsArrows(e.target)) {
    if (s.selection.length === 0) {
      if (s.display.view === '3d') return false;
      // the arrow shows what lies that way: the content moves the other way
      const pan = e.shiftKey ? PAN_STEP_SHIFT : PAN_STEP;
      s.setView({ ...s.view, tx: s.view.tx - arrow.x * pan, ty: s.view.ty - arrow.y * pan });
      return true;
    }
    const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
    const recipe = nudgeRecipe(store, { x: arrow.x * step, y: arrow.y * step });
    if (!recipe) return false;
    s.execute('Décaler', recipe);
    return true;
  }
  switch (k) {
    case 'escape':
      if (cancelInteraction(store, ctx)) return true;
      if (s.selection.length > 0) s.setSelection([]);
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
