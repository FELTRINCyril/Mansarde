import { beamFootprint } from '@/core/geometry/beams';
import { ceilingWithoutBeams } from '@/core/geometry/ceiling';
import { bbox, pointInRing, ringEdges, signedArea } from '@/core/geometry/polygon';
import { dot, projectOnSegment, segmentIntersection, sub } from '@/core/geometry/vec';
import type { Id, Level, Ring, Vec2 } from '@/core/model/types';

/*
 * Automatic cut-away of the 3D view (spec 8.3), pure plan geometry (cm, plan coordinates): the
 * walls between the camera and what it looks at, and the ceilings the camera is above, are hidden
 * so that the rooms can be seen from outside (plan-chambre's `cutaway`).
 */

/** What the cut-away needs of a derived level (core/geometry/derived.ts). */
export interface Walls2D {
  outlines: Map<Id, Ring>;
  /** Outer rings of the walls shape (room islands excluded). */
  facadeRings: Ring[];
  rooms: ReadonlyArray<{ labelPoint: Vec2 }>;
}

/** A face of a wall on the outside of the building: a point of it and its outward unit normal. */
interface Face { a: Vec2; n: Vec2 }
interface WallInfo { id: Id; ring: Ring; box: { minX: number; minY: number; maxX: number; maxY: number }; faces: Face[] }
interface Info { walls: WallInfo[]; houses: Ring[] }

/** Two edges lie on the same line when both ends of one are this close to the other's line (cm). */
const ON_LINE = 0.5;
/** Shortest shared length (cm) for a wall edge to count as a facade edge. */
const MIN_SHARED = 1;
/** The camera must be this far (cm) on the outer side of a facade face to hide it. */
const FACE_EPS = 1;

/** The wall edges lying on an edge of `ring`, with the outward normal of that ring. */
function facadeFaces(outline: Ring, ring: Ring): Face[] {
  const sign = Math.sign(signedArea(ring));
  const out: Face[] = [];
  for (const [c, d] of ringEdges(ring)) {
    const e = sub(d, c);
    const l = Math.hypot(e.x, e.y);
    if (l < MIN_SHARED) continue;
    const u = { x: e.x / l, y: e.y / l };
    for (const [a, b] of ringEdges(outline)) {
      const off = (p: Vec2) => Math.abs(u.x * (p.y - c.y) - u.y * (p.x - c.x));
      if (off(a) > ON_LINE || off(b) > ON_LINE) continue;
      const sa = dot(sub(a, c), u);
      const sb = dot(sub(b, c), u);
      const shared = Math.min(Math.max(sa, sb), l) - Math.max(Math.min(sa, sb), 0);
      if (shared < MIN_SHARED) continue;
      // (e.y, -e.x) points out of a ring of positive signed area (y down, see polygon.ts)
      out.push({ a: c, n: { x: sign * u.y, y: -sign * u.x } });
    }
  }
  return out;
}

const infos = new WeakMap<Walls2D, Info>();

/** The walls with their facade faces, computed once per derived level. */
function infoOf(d: Walls2D): Info {
  const hit = infos.get(d);
  if (hit) return hit;
  // only the buildings with rooms have an inside and an outside; free-standing walls do not
  const houses = d.facadeRings.filter((r) => d.rooms.some((room) => pointInRing(room.labelPoint, r)));
  const walls: WallInfo[] = [];
  for (const [id, ring] of d.outlines) {
    const box = bbox(ring);
    if (!box || ring.length < 3) continue;
    walls.push({ id, ring, box, faces: houses.flatMap((h) => facadeFaces(ring, h)) });
  }
  const info = { walls, houses };
  infos.set(d, info);
  return info;
}

/** True when the segment [p, q] crosses the ring or has an end inside it. */
function segmentMeetsRing(p: Vec2, q: Vec2, ring: Ring, box: WallInfo['box']): boolean {
  if (Math.max(p.x, q.x) < box.minX || Math.min(p.x, q.x) > box.maxX || Math.max(p.y, q.y) < box.minY || Math.min(p.y, q.y) > box.maxY) {
    return false;
  }
  if (pointInRing(p, ring) || pointInRing(q, ring)) return true;
  return ringEdges(ring).some(([a, b]) => segmentIntersection(p, q, a, b) !== null);
}

/**
 * Walls hidden by the cut-away for a camera and its target seen in plan (cm): a wall is hidden
 * when the segment camera -> target crosses its outline (spec 8.3). Seen from outside a building
 * (the camera outside its facades), the facade walls whose outer face turns towards the camera
 * are hidden too, as plan-chambre hides every wall on the camera side: the segment alone would
 * leave a wall standing in front of the room as soon as it misses the target line by a corner.
 */
export function hiddenWalls(d: Walls2D, camera: Vec2, target: Vec2): Set<Id> {
  const info = infoOf(d);
  const outside = !info.houses.some((h) => pointInRing(camera, h));
  const hidden = new Set<Id>();
  for (const w of info.walls) {
    const facing = outside && w.faces.some((f) => dot(sub(camera, f.a), f.n) > FACE_EPS);
    if (facing || segmentMeetsRing(camera, target, w.ring, w.box)) hidden.add(w.id);
  }
  return hidden;
}

/** The point of `ring` closest to p (p itself when inside). */
function nearestIn(p: Vec2, ring: Ring): Vec2 {
  if (pointInRing(p, ring)) return p;
  let best = { point: ring[0]!, distance: Infinity };
  for (const [a, b] of ringEdges(ring)) {
    const q = projectOnSegment(p, a, b);
    if (q.distance < best.distance) best = q;
  }
  return best.point;
}

/**
 * Ceilings (sloped parts included) and beams hidden because the camera is above them (spec 8.3):
 * `height` is the camera height above the level floor (cm); each room ceiling and each beam is
 * compared with the ceiling height at its point closest to the camera in plan (under the camera
 * when it is above it), so that a camera outside a low knee wall sees over the slope.
 */
export function hiddenCeilings(level: Level, rooms: ReadonlyArray<{ key: string; ring: Ring }>, camera: Vec2, height: number): { rooms: Set<string>; beams: Set<Id> } {
  const above = (ring: Ring) => ring.length >= 3 && height > ceilingWithoutBeams(level, nearestIn(camera, ring));
  const out = { rooms: new Set<string>(), beams: new Set<Id>() };
  for (const r of rooms) if (above(r.ring)) out.rooms.add(r.key);
  for (const b of Object.values(level.beams)) if (above(beamFootprint(b))) out.beams.add(b.id);
  return out;
}
