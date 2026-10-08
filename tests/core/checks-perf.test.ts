import { describe, expect, it } from 'vitest';
import { CATALOG } from '@/catalog/catalog';
import { computeChecks } from '@/core/checks/computeChecks';
import { deriveLevel, deriveVolumes } from '@/core/geometry/derived';
import { createBeam, createCupboard, createObjectFromSize, createOpening, createSlope } from '@/core/model/factory';
import type { Level } from '@/core/model/types';
import { findWall, levelFromWalls, type WallSegment } from './fixtures';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL = 420; // wall axes every 420 cm: rooms of 400 x 400 inside 20 cm walls
const COLS = 3;
const ROWS = 2;

/** 6 rooms (3 x 2), doors and windows, 2 slopes, 1 beam, 4 cupboards and 300 random objects. */
function house(seed: number): Level {
  const segs: WallSegment[] = [];
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c < COLS; c++) segs.push([c * CELL, r * CELL, (c + 1) * CELL, r * CELL]);
  for (let c = 0; c <= COLS; c++) for (let r = 0; r < ROWS; r++) segs.push([c * CELL, r * CELL, c * CELL, (r + 1) * CELL]);
  const level = levelFromWalls(segs);

  const doorWalls = [
    findWall(level, CELL, 0, CELL, CELL),
    findWall(level, 2 * CELL, 0, 2 * CELL, CELL),
    findWall(level, CELL, CELL, CELL, 2 * CELL),
    findWall(level, 2 * CELL, CELL, 2 * CELL, 2 * CELL),
    findWall(level, 0, CELL, CELL, CELL),
    findWall(level, CELL, CELL, 2 * CELL, CELL),
    findWall(level, 2 * CELL, CELL, 3 * CELL, CELL),
  ];
  doorWalls.forEach((w, i) => {
    const o = createOpening(w, 'door', 150, { variant: i % 3 === 0 ? 'double' : 'single', width: i % 3 === 0 ? 140 : 83, swing: i % 2 ? 'left' : 'right' });
    level.openings[o.id] = o;
  });
  for (let c = 0; c < COLS; c++) {
    const top = findWall(level, c * CELL, 0, (c + 1) * CELL, 0);
    const o = createOpening(top, 'window', 300);
    level.openings[o.id] = o;
  }

  const s1 = createSlope({ x: 2 * CELL + 190, y: -50 }, { x: 2 * CELL + 190, y: 2 * CELL + 50 }, 'right', 210, 250, 150);
  const s2 = createSlope({ x: -50, y: 210 }, { x: 3 * CELL + 50, y: 210 }, 'right', 200, 250, 160);
  level.slopes[s1.id] = s1;
  level.slopes[s2.id] = s2;
  const beam = createBeam({ x: 0, y: CELL + 200 }, { x: 2 * CELL, y: CELL + 200 });
  level.beams[beam.id] = beam;

  const cupboardWalls = [
    findWall(level, 0, 0, CELL, 0),
    findWall(level, CELL, 2 * CELL, 2 * CELL, 2 * CELL),
    findWall(level, 3 * CELL, 0, 3 * CELL, CELL),
    findWall(level, 2 * CELL, 2 * CELL, 3 * CELL, 2 * CELL),
  ];
  cupboardWalls.forEach((w, i) => {
    const c = createCupboard(w, 120, i % 2 ? 'left' : 'right', { heightMode: i % 2 ? 'ceiling' : 'fixed', doorType: i < 3 ? 'hinged' : 'sliding' });
    level.cupboards[c.id] = c;
  });
  // a window behind the third cupboard (wall interval 60..180): cupboardOpening
  const behind = createOpening(cupboardWalls[2]!, 'window', 120);
  level.openings[behind.id] = behind;

  const rand = rng(seed);
  for (let i = 0; i < 300; i++) {
    const e = CATALOG[Math.floor(rand() * CATALOG.length)]!;
    const x = 10 + rand() * (COLS * CELL - 20);
    const y = 10 + rand() * (ROWS * CELL - 20);
    const elevation = e.pose === 'onTop' ? (rand() < 0.5 ? 0 : 50) : (e.elevation ?? 0);
    const o = createObjectFromSize({ kind: 'catalog', catalogId: e.id }, x, y, e, e.name, e.color, {
      rotation: rand() < 0.5 ? 90 * Math.floor(rand() * 4) : rand() * 360,
      pose: e.pose,
      elevation,
      lshape: e.lshape ? { ...e.lshape } : null,
    });
    level.objects[o.id] = o;
  }
  return level;
}

/**
 * Mean time of computeChecks over 5 calls after a warm-up, each on a new Level built by `next(i)`
 * (new identity: the memo cannot answer); deriveLevel is computed outside the measure, as the
 * editor has it already.
 */
function measure(label: string, next: (i: number) => Level): { mean: number; kinds: Set<string>; count: number } {
  const custom = {};
  const first = next(0);
  const warm = computeChecks(first, deriveLevel(first), custom);
  const times: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const fresh = next(i);
    const d = deriveLevel(fresh);
    const t0 = performance.now();
    const out = computeChecks(fresh, d, custom);
    times.push(performance.now() - t0);
    expect(out).not.toBe(warm);
  }
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  console.info(`computeChecks (${label}): ${warm.length} checks, mean ${mean.toFixed(1)} ms over 5 runs (${times.map((t) => t.toFixed(1)).join(', ')})`);
  return { mean, kinds: new Set(warm.map((c) => c.kind)), count: warm.length };
}

describe('checks performance budget', () => {
  it('300 objects in 6 rooms: computeChecks under 50 ms on average', () => {
    const level = house(20261008);
    expect(Object.keys(level.objects)).toHaveLength(300);
    expect(deriveLevel(level).rooms).toHaveLength(6);

    // objects moving (volumes and wall shape reused through the caches)
    const still = measure('objects moving', () => ({ ...level }));
    // the random level exercises every rule
    for (const k of ['height', 'collision', 'wallOverlap', 'doorSwing', 'cupboardOpening', 'floating', 'cupboardClearance'] as const) {
      expect(still.kinds.has(k)).toBe(true);
    }
    expect(still.mean).toBeLessThan(50);

    // a slope and the beam moving: the volumes (slope bands, cupboard profiles) are recomputed
    const [slopeId] = Object.keys(level.slopes);
    const [beamId] = Object.keys(level.beams);
    const slope = level.slopes[slopeId!]!;
    const beam = level.beams[beamId!]!;
    const movedLevel = (i: number): Level => ({
      ...level,
      slopes: { ...level.slopes, [slope.id]: { ...slope, a: { ...slope.a, x: slope.a.x + i }, b: { ...slope.b, x: slope.b.x + i } } },
      beams: { [beam.id]: { ...beam, a: { ...beam.a, y: beam.a.y + i }, b: { ...beam.b, y: beam.b.y + i } } },
    });
    // witness: two such levels do not share their volumes (they are recomputed)
    expect(deriveVolumes(movedLevel(1))).not.toBe(deriveVolumes(movedLevel(2)));
    expect(deriveVolumes({ ...level })).toBe(deriveVolumes({ ...level }));
    const moving = measure('slope and beam moving', movedLevel);
    expect(moving.count).toBeGreaterThan(0);
    expect(moving.mean).toBeLessThan(50);
  });
});
