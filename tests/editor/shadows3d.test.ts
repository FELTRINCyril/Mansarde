import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh } from 'three';
import { getCatalogEntry } from '@/catalog/catalog';
import { createObjectFromSize } from '@/core/model/factory';
import type { Level, PlacedObject } from '@/core/model/types';
import { createEditorStore, SMALL_SHADOWS_KEY } from '@/editor/store';
import { FurnitureLayer, isSmallObject, Kit } from '@/scene3d/furniture';
import { levelFromWalls } from '../core/fixtures';

/* "Ombres des petits objets" (13/10/2026): small objects stop casting their shadow, nothing is rebuilt. */

const BASE = levelFromWalls([]);
const levelWith = (objects: PlacedObject[]): Level => ({ ...BASE, objects: Object.fromEntries(objects.map((o) => [o.id, o])) });
const place = (id: string): PlacedObject => {
  const e = getCatalogEntry(id)!;
  return createObjectFromSize({ kind: 'catalog', catalogId: id }, 0, 0, e, e.name, e.color, { pose: e.pose });
};
const casts = (layer: FurnitureLayer, o: PlacedObject): boolean[] => {
  const out: boolean[] = [];
  layer.groupOf(o.id)!.traverse((n) => n instanceof Mesh && !n.userData.outline && out.push(n.castShadow));
  return out;
};

describe('small objects', () => {
  it('are the ones on furniture, the rugs and the ones under 80 cm', () => {
    expect(isSmallObject(place('bedside-lamp'))).toBe(true);
    expect(isSmallObject(place('rug-rect'))).toBe(true);
    expect(isSmallObject(place('nightstand'))).toBe(true);
    expect(isSmallObject(place('bed-140'))).toBe(false);
    expect(isSmallObject(place('wardrobe'))).toBe(false);
  });
});

describe('FurnitureLayer shadows', () => {
  it('turns the shadows of small objects off and back on, large ones untouched, nothing rebuilt', () => {
    const layer = new FurnitureLayer(new Kit(), null);
    const lamp = place('bedside-lamp');
    const bed = place('bed-140');
    const level = levelWith([lamp, bed]);
    layer.sync(level, {}, false, true);
    const lampBefore = casts(layer, lamp);
    const bedBefore = casts(layer, bed);
    expect(lampBefore.some(Boolean)).toBe(true);
    const builds = layer.buildCount;

    layer.sync(level, {}, false, false);
    expect(casts(layer, lamp).every((c) => !c)).toBe(true);
    expect(casts(layer, bed)).toEqual(bedBefore);
    expect(layer.buildCount).toBe(builds);

    layer.sync(level, {}, false, true);
    expect(casts(layer, lamp)).toEqual(lampBefore);
  });

  it('applies the option to objects added while it is off', () => {
    const layer = new FurnitureLayer(new Kit(), null);
    layer.sync(levelWith([]), {}, false, false);
    const lamp = place('bedside-lamp');
    layer.sync(levelWith([lamp]), {}, false, false);
    expect(casts(layer, lamp).every((c) => !c)).toBe(true);
  });
});

describe('the option is kept by the browser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads and writes localStorage', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    expect(createEditorStore().getState().display.smallShadows3d).toBe(true);
    createEditorStore().getState().setDisplay({ smallShadows3d: false });
    expect(data.get(SMALL_SHADOWS_KEY)).toBe('false');
    expect(createEditorStore().getState().display.smallShadows3d).toBe(false);
  });

  it('falls back to the default when storage is refused', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const store = createEditorStore();
    expect(store.getState().display.smallShadows3d).toBe(true);
    store.getState().setDisplay({ smallShadows3d: false });
    expect(store.getState().display.smallShadows3d).toBe(false);
  });
});
