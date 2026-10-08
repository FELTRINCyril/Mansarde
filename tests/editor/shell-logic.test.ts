import { describe, expect, it } from 'vitest';
import { applyCommand } from '@/core/commands/apply';
import { addDimension } from '@/core/commands/dimensions';
import { addOpening } from '@/core/commands/openings';
import { addObject } from '@/core/commands/objects';
import { addCustomObject } from '@/core/commands/project';
import { addLevel } from '@/core/commands/levels';
import { createObjectFromSize, createOpening } from '@/core/model/factory';
import type { Project } from '@/core/model/types';
import { deleteSelectionRecipe } from '@/editor/deleteSelection';
import { nextLevelName } from '@/editor/levelNames';
import { objectFromRef, placeObjectAt, placeObjectRecipe } from '@/editor/placeObject';
import { createEditorStore } from '@/editor/store';
import { formatModified } from '@/ui/dateFormat';
import { levelsWithMissingImages, missingImageMessage } from '@/ui/imageCheck';
import { commitNumericAs, formatNumber } from '@/ui/numeric';
import { thumbnailViewBox } from '@/ui/thumbnail';
import { updateObjectsRecipe } from '@/ui/multiEdit';
import { emptyProject, levelId, lvl, projectFrom, run } from '../core/helpers';
import { findWall, rectRoom } from '../core/fixtures';

const ok = (p: Project, recipe: Parameters<typeof applyCommand>[1]): Project => {
  const r = applyCommand(p, recipe);
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

describe('objectFromRef', () => {
  it('builds a catalog object with the entry defaults, centered on the point', () => {
    const o = objectFromRef(emptyProject(), 'catalog:bed-90', { x: 100, y: 50 });
    expect(o).toMatchObject({
      source: { kind: 'catalog', catalogId: 'bed-90' },
      x: 100, y: 50, rotation: 0, width: 90, depth: 190, name: 'Lit 90', lshape: null,
    });
  });
  it('gives the L generic its default notch', () => {
    const o = objectFromRef(emptyProject(), 'catalog:generic-lshape', { x: 0, y: 0 });
    expect(o?.lshape).toEqual({ notchWidth: 120, notchDepth: 90 });
  });
  it('builds a custom object from the project definition', () => {
    const p = ok(emptyProject(), addCustomObject({
      id: 'c1', name: 'Établi', shape: 'rect', width: 150, depth: 70, height: 90, color: '#aabbcc', lshape: null,
    }));
    const o = objectFromRef(p, 'custom:c1', { x: 5, y: 6 });
    expect(o).toMatchObject({
      source: { kind: 'custom', customObjectId: 'c1' }, width: 150, depth: 70, height: 90, name: 'Établi', color: '#aabbcc',
    });
  });
  it.each(['catalog:nope', 'custom:nope', 'bed-90', '', 'other:bed-90'])('returns null for %j', (ref) => {
    expect(objectFromRef(emptyProject(), ref, { x: 0, y: 0 })).toBeNull();
  });
});

describe('placeObjectRecipe', () => {
  it('adds the object snapped against the closest wall face', () => {
    // room 0..400 x 0..300, walls 20 thick: inner face of the top wall at y = 10
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const o = objectFromRef(p, 'catalog:wardrobe', { x: 200, y: 45 })!; // depth 60, back edge at y = 15
    const next = run(p, placeObjectRecipe(levelId(p), o, lvl(p), 1));
    const placed = lvl(next).objects[o.id]!;
    expect(placed.y).toBeCloseTo(40); // face 10 + depth / 2
    expect(placed.x).toBeCloseTo(200);
    expect(placed.rotation).toBeCloseTo(0);
  });
  it('keeps the drop point far from any wall', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const o = objectFromRef(p, 'catalog:chair', { x: 200, y: 150 })!;
    const placed = lvl(run(p, placeObjectRecipe(levelId(p), o, lvl(p), 1))).objects[o.id]!;
    expect(placed).toMatchObject({ x: 200, y: 150, rotation: 0 });
  });
});

