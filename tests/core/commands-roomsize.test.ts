import { describe, expect, it } from 'vitest';
import { setRoomInteriorSize } from '@/core/commands/roomSize';
import { addCupboard } from '@/core/commands/cupboards';
import { addRectRoomInterior } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { rectangularRoom } from '@/core/geometry/roomRect';
import { computeRooms } from '@/core/geometry/rooms';
import { createCupboard } from '@/core/model/factory';
import { cupboardFootprint } from '@/core/geometry/cupboards';
import type { Level, Project } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom, type WallSegment } from './fixtures';
import { emptyProject, levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const interior = (x1: number, y1: number, x2: number, y2: number): Project => {
  const p = emptyProject();
  return run(p, addRectRoomInterior(levelId(p), { x: x1, y: y1 }, { x: x2, y: y2 }, 20, 250));
};

const onlyRoomKey = (level: Level): string => {
  const rooms = deriveLevel(level).rooms;
  expect(rooms).toHaveLength(1);
  return rooms[0]!.key;
};

/**
 * Two rooms side by side sharing the wall on x = 410 (axes): A has the interior 0..400 x 0..300,
 * B the interior 420..700 x 0..300 (280 wide). Every room side is a single wall.
 */
const twoRooms: WallSegment[] = [
  [-10, -10, 410, -10],
  [410, -10, 710, -10],
  [710, -10, 710, 310],
  [710, 310, 410, 310],
  [410, 310, -10, 310],
  [-10, 310, -10, -10],
  [410, -10, 410, 310],
];

/** Axis rectangle 0..400 x 0..300 whose top side is two walls (T junction with a stub going up at x = 200). */
const tSide: WallSegment[] = [
  [0, 0, 200, 0],
  [200, 0, 400, 0],
  [200, 0, 200, -100],
  [400, 0, 400, 300],
  [400, 300, 0, 300],
  [0, 300, 0, 0],
];

const roomLeftOf = (level: Level, x: number) => deriveLevel(level).rooms.find((r) => r.labelPoint.x < x)!;
const roomRightOf = (level: Level, x: number) => deriveLevel(level).rooms.find((r) => r.labelPoint.x > x)!;

describe('addRectRoomInterior', () => {
  it('builds walls outside the interior rectangle: one room of 400 x 300 = 12,00 m2', () => {
    const p = interior(0, 0, 400, 300);
    const level = lvl(p);
    expect(Object.keys(level.walls)).toHaveLength(4);
    const rooms = computeRooms(level);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(120000, 6);
    // axes at thickness / 2 beyond each face
    findWall(level, -10, -10, 410, -10);
    findWall(level, 410, -10, 410, 310);
    findWall(level, 410, 310, -10, 310);
    findWall(level, -10, 310, -10, -10);
  });

  it('accepts corners in any order', () => {
    const level = lvl(interior(400, 300, 0, 0));
    expect(computeRooms(level)[0]!.area).toBeCloseTo(120000, 6);
  });

  it('refuses a degenerate rectangle and invalid sizes', () => {
    const p = emptyProject();
    const a = { x: 0, y: 0 };
    expect(refuse(p, addRectRoomInterior(levelId(p), a, { x: 0.5, y: 300 }, 20, 250))).toBe('Pièce trop petite');
    expect(refuse(p, addRectRoomInterior(levelId(p), a, { x: 400, y: 9.99 }, 20, 250))).toBe('Pièce trop petite');
    run(p, addRectRoomInterior(levelId(p), a, { x: 10, y: 10 }, 20, 250)); // 10 cm, same minimum as setRoomInteriorSize
    expect(refuse(p, addRectRoomInterior(levelId(p), a, { x: 400, y: 300 }, 0, 250))).toBe('Épaisseur invalide');
    expect(refuse(p, addRectRoomInterior(levelId(p), a, { x: 400, y: 300 }, 20, NaN))).toBe('Hauteur invalide');
    expect(refuse(p, addRectRoomInterior(levelId(p), a, { x: NaN, y: 300 }, 20, 250))).toBe('Position invalide');
  });
});

describe('rectangularRoom', () => {
  it('describes an axis-aligned room: size, axes and the wall of each face', () => {
    const level = lvl(interior(0, 0, 400, 300));
    const rect = rectangularRoom(level, deriveLevel(level), onlyRoomKey(level))!;
    expect(rect).not.toBeNull();
    expect(rect.width).toBeCloseTo(400, 9);
    expect(rect.depth).toBeCloseTo(300, 9);
    expect(rect.axisU.x).toBeCloseTo(1, 12);
    expect(rect.axisU.y).toBeCloseTo(0, 12);
    expect(rect.axisV.x).toBeCloseTo(0, 12);
    expect(rect.axisV.y).toBeCloseTo(1, 12);
    expect(rect.faces).toHaveLength(4);
    const right = findWall(level, 410, -10, 410, 310);
    const face = rect.faces.find((f) => f.wallId === right)!;
    // wall (410,-10)->(410,310): dir (0, 1), left = +perp = (-1, 0), towards the room
    expect(face.side).toBe('left');
    for (const pt of [face.a, face.b]) expect(pt.x).toBeCloseTo(400, 9);
    expect(new Set(rect.faces.map((f) => f.wallId)).size).toBe(4);
  });

  it('detects a rotated rectangle and rejects an L-shaped room or an unknown key', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const r = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
    const corners = [r(0, 0), r(400, 0), r(400, 300), r(0, 300)];
    const segs: WallSegment[] = corners.map((p, i) => [...p, ...corners[(i + 1) % 4]!] as WallSegment);
    const rotated = levelFromWalls(segs);
    const rect = rectangularRoom(rotated, deriveLevel(rotated), onlyRoomKey(rotated))!;
    expect(rect.width).toBeCloseTo(380, 6);
    expect(rect.depth).toBeCloseTo(280, 6);

    const lshape = levelFromWalls([
      [0, 0, 400, 0],
      [400, 0, 400, 200],
      [400, 200, 200, 200],
      [200, 200, 200, 300],
      [200, 300, 0, 300],
      [0, 300, 0, 0],
    ]);
    expect(rectangularRoom(lshape, deriveLevel(lshape), onlyRoomKey(lshape))).toBeNull();
    expect(rectangularRoom(lshape, deriveLevel(lshape), 'ghost')).toBeNull();
  });

  it('accepts a side made of two collinear walls (V2-R7)', () => {
    // top side split in two walls at x = 200 (a stub wall goes up from there)
    const level = levelFromWalls(tSide);
    const rect = rectangularRoom(level, deriveLevel(level), onlyRoomKey(level))!;
    expect(rect).not.toBeNull();
    expect(rect.width).toBeCloseTo(380, 9);
    expect(rect.depth).toBeCloseTo(280, 9);
    expect(rect.faces).toHaveLength(5);
    const top = rect.faces.filter((f) => f.a.y === 10 && f.b.y === 10);
    expect(top.map((f) => f.wallId).sort()).toEqual([findWall(level, 0, 0, 200, 0), findWall(level, 200, 0, 400, 0)].sort());
    expect(new Set(top.map((f) => f.edge)).size).toBe(1);
  });

  it('ignores a collinear wall beyond the room edge, rejects an edge with a gap', () => {
    const extended = levelFromWalls([...rectRoom(0, 0, 400, 300), [400, 300, 400, 600]]);
    expect(rectangularRoom(extended, deriveLevel(extended), onlyRoomKey(extended))!.faces).toHaveLength(4);
    // the top side is covered by two walls of different thickness: two face lines, no single side
    const mixed = levelFromWalls([[0, 0, 200, 0, 20], [200, 0, 400, 0, 30], [400, 0, 400, 300], [400, 300, 0, 300], [0, 300, 0, 0]]);
    expect(rectangularRoom(mixed, deriveLevel(mixed), onlyRoomKey(mixed))).toBeNull();
  });
});

