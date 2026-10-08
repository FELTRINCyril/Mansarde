import type { Level, Ring, Shape, Slope, Vec2 } from '../model/types';
import { beamBottomAt, beamFootprint } from './beams';
import { BooleanOpError, intersection, isUsableRing } from './boolean';
import { area, bbox, clipConvex, convexParts, intersectionVertices, pointInRing, ringEdges, signedArea, vertexCentroid } from './polygon';
import { slopeBand, slopeFrame, slopeHeightAtDistance, slopesCeilingAt } from './slopes';
import { add, cross, dist, dot, scale, sub } from './vec';

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
 * Fallback of ceilingUnder for a footprint that is not a simple polygon (never produced by
 * objectFootprint or cupboardFootprint): polygon-clipping cuts, evaluated at their vertices; `at`
 * is such a vertex (not moved inside).
 */
function ceilingUnderByBoolean(level: Level, footprint: Ring): { height: number; at: Vec2 } {
  const first = footprint[0]!;
  let best = { height: level.height, at: { x: first.x, y: first.y } };
  const consider = (height: number, p: Vec2): void => {
    if (height < best.height) best = { height, at: { x: p.x, y: p.y } };
  };
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

/**
 * A convex piece of a convex footprint over which the ceiling has one affine formula `term`
 * (the ceiling at a point is the minimum of the terms of the regions that contain it, edges
 * included).
 */
export interface CeilingRegion { ring: Ring; term: (p: Vec2) => number }

/** Overlaps of positive area only: a mere contact does not lower the ceiling. */
const MIN_REGION_AREA = 1e-9;

function overlap(subject: Ring, clip: Ring): Ring | null {
  const sb = bbox(subject)!;
  const cb = bbox(clip)!;
  if (sb.minX >= cb.maxX || cb.minX >= sb.maxX || sb.minY >= cb.maxY || cb.minY >= sb.maxY) return null;
  const r = clipConvex(subject, clip);
  return r.length >= 3 && area(r) > MIN_REGION_AREA ? r : null;
}

/**
 * The ceiling over the CONVEX ring `part` as convex regions with affine terms (the exact
 * decomposition of ceilingAt, beam and slope edges taken as closed): the whole part at the level
 * height; for each slope, its overlap with the band (linear term) and with the zone beyond the end
 * line (heightEnd); for each beam, its overlap with the part at its fixed bottom, or in 'ceiling'
 * mode at the level height minus the drop and cut again by each slope zone (slope term minus the
 * drop). Overlaps without area are left out.
 */
export function ceilingRegions(level: Level, part: Ring): CeilingRegion[] {
  const regions: CeilingRegion[] = [{ ring: part, term: () => level.height }];
  const zones: CeilingRegion[] = [];
  for (const s of Object.values(level.slopes)) {
    if (!usableSlope(s)) continue;
    const f = slopeFrame(s);
    let far = s.depth;
    for (const p of part) far = Math.max(far, dot(sub(p, s.a), f.normal));
    const end = scale(f.normal, s.depth);
    const beyond = scale(f.normal, far + 1);
    const k = (s.heightEnd - s.heightStart) / s.depth;
    zones.push(
      { ring: slopeBand(s), term: (p) => s.heightStart + k * dot(sub(p, s.a), f.normal) },
      { ring: [add(s.a, end), add(s.b, end), add(s.b, beyond), add(s.a, beyond)], term: () => s.heightEnd },
    );
  }
  for (const z of zones) {
    const r = overlap(part, z.ring);
    if (r) regions.push({ ring: r, term: z.term });
  }
  for (const b of Object.values(level.beams)) {
    const rect = beamFootprint(b);
    if (!isUsableRing(rect)) continue;
    const r = overlap(part, rect);
    if (!r) continue;
    if (b.mode === 'fixed') {
      regions.push({ ring: r, term: () => b.bottom });
      continue;
    }
    regions.push({ ring: r, term: () => level.height - b.drop });
    for (const z of zones) {
      const rz = overlap(r, z.ring);
      if (rz) regions.push({ ring: rz, term: (p) => z.term(p) - b.drop });
    }
  }
  return regions;
}

/** How far (cm) a reported point is moved from a region vertex towards the region's center. */
const INSET = 1e-8;

/** p moved INSET towards c (at most halfway), so that it lies strictly inside a convex region. */
function inset(p: Vec2, c: Vec2): Vec2 {
  const d = dist(p, c);
  if (d === 0) return { x: p.x, y: p.y };
  const t = Math.min(0.5, INSET / d);
  return { x: p.x + (c.x - p.x) * t, y: p.y + (c.y - p.y) * t };
}

/**
 * Lowest ceiling over the whole footprint and a point where it is reached (spec 5.1). Exact: the
 * footprint is split into convex parts (itself when convex, else triangles), each cut into the
 * regions of ceilingRegions by convex clipping; an affine term is lowest at a vertex of its
 * region. `at` is that vertex, or the first vertex of the footprint when nothing is lower than the
 * level height. It lies in the footprint or on its outline. When ceilingAt does not give the
 * height there (vertex on a beam edge, where pointInRing may miss the beam), it is moved 1e-8 cm
 * into its region, so that ceilingAt(at) is the height within the slope gradient times 1e-8 cm. A footprint that is not a
 * simple polygon falls back to polygon-clipping (ceilingUnderByBoolean). A footprint without area
 * gets the lowest ceilingAt of its vertices; an empty one the level height at the origin.
 */
export function ceilingUnder(level: Level, footprint: Ring): { height: number; at: Vec2 } {
  const first = footprint[0];
  if (!first) return { height: level.height, at: { x: 0, y: 0 } };
  if (!isUsableRing(footprint)) {
    let best = { height: level.height, at: { x: first.x, y: first.y } };
    for (const p of footprint) {
      const h = ceilingAt(level, p);
      if (h < best.height) best = { height: h, at: { x: p.x, y: p.y } };
    }
    return best;
  }
  const parts = convexParts(footprint);
  if (!parts) return ceilingUnderByBoolean(level, footprint);
  let height = level.height;
  let at: Vec2 = first;
  let region: Ring = parts.find((r) => r.includes(first)) ?? parts[0]!;
  for (const part of parts) {
    const regions = ceilingRegions(level, part);
    for (let i = 1; i < regions.length; i++) {
      const { ring, term } = regions[i]!;
      for (const p of ring) {
        const h = term(p);
        if (h < height) {
          height = h;
          at = p;
          region = ring;
        }
      }
    }
  }
  // a vertex on a beam edge may not be seen under the beam by ceilingAt (pointInRing on the
  // boundary): move it into its region then
  const exact = Math.abs(ceilingAt(level, at) - height) <= 1e-9;
  return { height, at: exact ? { x: at.x, y: at.y } : inset(at, vertexCentroid(region)) };
}
