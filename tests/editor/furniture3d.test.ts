import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3, type Material } from 'three';
import { CATALOG, getCatalogEntry } from '@/catalog/catalog';
import { objectFootprint } from '@/core/geometry/objects';
import { createObjectFromSize } from '@/core/model/factory';
import type { CustomObjectDef, Level, PlacedObject } from '@/core/model/types';
import { ALERT_COLORS, AlertTints, mixHex } from '@/scene3d/alerts';
import { BUILDERS, buildObject3D, FurnitureLayer, Kit, specOf } from '@/scene3d/furniture';
import { genericBuilder } from '@/scene3d/furniture/generic';
import { levelFromWalls } from '../core/fixtures';

/*
 * Furniture builders (task 12): every catalog entry has a 3D object that stays in its
 * width x depth x height box (1 cm), placed at (x, elevation, y), turned clockwise on the plan and
 * mirrored like the 2D; alert tint and the per-object rebuild of the furniture layer. three.js runs
 * in Node here (geometry only, no WebGL).
 */

const TOL = 0.01;

function place(catalogId: string, over: Partial<PlacedObject> = {}, size?: { width: number; depth: number; height: number }): PlacedObject {
  const e = getCatalogEntry(catalogId)!;
  return createObjectFromSize({ kind: 'catalog', catalogId }, 0, 0, size ?? e, e.name, e.color, { lshape: e.lshape ?? null, pose: e.pose, ...over });
}

/** Bounding box of the meshes of `o` in the frame of `frame` (its own local frame by default). */
function boxIn(o: Object3D, frame: Object3D = o): Box3 {
  frame.updateMatrixWorld(true);
  o.updateMatrixWorld(true);
  const inv = frame.matrixWorld.clone().invert();
  const box = new Box3();
  o.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    n.geometry.computeBoundingBox();
    box.union(n.geometry.boundingBox!.clone().applyMatrix4(n.matrixWorld.clone().premultiply(inv)));
  });
  return box;
}

function expectInBox(box: Box3, w: number, d: number, h: number, label: string): void {
  const msg = `${label}: ${JSON.stringify({ min: box.min, max: box.max })} vs ${w} x ${d} x ${h}`;
  expect(box.min.x, msg).toBeGreaterThanOrEqual(-w / 2 - TOL);
  expect(box.max.x, msg).toBeLessThanOrEqual(w / 2 + TOL);
  expect(box.min.y, msg).toBeGreaterThanOrEqual(-TOL);
  expect(box.max.y, msg).toBeLessThanOrEqual(h + TOL);
  expect(box.min.z, msg).toBeGreaterThanOrEqual(-d / 2 - TOL);
  expect(box.max.z, msg).toBeLessThanOrEqual(d / 2 + TOL);
  // and fills most of it: not a dot in a corner
  const size = box.getSize(new Vector3());
  expect(size.x, msg).toBeGreaterThan(w * 0.5);
  expect(size.y, msg).toBeGreaterThan(h * 0.5);
  expect(size.z, msg).toBeGreaterThan(d * 0.5);
  // standing on its underside
  expect(box.min.y, msg).toBeLessThan(TOL);
}

const symbols = CATALOG.filter((e) => e.shape === 'symbol' && !e.model);

describe('furniture builders: one per catalog entry, inside its box (1 cm)', () => {
  it('every catalog entry drawn by a symbol has a builder', () => {
    expect(symbols.filter((e) => !BUILDERS[e.id]).map((e) => e.id)).toEqual([]);
  });

  it.each(symbols.map((e) => [e.id, e] as const))('%s at its catalog size', (_id, e) => {
    const kit = new Kit();
    const g = BUILDERS[e.id]!(specOf(place(e.id)), kit);
    expectInBox(boxIn(g), e.width / 100, e.depth / 100, e.height / 100, e.id);
    kit.dispose();
  });

  it.each(symbols.map((e) => [e.id, e] as const))('%s at other sizes (small and large, fitted by buildObject3D)', (_id, e) => {
    const kit = new Kit();
    for (const size of [
      { width: 30, depth: 25, height: 20 },
      { width: e.width * 1.6, depth: e.depth * 1.4, height: e.height * 1.3 },
    ]) {
      const g = buildObject3D(place(e.id, {}, size), {}, kit);
      expectInBox(boxIn(g.getObjectByName('body')!, g), size.width / 100, size.depth / 100, size.height / 100, `${e.id} ${JSON.stringify(size)}`);
    }
    kit.dispose();
  });

  it('the raw builders (without the fit) also stay in boxes 20 % larger and smaller than the catalog', () => {
    const kit = new Kit();
    for (const e of symbols) {
      for (const f of [0.8, 1.2]) {
        const size = { width: e.width * f, depth: e.depth * f, height: e.height * f };
        const g = BUILDERS[e.id]!(specOf(place(e.id, {}, size)), kit);
        expectInBox(boxIn(g), size.width / 100, size.depth / 100, size.height / 100, `${e.id} x${f}`);
      }
    }
    kit.dispose();
  });
});