const IMPOSSIBLE = 'Impossible de redimensionner cette pièce ainsi.';

describe('setRoomInteriorSize', () => {
  it('width 420 on the max side moves the right wall: 420 x 300', () => {
    const p = interior(0, 0, 400, 300);
    const next = run(p, setRoomInteriorSize(levelId(p), onlyRoomKey(lvl(p)), 'width', 420, 'max'));
    const rooms = computeRooms(lvl(next));
    expect(rooms[0]!.area).toBeCloseTo(420 * 300, 6);
    findWall(lvl(next), 430, -10, 430, 310); // the right wall moved by 20, its neighbours followed
    findWall(lvl(next), -10, 310, -10, -10); // the left wall did not move
  });

  it('min side moves the left wall; depth moves the top or bottom wall', () => {
    const p = interior(0, 0, 400, 300);
    const key = onlyRoomKey(lvl(p));
    const left = run(p, setRoomInteriorSize(levelId(p), key, 'width', 380, 'min'));
    findWall(lvl(left), 10, 310, 10, -10);
    findWall(lvl(left), 410, -10, 410, 310);
    const deeper = run(p, setRoomInteriorSize(levelId(p), key, 'depth', 350, 'max'));
    expect(computeRooms(lvl(deeper))[0]!.area).toBeCloseTo(400 * 350, 6);
    findWall(lvl(deeper), 410, 360, -10, 360);
    const top = run(p, setRoomInteriorSize(levelId(p), key, 'depth', 250, 'min'));
    findWall(lvl(top), -10, 40, 410, 40);
  });

  it('a neighbour sharing the moved wall loses the same 20 cm', () => {
    const p = projectFrom(twoRooms);
    const a = roomLeftOf(lvl(p), 410);
    const b = roomRightOf(lvl(p), 410);
    expect(a.area).toBeCloseTo(400 * 300, 6);
    expect(b.area).toBeCloseTo(280 * 300, 6);
    const next = run(p, setRoomInteriorSize(levelId(p), a.key, 'width', 420, 'max'));
    expect(roomLeftOf(lvl(next), 420).area).toBeCloseTo(420 * 300, 6);
    expect(roomRightOf(lvl(next), 420).area).toBeCloseTo(260 * 300, 6);
  });

  it('cupboards on the moved walls are reconciled', () => {
    const p0 = interior(0, 0, 400, 300);
    const top = findWall(lvl(p0), -10, -10, 410, -10);
    const c = createCupboard(top, 360, 'left'); // [300, 420] on the 420 cm axis
    const p = run(p0, addCupboard(levelId(p0), c));
    const next = run(p, setRoomInteriorSize(levelId(p), onlyRoomKey(lvl(p)), 'width', 300, 'max'));
    // top axis now 320 long; the free stretch of the inner face ends at the right face x = 300, i.e.
    // 310 from the start node: the cupboard stops there (V2-R32), not at the axis end (offset 260)
    expect(lvl(next).cupboards[c.id]!.offset).toBeCloseTo(250, 9);
  });

  it('moves every wall of a side made of collinear walls (V2-R7)', () => {
    const p = projectFrom(tSide);
    const next = run(p, setRoomInteriorSize(levelId(p), onlyRoomKey(lvl(p)), 'depth', 300, 'min'));
    const level = lvl(next);
    expect(computeRooms(level)[0]!.area).toBeCloseTo(380 * 300, 6);
    findWall(level, 0, -20, 200, -20);
    findWall(level, 200, -20, 400, -20);
    findWall(level, 200, -20, 200, -100); // the stub got shorter, same direction
  });

  it('works on a rotated room, on every side', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const r = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
    const corners = [r(0, 0), r(400, 0), r(400, 300), r(0, 300)];
    const p = projectFrom(corners.map((q, i) => [...q, ...corners[(i + 1) % 4]!] as WallSegment));
    const key = onlyRoomKey(lvl(p));
    for (const [axis, value, side] of [['width', 400, 'max'], ['width', 350, 'min'], ['depth', 300, 'max'], ['depth', 250, 'min']] as const) {
      const level = lvl(run(p, setRoomInteriorSize(levelId(p), key, axis, value, side)));
      const rect = rectangularRoom(level, deriveLevel(level), onlyRoomKey(level))!;
      expect(axis === 'width' ? rect.width : rect.depth).toBeCloseTo(value, 6);
      expect(axis === 'width' ? rect.depth : rect.width).toBeCloseTo(axis === 'width' ? 280 : 380, 6);
    }
  });

  it('refuses when a collinear extension of the moved wall would turn (V2-R11)', () => {
    const p = projectFrom([
      [-10, -10, 410, -10],
      [410, -10, 410, 310],
      [410, 310, 410, 610],
      [410, 310, -10, 310],
      [-10, 310, -10, -10],
    ]);
    expect(refuse(p, setRoomInteriorSize(levelId(p), onlyRoomKey(lvl(p)), 'width', 420, 'max'))).toBe(IMPOSSIBLE);
    // the other way the extension is not touched: allowed
    run(p, setRoomInteriorSize(levelId(p), onlyRoomKey(lvl(p)), 'width', 420, 'min'));
  });

  it('refuses when the move would open the room (corner without a shared node, V2-R11)', () => {
    // the top wall ends on the inner face of the right wall (x = 400) without a node there
    const p = projectFrom([
      [-10, -10, 400, -10],
      [410, -20, 410, 310],
      [410, 310, -10, 310],
      [-10, 310, -10, -10],
    ]);
    const key = onlyRoomKey(lvl(p));
    expect(rectangularRoom(lvl(p), deriveLevel(lvl(p)), key)).not.toBeNull();
    expect(refuse(p, setRoomInteriorSize(levelId(p), key, 'width', 420, 'max'))).toBe(IMPOSSIBLE);
  });

  it('cupboards stay in place whatever the drawing direction of their wall (V2-R12)', () => {
    const p0 = interior(0, 0, 400, 300);
    const top = findWall(lvl(p0), -10, -10, 410, -10); // drawn left to right
    const bottom = findWall(lvl(p0), 410, 310, -10, 310); // drawn right to left
    const ct = createCupboard(top, 200, 'left'); // center x = 190
    const cb = createCupboard(bottom, 220, 'right'); // center x = 190
    const p = run(run(p0, addCupboard(levelId(p0), ct)), addCupboard(levelId(p0), cb));
    const next = run(p, setRoomInteriorSize(levelId(p), onlyRoomKey(lvl(p)), 'width', 380, 'min'));
    const centerX = (id: string) => cupboardFootprint(lvl(next), lvl(next).cupboards[id]!).reduce((sum, q) => sum + q.x, 0) / 4;
    expect(centerX(ct.id)).toBeCloseTo(190, 9);
    expect(centerX(cb.id)).toBeCloseTo(190, 9);
  });

  it('is a no-op for the current value, refuses invalid values and rooms', () => {
    const p = interior(0, 0, 400, 300);
    const key = onlyRoomKey(lvl(p));
    noop(p, setRoomInteriorSize(levelId(p), key, 'width', 400, 'max'));
    for (const v of [0, 9.99, -5]) {
      expect(refuse(p, setRoomInteriorSize(levelId(p), key, 'width', v, 'max'))).toBe('Dimension minimale : 10 cm.');
    }
    for (const v of [NaN, Infinity]) {
      expect(refuse(p, setRoomInteriorSize(levelId(p), key, 'width', v, 'max'))).toBe('Dimension invalide');
    }
    expect(refuse(p, setRoomInteriorSize(levelId(p), 'ghost', 'width', 300, 'max'))).toBe('Pièce introuvable');
    const lshape = projectFrom([
      [0, 0, 400, 0],
      [400, 0, 400, 200],
      [400, 200, 200, 200],
      [200, 200, 200, 300],
      [200, 300, 0, 300],
      [0, 300, 0, 0],
    ]);
    expect(refuse(lshape, setRoomInteriorSize(levelId(lshape), onlyRoomKey(lvl(lshape)), 'width', 300, 'max'))).toBe(
      'Pièce non rectangulaire',
    );
  });

  it('refuses a size that would turn a neighbouring wall inside out', () => {
    const p = projectFrom(twoRooms);
    const a = roomLeftOf(lvl(p), 410);
    // B is 280 wide: moving the shared wall by 350 would push it 50 cm past B's far wall
    expect(refuse(p, setRoomInteriorSize(levelId(p), a.key, 'width', 750, 'max'))).toBe(IMPOSSIBLE);
    // exactly onto B's far wall: B's top and bottom walls would have a zero length
    expect(refuse(p, setRoomInteriorSize(levelId(p), a.key, 'width', 700, 'max'))).toBe('Mur trop court');
  });

  /** A 0..400 and B 420..720 (300 wide) inside, sharing the wall on x = 410; B's far wall on x = 730. */
  const twoRooms300: WallSegment[] = [
    [-10, -10, 410, -10],
    [410, -10, 730, -10],
    [730, -10, 730, 310],
    [730, 310, 410, 310],
    [410, 310, -10, 310],
    [-10, 310, -10, -10],
    [410, -10, 410, 310],
  ];

  it('refuses a size that would make a neighbouring room vanish (V2-R26)', () => {
    const p = projectFrom(twoRooms300);
    const a = roomLeftOf(lvl(p), 410);
    expect(roomRightOf(lvl(p), 410).area).toBeCloseTo(300 * 300, 6);
    // the shared wall would land on B's far face: B's walls stay (20 cm stubs) but B is gone
    expect(refuse(p, setRoomInteriorSize(levelId(p), a.key, 'width', 700, 'max'))).toBe(IMPOSSIBLE);
    // 10 cm left for B: allowed, B still exists
    const next = run(p, setRoomInteriorSize(levelId(p), a.key, 'width', 690, 'max'));
    const rooms = deriveLevel(lvl(next)).rooms;
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.area).sort((x, y) => x - y)).toEqual([expect.closeTo(10 * 300, 6), expect.closeTo(690 * 300, 6)]);
  });

  it('refuses when a room on the other side of the moved wall would vanish, whichever side moves (V2-R26)', () => {
    const p = projectFrom(twoRooms300);
    const b = roomRightOf(lvl(p), 410);
    // B grows to the left by 400: the shared wall lands on A's far face
    expect(refuse(p, setRoomInteriorSize(levelId(p), b.key, 'width', 700, 'min'))).toBe(IMPOSSIBLE);
    run(p, setRoomInteriorSize(levelId(p), b.key, 'width', 600, 'min'));
  });
});
