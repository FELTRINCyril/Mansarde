import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooleanOpError, intersection } from '@/core/geometry/boolean';
import { ceilingUnder } from '@/core/geometry/ceiling';
import { area, intersectionVertices } from '@/core/geometry/polygon';
import { createBeam, createSlope } from '@/core/model/factory';
import type { Level, Ring } from '@/core/model/types';
import { levelFromWalls, rectRoom } from './fixtures';

/** polygon-clipping whose intersection fails on demand (every call while `fail` is true). */
const ctl = vi.hoisted(() => ({ fail: false, calls: 0 }));
vi.mock('polygon-clipping', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: Record<string, (...a: unknown[]) => unknown> }).default;
  return {
    default: {
      ...real,
      intersection: (...geoms: unknown[]) => {
        ctl.calls++;
        if (ctl.fail) throw new Error('Unable to complete output ring (simulated)');
        return real.intersection!(...geoms);
      },
    },
  };
});

afterEach(() => {
  ctl.fail = false;
  ctl.calls = 0;
});

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function chambre(): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
  level.slopes[s.id] = s;
  return level;
}
const hx = (x: number): number => 240 - ((x - 197) * 90) / 203;
const triangle: Ring = [
  { x: 300, y: 440 },
  { x: 380, y: 460 },
  { x: 300, y: 460 },
];

describe('intersection', () => {
  it('intersects a shape with a ring; empty when disjoint or degenerate', () => {
    const s = intersection([{ outer: rect(0, 0, 100, 100), holes: [] }], rect(50, 50, 150, 150));
    expect(s).toHaveLength(1);
    expect(area(s[0]!.outer)).toBeCloseTo(2500, 9);
    expect(intersection([{ outer: rect(0, 0, 10, 10), holes: [] }], rect(20, 20, 30, 30))).toEqual([]);
    expect(intersection([{ outer: rect(0, 0, 10, 10), holes: [] }], [{ x: 0, y: 0 }, { x: 5, y: 5 }])).toEqual([]);
    expect(intersection([], rect(0, 0, 1, 1))).toEqual([]);
  });

  it('throws BooleanOpError when every retry fails', () => {
    ctl.fail = true;
    expect(() => intersection([{ outer: rect(0, 0, 100, 100), holes: [] }], rect(50, 50, 150, 150))).toThrow(BooleanOpError);
    expect(ctl.calls).toBeGreaterThan(1);
  });
});

describe('intersectionVertices', () => {
  const key = (pts: { x: number; y: number }[]) => [...new Set(pts.map((p) => `${+p.x.toFixed(9)},${+p.y.toFixed(9)}`))].sort();
  // U shape 0..30 x 0..30 with a notch 10..20 x 10..30
  const u: Ring = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 30 },
    { x: 20, y: 30 },
    { x: 20, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: 0, y: 30 },
  ];

  it('gives the vertices of the intersection of a concave ring and a rectangle', () => {
    expect(key(intersectionVertices([u, rect(-5, -5, 35, 20)]))).toEqual(
      key([
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 20 },
        { x: 0, y: 20 },
      ]),
    );
    expect(intersectionVertices([u, rect(100, 100, 110, 110)])).toEqual([]);
  });

  it('never invents a point across a notch (three rings)', () => {
    // top of the legs (y >= 20) left of x = 15: only the left leg, 0..10 x 20..30
    const pts = intersectionVertices([u, rect(-5, 20, 35, 35), rect(-5, -5, 15, 35)]);
    expect(key(pts)).toEqual(key([{ x: 0, y: 20 }, { x: 10, y: 20 }, { x: 10, y: 30 }, { x: 0, y: 30 }]));
  });
});

describe('ceilingUnder without polygon-clipping intersection', () => {
  it('stays exact through the vertex enumeration fallback', () => {
    const level = chambre();
    const b = createBeam({ x: 290, y: 450 }, { x: 390, y: 450 }, { width: 40, drop: 15, mode: 'ceiling' });
    ctl.fail = true;
    const straddle = ceilingUnder(level, rect(180, 0, 260, 60));
    expect(ctl.calls).toBeGreaterThan(0);
    expect(straddle.height).toBeCloseTo(240 - (63 * 90) / 203, 9);
    expect(straddle.at.x).toBe(260);
    const slant = ceilingUnder(level, triangle);
    expect(slant.height).toBeCloseTo(hx(340), 6);
    level.beams[b.id] = b;
    const under = ceilingUnder(level, triangle);
    expect(under.height).toBeCloseTo(hx(340) - 15, 6);
    expect(under.at.x).toBeCloseTo(340, 6);
  });
});