describe('generic shapes and custom objects', () => {
  const down = (g: Object3D, x: number, z: number) => {
    g.updateMatrixWorld(true);
    return new Raycaster(new Vector3(x, 10, z), new Vector3(0, -1, 0)).intersectObject(g, true).length > 0;
  };

  it.each(['generic-rect', 'generic-circle', 'generic-lshape'])('%s fills its box, in the object color', (id) => {
    const kit = new Kit();
    const o = place(id, { color: '#123456' });
    const g = buildObject3D(o, {}, kit);
    const box = boxIn(g.getObjectByName('body')!, g);
    expectInBox(box, o.width / 100, o.depth / 100, o.height / 100, id);
    expect(box.max.y).toBeCloseTo(o.height / 100, 3);
    expect(box.max.x - box.min.x).toBeCloseTo(o.width / 100, 2);
    const colors = new Set<string>();
    g.traverse((n) => {
      if (n instanceof Mesh) colors.add((n.material as MeshStandardMaterial).color.getHexString());
    });
    expect([...colors]).toEqual(['123456']);
    kit.dispose();
  });

  it('the L has its notch where the 2D footprint has it, mirrored and turned like the 2D (ruling R22: o.lshape)', () => {
    const kit = new Kit();
    for (const mirrored of [false, true]) {
      for (const rotation of [0, 90, 210]) {
        const o = place('generic-lshape', { x: 150, y: 80, rotation, mirrored, lshape: { notchWidth: 120, notchDepth: 90 } });
        const g = buildObject3D(o, {}, kit);
        const ring = objectFootprint(o);
        // the notch center in local plan coordinates (+x, +y corner, x flipped by the mirror), to world
        const local = { x: (o.width / 2 - 60) * (mirrored ? -1 : 1), y: o.depth / 2 - 45 };
        const r = (rotation * Math.PI) / 180;
        const notch = { x: o.x + local.x * Math.cos(r) - local.y * Math.sin(r), y: o.y + local.x * Math.sin(r) + local.y * Math.cos(r) };
        const solid = { x: o.x + (-o.width / 4) * Math.cos(r) - (-o.depth / 4) * Math.sin(r), y: o.y + (-o.width / 4) * Math.sin(r) + (-o.depth / 4) * Math.cos(r) };
        expect(down(g, notch.x / 100, notch.y / 100), `notch ${mirrored} ${rotation}`).toBe(false);
        expect(down(g, solid.x / 100, solid.y / 100), `solid ${mirrored} ${rotation}`).toBe(true);
        // the world bbox (exact, from the vertices) equals the 2D footprint bbox
        g.updateMatrixWorld(true);
        const box = new Box3().setFromObject(g, true);
        const xs = ring.map((p) => p.x / 100);
        const ys = ring.map((p) => p.y / 100);
        expect(box.min.x).toBeCloseTo(Math.min(...xs), 2);
        expect(box.max.x).toBeCloseTo(Math.max(...xs), 2);
        expect(box.min.z, `${mirrored} ${rotation}`).toBeCloseTo(Math.min(...ys), 2);
        expect(box.max.z).toBeCloseTo(Math.max(...ys), 2);
      }
    }
    kit.dispose();
  });

  it("a custom object uses its definition's shape, but the placed object's own L and color", () => {
    const kit = new Kit();
    const def: CustomObjectDef = { id: 'c1', name: 'Établi', shape: 'lshape', width: 200, depth: 150, height: 90, color: '#aaaaaa', lshape: { notchWidth: 20, notchDepth: 20 }, pose: 'floor' };
    const o = createObjectFromSize({ kind: 'custom', customObjectId: 'c1' }, 0, 0, def, def.name, '#654321', { lshape: { notchWidth: 120, notchDepth: 90 } });
    const g = buildObject3D(o, { c1: def }, kit);
    g.updateMatrixWorld(true);
    const hits = (x: number, z: number) => new Raycaster(new Vector3(x, 10, z), new Vector3(0, -1, 0)).intersectObject(g, true).length > 0;
    // (0.6, 0.5) is in o's 120 x 90 notch, not in the definition's 20 x 20 one
    expect(hits(0.6, 0.5)).toBe(false);
    expect(hits(-0.6, -0.5)).toBe(true);
    const m = (g.getObjectByProperty('type', 'Mesh') as Mesh).material as MeshStandardMaterial;
    expect(m.color.getHexString()).toBe('654321');
    // a circle definition gives a round object
    const round = buildObject3D(o, { c1: { ...def, shape: 'circle' } }, kit);
    round.updateMatrixWorld(true);
    expect(new Raycaster(new Vector3(0.95, 10, 0.7), new Vector3(0, -1, 0)).intersectObject(round, true)).toHaveLength(0);
    expect(new Raycaster(new Vector3(0.95, 10, 0), new Vector3(0, -1, 0)).intersectObject(round, true).length).toBeGreaterThan(0);
    kit.dispose();
  });

  it('genericBuilder keeps a tiny object in its box', () => {
    const kit = new Kit();
    const g = genericBuilder('lshape', { notchWidth: 5, notchDepth: 5 })({ w: 0.03, d: 0.02, h: 0.01, color: '#ffffff', custom: true }, kit);
    expectInBox(boxIn(g), 0.03, 0.02, 0.01, 'tiny L');
    kit.dispose();
  });
});

