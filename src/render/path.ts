import type { Ring, Shape, Vec2 } from '@/core/model/types';
import { num } from './style';

const pt = (p: Vec2): string => `${num(p.x)} ${num(p.y)}`;

/** Closed subpaths "M x y L ... Z", one per ring with at least 3 points. */
export function ringsPath(rings: Ring[]): string {
  return rings
    .filter((r) => r.length >= 3)
    .map((r) => `M${r.map(pt).join('L')}Z`)
    .join('');
}

/** Every outer ring and hole of the shape, to be filled with fill-rule evenodd. */
export function shapePath(shape: Shape): string {
  return ringsPath(shape.flatMap((poly) => [poly.outer, ...poly.holes]));
}