describe('deleteSelectionRecipe', () => {
  it('deletes walls, openings, objects and dimensions in one command and ignores rooms and nodes', () => {
    let p = projectFrom(rectRoom(0, 0, 400, 300));
    const L = levelId(p);
    const top = findWall(lvl(p), 0, 0, 400, 0);
    const right = findWall(lvl(p), 400, 0, 400, 300);
    const door = createOpening(top, 'door', 200);
    const bed = createObjectFromSize({ kind: 'catalog', catalogId: 'bed-90' }, 100, 150, { width: 90, depth: 190, height: 50 }, 'Lit', '#fff');
    p = ok(p, addOpening(L, door));
    p = ok(p, addObject(L, bed));
    const dimOut = { id: '' };
    p = ok(p, addDimension(L, { kind: 'objectCorner', objectId: bed.id, corner: 0 }, { kind: 'point', x: 300, y: 250 }, 10, dimOut));
    const node = Object.keys(lvl(p).nodes)[0]!;
    const next = run(p, deleteSelectionRecipe(L, [
      { kind: 'wall', id: top },
      { kind: 'opening', id: door.id },
      { kind: 'object', id: bed.id },
      { kind: 'dimension', id: dimOut.id },
      { kind: 'room', id: 'room-0' },
      { kind: 'node', id: node },
    ]));
    const level = lvl(next);
    expect(level.walls[top]).toBeUndefined();
    expect(level.walls[right]).toBeDefined();
    expect(level.openings).toEqual({});
    expect(level.objects).toEqual({});
    expect(level.dimensions).toEqual({});
  });
  it('deletes an opening of a deleted wall only once and is a no-op for an empty selection', () => {
    let p = projectFrom(rectRoom(0, 0, 400, 300));
    const L = levelId(p);
    const top = findWall(lvl(p), 0, 0, 400, 0);
    const door = createOpening(top, 'door', 200);
    p = ok(p, addOpening(L, door));
    const next = run(p, deleteSelectionRecipe(L, [{ kind: 'opening', id: door.id }, { kind: 'wall', id: top }]));
    expect(lvl(next).walls[top]).toBeUndefined();
    const r = applyCommand(p, deleteSelectionRecipe(L, [{ kind: 'room', id: 'x' }]));
    expect(r.ok && r.patches.length).toBe(0);
  });
});

describe('nextLevelName', () => {
  it('names levels above "Étage n" and below "Sous-sol", skipping used names', () => {
    let p = emptyProject();
    expect(nextLevelName(p, 'above')).toBe('Étage 1');
    expect(nextLevelName(p, 'below')).toBe('Sous-sol');
    p = ok(p, addLevel(levelId(p), 'above', 'Étage 1'));
    p = ok(p, addLevel(levelId(p), 'below', 'Sous-sol'));
    expect(nextLevelName(p, 'above')).toBe('Étage 2');
    expect(nextLevelName(p, 'below')).toBe('Sous-sol 2');
  });
});

describe('formatModified', () => {
  it('formats the local date and time as "modifié le dd/mm/yyyy hh:mm"', () => {
    expect(formatModified(new Date(2026, 9, 7, 14, 30, 59).toISOString())).toBe('modifié le 07/10/2026 14:30');
    expect(formatModified(new Date(2026, 0, 2, 3, 4).toISOString())).toBe('modifié le 02/01/2026 03:04');
  });
  it('survives an unreadable date', () => {
    expect(formatModified('n/a')).toBe('modifié le ?');
  });
});

describe('commitNumericAs (parseCmInput based)', () => {
  it('positive behaves like commitNumeric', () => {
    expect(commitNumericAs('350', 'positive')).toEqual({ ok: true, value: 350 });
    expect(commitNumericAs('0', 'positive')).toEqual({ ok: false });
  });
  it('nonNegative accepts zero and refuses negatives', () => {
    expect(commitNumericAs('0', 'nonNegative')).toEqual({ ok: true, value: 0 });
    expect(commitNumericAs('0,0 cm', 'nonNegative')).toEqual({ ok: true, value: 0 });
    expect(commitNumericAs('90', 'nonNegative')).toEqual({ ok: true, value: 90 });
    expect(commitNumericAs('-5', 'nonNegative')).toEqual({ ok: false });
    expect(commitNumericAs('', 'nonNegative')).toEqual({ ok: false });
  });
  it('signed accepts zero and negatives within the R5 bound', () => {
    expect(commitNumericAs('-270', 'signed')).toEqual({ ok: true, value: -270 });
    expect(commitNumericAs('-0', 'signed')).toEqual({ ok: true, value: 0 });
    expect(Object.is((commitNumericAs('-0', 'signed') as { value: number }).value, 0)).toBe(true);
    expect(commitNumericAs('-2,5 m', 'signed')).toEqual({ ok: true, value: -250 });
    expect(commitNumericAs('-100001', 'signed')).toEqual({ ok: false });
    expect(commitNumericAs('--5', 'signed')).toEqual({ ok: false });
    expect(commitNumericAs('abc', 'signed')).toEqual({ ok: false });
  });
  it('angle accepts plain signed degrees', () => {
    expect(commitNumericAs('90', 'angle')).toEqual({ ok: true, value: 90 });
    expect(commitNumericAs('-45,5', 'angle')).toEqual({ ok: true, value: -45.5 });
    expect(commitNumericAs('0', 'angle')).toEqual({ ok: true, value: 0 });
    expect(commitNumericAs('30°', 'angle')).toEqual({ ok: true, value: 30 });
    expect(commitNumericAs('1 m', 'angle')).toEqual({ ok: false });
    expect(commitNumericAs('', 'angle')).toEqual({ ok: false });
    expect(commitNumericAs('1e400', 'angle')).toEqual({ ok: false });
  });
});

