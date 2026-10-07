import type { Background, Vec2 } from '@/core/model/types';
import { dist } from '@/core/geometry/vec';

/**
 * Rescales the background so that the world distance p1-p2 becomes realCm. World point p1 stays on
 * the same image pixel, hence fixed in the world: with the image at (x, y) rotated around its
 * top-left corner, p1 = pos + R * (q * s), so scaling s by k only moves pos to p1 - k * (p1 - pos)
 * whatever the rotation. Throws on invalid input (the UI never calls it with one).
 */
export function calibrateBackground(bg: Background, p1: Vec2, p2: Vec2, realCm: number): Background {
  if (![p1.x, p1.y, p2.x, p2.y, realCm].every(Number.isFinite)) throw new Error('calibrateBackground: non-finite input');
  if (realCm <= 0) throw new Error('calibrateBackground: realCm must be positive');
  const d = dist(p1, p2);
  if (d === 0) throw new Error('calibrateBackground: points are identical');
  const k = realCm / d;
  return {
    ...bg,
    scale: bg.scale * k,
    x: p1.x - k * (p1.x - bg.x),
    y: p1.y - k * (p1.y - bg.y),
  };
}
