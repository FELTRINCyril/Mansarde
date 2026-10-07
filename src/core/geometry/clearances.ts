import type { Level, Opening, PlacedObject, Vec2 } from '../model/types';
import type { DerivedLevel } from './derived';
import { openingFrame, openingInterval } from './openings';
import { ringEdges } from './polygon';
import { add, deg2rad, rotate, scale, segmentIntersection } from './vec';
import { wallFrame } from './walls';

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
 * polygons of that shape, so they count). Sides with nothing within 2000 cm are omitted.
 */
export function objectClearances(o: PlacedObject, d: DerivedLevel): Clearance[] {
  const edges = d.shapeNoOpenings.flatMap((poly) => [poly.outer, ...poly.holes]).flatMap(ringEdges);
  const rad = deg2rad(o.rotation);
  const out: Clearance[] = [];
  for (const { side, local, half } of SIDES) {
    const dir = rotate(local, rad);
    const from = add({ x: o.x, y: o.y }, scale(dir, half(o)));
    const far = add(from, scale(dir, MAX_CLEARANCE));
    let best = Infinity;
    for (const [a, b] of edges) {
      const hit = segmentIntersection(from, far, a, b);
      if (hit) best = Math.min(best, hit.t * MAX_CLEARANCE);
    }
    if (best <= MAX_CLEARANCE) out.push({ side, from, to: add(from, scale(dir, best)), distance: best, dir });
  }
  return out;
}

/** New center of the object, moved along c.dir so that the clearance c becomes `value`. */
export function placeAtClearance(o: PlacedObject, c: Clearance, value: number): { x: number; y: number } {
  const move = c.distance - value;
  return { x: o.x + c.dir.x * move, y: o.y + c.dir.y * move };
}

/**
 * Dynamic dimensions of an opening (spec 6.5), measured along the wall axis: from the previous
 * obstacle (wall start node or end of the neighbour opening) to the opening start, and from the
 * opening end to the next obstacle (neighbour opening or wall end node). Openings of the same
 * wall that overlap this one (possible during a drag) are ignored.
 */
export function openingClearances(level: Level, opening: Opening): OpeningClearance[] {
  const wall = wallFrame(level, opening.wallId);
  const f = openingFrame(level, opening);
  const [lo, hi] = openingInterval(opening);
  let before = 0;
  let after = wall.length;
  for (const other of Object.values(level.openings)) {
    if (other.id === opening.id || other.wallId !== opening.wallId) continue;
    const [otherLo, otherHi] = openingInterval(other);
    if (otherHi <= lo + EPS) before = Math.max(before, otherHi);
    else if (otherLo >= hi - EPS) after = Math.min(after, otherLo);
  }
  const at = (s: number) => add(wall.start, scale(wall.dir, s));
  return [
    { side: 'before', from: at(before), to: f.start, distance: lo - before },
    { side: 'after', from: f.end, to: at(after), distance: after - hi },
  ];
}
