import type { Level, PolygonWithHoles, Ring, Shape, Slope, Vec2 } from '../model/types';
import { BooleanOpError, intersection } from '../geometry/boolean';
import { area, bbox, signedArea } from '../geometry/polygon';
import { slopeFrame, slopeHeightAt } from '../geometry/slopes';
import { add, cross, dot, len, normalize, perp, scale, sub } from '../geometry/vec';
import { triangulate } from './triangulate';

/**
 * Exact meshes under slopes. The ceiling is the minimum of the level height and of the slope
 * terms over a point; each term is affine where it applies, and the walls are also capped by
 * their own height. The plan is cut by every line where a term starts, stops or changes formula
 * (start, end and lateral lines of each slope) and every line where two terms are equal: in each
 * resulting cell the same terms apply and the same one is the lowest, so the height is affine
 * over the cell and a planar face per cell is exact. A height field is therefore chosen per cell
 * from an interior point (`probe`), then evaluated at the cell vertices.
 */

/** Height (cm) as a function of the plan point, affine over one cell. */
export type Field = (p: Vec2) => number;

/** A line of the plan: point q, unit direction e. */
export interface Line { q: Vec2; e: Vec2 }

const usable = (s: Slope): boolean =>
  s.depth > 0 && Number.isFinite(s.depth) && Number.isFinite(s.heightStart) && Number.isFinite(s.heightEnd) && slopeFrame(s).length > 0;

export const usableSlopes = (level: Level): Slope[] => Object.values(level.slopes).filter(usable);

/**
 * The slope terms that apply at m, as formulas valid over the whole cell of m: the linear
 * formula of each slope whose zone contains m before its end line, heightEnd beyond it.
 */
export function slopeTermsAt(level: Level, m: Vec2): Field[] {
  const out: Field[] = [];
  for (const s of usableSlopes(level)) {
    if (slopeHeightAt(s, m) === null) continue;
    const { normal: n } = slopeFrame(s);
    if (dot(sub(m, s.a), n) >= s.depth) out.push(() => s.heightEnd);
    else out.push((p) => s.heightStart + ((s.heightEnd - s.heightStart) * dot(sub(p, s.a), n)) / s.depth);
  }
  return out;
}

/** Ceiling without beams over the cell of m: min of the level height and of the slope terms there. */
export function ceilingField(level: Level, m: Vec2): Field {
  const terms = slopeTermsAt(level, m);
  return (p) => terms.reduce((h, t) => Math.min(h, t(p)), level.height);
}

const LINE_EPS = 1e-9;

function sameLine(a: Line, b: Line): boolean {
  return Math.abs(cross(a.e, b.e)) < LINE_EPS && Math.abs(cross(a.e, sub(b.q, a.q))) < 1e-6;
}

/**
 * Lines where the height can change formula: start, end and lateral lines of every slope; for
 * each slope, the line where it reaches each of `constants` (strictly between its start and end
 * lines); for each pair of slopes, the line where their linear formulas are equal.
 */
export function cutLines(level: Level, constants: number[]): Line[] {
  const out: Line[] = [];
  const push = (q: Vec2, d: Vec2): void => {
    const e = normalize(d);
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || len(e) === 0) return;
    const line = { q, e };
    if (!out.some((l) => sameLine(l, line))) out.push(line);
  };
  const slopes = usableSlopes(level);
  const linear = slopes.map((s) => {
    const f = slopeFrame(s);
    const k = (s.heightEnd - s.heightStart) / s.depth;
    // h(p) = c + dot(w, p) before the end line
    return { s, f, k, w: scale(f.normal, k), c: s.heightStart - k * dot(s.a, f.normal) };
  });
  for (const { s, f, k } of linear) {
    push(s.a, f.dir);
    push(add(s.a, scale(f.normal, s.depth)), f.dir);
    push(s.a, f.normal);
    push(s.b, f.normal);
    if (k === 0) continue;
    for (const c of constants) {
      if (!Number.isFinite(c)) continue;
      const d = (c - s.heightStart) / k;
      if (d > 1e-9 && d < s.depth - 1e-9) push(add(s.a, scale(f.normal, d)), f.dir);
    }
  }
  for (let i = 0; i < linear.length; i++) {
    for (let j = i + 1; j < linear.length; j++) {
      const a = linear[i]!;
      const b = linear[j]!;
      const w = sub(a.w, b.w);
      const l2 = dot(w, w);
      if (l2 < 1e-18) continue;
      push(scale(w, -(a.c - b.c) / l2), perp(w));
    }
  }
  return out;
}

/** Points closer than this (cm) to a cut line count as on it: such a piece is not cut. */
const SIDE_EPS = 1e-6;
/** Pieces smaller than this (cm2) are slivers of the boolean operations. */
const MIN_PIECE_AREA = 1e-6;

const netArea = (p: PolygonWithHoles): number => area(p.outer) - p.holes.reduce((s, h) => s + area(h), 0);

/** The half-plane on the left of the line (or right), as a rectangle covering `box` and more. */
function halfPlane(line: Line, box: { minX: number; minY: number; maxX: number; maxY: number }, left: boolean): Ring {
  const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const c0 = add(line.q, scale(line.e, dot(sub(c, line.q), line.e)));
  const big = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) + len(sub(c, c0)) + 100;
  const n = scale(perp(line.e), left ? big : -big);
  const u = scale(line.e, big);
  return [sub(c0, u), add(c0, u), add(add(c0, u), n), add(sub(c0, u), n)];
}

