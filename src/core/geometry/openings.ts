import type { Level, Opening, Ring, Vec2 } from '../model/types';
import { add, scale, sub } from './vec';
import { wallFrame } from './walls';

export interface OpeningFrame {
  center: Vec2;
  dir: Vec2;
  normal: Vec2;
  start: Vec2;
  end: Vec2;
  thickness: number;
  wallLength: number;
}

const EPS = 1e-6;
const CUT_MARGIN = 2; // cm beyond each wall face, so the cut fully clears the wall

/** Frame of an opening on its wall. Throws if the wall is missing. */
export function openingFrame(level: Level, opening: Opening): OpeningFrame {
  const f = wallFrame(level, opening.wallId);
  const wall = level.walls[opening.wallId]!;
  const center = add(f.start, scale(f.dir, opening.offset));
  const half = scale(f.dir, opening.width / 2);
  return {
    center,
    dir: f.dir,
    normal: f.normal,
    start: sub(center, half),
    end: add(center, half),
    thickness: wall.thickness,
    wallLength: f.length,
  };
}

/** Rectangle from start to end along the wall, across thickness + 2 cm margin on each side. */
export function openingCutRing(level: Level, opening: Opening): Ring {
  const f = openingFrame(level, opening);
  const n = scale(f.normal, f.thickness / 2 + CUT_MARGIN);
  return [sub(f.start, n), sub(f.end, n), add(f.end, n), add(f.start, n)];
}

export function openingInterval(o: Opening): [number, number] {
  return [o.offset - o.width / 2, o.offset + o.width / 2];
}

export function openingFitsWall(o: Opening, wallLen: number): boolean {
  const [lo, hi] = openingInterval(o);
  return lo >= -EPS && hi <= wallLen + EPS;
}

/** Intervals along the axis intersect with positive length. Does not check that both are on the same wall. */
export function openingsOverlap(a: Opening, b: Opening): boolean {
  const [a0, a1] = openingInterval(a);
  const [b0, b1] = openingInterval(b);
  return Math.min(a1, b1) - Math.max(a0, b0) > EPS;
}
