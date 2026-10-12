import { BooleanOpError, intersection } from '../geometry/boolean';
import { area, clipConvex, convexParts } from '../geometry/polygon';
import type { Ring, Shape } from '../model/types';

const EPS = 1e-9;

export const shapeArea = (s: Shape): number => s.reduce((sum, p) => sum + area(p.outer) - p.holes.reduce((h, r) => h + area(r), 0), 0);

/** The intersection of `subject` with the ring `clip` by boolean.ts; empty when the operation fails (see overlapArea). */
export function clipShape(subject: Shape, clip: Ring): Shape {
  try {
    return intersection(subject, clip);
  } catch (e) {
    if (!(e instanceof BooleanOpError)) throw e;
    return [];
  }
}

/** Area of `subject` inside the CONVEX ring `clip`: each ring clipped exactly (clipConvex), holes subtracted. */
function convexOverlapArea(subject: Shape, clip: Ring): number {
  let sum = 0;
  for (const poly of subject) {
    sum += area(clipConvex(poly.outer, clip));
    for (const h of poly.holes) sum -= area(clipConvex(h, clip));
  }
  return Math.max(0, sum);
}

/**
 * Area of `subject` inside the ring `clip`. A convex clip ring clips each ring of the subject
 * exactly; a concave one (an L footprint) is cut into the convex pieces of convexParts, which tile
 * it exactly, as ceiling.ts does. Both are much faster than a general boolean operation; boolean.ts
 * is only the fallback for a ring convexParts cannot split (not simple). A boolean failure
 * (degraded geometry, ruling R37) counts as no overlap: the checks never throw, they only miss
 * that alert.
 */
export function overlapArea(subject: Shape, clip: Ring, clipIsConvex: boolean): number {
  if (area(clip) <= EPS) return 0;
  if (clipIsConvex) return convexOverlapArea(subject, clip);
  const parts = convexParts(clip);
  if (parts) return parts.reduce((sum, part) => sum + convexOverlapArea(subject, part), 0);
  return shapeArea(clipShape(subject, clip));
}

/** Area shared by two rings, clipping against the convex one when there is one. */
export function ringsOverlapArea(a: Ring, aConvex: boolean, b: Ring, bConvex: boolean): number {
  if (bConvex || !aConvex) return overlapArea([{ outer: a, holes: [] }], b, bConvex);
  return overlapArea([{ outer: b, holes: [] }], a, true);
}
