import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { area } from '@/core/geometry/polygon';
import { createOpening } from '@/core/model/factory';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

describe('deriveLevel', () => {
  it('is memoized by level identity', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const d = deriveLevel(level);
    expect(deriveLevel(level)).toBe(d);
    expect(deriveLevel({ ...level, walls: { ...level.walls } })).not.toBe(d);
  });

  it('reuses the result for a new level that shares its walls, nodes, openings and labels', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const d = deriveLevel(level);
    // furniture moved: Immer gives a new level and a new objects record, the rest is shared
    expect(deriveLevel({ ...level, objects: {} })).toBe(d);
    expect(deriveLevel({ ...level, roomLabels: [] })).not.toBe(d);
    expect(deriveLevel({ ...level, openings: {} })).not.toBe(d);
    expect(deriveLevel({ ...level, nodes: { ...level.nodes } })).not.toBe(d);
  });

  it('computes outlines, both shapes, rooms and facade rings', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const door = createOpening(findWall(level, 0, 0, 400, 0), 'door', 200);
    level.openings[door.id] = door;
    const d = deriveLevel(level);
    expect(d.outlines.size).toBe(4);
    expect(d.rooms).toHaveLength(1);
    expect(d.shapeNoOpenings).toHaveLength(1);
    expect(area(d.facadeRings[0]!)).toBeCloseTo(420 * 320, 3);
    // the door cuts the wall loop open: no hole left in the shape with openings
    expect(d.shapeWithOpenings.flatMap((p) => p.holes)).toHaveLength(0);
  });

  it('a free-standing wall box inside a room is not a facade ring', () => {
    const d = deriveLevel(levelFromWalls([...rectRoom(0, 0, 400, 300), ...rectRoom(250, 100, 350, 200, 10)]));
    expect(d.shapeNoOpenings).toHaveLength(2);
    expect(d.facadeRings).toHaveLength(1);
    expect(area(d.facadeRings[0]!)).toBeCloseTo(420 * 320, 3);
  });
});
