import { describe, expect, it } from 'vitest';
import { computeChecks } from '@/core/checks/computeChecks';
import { deriveLevel } from '@/core/geometry/derived';
import { snapToWallForPose, supportElevation } from '@/core/geometry/pose';
import { createCupboard, createObjectFromSize } from '@/core/model/factory';
import type { Cupboard, CustomObjectDef, Level, PlacedObject } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const catalog = (catalogId: string) => ({ kind: 'catalog' as const, catalogId });

function put(level: Level, o: PlacedObject): PlacedObject {
  level.objects[o.id] = o;
  return o;
}

/** Room with wall axes 0..400 x 0..300, 20 cm thick: faces at x = 10, 390 and y = 10, 290. */
const room = (): Level => levelFromWalls(rectRoom(0, 0, 400, 300));

describe('supportElevation', () => {
  it('TV above a TV unit 50 high -> 50; elsewhere -> 0; rugs are ignored', () => {
    const level = room();
    const unit = put(level, createObjectFromSize(catalog('tv-unit'), 200, 40, { width: 160, depth: 45, height: 50 }, 'Meuble TV', '#888'));
    const tv = put(level, createObjectFromSize(catalog('tv'), 200, 40, { width: 100, depth: 20, height: 60 }, 'TV', '#222', { pose: 'onTop' }));
    put(level, createObjectFromSize(catalog('rug-rect'), 200, 150, { width: 170, depth: 120, height: 1 }, 'Tapis', '#ccc', { pose: 'covering' }));
    expect(supportElevation(level, tv.id, { x: 200, y: 40 }, {})).toBe(50);
    expect(supportElevation(level, tv.id, { x: 200, y: 150 }, {})).toBe(0);
    // the object itself is never its own support
    expect(supportElevation(level, unit.id, { x: 200, y: 40 }, {})).toBe(0);
    expect(supportElevation(level, null, { x: 200, y: 40 }, {})).toBe(50);
  });

  it('takes the highest floor or tuckable top; onTop and wall objects do not support', () => {
    const level = room();
    put(level, createObjectFromSize(catalog('tv-unit'), 200, 100, { width: 100, depth: 100, height: 50 }, 'Meuble TV', '#888'));
    put(level, createObjectFromSize(catalog('generic-rect'), 200, 100, { width: 50, depth: 50, height: 40 }, 'Bloc', '#888', { elevation: 30 }));
    expect(supportElevation(level, null, { x: 200, y: 100 }, {})).toBe(70);
    put(level, createObjectFromSize(catalog('chair'), 200, 100, { width: 45, depth: 50, height: 90 }, 'Chaise', '#888', { pose: 'tuckable' }));
    expect(supportElevation(level, null, { x: 200, y: 100 }, {})).toBe(90);
    put(level, createObjectFromSize(catalog('tv'), 200, 100, { width: 20, depth: 20, height: 200 }, 'TV', '#888', { pose: 'onTop', elevation: 90 }));
    put(level, createObjectFromSize(catalog('tv-wall'), 200, 100, { width: 20, depth: 20, height: 65 }, 'TV murale', '#888', { pose: 'wall', elevation: 110 }));
    expect(supportElevation(level, null, { x: 200, y: 100 }, {})).toBe(90);
  });

  it('uses the real outline of the object (a custom circle does not fill its corners)', () => {
    const level = room();
    const def: CustomObjectDef = { id: 'round', name: 'Pouf', shape: 'circle', width: 100, depth: 100, height: 45, color: '#888', lshape: null, pose: 'floor' };
    put(level, createObjectFromSize({ kind: 'custom', customObjectId: 'round' }, 200, 150, def, 'Pouf', '#888'));
    expect(supportElevation(level, null, { x: 200, y: 150 }, { round: def })).toBe(45);
    expect(supportElevation(level, null, { x: 245, y: 195 }, { round: def })).toBe(0);
  });
});

