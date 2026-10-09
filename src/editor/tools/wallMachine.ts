import type { WallPoint } from '@/core/commands/walls';
import { offsetChain } from '@/core/geometry/offsetChain';
import { snapPoint, type SnapResult } from '@/core/geometry/snap';
import { add, cross, dist, dot, lineIntersection, normalize, perp, scale, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { MIN_WALL_LENGTH } from '@/core/model/defaults';
import type { Id, Level, Vec2, WallNode } from '@/core/model/types';
import { SNAP_PX } from '@/core/model/defaults';
import type { WallReference } from '../store';
import {
  DYN_DIM_GAP_PX, EMPTY_DRAW_OVERLAY, fieldScreen, formatAngle, screenAngle, thicknessLabel, wallPointOf,
  type DrawOverlay, type Mods, type WallToolEnv,
} from './drawing';

export type { Mods, WallToolEnv } from './drawing';

export type WallToolEvent =
  | { type: 'move'; world: Vec2; screen: Vec2; mods: Mods }
  | { type: 'click'; world: Vec2; screen: Vec2; mods: Mods; detail?: number } // detail: DOM click count
  | { type: 'finish'; meta?: boolean } // double-click or Enter (meta: Ctrl / Cmd held)
  | { type: 'escape'; meta?: boolean }
  | { type: 'digit'; key: string; meta?: boolean }
  | { type: 'undoPoint' } // Mod+Z while drawing (ruling R32)
  | { type: 'numericSubmit'; value: number }
  | { type: 'numericCancel' };

export type WallToolEffect =
  | { type: 'commit'; levelId: Id; points: WallPoint[]; thickness: number; height: number }
  | { type: 'openNumeric'; initial: string; screen: Vec2 };

/** A clicked point: what addWallChain gets, and where it is (world cm). */
export interface ChainPoint { wp: WallPoint; at: Vec2 }

export type WallToolState =
  | { phase: 'idle'; hover: SnapResult | null }
  | {
      phase: 'drawing';
      levelId: Id;
      points: ChainPoint[]; // at least one
      hover: SnapResult | null; // snapped cursor, from the last point
      raw: Vec2; // last raw cursor (world), to re-snap after a typed length
      screen: Vec2; // last cursor position on the canvas (px), where the numeric field opens
      mods: Mods; // modifiers at the last pointer event (mods.meta previews the partition thickness)
      partition: boolean; // frozen: a click or key of the chain was made with Ctrl / Cmd
      typingDir: Vec2 | null; // unit direction frozen while the numeric field is open
      lastClick: Vec2 | null; // screen position of the click that added the last point
    };

export interface WallToolResult { state: WallToolState; effects: WallToolEffect[] }

export const WALL_IDLE: WallToolState = { phase: 'idle', hover: null };

/**
 * A second click this close (screen px) to the previous one adds nothing (double-click). Kept next
 * to the click count (detail >= 2), which Chromium leaves at 0 on pointerdown.
 */
export const SAME_CLICK_PX = 3;
/** A typed point this close to the first point closes the chain (addWallChain reuses nodes within 0.5 cm). */
const CLOSE_DISTANCE = 0.5;
const EPS = 1e-9;
const VIRTUAL_PREFIX = '__chain_';

type Drawing = Extract<WallToolState, { phase: 'drawing' }>;

const lastOf = (s: Drawing): ChainPoint => s.points[s.points.length - 1]!;

/**
 * The level as seen by the snapping while drawing: the chain points that are not existing nodes
 * are added as virtual nodes, so that the cursor snaps to them (closing the loop on the first
 * point) and aligns with them.
 */
function chainLevel(level: Level, points: ChainPoint[]): Level {
  const extra: Record<Id, WallNode> = {};
  points.forEach((p, i) => {
    if (p.wp.kind === 'node') return;
    const id = `${VIRTUAL_PREFIX}${i}`;
    extra[id] = { id, x: p.at.x, y: p.at.y };
  });
  return { ...level, nodes: { ...level.nodes, ...extra } };
}

function snapIdle(world: Vec2, mods: Mods, env: WallToolEnv): SnapResult {
  return snapPoint(world, { level: env.level, pxPerCm: env.pxPerCm, gridStep: env.gridStep, enabled: !mods.alt, ortho: false });
}

function snapDrawing(s: Drawing, world: Vec2, mods: Mods, env: WallToolEnv): SnapResult {
  if (mods.alt) {
    // no snapping, except on the first point within the tolerance: Alt does not prevent closing
    const first = s.points[0]!;
    if (s.points.length >= 2 && dist(world, first.at) <= SNAP_PX / env.pxPerCm) {
      const nodeId = first.wp.kind === 'node' ? first.wp.nodeId : `${VIRTUAL_PREFIX}0`;
      return { point: { ...first.at }, kind: 'node', nodeId, guides: [] };
    }
  }
  return snapPoint(world, {
    level: chainLevel(env.level, s.points),
    pxPerCm: env.pxPerCm,
    gridStep: env.gridStep,
    enabled: !mods.alt,
    ortho: mods.shift,
    from: lastOf(s).at,
  });
}

/** The chain point a snap result stands for, and whether it closes the chain on its first point. */
function chainPointOf(s: Drawing, sn: SnapResult): { cp: ChainPoint; closes: boolean } {
  const first = s.points[0]!;
  const id = sn.nodeId;
  if (sn.kind === 'node' && id?.startsWith(VIRTUAL_PREFIX)) {
    const index = Number(id.slice(VIRTUAL_PREFIX.length));
    const target = s.points[index]!;
    // the node of a free or onWall point does not exist yet: a free point at the same place reuses it
    return { cp: { wp: { kind: 'free', x: target.at.x, y: target.at.y }, at: target.at }, closes: index === 0 };
  }
  const closes = sn.kind === 'node' && first.wp.kind === 'node' && first.wp.nodeId === id;
  return { cp: { wp: wallPointOf(sn), at: { ...sn.point } }, closes };
}

/**
 * Offset (cm, along +perp of each segment) from the clicked line to the wall axes (spec 6): 0 for
 * the axis; the clicked line is the left face (+perp side) of the walls for 'left', so their axes
 * are thickness / 2 on the -perp side, and the opposite for 'right'.
 */
export function referenceOffset(reference: WallReference | undefined, thickness: number): number {
  return reference === 'left' ? -thickness / 2 : reference === 'right' ? thickness / 2 : 0;
}

/** A chain whose last point is its first one (at least a triangle): offset as a closed loop. */
const isClosedChain = (at: Vec2[]): boolean => at.length >= 4 && dist(at[0]!, at[at.length - 1]!) <= EPS;

/** The wall axes of a clicked line: offsetChain of the points (closed loops mitered all round). */
function axisPoints(at: Vec2[], offset: number): Vec2[] {
  return offset === 0 ? at : offsetChain(at, offset, isClosedChain(at));
}

/** An end moved closer than this (cm) to a node of the wall it lands on takes that node. */
const JOIN_NODE_DISTANCE = MIN_WALL_LENGTH;
/** How far (in |offset|) an end may slide along its segment line to reach a wall axis (as the miter limit). */
const JOIN_SLIDE_LIMIT = 4;

/**
 * Ruling V2-R21: the end `p` of an offset open chain whose clicked point snapped to an existing
 * node or wall (`wp`) stays connected. `p` slides along its segment line (direction from `q`, the
 * neighbouring offset point) to the axis of the snapped wall, or of a wall of the snapped node,
 * the most perpendicular one first: inside that wall it becomes an onWall point (T junction),
 * near one of its nodes that node; past the snapped node, on the extension of that wall, the end
 * is joined to the node by a short collinear wall. Without such a crossing, a node end is joined
 * to the node by a short wall (the offset itself). Returns the points from the existing structure
 * outwards, or null to keep the plain free point (free click, or a wall crossed nowhere near).
 */
function joinEnd(level: Level, wp: WallPoint, p: Vec2, q: Vec2, offset: number): WallPoint[] | null {
  if (wp.kind === 'free') return null;
  const d = normalize(sub(p, q));
  const nodeId = wp.kind === 'node' ? wp.nodeId : null;
  const node = nodeId !== null ? level.nodes[nodeId] : undefined;
  if (nodeId !== null && !node) return null;
  if (node && Math.abs(cross(sub(node, p), d)) <= JOIN_NODE_DISTANCE) return [{ kind: 'node', nodeId: nodeId! }];
  const wallIds =
    wp.kind === 'onWall'
      ? level.walls[wp.wallId] ? [wp.wallId] : []
      : Object.values(level.walls).filter((w) => w.startNodeId === nodeId || w.endNodeId === nodeId).map((w) => w.id);
  let best: { points: WallPoint[]; rank: number; sin: number } | null = null;
  for (const id of wallIds) {
    const f = wallFrame(level, id);
    const x = lineIntersection(p, d, f.start, f.dir);
    if (!x || dist(x, p) > JOIN_SLIDE_LIMIT * Math.abs(offset)) continue;
    const s = dot(sub(x, f.start), f.dir);
    const wall = level.walls[id]!;
    let points: WallPoint[] | null = null;
    let rank = 0;
    if (dist(x, f.start) < JOIN_NODE_DISTANCE) points = [{ kind: 'node', nodeId: wall.startNodeId }];
    else if (dist(x, f.end) < JOIN_NODE_DISTANCE) points = [{ kind: 'node', nodeId: wall.endNodeId }];
    else if (s > 0 && s < f.length) points = [{ kind: 'onWall', wallId: id, t: s / f.length }];
    else if (nodeId !== null && ((s < 0 && wall.startNodeId === nodeId) || (s > f.length && wall.endNodeId === nodeId))) {
      points = [{ kind: 'node', nodeId }, { kind: 'free', x: x.x, y: x.y }];
      rank = 1;
    }
    if (!points) continue;
    const sin = Math.abs(cross(d, f.dir));
    if (!best || rank < best.rank || (rank === best.rank && sin > best.sin)) best = { points, rank, sin };
  }
  if (best) return best.points;
  return nodeId !== null ? [{ kind: 'node', nodeId }, { kind: 'free', x: p.x, y: p.y }] : null;
}

/**
 * What addWallChain gets for the clicked points: the points as clicked (nodes, wall axes) for the
 * axis reference; otherwise the line offset to the wall axes (offsetChain may add bevel points:
 * its output is not matched to the clicks one to one), as free points, except the two ends of an
 * open chain whose click snapped to an existing node or wall: they stay connected (joinEnd,
 * ruling V2-R21). addWallChain then reuses nodes within 0.5 cm and splits the walls whose axis a
 * free point lies on, as for any free point.
 */
function committedPoints(points: ChainPoint[], env: WallToolEnv, thickness: number): WallPoint[] {
  const offset = referenceOffset(env.reference, thickness);
  if (offset === 0) return points.map((p) => p.wp);
  const at = points.map((p) => p.at);
  const out = axisPoints(at, offset);
  const free = (p: Vec2): WallPoint => ({ kind: 'free', x: p.x, y: p.y });
  if (isClosedChain(at) || out.length < 2) return out.map(free);
  const n = out.length;
  const head = joinEnd(env.level, points[0]!.wp, out[0]!, out[1]!, offset) ?? [free(out[0]!)];
  const tail = joinEnd(env.level, points[points.length - 1]!.wp, out[n - 1]!, out[n - 2]!, offset) ?? [free(out[n - 1]!)];
  return [...head, ...out.slice(1, -1).map(free), ...tail.reverse()];
}

function finish(s: Drawing, env: WallToolEnv, points: ChainPoint[] = s.points, meta = false): WallToolResult {
  const state: WallToolState = { phase: 'idle', hover: null };
  if (points.length < 2) return { state, effects: [] };
  const thickness = s.partition || meta ? env.partitionThickness : env.thickness;
  return {
    state,
    effects: [{ type: 'commit', levelId: s.levelId, points: committedPoints(points, env, thickness), thickness, height: env.height }],
  };
}

/** Appends a point (ignored when it would make a zero-length segment); a closing point also finishes. */
function addPoint(s: Drawing, cp: ChainPoint, closes: boolean, env: WallToolEnv, lastClick: Vec2 | null): WallToolResult {
  if (!(dist(cp.at, lastOf(s).at) >= MIN_WALL_LENGTH)) return { state: s, effects: [] };
  const points = [...s.points, cp];
  if (closes) return finish(s, env, points);
  const next: Drawing = { ...s, points, lastClick, typingDir: null };
  return { state: { ...next, hover: snapDrawing(next, s.raw, s.mods, env) }, effects: [] };
}

/** End of the preview segment (the snapped cursor), or null when it is on the last point. */
function previewEnd(s: Drawing): Vec2 | null {
  return s.hover && dist(s.hover.point, lastOf(s).at) > EPS ? s.hover.point : null;
}

/** Direction of the preview segment; else the last segment's; else +x. */
function currentDir(s: Drawing): Vec2 {
  const last = lastOf(s).at;
  const end = previewEnd(s);
  if (end) return normalize(sub(end, last));
  if (s.points.length >= 2) return normalize(sub(last, s.points[s.points.length - 2]!.at));
  return { x: 1, y: 0 };
}

/** Unit vector ahead of a segment of direction v and on the +perp side (the dimension is on the other). */
function labelToward(v: Vec2): Vec2 {
  const u = normalize(v);
  return normalize(add(u, perp(u)));
}

/**
 * The wall tool as a pure state machine (spec 7.3, 7.4, rulings R11, R16, R32):
 * - idle: the cursor shows its snapped point (snapPoint without `from`); a click starts a chain;
 * - drawing: the cursor snaps from the last point (Shift = ortho, Alt = free except on the first
 *   point), also on the chain's own points; a click adds a point (zero-length clicks and the second
 *   click of a double-click are ignored); a click on the first point closes the chain and finishes;
 *   finish (double-click, Enter) and Escape commit the chain when it has at least 2 points, Escape
 *   cancels a lone point; Mod+Z removes the last point (the chain when it is the only one);
 * - a digit opens the numeric field with the preview direction frozen; the typed length adds the
 *   point last + direction * value (closing the chain if it lands on the first point).
 * Committing is one addWallChain effect, the clicked line being offset to the wall axes first
 * according to env.reference (spec 6, see referenceOffset). The partition thickness is frozen for
 * the chain by the first click or key made with Ctrl / Cmd (a held modifier only previews it).
 */
export function reduceWallTool(state: WallToolState, event: WallToolEvent, env: WallToolEnv): WallToolResult {
  // the active level changed under the chain: drop it
  const s: WallToolState = state.phase === 'drawing' && state.levelId !== env.level.id ? WALL_IDLE : state;
  const same = { state: s, effects: [] };

  if (s.phase === 'idle') {
    switch (event.type) {
      case 'move':
        return { state: { phase: 'idle', hover: snapIdle(event.world, event.mods, env) }, effects: [] };
      case 'click': {
        const sn = snapIdle(event.world, event.mods, env);
        const drawing: Drawing = {
          phase: 'drawing',
          levelId: env.level.id,
          points: [{ wp: wallPointOf(sn), at: { ...sn.point } }],
          hover: null,
          raw: event.world,
          screen: event.screen,
          mods: event.mods,
          partition: event.mods.meta,
          typingDir: null,
          lastClick: event.screen,
        };
        return { state: { ...drawing, hover: snapDrawing(drawing, event.world, event.mods, env) }, effects: [] };
      }
      default:
        return same;
    }
  }

  switch (event.type) {
    case 'move': {
      if (s.typingDir) return same; // the preview stays frozen while a length is typed
      const hover = snapDrawing(s, event.world, event.mods, env);
      return { state: { ...s, hover, raw: event.world, screen: event.screen, mods: event.mods }, effects: [] };
    }
    case 'click': {
      const cur: Drawing = {
        ...s, raw: event.world, screen: event.screen, mods: event.mods, partition: s.partition || event.mods.meta, typingDir: null,
      };
      const repeated = (event.detail ?? 1) >= 2 || (s.lastClick !== null && dist(event.screen, s.lastClick) <= SAME_CLICK_PX);
      if (repeated) return { state: cur, effects: [] };
      const sn = snapDrawing(cur, event.world, event.mods, env);
      const { cp, closes } = chainPointOf(cur, sn);
      return addPoint({ ...cur, hover: sn }, cp, closes, env, event.screen);
    }
    case 'finish':
    case 'escape':
      return finish(s, env, s.points, event.meta);
    case 'digit': {
      if (s.typingDir) return same;
      const end = previewEnd(s);
      const toward = end ? labelToward(sub(end, lastOf(s).at)) : undefined;
      return {
        state: { ...s, typingDir: currentDir(s), partition: s.partition || !!event.meta },
        effects: [{ type: 'openNumeric', initial: event.key, screen: fieldScreen(s.screen, toward) }],
      };
    }
    case 'undoPoint': {
      if (s.points.length <= 1) return { state: WALL_IDLE, effects: [] };
      const back: Drawing = { ...s, points: s.points.slice(0, -1), typingDir: null, lastClick: null };
      return { state: { ...back, hover: snapDrawing(back, s.raw, s.mods, env) }, effects: [] };
    }
    case 'numericSubmit': {
      if (!s.typingDir) return same;
      const cur: Drawing = { ...s, typingDir: null };
      if (!(event.value >= MIN_WALL_LENGTH)) return { state: cur, effects: [] };
      const at = add(lastOf(s).at, scale(s.typingDir, event.value));
      const first = s.points[0]!;
      const closes = s.points.length >= 2 && dist(at, first.at) < CLOSE_DISTANCE;
      const cp: ChainPoint = closes
        ? { wp: first.wp.kind === 'node' ? first.wp : { kind: 'free', x: first.at.x, y: first.at.y }, at: first.at }
        : { wp: { kind: 'free', x: at.x, y: at.y }, at };
      return addPoint(cur, cp, closes, env, null);
    }
    case 'numericCancel':
      return { state: { ...s, typingDir: null }, effects: [] };
  }
}

/**
 * The addWallChain the tool would commit if the chain were finished on the previewed point (or
 * as it is, without a preview segment): used to show a preview that would be refused in red.
 * Null while idle or with fewer than 2 points.
 */
export function pendingChain(s: WallToolState, env: WallToolEnv): Extract<WallToolEffect, { type: 'commit' }> | null {
  if (s.phase !== 'drawing') return null;
  const points = s.hover && previewEnd(s) ? [...s.points, chainPointOf(s, s.hover).cp] : s.points;
  if (points.length < 2) return null;
  const thickness = s.partition || s.mods.meta ? env.partitionThickness : env.thickness;
  return { type: 'commit', levelId: s.levelId, points: committedPoints(points, env, thickness), thickness, height: env.height };
}

export const REFERENCE_LABELS: Record<WallReference, string> = { axis: 'Axe', left: 'Face gauche', right: 'Face droite' };

/**
 * Overlay of the wall tool: the snapped cursor marker and its guides; while drawing, the chain and
 * the preview segment stroked with the wall thickness, the segment's length as a dynamic dimension
 * and a label with its angle and the thickness in use. With a face reference (spec 6), the walls
 * are drawn on their offset axes, the clicked line dashed, the dimension (of the clicked line)
 * beyond the walls, and the label names the face.
 */
export function wallToolOverlay(s: WallToolState, env: WallToolEnv): DrawOverlay {
  const hover = s.hover;
  const marker = hover ? { at: hover.point, snap: hover.kind } : null;
  if (s.phase === 'idle') {
    if (!hover) return EMPTY_DRAW_OVERLAY;
    return { ...EMPTY_DRAW_OVERLAY, guides: hover.guides, ghost: { kind: 'draw', paths: [], marker, label: null } };
  }
  const partition = s.partition || s.mods.meta;
  const thickness = partition ? env.partitionThickness : env.thickness;
  const pts = s.points.map((p) => p.at);
  const last = pts[pts.length - 1]!;
  const end = previewEnd(s);
  const what = thicknessLabel(thickness, partition);
  const line = end ? [...pts, end] : pts;
  const offset = referenceOffset(env.reference, thickness);
  // distance from the clicked line to the wall face on the -perp side, where the dimension goes
  const faceBelow = thickness / 2 - offset;
  const lines = offset === 0 ? [what] : [what, REFERENCE_LABELS[env.reference!]];
  return {
    guides: hover?.guides ?? [],
    dynamicDims: end
      ? [{ a: last, b: end, offset: -(faceBelow + DYN_DIM_GAP_PX / env.pxPerCm), value: dist(last, end), kind: 'dynamic' }]
      : [],
    activeDimIndex: null,
    ghost: {
      kind: 'draw',
      paths:
        offset === 0
          ? [{ points: line, closed: false, thickness }]
          : [
              { points: axisPoints(line, offset), closed: false, thickness, axis: false },
              { points: line, closed: false, thickness: 0 },
            ],
      marker,
      // the label goes ahead of the segment, on the side opposite to its dimension
      label: end
        ? { at: end, lines: [formatAngle(screenAngle(sub(end, last))), ...lines], toward: labelToward(sub(end, last)) }
        : { at: last, lines },
    },
  };
}
