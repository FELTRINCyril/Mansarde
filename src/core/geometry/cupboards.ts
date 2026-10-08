import type { Cupboard, Id, Level, Ring, Vec2 } from '../model/types';
import { ceilingRegions } from './ceiling';
import { add, dot, scale, sub } from './vec';
import { wallFrame } from './walls';

/**
 * Frame of a cupboard: back edge on the wall face (thickness / 2 from the axis, on c.side), front
 * edge `depth` further along `outward`; back[0] and front[0] are at s = 0, the end nearest to the
 * start node of the wall, and `dir` (the wall direction) goes towards s = width.
 */
export interface CupboardFrame { wallId: Id; back: [Vec2, Vec2]; front: [Vec2, Vec2]; dir: Vec2; outward: Vec2; width: number; depth: number }

/** Throws if the wall of the cupboard (or one of its nodes) is missing. */
export function cupboardFrame(level: Level, c: Cupboard): CupboardFrame {
  const f = wallFrame(level, c.wallId);
  const wall = level.walls[c.wallId]!;
  const outward = c.side === 'left' ? f.normal : scale(f.normal, -1);
  const back0 = add(add(f.start, scale(f.dir, c.offset - c.width / 2)), scale(outward, wall.thickness / 2));
  const back1 = add(back0, scale(f.dir, c.width));
  const depth = scale(outward, c.depth);
  return {
    wallId: c.wallId,
    back: [back0, back1],
    front: [add(back0, depth), add(back1, depth)],
    dir: f.dir,
    outward,
    width: c.width,
    depth: c.depth,
  };
}

/** Floor rectangle of the cupboard: back[0], back[1], front[1], front[0]. Throws if its wall is missing. */
export function cupboardFootprint(level: Level, c: Cupboard): Ring {
  const f = cupboardFrame(level, c);
  return [f.back[0], f.back[1], f.front[1], f.front[0]];
}

/** Point of the top profile: s = 0..width along the cupboard, top = absolute height of its top. */
export interface ProfilePoint { s: number; top: number }

const EPS = 1e-9;

/** Sorted values, those within EPS of the previous one dropped. */
function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1]! > EPS);
}

