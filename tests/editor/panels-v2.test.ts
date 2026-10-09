import { describe, expect, it } from 'vitest';
import type { Check } from '@/core/checks/types';
import { addCupboard } from '@/core/commands/cupboards';
import { addObject } from '@/core/commands/objects';
import { addOpening } from '@/core/commands/openings';
import { deriveLevel } from '@/core/geometry/derived';
import { openingCutRing } from '@/core/geometry/openings';
import { bbox } from '@/core/geometry/polygon';
import { rectangularRoom } from '@/core/geometry/roomRect';
import { createCupboard, createObjectFromSize, createOpening } from '@/core/model/factory';
import type { Level } from '@/core/model/types';
import { focusCheck, targetsBounds } from '@/editor/checkTargets';
import { roomSideShared } from '@/editor/roomSizeInfo';
import { createEditorStore } from '@/editor/store';
import { centerOnBounds, worldToScreen } from '@/editor/view';
import { alertCountLabel, orderChecks } from '@/ui/checksView';
import { resultingHeightText } from '@/ui/volumeText';
import { findWall, levelFromWalls, rectRoom, type WallSegment } from '../core/fixtures';
import { lvl, projectFrom, run } from '../core/helpers';

const box = (x: number, y: number, width = 100, depth = 50) =>
  createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, x, y, { width, depth, height: 50 }, 'Caisse', '#ccc');

const check = (severity: Check['severity'], message: string, targets: Check['targets'] = []): Check => ({
  id: message,
  severity,
  kind: 'collision',
  message,
  targets,
});

describe('centerOnBounds', () => {
  const viewport = { width: 800, height: 600 };
  const view = { pxPerCm: 1, tx: 0, ty: 0 };

  it('keeps the zoom and puts the center of a box that fits in the middle of the viewport', () => {
    const v = centerOnBounds(view, { minX: 950, minY: 475, maxX: 1050, maxY: 525 }, viewport);
    expect(v.pxPerCm).toBe(1);
    const c = worldToScreen(v, { x: 1000, y: 500 });
    expect(c.x).toBeCloseTo(400, 9);
    expect(c.y).toBeCloseTo(300, 9);
  });

  it('never zooms in on a small box (the zoom is the current one)', () => {
    const v = centerOnBounds({ pxPerCm: 0.5, tx: 10, ty: 10 }, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, viewport);
    expect(v.pxPerCm).toBe(0.5);
    const c = worldToScreen(v, { x: 5, y: 5 });
    expect(c.x).toBeCloseTo(400, 9);
    expect(c.y).toBeCloseTo(300, 9);
  });

  it('zooms out to fit a box larger than the viewport (fitView)', () => {
    const v = centerOnBounds(view, { minX: 0, minY: 0, maxX: 2000, maxY: 100 }, viewport);
    expect(v.pxPerCm).toBeCloseTo((800 - 80) / 2000, 9);
    const c = worldToScreen(v, { x: 1000, y: 50 });
    expect(c.x).toBeCloseTo(400, 9);
    expect(c.y).toBeCloseTo(300, 9);
  });
});

describe('check targets', () => {
  /** A 400 x 300 room (axes), a box at (1000, 500), a door on the bottom wall, a cupboard on the left wall. */
  function scene() {
    let p = projectFrom(rectRoom(0, 0, 400, 300));
    const level = lvl(p);
    const o = box(1000, 500);
    p = run(p, addObject(level.id, o));
    const bottom = findWall(lvl(p), 400, 300, 0, 300);
    const door = createOpening(bottom, 'door', 200);
    p = run(p, addOpening(level.id, door));
    const left = findWall(lvl(p), 0, 300, 0, 0);
    const cupboard = createCupboard(left, 150, 'right');
    p = run(p, addCupboard(level.id, cupboard));
    return { p, level: lvl(p), objectId: o.id, doorId: door.id, cupboardId: cupboard.id };
  }

  it('targetsBounds is the box of the footprints of objects, cupboards and openings', () => {
    const { p, level, objectId, doorId, cupboardId } = scene();
    expect(targetsBounds(level, [{ kind: 'object', id: objectId }], p.customObjects)).toEqual({ minX: 950, minY: 475, maxX: 1050, maxY: 525 });
    const b = targetsBounds(level, [{ kind: 'object', id: objectId }, { kind: 'opening', id: doorId }], p.customObjects)!;
    expect(b.maxX).toBeCloseTo(1050, 9);
    expect(b.maxY).toBeCloseTo(525, 9);
    // the door contributes its cut ring (across the wall y = 300, around x = 200)
    const cut = bbox(openingCutRing(level, level.openings[doorId]!))!;
    expect(cut.minY).toBeLessThan(300);
    expect(b.minY).toBeCloseTo(cut.minY, 9);
    expect(b.minX).toBeCloseTo(cut.minX, 9);
    const c = targetsBounds(level, [{ kind: 'cupboard', id: cupboardId }], p.customObjects)!;
    // the cupboard stands against a face of the wall x = 0, 60 cm deep, 120 cm wide around y = 150
    expect(c.maxY - c.minY).toBeCloseTo(120, 9);
    expect(c.maxX - c.minX).toBeCloseTo(60, 9);
  });

  it('targetsBounds ignores elements that are gone and is null when nothing is left', () => {
    const { p, level, objectId } = scene();
    expect(targetsBounds(level, [{ kind: 'object', id: 'gone' }], p.customObjects)).toBeNull();
    expect(targetsBounds(level, [{ kind: 'object', id: objectId }, { kind: 'cupboard', id: 'gone' }], p.customObjects)).toEqual({
      minX: 950,
      minY: 475,
      maxX: 1050,
      maxY: 525,
    });
  });

  it('focusCheck selects the targets with the select tool and centers the view on them', () => {
    const { p, objectId } = scene();
    const store = createEditorStore();
    store.getState().openProject(p);
    store.getState().setTool('wall');
    store.getState().setView({ pxPerCm: 2, tx: 0, ty: 0 });
    focusCheck(store, check('error', 'x', [{ kind: 'object', id: objectId }]), { width: 800, height: 600 });
    const s = store.getState();
    expect(s.tool).toBe('select');
    expect(s.selection).toEqual([{ kind: 'object', id: objectId }]);
    expect(s.view.pxPerCm).toBe(2);
    const c = worldToScreen(s.view, { x: 1000, y: 500 });
    expect(c.x).toBeCloseTo(400, 9);
    expect(c.y).toBeCloseTo(300, 9);
  });

  it('focusCheck keeps the view when the viewport has no size (3D only)', () => {
    const { p, objectId } = scene();
    const store = createEditorStore();
    store.getState().openProject(p);
    const before = store.getState().view;
    focusCheck(store, check('error', 'x', [{ kind: 'object', id: objectId }]), { width: 0, height: 0 });
    expect(store.getState().view).toBe(before);
    expect(store.getState().selection).toEqual([{ kind: 'object', id: objectId }]);
  });
});

