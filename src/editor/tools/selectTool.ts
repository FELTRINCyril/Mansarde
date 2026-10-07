import type { Recipe } from '@/core/commands/apply';
import { setDimensionOffset } from '@/core/commands/dimensions';
import { moveObjects, setObjectTransform, updateObject } from '@/core/commands/objects';
import { moveOpening } from '@/core/commands/openings';
import { mergeNode, moveNodes, moveWalls } from '@/core/commands/walls';
import { manualDimLine, type DimLine } from '@/core/geometry/autoDimensions';
import { wallFaceInterval } from '@/core/geometry/clearances';
import { deriveLevel } from '@/core/geometry/derived';
import { hitTest, hitTestRect } from '@/core/geometry/hit';
import { openingCutRing } from '@/core/geometry/openings';
import { snapObjectToWalls, snapPoint } from '@/core/geometry/snap';
import { add, dist, dot, len, lerp, normalize, perp, rad2deg, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { SNAP_PX } from '@/core/model/defaults';
import type { Id, Level, PlacedObject, Vec2 } from '@/core/model/types';
import { handleTarget, hitHandle, objectLocalToWorld, worldToObjectLocal } from '../handles';
import { openNumericInput } from '../numericOverlay';
import type { SelectionItem } from '../selection';
import { activeLevel, type EditorState, type EditorStore } from '../store';
import { worldToScreen } from '../view';
import { measureObject, measureOpening, measureTarget, nextSide, typedRecipe, type MeasureTarget } from './clearanceDims';
import type { OutlineGhost, PointerInfo, Tool, ToolContext } from './types';

/** A press becomes a drag once the pointer has moved this far (screen px). */
export const DRAG_THRESHOLD_PX = 3;
/** Rotation step of the rotation handle (degrees); Alt rotates freely. */
export const ROTATION_STEP = 15;
/** Smallest object side reachable with the resize handles (cm). */
export const MIN_OBJECT_SIZE = 1;

type Sign = -1 | 0 | 1;

/** What a press turns into once the pointer moves. */
type DragPlan =
  | { kind: 'marquee' }
  | { kind: 'move'; objectIds: Id[]; wallIds: Id[] }
  | { kind: 'node'; nodeId: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'dimension'; id: Id }
  | { kind: 'rotate'; id: Id }
  | { kind: 'resize'; id: Id; sx: Sign; sy: Sign };

interface Session {
  phase: 'pending' | 'drag';
  levelId: Id;
  start: PointerInfo;
  plan: DragPlan | null; // null: the press cannot drag (shift-click that removed the item)
  click: SelectionItem[] | null; // selection applied on a release without drag (null = keep)
  additive: boolean; // Shift at press: the rectangle adds to the selection
  baseSelection: SelectionItem[];
  grab: Vec2; // opening: (cursor - center) along the wall in x; resize: handle - cursor in the object frame
  last: Vec2; // last pointer position (screen px): where the typed distance field opens
  activeSide: string | null; // clearance chosen with Tab (side name, the list changes while dragging)
  typing: boolean; // the numeric field is open: pointer moves are ignored
  released: boolean; // the pointer was released while typing: the gesture waits for the field
}

const GESTURE_LABELS: Record<Exclude<DragPlan['kind'], 'marquee'>, string> = {
  move: 'Déplacer',
  node: 'Déplacer la jonction',
  opening: "Déplacer l'ouverture",
  dimension: 'Décaler la cote',
  rotate: "Pivoter l'objet",
  resize: "Redimensionner l'objet",
};

const sameItem = (a: SelectionItem, b: SelectionItem): boolean => a.kind === b.kind && a.id === b.id;
const contains = (sel: SelectionItem[], item: SelectionItem): boolean => sel.some((i) => sameItem(i, item));
const toggle = (sel: SelectionItem[], item: SelectionItem): SelectionItem[] =>
  contains(sel, item) ? sel.filter((i) => !sameItem(i, item)) : [...sel, item];
const union = (a: SelectionItem[], b: SelectionItem[]): SelectionItem[] => [...a, ...b.filter((i) => !contains(a, i))];
const idsOf = (sel: SelectionItem[], kind: SelectionItem['kind']): Id[] => sel.filter((i) => i.kind === kind).map((i) => i.id);
const roundTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step + 0 : v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function planFor(item: SelectionItem, sel: SelectionItem[]): DragPlan | null {
  switch (item.kind) {
    case 'node':
      return { kind: 'node', nodeId: item.id };
    case 'object':
    case 'wall':
      return { kind: 'move', objectIds: idsOf(sel, 'object'), wallIds: idsOf(sel, 'wall') };
    case 'opening':
      return { kind: 'opening', id: item.id };
    case 'dimension':
      return { kind: 'dimension', id: item.id };
    default:
      return null;
  }
}

const levelOf = (project: { levels: Level[] } | null | undefined, id: Id): Level | undefined => project?.levels.find((l) => l.id === id);

/** Dynamic dimensions of an object: its clearances to the nearest wall faces (spec 6.5). */
function objectDims(level: Level, o: PlacedObject): DimLine[] {
  return measureObject(level, o).dims;
}

/** Dynamic dimensions of an opening, drawn like its width dimension (beyond the face opposite to the swing). */
function openingDims(level: Level, id: Id): DimLine[] {
  const o = level.openings[id];
  const wall = o && level.walls[o.wallId];
  if (!o || !wall) return [];
  return measureOpening(level, o).dims;
}

/** Element whose clearances a drag shows: a single object moved alone, or an opening. */
function sessionTarget(s: Session): MeasureTarget | null {
  const plan = s.plan;
  if (plan?.kind === 'opening') return { kind: 'opening', levelId: s.levelId, id: plan.id };
  if (plan?.kind === 'move' && plan.wallIds.length === 0 && plan.objectIds.length === 1) {
    return { kind: 'object', levelId: s.levelId, id: plan.objectIds[0]! };
  }
  return null;
}

/** The single selected object or opening of the active level, if that is the whole selection. */
function selectedTarget(st: EditorState): MeasureTarget | null {
  const level = activeLevel(st);
  const item = st.selection.length === 1 ? st.selection[0]! : null;
  if (!level || !item) return null;
  if (item.kind === 'object' && level.objects[item.id]) return { kind: 'object', levelId: level.id, id: item.id };
  if (item.kind === 'opening' && level.openings[item.id]) return { kind: 'opening', levelId: level.id, id: item.id };
  return null;
}

const sameTarget = (a: MeasureTarget, b: MeasureTarget): boolean => a.kind === b.kind && a.id === b.id && a.levelId === b.levelId;
const isDigit = (k: string): boolean => /^[0-9]$/.test(k);
const TYPED_LABEL = 'Distance';

/** Wall the cursor hovers (axis distance within half the thickness + the snap tolerance), the closest one. */
export function hoveredWall(level: Level, p: Vec2, tol: number): Id | null {
  let best: Id | null = null;
  let bestD = Infinity;
  for (const w of Object.values(level.walls)) {
    const f = wallFrame(level, w.id);
    if (f.length < 1e-9) continue;
    const v = sub(p, f.start);
    const along = dot(v, f.dir);
    if (along < 0 || along > f.length) continue;
    const across = Math.abs(dot(v, f.normal));
    if (across <= w.thickness / 2 + tol && across < bestD) {
      best = w.id;
      bestD = across;
    }
  }
  return best;
}

const outline = (rings: OutlineGhost['rings'], points: Vec2[] = []): OutlineGhost => ({ kind: 'outline', rings, points });

/**
 * The selection tool (V). A press on nothing or in a room starts a selection rectangle
 * (hitTestRect) or, if released without moving, selects the room / clears the selection; Shift
 * adds or removes. A press on an element selects it, and dragging it edits it in one gesture
 * recomputed from the gesture base with the total pointer delta:
 * - objects and walls of the selection move together (moveObjects / moveWalls); with walls the
 *   delta snaps to the grid, a single object is pulled against wall faces (snapObjectToWalls) and
 *   shows its clearances; Alt disables snapping;
 * - a wall node follows snapPoint (excluding itself, Shift = orthogonal from its start) and is
 *   merged into the node it is dropped on (mergeNode);
 * - an opening slides along the closest hovered wall, else its own wall (moveOpening), with its
 *   clearances; a refused position is drawn in red;
 * - a manual dimension changes its offset (setDimensionOffset);
 * - the handles of a single selected object rotate it (15 degree steps, free with Alt) or resize it
 *   (opposite side fixed, MIN_OBJECT_SIZE minimum).
 * A double-click in a room opens the in-place room name input (overlay.rename).
 */
export function createSelectTool(): Tool {
  let session: Session | null = null;
  /** Clearances of the selected element shown with Tab without dragging (and after a typed drag). */
  let keyboard: { target: MeasureTarget; activeSide: string | null } | null = null;

  const clearTransient = (store: EditorStore) =>
    store.getState().setOverlay({ marquee: null, guides: [], dynamicDims: [], activeDimIndex: null, ghost: null });

  /** Gesture base level of the session; null (and the session dropped) if the gesture is gone (undo, tool change). */
  const baseLevel = (s: Session, store: EditorStore): Level | null => {
    const level = levelOf(store.getState().gesture?.base, s.levelId);
    if (level) return level;
    session = null;
    clearTransient(store);
    return null;
  };

  /** Starts the drag: opens the gesture and records the grab offset. False when the element is gone. */
  function begin(s: Session, plan: DragPlan, c: ToolContext): boolean {
    if (plan.kind === 'marquee') return true;
    const st = c.store.getState();
    const level = activeLevel(st);
    if (!level || level.id !== s.levelId) return false;
    if (plan.kind === 'opening') {
      const o = level.openings[plan.id];
      if (!o || !level.walls[o.wallId]) return false;
      const f = wallFrame(level, o.wallId);
      s.grab = { x: dot(sub(s.start.world, f.start), f.dir) - o.offset, y: 0 };
    } else if (plan.kind === 'resize') {
      const o = level.objects[plan.id];
      if (!o) return false;
      const handle = { x: (plan.sx * o.width) / 2, y: (plan.sy * o.depth) / 2 };
      s.grab = sub(handle, worldToObjectLocal(o, s.start.world));
    }
    st.beginGesture(GESTURE_LABELS[plan.kind]);
    return true;
  }

  function dragMove(s: Session, plan: Extract<DragPlan, { kind: 'move' }>, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    if (!base) return;
    const st = c.store.getState();
    const raw = sub(e.world, s.start.world);
    const snap = !e.alt;
    const step = st.project?.settings.gridStep ?? 0;
    const delta = plan.wallIds.length > 0 && snap ? { x: roundTo(raw.x, step), y: roundTo(raw.y, step) } : raw;
    const { levelId } = s;
    let recipe: Recipe = (draft) => {
      if (plan.objectIds.length > 0) moveObjects(levelId, plan.objectIds, delta)(draft);
      if (plan.wallIds.length > 0) moveWalls(levelId, plan.wallIds, delta)(draft);
    };
    const single = plan.wallIds.length === 0 && plan.objectIds.length === 1 ? base.objects[plan.objectIds[0]!] : undefined;
    if (single && snap) {
      const moved = { ...single, x: single.x + delta.x, y: single.y + delta.y };
      const sn = snapObjectToWalls(moved, base, c.pxPerCm());
      if (sn.wallId) recipe = setObjectTransform(levelId, single.id, { x: sn.x, y: sn.y, rotation: sn.rotation });
    }
    st.updateGesture(recipe);
    const level = levelOf(c.store.getState().project, levelId);
    const o = single && level?.objects[single.id];
    st.setOverlay({ dynamicDims: o && level ? objectDims(level, o) : [], ghost: null });
  }

  function dragNode(s: Session, nodeId: Id, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    const st = c.store.getState();
    const origin = base?.nodes[nodeId];
    if (!base || !origin || !st.project) return;
    const sn = snapPoint(e.world, {
      level: base,
      pxPerCm: c.pxPerCm(),
      gridStep: st.project.settings.gridStep,
      enabled: !e.alt,
      ortho: e.shift,
      from: e.shift ? { x: origin.x, y: origin.y } : undefined,
      excludeNodeIds: new Set([nodeId]),
    });
    // dropped on another node: the preview already shows the merge, so the commit is the merge
    let ok = sn.kind === 'node' && sn.nodeId !== undefined && st.updateGesture(mergeNode(s.levelId, nodeId, sn.nodeId));
    if (!ok) ok = st.updateGesture(moveNodes(s.levelId, [{ nodeId, to: sn.point }]));
    st.setOverlay({ guides: sn.guides, ghost: ok ? null : outline([], [sn.point]) });
  }

  function dragOpening(s: Session, id: Id, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    const o = base?.openings[id];
    if (!base || !o || !base.walls[o.wallId]) return;
    const st = c.store.getState();
    const wallId = hoveredWall(base, e.world, SNAP_PX / c.pxPerCm()) ?? o.wallId;
    const f = wallFrame(base, wallId);
    let offset = dot(sub(e.world, f.start), f.dir) - s.grab.x;
    if (!e.alt) offset = Math.round(offset);
    // kept between the faces of the walls met at the ends (ruling R29), else at least within the wall
    const [faceLo, faceHi] = wallFaceInterval(base, wallId);
    if (faceHi - faceLo >= o.width) offset = clamp(offset, faceLo + o.width / 2, faceHi - o.width / 2);
    else if (f.length >= o.width) offset = clamp(offset, o.width / 2, f.length - o.width / 2);
    const ok = st.updateGesture(moveOpening(s.levelId, id, wallId, offset));
    const level = levelOf(c.store.getState().project, s.levelId);
    st.setOverlay(
      ok && level
        ? { dynamicDims: openingDims(level, id), ghost: null }
        : { dynamicDims: [], ghost: outline([openingCutRing(base, { ...o, wallId, offset })]) },
    );
  }

  function dragDimension(s: Session, id: Id, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    const dim = base?.dimensions[id];
    const line = base && dim && manualDimLine(base, dim);
    if (!dim || !line) return;
    const n = normalize(perp(sub(line.b, line.a)));
    let offset = dim.offset + dot(sub(e.world, s.start.world), n);
    if (!e.alt) offset = Math.round(offset);
    c.store.getState().updateGesture(setDimensionOffset(s.levelId, id, offset));
  }

  function dragRotate(s: Session, id: Id, e: PointerInfo, c: ToolContext): void {
    const o = baseLevel(s, c.store)?.objects[id];
    if (!o) return;
    const v = sub(e.world, o);
    if (len(v) < 1e-9) return;
    // the handle points along the local -y axis, rotate((0, -1), r) = (sin r, -cos r)
    let deg = rad2deg(Math.atan2(v.x, -v.y));
    if (!e.alt) deg = Math.round(deg / ROTATION_STEP) * ROTATION_STEP;
    c.store.getState().updateGesture(setObjectTransform(s.levelId, id, { rotation: deg }));
  }

  function dragResize(s: Session, plan: Extract<DragPlan, { kind: 'resize' }>, e: PointerInfo, c: ToolContext): void {
    const o = baseLevel(s, c.store)?.objects[plan.id];
    if (!o) return;
    const q = add(worldToObjectLocal(o, e.world), s.grab);
    const size = (sign: Sign, coord: number, current: number): number => {
      if (sign === 0) return current;
      const v = sign * coord + current / 2; // the opposite side stays at -sign * current / 2
      return Math.max(MIN_OBJECT_SIZE, e.alt ? v : Math.round(v));
    };
    const width = size(plan.sx, q.x, o.width);
    const depth = size(plan.sy, q.y, o.depth);
    const center = objectLocalToWorld(o, { x: (plan.sx * (width - o.width)) / 2, y: (plan.sy * (depth - o.depth)) / 2 });
    const st = c.store.getState();
    st.updateGesture(updateObject(s.levelId, plan.id, { width, depth, x: center.x, y: center.y }));
    const level = levelOf(c.store.getState().project, s.levelId);
    const current = level?.objects[plan.id];
    st.setOverlay({ dynamicDims: level && current ? objectDims(level, current) : [] });
  }

  function drag(s: Session, plan: DragPlan, e: PointerInfo, c: ToolContext): void {
    switch (plan.kind) {
      case 'marquee':
        c.store.getState().setOverlay({ marquee: { a: s.start.world, b: e.world } });
        return;
      case 'move':
        return dragMove(s, plan, e, c);
      case 'node':
        return dragNode(s, plan.nodeId, e, c);
      case 'opening':
        return dragOpening(s, plan.id, e, c);
      case 'dimension':
        return dragDimension(s, plan.id, e, c);
      case 'rotate':
        return dragRotate(s, plan.id, e, c);
      case 'resize':
        return dragResize(s, plan, e, c);
    }
  }

  // ----- Tab and typed distances (spec 7.4, ruling R27) -----

  /** Shows the clearances of the keyboard measure from the current project; ends it when they are gone. */
  function showKeyboardMeasure(c: ToolContext): void {
    const level = keyboard && levelOf(c.store.getState().project, keyboard.target.levelId);
    const m = keyboard && level ? measureTarget(level, keyboard.target) : null;
    if (!keyboard || !m || m.dims.length === 0) return endKeyboardMeasure(c.store);
    const i = keyboard.activeSide === null ? -1 : m.sides.indexOf(keyboard.activeSide);
    c.store.getState().setOverlay({ dynamicDims: m.dims, activeDimIndex: i < 0 ? null : i });
  }

  function endKeyboardMeasure(store: EditorStore): void {
    if (!keyboard) return;
    keyboard = null;
    clearTransient(store);
  }

  /** Highlights the Tab-chosen clearance of a drag again after its dimensions were recomputed. */
  function syncActive(s: Session, c: ToolContext): void {
    const target = sessionTarget(s);
    const level = levelOf(c.store.getState().project, s.levelId);
    if (!target || !level || s.activeSide === null) return;
    const i = measureTarget(level, target).sides.indexOf(s.activeSide);
    c.store.getState().setOverlay({ activeDimIndex: i < 0 ? null : i });
  }

  /**
   * Tab (Shift+Tab backwards) chooses the next clearance of the dragged element, or of the single
   * selected object / opening when nothing is dragged; a digit then opens the numeric field with
   * it. Null: not a key for this (left to the other shortcuts). Any other key ends the keyboard
   * measure (Escape is used for that).
   */
  function typedKey(e: KeyboardEvent, c: ToolContext): boolean | null {
    if (e.metaKey || e.ctrlKey || e.altKey) return null;
    const st = c.store.getState();
    const s = session;
    if (s && (s.phase !== 'drag' || s.typing)) return null;
    const target = s ? sessionTarget(s) : selectedTarget(st);
    const level = target && levelOf(st.project, target.levelId);
    const m = target && level ? measureTarget(level, target) : null;
    const known = !s && keyboard && target && sameTarget(keyboard.target, target) ? keyboard : null;
    if (e.key === 'Tab') {
      if (!target || !m || m.sides.length === 0) {
        if (!s) endKeyboardMeasure(c.store);
        return s ? true : null;
      }
      const active = nextSide(m.sides, s ? s.activeSide : (known?.activeSide ?? null), e.shiftKey);
      if (s) s.activeSide = active;
      else keyboard = { target, activeSide: active };
      st.setOverlay({ dynamicDims: m.dims, activeDimIndex: active === null ? null : m.sides.indexOf(active) });
      return true;
    }
    if (isDigit(e.key) && target && m && m.sides.length > 0 && (s || known)) {
      const holder = s ?? known!;
      if (holder.activeSide === null || !m.sides.includes(holder.activeSide)) holder.activeSide = m.sides[0]!;
      const i = m.sides.indexOf(holder.activeSide);
      const dim = m.dims[i]!;
      st.setOverlay({ dynamicDims: m.dims, activeDimIndex: i });
      const screen = s ? s.last : worldToScreen(st.view, lerp(dim.a, dim.b, 0.5));
      openNumericInput(c.store, { initial: e.key, screen, kind: 'nonNegative', label: TYPED_LABEL });
      if (s) s.typing = true;
      return true; // used: PlanCanvas prevents the default, the digit is not typed twice
    }
    if (!s && keyboard) {
      endKeyboardMeasure(c.store);
      if (e.key === 'Escape') return true;
    }
    return null;
  }

  /** The pointer was released while typing and the field closed without a value: the drop stands. */
  function finishReleased(c: ToolContext): void {
    session = null;
    c.store.getState().commitGesture();
    clearTransient(c.store);
  }

  return {
    id: 'select',
    cursor: 'default',

    onPointerDown(e, c) {
      if (e.button !== 0) return;
      endKeyboardMeasure(c.store);
      const st = c.store.getState();
      const level = activeLevel(st);
      if (!st.project || !level) return;
      const px = c.pxPerCm();
      const s: Session = {
        phase: 'pending',
        levelId: level.id,
        start: e,
        plan: null,
        click: null,
        additive: e.shift,
        baseSelection: st.selection,
        grab: { x: 0, y: 0 },
        last: e.screen,
        activeSide: null,
        typing: false,
        released: false,
      };
      session = s;

      const target = handleTarget(st.selection, level);
      const handle = target && hitHandle(target, e.world, px);
      if (target && handle) {
        s.plan = handle.kind === 'rotate' ? { kind: 'rotate', id: target.id } : { kind: 'resize', id: target.id, sx: handle.sx, sy: handle.sy };
        return;
      }

      const hit = hitTest(level, deriveLevel(level), e.world, px, st.project.customObjects);
      const item: SelectionItem | null = hit && { kind: hit.kind, id: hit.id };
      if (!item || item.kind === 'room') {
        // a click selects the room or clears the selection; a drag draws a selection rectangle
        s.plan = { kind: 'marquee' };
        s.click = item ? (e.shift ? toggle(st.selection, item) : [item]) : e.shift ? null : [];
        return;
      }
      let sel = st.selection;
      if (e.shift) {
        sel = toggle(sel, item);
        st.setSelection(sel);
      } else if (!contains(sel, item)) {
        sel = [item];
        st.setSelection(sel);
      } else if (sel.length > 1) {
        s.click = [item]; // dragging moves the whole selection, a plain click narrows it
      }
      s.plan = contains(sel, item) ? planFor(item, sel) : null;
    },

    onPointerMove(e, c) {
      const s = session;
      if (!s || !s.plan || s.typing) return;
      s.last = e.screen;
      if (s.phase === 'pending') {
        if (dist(e.screen, s.start.screen) < DRAG_THRESHOLD_PX) return;
        if (!begin(s, s.plan, c)) {
          session = null;
          return;
        }
        s.phase = 'drag';
      }
      drag(s, s.plan, e, c);
      if (s.activeSide !== null) syncActive(s, c);
    },

    onPointerUp(e, c) {
      if (session?.typing) {
        session.released = true; // the field decides: Enter places, Escape keeps the drop
        return;
      }
      const s = session;
      session = null;
      if (!s) return;
      const st = c.store.getState();
      if (s.phase === 'pending' || !s.plan) {
        if (s.click) st.setSelection(s.click);
        return;
      }
      if (s.plan.kind === 'marquee') {
        const level = activeLevel(st);
        if (st.project && level && level.id === s.levelId) {
          const hits = hitTestRect(level, deriveLevel(level), s.start.world, e.world, st.project.customObjects).map(
            (h): SelectionItem => ({ kind: h.kind, id: h.id }),
          );
          st.setSelection(s.additive ? union(s.baseSelection, hits) : hits);
        }
      } else {
        st.commitGesture();
      }
      clearTransient(c.store);
    },

    onDoubleClick(e, c) {
      session = null;
      const st = c.store.getState();
      const level = activeLevel(st);
      if (!st.project || !level) return;
      const d = deriveLevel(level);
      const hit = hitTest(level, d, e.world, c.pxPerCm(), st.project.customObjects);
      const room = hit?.kind === 'room' ? d.rooms.find((r) => r.key === hit.id) : undefined;
      if (!room) return;
      st.setSelection([{ kind: 'room', id: room.key }]);
      st.setOverlay({ rename: { levelId: level.id, label: room.label, labelPoint: room.labelPoint, placeholder: room.name } });
    },

    onKeyDown(e, c) {
      const typed = typedKey(e, c);
      if (typed !== null) return typed;
      if (e.key !== 'Escape' || !session) return false;
      const s = session;
      session = null;
      if (s.phase === 'drag' && s.plan?.kind !== 'marquee') c.store.getState().cancelGesture();
      clearTransient(c.store);
      return true;
    },

    onNumericSubmit(value, c) {
      const st = c.store.getState();
      const s = session;
      if (s?.typing) {
        s.typing = false;
        const target = sessionTarget(s);
        const level = levelOf(st.project, s.levelId); // the preview: the value applies to what is shown
        const recipe = target && level && s.activeSide !== null ? typedRecipe(level, target, s.activeSide, value) : null;
        if (target && recipe && st.updateGesture(recipe)) {
          session = null;
          st.commitGesture();
          keyboard = { target, activeSide: s.activeSide };
          showKeyboardMeasure(c);
          return;
        }
        st.showToast(target?.kind === 'opening' ? 'Pas assez de place sur ce mur' : 'Position impossible');
        if (s.released) finishReleased(c);
        return;
      }
      if (!keyboard || keyboard.activeSide === null) return;
      const level = levelOf(st.project, keyboard.target.levelId);
      const recipe = level && typedRecipe(level, keyboard.target, keyboard.activeSide, value);
      if (recipe) st.execute(keyboard.target.kind === 'opening' ? GESTURE_LABELS.opening : GESTURE_LABELS.move, recipe);
      showKeyboardMeasure(c);
    },

    onNumericCancel(c) {
      const s = session;
      if (!s?.typing) return;
      s.typing = false;
      if (s.released) finishReleased(c);
    },

    onDeactivate(c) {
      session = null;
      keyboard = null;
      clearTransient(c.store);
    },
  };
}

export const selectTool: Tool = createSelectTool();
