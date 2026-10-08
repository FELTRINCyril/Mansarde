import { describe, it, expect } from 'vitest';
import { computeWallShape, computeWallOutlines } from '@/core/geometry/walls';
import { area, pointInPolygon } from '@/core/geometry/polygon';
import { segmentIntersection } from '@/core/geometry/vec';
import { unionShapes } from '@/core/geometry/boolean';
import type { Ring, Shape, Vec2 } from '@/core/model/types';
import { levelFromWalls, rectRoom, type WallSegment } from './fixtures';

const near = (ring: Ring, q: Vec2, eps = 1e-2) => ring.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < eps);
const inShape = (s: Shape, q: Vec2) => s.some((p) => pointInPolygon(q, p));
/** True when no two non-adjacent edges of the ring intersect. */
const isSimple = (r: Ring) => {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentIntersection(r[i]!, r[(i + 1) % n]!, r[j]!, r[(j + 1) % n]!)) return false;
    }
  }
  return true;
};

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
    // both miter corners at 2h = 20 from the node (200, 0), on the bisectors (150 deg / 330 deg)
    const s3 = Math.sqrt(3);
    expect(near(shape[0]!.outer, { x: 200 - 10 * s3, y: 10 })).toBe(true);
    expect(near(shape[0]!.outer, { x: 200 + 10 * s3, y: -10 })).toBe(true);
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
    // each quadrant: faces at 10 (outer walls) and 190 (inner walls, 20 thick) -> 180 x 180
    for (const hole of shape[0]!.holes) expect(area(hole)).toBeCloseTo(180 * 180, 3);
  });
  it('walls of different thickness join without gap', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0, 30], [100, 0, 100, 100, 10]]);
    expect(computeWallShape(lvl, { withOpenings: false })).toHaveLength(1);
    const shape = computeWallShape(lvl, { withOpenings: false });
    // 100x30 + 100x10 - 5x15 overlap + 5x15 outer miter wedge
    expect(shapeArea(shape)).toBeCloseTo(4000, 3);
    const outer = shape[0]!.outer;
    expect(outer).toHaveLength(6);
    for (const q of [{ x: 0, y: -15 }, { x: 105, y: -15 }, { x: 105, y: 100 }, { x: 95, y: 100 }, { x: 95, y: 15 }, { x: 0, y: 15 }]) {
      expect(near(outer, q, 1e-6)).toBe(true);
    }
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
    // exact outline: bevel (-1.73, 9.85)-(0, -10) at the node, inner corner at (114.42, 10)
    expect(shape).toHaveLength(1);
    expect(shape[0]!.outer).toHaveLength(7);
    for (const q of [{ x: -1.7347, y: 9.8484 }, { x: 0, y: -10 }, { x: 200, y: -10 }, { x: 200, y: 10 }, { x: 114.4187, y: 10 }, { x: 198.7347, y: 24.8516 }, { x: 195.2653, y: 44.5484 }]) {
      expect(near(shape[0]!.outer, q, 1e-3)).toBe(true);
    }
    expect(shapeArea(shape)).toBeCloseTo(6865.1415, 2);
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

describe('miter truncation threshold (spec 6.1: truncated below 15 deg)', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  const pair = (d: number) => levelFromWalls([[0, 0, 200, 0], [0, 0, 200 * Math.cos(deg(d)), 200 * Math.sin(deg(d))]]);
  const minX = (s: Shape) => Math.min(...s.flatMap((p) => p.outer.map((q) => q.x)));
  it('20 deg between 20 cm walls keeps the miter: tip at -10 / tan(10 deg)', () => {
    const lvl = pair(20);
    expect(minX(computeWallShape(lvl, { withOpenings: false }))).toBeCloseTo(-10 / Math.tan(deg(10)), 3);
    const outlineMinX = Math.min(...[...computeWallOutlines(lvl).values()].flat().map((p) => p.x));
    expect(outlineMinX).toBeCloseTo(-10 / Math.tan(deg(10)), 3);
  });
  it('12 deg is truncated: bevel between the square ends', () => {
    expect(minX(computeWallShape(pair(12), { withOpenings: false }))).toBeCloseTo(-10 * Math.sin(deg(12)), 3);
  });
});

