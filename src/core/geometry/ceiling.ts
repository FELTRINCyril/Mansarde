import type { Level, Ring, Shape, Slope, Vec2 } from '../model/types';
import { beamBottomAt, beamFootprint } from './beams';
import { BooleanOpError, intersection, isUsableRing } from './boolean';
import { intersectionVertices, pointInRing, ringEdges, signedArea } from './polygon';
import { slopeFrame, slopeHeightAtDistance, slopesCeilingAt } from './slopes';
import { add, cross, dot, scale, sub } from './vec';

/** Ceiling height at p without the beams: the lowest of the level height and of the slopes over p (spec 5.1). */
export function ceilingWithoutBeams(level: Level, p: Vec2): number {
  return slopesCeilingAt(level, p);
}

/** Ceiling height at p: ceilingWithoutBeams, lowered by the underside of every beam whose footprint contains p. */
export function ceilingAt(level: Level, p: Vec2): number {
  let h = ceilingWithoutBeams(level, p);
  for (const b of Object.values(level.beams)) {
    if (!pointInRing(p, beamFootprint(b))) continue;
    const bottom = beamBottomAt(level, b, p);
    if (bottom < h) h = bottom;
  }
  return h;
}

const usableSlope = (s: Slope): boolean => s.depth > 0 && (s.a.x !== s.b.x || s.a.y !== s.b.y);

/**
 * The slope zone, bounded laterally by the start line, from the start line to beyond the end
 * line far enough to contain every point of `footprint` (the zone itself goes on forever, at
 * heightEnd).
 */
function extendedBand(s: Slope, footprint: Ring): Ring {
  const f = slopeFrame(s);
  let far = s.depth;
  for (const p of footprint) far = Math.max(far, dot(sub(p, s.a), f.normal));
  const n = scale(f.normal, far + 1);
  return [{ ...s.a }, { ...s.b }, add(s.b, n), add(s.a, n)];
}

/** Where `ring` stands against the convex ring `convex`: inside it, outside it (or only touching it), or cut by it. */
function classify(ring: Ring, convex: Ring): 'inside' | 'outside' | 'cut' {
  const orient = Math.sign(signedArea(convex));
  let inside = true;
  for (const [a, b] of ringEdges(convex)) {
    const e = sub(b, a);
    let anyIn = false;
    for (const p of ring) {
      const side = orient * cross(e, sub(p, a));
      if (side > 0) anyIn = true;
      else if (side < 0) inside = false;
    }
    if (!anyIn) return 'outside';
  }
  return inside ? 'inside' : 'cut';
}

/**
 * Vertices of the intersection of `footprint` with the convex rings `clips`, or null when it is
 * empty (or has no area). Built with boolean.ts; if polygon-clipping fails even after its retries,
 * the vertices are enumerated directly (intersectionVertices), which is just as exact here.
 */
function cutVertices(footprint: Ring, clips: Ring[]): Vec2[] | null {
  const cutting: Ring[] = [];
  for (const c of clips) {
    if (!isUsableRing(c)) return null;
    const k = classify(footprint, c);
    if (k === 'outside') return null;
    if (k === 'cut') cutting.push(c);
  }
  if (cutting.length === 0) return footprint;
  try {
    let shape: Shape = [{ outer: footprint, holes: [] }];
    for (const c of cutting) shape = intersection(shape, c);
    return shape.length === 0 ? null : shape.flatMap((poly) => [...poly.outer, ...poly.holes.flat()]);
  } catch (e) {
    if (!(e instanceof BooleanOpError)) throw e;
    const pts = intersectionVertices([footprint, ...cutting]);
    return pts.length === 0 ? null : pts;
  }
}

/**
 * Lowest ceiling over the whole footprint and a point where it is reached (spec 5.1). Exact: the
 * footprint is cut by the zone of each slope and the slope height, a monotonic function of the
 * distance to its start line, is lowest at a vertex of the cut; each beam contributes its
 * underside over its intersection with the footprint, cut again by each slope zone in 'ceiling'
 * mode since its underside follows the slopes. With nothing lower than the level height, `at` is
 * the first vertex of the footprint. A footprint without area gets the lowest ceilingAt of its
 * vertices; an empty one the level height at the origin.
 */
export function ceilingUnder(level: Level, footprint: Ring): { height: number; at: Vec2 } {
  const first = footprint[0];
  if (!first) return { height: level.height, at: { x: 0, y: 0 } };
  let best = { height: level.height, at: { x: first.x, y: first.y } };
  const consider = (height: number, p: Vec2): void => {
    if (height < best.height) best = { height, at: { x: p.x, y: p.y } };
  };
  if (!isUsableRing(footprint)) {
    for (const p of footprint) consider(ceilingAt(level, p), p);
    return best;
  }

  const slopes = Object.values(level.slopes).filter(usableSlope);
  const bands = slopes.map((s) => extendedBand(s, footprint));
  slopes.forEach((s, i) => {
    const f = slopeFrame(s);
    for (const p of cutVertices(footprint, [bands[i]!]) ?? []) {
      consider(slopeHeightAtDistance(s, dot(sub(p, s.a), f.normal)), p);
    }
  });

  for (const b of Object.values(level.beams)) {
    const ring = beamFootprint(b);
    const pieces = b.mode === 'ceiling' ? [[ring], ...bands.map((band) => [ring, band])] : [[ring]];
    for (const clips of pieces) {
      for (const p of cutVertices(footprint, clips) ?? []) consider(beamBottomAt(level, b, p), p);
    }
  }
  return best;
}
