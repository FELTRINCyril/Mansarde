import { describe, it, expect } from 'vitest';
import {
  openingCutRing,
  openingFitsWall,
  openingFrame,
  openingInterval,
  openingsOverlap,
} from '@/core/geometry/openings';
import { area } from '@/core/geometry/polygon';
import { createOpening } from '@/core/model/factory';
import { levelFromWalls } from './fixtures';

const at = (offset: number, width: number) => createOpening('w', 'door', offset, { width });

describe('opening geometry', () => {
  it('openingFrame on a horizontal wall', () => {
    const lvl = levelFromWalls([[0, 0, 300, 0]]);
    const wallId = Object.keys(lvl.walls)[0]!;
    const f = openingFrame(lvl, createOpening(wallId, 'door', 150, { width: 80 }));
    expect(f.center).toEqual({ x: 150, y: 0 });
    expect(f.dir).toEqual({ x: 1, y: 0 });
    expect(f.normal.x).toBeCloseTo(0);
    expect(f.normal.y).toBeCloseTo(1);
    expect(f.start).toEqual({ x: 110, y: 0 });
    expect(f.end).toEqual({ x: 190, y: 0 });
    expect(f.thickness).toBe(20);
    expect(f.wallLength).toBe(300);
  });
  it('openingFrame follows a vertical wall drawn upward on screen', () => {
    const lvl = levelFromWalls([[0, 200, 0, 0, 10]]);
    const wallId = Object.keys(lvl.walls)[0]!;
    const f = openingFrame(lvl, createOpening(wallId, 'window', 50, { width: 40 }));
    expect(f.center.x).toBeCloseTo(0);
    expect(f.center.y).toBeCloseTo(150);
    expect(f.start.y).toBeCloseTo(170);
    expect(f.end.y).toBeCloseTo(130);
    expect(f.normal.x).toBeCloseTo(1);
  });
  it('openingCutRing spans width along the wall and thickness + 2 cm each side', () => {
    const lvl = levelFromWalls([[0, 0, 300, 0]]);
    const wallId = Object.keys(lvl.walls)[0]!;
    const ring = openingCutRing(lvl, createOpening(wallId, 'door', 150, { width: 80 }));
    expect(ring).toHaveLength(4);
    expect(area(ring)).toBeCloseTo(80 * 24);
    expect(Math.min(...ring.map((p) => p.y))).toBeCloseTo(-12);
    expect(Math.max(...ring.map((p) => p.x))).toBeCloseTo(190);
  });
  it('openingFrame throws for a missing wall', () => {
    const lvl = levelFromWalls([[0, 0, 300, 0]]);
    expect(() => openingFrame(lvl, createOpening('nope', 'door', 150))).toThrow();
  });
  it('openingInterval', () => {
    expect(openingInterval(at(150, 80))).toEqual([110, 190]);
  });
  it('openingFitsWall', () => {
    expect(openingFitsWall(at(150, 80), 300)).toBe(true);
    expect(openingFitsWall(at(20, 80), 300)).toBe(false);
    expect(openingFitsWall(at(40, 80), 300)).toBe(true); // touches the start exactly
    expect(openingFitsWall(at(260, 80), 300)).toBe(true); // touches the end exactly
    expect(openingFitsWall(at(261, 80), 300)).toBe(false);
  });
  it('openingsOverlap', () => {
    expect(openingsOverlap(at(140, 80), at(210, 80))).toBe(true); // [100,180] / [170,250]
    expect(openingsOverlap(at(140, 80), at(220, 80))).toBe(false); // [100,180] / [180,260] contact only
    expect(openingsOverlap(at(220, 80), at(140, 80))).toBe(false);
  });
});
