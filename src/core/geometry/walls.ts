import type { Id, Level, Ring, Shape, Vec2 } from '../model/types';
import { difference, unionRings } from './boolean';
import { openingCutRing } from './openings';
import { area } from './polygon';
import { add, angleOf, cross, deg2rad, dist, dot, lineIntersection, normalize, perp, scale, sub } from './vec';

export interface WallFrame {
  start: Vec2;
  end: Vec2;
  dir: Vec2;
  normal: Vec2; // perp(dir) = left side
  length: number;
}

const COLLINEAR_TOLERANCE = deg2rad(1);
const MIN_MITER_ANGLE = deg2rad(15); // spec 6.1 / ruling R7: sharper corners are truncated
const EPS = 1e-9;
const MIN_RING_AREA = 1e-6;
const DEGENERATE_LENGTH = 1e-9;

/** Frame of a wall from its start node to its end node. Throws if the wall or a node is missing. */
export function wallFrame(level: Level, wallId: Id): WallFrame {
  const wall = level.walls[wallId];
  if (!wall) throw new Error(`wall not found: ${wallId}`);
  const a = level.nodes[wall.startNodeId];
  const b = level.nodes[wall.endNodeId];
  if (!a || !b) throw new Error(`wall ${wallId} references a missing node`);
  const start = { x: a.x, y: a.y };
  const end = { x: b.x, y: b.y };
  const length = dist(start, end);
  const dir = normalize(sub(end, start));
  return { start, end, dir, normal: perp(dir), length };
}

export const wallLength = (level: Level, wallId: Id): number => wallFrame(level, wallId).length;

/** One wall seen from one of its nodes. */
interface Incidence {
  wallId: Id;
  atStart: boolean;
  u: Vec2; // unit direction from the node along the wall
  h: number; // half thickness
  length: number; // wall length
  angle: number;
  sqCw: Vec2; // square end point on the -perp(u) side
  sqCcw: Vec2; // square end point on the +perp(u) side
  cw: Vec2; // outline end point on the -perp(u) side (miter corner or square point)
  ccw: Vec2; // outline end point on the +perp(u) side
}

/** Corner between incidences[i] and incidences[i + 1] (cyclic), on the ccw side of i. */
interface Corner {
  gap: number; // ccw angle from i to i + 1, in (0, 2pi]
  miter: Vec2 | null; // null: square points are kept (collinear, truncated, too short)
}

interface NodeJunction {
  node: Vec2;
  incidences: Incidence[]; // sorted by angle ascending
  corners: Corner[];
}

/**
 * Miter corner between consecutive walls a and b (b is ccw of a), or null to keep square points.
 * Inner corners (gap < 180 deg) must lie ahead of the node on both walls and before the middle
 * of each wall, so that the two ends of a wall never cross (outlines stay simple rings).
 * Outer corners (gap > 180 deg) must lie behind the node on both walls.
 */
function miterCorner(node: Vec2, a: Incidence, b: Incidence, gap: number): Vec2 | null {
  if (Math.abs(gap - Math.PI) <= COLLINEAR_TOLERANCE) return null;
  if (gap < MIN_MITER_ANGLE || gap > 2 * Math.PI - MIN_MITER_ANGLE) return null;
  const c = lineIntersection(a.sqCcw, a.u, b.sqCw, b.u);
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
  const ta = dot(sub(c, node), a.u);
  const tb = dot(sub(c, node), b.u);
  if (gap < Math.PI) {
    if (ta < -EPS || tb < -EPS || ta >= a.length / 2 || tb >= b.length / 2) return null;
  } else if (ta > EPS || tb > EPS) {
    return null;
  }
  return c;
}

/** Per-node incident walls, sorted by angle, with their corners and outline end points. */
function computeJunctions(level: Level): NodeJunction[] {
  const byNode = new Map<Id, Incidence[]>();
  const push = (nodeId: Id, inc: Incidence) => {
    const list = byNode.get(nodeId);
    if (list) list.push(inc);
    else byNode.set(nodeId, [inc]);
  };
  for (const wall of Object.values(level.walls)) {
    const f = wallFrame(level, wall.id);
    if (f.length < DEGENERATE_LENGTH) continue;
    const h = wall.thickness / 2;
    const make = (n: Vec2, u: Vec2, atStart: boolean): Incidence => {
      const sqCw = sub(n, scale(perp(u), h));
      const sqCcw = add(n, scale(perp(u), h));
      return { wallId: wall.id, atStart, u, h, length: f.length, angle: angleOf(u), sqCw, sqCcw, cw: sqCw, ccw: sqCcw };
    };
    push(wall.startNodeId, make(f.start, f.dir, true));
    push(wall.endNodeId, make(f.end, scale(f.dir, -1), false));
  }

  const junctions: NodeJunction[] = [];
  for (const [nodeId, list] of byNode) {
    const nodeRec = level.nodes[nodeId]!;
    const node = { x: nodeRec.x, y: nodeRec.y };
    list.sort((p, q) => p.angle - q.angle);
    const corners: Corner[] = [];
    if (list.length >= 2) {
      list.forEach((a, i) => {
        const b = list[(i + 1) % list.length]!;
        let gap = b.angle - a.angle;
        if (gap <= 0) gap += 2 * Math.PI;
        corners.push({ gap, miter: miterCorner(node, a, b, gap) });
      });
      corners.forEach((c, i) => {
        if (!c.miter) return;
        list[i]!.ccw = c.miter;
        list[(i + 1) % list.length]!.cw = c.miter;
      });
    }
    junctions.push({ node, incidences: list, corners });
  }
  return junctions;
}

