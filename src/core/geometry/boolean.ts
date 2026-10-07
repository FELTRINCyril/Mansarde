import pc from 'polygon-clipping';
import type { PolygonWithHoles, Ring, Shape } from '../model/types';

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

function runUnion(polys: pc.MultiPolygon[]): Shape {
  const [first, ...rest] = polys;
  if (!first) return [];
  return fromPc(pc.union(first, ...rest));
}

export function unionRings(rings: Ring[]): Shape {
  return runUnion(rings.map((r) => [[ringToPc(r)]]));
}

export function unionShapes(shapes: Shape[]): Shape {
  return runUnion(shapes.map(toPc));
}

export function difference(subject: Shape, clip: Ring[]): Shape {
  if (subject.length === 0) return [];
  if (clip.length === 0) return subject;
  return fromPc(pc.difference(toPc(subject), ...clip.map((r): pc.MultiPolygon => [[ringToPc(r)]])));
}
