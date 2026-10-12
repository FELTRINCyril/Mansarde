import type { Cupboard, Level, Opening, PlacedObject, Vec2 } from '../model/types';
import { cupboardFootprint } from './cupboards';
import { deriveLevel, type DerivedLevel } from './derived';
import { openingFrame, openingInterval } from './openings';
import { pointInPolygon, ringEdges } from './polygon';
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
 * Free stretch of a wall nearest to the axis position `at` (0 = start node, default the middle).
 * The wall is cut wherever one of its two face lines meets an edge of the wall shape without
 * openings (exact face-line positions, probed just outside the faces like faceLimit); a piece is
 * free when the probe points on both sides of its middle lie outside the shape. The faces of the
 * walls met at the ends bound the free stretches, and so does any wall crossing or abutting this
 * one in between. Returns the free stretch containing `at`, else the nearest one ([at, at] when
 * there is none). An isolated wall gives [0, length]. Used to keep openings clear of the walls.
 * With `side`, only that face counts (left = +normal, as Cupboard.side): a cupboard set against one
 * face is not stopped by a wall abutting the other face.
 */
export function wallFaceInterval(
  level: Level,
  wallId: string,
  at?: number,
  d: DerivedLevel = deriveLevel(level),
  side?: 'left' | 'right',
): [number, number] {
  const L = wallFrame(level, wallId).length;
  const from = Math.min(L, Math.max(0, at ?? L / 2));
  let best: [number, number] = [from, from];
  let bestD = Infinity;
  for (const [a, b] of wallFaceStretches(level, wallId, d, side)) {
    const dd = from < a ? a - from : from > b ? from - b : 0;
    if (dd < bestD) {
      bestD = dd;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Every free stretch of the wall (or of one face with `side`), in order along the axis: the pieces
 * wallFaceInterval chooses from (same cuts, same probes). Empty when the whole wall is covered.
 */
export function wallFaceStretches(
  level: Level,
  wallId: string,
  d: DerivedLevel = deriveLevel(level),
  side?: 'left' | 'right',
): [number, number][] {
  const wall = wallFrame(level, wallId);
  const half = (level.walls[wallId]?.thickness ?? 0) / 2;
  const L = wall.length;
  const edges = d.shapeNoOpenings.flatMap((poly) => [poly.outer, ...poly.holes]).flatMap(ringEdges);
  const probe = (side: number, s: number) => add(add(wall.start, scale(wall.dir, s)), scale(wall.normal, side * (half + FACE_PROBE)));
  const cuts = [0, L];
  const sides = side === undefined ? [-1, 1] : [side === 'left' ? 1 : -1];
  for (const sign of sides) {
    const face = add(wall.start, scale(wall.normal, sign * half));
    for (const [c, e] of edges) {
      if (!segmentIntersection(probe(sign, 0), probe(sign, L), c, e)) continue;
      const exact = lineIntersection(face, wall.dir, c, sub(e, c));
      if (exact) cuts.push(Math.min(L, Math.max(0, dot(sub(exact, wall.start), wall.dir))));
    }
  }
  cuts.sort((a, b) => a - b);
  const inWall = (p: Vec2) => d.shapeNoOpenings.some((poly) => pointInPolygon(p, poly));
  const free: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    if (b - a < EPS) continue;
    const m = (a + b) / 2;
    if (sides.some((sign) => inWall(probe(sign, m)))) continue;
    const last = free[free.length - 1];
    if (last && Math.abs(last[1] - a) < EPS) last[1] = b;
    else free.push([a, b]);
  }
  return free;
}

/** A free stretch shorter than the cupboard by less than this (cm) still takes it (rounding of the cuts). */
const CUPBOARD_FIT_EPS = 1e-6;

/**
 * Offset of a cupboard of that width centered as near as possible to `along` (rounded to 1 cm
 * unless raw) on the free stretch of its face around `along` (wallFaceInterval on that side only:
 * between the faces of the walls met on that side, the wall ends when nothing is met; ruling
 * V2-R32). `fits` false when the stretch is shorter than the cupboard (the offset is then the
 * stretch middle). The single rule of the cupboard tool, of a cupboard drag, of a wider cupboard
 * and of the cupboards of a changed wall (reconcileCupboards).
 */
export function fitCupboardOnWall(
  level: Level,
  wallId: string,
  side: 'left' | 'right',
  width: number,
  along: number,
  raw = false,
  d: DerivedLevel = deriveLevel(level),
): { offset: number; fits: boolean } {
  const [lo, hi] = wallFaceInterval(level, wallId, along, d, side);
  if (hi - lo < width - CUPBOARD_FIT_EPS) return { offset: (lo + hi) / 2, fits: false };
  const at = raw ? along : Math.round(along);
  return { offset: Math.min(hi - width / 2, Math.max(lo + width / 2, at)), fits: true };
}

/** A point of a cupboard footprint in the frame of a face: s along the wall axis, u away from the face. */
interface FacePoint { s: number; u: number }

/** The part of a convex polygon on one side of the line u = bound (above: u >= bound), Sutherland-Hodgman. */
function clipFace(pts: FacePoint[], bound: number, above: boolean): FacePoint[] {
  const inside = (p: FacePoint) => (above ? p.u >= bound : p.u <= bound);
  const out: FacePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (bound - a.u) / (b.u - a.u);
      out.push({ s: a.s + t * (b.s - a.s), u: bound });
    }
  }
  return out;
}