/**
 * The polygons of `shape` cut by every line (each piece crossed by a line is split in two by
 * boolean intersections with both half-planes). A split that fails even after the retries of
 * boolean.ts keeps the piece whole (degraded: its heights are then only exact at its probe).
 */
export function splitByLines(shape: Shape, lines: Line[]): { pieces: PolygonWithHoles[]; degraded: boolean } {
  let pieces = shape.filter((p) => p.outer.length >= 3 && netArea(p) > MIN_PIECE_AREA);
  let degraded = false;
  for (const line of lines) {
    const next: PolygonWithHoles[] = [];
    for (const piece of pieces) {
      let pos = false;
      let neg = false;
      for (const p of piece.outer) {
        const s = cross(line.e, sub(p, line.q));
        if (s > SIDE_EPS) pos = true;
        else if (s < -SIDE_EPS) neg = true;
      }
      if (!(pos && neg)) {
        next.push(piece);
        continue;
      }
      const box = bbox(piece.outer)!;
      try {
        const parts = [...intersection([piece], halfPlane(line, box, true)), ...intersection([piece], halfPlane(line, box, false))];
        next.push(...parts.filter((p) => p.outer.length >= 3 && netArea(p) > MIN_PIECE_AREA));
      } catch (e) {
        if (!(e instanceof BooleanOpError)) throw e;
        degraded = true;
        next.push(piece);
      }
    }
    pieces = next;
  }
  return { pieces, degraded };
}

/**
 * A piece ready to be meshed: rings oriented (outer counter-clockwise, holes clockwise, so the
 * outside of the material is on the right of every edge), its triangulation and an interior
 * point (centroid of its largest triangle).
 */
export interface Cell { rings: Ring[]; pts: Vec2[]; tris: number[]; probe: Vec2 }

const oriented = (r: Ring, positive: boolean): Ring => (signedArea(r) > 0 === positive ? r : [...r].reverse());

export function toCell(poly: PolygonWithHoles): Cell | null {
  const outer = oriented(poly.outer, true);
  const holes = poly.holes.filter((h) => h.length >= 3).map((h) => oriented(h, false));
  const tris = triangulate(outer, holes);
  const pts = [outer, ...holes].flat();
  let best = 0;
  let probe: Vec2 | null = null;
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = pts[tris[t]!]!;
    const b = pts[tris[t + 1]!]!;
    const c = pts[tris[t + 2]!]!;
    const s = signedArea([a, b, c]);
    if (s > best) {
      best = s;
      probe = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    }
  }
  return probe ? { rings: [outer, ...holes], pts, tris, probe } : null;
}

export const toCells = (pieces: PolygonWithHoles[]): Cell[] => pieces.map(toCell).filter((c): c is Cell => c !== null);

/** The cells of `shape` cut by the lines of the level for these constants. */
export function cellsOf(level: Level, shape: Shape, constants: number[]): Cell[] {
  return toCells(splitByLines(shape, cutLines(level, constants)).pieces);
}

/** Points closer than this (cm) to an edge split it (T-junctions between cells). */
const ON_EDGE_EPS = 1e-6;

/**
 * Every edge of the cell with its outward unit normal (outside of the material on its right),
 * split at each of `junctions` lying on it: a neighbouring cell (or another solid) may only
 * border part of an edge, and each part is probed on its own.
 */
export function cellEdges(cell: Cell, junctions: Vec2[] = []): Array<{ a: Vec2; b: Vec2; out: Vec2 }> {
  const out: Array<{ a: Vec2; b: Vec2; out: Vec2 }> = [];
  for (const r of cell.rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % r.length]!;
      const d = sub(b, a);
      const l = len(d);
      if (!(l > 1e-9)) continue;
      const n = { x: d.y / l, y: -d.x / l };
      const ts: number[] = [];
      for (const p of junctions) {
        const rel = sub(p, a);
        const t = dot(rel, d) / (l * l);
        if (t * l > ON_EDGE_EPS && (1 - t) * l > ON_EDGE_EPS && Math.abs(cross(d, rel)) / l <= ON_EDGE_EPS) ts.push(t);
      }
      ts.sort((x, y) => x - y);
      let prev = a;
      for (const t of ts) {
        const p = add(a, scale(d, t));
        if (len(sub(p, prev)) > ON_EDGE_EPS) out.push({ a: prev, b: p, out: n });
        prev = p;
      }
      out.push({ a: prev, b, out: n });
    }
  }
  return out;
}

/** The vertices of the cells and of the shapes, where their edges can meet another edge. */
export const junctionsOf = (cells: Cell[], shapes: Shape[] = []): Vec2[] => [
  ...cells.flatMap((c) => c.pts),
  ...shapes.flatMap((s) => s.flatMap((p) => [p.outer, ...p.holes].flat())),
];

/** Distance (cm) from an edge midpoint to the point probing what lies beyond the edge. */
export const PROBE = 1e-3;

/** The point just beyond the middle of the edge a -> b, on the side `out`. */
export const beyond = (a: Vec2, b: Vec2, out: Vec2): Vec2 => ({ x: (a.x + b.x) / 2 + out.x * PROBE, y: (a.y + b.y) / 2 + out.y * PROBE });

/** Heights of the slope ends (constants of the ceiling beyond the end lines). */
export const slopeEnds = (level: Level): number[] => usableSlopes(level).map((s) => s.heightEnd);
