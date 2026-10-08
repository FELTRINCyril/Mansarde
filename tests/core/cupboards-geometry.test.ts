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

/** The top at s sampled densely: min of the ceiling over the depth segment (ruling V2-R5), minus the gap. */
function sampledTop(level: Level, c: Cupboard, s: number, n = 2000): number {
  const f = cupboardFrame(level, c);
  const back = add(f.back[0], scale(f.dir, s));
  let m = Infinity;
  for (let j = 0; j <= n; j++) m = Math.min(m, ceilingAt(level, add(back, scale(f.outward, 1e-7 + ((f.depth - 2e-7) * j) / n))));
  return m - c.gap;
}

/** The profile at s is never above the sampled top, and below it by less than tol. */
function expectNearTop(level: Level, c: Cupboard, p: ProfilePoint[], s: number, tol: number): void {
  const top = sampledTop(level, c, s);
  expect(profileAt(p, s)).toBeLessThanOrEqual(top + 1e-6);
  expect(profileAt(p, s)).toBeGreaterThan(top - tol);
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

  it('the volumes cache also skips a cupboard whose wall has lost a node, and keeps the others', () => {
    const level = chambre(false);
    const c = onTopWall(level);
    const other = createCupboard(findWall(level, 410, -10, 410, 410), 210, 'left');
    level.cupboards[other.id] = other;
    const startId = level.walls[c.wallId]!.startNodeId;
    const nodes = { ...level.nodes };
    delete nodes[startId];
    // the other wall shares that node only if it touches (-10, -10): it does not
    const v = deriveVolumes({ ...level, nodes });
    expect(v.cupboardFootprints.has(c.id)).toBe(false);
    expect(v.cupboardProfiles.has(c.id)).toBe(false);
    expect(v.cupboardFootprints.has(other.id)).toBe(true);
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
    for (let s = 0.37; s < 120; s += 1.3) expectNearTop(level, c, p, s, 1e-6);
  });

  it('ceiling under a slanted slope and a ceiling beam: the polyline matches the ceiling over the depth everywhere', () => {
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
    for (let s = 0.21; s < 120; s += 0.7) expectNearTop(level, c, p, s, 0.05);
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

describe('cupboardTopProfile over the full depth (ruling V2-R5)', () => {
  /** Level 0..400 x 0..400 (inner faces), ceiling 240, one fixed beam of bottom 200 along x. */
  function withBeamAlongX(axisY: number): Level {
    const level = chambre(false);
    const b = createBeam({ x: -10, y: axisY }, { x: 410, y: axisY }, { width: 12, mode: 'fixed', bottom: 200 });
    level.beams[b.id] = b;
    return level;
  }
  const flat = (p: ProfilePoint[]) => p.map((q) => ({ s: +q.s.toFixed(9), top: +q.top.toFixed(9) }));
  const flat198 = [
    { s: 0, top: 198 },
    { s: 120, top: 198 },
  ];

  it('fixed beam (bottom 200) parallel to the wall, 30 cm away: 200 - 2 over the whole width', () => {
    // beam y 24..36, cupboard y 0..60
    const level = withBeamAlongX(30);
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    expect(flat(cupboardTopProfile(level, c))).toEqual(flat198);
  });

  it('beam against the wall face, top wall (y 0..12) and bottom wall (y 388..400): both 198', () => {
    const top = withBeamAlongX(6);
    const ct = onTopWall(top, { heightMode: 'ceiling', gap: 2 });
    expect(flat(cupboardTopProfile(top, ct))).toEqual(flat198);
    const bottom = withBeamAlongX(394);
    // wall (410, 410) -> (-10, 410): dir -x, left = -y = room side; back on y = 400
    const cb = createCupboard(findWall(bottom, 410, 410, -10, 410), 220, 'left', { heightMode: 'ceiling', gap: 2 });
    bottom.cupboards[cb.id] = cb;
    expect(cupboardFrame(bottom, cb).back[0].y).toBeCloseTo(400, 9);
    expect(flat(cupboardTopProfile(bottom, cb))).toEqual(flat198);
  });

  it('beam shifted 2 cm off the wall face (y 2..14): 198', () => {
    const level = withBeamAlongX(8);
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    expect(flat(cupboardTopProfile(level, c))).toEqual(flat198);
  });

  it('beam only touching the cupboard side does not lower it (zero-area contact)', () => {
    const level = chambre(false);
    // beam x 138..150 along y: touches the s = 0 side of the cupboard (x 150..270)
    const b = createBeam({ x: 144, y: -10 }, { x: 144, y: 400 }, { width: 12, mode: 'fixed', bottom: 200 });
    level.beams[b.id] = b;
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    expect(flat(cupboardTopProfile(level, c))).toEqual([
      { s: 0, top: 238 },
      { s: 120, top: 238 },
    ]);
  });

  it('rising slope whose start line is 30 cm from the wall: lowest at the start line, 200 - 2', () => {
    const level = chambre(false);
    // start line y = 30, dir +x, left = +y: 200 at y = 30 rising to 240 at y = 130
    const s = createSlope({ x: -50, y: 30 }, { x: 450, y: 30 }, 'left', 100, 200, 240);
    level.slopes[s.id] = s;
    const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
    expect(flat(cupboardTopProfile(level, c))).toEqual(flat198);
  });

  it('matches a dense sampling of ceilingAt over the depth (random levels, fixed seed)', () => {
    let seed = 20261008;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const R = (a: number, b: number): number => a + (b - a) * rnd();
    const N = 300;
    let worst = 0;
    for (let iter = 0; iter < 60; iter++) {
      const level = chambre(false);
      for (let i = Math.floor(R(0, 3)); i > 0; i--) {
        const a = { x: R(0, 400), y: R(-50, 150) };
        const ang = R(0, 2 * Math.PI);
        const L = R(50, 400);
        const sl = createSlope(a, { x: a.x + L * Math.cos(ang), y: a.y + L * Math.sin(ang) }, rnd() < 0.5 ? 'left' : 'right', R(60, 300), R(180, 260), R(150, 260));
        level.slopes[sl.id] = sl;
      }
      for (let i = Math.floor(R(0, 3)); i > 0; i--) {
        const a = { x: R(100, 300), y: R(-20, 100) };
        const ang = R(0, 2 * Math.PI);
        const L = R(20, 300);
        const bm = createBeam(a, { x: a.x + L * Math.cos(ang), y: a.y + L * Math.sin(ang) }, {
          width: R(6, 30),
          drop: R(5, 30),
          mode: rnd() < 0.5 ? 'fixed' : 'ceiling',
          bottom: R(170, 250),
        });
        level.beams[bm.id] = bm;
      }
      const c = onTopWall(level, { heightMode: 'ceiling', gap: 2 });
      const f = cupboardFrame(level, c);
      const p = cupboardTopProfile(level, c);
      for (let k = 0; k < 25; k++) {
        const s = R(0.01, 119.99);
        let m = Infinity;
        for (let j = 0; j <= N; j++) {
          const u = 1e-7 + ((f.depth - 2e-7) * j) / N;
          m = Math.min(m, ceilingAt(level, add(add(f.back[0], scale(f.dir, s)), scale(f.outward, u))));
        }
        const top = profileAt(p, s) + c.gap;
        // never above the sampled ceiling; below it by at most the sampling step times the slope gradient
        expect(top).toBeLessThanOrEqual(m + 1e-6);
        worst = Math.max(worst, m - top);
      }
    }
    expect(worst).toBeLessThan(0.5);
  });
});
