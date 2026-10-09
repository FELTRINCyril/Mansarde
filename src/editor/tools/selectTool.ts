import type { Recipe } from '@/core/commands/apply';
import { moveBeams, updateBeam } from '@/core/commands/beams';
import { moveCupboard } from '@/core/commands/cupboards';
import { setDimensionOffset } from '@/core/commands/dimensions';
import { moveObjects, setObjectTransform, updateObject } from '@/core/commands/objects';
import { moveOpening } from '@/core/commands/openings';
import { moveSlopes, updateSlope } from '@/core/commands/slopes';
import { setRoomInteriorSize } from '@/core/commands/roomSize';
import { joinNodeToWall, mergeNode, moveNodes, moveWalls } from '@/core/commands/walls';
import { manualDimLine, type DimLine } from '@/core/geometry/autoDimensions';
import { wallFaceInterval } from '@/core/geometry/clearances';
import { deriveLevel } from '@/core/geometry/derived';
import { hitTest, hitTestRect } from '@/core/geometry/hit';
import { openingCutRing } from '@/core/geometry/openings';
import { snapToWallForPose, supportElevation } from '@/core/geometry/pose';
import { slopeFrame } from '@/core/geometry/slopes';
import { snapObjectToWalls, snapPoint, type Guide } from '@/core/geometry/snap';
import { add, dist, dot, len, lerp, normalize, perp, rad2deg, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { MIN_WALL_LENGTH, SNAP_PX } from '@/core/model/defaults';
import { newId } from '@/core/model/ids';
import type { Id, Level, PlacedObject, Vec2 } from '@/core/model/types';
import { formatNumber } from '@/ui/numeric';
import { handleTarget, hitHandle, hitVolumeHandle, objectLocalToWorld, volumeHandles, worldToObjectLocal, type VolumeHandle } from '../handles';
import { closeNumericInput, openNumericInput } from '../numericOverlay';
import { roomDimensionAt } from '../roomDimensions';
import type { SelectionItem } from '../selection';
import { activeLevel, type EditorState, type EditorStore } from '../store';
import { worldToScreen } from '../view';
import { beamLengthDim } from './beamTool';
import { fitCupboardOnWall } from './cupboardTool';
import { slopeDepthDim } from './slopeTool';
import { ERR_NO_ROOM, measureObject, measureOpening, measureTarget, nextSide, typedPlacement, type MeasureTarget } from './clearanceDims';
import { undoKeyOf } from './drawing';
import { hoveredWall } from './hover';
import type { OutlineGhost, PointerInfo, Tool, ToolContext } from './types';
import { snapVolumePoint, type CupboardGhost } from './volumeTools';

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
  | { kind: 'move'; objectIds: Id[]; wallIds: Id[]; slopeIds: Id[]; beamIds: Id[] }
  | { kind: 'node'; nodeId: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'cupboard'; id: Id }
  | { kind: 'volumeHandle'; target: VolumeHandle['target']; id: Id; role: VolumeHandle['role'] }
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
  grab: Vec2; // opening, cupboard: (cursor - center) along the wall in x; resize: handle - cursor in the object frame
  last: Vec2; // last pointer position (screen px): where the typed distance field opens
  activeSide: string | null; // clearance chosen with Tab (side name, the list changes while dragging)
  typing: boolean; // the numeric field is open: pointer moves are ignored
}

const GESTURE_LABELS: Record<Exclude<DragPlan['kind'], 'marquee'>, string> = {
  move: 'Déplacer',
  node: 'Déplacer la jonction',
  opening: "Déplacer l'ouverture",
  cupboard: 'Déplacer le placard',
  volumeHandle: 'Modifier la pente', // see gestureLabel
  dimension: 'Décaler la cote',
  rotate: "Pivoter l'objet",
  resize: "Redimensionner l'objet",
};

