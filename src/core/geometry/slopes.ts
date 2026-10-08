import type { Level, Ring, Slope, Vec2 } from '../model/types';
import { add, dist, dot, normalize, perp, scale, sub } from './vec';

/** Frame of a slope: start line a -> b, unit `dir` along it, unit `normal` pointing down-slope. */
export interface SlopeFrame { a: Vec2; b: Vec2; dir: Vec2; normal: Vec2; length: number; depth: number }

/** Points within this distance (cm) of the band's start line or lateral edges count as inside. */
const EDGE_EPS = 1e-6;

export function slopeFrame(s: Slope): SlopeFrame {
  const dir = normalize(sub(s.b, s.a));
  const left = perp(dir);
  return { a: { ...s.a }, b: { ...s.b }, dir, normal: s.side === 'left' ? left : scale(left, -1), length: dist(s.a, s.b), depth: s.depth };
}

/** The slope zone up to the end line: a, b, b + normal * depth, a + normal * depth. */
export function slopeBand(s: Slope): Ring {
  const f = slopeFrame(s);
  const n = scale(f.normal, s.depth);
  return [{ ...s.a }, { ...s.b }, add(s.b, n), add(s.a, n)];
}

/** Ceiling height of the slope at distance d >= 0 from its start line (heightEnd beyond depth). */
export function slopeHeightAtDistance(s: Slope, d: number): number {
  if (d >= s.depth) return s.heightEnd;
  return s.heightStart + ((s.heightEnd - s.heightStart) * Math.max(0, d)) / s.depth;
}

/**
 * Ceiling height of the slope at p (spec 4.2), or null when p is not in its zone: outside the
 * lateral extent of the start line, or upslope (d < 0). A degenerate slope (start line of zero
 * length, depth <= 0) has no zone.
 */
export function slopeHeightAt(s: Slope, p: Vec2): number | null {
  const f = slopeFrame(s);
  if (f.length <= 0 || !(s.depth > 0)) return null;
  const rel = sub(p, s.a);
  const t = dot(rel, f.dir);
  if (t < -EDGE_EPS || t > f.length + EDGE_EPS) return null;
  const d = dot(rel, f.normal);
  if (d < -EDGE_EPS) return null;
  return slopeHeightAtDistance(s, d);
}

/** Lowest ceiling of the level at p, slopes included, beams excluded (see ceiling.ts). */
export function slopesCeilingAt(level: Level, p: Vec2): number {
  let h = level.height;
  for (const s of Object.values(level.slopes)) {
    const sh = slopeHeightAt(s, p);
    if (sh !== null && sh < h) h = sh;
  }
  return h;
}

/** More level lines than this (absurd step) and none is drawn. */
const MAX_LEVEL_LINES = 1000;

/** A line of the slope drawn on the plan, parallel to its start line. */
export interface Isoline { a: Vec2; b: Vec2; height: number; kind: 'start' | 'end' | 'level' }

/**
 * The start line, a 'level' line at every multiple of stepCm strictly between heightStart and
 * heightEnd (ordered from the start line), and the end line. No level line when stepCm <= 0 or
 * when there would be more than MAX_LEVEL_LINES of them.
 */
export function slopeIsolines(s: Slope, stepCm = 20): Isoline[] {
  const f = slopeFrame(s);
  const at = (d: number, height: number, kind: Isoline['kind']): Isoline => {
    const off = scale(f.normal, d);
    return { a: add(s.a, off), b: add(s.b, off), height, kind };
  };
  const out: Isoline[] = [at(0, s.heightStart, 'start')];
  const lo = Math.min(s.heightStart, s.heightEnd);
  const hi = Math.max(s.heightStart, s.heightEnd);
  const eps = 1e-9 * Math.max(1, hi);
  if (stepCm > 0 && hi - lo > eps && (hi - lo) / stepCm <= MAX_LEVEL_LINES) {
    const heights: number[] = [];
    for (let k = Math.floor(lo / stepCm) + 1; k * stepCm < hi - eps; k++) {
      if (k * stepCm > lo + eps) heights.push(k * stepCm);
    }
    if (s.heightStart > s.heightEnd) heights.reverse();
    for (const h of heights) out.push(at((s.depth * (h - s.heightStart)) / (s.heightEnd - s.heightStart), h, 'level'));
  }
  out.push(at(s.depth, s.heightEnd, 'end'));
  return out;
}
