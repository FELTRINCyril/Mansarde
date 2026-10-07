import { SNAP_PX } from '../model/defaults';
import type { Id, Level, PlacedObject, Vec2 } from '../model/types';
import { deriveLevel } from './derived';
import { ringEdges } from './polygon';
import {
  add,
  angleOf,
  cross,
  deg2rad,
  dist,
  dot,
  len,
  lerp,
  lineIntersection,
  rad2deg,
  scale,
  sub,
} from './vec';
import { type WallFrame, wallFrame } from './walls';

export type SnapKind = 'node' | 'wallMid' | 'wallAxis' | 'align' | 'angle' | 'ortho' | 'grid' | 'none';
export interface Guide {
  a: Vec2;
  b: Vec2;
}
export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  nodeId?: Id;
  wallId?: Id;
  t?: number; // position along the wall, 0 at its start node, 1 at its end node
  guides: Guide[];
}
export interface SnapOptions {
  level: Level;
  pxPerCm: number;
  gridStep: number;
  enabled: boolean; // false when Alt is held -> kind 'none', raw point
  ortho: boolean; // Shift: constrain to 0/90/180/270 deg from `from`
  from?: Vec2; // previous point (wall drawing)
  excludeNodeIds?: Set<Id>;
  excludeWallIds?: Set<Id>; // walls attached to an excluded node are excluded too
}

const EPS = 1e-9;
const ANGLE_STEP = deg2rad(15);
const PARALLEL_SIN = Math.sin(deg2rad(0.5)); // object snapping: outline edges this close to the axis are faces

interface Ctx {
  nodes: { id: Id; p: Vec2 }[];
  walls: { id: Id; f: WallFrame }[];
  tol: number;
}

function context(o: SnapOptions): Ctx {
  const exNodes = o.excludeNodeIds;
  const nodes = Object.values(o.level.nodes)
    .filter((n) => !exNodes?.has(n.id))
    .map((n) => ({ id: n.id, p: { x: n.x, y: n.y } }));
  const walls = Object.values(o.level.walls)
    .filter((w) => !o.excludeWallIds?.has(w.id) && !exNodes?.has(w.startNodeId) && !exNodes?.has(w.endNodeId))
    .map((w) => ({ id: w.id, f: wallFrame(o.level, w.id) }))
    .filter((w) => w.f.length > EPS);
  return { nodes, walls, tol: SNAP_PX / o.pxPerCm };
}

