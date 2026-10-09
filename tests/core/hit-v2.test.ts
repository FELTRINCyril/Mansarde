import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { hitTest, hitTestRect } from '@/core/geometry/hit';
import { createBeam, createCupboard, createObjectFromSize, createSlope } from '@/core/model/factory';
import type { CustomObjectDef, Id, Level } from '@/core/model/types';
import { pruneSelection } from '@/editor/selection';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const noCustom: Record<Id, CustomObjectDef> = {};

/**
 * plan-chambre: interior 0..400 x 0..400 (wall axes at -10 and 410, 20 thick), ceiling 240,
 * slope from x = 197 towards +x (band x 197..400, y -10..410), a beam along x = 191 (x 185..197),
 * a cupboard against the right wall (inner face x = 400): y 40..160, x 340..400.
 */
function setup(): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  const slope = createSlope({ x: 197, y: -10 }, { x: 197, y: 410 }, 'right', 203, 240, 150);
  slope.id = 'slope';
  level.slopes[slope.id] = slope;
  const beam = createBeam({ x: 191, y: 0 }, { x: 191, y: 400 });
  beam.id = 'beam';
  level.beams[beam.id] = beam;
  // right wall (410, -10) -> (410, 410): dir +y, left = -x = room side; offset 110 -> center y = 100
  const cupboard = createCupboard(findWall(level, 410, -10, 410, 410), 110, 'left');
  cupboard.id = 'cupboard';
  level.cupboards[cupboard.id] = cupboard;
  return level;
}

function addBox(level: Level, id: string, x: number, y: number, width: number, depth: number): void {
  level.objects[id] = createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, x, y, { width, depth, height: 50 }, 'Boîte', '#999', { id });
}

const hit = (level: Level, x: number, y: number) => hitTest(level, deriveLevel(level), { x, y }, 1, noCustom);

describe('hitTest with volumes', () => {
  it('a click in the cupboard footprint hits the cupboard, even over an object', () => {
    const level = setup();
    expect(hit(level, 370, 100)).toEqual({ kind: 'cupboard', id: 'cupboard' });
    addBox(level, 'box', 370, 100, 40, 40); // overlaps the cupboard
    expect(hit(level, 370, 100)).toEqual({ kind: 'cupboard', id: 'cupboard' });
    expect(hit(level, 370, 130)).toEqual({ kind: 'cupboard', id: 'cupboard' });
  });

  it('just in front of the cupboard: the slope band, not the cupboard', () => {
    expect(hit(setup(), 335, 100)).toEqual({ kind: 'slope', id: 'slope' });
  });

  it('a click in the beam footprint hits the beam; an object over it wins', () => {
    const level = setup();
    expect(hit(level, 188, 200)).toEqual({ kind: 'beam', id: 'beam' });
    addBox(level, 'box', 190, 200, 40, 40);
    expect(hit(level, 188, 200)).toEqual({ kind: 'object', id: 'box' });
  });

  it('a click in the slope band hits the slope; outside it, the room; in a wall, the wall', () => {
    const level = setup();
    expect(hit(level, 300, 300)).toEqual({ kind: 'slope', id: 'slope' });
    expect(hit(level, 100, 300)?.kind).toBe('room');
    expect(hit(level, 300, 405)).toEqual({ kind: 'wall', id: findWall(level, 410, 410, -10, 410) });
  });

  it('an object in the slope band wins over the slope', () => {
    const level = setup();
    addBox(level, 'box', 300, 300, 40, 40);
    expect(hit(level, 300, 300)).toEqual({ kind: 'object', id: 'box' });
  });

  it('the cupboard on a missing wall (broken file) is never hit and never throws', () => {
    const level = setup();
    level.cupboards['cupboard']!.wallId = 'missing';
    expect(hit(level, 370, 100)).toEqual({ kind: 'slope', id: 'slope' });
  });
});

describe('hitTestRect with volumes', () => {
  it('selects the cupboards, beams and slopes lying wholly inside the rectangle', () => {
    const level = setup();
    const d = deriveLevel(level);
    const kinds = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      hitTestRect(level, d, a, b, noCustom).filter((t) => t.kind === 'cupboard' || t.kind === 'beam' || t.kind === 'slope');
    expect(kinds({ x: 330, y: 30 }, { x: 405, y: 170 })).toEqual([{ kind: 'cupboard', id: 'cupboard' }]);
    expect(kinds({ x: 180, y: -5 }, { x: 200, y: 405 })).toEqual([{ kind: 'beam', id: 'beam' }]);
    expect(kinds({ x: 150, y: -20 }, { x: 420, y: 420 })).toEqual([
      { kind: 'cupboard', id: 'cupboard' },
      { kind: 'beam', id: 'beam' },
      { kind: 'slope', id: 'slope' },
    ]);
    expect(kinds({ x: 330, y: 30 }, { x: 405, y: 150 })).toEqual([]); // cupboard cut
  });
});

describe('pruneSelection with volumes', () => {
  it('keeps existing slopes, beams and cupboards and drops deleted ones', () => {
    const level = setup();
    const sel = [
      { kind: 'slope' as const, id: 'slope' },
      { kind: 'beam' as const, id: 'beam' },
      { kind: 'cupboard' as const, id: 'cupboard' },
    ];
    expect(pruneSelection(sel, level, [])).toBe(sel);
    delete level.slopes['slope'];
    delete level.beams['beam'];
    delete level.cupboards['cupboard'];
    expect(pruneSelection(sel, level, [])).toEqual([]);
  });
});
