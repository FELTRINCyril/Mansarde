import { describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { CATALOG, getCatalogEntry } from '@/catalog/catalog';
import { createObjectFromSize } from '@/core/model/factory';
import type { Level, PlacedObject } from '@/core/model/types';
import { buildObject3D, FurnitureLayer, Kit } from '@/scene3d/furniture';
import { MAIN_MATERIAL, ModelLibrary, type ModelLoader } from '@/scene3d/models';
import { levelFromWalls } from '../core/fixtures';

/*
 * Downloaded models in 3D (spec 2026-10-13, section 7), with a fake loader whose promises the
 * test settles: the box while loading, the stretched model after, one load per model, no retry
 * after a failure, the user's color on the 'main' material only, shared geometries kept.
 */

const MODEL = CATALOG.find((e) => e.model)!;
const OTHER = CATALOG.find((e) => e.model && e.id !== MODEL.id)!;

/** A unit-box model: a 'main' body and a dark detail. */
function unitModel(): Group {
  const g = new Group();
  const body = new BoxGeometry(1, 0.8, 1).translate(0, 0.4, 0);
  const top = new BoxGeometry(1, 0.2, 1).translate(0, 0.9, 0);
  const main = new MeshStandardMaterial({ color: '#aa8866', name: MAIN_MATERIAL });
  const dark = new MeshStandardMaterial({ color: '#222222', name: 'm1' });
  g.add(new Mesh(body, main), new Mesh(top, dark));
  return g;
}

function controlledLoader() {
  const calls: string[] = [];
  const settle = new Map<string, { resolve: (o: Object3D) => void; reject: (e: unknown) => void }>();
  const load: ModelLoader = (url) => {
    calls.push(url);
    return new Promise((resolve, reject) => settle.set(url, { resolve, reject }));
  };
  return { load, calls, settle };
}

const urlOf = (id: string) => `/models/${id}.glb`;
const flush = () => new Promise((r) => setTimeout(r, 0));

function place(id: string, over: Partial<PlacedObject> = {}, size = { width: 120, depth: 60, height: 90 }): PlacedObject {
  const e = getCatalogEntry(id)!;
  return createObjectFromSize({ kind: 'catalog', catalogId: id }, 100, 200, size, e.name, e.color, { pose: e.pose, ...over });
}

/** One level (same id across syncs, like the editor's), holding `objects`. */
const BASE_LEVEL = levelFromWalls([]);
function levelWith(objects: PlacedObject[]): Level {
  return { ...BASE_LEVEL, objects: Object.fromEntries(objects.map((o) => [o.id, o])) };
}

function boxOf(o: Object3D): Box3 {
  o.updateMatrixWorld(true);
  const inv = o.matrixWorld.clone().invert();
  const box = new Box3();
  o.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    n.geometry.computeBoundingBox();
    box.union(n.geometry.boundingBox!.clone().applyMatrix4(n.matrixWorld.clone().premultiply(inv)));
  });
  return box;
}

/** The object shows the generic box (no mesh of a model template). */
const showsBox = (g: Object3D): boolean => {
  const ms = meshes(g.getObjectByName('body')!);
  return ms.length === 1 && !ms[0]!.userData.sharedGeometry;
};

const meshes = (o: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  o.traverse((n) => n instanceof Mesh && out.push(n));
  return out;
};

