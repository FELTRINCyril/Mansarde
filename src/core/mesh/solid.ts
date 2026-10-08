import type { PolygonWithHoles, Shape, Vec2 } from '../model/types';
import { pointInPolygon } from '../geometry/polygon';
import { lerp } from '../geometry/vec';
import type { MeshBuilder } from './builder';
import { beyond, cellEdges, junctionsOf, type Cell, type Field } from './cells';

/**
 * A vertical prism over plan cells, from bottom(m) to top(m) where m is the probe of each cell
 * (see cells.ts). Its side faces are only emitted where they can be seen: on an edge whose
 * other side is outside the solid, the full side; on an edge between two cells of the solid,
 * the steps (the parts of this cell's side above the neighbour's top or below its bottom), so
 * that the surface stays closed when the heights jump (lateral end of a slope, walls of
 * different heights); nothing where `covered` says another solid hides it.
 */
export interface SolidSpec {
  inside(p: Vec2): boolean;
  covered?(p: Vec2): boolean;
  bottom(m: Vec2): Field;
  top(m: Vec2): Field;
  /** Emit the underside (not for walls standing on the floor). */
  bottomFace: boolean;
  /** Other shapes whose vertices may split the edges of the cells (see cellEdges). */
  neighbours?: Shape[];
}

/** Heights closer than this (cm) are equal. */
const H_EPS = 1e-7;

export const inShape = (shape: Shape) => (p: Vec2): boolean => shape.some((poly: PolygonWithHoles) => pointInPolygon(p, poly));

/** Parameters in (0, 1) where two of the linear functions (given at both ends) cross. */
function crossings(fs: Array<[number, number]>): number[] {
  const ts: number[] = [];
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const d0 = fs[i]![0] - fs[j]![0];
      const d1 = fs[i]![1] - fs[j]![1];
      if (d0 * d1 < 0) ts.push(d0 / (d0 - d1));
    }
  }
  return ts.sort((x, y) => x - y);
}

export function emitSolid(b: MeshBuilder, cells: Cell[], spec: SolidSpec): void {
  const junctions = junctionsOf(cells, spec.neighbours);
  for (const cell of cells) {
    const B = spec.bottom(cell.probe);
    const T = spec.top(cell.probe);
    if (!cell.pts.some((p) => T(p) - B(p) > H_EPS)) continue;
    b.surface(cell.pts, cell.tris, T, 'up');
    if (spec.bottomFace) b.surface(cell.pts, cell.tris, B, 'down');
    for (const { a, b: e, out } of cellEdges(cell, junctions)) {
      const q = beyond(a, e, out);
      if (spec.covered?.(q)) continue;
      if (!spec.inside(q)) {
        b.band(a, e, [B(a), B(e)], [T(a), T(e)], out);
        continue;
      }
      const Bn = spec.bottom(q);
      const Tn = spec.top(q);
      const fs: Array<(p: Vec2) => number> = [B, T, Bn, Tn];
      const ts = [0, ...crossings(fs.map((f) => [f(a), f(e)] as [number, number])), 1];
      for (let k = 0; k + 1 < ts.length; k++) {
        const pa = lerp(a, e, ts[k]!);
        const pb = lerp(a, e, ts[k + 1]!);
        // above the neighbour: from max(B, Tn) to T; below it: from B to min(T, Bn)
        b.band(pa, pb, [Math.max(B(pa), Tn(pa)), Math.max(B(pb), Tn(pb))], [T(pa), T(pb)], out);
        b.band(pa, pb, [B(pa), B(pb)], [Math.min(T(pa), Bn(pa)), Math.min(T(pb), Bn(pb))], out);
      }
    }
  }
}