const gestureLabel = (plan: Exclude<DragPlan, { kind: 'marquee' }>): string =>
  plan.kind === 'volumeHandle' && plan.target === 'beam' ? 'Modifier la poutre' : GESTURE_LABELS[plan.kind];

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
    case 'slope':
    case 'beam':
      return { kind: 'move', objectIds: idsOf(sel, 'object'), wallIds: idsOf(sel, 'wall'), slopeIds: idsOf(sel, 'slope'), beamIds: idsOf(sel, 'beam') };
    case 'opening':
      return { kind: 'opening', id: item.id };
    case 'cupboard':
      return { kind: 'cupboard', id: item.id };
    case 'dimension':
      return { kind: 'dimension', id: item.id };
    default:
      return null;
  }
}

/** Only objects moved: free delta, wall snapping of a single object, clearances. */
const objectsOnly = (plan: Extract<DragPlan, { kind: 'move' }>): boolean =>
  plan.wallIds.length === 0 && plan.slopeIds.length === 0 && plan.beamIds.length === 0;

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
  if (plan?.kind === 'move' && objectsOnly(plan) && plan.objectIds.length === 1) {
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
 *   merged into the node it is dropped on (mergeNode), or joined to the wall axis it is dropped on
 *   (joinNodeToWall, R30);
 * - an opening slides along the closest hovered wall, else its own wall (moveOpening), with its
 *   clearances; a refused position is drawn in red;
 * - a manual dimension changes its offset (setDimensionOffset);
 * - the handles of a single selected object rotate it (15 degree steps, free with Alt) or resize it
 *   (opposite side fixed, MIN_OBJECT_SIZE minimum).
 * - slopes and beams of the selection move with the objects and walls (moveSlopes / moveBeams, grid
 *   steps); the handles of a single selected slope (ends of its start line, middle of its end line)
 *   or beam (ends) reshape it (dragVolumeHandle);
 * - a cupboard slides along its wall or onto a hovered wall (dragCupboard);
 * - at the release of an object drag, onTop and wall objects are posed (settlePose, spec 5.3).
 * A double-click on an interior dimension of a rectangular room opens the numeric field with its
 * value, the typed value resizes the room (setRoomInteriorSize, right / bottom side moves; a
 * refusal is toasted and the value given back in red); a double-click elsewhere in a room opens
 * the in-place room name input (overlay.rename).
 */
export function createSelectTool(): Tool {
  let session: Session | null = null;
  /**
   * Clearances of the selected element shown with Tab without dragging (and after a typed drag);
   * `typing`: its numeric field is open and a gesture was begun for the typed values.
   */
  let keyboard: { target: MeasureTarget; activeSide: string | null; typing: boolean } | null = null;
  /** Where the typed-distance field was opened (canvas px): reopenings keep it in place. */
  let fieldScreen: Vec2 = { x: 0, y: 0 };
  /** Interior dimension of a rectangular room being edited in the numeric field (spec 6). */
  let roomSize: { levelId: Id; roomKey: string; axis: 'width' | 'depth'; screen: Vec2 } | null = null;

  /** Opens the room size field: the current value selected, or a refused value in red to correct. */
  function openRoomSize(store: EditorStore, text: string, invalid = false): void {
    if (!roomSize) return;
    const label = roomSize.axis === 'width' ? 'Largeur' : 'Profondeur';
    openNumericInput(store, { initial: text, screen: roomSize.screen, kind: 'positive', label, select: !invalid, invalid });
  }

  const clearTransient = (store: EditorStore) =>
    store.getState().setOverlay({ marquee: null, guides: [], dynamicDims: [], activeDimIndex: null, ghost: null });

  /**
   * Escape and onCancel: abandons the press or drag in progress, the gesture with it; commits nothing.
   * Also drops the Tab measure and closes a typed distance field left open by the session.
   */
  const cancelSession = (store: EditorStore) => {
    const s = session;
    const kb = keyboard;
    session = null;
    keyboard = null;
    if (roomSize) {
      roomSize = null;
      closeNumericInput(store);
    }
    if (s?.typing || kb?.typing) closeNumericInput(store);
    if ((s?.phase === 'drag' && s.plan?.kind !== 'marquee') || kb?.typing) store.getState().cancelGesture();
    clearTransient(store);
  };

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
    } else if (plan.kind === 'cupboard') {
      const cb = level.cupboards[plan.id];
      if (!cb || !level.walls[cb.wallId]) return false;
      const f = wallFrame(level, cb.wallId);
      s.grab = { x: dot(sub(s.start.world, f.start), f.dir) - cb.offset, y: 0 };
    } else if (plan.kind === 'resize') {
      const o = level.objects[plan.id];
      if (!o) return false;
      const handle = { x: (plan.sx * o.width) / 2, y: (plan.sy * o.depth) / 2 };
      s.grab = sub(handle, worldToObjectLocal(o, s.start.world));
    }
    st.beginGesture(gestureLabel(plan));
    return true;
  }

  function dragMove(s: Session, plan: Extract<DragPlan, { kind: 'move' }>, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    if (!base) return;
    const st = c.store.getState();
    const raw = sub(e.world, s.start.world);
    const snap = !e.alt;
    const step = st.project?.settings.gridStep ?? 0;
    // walls, slopes and beams move by whole grid steps
    const delta = !objectsOnly(plan) && snap ? { x: roundTo(raw.x, step), y: roundTo(raw.y, step) } : raw;
    const { levelId } = s;
    let recipe: Recipe = (draft) => {
      if (plan.objectIds.length > 0) moveObjects(levelId, plan.objectIds, delta)(draft);
      if (plan.wallIds.length > 0) moveWalls(levelId, plan.wallIds, delta)(draft);
      if (plan.slopeIds.length > 0) moveSlopes(levelId, plan.slopeIds, delta)(draft);
      if (plan.beamIds.length > 0) moveBeams(levelId, plan.beamIds, delta)(draft);
    };
    const single = objectsOnly(plan) && plan.objectIds.length === 1 ? base.objects[plan.objectIds[0]!] : undefined;
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
    // dropped on another node: the preview already shows the merge, so the commit is the merge;
    // on another wall's axis: T junction (R30), ids created here so that the recipe is deterministic
    let ok = sn.kind === 'node' && sn.nodeId !== undefined && st.updateGesture(mergeNode(s.levelId, nodeId, sn.nodeId));
    if (!ok && (sn.kind === 'wallAxis' || sn.kind === 'wallMid') && sn.wallId !== undefined && sn.t !== undefined) {
      ok = st.updateGesture(joinNodeToWall(s.levelId, nodeId, sn.wallId, sn.t, { nodeId: newId(), wallId: newId() }));
    }
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
    // kept on the free stretch the cursor is on, between the nearest wall faces (ruling R29); a
    // stretch too short for the opening (e.g. the cursor over a crossing wall) is refused in red
    const [faceLo, faceHi] = wallFaceInterval(base, wallId, offset);
    const fits = faceHi - faceLo >= o.width;
    if (fits) offset = clamp(offset, faceLo + o.width / 2, faceHi - o.width / 2);
    const ok = fits && st.updateGesture(moveOpening(s.levelId, id, wallId, offset));
    if (!fits) st.setOverlay({ previewInvalid: true });
    const level = levelOf(c.store.getState().project, s.levelId);
    st.setOverlay(
      ok && level
        ? { dynamicDims: openingDims(level, id), ghost: null }
        : { dynamicDims: [], ghost: outline([openingCutRing(base, { ...o, wallId, offset })]) },
    );
  }

  /**
   * A cupboard slides along the wall hovered by the cursor (another wall: set against the face on
   * the cursor side), else along its own wall, kept on the free stretch of its face
   * (fitCupboardOnWall); a stretch too short for it is refused in red.
   */
  function dragCupboard(s: Session, id: Id, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    const cb = base?.cupboards[id];
    if (!base || !cb || !base.walls[cb.wallId]) return;
    const st = c.store.getState();
    const wallId = hoveredWall(base, e.world, SNAP_PX / c.pxPerCm()) ?? cb.wallId;
    const f = wallFrame(base, wallId);
    const v = sub(e.world, f.start);
    const side = wallId === cb.wallId ? cb.side : dot(v, f.normal) >= 0 ? 'left' : 'right';
    const { offset, fits } = fitCupboardOnWall(base, wallId, side, cb.width, dot(v, f.dir) - s.grab.x, e.alt);
    const ok = fits && st.updateGesture(moveCupboard(s.levelId, id, wallId, offset, side));
    if (!fits) st.setOverlay({ previewInvalid: true });
    const ghost: CupboardGhost = { kind: 'volume-cupboard', level: base, cupboard: { ...cb, wallId, offset, side }, valid: false };
    st.setOverlay({ ghost: ok ? null : ghost });
  }

  /**
   * Handles of a slope (ends of the start line, snapped like the slope tool; middle of the end
   * line: depth, 1 cm steps, at least MIN_WALL_LENGTH) and of a beam (ends of its axis, snapped).
   * Alt: free. The dynamic dimension shows the length or the depth.
   */
  function dragVolumeHandle(s: Session, plan: Extract<DragPlan, { kind: 'volumeHandle' }>, e: PointerInfo, c: ToolContext): void {
    const base = baseLevel(s, c.store);
    if (!base) return;
    const st = c.store.getState();
    const delta = sub(e.world, s.start.world);
    const env = { pxPerCm: c.pxPerCm(), gridStep: st.project?.settings.gridStep ?? 0, enabled: !e.alt };
    const item = plan.target === 'slope' ? base.slopes[plan.id] : base.beams[plan.id];
    if (!item) return;
    let dims: DimLine[] = [];
    let guides: Guide[] = [];
    if (plan.role === 'depth' && plan.target === 'slope') {
      const sl = base.slopes[plan.id]!;
      const f = slopeFrame(sl);
      const d = sl.depth + dot(delta, f.normal);
      const depth = Math.max(MIN_WALL_LENGTH, e.alt ? d : Math.round(d));
      st.updateGesture(updateSlope(s.levelId, plan.id, { depth }));
      dims = [slopeDepthDim({ ...sl, depth })];
    } else if (plan.role !== 'depth') {
      const other = plan.role === 'a' ? item.b : item.a;
      const p = snapVolumePoint(base, add(item[plan.role], delta), { ...env, from: other });
      const patch = { [plan.role]: p.point };
      st.updateGesture(plan.target === 'slope' ? updateSlope(s.levelId, plan.id, patch) : updateBeam(s.levelId, plan.id, patch));
      guides = p.guides;
      dims =
        plan.target === 'beam'
          ? [beamLengthDim(other, p.point, base.beams[plan.id]!.width)]
          : [{ a: other, b: p.point, offset: 0, value: dist(other, p.point), kind: 'dynamic' }];
    }
    st.setOverlay({ dynamicDims: dims, guides });
  }

  /**
   * Pose at the end of an object drag (spec 5.3): an 'onTop' object takes the elevation of its
   * support under its center (supportElevation, 0 when none); a single 'wall' object moved alone
   * is set against the nearest wall face (snapToWallForPose; not with Alt). Computed on the
   * preview and appended to the gesture recipe, so that the drag stays one history entry.
   */
  function settlePose(s: Session, plan: Extract<DragPlan, { kind: 'move' }>, e: PointerInfo, c: ToolContext): void {
    const st = c.store.getState();
    const prev = st.gesture?.lastRecipe;
    const level = levelOf(st.project, s.levelId);
    if (!prev || !level || !st.project) return;
    const single = objectsOnly(plan) && plan.objectIds.length === 1;
    const fixes: Recipe[] = [];
    for (const id of plan.objectIds) {
      const o = level.objects[id];
      if (!o) continue;
      if (o.pose === 'onTop') {
        const elevation = supportElevation(level, id, o, st.project.customObjects);
        if (elevation !== o.elevation) fixes.push(updateObject(s.levelId, id, { elevation }));
      } else if (o.pose === 'wall' && single && !e.alt) {
        const t = snapToWallForPose(o, level);
        if (t && (t.x !== o.x || t.y !== o.y || t.rotation !== o.rotation)) fixes.push(setObjectTransform(s.levelId, id, t));
      }
    }
    if (fixes.length === 0) return;
    st.updateGesture((draft) => {
      prev(draft);
      for (const fix of fixes) fix(draft);
    });
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
      case 'cupboard':
        return dragCupboard(s, plan.id, e, c);
      case 'volumeHandle':
        return dragVolumeHandle(s, plan, e, c);
      case 'dimension':
        return dragDimension(s, plan.id, e, c);
      case 'rotate':
        return dragRotate(s, plan.id, e, c);
      case 'resize':
        return dragResize(s, plan, e, c);
    }
  }

  // ----- Tab and typed distances (spec 7.4, rulings R27, R31, R33) -----

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
    if (keyboard.typing) return cancelSession(store); // also drops the open gesture and field
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

  /** What the open typed-distance field applies to: the drag session or the keyboard measure. */
  function typing(): { target: MeasureTarget; holder: { activeSide: string | null } } | null {
    const s = session;
    if (s?.typing) {
      const target = sessionTarget(s);
      return target && { target, holder: s };
    }
    return keyboard?.typing ? { target: keyboard.target, holder: keyboard } : null;
  }

  /**
   * Tab (Shift+Tab backwards) chooses the next clearance of the dragged element, or of the single
   * selected object / opening when nothing is dragged; a digit then opens the numeric field with
   * it (without a drag, a gesture is begun for the typed values). Null: not a key for this (left
   * to the other shortcuts). Any other key, modifiers included, ends the keyboard measure (Escape
   * is used for that).
   */
  function typedKey(e: KeyboardEvent, c: ToolContext): boolean | null {
    const st = c.store.getState();
    const s = session;
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if (!s) endKeyboardMeasure(c.store);
      return null;
    }
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
      else keyboard = { target, activeSide: active, typing: false };
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
      if (s) s.typing = true;
      else {
        st.beginGesture(target.kind === 'opening' ? GESTURE_LABELS.opening : GESTURE_LABELS.move);
        known!.typing = true;
      }
      openField(e.key, c, screen);
      return true; // used: PlanCanvas prevents the default, the digit is not typed twice
    }
    if (!s && keyboard) {
      endKeyboardMeasure(c.store);
      if (e.key === 'Escape') return true;
    }
    return null;
  }

  /**
   * Applies a typed value to the active clearance in the open gesture, measured on what is shown
   * (the preview). False (with a toast) when refused: outside the free stretch of an opening, or
   * refused by the command.
   */
  function applyTyped(t: { target: MeasureTarget; holder: { activeSide: string | null } }, value: number, c: ToolContext): boolean {
    const st = c.store.getState();
    const level = levelOf(st.project, t.target.levelId);
    const side = t.holder.activeSide;
    const placed = level && side !== null ? typedPlacement(level, t.target, side, value) : null;
    if (!placed) return false;
    if (!placed.ok) {
      st.showToast(placed.error);
      return false;
    }
    if (st.updateGesture(placed.recipe)) return true;
    st.showToast(t.target.kind === 'opening' ? ERR_NO_ROOM : 'Position impossible');
    return false;
  }

  /** The dims of what is typed, from the preview, with the active one highlighted. */
  function refreshTyped(t: { target: MeasureTarget; holder: { activeSide: string | null } }, c: ToolContext): string[] {
    const st = c.store.getState();
    const level = levelOf(st.project, t.target.levelId);
    const m = level ? measureTarget(level, t.target) : { dims: [], sides: [] };
    const i = t.holder.activeSide === null ? -1 : m.sides.indexOf(t.holder.activeSide);
    st.setOverlay({ dynamicDims: m.dims, activeDimIndex: i < 0 ? null : i });
    return m.sides;
  }

  /** Opens the typed-distance field at `screen` (canvas px), remembered for reopenings; `invalid`: in red. */
  function openField(text: string, c: ToolContext, screen: Vec2, invalid = false): void {
    fieldScreen = screen;
    openNumericInput(c.store, { initial: text, screen, kind: 'nonNegative', label: TYPED_LABEL, invalid });
  }

  return {
    id: 'select',
    cursor: 'default',

    onPointerDown(e, c) {
      if (e.button !== 0) return;
      if (session?.typing) cancelSession(c.store); // a press while typing abandons the typed operation
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
      };
      session = s;

      const target = handleTarget(st.selection, level);
      const handle = target && hitHandle(target, e.world, px);
      if (target && handle) {
        s.plan = handle.kind === 'rotate' ? { kind: 'rotate', id: target.id } : { kind: 'resize', id: target.id, sx: handle.sx, sy: handle.sy };
        return;
      }
      const vh = hitVolumeHandle(volumeHandles(st.selection, level), e.world, px);
      if (vh) {
        s.plan = { kind: 'volumeHandle', target: vh.target, id: vh.id, role: vh.role };
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
      if (session?.typing) return; // released while typing: the field decides (Enter places, Escape cancels)
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
        if (s.plan.kind === 'move' && s.plan.objectIds.length > 0) settlePose(s, s.plan, e, c);
        c.store.getState().commitGesture();
      }
      clearTransient(c.store);
    },

    onDoubleClick(e, c) {
      session = null;
      const st = c.store.getState();
      const level = activeLevel(st);
      if (!st.project || !level) return;
      const d = deriveLevel(level);
      const dim = roomDimensionAt(level, d, e.world, 1 / c.pxPerCm(), st.display.dimMode);
      if (dim) {
        st.setSelection([{ kind: 'room', id: dim.roomKey }]);
        roomSize = { levelId: level.id, roomKey: dim.roomKey, axis: dim.axis, screen: e.screen };
        openRoomSize(c.store, formatNumber(dim.value));
        return;
      }
      const hit = hitTest(level, d, e.world, c.pxPerCm(), st.project.customObjects);
      const room = hit?.kind === 'room' ? d.rooms.find((r) => r.key === hit.id) : undefined;
      if (!room) return;
      st.setSelection([{ kind: 'room', id: room.key }]);
      st.setOverlay({ rename: { levelId: level.id, label: room.label, labelPoint: room.labelPoint, placeholder: room.name } });
    },

    onKeyDown(e, c) {
      const typed = typedKey(e, c);
      if (typed !== null) return typed;
      if (!session) return false;
      // Escape abandons the press; so do Mod+Z / Mod+Y (a selection rectangle has no gesture that
      // keyboard.ts could cancel: the undo would act on the previous entry)
      if (e.key !== 'Escape' && (session.typing || !undoKeyOf(e))) return false;
      cancelSession(c.store);
      return true;
    },

    onNumericSubmit(value, c) {
      if (roomSize) {
        const r = roomSize;
        const ok = c.store.getState().execute('Dimensions de la pièce', setRoomInteriorSize(r.levelId, r.roomKey, r.axis, value, 'max'));
        // refused: execute toasted the reason; the value comes back in red, to correct or Escape
        if (ok) roomSize = null;
        else openRoomSize(c.store, formatNumber(value), true);
        return;
      }
      const t = typing();
      if (!t) return;
      if (!applyTyped(t, value, c)) {
        // the field was closed by the submit: open it again with the value in red, to correct it
        return openField(formatNumber(value), c, fieldScreen, true);
      }
      const side = t.holder.activeSide;
      session = null;
      c.store.getState().commitGesture();
      keyboard = { target: t.target, activeSide: side, typing: false };
      showKeyboardMeasure(c);
    },

    onNumericTab(value, c, backward) {
      // Tab in the field: the typed value (if any) applies to the active clearance, then the next
      // one (the previous one with Shift+Tab)
      const t = typing();
      if (!t) return;
      // refused: the same field again, with the value in red
      if (value !== null && !applyTyped(t, value, c)) return openField(formatNumber(value), c, fieldScreen, true);
      const sides = refreshTyped(t, c);
      t.holder.activeSide = nextSide(sides, t.holder.activeSide, backward === true);
      refreshTyped(t, c);
      openField('', c, fieldScreen);
    },

    onNumericCancel(c) {
      roomSize = null;
      // Escape (or blur) in the field cancels the whole operation, released or not (ruling R33)
      if (typing()) cancelSession(c.store);
    },

    onCancel(c) {
      cancelSession(c.store);
    },

    onDeactivate(c) {
      session = null;
      keyboard = null;
      roomSize = null;
      clearTransient(c.store);
    },
  };
}

export const selectTool: Tool = createSelectTool();