describe('ModelLibrary', () => {
  it('loads a model once and reports it', async () => {
    const { load, calls, settle } = controlledLoader();
    const ready = vi.fn();
    const lib = new ModelLibrary(load, urlOf, ready);
    expect(lib.get(MODEL.id)).toBeNull();
    expect(lib.get(MODEL.id)).toBeNull();
    expect(calls).toEqual([urlOf(MODEL.id)]);
    settle.get(urlOf(MODEL.id))!.resolve(unitModel());
    await flush();
    expect(ready).toHaveBeenCalledWith(MODEL.id);
    expect(lib.get(MODEL.id)).not.toBeNull();
    expect(lib.stats).toEqual({ loaded: 1, failed: 0 });
    expect(meshes(lib.get(MODEL.id)!).every((m) => m.userData.sharedGeometry && m.castShadow)).toBe(true);
  });

  it('failed load keeps the box and is not retried', async () => {
    const { load, calls, settle } = controlledLoader();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lib = new ModelLibrary(load, urlOf, () => {});
    lib.get(MODEL.id);
    settle.get(urlOf(MODEL.id))!.reject(new Error('404'));
    await flush();
    expect(lib.failed(MODEL.id)).toBe(true);
    expect(lib.settled(MODEL.id)).toBe(true);
    expect(lib.get(MODEL.id)).toBeNull();
    expect(lib.get(MODEL.id)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(lib.stats).toEqual({ loaded: 0, failed: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('load resolved after dispose is ignored and freed', async () => {
    const { load, settle } = controlledLoader();
    const ready = vi.fn();
    const lib = new ModelLibrary(load, urlOf, ready);
    lib.get(MODEL.id);
    lib.dispose();
    const model = unitModel();
    const spy = vi.spyOn(meshes(model)[0]!.geometry, 'dispose');
    settle.get(urlOf(MODEL.id))!.resolve(model);
    await flush();
    expect(ready).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    expect(lib.get(MODEL.id)).toBeNull();
  });
});

describe('downloaded models in the furniture layer', () => {
  async function loaded() {
    const { load, settle, calls } = controlledLoader();
    const ready = vi.fn();
    const lib = new ModelLibrary(load, urlOf, ready);
    return { lib, settle, calls, ready };
  }

  it('shows the box while loading, then the model scaled into its box, mirrored', async () => {
    const { lib, settle, calls, ready } = await loaded();
    const layer = new FurnitureLayer(new Kit(), null, lib);
    const a = place(MODEL.id);
    const b = place(MODEL.id, { mirrored: true }, { width: 200, depth: 40, height: 30 });
    layer.sync(levelWith([a, b]), {}, false);
    expect(calls).toEqual([urlOf(MODEL.id)]);
    expect(layer.groupOf(a.id)!.userData.waitingModel).toBe(MODEL.id);
    expect(showsBox(layer.groupOf(a.id)!)).toBe(true);

    settle.get(urlOf(MODEL.id))!.resolve(unitModel());
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    const before = layer.buildCount;
    expect(layer.sync(levelWith([a, b]), {}, false)).toBe(true);
    expect(layer.buildCount).toBe(before + 2);
    for (const [o, w, d, h] of [[a, 1.2, 0.6, 0.9], [b, 2, 0.4, 0.3]] as const) {
      const g = layer.groupOf(o.id)!;
      expect(g.userData.waitingModel).toBeUndefined();
      expect(showsBox(g)).toBe(false);
      const box = boxOf(g.getObjectByName('body')!);
      const size = box.getSize(new Vector3());
      expect(size.x).toBeCloseTo(w, 3);
      expect(size.y).toBeCloseTo(h, 3);
      expect(size.z).toBeCloseTo(d, 3);
      expect(box.min.y).toBeCloseTo(0, 3);
    }
    expect(layer.groupOf(b.id)!.getObjectByName('body')!.scale.x).toBe(-1);
    // settled: a later sync rebuilds nothing
    const after = layer.buildCount;
    layer.sync(levelWith([a, b]), {}, false);
    expect(layer.buildCount).toBe(after);
  });

  it('keeps the box when the load failed, without rebuilding it again and again', async () => {
    const { lib, settle } = await loaded();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = new FurnitureLayer(new Kit(), null, lib);
    const a = place(MODEL.id);
    layer.sync(levelWith([a]), {}, false);
    settle.get(urlOf(MODEL.id))!.reject(new Error('offline'));
    await flush();
    layer.sync(levelWith([a]), {}, false);
    const g = layer.groupOf(a.id)!;
    expect(g.userData.waitingModel).toBeUndefined();
    expect(showsBox(g)).toBe(true);
    const n = layer.buildCount;
    layer.sync(levelWith([a]), {}, false);
    expect(layer.buildCount).toBe(n);
    warn.mockRestore();
  });

  it("puts the user's color on the main material only", async () => {
    const { lib, settle } = await loaded();
    const layer = new FurnitureLayer(new Kit(), null, lib);
    const plain = place(MODEL.id);
    const blue = place(MODEL.id, { color: '#3366cc' });
    layer.sync(levelWith([plain, blue]), {}, false);
    const template = unitModel();
    settle.get(urlOf(MODEL.id))!.resolve(template);
    await flush();
    layer.sync(levelWith([plain, blue]), {}, false);
    const [tMain, tDark] = meshes(template).map((m) => m.material as MeshStandardMaterial);
    const [pMain, pDark] = meshes(layer.groupOf(plain.id)!).map((m) => m.material as MeshStandardMaterial);
    const [bMain, bDark] = meshes(layer.groupOf(blue.id)!).map((m) => m.material as MeshStandardMaterial);
    expect(pMain).toBe(tMain);
    expect(pDark).toBe(tDark);
    expect(bMain).not.toBe(tMain);
    expect(bMain!.color.getHexString()).toBe('3366cc');
    expect(bDark).toBe(tDark);
    expect(tMain!.color.getHexString()).toBe('aa8866');
  });

  it('removing an object keeps the shared geometries; dispose frees them', async () => {
    const { lib, settle } = await loaded();
    const layer = new FurnitureLayer(new Kit(), null, lib);
    const a = place(MODEL.id);
    layer.sync(levelWith([a]), {}, false);
    const template = unitModel();
    settle.get(urlOf(MODEL.id))!.resolve(template);
    await flush();
    layer.sync(levelWith([a]), {}, false);
    const spies = meshes(template).map((m) => vi.spyOn(m.geometry, 'dispose'));
    layer.sync(levelWith([]), {}, false);
    expect(spies.every((s) => s.mock.calls.length === 0)).toBe(true);
    layer.dispose();
    expect(spies.every((s) => s.mock.calls.length > 0)).toBe(true);
  });

  it('loads each model once for many objects, two models in parallel', async () => {
    const { lib, calls } = await loaded();
    const layer = new FurnitureLayer(new Kit(), null, lib);
    layer.sync(levelWith([place(MODEL.id), place(MODEL.id), place(OTHER.id), place(OTHER.id)]), {}, false);
    expect(calls.sort()).toEqual([urlOf(MODEL.id), urlOf(OTHER.id)].sort());
  });

  it('unknown id builds the generic box without loading anything', () => {
    const { load, calls } = controlledLoader();
    const lib = new ModelLibrary(load, urlOf, () => {});
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'kn-does-not-exist' }, 0, 0, { width: 50, depth: 50, height: 50 }, 'x', '#cccccc', {});
    const g = buildObject3D(o, {}, new Kit(), lib);
    expect(showsBox(g)).toBe(true);
    expect(g.userData.waitingModel).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
