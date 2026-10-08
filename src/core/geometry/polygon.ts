import type { PolygonWithHoles, Ring, Vec2 } from '../model/types';
import { cross, deg2rad, dist, dot, len, projectOnSegment, rotate, segmentIntersection, sub } from './vec';

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

/** Rectangle centered on (cx, cy), corners TL, TR, BR, BL (local -w/2,-h/2 first), rotated clockwise on screen. */
export function rectRing(cx: number, cy: number, w: number, h: number, rotationDeg: number): Ring {
  const rad = deg2rad(rotationDeg);
  const hw = w / 2;
  const hh = h / 2;
  const local: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => {
    const q = rotate(p, rad);
    return { x: cx + q.x, y: cy + q.y };
  });
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
