import { describe, expect, it } from 'vitest';
import { ceilingAt } from '@/core/geometry/ceiling';
import { cupboardDoors, cupboardFootprint, cupboardFrame, cupboardTopProfile, type ProfilePoint } from '@/core/geometry/cupboards';
import { deriveVolumes } from '@/core/geometry/derived';
import { area } from '@/core/geometry/polygon';
import { add, scale } from '@/core/geometry/vec';
import { createBeam, createCupboard, createSlope } from '@/core/model/factory';
import type { Cupboard, Level } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

/** plan-chambre: interior 0..400 x 0..400, ceiling 240, slope from x = 197 towards +x, 240 -> 150 over 203. */
function chambre(withSlope = true): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  if (withSlope) {
    const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
    level.slopes[s.id] = s;
  }
  return level;
}

const hx = (x: number): number => 240 - ((x - 197) * 90) / 203;

/** Top wall (-10, -10) -> (410, -10): dir +x, left = +y = room side; offset 220 -> x 150..270. */
function onTopWall(level: Level, overrides: Partial<Cupboard> = {}): Cupboard {
  const c = createCupboard(findWall(level, -10, -10, 410, -10), 220, 'left', overrides);
  level.cupboards[c.id] = c;
  return c;
}

/** Profile value at s (linear between points; at a step, the later point). */
function profileAt(profile: ProfilePoint[], s: number): number {
  for (let i = profile.length - 1; i > 0; i--) {
    const p = profile[i - 1]!;
    const q = profile[i]!;
    if (s >= p.s && s <= q.s && q.s > p.s) return p.top + ((q.top - p.top) * (s - p.s)) / (q.s - p.s);
  }
  return profile[0]!.top;
}

/** The exact top at s: min of the ceiling over the back and front points, minus the gap. */
function trueTop(level: Level, c: Cupboard, s: number): number {
  const f = cupboardFrame(level, c);
  const back = add(f.back[0], scale(f.dir, s));
  const front = add(f.front[0], scale(f.dir, s));
  return Math.min(ceilingAt(level, back), ceilingAt(level, front)) - c.gap;
}

describe('cupboardFrame and footprint', () => {
  it('stands on the wall face of its side', () => {
    const level = chambre(false);
    const c = onTopWall(level);
    const f = cupboardFrame(level, c);
    expect(f.wallId).toBe(c.wallId);
    expect(f.back[0]).toEqual({ x: 150, y: 0 });
    expect(f.back[1]).toEqual({ x: 270, y: 0 });
    expect(f.front[0]).toEqual({ x: 150, y: 60 });
    expect(f.front[1]).toEqual({ x: 270, y: 60 });
    expect(f.dir).toEqual({ x: 1, y: 0 });
    expect(f.outward.x).toBeCloseTo(0, 12);
    expect(f.outward.y).toBeCloseTo(1, 12);
    expect(f.width).toBe(120);
    expect(f.depth).toBe(60);
    expect(area(cupboardFootprint(level, c))).toBeCloseTo(7200, 9);

    const r = cupboardFrame(level, { ...c, side: 'right' });
    expect(r.back[0].y).toBeCloseTo(-20, 9);
    expect(r.front[0].y).toBeCloseTo(-80, 9);
    expect(r.outward.y).toBeCloseTo(-1, 12);
  });

  it('throws when its wall is missing; the volumes cache skips it', () => {
    const level = chambre(false);
    const c = onTopWall(level);
    const broken = { ...level, cupboards: { ...level.cupboards, [c.id]: { ...c, wallId: 'nope' } } };
    expect(() => cupboardFrame(broken, broken.cupboards[c.id]!)).toThrow();
    const v = deriveVolumes(broken);
    expect(v.cupboardFootprints.has(c.id)).toBe(false);
    expect(deriveVolumes(level).cupboardFootprints.get(c.id)).toEqual(cupboardFootprint(level, c));
    expect(deriveVolumes(level).cupboardProfiles.get(c.id)).toEqual(cupboardTopProfile(level, c));
  });
});

