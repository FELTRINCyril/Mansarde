import { describe, it, expect } from 'vitest';
import { computeWallShape, computeWallOutlines } from '@/core/geometry/walls';
import { area } from '@/core/geometry/polygon';
import { levelFromWalls, rectRoom } from './fixtures';

const shapeArea = (s: ReturnType<typeof computeWallShape>) =>
  s.reduce((acc, p) => acc + area(p.outer) - p.holes.reduce((h, r) => h + area(r), 0), 0);

describe('wall outlines', () => {
  it('single wall is a rectangle with square ends', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0, 20]]);
    const ring = [...computeWallOutlines(lvl).values()][0]!;
    expect(area(ring)).toBeCloseTo(2000);
  });
  it('right-angle corner is mitered: L shape area equals outer minus inner', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0], [100, 0, 100, 100]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    // axis lengths 100 each, thickness 20: area = 2*100*20 = 4000 exactly with miters
    expect(shapeArea(shape)).toBeCloseTo(4000, 3);
  });
  it('closed rectangular room has exactly one hole of interior size', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shape[0]!.holes).toHaveLength(1);
    expect(area(shape[0]!.holes[0]!)).toBeCloseTo(380 * 280, 3);
    expect(area(shape[0]!.outer)).toBeCloseTo(420 * 320, 3);
  });
  it('non-right angle (60 deg) produces a single clean polygon without spikes', () => {
    const lvl = levelFromWalls([[0, 0, 200, 0], [200, 0, 100, 173.205]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    const b = shape[0]!.outer.reduce((m, p) => Math.max(m, Math.hypot(p.x - 200, p.y)), 0);
    expect(b).toBeLessThan(260); // the miter tip stays close to the corner (no spike)
  });
  it('T junction has no internal seam: one polygon, two holes when closing two rooms', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shape[0]!.holes).toHaveLength(2);
  });
  it('cross junction yields four holes in a square split in four', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 400), [200, 0, 200, 200], [200, 200, 200, 400], [0, 200, 200, 200], [200, 200, 400, 200]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape[0]!.holes).toHaveLength(4);
  });
  it('walls of different thickness join without gap', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0, 30], [100, 0, 100, 100, 10]]);
    expect(computeWallShape(lvl, { withOpenings: false })).toHaveLength(1);
  });
  it('nearly collinear walls (0.5 deg) join straight', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0], [100, 0, 200, 0.87]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shapeArea(shape)).toBeCloseTo(200 * 20, -1);
  });
  it('very acute angle (10 deg) is truncated (no long spike)', () => {
    const lvl = levelFromWalls([[0, 0, 200, 0], [0, 0, 197, 34.7]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    const minX = Math.min(...shape[0]!.outer.map((p) => p.x));
    expect(minX).toBeGreaterThan(-60);
  });
  it('opening cuts the wall shape', () => {
    const lvl = levelFromWalls([[0, 0, 300, 0]]);
    const wallId = Object.keys(lvl.walls)[0]!;
    lvl.openings['o1'] = { id: 'o1', wallId, kind: 'door', variant: 'single', offset: 150, width: 80, height: 204, sillHeight: 0, hinge: 'start', swing: 'left' };
    const shape = computeWallShape(lvl, { withOpenings: true });
    expect(shape).toHaveLength(2);
    expect(shapeArea(shape)).toBeCloseTo((300 - 80) * 20, 3);
  });
});

describe('wall outlines robustness', () => {
  const allFinite = (lvl: ReturnType<typeof levelFromWalls>) => {
    for (const ring of computeWallOutlines(lvl).values()) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      for (const p of ring) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  };
  it('never produces NaN at a node with 3 or more incident walls', () => {
    // 3 walls (T on a real node), 4 walls (cross), 5 walls incl. a near-collinear and an acute pair
    allFinite(levelFromWalls([[0, 0, 100, 0], [100, 0, 200, 0], [100, 0, 100, 100, 10]]));
    allFinite(levelFromWalls([[100, 100, 0, 100], [100, 100, 200, 100], [100, 100, 100, 0], [100, 100, 100, 200, 7]]));
    allFinite(levelFromWalls([[0, 0, 100, 0], [0, 0, 100, 0.5], [0, 0, 100, 17], [0, 0, -50, 80, 30], [0, 0, -60, -60, 7]]));
  });
  it('mitered T on a shared node keeps exact area', () => {
    // through wall split at the node (0..100, 100..200) and a stem going down, all 20 thick:
    // through strip 200x20 + stem 100x20 minus the 20x10 part of the stem inside the strip
    const lvl = levelFromWalls([[0, 0, 100, 0], [100, 0, 200, 0], [100, 0, 100, 100]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shape[0]!.holes).toHaveLength(0);
    expect(shapeArea(shape)).toBeCloseTo(200 * 20 + 100 * 20 - 20 * 10, 3);
  });
  it('acute junction is filled by joint polygons: no notch at the node', () => {
    // 10 deg wedge: outer side truncated, the bevel joint must cover the node vicinity
    const lvl = levelFromWalls([[0, 0, 200, 0], [0, 0, 197, 34.7]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shape[0]!.holes).toHaveLength(0);
  });
});
