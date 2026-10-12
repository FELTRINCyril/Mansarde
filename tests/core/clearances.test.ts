import { describe, expect, it } from 'vitest';
import { objectClearances, openingClearances, placeAtClearance, placeOpeningAtClearance, wallFaceInterval } from '@/core/geometry/clearances';
import { deriveLevel } from '@/core/geometry/derived';
import { snapObjectToWalls } from '@/core/geometry/snap';
import { deg2rad, rotate } from '@/core/geometry/vec';
import { createObjectFromSize, createOpening } from '@/core/model/factory';
import type { PlacedObject, Vec2 } from '@/core/model/types';
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

describe('objects flush against an oblique wall', () => {
  // the 400 x 300 room turned by 30 deg around the origin; local (x, y) -> world
  const turn = (p: Vec2): Vec2 => rotate(p, deg2rad(30));
  const corners = [turn({ x: 0, y: 0 }), turn({ x: 400, y: 0 }), turn({ x: 400, y: 300 }), turn({ x: 0, y: 300 })];
  const level = levelFromWalls(corners.map((a, i) => {
    const b = corners[(i + 1) % 4]!;
    return [a.x, a.y, b.x, b.y] as [number, number, number, number];
  }));
  const d = deriveLevel(level);
  // bed centers in local coordinates, back edge 5 cm from each inner face (faces at 10 and 390 / 290)
  const near: Record<string, Vec2> = {
    top: { x: 200, y: 110 },
    bottom: { x: 200, y: 190 },
    left: { x: 110, y: 150 },
    right: { x: 290, y: 150 },
  };

  it.each(Object.entries(near))('%s wall: back clearance is 0 and placeAtClearance keeps it flush', (_, local) => {
    const c = turn(local);
    const raw = createObjectFromSize({ kind: 'catalog', catalogId: 'bed' }, c.x, c.y, { width: 140, depth: 190, height: 50 }, 'Lit', '#999');
    const s = snapObjectToWalls(raw, level, 1);
    expect(s.wallId).not.toBeNull();
    const bed = { ...raw, x: s.x, y: s.y, rotation: s.rotation };
    const back = objectClearances(bed, d).find((x) => x.side === 'back')!;
    expect(back.distance).toBeCloseTo(0, 6);
    expect(Object.is(back.distance, -0)).toBe(false);
    const kept = placeAtClearance(bed, back, 0);
    expect(kept.x).toBeCloseTo(bed.x, 6);
    expect(kept.y).toBeCloseTo(bed.y, 6);
    // moving the back 30 cm away from the face along the outward axis
    const moved = placeAtClearance(bed, back, 30);
    expect(Math.hypot(moved.x - bed.x, moved.y - bed.y)).toBeCloseTo(30, 6);
  });
});

describe('placeAtClearance', () => {
  it('moves the object so the chosen clearance takes the typed value', () => {
    const d = deriveLevel(levelFromWalls(rectRoom(0, 0, 400, 300)));
    const o = box(200, 150);
    const left = objectClearances(o, d).find((c) => c.side === 'left')!;
    const p = placeAtClearance(o, left, 60);
    expect(p.x).toBeCloseTo(120, 6);
    expect(p.y).toBeCloseTo(150, 6);
  });
});

