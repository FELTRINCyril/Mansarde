import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooleanOpError, unionRings } from '@/core/geometry/boolean';
import { deriveLevel } from '@/core/geometry/derived';
import { area } from '@/core/geometry/polygon';
import { createOpening } from '@/core/model/factory';
import type { Level, Ring, Shape } from '@/core/model/types';
import { levelFromWalls, rectRoom } from './fixtures';

/**
 * polygon-clipping, made to fail on demand: `failures` = how many calls fail before the library
 * works again (Infinity = always); `poison` = calls fail while any input x lies in [poison, poison + 100].
 */
const ctl = vi.hoisted(() => ({ union: 0, difference: 0, poison: null as number | null, calls: 0 }));
vi.mock('polygon-clipping', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: Record<string, (...a: unknown[]) => unknown> }).default;
  const poisoned = (geoms: unknown[]): boolean =>
    ctl.poison !== null && JSON.stringify(geoms).match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.some((n) => +n >= ctl.poison! && +n <= ctl.poison! + 100);
  const wrap =
    (name: 'union' | 'difference') =>
    (...geoms: unknown[]) => {
      ctl.calls++;
      if (ctl[name] > 0) {
        ctl[name]--;
        throw new Error('Unable to complete output ring (simulated)');
      }
      if (name === 'union' && poisoned(geoms)) throw new Error('Unable to find segment in SweepLine tree (simulated)');
      return real[name]!(...geoms);
    };
  return { default: { ...real, union: wrap('union'), difference: wrap('difference') } };
});

afterEach(() => {
  ctl.union = 0;
  ctl.difference = 0;
  ctl.poison = null;
  ctl.calls = 0;
});

const rect = (x: number, y: number, w: number, h: number): Ring => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const shapeArea = (s: Shape): number => s.reduce((acc, p) => acc + area(p.outer) - p.holes.reduce((a, h) => a + area(h), 0), 0);

/** A 400 x 300 room (axes) with a door on its top wall. */
function roomWithDoor(): Level {
  const level = levelFromWalls(rectRoom(0, 0, 400, 300));
  const top = Object.values(level.walls).find((w) => level.nodes[w.startNodeId]!.y === 0 && level.nodes[w.endNodeId]!.y === 0)!;
  const door = createOpening(top.id, 'door', 200);
  level.openings[door.id] = door;
  return level;
}

describe('boolean retries (ruling R37)', () => {
  it('a failing union is retried on transformed coordinates and gives the exact result', () => {
    ctl.union = 3; // raw, 1e-6 and 1e-3 attempts fail; the 0.1 cm snap succeeds
    const s = unionRings([rect(0, 0, 10, 10), rect(5, 5, 10, 10)]);
    expect(shapeArea(s)).toBeCloseTo(175, 6);
    expect(ctl.calls).toBe(4);
  });

  it('throws BooleanOpError (not the library error) once every retry failed', () => {
    ctl.union = Infinity;
    expect(() => unionRings([rect(0, 0, 10, 10), rect(5, 5, 10, 10)])).toThrow(BooleanOpError);
  });
});

describe('degraded derived geometry (ruling R37)', () => {
  it('an exact level is not degraded', () => {
    const d = deriveLevel(roomWithDoor());
    expect(d.degraded).toBe(false);
    expect(d.rooms).toHaveLength(1);
  });

  it('a union that keeps failing gives the walls as separate polygons, flagged, without rooms or facades', () => {
    ctl.union = Infinity;
    const level = roomWithDoor();
    let d: ReturnType<typeof deriveLevel> | null = null;
    expect(() => {
      d = deriveLevel(level);
    }).not.toThrow();
    const r = d!;
    expect(r.degraded).toBe(true);
    expect(r.rooms).toEqual([]);
    expect(r.facadeRings).toEqual([]);
    // 4 wall bodies + 4 outer joint fills, each kept as is
    expect(r.shapeNoOpenings.length).toBeGreaterThanOrEqual(4);
    expect(r.shapeNoOpenings.every((p) => p.outer.length >= 3 && p.holes.length === 0)).toBe(true);
    expect(r.outlines.size).toBe(4);
  });

  it('a union failing on one wall only keeps the others united (stepwise union)', () => {
    // room 0..400 plus a lone wall far away at x 5000: only unions involving that wall fail
    const level = levelFromWalls([...rectRoom(0, 0, 400, 300), [5000, 0, 5000, 300]]);
    ctl.poison = 4980;
    const d = deriveLevel(level);
    expect(d.degraded).toBe(true);
    expect(d.rooms).toEqual([]);
    // the room walls are still one polygon with its hole; the lone wall is a separate polygon
    expect(d.shapeNoOpenings).toHaveLength(2);
    expect(d.shapeNoOpenings.some((p) => p.holes.length === 1)).toBe(true);
  });

  it('a failing opening cut keeps the exact walls and rooms, the opening is not cut out', () => {
    ctl.difference = Infinity;
    const d = deriveLevel(roomWithDoor());
    expect(d.degraded).toBe(true);
    expect(d.rooms).toHaveLength(1); // rooms come from the exact shape without openings
    expect(shapeArea(d.shapeWithOpenings)).toBeCloseTo(shapeArea(d.shapeNoOpenings), 6);
    expect(d.shapeWithOpenings).not.toBe(d.shapeNoOpenings);
  });

  it('never throws even when the level references a missing node', () => {
    const level = roomWithDoor();
    const wall = Object.values(level.walls)[0]!;
    const broken: Level = { ...level, walls: { ...level.walls, [wall.id]: { ...wall, startNodeId: 'missing' } } };
    const d = deriveLevel(broken);
    expect(d.degraded).toBe(true);
    expect(d.rooms).toEqual([]);
    // the 3 sound walls are still drawn, as their raw outlines
    expect(d.outlines.size).toBe(3);
    expect(d.shapeWithOpenings).toHaveLength(3);
  });
});