describe('placement: (x, elevation, y), clockwise rotation, mirror', () => {
  it('the world box of a turned, raised object matches its 2D footprint and its vertical slice', () => {
    const kit = new Kit();
    for (const rotation of [0, 30, 90, 180, 270]) {
      const o = place('wardrobe', { x: 250, y: 120, rotation, elevation: 30 });
      const g = buildObject3D(o, {}, kit);
      const box = boxIn(g, new Object3D());
      const ring = objectFootprint(o);
      const xs = ring.map((p) => p.x / 100);
      const ys = ring.map((p) => p.y / 100);
      expect(box.min.x).toBeGreaterThanOrEqual(Math.min(...xs) - TOL);
      expect(box.max.x).toBeLessThanOrEqual(Math.max(...xs) + TOL);
      expect(box.min.z).toBeGreaterThanOrEqual(Math.min(...ys) - TOL);
      expect(box.max.z).toBeLessThanOrEqual(Math.max(...ys) + TOL);
      expect(box.min.y).toBeCloseTo(0.3, 3);
      expect(box.max.y).toBeCloseTo(0.3 + o.height / 100, 2);
    }
    kit.dispose();
  });

  it('the back of a chair (its tall part, local -y) turns clockwise on the plan: rotation 90 puts it on +x', () => {
    const kit = new Kit();
    /** Center (plan x, y in cm) of the meshes rising above 80 % of the height: the back. */
    const backCenter = (o: PlacedObject) => {
      const g = buildObject3D(o, {}, kit);
      g.updateMatrixWorld(true);
      const box = new Box3();
      g.traverse((n) => {
        if (!(n instanceof Mesh)) return;
        const b = new Box3().setFromObject(n);
        if (b.max.y > (o.height / 100) * 0.8 && b.min.y > 0.3) box.union(b);
      });
      const c = box.getCenter(new Vector3());
      return { x: c.x * 100 - o.x, y: c.z * 100 - o.y };
    };
    const at0 = backCenter(place('chair', { x: 100, y: 100 }));
    expect(at0.y).toBeLessThan(-15);
    expect(Math.abs(at0.x)).toBeLessThan(1);
    const at90 = backCenter(place('chair', { x: 100, y: 100, rotation: 90 }));
    expect(at90.x).toBeGreaterThan(15);
    expect(Math.abs(at90.y)).toBeLessThan(1);
    kit.dispose();
  });

  it('a mirrored object is the mirror image along its local x (bathtub drain on the left becomes right)', () => {
    const kit = new Kit();
    /** x (local, m) of the drain: the smallest mesh of the tub. */
    const drainX = (mirrored: boolean) => {
      const g = buildObject3D(place('bathtub', { mirrored }), {}, kit);
      g.updateMatrixWorld(true);
      let best: { x: number; vol: number } | null = null;
      g.traverse((n) => {
        if (!(n instanceof Mesh)) return;
        const b = new Box3().setFromObject(n);
        const s = b.getSize(new Vector3());
        const vol = s.x * s.z;
        if (!best || vol < best.vol) best = { x: b.getCenter(new Vector3()).x, vol };
      });
      return best!.x;
    };
    expect(drainX(false)).toBeLessThan(-0.3);
    expect(drainX(true)).toBeCloseTo(-drainX(false), 6);
    kit.dispose();
  });
});

