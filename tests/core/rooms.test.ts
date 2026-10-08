import { describe, expect, it } from 'vitest';
import { computeRooms } from '@/core/geometry/rooms';
import { computeWallShape } from '@/core/geometry/walls';
import { pointInRing } from '@/core/geometry/polygon';
import { levelFromWalls, rectRoom } from './fixtures';

describe('computeRooms', () => {
  it('detects a single rectangular room with net area', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    const rooms = computeRooms(lvl);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(380 * 280, 3);
    expect(rooms[0]!.name).toBe('Pièce');
  });
  it('L-shaped room: exact area and label point inside', () => {
    // outer L built with 6 walls on axes, thickness 20
    const lvl = levelFromWalls([[0, 0, 400, 0], [400, 0, 400, 200], [400, 200, 200, 200], [200, 200, 200, 400], [200, 400, 0, 400], [0, 400, 0, 0]]);
    const [room] = computeRooms(lvl);
    // interior: 380x180 + 180x200 (axis L inset by 10 each side)
    expect(room!.area).toBeCloseTo(380 * 180 + 180 * 200, 1);
    expect(pointInRing(room!.labelPoint, room!.ring)).toBe(true);
  });
  it('two rooms sharing a partition', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    expect(computeRooms(lvl)).toHaveLength(2);
  });
  it('a door in the partition does not merge rooms', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    const partition = Object.values(lvl.walls).find((w) => w.thickness === 10)!;
    lvl.openings['d'] = { id: 'd', wallId: partition.id, kind: 'door', variant: 'single', offset: 150, width: 83, height: 204, sillHeight: 0, hinge: 'start', swing: 'left' };
    expect(computeRooms(lvl)).toHaveLength(2);
  });
  it('labels: oldest label wins when two anchors fall in the same room', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    lvl.roomLabels = [{ id: 'a', name: 'Salon', anchor: { x: 100, y: 100 } }, { id: 'b', name: 'Chambre', anchor: { x: 300, y: 100 } }];
    const [room] = computeRooms(lvl);
    expect(room!.name).toBe('Salon');
    expect(room!.key).toBe('a');
  });
  it('labels survive removing and re-adding a partition', () => {
    const base = levelFromWalls(rectRoom(0, 0, 400, 300));
    base.roomLabels = [{ id: 'a', name: 'Salon', anchor: { x: 100, y: 100 } }, { id: 'b', name: 'Chambre', anchor: { x: 300, y: 100 } }];
    const split = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    split.roomLabels = base.roomLabels;
    const rooms = computeRooms(split);
    expect(rooms.map((r) => r.name).sort()).toEqual(['Chambre', 'Salon']);
    for (const room of rooms) expect(pointInRing(room.label!.anchor, room.ring)).toBe(true);
  });
  it('crossing walls without shared node split rooms', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 400), [200, -10, 200, 410, 10], [-10, 200, 410, 200, 10]]);
    expect(computeRooms(lvl)).toHaveLength(4);
  });
  it('open walls produce no room', () => {
    expect(computeRooms(levelFromWalls([[0, 0, 400, 0], [400, 0, 400, 300]]))).toHaveLength(0);
  });
  it('unlabelled rooms get a positional key; labels outside any room are ignored', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    lvl.roomLabels = [{ id: 'x', name: 'Dehors', anchor: { x: 900, y: 900 } }];
    const [room] = computeRooms(lvl);
    expect(room!.key).toBe('room-0');
    expect(room!.label).toBeNull();
    expect(room!.name).toBe('Pièce');
  });
  it('accepts a precomputed wall shape', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    const shape = computeWallShape(lvl, { withOpenings: false });
    const rooms = computeRooms(lvl, shape);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.ring).toBe(shape[0]!.holes[0]);
    expect(computeRooms(lvl, [])).toHaveLength(0);
  });

  describe('free-standing closed box inside a room', () => {
    // outer room 600x500 (t=20): hole 580x480. Box axes 150x150 (t=10): outer footprint 160x160,
    // inner room 140x140. Outer room net area = 580*480 - 160*160 = 278400 - 25600 = 252800.
    const build = () => levelFromWalls([...rectRoom(0, 0, 600, 500), ...rectRoom(200, 150, 350, 300, 10)]);
    const sejour = { id: 's', name: 'Séjour', anchor: { x: 100, y: 100 } };
    const wc = { id: 'w', name: 'WC', anchor: { x: 275, y: 225 } };

    it('yields two rooms with net areas and the island recorded', () => {
      const rooms = computeRooms(build());
      expect(rooms).toHaveLength(2);
      const outer = rooms.find((r) => r.area > 100000)!;
      const inner = rooms.find((r) => r.area < 100000)!;
      expect(outer.area).toBeCloseTo(580 * 480 - 160 * 160, 3);
      expect(outer.islands).toHaveLength(1);
      expect(inner.area).toBeCloseTo(140 * 140, 3);
      expect(inner.islands).toHaveLength(0);
    });

    it.each([
      ['Séjour first', [sejour, wc]],
      ['WC first', [wc, sejour]],
    ])('each room gets its own label (%s)', (_name, labels) => {
      const lvl = build();
      lvl.roomLabels = labels;
      const rooms = computeRooms(lvl);
      expect(rooms.map((r) => r.name).sort()).toEqual(['Séjour', 'WC']);
      for (const room of rooms) {
        expect(pointInRing(room.label!.anchor, room.ring)).toBe(true);
        expect(room.islands.some((i) => pointInRing(room.label!.anchor, i))).toBe(false);
      }
    });

    it('outer label point is not on the island', () => {
      const outer = computeRooms(build()).find((r) => r.area > 100000)!;
      expect(pointInRing(outer.labelPoint, outer.ring)).toBe(true);
      expect(outer.islands.some((i) => pointInRing(outer.labelPoint, i))).toBe(false);
    });
  });
});