describe('checks panel texts', () => {
  it('alertCountLabel: singular and plural', () => {
    expect(alertCountLabel(1)).toBe('1 alerte');
    expect(alertCountLabel(3)).toBe('3 alertes');
  });

  it('orderChecks puts the errors first, keeping the rule order otherwise', () => {
    const list = [check('warning', 'w1'), check('error', 'e1'), check('warning', 'w2'), check('error', 'e2')];
    expect(orderChecks(list).map((c) => c.message)).toEqual(['e1', 'e2', 'w1', 'w2']);
    expect(list.map((c) => c.message)).toEqual(['w1', 'e1', 'w2', 'e2']); // input untouched
  });
});

describe('resultingHeightText', () => {
  it('a constant top gives one height', () => {
    expect(resultingHeightText([{ s: 0, top: 220 }, { s: 120, top: 220 }])).toBe('2,20 m');
  });

  it('a top under a slope gives "de min à max"', () => {
    expect(
      resultingHeightText([
        { s: 0, top: 148 },
        { s: 40, top: 200 },
        { s: 80, top: 238 },
        { s: 120, top: 238 },
      ]),
    ).toBe('de 1,48 m à 2,38 m');
  });

  it('heights equal once rounded to the centimeter give one height', () => {
    expect(resultingHeightText([{ s: 0, top: 220.001 }, { s: 120, top: 219.999 }])).toBe('2,20 m');
  });

  it('an empty profile gives a dash', () => {
    expect(resultingHeightText([])).toBe('-');
  });
});

describe('roomSideShared', () => {
  /** A: interior 0..400 x 0..300; B: interior 420..700 x 0..300; they share the wall x = 410. */
  const twoRooms: WallSegment[] = [
    [-10, -10, 410, -10],
    [410, -10, 710, -10],
    [710, -10, 710, 310],
    [710, 310, 410, 310],
    [410, 310, -10, 310],
    [-10, 310, -10, -10],
    [410, -10, 410, 310],
  ];
  const level: Level = levelFromWalls(twoRooms);
  const d = deriveLevel(level);
  const roomA = d.rooms.find((r) => r.labelPoint.x < 410)!;
  const roomB = d.rooms.find((r) => r.labelPoint.x > 410)!;
  const rectA = rectangularRoom(level, d, roomA.key)!;
  const rectB = rectangularRoom(level, d, roomB.key)!;

  it('the right side of A is the wall shared with B', () => {
    expect(roomSideShared(level, d, rectA, 'width', 'max')).toBe(true);
    expect(roomSideShared(level, d, rectA, 'width', 'min')).toBe(false);
    expect(roomSideShared(level, d, rectA, 'depth', 'max')).toBe(false);
    expect(roomSideShared(level, d, rectA, 'depth', 'min')).toBe(false);
  });

  it('the left side of B is the shared wall', () => {
    expect(roomSideShared(level, d, rectB, 'width', 'min')).toBe(true);
    expect(roomSideShared(level, d, rectB, 'width', 'max')).toBe(false);
  });

  it('a lone room shares nothing', () => {
    const solo = lvl(projectFrom(rectRoom(0, 0, 400, 300)));
    const ds = deriveLevel(solo);
    const rect = rectangularRoom(solo, ds, ds.rooms[0]!.key)!;
    for (const axis of ['width', 'depth'] as const) {
      for (const side of ['min', 'max'] as const) expect(roomSideShared(solo, ds, rect, axis, side)).toBe(false);
    }
  });
});