describe('openingClearances', () => {
  it('distances to the wall ends along the axis when no wall meets them', () => {
    const level = levelFromWalls([[0, 0, 300, 0]]);
    const door = createOpening(findWall(level, 0, 0, 300, 0), 'door', 150, { width: 80 });
    const cs = openingClearances(level, door);
    expect(cs.map((c) => c.side)).toEqual(['before', 'after']);
    expect(cs[0]!.distance).toBeCloseTo(110, 6);
    expect(cs[1]!.distance).toBeCloseTo(110, 6);
    expect(cs[0]!.from).toEqual({ x: 0, y: 0 });
    expect(cs[0]!.to).toEqual({ x: 110, y: 0 });
    expect(cs[1]!.from).toEqual({ x: 190, y: 0 });
    expect(cs[1]!.to).toEqual({ x: 300, y: 0 });
  });

  it('measures to the inner face of the perpendicular walls (ruling R29)', () => {
    // right wall x = 400 from y = 0 to 300; top and bottom walls 20 cm thick: inner faces at y = 10 and 290
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const door = createOpening(findWall(level, 400, 0, 400, 300), 'door', 150, { width: 80 });
    const [before, after] = openingClearances(level, door);
    expect(before!.distance).toBeCloseTo(100, 6);
    expect(after!.distance).toBeCloseTo(100, 6);
    expect(before!.from.x).toBeCloseTo(400, 6);
    expect(before!.from.y).toBeCloseTo(10, 6);
    expect(before!.to).toEqual({ x: 400, y: 110 });
    expect(after!.from).toEqual({ x: 400, y: 190 });
    expect(after!.to.y).toBeCloseTo(290, 6);
  });

  it('takes the face of a thicker neighbour wall', () => {
    // left wall 30 cm thick: its inner face is at x = 15
    const level = levelFromWalls([[0, 0, 400, 0], [0, 0, 0, 300, 30]]);
    const door = createOpening(findWall(level, 0, 0, 400, 0), 'door', 100, { width: 80 });
    const [before, after] = openingClearances(level, door);
    expect(before!.distance).toBeCloseTo(60 - 15, 6);
    expect(after!.distance).toBeCloseTo(400 - 140, 6); // free end
  });

  it('measures to the face of an oblique neighbour wall', () => {
    // wall B along y = x, 20 cm thick: its face towards wall A is the line x = y + 10 * sqrt(2); at y = 10, x = 24.142
    const level = levelFromWalls([[0, 0, 300, 0], [0, 0, 100, 100]]);
    const door = createOpening(findWall(level, 0, 0, 300, 0), 'door', 150, { width: 80 });
    const [before] = openingClearances(level, door);
    expect(before!.distance).toBeCloseTo(110 - (10 + 10 * Math.SQRT2), 6);
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
    expect(before!.distance).toBeCloseTo(100, 6);
    expect(after!.distance).toBeCloseTo(220 - 190, 6);
    expect(after!.to).toEqual({ x: 400, y: 220 });
  });

  it('never reports a negative distance when the opening edge lies inside a neighbour wall', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const door = createOpening(findWall(level, 400, 0, 400, 300), 'door', 45, { width: 80 }); // edge at y = 5 < 10
    const [before] = openingClearances(level, door);
    // the edge (y = 5) lies inside the top wall body: no face between it and the node, 5 cm to the node
    expect(before!.distance).toBeCloseTo(5, 9);
  });
});

describe('placeOpeningAtClearance', () => {
  it('returns the offset giving the chosen clearance the typed value', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const door = createOpening(findWall(level, 400, 0, 400, 300), 'door', 150, { width: 80 });
    const [before, after] = openingClearances(level, door);
    expect(placeOpeningAtClearance(door, before!, 60)).toBeCloseTo(110, 6);
    expect(placeOpeningAtClearance(door, after!, 30)).toBeCloseTo(220, 6);
  });
});

describe('wallFaceInterval', () => {
  it('is the whole wall when nothing meets it, between the inner faces of the neighbour walls otherwise', () => {
    const lone = levelFromWalls([[0, 0, 300, 0]]);
    expect(wallFaceInterval(lone, findWall(lone, 0, 0, 300, 0))).toEqual([0, 300]);
    const room = levelFromWalls(rectRoom(0, 0, 400, 300));
    const [lo, hi] = wallFaceInterval(room, findWall(room, 0, 0, 400, 0));
    expect(lo).toBeCloseTo(10, 6);
    expect(hi).toBeCloseTo(390, 6);
  });

  it('is measured around the given axis position: a crossing wall splits the wall in two stretches', () => {
    // wall 0..600 along y = 0, crossed at x = 200 by a 20 cm wall without shared node (faces x = 190, 210)
    const level = levelFromWalls([[0, 0, 600, 0], [200, -100, 200, 100]]);
    const id = findWall(level, 0, 0, 600, 0);
    const [lo1, hi1] = wallFaceInterval(level, id, 80);
    expect(lo1).toBe(0);
    expect(hi1).toBeCloseTo(190, 6);
    const [lo2, hi2] = wallFaceInterval(level, id, 400);
    expect(lo2).toBeCloseTo(210, 6);
    expect(hi2).toBe(600);
    // over the crossing wall: the nearest stretch
    expect(wallFaceInterval(level, id, 195)[1]).toBeCloseTo(190, 6);
    expect(wallFaceInterval(level, id, 206)[0]).toBeCloseTo(210, 6);
  });

  it('with a side, only the walls met on that face bound the stretch (cupboards)', () => {
    // wall 0..600 along y = 0 (left = +y), a wall abutting it at x = 200 on the left face only
    const level = levelFromWalls([[0, 0, 600, 0], [200, 0, 200, 150]]);
    const id = findWall(level, 0, 0, 600, 0);
    const [lo, hi] = wallFaceInterval(level, id, 80, undefined, 'left');
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(190, 6);
    expect(wallFaceInterval(level, id, 80, undefined, 'right')).toEqual([0, 600]);
    // both faces (default): the abutting wall cuts it too
    expect(wallFaceInterval(level, id, 80)[1]).toBeCloseTo(190, 6);
  });

  it('a position inside a neighbour wall body (corner) gives the stretch next to it', () => {
    const room = levelFromWalls(rectRoom(0, 0, 400, 300));
    const [lo, hi] = wallFaceInterval(room, findWall(room, 0, 0, 400, 0), 0);
    expect(lo).toBeCloseTo(10, 6);
    expect(hi).toBeCloseTo(390, 6);
  });
});
