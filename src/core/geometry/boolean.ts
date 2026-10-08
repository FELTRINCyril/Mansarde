import pc from 'polygon-clipping';
import type { PolygonWithHoles, Ring, Shape } from '../model/types';
import { area } from './polygon';

/**
 * A boolean operation that polygon-clipping could not complete, even after every retry (see
 * robust below). Callers that must never fail (computeWallShape, subtractOpenings) catch it and
 * fall back to a degraded shape.
 */
export class BooleanOpError extends Error {}

/** Closes the ring (first point repeated), as polygon-clipping expects. */
export function ringToPc(r: Ring): [number, number][] {
  const out = r.map((p): [number, number] => [p.x, p.y]);
  const first = out[0];
  if (first) out.push([first[0], first[1]]);
  return out;
}

export function toPc(shape: Shape): pc.MultiPolygon {
  return shape.map((poly) => [ringToPc(poly.outer), ...poly.holes.map(ringToPc)]);
}

function ringFromPc(r: pc.Ring): Ring {
  const pts = r.map(([x, y]) => ({ x, y }));
  const first = r[0];
  const last = r[r.length - 1];
  if (first && last && r.length > 1 && first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts;
}

/** Drops the closing point of each ring; first ring of each polygon is the outer ring, others are holes. */
export function fromPc(mp: pc.MultiPolygon): Shape {
  return mp.map((poly): PolygonWithHoles => {
    const [outer, ...holes] = poly;
    return { outer: outer ? ringFromPc(outer) : [], holes: holes.map(ringFromPc) };
  });
}

/** Smallest ring area (cm2) worth feeding to the boolean library; below it a ring is degenerate. */
const MIN_RING_AREA = 1e-9;

/** At least 3 finite points enclosing a non-zero area. */
export const isUsableRing = (r: Ring): boolean =>
  r.length >= 3 && r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && area(r) >= MIN_RING_AREA;

type Op = (geom: pc.Geom, ...geoms: pc.Geom[]) => pc.MultiPolygon;
type Coord = (v: number, axis: 0 | 1) => number;

/**
 * Coordinate transforms tried in turn when polygon-clipping fails ("Unable to complete output
 * ring", "Unable to find segment in SweepLine tree", "Infinite loop"; the loop guards are lowered
 * by vite.polygonClipping.ts so that the last one fails fast): the raw input, then the
 * coordinates snapped to 1e-6, 1e-3 and 0.1 cm grids, then tiny deterministic perturbations.
 * Every transform is a function of the coordinate value alone, so points shared by several rings
 * stay shared, and the result is reproducible (no randomness).
 */
const snapTo = (step: number): Coord => (v) => Math.round(v / step) * step;
const JITTER_CM = 1e-4;
/** Deterministic pseudo-random value in [-1, 1] for a coordinate (classic sin hash). */
const hash = (v: number, salt: number): number => {
  const s = Math.sin(v * 12.9898 + salt * 78.233) * 43758.5453;
  return 2 * (s - Math.floor(s)) - 1;
};
const jitter = (salt: number): Coord => (v, axis) => v + JITTER_CM * hash(v, salt * 2 + axis);
const RETRY_TRANSFORMS: Array<Coord | null> = [null, snapTo(1e-6), snapTo(1e-3), snapTo(0.1), jitter(1), jitter(2), jitter(3)];

function transformed(geoms: pc.MultiPolygon[], f: Coord): pc.MultiPolygon[] {
  return geoms.map((mp) => mp.map((poly) => poly.map((ring) => ring.map(([x, y]): pc.Pair => [f(x, 0), f(y, 1)]))));
}

/** Runs op, retrying with each transform of RETRY_TRANSFORMS; throws BooleanOpError if every attempt fails. */
function robust(op: Op, geoms: pc.MultiPolygon[]): pc.MultiPolygon {
  let last: unknown = null;
  for (const f of RETRY_TRANSFORMS) {
    const [first, ...rest] = f ? transformed(geoms, f) : geoms;
    if (!first) return [];
    try {
      return op(first, ...rest);
    } catch (e) {
      last = e;
    }
  }
  throw new BooleanOpError(`boolean operation failed: ${last instanceof Error ? last.message : String(last)}`);
}

/** Union of the usable rings (degenerate ones are ignored). Throws BooleanOpError when it cannot be computed. */
export function unionRings(rings: Ring[]): Shape {
  const polys = rings.filter(isUsableRing).map((r): pc.MultiPolygon => [[ringToPc(r)]]);
  return polys.length === 0 ? [] : fromPc(robust(pc.union, polys));
}

/** Throws BooleanOpError when the union cannot be computed. */
export function unionShapes(shapes: Shape[]): Shape {
  const polys = shapes.filter((s) => s.length > 0).map(toPc);
  return polys.length === 0 ? [] : fromPc(robust(pc.union, polys));
}

const copyRing = (r: Ring): Ring => r.map((p) => ({ x: p.x, y: p.y }));

/** Deep copy of a shape (no array or point shared with the input). */
export const copyShape = (s: Shape): Shape => s.map((p) => ({ outer: copyRing(p.outer), holes: p.holes.map(copyRing) }));

/**
 * subject minus the usable clip rings. Always a new shape: never the subject itself, even with
 * nothing to subtract. Throws BooleanOpError when the difference cannot be computed.
 */
export function difference(subject: Shape, clip: Ring[]): Shape {
  if (subject.length === 0) return [];
  const cuts = clip.filter(isUsableRing);
  if (cuts.length === 0) return copyShape(subject);
  return fromPc(robust(pc.difference, [toPc(subject), ...cuts.map((r): pc.MultiPolygon => [[ringToPc(r)]])]));
}
