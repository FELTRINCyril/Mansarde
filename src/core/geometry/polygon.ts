import type { PolygonWithHoles, Ring, Vec2 } from '../model/types';
import { cross, dist, dot, len, projectOnSegment, segmentIntersection, sub } from './vec';

/** Shoelace formula; sign depends on ring orientation. */
export function signedArea(r: Ring): number {
  let sum = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i] as Vec2;
    const b = r[(i + 1) % r.length] as Vec2;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export const area = (r: Ring): number => Math.abs(signedArea(r));

/** Even-odd ray casting. */
export function pointInRing(p: Vec2, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i] as Vec2;
    const b = r[j] as Vec2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export const pointInPolygon = (p: Vec2, poly: PolygonWithHoles): boolean =>
  pointInRing(p, poly.outer) && !poly.holes.some((h) => pointInRing(p, h));

export function bbox(
  points: Vec2[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Edges of the implicitly closed ring, including the closing edge. */
export function ringEdges(r: Ring): [Vec2, Vec2][] {
  return r.map((a, i): [Vec2, Vec2] => [a, r[(i + 1) % r.length] as Vec2]);
}

export function distanceToRing(p: Vec2, r: Ring): number {
  let best = Infinity;
  for (const [a, b] of ringEdges(r)) {
    best = Math.min(best, projectOnSegment(p, a, b).distance);
  }
  return best;
}

/**
 * Drops repeated points and vertices lying on the straight segment between their neighbours
 * (within eps cm), so that each straight side of the ring is a single edge. Boolean operations
 * may leave such vertices where two input polygons met along a common line.
 */
export function mergeCollinear(r: Ring, eps = 1e-6): Ring {
  let pts = r.filter((p, i) => dist(p, r[(i + 1) % r.length] as Vec2) > eps);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; ) {
      const prev = pts[(i + pts.length - 1) % pts.length] as Vec2;
      const p = pts[i] as Vec2;
      const next = pts[(i + 1) % pts.length] as Vec2;
      const base = sub(next, prev);
      const l = len(base);
      const between = dot(sub(p, prev), base) > 0 && dot(sub(next, p), base) > 0;
      if (l > eps && between && Math.abs(cross(base, sub(p, prev))) / l <= eps) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
      } else {
        i++;
      }
    }
  }
  return pts;
}

/**
 * Vertices of the intersection of the rings, without building it: the vertices of each ring that
 * lie in all the others, and the crossings of edges of two rings that lie in all the others
 * (points within eps of a boundary count as inside). The minimum of a function that reaches its
 * minimum over a polygon at a vertex is the minimum over these points. Duplicates are possible.
 */
export function intersectionVertices(rings: Ring[], eps = 1e-7): Vec2[] {
  const inside = (p: Vec2, skip: (k: number) => boolean): boolean =>
    rings.every((r, k) => skip(k) || pointInRing(p, r) || distanceToRing(p, r) <= eps);
  const out: Vec2[] = [];
  rings.forEach((r, i) => {
    for (const p of r) if (inside(p, (k) => k === i)) out.push(p);
  });
  const edges = rings.map(ringEdges);
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      for (const [a, b] of edges[i] as [Vec2, Vec2][]) {
        for (const [c, d] of edges[j] as [Vec2, Vec2][]) {
          const x = segmentIntersection(a, b, c, d);
          if (x && inside(x.point, (k) => k === i || k === j)) out.push(x.point);
        }
      }
    }
  }
  return out;
}

/** All turns of the ring go the same way (collinear vertices allowed) and it winds exactly once. */
export function isConvexRing(r: Ring): boolean {
  if (r.length < 3) return false;
  let sign = 0;
  let turning = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[(i + r.length - 1) % r.length] as Vec2;
    const b = r[i] as Vec2;
    const c = r[(i + 1) % r.length] as Vec2;
    const u = sub(b, a);
    const w = sub(c, b);
    const k = cross(u, w);
    if (k !== 0) {
      if (sign === 0) sign = Math.sign(k);
      else if (Math.sign(k) !== sign) return false;
    }
    turning += Math.atan2(k, dot(u, w));
  }
  return sign !== 0 && Math.abs(Math.abs(turning) - 2 * Math.PI) < 1e-6;
}

/** No two non-adjacent edges of the ring meet (the ring is a simple polygon). */
export function isSimpleRing(r: Ring): boolean {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentIntersection(r[i] as Vec2, r[(i + 1) % n] as Vec2, r[j] as Vec2, r[(j + 1) % n] as Vec2)) return false;
    }
  }
  return true;
}

/**
 * Convex pieces covering the ring exactly: the ring itself when convex, otherwise the triangles of
 * an ear-clipping triangulation. Null when the ring is not a simple polygon with an area.
 */
export function convexParts(r: Ring): Ring[] | null {
  const pts = r.filter((p, i) => dist(p, r[(i + 1) % r.length] as Vec2) > 0);
  if (pts.length < 3) return null;
  const orient = Math.sign(signedArea(pts));
  if (orient === 0) return null;
  if (isConvexRing(pts)) return [pts];
  if (!isSimpleRing(pts)) return null;
  const idx = pts.map((_, i) => i);
  const out: Ring[] = [];
  const inTriangle = (p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean =>
    orient * cross(sub(b, a), sub(p, a)) >= 0 && orient * cross(sub(c, b), sub(p, b)) >= 0 && orient * cross(sub(a, c), sub(p, c)) >= 0;
  while (idx.length > 3) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = pts[idx[(k + idx.length - 1) % idx.length]!]!;
      const b = pts[idx[k]!]!;
      const c = pts[idx[(k + 1) % idx.length]!]!;
      const turn = orient * cross(sub(b, a), sub(c, b));
      if (turn < 0) continue; // reflex vertex
      if (turn > 0) {
        const blocked = idx.some((m) => {
          const p = pts[m]!;
          return p !== a && p !== b && p !== c && inTriangle(p, a, b, c);
        });
        if (blocked) continue;
        out.push([a, b, c]);
      }
      idx.splice(k, 1); // an ear, or a collinear vertex (no area)
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }
  const [i0, i1, i2] = idx as [number, number, number];
  if (orient * cross(sub(pts[i1]!, pts[i0]!), sub(pts[i2]!, pts[i1]!)) > 0) out.push([pts[i0]!, pts[i1]!, pts[i2]!]);
  return out;
}

/**
 * Sutherland-Hodgman: the part of the CONVEX ring `subject` inside the convex ring `clip` (either
 * orientation); exact for two convex rings. Fewer than 3 points when they do not overlap.
 * A concave (simple) subject is accepted when only the AREA matters: the result may then contain
 * zero-width bridges along the edges of `clip` (it is not a simple ring), but its area is exactly
 * the area of subject inside clip (used by the checks, src/core/checks/overlap.ts).
 */
export function clipConvex(subject: Ring, clip: Ring): Ring {
  const orient = Math.sign(signedArea(clip));
  if (orient === 0) return [];
  let out: Ring = subject;
  for (let e = 0; e < clip.length && out.length > 0; e++) {
    const a = clip[e] as Vec2;
    const d = sub(clip[(e + 1) % clip.length] as Vec2, a);
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i] as Vec2;
      const q = input[(i + 1) % input.length] as Vec2;
      const sp = orient * cross(d, sub(p, a));
      const sq = orient * cross(d, sub(q, a));
      if (sp >= 0) out.push(p);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

/** Average of the vertices; inside a convex ring. */
export function vertexCentroid(r: Ring): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of r) {
    x += p.x;
    y += p.y;
  }
  return { x: x / r.length, y: y / r.length };
}
