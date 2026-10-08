import type { WallPoint } from '@/core/commands/walls';
import { snapPoint, type SnapResult } from '@/core/geometry/snap';
import { add, dist, len, normalize, perp, scale, sub } from '@/core/geometry/vec';
import { MIN_WALL_LENGTH } from '@/core/model/defaults';
import type { Id, Level, Vec2, WallNode } from '@/core/model/types';
import {
  DYN_DIM_GAP_PX, EMPTY_DRAW_OVERLAY, formatAngle, screenAngle, thicknessLabel, wallPointOf, type DrawOverlay,
} from './drawing';

/** Everything the wall tool reads from the editor (active level, zoom, project settings). */
export interface WallToolEnv {
  level: Level;
  pxPerCm: number;
  gridStep: number;
  thickness: number; // settings.defaultWallThickness
  partitionThickness: number; // settings.partitionThickness, Ctrl / Cmd held
  height: number; // settings.defaultCeilingHeight
}

/** Shift = orthogonal, Alt = no snapping, meta = Ctrl or Cmd (partition thickness). */
export interface Mods { shift: boolean; alt: boolean; meta: boolean }

export type WallToolEvent =
  | { type: 'move'; world: Vec2; screen: Vec2; mods: Mods }
  | { type: 'click'; world: Vec2; screen: Vec2; mods: Mods }
  | { type: 'finish' } // double-click or Enter
  | { type: 'escape' }
  | { type: 'digit'; key: string }
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
      mods: Mods;
      partition: boolean; // Ctrl / Cmd held at the last pointer event
      typingDir: Vec2 | null; // unit direction frozen while the numeric field is open
      lastClick: Vec2 | null; // screen position of the click that added the last point
    };

export interface WallToolResult { state: WallToolState; effects: WallToolEffect[] }

export const WALL_IDLE: WallToolState = { phase: 'idle', hover: null };

/** A second click this close (screen px) to the previous one adds nothing (double-click). */
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

function finish(s: Drawing, env: WallToolEnv, points: ChainPoint[] = s.points): WallToolResult {
  const state: WallToolState = { phase: 'idle', hover: null };
  if (points.length < 2) return { state, effects: [] };
  const thickness = s.partition ? env.partitionThickness : env.thickness;
  return {
    state,
    effects: [{ type: 'commit', levelId: s.levelId, points: points.map((p) => p.wp), thickness, height: env.height }],
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

/** Direction of the preview segment; else the last segment's; else +x. */
function currentDir(s: Drawing): Vec2 {
  const last = lastOf(s).at;
  if (s.hover) {
    const v = sub(s.hover.point, last);
    if (len(v) > EPS) return normalize(v);
  }
  if (s.points.length >= 2) return normalize(sub(last, s.points[s.points.length - 2]!.at));
  return { x: 1, y: 0 };
}

/**
 * The wall tool as a pure state machine (spec 7.3, 7.4, rulings R11, R16):
 * - idle: the cursor shows its snapped point (snapPoint without `from`); a click starts a chain;
 * - drawing: the cursor snaps from the last point (Shift = ortho, Alt = free), also on the chain's
 *   own points; a click adds a point (zero-length clicks and the second click of a double-click are
 *   ignored); a click on the first point closes the chain and finishes; finish (double-click,
 *   Enter) and Escape commit the chain when it has at least 2 points, Escape cancels a lone point;
 * - a digit opens the numeric field with the preview direction frozen; the typed length adds the
 *   point last + direction * value (closing the chain if it lands on the first point).
 * Committing is one addWallChain effect, with the partition thickness when Ctrl / Cmd was held.
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
      return { state: { ...s, hover, raw: event.world, screen: event.screen, mods: event.mods, partition: event.mods.meta }, effects: [] };
    }
    case 'click': {
      const cur: Drawing = { ...s, raw: event.world, screen: event.screen, mods: event.mods, partition: event.mods.meta, typingDir: null };
      if (s.lastClick && dist(event.screen, s.lastClick) <= SAME_CLICK_PX) return { state: cur, effects: [] };
      const sn = snapDrawing(cur, event.world, event.mods, env);
      const { cp, closes } = chainPointOf(cur, sn);
      return addPoint({ ...cur, hover: sn }, cp, closes, env, event.screen);
    }
    case 'finish':
    case 'escape':
      return finish(s, env);
    case 'digit':
      if (s.typingDir) return same;
      return { state: { ...s, typingDir: currentDir(s) }, effects: [{ type: 'openNumeric', initial: event.key, screen: s.screen }] };
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

/** Unit vector ahead of a segment of direction v and on the +perp side (the dimension is on the other). */
const labelToward = (v: Vec2): Vec2 => {
  const u = normalize(v);
  return normalize(add(u, perp(u)));
};

/**
 * Overlay of the wall tool: the snapped cursor marker and its guides; while drawing, the chain and
 * the preview segment stroked with the wall thickness, the segment's length as a dynamic dimension
 * and a label with its angle and the thickness in use.
 */
export function wallToolOverlay(s: WallToolState, env: WallToolEnv): DrawOverlay {
  const hover = s.hover;
  const marker = hover ? { at: hover.point, snap: hover.kind } : null;
  if (s.phase === 'idle') {
    if (!hover) return EMPTY_DRAW_OVERLAY;
    return { ...EMPTY_DRAW_OVERLAY, guides: hover.guides, ghost: { kind: 'draw', paths: [], marker, label: null } };
  }
  const thickness = s.partition ? env.partitionThickness : env.thickness;
  const pts = s.points.map((p) => p.at);
  const last = pts[pts.length - 1]!;
  const end = hover && dist(hover.point, last) > EPS ? hover.point : null;
  const what = thicknessLabel(thickness, s.partition);
  return {
    guides: hover?.guides ?? [],
    dynamicDims: end
      ? [{ a: last, b: end, offset: -(thickness / 2 + DYN_DIM_GAP_PX / env.pxPerCm), value: dist(last, end), kind: 'dynamic' }]
      : [],
    activeDimIndex: null,
    ghost: {
      kind: 'draw',
      paths: [{ points: end ? [...pts, end] : pts, closed: false, thickness }],
      marker,
      // the label goes ahead of the segment, on the side opposite to its dimension
      label: end
        ? { at: end, lines: [formatAngle(screenAngle(sub(end, last))), what], toward: labelToward(sub(end, last)) }
        : { at: last, lines: [what] },
    },
  };
}
