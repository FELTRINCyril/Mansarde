import type { Level, Opening, PlacedObject, Vec2 } from '../model/types';
import { deriveLevel, type DerivedLevel } from './derived';
import { openingFrame, openingInterval } from './openings';
import { ringEdges } from './polygon';
import { add, deg2rad, dot, lineIntersection, rotate, scale, segmentIntersection, sub } from './vec';
import { wallFrame, type WallFrame } from './walls';

export interface Clearance {
  side: 'left' | 'right' | 'front' | 'back';
  from: Vec2; // middle of the object side
  to: Vec2; // nearest wall face hit along dir
  distance: number;
  dir: Vec2; // outward unit vector of the side
}

export interface OpeningClearance {
  side: 'before' | 'after'; // towards the wall start / end node
  from: Vec2;
  to: Vec2;
  distance: number;
}

const MAX_CLEARANCE = 2000; // cm
const EPS = 1e-6;
const RAY_BACKOFF = 1e-6; // cm, far above coordinate rounding, far below anything visible

const SIDES: { side: Clearance['side']; local: Vec2; half: (o: PlacedObject) => number }[] = [
  { side: 'back', local: { x: 0, y: -1 }, half: (o) => o.depth / 2 },
  { side: 'front', local: { x: 0, y: 1 }, half: (o) => o.depth / 2 },
  { side: 'left', local: { x: -1, y: 0 }, half: (o) => o.width / 2 },
  { side: 'right', local: { x: 1, y: 0 }, half: (o) => o.width / 2 },
];

/**
 * Dynamic dimensions of an object (spec 6.5): for each side of its bounding rectangle, the
 * distance from the side midpoint, along the outward axis of the object frame, to the nearest
 * edge of the wall shape without openings (outer rings and holes; free-standing wall boxes are
 * polygons of that shape, so they count). Sides with nothing within 2000 cm are omitted. A side
 * touching a face (up to rounding) reports 0, never a negative distance.
 */
export function objectClearances(o: PlacedObject, d: DerivedLevel): Clearance[] {
  const edges = d.shapeNoOpenings.flatMap((poly) => [poly.outer, ...poly.holes]).flatMap(ringEdges);
  const rad = deg2rad(o.rotation);
  const out: Clearance[] = [];
  for (const { side, local, half } of SIDES) {
    const dir = rotate(local, rad);
    const from = add({ x: o.x, y: o.y }, scale(dir, half(o)));
    // The ray starts slightly behind the side: an object flush against a face (side midpoint on
    // the face up to rounding) must hit that face at distance 0, not cross the wall.
    const start = sub(from, scale(dir, RAY_BACKOFF));
    const rayLength = MAX_CLEARANCE + RAY_BACKOFF;
    const far = add(start, scale(dir, rayLength));
    let best = Infinity;
    for (const [a, b] of edges) {
      const hit = segmentIntersection(start, far, a, b);
      if (hit) best = Math.min(best, hit.t * rayLength - RAY_BACKOFF);
    }
    if (best > MAX_CLEARANCE) continue;
    const distance = Math.max(0, best); // also turns -0 into 0
    out.push({ side, from, to: add(from, scale(dir, distance)), distance, dir });
  }
  return out;
}

/** New center of the object, moved along c.dir so that the clearance c becomes `value`. */
export function placeAtClearance(o: PlacedObject, c: Clearance, value: number): { x: number; y: number } {
  const move = c.distance - value;
  return { x: o.x + c.dir.x * move, y: o.y + c.dir.y * move };
}

/** Distance (cm) outside a wall face at which openingClearances probes along that face. */
const FACE_PROBE = 0.05;

/**
 * Position along the wall axis (0 = start node) of the nearest wall face met when going from the
 * axis position `from` towards `to` (one wall end). Probes along both faces of the wall, just outside
 * them, against the wall shape without openings: the inner face of a perpendicular or oblique
 * neighbour wall is met there, while the wall itself never is. The position is where the edge met
 * crosses the face line itself (not the probe line), so that oblique faces are exact. Nothing
 * before the end: the end.
 */