/**
 * Stretches [s0, s1] along the wall axis that a cupboard standing against that face, `depth` deep,
 * cannot overlap: for every cupboard of the level (any wall, any face), the axis span of the part
 * of its footprint lying within the depth of the face (contacts up to CUPBOARD_FIT_EPS ignored).
 * Exact for the convex footprints: a copy [s, s + width] overlaps a footprint iff the spans meet.
 */
function occupiedOnFace(level: Level, wallId: string, side: 'left' | 'right', depth: number): [number, number][] {
  const wall = wallFrame(level, wallId);
  const outward = side === 'left' ? wall.normal : scale(wall.normal, -1);
  const face = add(wall.start, scale(outward, (level.walls[wallId]?.thickness ?? 0) / 2));
  const out: [number, number][] = [];
  for (const o of Object.values(level.cupboards)) {
    const w = level.walls[o.wallId];
    if (!w || !level.nodes[w.startNodeId] || !level.nodes[w.endNodeId]) continue;
    const pts = cupboardFootprint(level, o).map((p) => ({ s: dot(sub(p, wall.start), wall.dir), u: dot(sub(p, face), outward) }));
    const inDepth = clipFace(clipFace(pts, CUPBOARD_FIT_EPS, true), depth - CUPBOARD_FIT_EPS, false);
    if (inDepth.length < 3) continue;
    const ss = inDepth.map((p) => p.s);
    const lo = Math.min(...ss);
    const hi = Math.max(...ss);
    if (hi - lo > CUPBOARD_FIT_EPS) out.push([lo, hi]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Offsets where a copy of the cupboard can go on the same face, best first: anywhere on the free
 * stretches of that face (wallFaceStretches on its side: the faces of the walls met bound them),
 * never over any cupboard of the level (occupiedOnFace: the original, the cupboards of that face
 * and those of the other walls, a corner cupboard of the perpendicular wall included). In each gap
 * between them at least as long as the cupboard, the slot nearest to the original, then the
 * following ones a width further away from it, then the far end of the gap. Sorted by distance to
 * the original, the slot after it (towards the wall end) first at equal distance: so just after
 * the original, else just before it, else the nearest gap anywhere on the face. Empty when no gap
 * fits. Several slots, so that a copy refused at the first one (heights under a slope) can try
 * the next.
 */
export function cupboardCopySlots(
  level: Level,
  c: Pick<Cupboard, 'wallId' | 'side' | 'offset' | 'width' | 'depth'>,
  d: DerivedLevel = deriveLevel(level),
): number[] {
  const w = c.width;
  const occupied = occupiedOnFace(level, c.wallId, c.side, c.depth);
  const gaps: [number, number][] = [];
  for (const [lo, hi] of wallFaceStretches(level, c.wallId, d, c.side)) {
    let cursor = lo;
    for (const [a, b] of occupied) {
      if (b <= cursor) continue;
      if (a >= hi) break;
      if (a > cursor) gaps.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < hi) gaps.push([cursor, hi]);
  }
  const slots: Array<{ at: number; dist: number }> = [];
  for (const [lo, hi] of gaps) {
    if (hi - lo < w - CUPBOARD_FIT_EPS) continue;
    let min = lo + w / 2;
    let max = hi - w / 2;
    if (max < min) min = max = (lo + hi) / 2; // shorter by less than CUPBOARD_FIT_EPS
    const first = Math.min(max, Math.max(min, c.offset));
    // away from the original: forward from the near end of a gap after it, backward otherwise
    const step = max - first >= first - min ? w : -w;
    const far = step > 0 ? max : min;
    const ats = [first];
    for (let at = first + step; step > 0 ? at < far - CUPBOARD_FIT_EPS : at > far + CUPBOARD_FIT_EPS; at += step) ats.push(at);
    if (Math.abs(far - ats[ats.length - 1]!) > CUPBOARD_FIT_EPS) ats.push(far);
    for (const at of ats) slots.push({ at, dist: Math.abs(at - c.offset) });
  }
  // equal distances (up to rounding): the slot after the original first
  slots.sort((a, b) => (Math.abs(a.dist - b.dist) > CUPBOARD_FIT_EPS ? a.dist - b.dist : b.at - a.at));
  return slots.map((s) => s.at);
}

/** The cupboard lies on the free stretch of its face (wallFaceInterval on its side, CUPBOARD_FIT_EPS tolerance): no wall in the way. */
export function cupboardOnFreeStretch(level: Level, c: Pick<Cupboard, 'wallId' | 'side' | 'offset' | 'width'>, d: DerivedLevel = deriveLevel(level)): boolean {
  const [lo, hi] = wallFaceInterval(level, c.wallId, c.offset, d, c.side);
  return c.offset - c.width / 2 >= lo - CUPBOARD_FIT_EPS && c.offset + c.width / 2 <= hi + CUPBOARD_FIT_EPS;
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
