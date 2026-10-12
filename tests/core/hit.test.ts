import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { hitTest, hitTestRect } from '@/core/geometry/hit';
import { createObjectFromSize, createOpening } from '@/core/model/factory';
import type { CustomObjectDef, Id, Level } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const noCustom: Record<Id, CustomObjectDef> = {};

/** Room 0..400 x 0..300 (walls 20), a door on the bottom wall at x = 200, a wardrobe against the top wall. */
function setup(): Level {
  const level = levelFromWalls(rectRoom(0, 0, 400, 300));
  const bottom = findWall(level, 400, 300, 0, 300);
  const door = createOpening(bottom, 'door', 200, { id: 'door' });
  level.openings[door.id] = door;
  // 100 x 60, back against the inner face y = 10, spans y 10..70
  const wardrobe = createObjectFromSize({ kind: 'catalog', catalogId: 'wardrobe' }, 100, 40, { width: 100, depth: 60, height: 200 }, 'Armoire', '#999', { id: 'wardrobe' });
  level.objects[wardrobe.id] = wardrobe;
  return level;
}

const hit = (level: Level, x: number, y: number, pxPerCm = 1) =>
  hitTest(level, deriveLevel(level), { x, y }, pxPerCm, noCustom);

describe('hitTest', () => {
  it('a click inside a door hits the opening, not the wall', () => {
    expect(hit(setup(), 200, 302)).toEqual({ kind: 'opening', id: 'door' });
  });

  it('a click on an object standing against a wall hits the object', () => {
    expect(hit(setup(), 100, 15)).toEqual({ kind: 'object', id: 'wardrobe' });
  });

  it('a click in the thickness of a wall hits that wall', () => {
    const level = setup();
    expect(hit(level, 300, 5)).toEqual({ kind: 'wall', id: findWall(level, 0, 0, 400, 0) });
  });

  it('a click near a wall node hits the node before the wall', () => {
    const level = setup();
    const node = Object.values(level.nodes).find((n) => n.x === 400 && n.y === 0)!;
    expect(hit(level, 403, 2)).toEqual({ kind: 'node', id: node.id });
  });

  it('a click in the middle of an empty room hits the room', () => {
    const level = setup();
    const room = deriveLevel(level).rooms[0]!;
    expect(hit(level, 250, 180)).toEqual({ kind: 'room', id: room.key });
  });

  it('a click outside the building hits nothing', () => {
    expect(hit(setup(), 600, 150)).toBeNull();
  });

  it('a click on a manual dimension line hits the dimension', () => {
    const level = setup();
    // dimension between (100, 100) and (300, 100), drawn 20 cm towards perp(b - a) = +y
    level.dimensions['dim'] = { id: 'dim', a: { kind: 'point', x: 100, y: 100 }, b: { kind: 'point', x: 300, y: 100 }, offset: 20 };
    expect(hit(level, 200, 123)).toEqual({ kind: 'dimension', id: 'dim' });
    expect(hit(level, 200, 100)).toEqual({ kind: 'room', id: deriveLevel(level).rooms[0]!.key });
  });

  it('the topmost object (last in record order) wins', () => {
    const level = setup();
    level.objects['top'] = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 110, 40, { width: 40, depth: 40, height: 40 }, 'X', '#999', { id: 'top' });
    expect(hit(level, 110, 40)).toEqual({ kind: 'object', id: 'top' });
  });

  it('a circle custom object is hit through its round footprint', () => {
    const level = setup();
    const custom: Record<Id, CustomObjectDef> = {
      c: { id: 'c', name: 'Table', shape: 'circle', width: 100, depth: 100, height: 75, color: '#999', lshape: null, pose: 'floor' },
    };
    level.objects['table'] = createObjectFromSize({ kind: 'custom', customObjectId: 'c' }, 250, 180, { width: 100, depth: 100, height: 75 }, 'Table', '#999', { id: 'table' });
    const d = deriveLevel(level);
    expect(hitTest(level, d, { x: 250, y: 180 }, 1, custom)).toEqual({ kind: 'object', id: 'table' });
    // bounding box corner, outside the circle
    expect(hitTest(level, d, { x: 205, y: 135 }, 1, custom)?.kind).toBe('room');
  });
});

describe('hitTestRect', () => {
  it('a rectangle around a single object returns only that object', () => {
    const level = setup();
    expect(hitTestRect(level, deriveLevel(level), { x: 40, y: 5 }, { x: 160, y: 80 }, noCustom)).toEqual([{ kind: 'object', id: 'wardrobe' }]);
  });

  it('returns fully contained objects, openings, walls and dimensions only', () => {
    const level = setup();
    level.dimensions['dim'] = { id: 'dim', a: { kind: 'point', x: 100, y: 100 }, b: { kind: 'point', x: 300, y: 100 }, offset: 20 };
    const all = hitTestRect(level, deriveLevel(level), { x: 500, y: 400 }, { x: -100, y: -100 }, noCustom);
    expect(all.filter((t) => t.kind === 'object')).toEqual([{ kind: 'object', id: 'wardrobe' }]);
    expect(all.filter((t) => t.kind === 'opening')).toEqual([{ kind: 'opening', id: 'door' }]);
    expect(all.filter((t) => t.kind === 'wall')).toHaveLength(4);
    expect(all.filter((t) => t.kind === 'dimension')).toEqual([{ kind: 'dimension', id: 'dim' }]);
    expect(all).toHaveLength(7);
    // the right wall only partly inside
    const part = hitTestRect(level, deriveLevel(level), { x: 350, y: -50 }, { x: 450, y: 200 }, noCustom);
    expect(part).toEqual([]);
  });
});
