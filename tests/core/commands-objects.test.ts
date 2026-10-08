import { describe, expect, it } from 'vitest';
import { addDimension } from '@/core/commands/dimensions';
import {
  addObject,
  deleteObjects,
  moveObjects,
  pasteObjects,
  setObjectTransform,
  updateObject,
} from '@/core/commands/objects';
import { createObjectFromSize } from '@/core/model/factory';
import type { Id, PlacedObject, Project } from '@/core/model/types';
import { emptyProject, levelId, lvl, noop, refuse, run } from './helpers';

const rect = (over: Partial<PlacedObject> = {}): PlacedObject =>
  createObjectFromSize(
    { kind: 'catalog', catalogId: 'generic-rect' },
    100,
    100,
    { width: 100, depth: 50, height: 80 },
    'Boite',
    '#ccc',
    over,
  );

function withObject(over: Partial<PlacedObject> = {}): { p: Project; id: Id } {
  const p = emptyProject();
  const o = rect(over);
  return { p: run(p, addObject(levelId(p), o)), id: o.id };
}

describe('addObject', () => {
  it('adds the object', () => {
    const p = emptyProject();
    const o = rect();
    const next = run(p, addObject(levelId(p), o));
    expect(lvl(next).objects[o.id]).toEqual(o);
  });

  it('refuses an invalid size, a missing custom definition and an unknown level', () => {
    const p = emptyProject();
    expect(refuse(p, addObject(levelId(p), rect({ width: 0 })))).toBe('Dimension invalide');
    expect(refuse(p, addObject(levelId(p), rect({ x: NaN })))).toBe('Position invalide');
    const custom = rect({ source: { kind: 'custom', customObjectId: 'nope' } });
    expect(refuse(p, addObject(levelId(p), custom))).toBe('Objet introuvable');
    expect(refuse(p, addObject('nope', rect()))).toBe('Niveau introuvable');
  });
});

describe('moveObjects', () => {
  it('moves each object once by delta', () => {
    const a = withObject({ x: 0, y: 0 });
    const o2 = rect({ x: 50, y: 60 });
    const p = run(a.p, addObject(levelId(a.p), o2));
    const next = run(p, moveObjects(levelId(p), [a.id, o2.id, o2.id], { x: 10, y: -5 }));
    expect(lvl(next).objects[a.id]).toMatchObject({ x: 10, y: -5 });
    expect(lvl(next).objects[o2.id]).toMatchObject({ x: 60, y: 55 });
  });

  it('refuses unknown ids and non-finite deltas; no-op for a null move', () => {
    const { p, id } = withObject();
    expect(refuse(p, moveObjects(levelId(p), [id, 'nope'], { x: 1, y: 1 }))).toBe('Objet introuvable');
    expect(refuse(p, moveObjects(levelId(p), [id], { x: NaN, y: 0 }))).toBe('Position invalide');
    noop(p, moveObjects(levelId(p), [id], { x: 0, y: 0 }));
    noop(p, moveObjects(levelId(p), [], { x: 5, y: 5 }));
  });
});

describe('setObjectTransform', () => {
  it('normalizes the rotation to [0, 360)', () => {
    const { p, id } = withObject();
    expect(lvl(run(p, setObjectTransform(levelId(p), id, { rotation: -90 }))).objects[id]!.rotation).toBe(270);
    expect(lvl(run(p, setObjectTransform(levelId(p), id, { rotation: 450 }))).objects[id]!.rotation).toBe(90);
    noop(p, setObjectTransform(levelId(p), id, { rotation: 360 })); // 360 is 0, already there
  });

  it('sets only the given fields', () => {
    const { p, id } = withObject({ x: 1, y: 2, rotation: 30 });
    const next = run(p, setObjectTransform(levelId(p), id, { x: 40 }));
    expect(lvl(next).objects[id]).toMatchObject({ x: 40, y: 2, rotation: 30 });
  });

  it('refuses non-finite values and unknown objects; no-op when unchanged', () => {
    const { p, id } = withObject({ x: 1, y: 2, rotation: 30 });
    expect(refuse(p, setObjectTransform(levelId(p), id, { rotation: NaN }))).toBe('Position invalide');
    expect(refuse(p, setObjectTransform(levelId(p), id, { y: Infinity }))).toBe('Position invalide');
    expect(refuse(p, setObjectTransform(levelId(p), 'nope', { x: 1 }))).toBe('Objet introuvable');
    noop(p, setObjectTransform(levelId(p), id, { x: 1, rotation: 30 }));
    noop(p, setObjectTransform(levelId(p), id, {}));
  });
});