/** Item with the smallest distance, if that distance is <= tol. */
function nearest<T>(items: T[], distance: (item: T) => number, tol: number): T | null {
  let best: T | null = null;
  let bestD = tol;
  for (const item of items) {
    const d = distance(item);
    if (d <= bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

const midOf = (f: WallFrame): Vec2 => lerp(f.start, f.end, 0.5);
const roundTo = (value: number, step: number): number => (step > 0 ? Math.round(value / step) * step + 0 : value);

function snapNode(p: Vec2, c: Ctx): SnapResult | null {
  const n = nearest(c.nodes, (n) => dist(p, n.p), c.tol);
  return n ? { point: { ...n.p }, kind: 'node', nodeId: n.id, guides: [] } : null;
}

function snapWallMid(p: Vec2, c: Ctx): SnapResult | null {
  const w = nearest(c.walls, (w) => dist(p, midOf(w.f)), c.tol);
  return w ? { point: midOf(w.f), kind: 'wallMid', wallId: w.id, t: 0.5, guides: [] } : null;
}

/** Projection of p on the axis of each wall, strictly between its nodes. */
function snapWallAxis(p: Vec2, c: Ctx): SnapResult | null {
  let best: SnapResult | null = null;
  let bestD = c.tol;
  for (const { id, f } of c.walls) {
    const s = dot(sub(p, f.start), f.dir);
    if (s <= 0 || s >= f.length) continue;
    const point = add(f.start, scale(f.dir, s));
    const d = dist(p, point);
    if (d <= bestD) {
      best = { point, kind: 'wallAxis', wallId: id, t: s / f.length, guides: [] };
      bestD = d;
    }
  }
  return best;
}

/** x and/or y of the nearest aligned nodes, with a guide from each node to the point. */
function snapAlign(p: Vec2, c: Ctx): SnapResult | null {
  const byGap = (gap: (q: Vec2) => number) => {
    const aligned = c.nodes.filter((n) => gap(n.p) <= c.tol);
    if (aligned.length === 0) return null;
    return aligned.reduce((m, n) => {
      const dn = gap(n.p) - gap(m.p);
      return dn < 0 || (dn === 0 && dist(p, n.p) < dist(p, m.p)) ? n : m;
    });
  };
  const nx = byGap((q) => Math.abs(q.x - p.x));
  const ny = byGap((q) => Math.abs(q.y - p.y));
  if (!nx && !ny) return null;
  const point = { x: nx ? nx.p.x : p.x, y: ny ? ny.p.y : p.y };
  const guides = [nx, ny].filter((n) => n !== null).map((n) => ({ a: { ...n.p }, b: point }));
  return { point, kind: 'align', guides };
}

/** Direction from `from` rounded to a multiple of 15 deg, same distance, if p is within tol of that ray. */
function snapAngle(p: Vec2, from: Vec2, c: Ctx): SnapResult | null {
  const v = sub(p, from);
  const d = len(v);
  if (d < EPS) return null;
  const a = angleOf(v);
  const snapped = Math.round(a / ANGLE_STEP) * ANGLE_STEP;
  if (d * Math.abs(Math.sin(a - snapped)) > c.tol) return null;
  const point = add(from, scale({ x: Math.cos(snapped), y: Math.sin(snapped) }, d));
  return { point, kind: 'angle', guides: [{ a: { ...from }, b: point }] };
}

/**
 * Shift held: p is projected on the horizontal or vertical line through `from` (the closer one).
 * Nodes, wall middles and wall axis crossings snap only if they lie within tol of that projected
 * point (so a node off the line by more than tol is never taken); otherwise the coordinate along
 * the line is rounded to the grid.
 */
function snapOrtho(p: Vec2, from: Vec2, gridStep: number, c: Ctx): SnapResult {
  const horizontal = Math.abs(p.x - from.x) >= Math.abs(p.y - from.y);
  const u = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const q = horizontal ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
  const hit = snapNode(q, c) ?? snapWallMid(q, c);
  if (hit) return hit;
  let axis: SnapResult | null = null;
  let bestD = c.tol;
  for (const { id, f } of c.walls) {
    if (Math.abs(cross(u, f.dir)) < EPS) continue; // parallel to the line
    const x = lineIntersection(from, u, f.start, f.dir);
    if (!x) continue;
    const s = dot(sub(x, f.start), f.dir);
    const d = dist(x, q);
    if (s > 0 && s < f.length && d <= bestD) {
      axis = { point: x, kind: 'wallAxis', wallId: id, t: s / f.length, guides: [] };
      bestD = d;
    }
  }
  if (axis) return axis;
  const point = horizontal ? { x: roundTo(q.x, gridStep), y: q.y } : { x: q.x, y: roundTo(q.y, gridStep) };
  return { point, kind: 'ortho', guides: [{ a: { ...from }, b: point }] };
}

/**
 * Magnetic point for the cursor at `raw` (world cm), spec 6.4. Tolerance = SNAP_PX screen pixels.
 * Priority: node > wall middle > wall axis (projection strictly between the nodes) > alignment
 * with the x and/or y of a node > multiple of 15 deg from `from` > grid. With `ortho`, see snapOrtho.
 */
export function snapPoint(raw: Vec2, o: SnapOptions): SnapResult {
  if (!o.enabled) return { point: { ...raw }, kind: 'none', guides: [] };
  const c = context(o);
  if (o.ortho && o.from) return snapOrtho(raw, o.from, o.gridStep, c);
  return (
    snapNode(raw, c) ??
    snapWallMid(raw, c) ??
    snapWallAxis(raw, c) ??
    snapAlign(raw, c) ??
    (o.from ? snapAngle(raw, o.from, c) : null) ?? {
      point: { x: roundTo(raw.x, o.gridStep), y: roundTo(raw.y, o.gridStep) },
      kind: 'grid',
      guides: [],
    }
  );
}

export interface ObjectSnap {
  x: number;
  y: number;
  rotation: number;
  wallId: Id | null;
}

/** Rotation (degrees, [0, 360)) whose local +y axis is the unit vector n. */
function rotationFacing(n: Vec2): number {
  // rotate((0, 1), r) = (-sin r, cos r)
  const deg = rad2deg(Math.atan2(-n.x, n.y));
  const r = ((deg % 360) + 360) % 360;
  return r > 360 - 1e-9 || r < 1e-9 ? 0 : r;
}

/**
 * Pulls an object against a wall face (spec 6.4). A face is an edge of a wall outline parallel to
 * the wall axis; its normal points away from the axis. The object is turned so that its back
 * (local -y) faces the wall; it snaps when its center projects onto the face, lies in front of it,
 * and its back edge is then at most the tolerance away from the face (or already through it).
 * The closest face wins; the snapped center is the foot point on the face + normal * depth / 2.
 */
export function snapObjectToWalls(o: PlacedObject, level: Level, pxPerCm: number): ObjectSnap {
  const tol = SNAP_PX / pxPerCm;
  const center = { x: o.x, y: o.y };
  let best: ObjectSnap | null = null;
  let bestGap = Infinity;
  for (const [wallId, ring] of deriveLevel(level).outlines) {
    const f = wallFrame(level, wallId);
    for (const [a, b] of ringEdges(ring)) {
      const e = sub(b, a);
      const l = len(e);
      if (l < EPS || Math.abs(cross(e, f.dir)) > PARALLEL_SIN * l) continue;
      const side = dot(sub(a, f.start), f.normal);
      if (Math.abs(side) < EPS) continue;
      const normal = scale(f.normal, Math.sign(side));
      const t = dot(sub(center, a), e) / (l * l);
      if (t < 0 || t > 1) continue;
      const foot = add(a, scale(e, t));
      const ahead = dot(sub(center, foot), normal);
      const gap = ahead - o.depth / 2; // back edge to face, negative when the object goes through
      if (ahead <= 0 || gap > tol || Math.abs(gap) >= bestGap) continue;
      const snapped = add(foot, scale(normal, o.depth / 2));
      best = { x: snapped.x, y: snapped.y, rotation: rotationFacing(normal), wallId };
      bestGap = Math.abs(gap);
    }
  }
  return best ?? { x: o.x, y: o.y, rotation: o.rotation, wallId: null };
}
