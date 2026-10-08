import type { Id, Level, Ring, Vec2 } from '../model/types';
import type { DerivedLevel } from './derived';
import type { Room } from './rooms';
import { cross, deg2rad, dist, dot, normalize, perp, sub } from './vec';
import { wallFrame } from './walls';

/**
 * A rectangular room (spec 6): its four interior faces, each lying on one face of one wall.
 * `side` is the face of the wall the room stands against (left = +perp(wall direction)); a and b
 * are the ends of the room edge. axisU is the edge direction closest to the world +x, axisV =
 * perp(axisU) (screen down for an axis-aligned room); width and depth are the interior extents
 * along axisU and axisV. Moving the 'max' face means moving the right / bottom face in that frame.
 */
export interface RectRoom {
  room: Room;
  faces: Array<{ wallId: Id; side: 'left' | 'right'; a: Vec2; b: Vec2 }>;
  width: number;
  depth: number;
  axisU: Vec2;
  axisV: Vec2;
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
 * The wall whose face carries the whole room edge [a, b]: parallel to the edge (1 deg), both ends
 * at thickness / 2 from its axis on the same side, within its length, and the room (inner point
 * `inside`) beyond that face. Null when no single wall does.
 */
function faceWall(level: Level, a: Vec2, b: Vec2, inside: Vec2): { wallId: Id; side: 'left' | 'right' } | null {
  const edgeDir = normalize(sub(b, a));
  for (const wall of Object.values(level.walls)) {
    const f = wallFrame(level, wall.id);
    if (f.length <= 0 || Math.abs(cross(f.dir, edgeDir)) > SIN_TOLERANCE) continue;
    const h = wall.thickness / 2;
    const offA = dot(sub(a, f.start), f.normal);
    const offB = dot(sub(b, f.start), f.normal);
    const sign = offA > 0 ? 1 : -1;
    if (Math.abs(offA - sign * h) > FACE_TOLERANCE || Math.abs(offB - sign * h) > FACE_TOLERANCE) continue;
    const along = [dot(sub(a, f.start), f.dir), dot(sub(b, f.start), f.dir)];
    if (along.some((t) => t < -FACE_TOLERANCE || t > f.length + FACE_TOLERANCE)) continue;
    if (sign * dot(sub(inside, f.start), f.normal) <= h) continue;
    return { wallId: wall.id, side: sign > 0 ? 'left' : 'right' };
  }
  return null;
}

/**
 * The room `roomKey` of the derived level if it is a rectangle: four edges at right angles
 * (1 deg tolerance), each one on a face of a single wall. Null otherwise (unknown key, other
 * shape, an edge made of several walls or not on any wall face).
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

  const center = { x: ring.reduce((s, p) => s + p.x, 0) / 4, y: ring.reduce((s, p) => s + p.y, 0) / 4 };
  const faces: RectRoom['faces'] = [];
  for (const [a, b] of edges) {
    const face = faceWall(level, a, b, center);
    if (!face) return null;
    faces.push({ ...face, a: { ...a }, b: { ...b } });
  }

  // the edge direction closest to +x (ties: the one pointing up on screen), deterministic
  const candidates = [dirs[0]!, dirs[1]!].flatMap((u) => [u, { x: -u.x, y: -u.y }]);
  const axisU = candidates.reduce((best, u) => (u.x > best.x + 1e-12 || (Math.abs(u.x - best.x) <= 1e-12 && u.y < best.y) ? u : best));
  const axisV = perp(axisU);
  const extent = (axis: Vec2): number => {
    const values = ring.map((p) => dot(p, axis));
    return Math.max(...values) - Math.min(...values);
  };
  return { room, faces, width: extent(axisU), depth: extent(axisV), axisU, axisV };
}
