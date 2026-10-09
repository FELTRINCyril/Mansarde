import { deg2rad, lerp } from '@/core/geometry/vec';
import type { Vec2 } from '@/core/model/types';
import type { Box } from './dimLayout';

/** Fractions of the line tried in turn: the middle first, then away from it. */
const CANDIDATES = [0.5, 0.35, 0.65, 0.2, 0.8];

const overlaps = (a: Box, b: Box): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * Where to write a label of size width x height (world units, turned by angleDeg) on the segment
 * a-b: its middle, unless the label would overlap one of the obstacles (room names, drawn above
 * it), then the first of a few points further along the segment that is clear; the middle when
 * none is.
 */
export function labelAlong(a: Vec2, b: Vec2, width: number, height: number, angleDeg: number, obstacles: Box[]): Vec2 {
  const r = deg2rad(angleDeg);
  const hx = (Math.abs(Math.cos(r)) * width + Math.abs(Math.sin(r)) * height) / 2;
  const hy = (Math.abs(Math.sin(r)) * width + Math.abs(Math.cos(r)) * height) / 2;
  for (const t of CANDIDATES) {
    const p = lerp(a, b, t);
    const box = { minX: p.x - hx, minY: p.y - hy, maxX: p.x + hx, maxY: p.y + hy };
    if (!obstacles.some((o) => overlaps(box, o))) return p;
  }
  return lerp(a, b, 0.5);
}