/** Drops consecutive duplicates and points lying on the segment between their neighbours. */
function cleanRing(r: Ring): Ring {
  let pts = r.filter((p, i) => dist(p, r[(i + 1) % r.length]!) > 1e-9);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i + pts.length - 1) % pts.length]!;
      const p = pts[i]!;
      const next = pts[(i + 1) % pts.length]!;
      const d1 = sub(p, prev);
      const d2 = sub(next, p);
      if (Math.abs(cross(d1, d2)) <= 1e-9 * Math.max(1, dist(prev, next)) && dot(d1, d2) >= 0) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

function wallEnds(junctions: NodeJunction[]): Map<Id, { start?: Incidence; end?: Incidence }> {
  const ends = new Map<Id, { start?: Incidence; end?: Incidence }>();
  for (const j of junctions) {
    for (const inc of j.incidences) {
      const e = ends.get(inc.wallId) ?? {};
      if (inc.atStart) e.start = inc;
      else e.end = inc;
      ends.set(inc.wallId, e);
    }
  }
  return ends;
}

function outlinesFrom(level: Level, junctions: NodeJunction[]): Map<Id, Ring> {
  const ends = wallEnds(junctions);
  const out = new Map<Id, Ring>();
  for (const wall of Object.values(level.walls)) {
    const e = ends.get(wall.id);
    if (!e?.start || !e.end) continue; // zero-length wall
    const a = level.nodes[wall.startNodeId]!;
    const b = level.nodes[wall.endNodeId]!;
    // A_cw and B_ccw lie on the -perp(dir) side, B_cw and A_ccw on the +perp(dir) side.
    // Each end cap goes through its node, so the outline is the wall's sector of the
    // junction (miter cut on each side independently).
    out.set(
      wall.id,
      cleanRing([e.start.cw, e.end.ccw, { x: b.x, y: b.y }, e.end.cw, e.start.ccw, { x: a.x, y: a.y }]),
    );
  }
  return out;
}

/**
 * One polygon per wall (not closed), mitered at shared nodes; always a simple ring.
 * Zero-length walls are skipped. A corner is mitered only when the angle between the walls
 * is in [15, 345] deg, not within 1 deg of 180, and both walls are long enough for it.
 */
export function computeWallOutlines(level: Level): Map<Id, Ring> {
  return outlinesFrom(level, computeJunctions(level));
}

/** Square-ended rectangle of each wall (the wall body before any junction treatment). */
function bodiesFrom(junctions: NodeJunction[]): Ring[] {
  const out: Ring[] = [];
  for (const e of wallEnds(junctions).values()) {
    if (e.start && e.end) out.push([e.start.sqCw, e.end.sqCcw, e.end.sqCw, e.start.sqCcw]);
  }
  return out;
}

/**
 * Fill polygons at nodes with >= 2 walls, on the outer side (gap > 180 deg) of each
 * junction: the miter wedge (node, square point, miter corner, square point) when the
 * corner is mitered, otherwise the bevel triangle (node, square point, square point).
 * Inner sides need no fill: the wall bodies overlap there. Degenerate rings are dropped.
 */
function jointsFrom(junctions: NodeJunction[]): Ring[] {
  const rings: Ring[] = [];
  for (const { node, incidences, corners } of junctions) {
    corners.forEach((c, i) => {
      if (c.gap <= Math.PI) return;
      const a = incidences[i]!;
      const b = incidences[(i + 1) % incidences.length]!;
      const ring = c.miter ? [node, a.sqCcw, c.miter, b.sqCw] : [node, a.sqCcw, b.sqCw];
      if (area(ring) >= MIN_RING_AREA) rings.push(ring);
    });
  }
  return rings;
}

export function computeJointPolygons(level: Level): Ring[] {
  return jointsFrom(computeJunctions(level));
}

const usable = (r: Ring): boolean =>
  r.length >= 3 && r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && area(r) >= MIN_RING_AREA;

/**
 * Union of the square wall bodies and the outer joint fills (the exact mitered buffer of the
 * wall graph); openings are subtracted when requested. The per-wall outlines are contained in
 * this shape; they are not used to build it because a miter cut between walls of very
 * different thickness can remove part of the thick wall that the thin one does not cover.
 */
export function computeWallShape(level: Level, opts: { withOpenings: boolean }): Shape {
  const junctions = computeJunctions(level);
  const rings = [...bodiesFrom(junctions), ...jointsFrom(junctions)].filter(usable);
  const shape = unionRings(rings);
  if (!opts.withOpenings) return shape;
  const cuts = Object.values(level.openings)
    .map((o) => openingCutRing(level, o))
    .filter(usable);
  return difference(shape, cuts);
}
