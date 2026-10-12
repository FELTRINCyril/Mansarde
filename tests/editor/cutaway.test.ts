import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { createBeam, createSlope } from '@/core/model/factory';
import type { Level } from '@/core/model/types';
import { hiddenCeilings, hiddenWalls } from '@/scene3d/cutaway';
import { findWall, levelFromWalls, rectRoom } from '../core/fixtures';

/** A 4 x 4 m room inside (walls 20 cm, axes on -10 / 410), 2.40 m high. */
function room(): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  return level;
}

const wallsOf = (level: Level) => ({
  north: findWall(level, -10, -10, 410, -10),
  east: findWall(level, 410, -10, 410, 410),
  south: findWall(level, 410, 410, -10, 410),
  west: findWall(level, -10, 410, -10, -10),
});

const sorted = (s: Set<string>) => [...s].sort();

describe('hiddenWalls (spec 8.3 cut-away)', () => {
  it('rectangular room, camera to the south: the south wall only', () => {
    const level = room();
    const w = wallsOf(level);
    const hidden = hiddenWalls(deriveLevel(level), { x: 200, y: 900 }, { x: 200, y: 200 });
    expect(sorted(hidden)).toEqual([w.south]);
  });

  it('camera to the north, east or west: that wall only', () => {
    const level = room();
    const w = wallsOf(level);
    const d = deriveLevel(level);
    const c = { x: 200, y: 200 };
    expect(sorted(hiddenWalls(d, { x: 200, y: -700 }, c))).toEqual([w.north]);
    expect(sorted(hiddenWalls(d, { x: 1100, y: 250 }, c))).toEqual([w.east]);
    expect(sorted(hiddenWalls(d, { x: -600, y: 120 }, c))).toEqual([w.west]);
  });

  it("overview from the south-west (plan-chambre's pose): the south and west walls, as plan-chambre hides them", () => {
    const level = room();
    const w = wallsOf(level);
    // plan-chambre's overview direction (-3.7, 4.1) in plan from the center
    const hidden = hiddenWalls(deriveLevel(level), { x: 200 - 370 * 2, y: 200 + 410 * 2 }, { x: 200, y: 200 });
    expect(sorted(hidden)).toEqual(sorted(new Set([w.south, w.west])));
  });

  it('camera inside the room (room preset): nothing hidden', () => {
    const level = room();
    expect(hiddenWalls(deriveLevel(level), { x: 300, y: 320 }, { x: 200, y: 200 }).size).toBe(0);
  });

  it('a partition between the camera and the target is hidden; a partition beside the segment is not', () => {
    // 5 x 4 m house, partitions at x = 300 (full height of the plan) and a short one from (100, 200) to (100, 400)
    const level = levelFromWalls([...rectRoom(0, 0, 500, 400), [300, 0, 300, 400, 10], [0, 250, 120, 250, 10]]);
    const d = deriveLevel(level);
    const east = findWall(level, 500, 0, 500, 400);
    const partition = findWall(level, 300, 0, 300, 400);
    const hidden = hiddenWalls(d, { x: 1400, y: 120 }, { x: 150, y: 120 });
    expect(hidden.has(partition)).toBe(true);
    expect(hidden.has(east)).toBe(true);
    // the short partition at y = 250 does not cross the segment at y = 120
    expect(hidden.has(findWall(level, 0, 250, 120, 250))).toBe(false);
    expect(hidden.size).toBe(2);
  });

  it('free-standing walls (no room) are hidden only when the segment crosses them', () => {
    const level = levelFromWalls([[0, 0, 300, 0], [300, 0, 300, 200]]);
    const d = deriveLevel(level);
    const a = findWall(level, 0, 0, 300, 0);
    // camera to the north looking at a point south of the first wall: crosses it
    expect(sorted(hiddenWalls(d, { x: 150, y: -500 }, { x: 150, y: 100 }))).toEqual([a]);
    // camera to the south-west looking at (150, 100): crosses nothing, the facades of a level without room are not cut
    expect(hiddenWalls(d, { x: -400, y: 600 }, { x: 150, y: 100 }).size).toBe(0);
  });
});

describe('hiddenCeilings (spec 8.3: ceilings and sloped ceilings hidden when the camera is above them)', () => {
  /** plan-chambre's attic: flat 240 up to x = 197, then down to 150 at x = 400; a beam along x = 191. */
  function attic(): Level {
    const level = room();
    const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
    level.slopes[s.id] = s;
    const b = createBeam({ x: 191, y: 0 }, { x: 191, y: 400 });
    level.beams[b.id] = b;
    return level;
  }

  it('camera at eye height inside: nothing hidden; high above: the room ceiling and the beam', () => {
    const level = attic();
    const d = deriveLevel(level);
    const beam = Object.keys(level.beams)[0]!;
    const inside = hiddenCeilings(level, d.rooms, { x: 100, y: 200 }, 160);
    expect(inside.rooms.size).toBe(0);
    expect(inside.beams.size).toBe(0);
    const above = hiddenCeilings(level, d.rooms, { x: -300, y: 700 }, 600);
    expect(sorted(above.rooms)).toEqual([d.rooms[0]!.key]);
    expect(sorted(above.beams)).toEqual([beam]);
  });

  it('compares with the ceiling on the side of the camera: 2 m outside the low wall hides it, 2 m outside the high wall does not', () => {
    const level = attic();
    const d = deriveLevel(level);
    expect(hiddenCeilings(level, d.rooms, { x: 700, y: 200 }, 200).rooms.size).toBe(1); // ceiling 150 at x = 400
    expect(hiddenCeilings(level, d.rooms, { x: -300, y: 200 }, 200).rooms.size).toBe(0); // ceiling 240 at x = 0
    expect(hiddenCeilings(level, d.rooms, { x: -300, y: 200 }, 245).rooms.size).toBe(1);
  });
});
