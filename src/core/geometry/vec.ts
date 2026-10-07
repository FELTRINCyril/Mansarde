import type { Vec2 } from '../model/types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export function rotate(a: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const equals = (a: Vec2, b: Vec2, eps = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

/** Intersection of lines p + s*d and q + t*e. Null if parallel (|cross(d, e)| < 1e-9). */
export function lineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const s = cross(sub(q, p), e) / den;
  return add(p, scale(d, s));
}

/** Closest point of segment [a, b] to p; t is clamped to [0, 1]. */
export function projectOnSegment(
  p: Vec2,
  a: Vec2,
  b: Vec2,
): { point: Vec2; t: number; distance: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  const point = add(a, scale(ab, t));
  return { point, t, distance: dist(p, point) };
}

/** Intersection of segments [a, b] and [c, d]; t along ab, u along cd, both in [0, 1]. Null if none or parallel. */
export function segmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { point: Vec2; t: number; u: number } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const ac = sub(c, a);
  const t = cross(ac, s) / den;
  const u = cross(ac, r) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: add(a, scale(r, t)), t, u };
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;