describe('one definition of a support for the pose and the checks (ruling V2-R37)', () => {
  /** A 40 x 40 carrier of each kind centered on (200, 150), its top at 90. */
  const carriers: Array<[string, boolean, (level: Level) => void]> = [
    ['floor object', true, (l) => void put(l, createObjectFromSize(catalog('generic-rect'), 200, 150, { width: 40, depth: 40, height: 90 }, 'Bloc', '#888'))],
    ['tuckable object', true, (l) => void put(l, createObjectFromSize(catalog('chair'), 200, 150, { width: 40, depth: 40, height: 90 }, 'Chaise', '#888', { pose: 'tuckable' }))],
    ['wall shelf', true, (l) => void put(l, createObjectFromSize(catalog('shelf-wall'), 200, 150, { width: 40, depth: 40, height: 3 }, 'Étagère', '#888', { pose: 'wall', elevation: 87 }))],
    ['wall TV', false, (l) => void put(l, createObjectFromSize(catalog('tv-wall'), 200, 150, { width: 40, depth: 40, height: 65 }, 'TV murale', '#888', { pose: 'wall', elevation: 25 }))],
    ['object on top of another', false, (l) => void put(l, createObjectFromSize(catalog('generic-rect'), 200, 150, { width: 40, depth: 40, height: 10 }, 'Livre', '#888', { pose: 'onTop', elevation: 80 }))],
    ['rug', false, (l) => void put(l, createObjectFromSize(catalog('rug-rect'), 200, 150, { width: 40, depth: 40, height: 90 }, 'Tapis', '#888', { pose: 'covering' }))],
    // top wall (0,0)->(400,0), face at y = 10: x 180..220, y 10..50 (the center 200, 30)
    ['fixed cupboard', true, (l) => addCup(l, { heightMode: 'fixed', height: 90 })],
    ['ceiling cupboard', false, (l) => addCup(l, { heightMode: 'ceiling', plinth: 10, gap: 160 })],
  ];
  function addCup(level: Level, over: Partial<Cupboard>): void {
    const c = createCupboard(findWall(level, 0, 0, 400, 0), 200, 'left', { width: 40, depth: 40, doorType: 'sliding', ...over });
    level.cupboards[c.id] = c;
  }
  const centerOf = (level: Level) => (Object.keys(level.cupboards).length > 0 ? { x: 200, y: 30 } : { x: 200, y: 150 });

  for (const [what, carries, build] of carriers) {
    it(`${what}: ${carries ? 'lifts a dropped lamp to 90, no alert' : 'does not carry; a lamp put at its top floats'}`, () => {
      const level = room();
      build(level);
      const at = centerOf(level);
      const elevation = supportElevation(level, null, at, {});
      expect(elevation).toBe(carries ? 90 : 0);
      const lamp = put(level, createObjectFromSize(catalog('bedside-lamp'), at.x, at.y, { width: 25, depth: 25, height: 45 }, 'Lampe', '#888', { pose: 'onTop', elevation: 90 }));
      const copy = structuredClone(level);
      const found = computeChecks(copy, deriveLevel(copy), {}).filter((c) => c.targets.some((t) => t.id === lamp.id));
      expect(found.map((c) => c.kind)).toEqual(carries ? [] : ['floating']);
    });
  }
});

describe('snapToWallForPose', () => {
  const tvWall = (x: number, y: number, rotation = 0): PlacedObject =>
    createObjectFromSize(catalog('tv-wall'), x, y, { width: 110, depth: 8, height: 65 }, 'TV murale', '#222', { pose: 'wall', elevation: 110, rotation });

  it('wall TV near a wall: back against the face, rotation of the wall', () => {
    const level = room();
    const top = snapToWallForPose(tvWall(200, 25, 30), level);
    expect(top).not.toBeNull();
    expect(top!.x).toBeCloseTo(200, 9);
    expect(top!.y).toBeCloseTo(14, 9);
    expect(top!.rotation).toBe(0);

    const right = snapToWallForPose(tvWall(370, 150), level);
    expect(right!.x).toBeCloseTo(386, 9);
    expect(right!.y).toBeCloseTo(150, 9);
    expect(right!.rotation).toBeCloseTo(90, 9);

    const bottom = snapToWallForPose(tvWall(200, 270), level);
    expect(bottom!.y).toBeCloseTo(286, 9);
    expect(bottom!.rotation).toBeCloseTo(180, 9);
  });

  it('null when no wall face is within 2 * depth', () => {
    const level = room();
    expect(snapToWallForPose(tvWall(200, 150), level)).toBeNull();
    // back edge 17 cm from the face (> 2 * 8)
    expect(snapToWallForPose(tvWall(200, 31), level)).toBeNull();
    // back edge 16 cm from the face (= 2 * 8)
    expect(snapToWallForPose(tvWall(200, 30), level)).not.toBeNull();
  });
});