function faceLimit(wall: WallFrame, halfThickness: number, edges: [Vec2, Vec2][], from: number, to: number): number {
  const along = to - from;
  if (Math.abs(along) < EPS) return to;
  let best = to;
  for (const side of [-1, 1]) {
    const shift = scale(wall.normal, side * (halfThickness + FACE_PROBE));
    const a = add(add(wall.start, scale(wall.dir, from)), shift);
    const b = add(add(wall.start, scale(wall.dir, to)), shift);
    const face = add(wall.start, scale(wall.normal, side * halfThickness));
    for (const [c, d] of edges) {
      const hit = segmentIntersection(a, b, c, d);
      if (!hit) continue;
      // where the edge's line crosses the face line itself (exact for oblique edges, unlike the probe line)
      const exact = lineIntersection(face, wall.dir, c, sub(d, c));
      const s = exact ? dot(sub(exact, wall.start), wall.dir) : from + hit.t * along;
      if (along < 0 ? s > best : s < best) best = s;
    }
  }
  return best;
}

/**
 * Free stretch of a wall between the faces of the walls met at its ends, as positions along its
 * axis (0 = start node): the nearest faces seen from the middle of the wall (see faceLimit). An
 * isolated wall gives [0, length]. Used to place new openings clear of the neighbour walls.
 */
export function wallFaceInterval(level: Level, wallId: string, d: DerivedLevel = deriveLevel(level)): [number, number] {
  const wall = wallFrame(level, wallId);
  const half = (level.walls[wallId]?.thickness ?? 0) / 2;
  const edges = d.shapeNoOpenings.flatMap((poly) => [poly.outer, ...poly.holes]).flatMap(ringEdges);
  const mid = wall.length / 2;
  return [faceLimit(wall, half, edges, mid, 0), faceLimit(wall, half, edges, mid, wall.length)];
}

/**
 * Dynamic dimensions of an opening (spec 6.5, ruling R29), measured along the wall: from the
 * previous obstacle to the opening start, and from the opening end to the next obstacle. An
 * obstacle is the nearest wall face along the wall (the inner face of the wall met at that end,
 * see faceLimit; the wall end itself when no wall meets it) or the edge of a neighbour opening of
 * the same wall. Openings of the same wall that overlap this one (possible during a drag) are
 * ignored. Distances are never negative (an edge already inside the neighbour wall reports 0 or
 * its distance to the end). `d` defaults to the derived geometry of the level.
 */
export function openingClearances(level: Level, opening: Opening, d: DerivedLevel = deriveLevel(level)): OpeningClearance[] {
  const wall = wallFrame(level, opening.wallId);
  const half = (level.walls[opening.wallId]?.thickness ?? 0) / 2;
  const edges = d.shapeNoOpenings.flatMap((poly) => [poly.outer, ...poly.holes]).flatMap(ringEdges);
  const f = openingFrame(level, opening);
  const [lo, hi] = openingInterval(opening);
  let before = lo >= 0 ? faceLimit(wall, half, edges, lo, 0) : 0;
  let after = hi <= wall.length ? faceLimit(wall, half, edges, hi, wall.length) : wall.length;
  for (const other of Object.values(level.openings)) {
    if (other.id === opening.id || other.wallId !== opening.wallId) continue;
    const [otherLo, otherHi] = openingInterval(other);
    if (otherHi <= lo + EPS) before = Math.max(before, otherHi);
    else if (otherLo >= hi - EPS) after = Math.min(after, otherLo);
  }
  const at = (s: number) => add(wall.start, scale(wall.dir, s));
  return [
    { side: 'before', from: at(before), to: f.start, distance: Math.max(0, lo - before) },
    { side: 'after', from: f.end, to: at(after), distance: Math.max(0, after - hi) },
  ];
}

/** New offset of the opening, moved along its wall so that the clearance c becomes `value`. */
export function placeOpeningAtClearance(o: Opening, c: OpeningClearance, value: number): number {
  const move = c.distance - value;
  return c.side === 'before' ? o.offset - move : o.offset + move;
}
