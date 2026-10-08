import { BooleanOpError, intersection } from '../geometry/boolean';
import { area, signedArea } from '../geometry/polygon';
import type { Ring, Shape, Vec2 } from '../model/types';

const EPS = 1e-9;

/** Convex ring: every turn goes the same way (collinear points allowed). */
export function isConvex(r: Ring): boolean {
  let sign = 0;
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % n]!;
    const c = r[(i + 2) % n]!;
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(turn) <= EPS) continue;
    const s = Math.sign(turn);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * `subject` clipped to the convex ring `clip` (Sutherland-Hodgman). The subject may be concave:
 * the result may then contain zero-width bridges along the edges of `clip`, which add no area, so
 * its area is exactly the area of the intersection.
 */
function clipToConvex(subject: Ring, clip: Ring): Ring {
  const orient = signedArea(clip) >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const side = (p: Vec2): number => orient * (ex * (p.y - a.y) - ey * (p.x - a.x));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    }
  }
  return out;
}

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

/**
 * Area of `subject` inside the ring `clip`. With a convex clip ring, each ring of the subject is
 * clipped exactly (holes subtracted), which is much faster than a general boolean operation;
 * otherwise boolean.ts computes the intersection. A boolean failure (degraded geometry, ruling
 * R37) counts as no overlap: the checks never throw, they only miss that alert.
 */
export function overlapArea(subject: Shape, clip: Ring, clipIsConvex: boolean): number {
  if (area(clip) <= EPS) return 0;
  if (clipIsConvex) {
    let sum = 0;
    for (const poly of subject) {
      sum += area(clipToConvex(poly.outer, clip));
      for (const h of poly.holes) sum -= area(clipToConvex(h, clip));
    }
    return Math.max(0, sum);
  }
  return shapeArea(clipShape(subject, clip));
}

/** Area shared by two rings, clipping against whichever is convex. */
export function ringsOverlapArea(a: Ring, aConvex: boolean, b: Ring, bConvex: boolean): number {
  if (bConvex || !aConvex) return overlapArea([{ outer: a, holes: [] }], b, bConvex);
  return overlapArea([{ outer: b, holes: [] }], a, true);
}