describe('colors', () => {
  const colorsOf = (g: Object3D) => {
    const out: string[] = [];
    g.traverse((n) => {
      if (n instanceof Mesh) for (const m of [n.material].flat() as Material[]) if (m instanceof MeshStandardMaterial) out.push(`#${m.color.getHexString()}`);
    });
    return out;
  };

  it("an object in its catalog color gets plan-chambre's colors; a color set by the user goes on its main parts", () => {
    const kit = new Kit();
    const e = getCatalogEntry('bed-160')!;
    expect(specOf(place('bed-160')).custom).toBe(false);
    const plain = colorsOf(buildObject3D(place('bed-160'), {}, kit));
    expect(plain).toContain('#b08d6a');
    expect(plain).not.toContain(e.color);
    const red = colorsOf(buildObject3D(place('bed-160', { color: '#aa2233' }), {}, kit));
    expect(red).toContain('#aa2233');
    expect(red).not.toContain('#b08d6a');
    // the duvet keeps its color
    expect(red).toContain('#4f6f96');
    kit.dispose();
  });

  it('materials are shared between objects (one per color and options) and freed with the kit', () => {
    const kit = new Kit();
    const a = buildObject3D(place('chair'), {}, kit);
    const b = buildObject3D(place('chair', { x: 100 }), {}, kit);
    const mats = (g: Object3D) => {
      const out: Material[] = [];
      g.traverse((n) => {
        if (n instanceof Mesh) out.push(...([n.material].flat() as Material[]));
      });
      return out;
    };
    expect(mats(a)).toEqual(mats(b));
    const spy = vi.spyOn(mats(a)[0]!, 'dispose');
    kit.dispose();
    expect(spy).toHaveBeenCalled();
  });
});

describe('alert tint', () => {
  it('mixHex mixes two sRGB colors channel by channel', () => {
    expect(mixHex('#000000', '#cf2e2e', 0.5)).toBe('#681717');
    expect(mixHex('#4f6f96', '#cf2e2e', 0.5)).toBe('#8f4f62');
    expect(mixHex('#ffffff', '#e08a1e', 0.5)).toBe('#f0c58f');
    expect(mixHex('#fff', '#000', 0.5)).toBe('#808080');
  });

  it('tints the materials of an element in alert with clones, leaves the others, restores and frees the clones', () => {
    const kit = new Kit();
    const bedA = buildObject3D(place('bed-160'), {}, kit);
    const bedB = buildObject3D(place('bed-160', { x: 300 }), {}, kit);
    const duvet = (g: Object3D) => {
      let found = null as Mesh | null;
      g.traverse((n) => {
        if (n instanceof Mesh && !Array.isArray(n.material) && (n.material as MeshStandardMaterial).color.getHexString() === '4f6f96') found ??= n;
      });
      return found;
    };
    const dA = duvet(bedA)!;
    const original = dA.material as MeshStandardMaterial;
    const tints = new AlertTints();
    tints.sync(new Map([[bedA, 'error' as const]]));
    const tinted = dA.material as MeshStandardMaterial;
    expect(tinted).not.toBe(original);
    expect(`#${tinted.color.getHexString()}`).toBe(mixHex('#4f6f96', ALERT_COLORS.error, 0.5));
    // the other bed shares the original material, untouched
    expect(duvet(bedB)!.material).toBe(original);
    expect(original.color.getHexString()).toBe('4f6f96');
    // error -> warning: new clones in orange
    const spy = vi.spyOn(tinted, 'dispose');
    tints.sync(new Map([[bedA, 'warning' as const]]));
    expect(spy).toHaveBeenCalled();
    expect(`#${(dA.material as MeshStandardMaterial).color.getHexString()}`).toBe(mixHex('#4f6f96', ALERT_COLORS.warning, 0.5));
    // no alert (or hideAlerts: an empty map): original material back
    tints.sync(new Map());
    expect(dA.material).toBe(original);
    expect(tints.severityOf(bedA)).toBeUndefined();
    kit.dispose();
  });
});