describe('cupboardTopProfile', () => {
  it('fixed: two points at its height', () => {
    const level = chambre();
    const c = onTopWall(level, { heightMode: 'fixed', height: 220 });
    expect(cupboardTopProfile(level, c)).toEqual([
      { s: 0, top: 220 },
      { s: 120, top: 220 },
    ]);
  });

  it('ceiling, against the wall whose room face is x = 400: 150 - 2 at both ends', () => {
    const level = chambre();
    // wall (410, -10) -> (410, 410): dir +y, left = -x = room side; offset 210 -> y 140..260
    const c = createCupboard(findWall(level, 410, -10, 410, 410), 210, 'left', { heightMode: 'ceiling', gap: 2 });
    level.cupboards[c.id] = c;
    expect(cupboardFrame(level, c).back[0].x).toBeCloseTo(400, 9);
    const p = cupboardTopProfile(level, c);
    expect(p).toHaveLength(2);
    expect(p[0]!.s).toBe(0);
    expect(p[0]!.top).toBeCloseTo(148, 9);
    expect(p[1]!.s).toBe(120);
    expect(p[1]!.top).toBeCloseTo(148, 9);
  });

  it('ceiling, along a perpendicular wall across the start line: break point on the start line', () => {
    const level = chambre();
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    const p = cupboardTopProfile(level, c);
    expect(p).toHaveLength(3);
    expect(p[0]).toEqual({ s: 0, top: 238 });
    expect(p[1]!.s).toBeCloseTo(47, 9);
    expect(p[1]!.top).toBeCloseTo(238, 9);
    expect(p[2]!.s).toBe(120);
    expect(p[2]!.top).toBeCloseTo(hx(270) - 2, 9);
  });

  it('ceiling under a fixed beam across it: vertical steps at the beam edges', () => {
    const level = chambre(false);
    const b = createBeam({ x: 210, y: -10 }, { x: 210, y: 400 }, { width: 12, mode: 'fixed', bottom: 225 });
    level.beams[b.id] = b;
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    const p = cupboardTopProfile(level, c);
    const rounded = p.map((q) => ({ s: +q.s.toFixed(9), top: +q.top.toFixed(9) }));
    expect(rounded).toEqual([
      { s: 0, top: 238 },
      { s: 54, top: 238 },
      { s: 54, top: 223 },
      { s: 66, top: 223 },
      { s: 66, top: 238 },
      { s: 120, top: 238 },
    ]);
  });

  it('ceiling under two overlapping slopes: break point where they cross, exact everywhere', () => {
    const level = chambre(false);
    const sa = createSlope({ x: 150, y: -50 }, { x: 150, y: 450 }, 'right', 200, 240, 150);
    const sb = createSlope({ x: 250, y: -50 }, { x: 250, y: 450 }, 'left', 100, 240, 150);
    level.slopes[sa.id] = sa;
    level.slopes[sb.id] = sb;
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    const p = cupboardTopProfile(level, c);
    // ridge: 240 - (x - 150) * 0.45 = 240 - (250 - x) * 0.9 -> x = 650 / 3, height 210
    const ridge = p.find((q) => Math.abs(q.s - (650 / 3 - 150)) < 1e-6);
    expect(ridge?.top).toBeCloseTo(208, 9);
    for (let s = 0.37; s < 120; s += 1.3) expect(profileAt(p, s)).toBeCloseTo(trueTop(level, c, s), 9);
  });

  it('ceiling under a slanted slope and a ceiling beam: the polyline matches the ceiling everywhere', () => {
    const level = chambre();
    const slant = createSlope({ x: 100, y: 300 }, { x: 300, y: 100 }, 'right', 150, 240, 170);
    level.slopes[slant.id] = slant;
    const b = createBeam({ x: 230, y: -10 }, { x: 160, y: 120 }, { width: 20, mode: 'ceiling', drop: 15 });
    level.beams[b.id] = b;
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    const p = cupboardTopProfile(level, c);
    expect(p[0]!.s).toBe(0);
    expect(p[p.length - 1]!.s).toBe(120);
    for (let i = 1; i < p.length; i++) expect(p[i]!.s).toBeGreaterThanOrEqual(p[i - 1]!.s);
    for (let s = 0.21; s < 120; s += 0.7) expect(profileAt(p, s)).toBeCloseTo(trueTop(level, c, s), 6);
  });
});

describe('cupboardDoors', () => {
  it('120 cm: 2 doors of 60 on the front edge, hinged on the outer sides', () => {
    const level = chambre(false);
    const c = onTopWall(level);
    expect(c.doorCount).toBe(2);
    const doors = cupboardDoors(level, c);
    expect(doors).toEqual([
      { from: { x: 150, y: 60 }, to: { x: 210, y: 60 }, hingeAt: { x: 150, y: 60 } },
      { from: { x: 210, y: 60 }, to: { x: 270, y: 60 }, hingeAt: { x: 270, y: 60 } },
    ]);
  });

  it('3 doors of 40, paired from the start', () => {
    const level = chambre(false);
    const c = onTopWall(level, { doorCount: 3 });
    const doors = cupboardDoors(level, c);
    expect(doors.map((d) => [d.from.x, d.to.x, d.hingeAt.x])).toEqual([
      [150, 190, 150],
      [190, 230, 230],
      [230, 270, 230],
    ]);
  });
});
