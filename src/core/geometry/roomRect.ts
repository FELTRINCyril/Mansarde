import type { Id, Level, Ring, Vec2 } from '../model/types';
import type { DerivedLevel } from './derived';
import type { Room } from './rooms';
import { add, cross, deg2rad, dist, dot, normalize, perp, scale, sub } from './vec';
import { wallFrame } from './walls';

/**
 * A rectangular room (spec 6). Each room edge (0..3, in ring order) lies on the faces of one or
 * more collinear walls (ruling V2-R7: a side split by T junctions of neighbouring rooms); `faces`
 * has one entry per wall and edge, `side` being the face of the wall the room stands against
 * (left = +perp(wall direction)) and a, b the part of the room edge on that wall. axisU is the
 * edge direction closest to the world +x, axisV = perp(axisU) (screen down for an axis-aligned
 * room); width and depth are the interior extents along axisU and axisV, center the middle of
 * the rectangle. Moving the 'max' face means moving the right / bottom side in that frame.
 */
export interface RectRoom {
  room: Room;
  faces: Array<{ wallId: Id; side: 'left' | 'right'; a: Vec2; b: Vec2; edge: number }>;
  width: number;
  depth: number;
  axisU: Vec2;
  axisV: Vec2;
  center: Vec2;
}

const ANGLE_TOLERANCE = deg2rad(1);
const SIN_TOLERANCE = Math.sin(ANGLE_TOLERANCE);
/** A room corner within this distance (cm) of a wall face line lies on that face. */
const FACE_TOLERANCE = 0.05;
const SAME_POINT = 1e-9;

/** The ring without duplicate points and without vertices where it goes straight on (within 1 deg). */
function corners(ring: Ring): Ring {
  let pts = ring.filter((p, i) => dist(p, ring[(i + 1) % ring.length]!) > SAME_POINT);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const d1 = normalize(sub(pts[i]!, pts[(i + pts.length - 1) % pts.length]!));
      const d2 = normalize(sub(pts[(i + 1) % pts.length]!, pts[i]!));
      if (Math.abs(cross(d1, d2)) <= SIN_TOLERANCE && dot(d1, d2) > 0) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/**
 * The walls whose faces carry the room edge [a, b] together: parallel to the edge (1 deg), the
 * edge line at thickness / 2 from the axis, the room (inner point `inside`) beyond that face, and
 * the projections of their axes on the edge covering it without gaps. Null when they do not cover
 * the whole edge.
 */
function edgeFaces(level: Level, a: Vec2, b: Vec2, inside: Vec2): Array<{ wallId: Id; side: 'left' | 'right'; a: Vec2; b: Vec2 }> | null {
  const length = dist(a, b);
  const e = normalize(sub(b, a));
  const parts: Array<{ wallId: Id; side: 'left' | 'right'; lo: number; hi: number }> = [];
  for (const wall of Object.values(level.walls)) {
    const f = wallFrame(level, wall.id);
    if (f.length <= 0 || Math.abs(cross(f.dir, e)) > SIN_TOLERANCE) continue;
    const h = wall.thickness / 2;
    const offA = dot(sub(a, f.start), f.normal);
    const offB = dot(sub(b, f.start), f.normal);
    const sign = offA > 0 ? 1 : -1;
    if (Math.abs(offA - sign * h) > FACE_TOLERANCE || Math.abs(offB - sign * h) > FACE_TOLERANCE) continue;
    if (sign * dot(sub(inside, f.start), f.normal) <= h) continue;
    const ts = [dot(sub(f.start, a), e), dot(sub(f.end, a), e)];
    const lo = Math.max(0, Math.min(...ts));
    const hi = Math.min(length, Math.max(...ts));
    if (hi - lo <= FACE_TOLERANCE) continue;
    parts.push({ wallId: wall.id, side: sign > 0 ? 'left' : 'right', lo, hi });
  }
  parts.sort((p, q) => p.lo - q.lo);
  let covered = 0;
  for (const p of parts) {
    if (p.lo > covered + FACE_TOLERANCE) return null;
    covered = Math.max(covered, p.hi);
  }
  if (covered < length - FACE_TOLERANCE) return null;
  return parts.map((p) => ({ wallId: p.wallId, side: p.side, a: add(a, scale(e, p.lo)), b: add(a, scale(e, p.hi)) }));
}

/**
 * The room `roomKey` of the derived level if it is a rectangle: four edges at right angles
 * (1 deg tolerance), each one covered by the faces of one or more collinear walls. Null
 * otherwise (unknown key, other shape, an edge not entirely on wall faces).
 */
export function rectangularRoom(level: Level, d: DerivedLevel, roomKey: string): RectRoom | null {
  const room = d.rooms.find((r) => r.key === roomKey);
  if (!room) return null;
  const ring = corners(room.ring);
  if (ring.length !== 4) return null;

  const edges = ring.map((p, i) => [p, ring[(i + 1) % 4]!] as const);
  const dirs = edges.map(([p, q]) => normalize(sub(q, p)));
  for (let i = 0; i < 4; i++) {
    if (Math.abs(dot(dirs[i]!, dirs[(i + 1) % 4]!)) > SIN_TOLERANCE) return null;
  }

  // the edge direction closest to +x (ties: the one pointing up on screen), deterministic
  const candidates = [dirs[0]!, dirs[1]!].flatMap((u) => [u, { x: -u.x, y: -u.y }]);
  const axisU = candidates.reduce((best, u) => (u.x > best.x + 1e-12 || (Math.abs(u.x - best.x) <= 1e-12 && u.y < best.y) ? u : best));
  const axisV = perp(axisU);
  const range = (axis: Vec2): [number, number] => {
    const values = ring.map((p) => dot(p, axis));
    return [Math.min(...values), Math.max(...values)];
  };
  const [u0, u1] = range(axisU);
  const [v0, v1] = range(axisV);
  const center = add(scale(axisU, (u0 + u1) / 2), scale(axisV, (v0 + v1) / 2));

  const faces: RectRoom['faces'] = [];
  for (const [i, [a, b]] of edges.entries()) {
    const found = edgeFaces(level, a, b, center);
    if (!found) return null;
    for (const f of found) faces.push({ ...f, edge: i });
  }
  return { room, faces, width: u1 - u0, depth: v1 - v0, axisU, axisV, center };
}
