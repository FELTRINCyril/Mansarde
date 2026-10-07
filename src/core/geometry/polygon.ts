import type { PolygonWithHoles, Ring, Vec2 } from '../model/types';
import { deg2rad, projectOnSegment, rotate } from './vec';

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
