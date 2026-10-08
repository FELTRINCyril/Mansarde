import type { Cupboard, Id, Level, Ring, Vec2 } from '../model/types';
import { beamFootprint } from './beams';
import { isUsableRing } from './boolean';
import { pointInRing, ringEdges } from './polygon';
import { slopeFrame, slopeHeightAt } from './slopes';
import { add, cross, dot, scale, sub } from './vec';
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

/** A ceiling term that is affine over a whole interval of the profile (see ceilingTerms). */
type Term = (p: Vec2) => number;
/** A line of the plan where a ceiling term starts, stops or changes formula. */
interface CutLine { q: Vec2; e: Vec2 }

const EPS = 1e-9;

/** Lines where the ceiling changes formula: slope start, end and lateral lines, beam edges. */
function cutLines(level: Level): CutLine[] {
  const out: CutLine[] = [];
  for (const s of Object.values(level.slopes)) {
    const f = slopeFrame(s);
    if (f.length <= 0 || !(s.depth > 0)) continue;
    out.push({ q: s.a, e: f.dir }, { q: add(s.a, scale(f.normal, s.depth)), e: f.dir }, { q: s.a, e: f.normal }, { q: s.b, e: f.normal });
  }
  for (const b of Object.values(level.beams)) {
    const ring = beamFootprint(b);
    if (!isUsableRing(ring)) continue;
    for (const [p, q] of ringEdges(ring)) out.push({ q: p, e: sub(q, p) });
  }
  return out;
}

/**
 * The terms whose minimum is the ceiling (ceilingAt) on the whole interval of the profile that
 * contains m: the level height, each slope over m (its linear formula, or heightEnd beyond its end
 * line) and, under each beam over m, its fixed bottom or every previous term minus its drop.
 */
function ceilingTerms(level: Level, m: Vec2): Term[] {
  const base: Term[] = [() => level.height];
  for (const s of Object.values(level.slopes)) {
    if (slopeHeightAt(s, m) === null) continue;
    const n = slopeFrame(s).normal;
    if (dot(sub(m, s.a), n) >= s.depth) base.push(() => s.heightEnd);
    else base.push((p) => s.heightStart + ((s.heightEnd - s.heightStart) * dot(sub(p, s.a), n)) / s.depth);
  }
  const terms = [...base];
  for (const b of Object.values(level.beams)) {
    if (!pointInRing(m, beamFootprint(b))) continue;
    if (b.mode === 'fixed') terms.push(() => b.bottom);
    else for (const g of base) terms.push((p) => g(p) - b.drop);
  }
  return terms;
}

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

/**
 * Height of the top of the cupboard along its width (spec 5.2). 'fixed': `height` at both ends.
 * 'ceiling': the polyline of min(ceilingAt(back point), ceilingAt(front point)) - gap, exact: break
 * points where the back or front edge crosses a slope start, end or lateral line or a beam edge,
 * and where two ceiling terms cross between them (ridge of two slopes, front and back trading
 * places). A step (beam edge, lateral end of a slope) gives two points with the same s. Throws if
 * the wall is missing.
 */
export function cupboardTopProfile(level: Level, c: Cupboard): ProfilePoint[] {
  if (c.heightMode === 'fixed') {
    return [
      { s: 0, top: c.height },
      { s: c.width, top: c.height },
    ];
  }
  const f = cupboardFrame(level, c);
  const edges = [f.back[0], f.front[0]];
  const at = (o: Vec2, s: number): Vec2 => add(o, scale(f.dir, s));

  const cuts: number[] = [0, f.width];
  for (const { q, e } of cutLines(level)) {
    const den = cross(f.dir, e);
    if (Math.abs(den) < EPS) continue;
    for (const o of edges) {
      const s = cross(sub(q, o), e) / den;
      if (s > 0 && s < f.width) cuts.push(s);
    }
  }
  const breaks = uniqueSorted(cuts);

  const points: ProfilePoint[] = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const s0 = breaks[i]!;
    const s1 = breaks[i + 1]!;
    const mid = (s0 + s1) / 2;
    const terms = edges.flatMap((o) => ceilingTerms(level, at(o, mid)).map((t) => (s: number) => t(at(o, s))));
    const crossings: number[] = [];
    for (let j = 0; j < terms.length; j++) {
      for (let k = j + 1; k < terms.length; k++) {
        const d0 = terms[j]!(s0) - terms[k]!(s0);
        const d1 = terms[j]!(s1) - terms[k]!(s1);
        if (d0 * d1 < 0) crossings.push(s0 + ((s1 - s0) * d0) / (d0 - d1));
      }
    }
    for (const s of [s0, ...uniqueSorted(crossings), s1]) {
      points.push({ s, top: Math.min(...terms.map((t) => t(s))) - c.gap });
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