describe('updateObject', () => {
  it('updates size, name, colour, elevation and mirroring', () => {
    const { p, id } = withObject();
    const next = run(
      p,
      updateObject(levelId(p), id, { width: 120, depth: 60, height: 90, elevation: 15, name: 'Table', color: '#f00', mirrored: true }),
    );
    expect(lvl(next).objects[id]).toMatchObject({
      width: 120,
      depth: 60,
      height: 90,
      elevation: 15,
      name: 'Table',
      color: '#f00',
      mirrored: true,
    });
  });

  it('rejects non-positive dimensions', () => {
    const { p, id } = withObject();
    for (const patch of [
      { width: 0 },
      { width: -3 },
      { depth: NaN },
      { height: 0 },
      { height: Infinity },
      { elevation: -1 },
      { elevation: NaN },
    ]) {
      expect(refuse(p, updateObject(levelId(p), id, patch))).toBe('Dimension invalide');
    }
  });

  it('refuses invalid L notch values, accepts a valid one', () => {
    const { p, id } = withObject();
    expect(refuse(p, updateObject(levelId(p), id, { lshape: { notchWidth: 0, notchDepth: 10 } }))).toBe('Dimension invalide');
    const next = run(p, updateObject(levelId(p), id, { lshape: { notchWidth: 30, notchDepth: 10 } }));
    expect(lvl(next).objects[id]!.lshape).toEqual({ notchWidth: 30, notchDepth: 10 });
  });

  it('keeps the source and id, normalizes the rotation, and is a no-op when nothing changes', () => {
    const { p, id } = withObject();
    const next = run(p, updateObject(levelId(p), id, { rotation: -45 }));
    expect(lvl(next).objects[id]).toMatchObject({ rotation: 315, source: { kind: 'catalog', catalogId: 'generic-rect' }, id });
    noop(p, updateObject(levelId(p), id, { width: 100, name: 'Boite' }));
  });
});

describe('deleteObjects', () => {
  it('deletes the objects and the manual dimensions anchored to one of their corners', () => {
    const a = withObject({ x: 0, y: 0 });
    const o2 = rect({ x: 500, y: 0 });
    let p = run(a.p, addObject(levelId(a.p), o2));
    const lv = levelId(p);
    p = run(
      p,
      addDimension(lv, { kind: 'objectCorner', objectId: a.id, corner: 1 }, { kind: 'objectCorner', objectId: o2.id, corner: 0 }, 30),
    );
    p = run(p, addDimension(lv, { kind: 'point', x: 0, y: 0 }, { kind: 'point', x: 10, y: 0 }, 30));
    expect(Object.keys(lvl(p).dimensions)).toHaveLength(2);

    const next = run(p, deleteObjects(lv, [a.id]));
    expect(lvl(next).objects[a.id]).toBeUndefined();
    expect(lvl(next).objects[o2.id]).toBeDefined();
    const dims = Object.values(lvl(next).dimensions);
    expect(dims).toHaveLength(1);
    expect(dims[0]!.a.kind).toBe('point');
  });

  it('refuses an unknown id; no-op on an empty list', () => {
    const { p, id } = withObject();
    expect(refuse(p, deleteObjects(levelId(p), [id, 'nope']))).toBe('Objet introuvable');
    noop(p, deleteObjects(levelId(p), []));
  });
});

describe('pasteObjects', () => {
  it('creates new ids, shifted by delta, source untouched', () => {
    const { p, id } = withObject({ x: 100, y: 200, rotation: 45, name: 'Lit' });
    const source = lvl(p).objects[id]!;
    const out = { ids: [] as Id[] };
    const next = run(p, pasteObjects(levelId(p), [source, source], { x: 30, y: 40 }, out));
    expect(out.ids).toHaveLength(2);
    expect(new Set([...out.ids, id]).size).toBe(3);
    for (const nid of out.ids) {
      expect(lvl(next).objects[nid]).toMatchObject({ x: 130, y: 240, rotation: 45, name: 'Lit', id: nid });
    }
    expect(lvl(next).objects[id]).toEqual(source);
  });

  it('refuses a custom object without definition and non-finite deltas; no-op when empty', () => {
    const { p } = withObject();
    const bad = rect({ source: { kind: 'custom', customObjectId: 'nope' } });
    expect(refuse(p, pasteObjects(levelId(p), [bad], { x: 0, y: 0 }))).toBe('Objet introuvable');
    expect(refuse(p, pasteObjects(levelId(p), [rect()], { x: NaN, y: 0 }))).toBe('Position invalide');
    const out = { ids: ['x'] };
    noop(p, pasteObjects(levelId(p), [], { x: 1, y: 1 }, out));
    expect(out.ids).toEqual([]);
  });
});
