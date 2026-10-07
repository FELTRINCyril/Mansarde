import { describe, expect, it } from 'vitest';
import { objectClearances, openingClearances, placeAtClearance } from '@/core/geometry/clearances';
import { deriveLevel } from '@/core/geometry/derived';
import { createObjectFromSize, createOpening } from '@/core/model/factory';
import type { PlacedObject } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const box = (x: number, y: number, overrides: Partial<PlacedObject> = {}) =>
  createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, x, y, { width: 100, depth: 50, height: 50 }, 'X', '#999', overrides);

const bySide = (cs: ReturnType<typeof objectClearances>) => Object.fromEntries(cs.map((c) => [c.side, c]));

describe('objectClearances', () => {
  it('measures each side of an object to the nearest wall face', () => {
    // interior 380 x 280: faces at x = 10, x = 390, y = 10, y = 290
    const d = deriveLevel(levelFromWalls(rectRoom(0, 0, 400, 300)));
    const c = bySide(objectClearances(box(200, 150), d));
    expect(Object.keys(c).sort()).toEqual(['back', 'front', 'left', 'right']);
    expect(c.left!.distance).toBeCloseTo(140, 6);
    expect(c.right!.distance).toBeCloseTo(140, 6);
    expect(c.back!.distance).toBeCloseTo(115, 6);
    expect(c.front!.distance).toBeCloseTo(115, 6);
    expect(c.left!.from).toEqual({ x: 150, y: 150 });
    expect(c.left!.to.x).toBeCloseTo(10, 6);
    expect(c.left!.dir).toEqual({ x: -1, y: 0 });
  });

  it('follows the object rotation', () => {
    const d = deriveLevel(levelFromWalls(rectRoom(0, 0, 400, 300)));
    // rotated 90 deg: local back (-y) points to +x, local left (-x) points to -y
    const c = bySide(objectClearances(box(200, 150, { rotation: 90 }), d));
    expect(c.back!.distance).toBeCloseTo(390 - 225, 6);
    expect(c.left!.distance).toBeCloseTo(150 - 50 - 10, 6);
  });

  it('omits sides with no wall within 2000 cm', () => {
    const d = deriveLevel(levelFromWalls([[0, 0, 400, 0]]));
    const c = bySide(objectClearances(box(200, 100), d));
    expect(Object.keys(c)).toEqual(['back']);
    expect(c.back!.distance).toBeCloseTo(100 - 25 - 10, 6);
  });

  it('counts a free-standing wall box inside the room as an obstacle', () => {
    const d = deriveLevel(levelFromWalls([...rectRoom(0, 0, 400, 300), ...rectRoom(300, 100, 350, 200, 10)]));
    // the box outer face is at x = 295
    expect(bySide(objectClearances(box(200, 150), d)).right!.distance).toBeCloseTo(45, 6);
  });
});

describe('placeAtClearance', () => {
  it('moves the object so the chosen clearance takes the typed value', () => {
    const d = deriveLevel(levelFromWalls(rectRoom(0, 0, 400, 300)));
    const o = box(200, 150);
    const left = objectClearances(o, d).find((c) => c.side === 'left')!;
    expect(placeAtClearance(o, left, 60)).toEqual({ x: 120, y: 150 });
  });
});

describe('openingClearances', () => {
  it('distances to the wall ends along the axis', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const door = createOpening(findWall(level, 400, 0, 400, 300), 'door', 150, { width: 80 });
    const cs = openingClearances(level, door);
    expect(cs.map((c) => c.side)).toEqual(['before', 'after']);
    expect(cs[0]!.distance).toBeCloseTo(110, 6);
    expect(cs[1]!.distance).toBeCloseTo(110, 6);
    expect(cs[0]!.from).toEqual({ x: 400, y: 0 });
    expect(cs[0]!.to).toEqual({ x: 400, y: 110 });
    expect(cs[1]!.from).toEqual({ x: 400, y: 190 });
    expect(cs[1]!.to).toEqual({ x: 400, y: 300 });
  });

  it('stops at a neighbour opening on the same wall, ignores other walls', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const right = findWall(level, 400, 0, 400, 300);
    const win = createOpening(right, 'window', 250, { width: 60 });
    const other = createOpening(findWall(level, 0, 0, 400, 0), 'window', 30, { width: 40 });
    level.openings[win.id] = win;
    level.openings[other.id] = other;
    const door = createOpening(right, 'door', 150, { width: 80 });
    level.openings[door.id] = door;
    const [before, after] = openingClearances(level, door);
    expect(before!.distance).toBeCloseTo(110, 6);
    expect(after!.distance).toBeCloseTo(220 - 190, 6);
    expect(after!.to).toEqual({ x: 400, y: 220 });
  });
});