describe('short walls and unequal thicknesses', () => {
  it('wall shorter than the miter setback: simple outlines, exact area 2150', () => {
    // 5 cm branch, thickness 20: [0,100]x[-10,10] + [90,110]x[-10,5] (outer miter wedge included)
    const lvl = levelFromWalls([[0, 0, 100, 0], [100, 0, 100, 5]]);
    for (const ring of computeWallOutlines(lvl).values()) expect(isSimple(ring)).toBe(true);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shapeArea(shape)).toBeCloseTo(2150, 3);
  });
  it('U turn with a wall shorter than both setbacks keeps simple outlines and exact area', () => {
    // bottom wall 10 long between two walls going up: union = [-10,20]x[-10,10] + two 20x90 legs above y=10
    const lvl = levelFromWalls([[0, 100, 0, 0], [0, 0, 10, 0], [10, 0, 10, 100]]);
    for (const ring of computeWallOutlines(lvl).values()) expect(isSimple(ring)).toBe(true);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shapeArea(shape)).toBeCloseTo(30 * 20 + 2 * 20 * 90 - 10 * 90, 3);
  });
  it('thin wall at 30 deg on a thick wall leaves no notch in the thick wall', () => {
    const lvl = levelFromWalls([[0, 0, 200, 0, 40], [0, 0, 173.205, 100, 4]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    for (const q of [{ x: 5, y: 15 }, { x: 5, y: -15 }, { x: 1, y: 19 }, { x: 30, y: 19 }, { x: 1, y: -19 }]) {
      expect(inShape(shape, q)).toBe(true);
    }
  });
  it('outlines of every junction case are simple rings', () => {
    const cases = [
      [[0, 0, 100, 0], [100, 0, 100, 100]],
      [[0, 0, 200, 0], [200, 0, 100, 173.205]],
      [[0, 0, 200, 0], [0, 0, 197, 34.7]],
      [[0, 0, 100, 0, 30], [100, 0, 100, 100, 10]],
      [[0, 0, 200, 0, 40], [0, 0, 173.205, 100, 4]],
      [[0, 0, 100, 0], [0, 0, 100, 0.5], [0, 0, 100, 17], [0, 0, -50, 80, 30], [0, 0, -60, -60, 7]],
    ] as WallSegment[][];
    const cross: WallSegment[] = [...rectRoom(0, 0, 400, 400), [200, 0, 200, 200], [200, 200, 200, 400], [0, 200, 200, 200], [200, 200, 400, 200]];
    for (const c of [...cases, cross]) {
      for (const ring of computeWallOutlines(levelFromWalls(c)).values()) expect(isSimple(ring)).toBe(true);
    }
  });
  it('every outline lies inside the united wall shape', () => {
    const cases = [
      [[0, 0, 100, 0], [100, 0, 100, 100]],
      [[0, 0, 100, 0], [100, 0, 100, 5]],
      [[0, 0, 200, 0], [0, 0, 197, 34.7]],
      [[0, 0, 100, 0, 30], [100, 0, 100, 100, 10]],
      [[0, 0, 200, 0, 40], [0, 0, 173.205, 100, 4]],
      [[0, 100, 0, 0], [0, 0, 10, 0], [10, 0, 10, 100]],
      [[0, 0, 100, 0], [0, 0, 100, 0.5], [0, 0, 100, 17], [0, 0, -50, 80, 30], [0, 0, -60, -60, 7]],
    ] as WallSegment[][];
    for (const c of cases) {
      const lvl = levelFromWalls(c);
      const shape = computeWallShape(lvl, { withOpenings: false });
      const outlines: Shape = [...computeWallOutlines(lvl).values()].map((outer) => ({ outer, holes: [] }));
      expect(shapeArea(unionShapes([shape, outlines]))).toBeCloseTo(shapeArea(shape), 3);
    }
  });
});
