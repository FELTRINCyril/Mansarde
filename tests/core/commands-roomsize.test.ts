import { describe, expect, it } from 'vitest';
import { setRoomInteriorSize } from '@/core/commands/roomSize';
import { addCupboard } from '@/core/commands/cupboards';
import { addRectRoomInterior } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { rectangularRoom } from '@/core/geometry/roomRect';
import { computeRooms } from '@/core/geometry/rooms';
import { createCupboard } from '@/core/model/factory';
import type { Level, Project } from '@/core/model/types';
import { findWall, levelFromWalls, type WallSegment } from './fixtures';
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

  it('rejects a room whose side is made of two collinear walls', () => {
    // top side split in two walls at x = 200 (a stub wall goes up from there)
    const level = levelFromWalls([
      [0, 0, 200, 0],
      [200, 0, 400, 0],
      [200, 0, 200, -100],
      [400, 0, 400, 300],
      [400, 300, 0, 300],
      [0, 300, 0, 0],
    ]);
    expect(rectangularRoom(level, deriveLevel(level), onlyRoomKey(level))).toBeNull();
  });
});

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
    expect(lvl(next).cupboards[c.id]!.offset).toBeCloseTo(260, 9); // top axis now 320 long
  });

  it('is a no-op for the current value, refuses invalid values and rooms', () => {
    const p = interior(0, 0, 400, 300);
    const key = onlyRoomKey(lvl(p));
    noop(p, setRoomInteriorSize(levelId(p), key, 'width', 400, 'max'));
    for (const v of [0, 9.99, -5, NaN, Infinity]) {
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
    expect(refuse(p, setRoomInteriorSize(levelId(p), a.key, 'width', 750, 'max'))).toBe('Un mur voisin deviendrait trop court');
    // exactly onto B's far wall: B's top and bottom walls would have a zero length
    expect(refuse(p, setRoomInteriorSize(levelId(p), a.key, 'width', 700, 'max'))).toBe('Mur trop court');
  });
});
