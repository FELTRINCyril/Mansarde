import type { Id, Level, Ring, Shape, Vec2 } from '../model/types';
import { difference, unionRings } from './boolean';
import { openingCutRing } from './openings';
import { area } from './polygon';
import { add, angleOf, deg2rad, dist, lineIntersection, normalize, perp, scale, sub } from './vec';

export interface WallFrame {
  start: Vec2;
  end: Vec2;
  dir: Vec2;
  normal: Vec2; // perp(dir) = left side
  length: number;
}

const COLLINEAR_TOLERANCE = deg2rad(1);
const MITER_LIMIT = 4; // max distance from node to miter corner, in half thicknesses
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
  angle: number;
  cw: Vec2; // end point on the -perp(u) side
  ccw: Vec2; // end point on the +perp(u) side
}

interface NodeJunction {
  node: Vec2;
  incidences: Incidence[]; // sorted by angle ascending
}

/** Per-node incident walls with their end points (mitered, square or truncated). */
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
    const make = (n: Vec2, u: Vec2, atStart: boolean): Incidence => ({
      wallId: wall.id,
      atStart,
      u,
      h,
      angle: angleOf(u),
      cw: sub(n, scale(perp(u), h)),
      ccw: add(n, scale(perp(u), h)),
    });
    push(wall.startNodeId, make(f.start, f.dir, true));
    push(wall.endNodeId, make(f.end, scale(f.dir, -1), false));
  }

  const junctions: NodeJunction[] = [];
  for (const [nodeId, list] of byNode) {
    const nodeRec = level.nodes[nodeId]!;
    const node = { x: nodeRec.x, y: nodeRec.y };
    list.sort((p, q) => p.angle - q.angle);
    if (list.length >= 2) {
      // corners are computed from the square points, then assigned
      const corners = list.map((inc, i) => {
        const next = list[(i + 1) % list.length]!;
        let gap = next.angle - inc.angle;
        if (gap <= 0) gap += 2 * Math.PI; // ccw angle from inc to next, in (0, 2pi]
        if (Math.abs(gap - Math.PI) <= COLLINEAR_TOLERANCE) return null;
        const c = lineIntersection(inc.ccw, inc.u, next.cw, next.u);
        if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
        if (dist(c, node) > MITER_LIMIT * Math.max(inc.h, next.h)) return null;
        return c;
      });
      corners.forEach((c, i) => {
        if (!c) return;
        list[i]!.ccw = c;
        list[(i + 1) % list.length]!.cw = c;
      });
    }
    junctions.push({ node, incidences: list });
  }
  return junctions;
}

function outlinesFrom(level: Level, junctions: NodeJunction[]): Map<Id, Ring> {
  const ends = new Map<Id, { start?: Incidence; end?: Incidence }>();
  for (const j of junctions) {
    for (const inc of j.incidences) {
      const e = ends.get(inc.wallId) ?? {};
      if (inc.atStart) e.start = inc;
      else e.end = inc;
      ends.set(inc.wallId, e);
    }
  }
  const out = new Map<Id, Ring>();
  for (const wall of Object.values(level.walls)) {
    const e = ends.get(wall.id);
    if (!e?.start || !e.end) continue; // zero-length wall
    // A_cw and B_ccw lie on the -perp(dir) side, B_cw and A_ccw on the +perp(dir) side
    out.set(wall.id, [e.start.cw, e.end.ccw, e.end.cw, e.start.ccw]);
  }
  return out;
}

/** One polygon per wall (4 points, not closed), mitered at shared nodes. Zero-length walls are skipped. */
export function computeWallOutlines(level: Level): Map<Id, Ring> {
  return outlinesFrom(level, computeJunctions(level));
}

/**
 * Fill polygons at nodes with >= 2 walls. Walking the walls in angular order and taking
 * each wall's cw then ccw end point gives the joint ring of the brief; it is emitted as a
 * fan of triangles around the node (node, p_k, p_k+1). For well-formed junctions the fan
 * covers exactly that ring; when truncated ends of a very acute pair interleave, the ring
 * would self-intersect while the fan still yields the bevel that fills the notch.
 * Degenerate triangles (area < 1e-6) are dropped.
 */
function jointsFrom(junctions: NodeJunction[]): Ring[] {
  const rings: Ring[] = [];
  for (const { node, incidences } of junctions) {
    if (incidences.length < 2) continue;
    const pts = incidences.flatMap((inc) => [inc.cw, inc.ccw]);
    for (let i = 0; i < pts.length; i++) {
      const tri: Ring = [node, pts[i]!, pts[(i + 1) % pts.length]!];
      if (area(tri) >= MIN_RING_AREA) rings.push(tri);
    }
  }
  return rings;
}

export function computeJointPolygons(level: Level): Ring[] {
  return jointsFrom(computeJunctions(level));
}

const usable = (r: Ring): boolean =>
  r.length >= 3 && r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && area(r) >= MIN_RING_AREA;

/** Union of all wall outlines and joints; openings are subtracted when requested. */
export function computeWallShape(level: Level, opts: { withOpenings: boolean }): Shape {
  const junctions = computeJunctions(level);
  const rings = [...outlinesFrom(level, junctions).values(), ...jointsFrom(junctions)].filter(usable);
  const shape = unionRings(rings);
  if (!opts.withOpenings) return shape;
  const cuts = Object.values(level.openings)
    .map((o) => openingCutRing(level, o))
    .filter(usable);
  return difference(shape, cuts);
}