describe('FurnitureLayer', () => {
  function levelWith(objects: PlacedObject[]): Level {
    const level = levelFromWalls([]);
    for (const o of objects) level.objects[o.id] = o;
    return level;
  }

  it('builds each object once, rebuilds only a changed object, drops a removed one and frees its geometries', () => {
    const labels: Array<{ text: string; obj: Object3D; freed: boolean }> = [];
    const layer = new FurnitureLayer(new Kit(), {
      make: (text) => {
        const obj = new Group();
        labels.push({ text, obj, freed: false });
        return obj;
      },
      free: (obj) => {
        labels.find((l) => l.obj === obj)!.freed = true;
      },
    });
    const bedO = place('bed-160', { x: 100, y: 100 });
    const chairO = place('chair', { x: 300, y: 100 });
    const l1 = levelWith([bedO, chairO]);
    l1.elevation = 250;
    layer.sync(l1, {}, true);
    expect(layer.buildCount).toBe(2);
    expect(layer.root.position.y).toBeCloseTo(2.5);
    expect(labels.map((l) => l.text).sort()).toEqual(['Chaise', 'Lit 160']);
    expect(labels.every((l) => l.obj.visible)).toBe(true);
    // label 18 cm above the object
    expect(labels.find((l) => l.text === 'Chaise')!.obj.position.y).toBeCloseTo(0.9 + 0.18);

    const bedGroup = layer.groupOf(bedO.id)!;
    const chairGroup = layer.groupOf(chairO.id)!;
    const geometries: Array<ReturnType<typeof vi.spyOn>> = [];
    chairGroup.traverse((n) => {
      if (n instanceof Mesh) geometries.push(vi.spyOn(n.geometry, 'dispose'));
    });
    // the chair moves, the bed does not; labels hidden
    const l2 = { ...l1, objects: { [bedO.id]: bedO, [chairO.id]: { ...chairO, x: 320 } } };
    layer.sync(l2, {}, false);
    expect(layer.buildCount).toBe(3);
    expect(layer.groupOf(bedO.id)).toBe(bedGroup);
    expect(layer.groupOf(chairO.id)).not.toBe(chairGroup);
    expect(layer.groupOf(chairO.id)!.position.x).toBeCloseTo(3.2);
    expect(geometries.length).toBeGreaterThan(0);
    for (const s of geometries) expect(s).toHaveBeenCalled();
    expect(labels.filter((l) => l.freed).map((l) => l.text)).toEqual(['Chaise']);
    expect(labels.filter((l) => !l.freed).every((l) => !l.obj.visible)).toBe(true);
    // the bed is removed
    layer.sync({ ...l2, objects: { [chairO.id]: l2.objects[chairO.id]! } }, {}, false);
    expect(layer.groupOf(bedO.id)).toBeUndefined();
    expect(layer.root.children).toHaveLength(1);
    // another level: everything rebuilt
    layer.sync({ ...l2, id: 'other' }, {}, true);
    expect(layer.buildCount).toBe(5);
    layer.dispose();
    expect(layer.root.children).toHaveLength(0);
    expect(labels.every((l) => l.freed)).toBe(true);
  });

  it('rebuilds a custom object when its definition changes', () => {
    const layer = new FurnitureLayer(new Kit(), null);
    const def: CustomObjectDef = { id: 'c1', name: 'Coffre', shape: 'rect', width: 80, depth: 40, height: 50, color: '#aaaaaa', lshape: null, pose: 'floor' };
    const o = createObjectFromSize({ kind: 'custom', customObjectId: 'c1' }, 0, 0, def, def.name, def.color);
    const level = levelWith([o]);
    layer.sync(level, { c1: def }, true);
    layer.sync(level, { c1: def }, true);
    expect(layer.buildCount).toBe(1);
    layer.sync(level, { c1: { ...def, shape: 'circle' } }, true);
    expect(layer.buildCount).toBe(2);
    layer.dispose();
  });
});