/** Drops points lying on the straight line between their neighbours (vertical steps are kept). */
function simplify(points: ProfilePoint[]): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.s - p.s) <= EPS && Math.abs(last.top - p.top) <= EPS) continue;
    const prev = out[out.length - 2];
    if (prev && last && last.s - prev.s > EPS && p.s - last.s > EPS) {
      const onLine = prev.top + ((p.top - prev.top) * (last.s - prev.s)) / (p.s - prev.s);
      if (Math.abs(onLine - last.top) <= EPS * Math.max(1, Math.abs(last.top))) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** A ceiling region in cupboard coordinates: s along the width, u from the back towards the front. */
interface SliceRegion { pts: Array<{ s: number; u: number }>; smin: number; smax: number; term: (p: Vec2) => number }

/** Lowest and highest u of the convex region at abscissa s (clamped to the region). */
function slice(r: SliceRegion, s0: number): [number, number] {
  const s = Math.min(r.smax, Math.max(r.smin, s0));
  let lo = Infinity;
  let hi = -Infinity;
  const n = r.pts.length;
  for (let i = 0; i < n; i++) {
    const a = r.pts[i]!;
    const b = r.pts[(i + 1) % n]!;
    if ((a.s - s) * (b.s - s) > 0) continue;
    const span = b.s - a.s;
    const us = Math.abs(span) < EPS ? [a.u, b.u] : [a.u + ((b.u - a.u) * (s - a.s)) / span];
    for (const u of us) {
      if (u < lo) lo = u;
      if (u > hi) hi = u;
    }
  }
  if (lo === Infinity) {
    // rounding left s between no edge ends: take the nearest vertex
    const v = r.pts.reduce((m, p) => (Math.abs(p.s - s) < Math.abs(m.s - s) ? p : m));
    return [v.u, v.u];
  }
  return [lo, hi];
}

/**
 * Height of the top of the cupboard along its width (spec 5.2, ruling V2-R5). 'fixed': `height` at
 * both ends. 'ceiling': top(s) = the lowest ceiling over the whole depth segment back(s) ->
 * front(s), minus gap, as an exact polyline. The footprint is cut into the convex regions of
 * ceilingRegions (beam and slope edges closed, mere contacts ignored); over each region the
 * lowest ceiling of a segment is at one of its ends, so between the abscissas of the region
 * vertices every region gives a linear function; the profile is their minimum, with extra break
 * points where two of them cross (ridge of two slopes...). A step (beam edge, lateral end of a
 * slope) gives two points with the same s. Throws if the wall is missing.
 */
export function cupboardTopProfile(level: Level, c: Cupboard): ProfilePoint[] {
  if (c.heightMode === 'fixed') {
    return [
      { s: 0, top: c.height },
      { s: c.width, top: c.height },
    ];
  }
  const f = cupboardFrame(level, c);
  const o = f.back[0];
  const world = (s: number, u: number): Vec2 => add(add(o, scale(f.dir, s)), scale(f.outward, u));
  const footprint = [f.back[0], f.back[1], f.front[1], f.front[0]];
  const regions: SliceRegion[] = ceilingRegions(level, footprint).map(({ ring, term }) => {
    const pts = ring.map((p) => ({ s: dot(sub(p, o), f.dir), u: dot(sub(p, o), f.outward) }));
    const ss = pts.map((p) => p.s);
    return { pts, smin: Math.min(...ss), smax: Math.max(...ss), term };
  });

  const cuts = [0, f.width];
  for (const r of regions) for (const p of r.pts) if (p.s > 0 && p.s < f.width) cuts.push(p.s);
  const breaks = uniqueSorted(cuts);

  const points: ProfilePoint[] = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const s0 = breaks[i]!;
    const s1 = breaks[i + 1]!;
    const fns = regions
      .filter((r) => r.smin <= s0 + EPS && r.smax >= s1 - EPS)
      .map((r) => (s: number): number => {
        const [lo, hi] = slice(r, s);
        return Math.min(r.term(world(s, lo)), r.term(world(s, hi)));
      });
    const crossings: number[] = [];
    for (let j = 0; j < fns.length; j++) {
      for (let k = j + 1; k < fns.length; k++) {
        const d0 = fns[j]!(s0) - fns[k]!(s0);
        const d1 = fns[j]!(s1) - fns[k]!(s1);
        if (d0 * d1 < 0) crossings.push(s0 + ((s1 - s0) * d0) / (d0 - d1));
      }
    }
    for (const s of [s0, ...uniqueSorted(crossings), s1]) {
      points.push({ s, top: Math.min(...fns.map((fn) => fn(s))) - c.gap });
    }
  }
  return simplify(points);
}

/**
 * The doors of the cupboard: doorCount equal parts of the front edge, from s = 0 to s = width.
 * Hinged doors go in pairs opening from their outer sides (even index: hinge at `from`, odd
 * index: hinge at `to`); a last unpaired door is hinged at `from`. Sliding doors get the same
 * hingeAt, which has no meaning for them. Throws if the wall is missing.
 */
export function cupboardDoors(level: Level, c: Cupboard): Array<{ from: Vec2; to: Vec2; hingeAt: Vec2 }> {
  const f = cupboardFrame(level, c);
  const n = Number.isFinite(c.doorCount) ? Math.max(1, Math.round(c.doorCount)) : 1;
  const w = f.width / n;
  const doors: Array<{ from: Vec2; to: Vec2; hingeAt: Vec2 }> = [];
  for (let i = 0; i < n; i++) {
    const from = add(f.front[0], scale(f.dir, i * w));
    const to = add(f.front[0], scale(f.dir, (i + 1) * w));
    doors.push({ from, to, hingeAt: i % 2 === 0 ? { ...from } : { ...to } });
  }
  return doors;
}
