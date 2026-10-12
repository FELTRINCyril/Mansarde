import type { Level, Shape, Vec2 } from '../model/types';
import { lerp } from '../geometry/vec';
import { UP, type MeshBuilder } from './builder';
import { beyond, cellAt, cellEdges, cellsOf, junctionsOf, type Cell, type Field } from './cells';

/**
 * Solids made of vertical columns. A column is a plan region over which the solid occupies one
 * or more height intervals, each given by bottom and top fields chosen from a point of the plan
 * cell (see cells.ts). Several columns side by side form one solid (a wall and the sill and
 * lintel of its openings). Every face is emitted where it can be seen and only there: tops and
 * undersides of each interval, and on each side the parts of an interval that the columns beyond
 * that side do not occupy (a wall jamb only between sill and lintel, a step where the height
 * jumps under a slope, nothing between two equal neighbours), so each solid is closed.
 */

/** A height interval of a column; `floor`: it stands on the floor (no underside emitted). */
export interface Interval {
  bottom: Field;
  top: Field;
  floor?: boolean;
  /** Zero thickness surface: only its top face is emitted (threshold of a door). */
  flat?: boolean;
}

export interface Column {
  region: Shape;
  /** Heights at which the column top or bottom can change formula (see cutLines). */
  constants: number[];
  /** The intervals over the cell containing m, as fields valid over that whole cell. */
  intervals(m: Vec2): Interval[];
}

/** Heights closer than this (cm) are equal. */
const H_EPS = 1e-7;

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

/** The parts of `own` not occupied by `others` on the side a -> b, facing `out`. */
function exposedSides(b: MeshBuilder, a: Vec2, e: Vec2, out: Vec2, own: Interval, others: Interval[]): void {
  const fs: Field[] = [own.bottom, own.top, ...others.flatMap((o) => [o.bottom, o.top])];
  const ts = [0, ...crossings(fs.map((f) => [f(a), f(e)] as [number, number])), 1];
  for (let k = 0; k + 1 < ts.length; k++) {
    const pa = lerp(a, e, ts[k]!);
    const pb = lerp(a, e, ts[k + 1]!);
    const pm = lerp(pa, pb, 0.5);
    // within the sub-segment no two fields cross: the order at its middle holds at both ends
    const band = (lo: Field, hi: Field): void => b.band(pa, pb, [lo(pa), lo(pb)], [hi(pa), hi(pb)], out);
    const occupied = others.filter((o) => o.top(pm) - o.bottom(pm) > H_EPS).sort((x, y) => x.bottom(pm) - y.bottom(pm));
    let cur = own.bottom;
    for (const o of occupied) {
      if (cur(pm) >= own.top(pm)) break;
      if (o.bottom(pm) > cur(pm) + H_EPS) band(cur, o.bottom(pm) < own.top(pm) ? o.bottom : own.top);
      if (o.top(pm) > cur(pm)) cur = o.top;
    }
    if (own.top(pm) > cur(pm) + H_EPS) band(cur, own.top);
  }
}

/** Meshes the solid made of these columns (regions not overlapping) into b. */
export function emitColumns(b: MeshBuilder, level: Level, columns: Column[]): void {
  const built = columns.map((col) => ({ col, cells: cellsOf(level, col.region, col.constants) }));
  const junctions = built.flatMap((x) => junctionsOf(x.cells));
  // what lies beyond an edge: the intervals of the cell there, from that cell's own formulas, so
  // that both sides of a shared edge are computed from the same pair of fields
  const beyondIntervals = (q: Vec2): Interval[] => {
    for (const x of built) {
      const c = cellAt(x.cells, q);
      if (c) return x.col.intervals(c.probe).filter((iv) => !iv.flat);
    }
    return [];
  };
  for (const { col, cells } of built) {
    for (const cell of cells) emitCell(b, cell, col.intervals(cell.probe), junctions, beyondIntervals);
  }
}

function emitCell(b: MeshBuilder, cell: Cell, own: Interval[], junctions: Vec2[], beyondIntervals: (q: Vec2) => Interval[]): void {
  const solid: Interval[] = [];
  for (const iv of own) {
    if (iv.flat) {
      b.surface(cell.pts, cell.tris, iv.top, 'up', UP);
      continue;
    }
    if (!cell.pts.some((p) => iv.top(p) - iv.bottom(p) > H_EPS)) continue;
    solid.push(iv);
    b.surface(cell.pts, cell.tris, iv.top, 'up');
    if (!iv.floor) b.surface(cell.pts, cell.tris, iv.bottom, 'down');
  }
  if (solid.length === 0) return;
  for (const { a, b: e, out } of cellEdges(cell, junctions)) {
    const others = beyondIntervals(beyond(a, e, out));
    for (const iv of solid) exposedSides(b, a, e, out, iv, others);
  }
}