describe('placeObjectAt', () => {
  it('adds the object to the active level and selects it', () => {
    const store = createEditorStore();
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    store.getState().openProject(p);
    expect(placeObjectAt(store, 'catalog:chair', { x: 200, y: 150 })).toBe(true);
    const s = store.getState();
    const ids = Object.keys(lvl(s.project!).objects);
    expect(ids).toHaveLength(1);
    expect(s.selection).toEqual([{ kind: 'object', id: ids[0] }]);
    expect(s.history.past).toHaveLength(1);
    expect(placeObjectAt(store, 'catalog:nope', { x: 0, y: 0 })).toBe(false);
  });
});

describe('objectFromRef L shapes (R22)', () => {
  it('copies the L notch of a custom definition into the placed object', () => {
    const p = ok(emptyProject(), addCustomObject({
      id: 'c2', name: 'Bureau en L', shape: 'lshape', width: 180, depth: 160, height: 75, color: '#ccbbaa',
      lshape: { notchWidth: 100, notchDepth: 90 },
    }));
    const o = objectFromRef(p, 'custom:c2', { x: 0, y: 0 })!;
    expect(o.lshape).toEqual({ notchWidth: 100, notchDepth: 90 });
    expect(o.lshape).not.toBe(p.customObjects.c2!.lshape);
  });
});

describe('formatNumber', () => {
  it('shows at most one decimal with a comma and never -0', () => {
    expect([350, 82.46, 0, -0.01, -270].map(formatNumber)).toEqual(['350', '82,5', '0', '0', '-270']);
  });
});

describe('levelsWithMissingImages', () => {
  it('lists the levels whose background image is not available', () => {
    let p = emptyProject();
    p = ok(p, addLevel(levelId(p), 'above', 'Étage 1'));
    const bg = (imageId: string) => ({
      imageId, widthPx: 10, heightPx: 10, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, locked: false, visible: true,
    });
    p = { ...p, levels: [{ ...p.levels[0]!, background: bg('a') }, { ...p.levels[1]!, background: bg('b') }] };
    expect(levelsWithMissingImages(p, new Set(['a']))).toEqual(['Étage 1']);
    expect(levelsWithMissingImages(p, new Set(['a', 'b']))).toEqual([]);
    expect(missingImageMessage('RDC')).toBe('Image de fond introuvable pour le niveau RDC.');
  });
});

describe('thumbnailViewBox', () => {
  it('grows the short axis to the thumbnail aspect, centered', () => {
    // 600 x 100 at 3:2 -> height grows to 400
    expect(thumbnailViewBox({ minX: 0, minY: 0, maxX: 600, maxY: 100 }, 120, 80)).toEqual({ x: 0, y: -150, width: 600, height: 400 });
    // 300 x 400 at 3:2 -> width grows to 600
    expect(thumbnailViewBox({ minX: -150, minY: 0, maxX: 150, maxY: 400 }, 120, 80)).toEqual({ x: -300, y: 0, width: 600, height: 400 });
  });
});

describe('updateObjectsRecipe', () => {
  const two = () => {
    let p = emptyProject();
    const a = createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 0, 0, { width: 45, depth: 50, height: 90 }, 'A', '#111111');
    const b = createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 100, 0, { width: 45, depth: 50, height: 80 }, 'B', '#222222');
    p = ok(p, addObject(levelId(p), a));
    p = ok(p, addObject(levelId(p), b));
    return { p, ids: [a.id, b.id] };
  };
  it('applies one patch to every object in a single command', () => {
    const { p, ids } = two();
    const next = run(p, updateObjectsRecipe(levelId(p), ids, { height: 120, color: '#abcdef' }));
    for (const id of ids) expect(lvl(next).objects[id]).toMatchObject({ height: 120, color: '#abcdef' });
  });
  it('refuses the whole batch when one value is invalid', () => {
    const { p, ids } = two();
    expect(applyCommand(p, updateObjectsRecipe(levelId(p), ids, { height: 0 }))).toEqual({ ok: false, error: 'Dimension invalide' });
  });
});
