import { describe, expect, it, vi } from 'vitest';
import { Group, LineBasicMaterial, LineSegments, Mesh, PerspectiveCamera, type MeshStandardMaterial, type Object3D } from 'three';
import { getCatalogEntry } from '@/catalog/catalog';
import { ceilingWithoutBeams } from '@/core/geometry/ceiling';
import { deriveLevel, deriveVolumes } from '@/core/geometry/derived';
import { distanceToRing, pointInRing, ringEdges } from '@/core/geometry/polygon';
import { segmentIntersection } from '@/core/geometry/vec';
import { createBeam, createCupboard, createObjectFromSize, createSlope } from '@/core/model/factory';
import type { Level, PlacedObject, Ring, Vec2 } from '@/core/model/types';
import { AlertTints } from '@/scene3d/alerts';
import { boundsOf, CameraRig, maxDistance, presetPose, roomEye, tallFootprints, unionBounds } from '@/scene3d/camera';
import { FurnitureLayer, Kit } from '@/scene3d/furniture';
import { buildLevelView } from '@/scene3d/levelMeshes';
import { createMaterials } from '@/scene3d/materials';
import { onClick, pickAt, SelectionOutline, SELECTION_COLOR } from '@/scene3d/picking';
import { CupboardLayer, sameStructure } from '@/scene3d/sync';
import { findWall, levelFromWalls, rectRoom } from '../core/fixtures';

/*
 * Task 13: room preset eye, orbit bound, per-cupboard sync, kit purge, labels of unnamed objects,
 * picking and selection outline. three.js runs in Node (geometry and raycasting, no WebGL).
 */

function place(catalogId: string, x: number, y: number, over: Partial<PlacedObject> = {}): PlacedObject {
  const e = getCatalogEntry(catalogId)!;
  return createObjectFromSize({ kind: 'catalog', catalogId }, x, y, e, e.name, e.color, { lshape: e.lshape ?? null, pose: e.pose, ...over });
}

/** plan-chambre's attic (inside 0..400), 2.40 m down to 1.50 m from x = 197, cupboards along the right wall. */
function attic(): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  for (const w of Object.values(level.walls)) w.height = 240;
  const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
  level.slopes[s.id] = s;
  const right = findWall(level, 410, -10, 410, 410);
  const c = createCupboard(right, 210, 'left', { width: 400, heightMode: 'ceiling' });
  level.cupboards[c.id] = c;
  return level;
}

/** The furnished attic of the visual check (task 12): wardrobe and TV unit on the bottom wall, desk on the left. */
function furnishedAttic(): Level {
  const level = attic();
  for (const o of [
    place('bed-160', 198, 100),
    place('nightstand', 92, 22),
    place('desk', 35, 165, { rotation: 270 }),
    place('chair', 93, 165, { rotation: 90 }),
    place('wardrobe', 155, 370, { rotation: 180 }),
    place('tv-unit', 278, 377.5, { rotation: 180 }),
    place('pouf', 70, 280),
    place('plant', 30, 30),
  ]) {
    level.objects[o.id] = o;
  }
  return level;
}

const meshCount = (o: Object3D) => {
  let n = 0;
  o.traverse((x) => {
    if (x instanceof Mesh) n++;
  });
  return n;
};

const meets = (p: Vec2, q: Vec2, r: Ring) => pointInRing(p, r) || pointInRing(q, r) || ringEdges(r).some(([a, b]) => segmentIntersection(p, q, a, b) !== null);

describe('room preset eye (task 12 review: not inside tall furniture)', () => {
  it('furnished attic: the eye is in the room, 40 cm from the walls, out of every tall footprint, under a ceiling of at least 1.85 m, with a free line of sight', () => {
    const level = furnishedAttic();
    const d = deriveLevel(level);
    const room = d.rooms[0]!;
    const obstacles = tallFootprints(level, {}, deriveVolumes(level).cupboardFootprints);
    // the wardrobe and the cupboards are tall; the bed, desk and pouf are not
    expect(obstacles).toHaveLength(2);
    const eye = roomEye(room, room.labelPoint, { obstacles, ceiling: (p) => ceilingWithoutBeams(level, p) });
    expect(pointInRing(eye, room.ring)).toBe(true);
    expect(distanceToRing(eye, room.ring)).toBeGreaterThanOrEqual(40 - 1e-6);
    for (const r of obstacles) {
      expect(pointInRing(eye, r)).toBe(false);
      expect(distanceToRing(eye, r)).toBeGreaterThanOrEqual(15);
      expect(meets(eye, room.labelPoint, r)).toBe(false);
    }
    expect(ceilingWithoutBeams(level, eye)).toBeGreaterThanOrEqual(185);
    // a wide view: well away from the center
    expect(Math.hypot(eye.x - room.labelPoint.x, eye.y - room.labelPoint.y)).toBeGreaterThan(120);
    const pose = presetPose('room', boundsOf([room.ring]), room, 1, { obstacles, ceiling: (p) => ceilingWithoutBeams(level, p) });
    expect(pose.pos[1]).toBeCloseTo(1.6, 9);
    expect(pose.pos[0]).toBeCloseTo(eye.x / 100, 9);
  });

  it('a wardrobe in every corner: the eye takes a free spot between them', () => {
    const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
    for (const [x, y] of [[50, 30], [350, 30], [50, 370], [350, 370]] as const) {
      const o = place('wardrobe', x, y);
      level.objects[o.id] = o;
    }
    const d = deriveLevel(level);
    const room = d.rooms[0]!;
    const obstacles = tallFootprints(level, {}, new Map());
    expect(obstacles).toHaveLength(4);
    const eye = roomEye(room, room.labelPoint, { obstacles });
    for (const r of obstacles) expect(distanceToRing(eye, r)).toBeGreaterThanOrEqual(15);
  });

  it('a room too small for the inset still gives an eye inside it', () => {
    const level = levelFromWalls(rectRoom(-10, -10, 70, 70));
    const room = deriveLevel(level).rooms[0]!;
    expect(pointInRing(roomEye(room, room.labelPoint), room.ring)).toBe(true);
  });
});

describe('camera rig: orbit bound (task 11 review)', () => {
  const fakeDom = () => {
    const el = { addEventListener() {}, removeEventListener() {}, style: {} as Record<string, string>, getRootNode: () => el, ownerDocument: null as unknown };
    el.ownerDocument = el;
    return el as unknown as HTMLElement;
  };
  const dist = (rig: CameraRig) => rig.camera.position.distanceTo(rig.controls.target);

  /** A DOM element that really dispatches events (OrbitControls and the rig listen to it). */
  class EventDom extends EventTarget {
    style: Record<string, string> = {};
    clientWidth = 1000;
    clientHeight = 700;
    setPointerCapture() {}
    releasePointerCapture() {}
    hasPointerCapture() {
      return false;
    }
    getRootNode() {
      return this;
    }
    get ownerDocument() {
      return this;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 };
    }
  }
  /** A pointer or wheel event with the fields OrbitControls and the rig read. */
  const ev = (type: string, f: Record<string, unknown> = {}) =>
    Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 500, clientY: 350, deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...f });
  const atPreset = () => {
    const dom = new EventDom();
    const rig = new CameraRig(dom as unknown as HTMLElement, () => {});
    rig.setAspect(1000 / 700);
    const b = boundsOf([[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }]], 0, 2.4);
    rig.setBounds(b);
    rig.goTo(presetPose('top', b, null, 1000 / 700), true, 0, 'top');
    return { dom, rig, b };
  };

  it('a click (press and release without moving) keeps the preset; a drag or a wheel zoom leaves it (review I1)', () => {
    let { dom, rig } = atPreset();
    const before = rig.camera.position.clone();
    dom.dispatchEvent(ev('pointerdown'));
    dom.dispatchEvent(ev('pointerup'));
    rig.tick(16);
    expect(rig.preset).toBe('top');
    expect(rig.camera.position.distanceTo(before)).toBeLessThan(1e-9);
    rig.dispose();

    ({ dom, rig } = atPreset());
    dom.dispatchEvent(ev('pointerdown'));
    for (let i = 1; i <= 4; i++) dom.dispatchEvent(ev('pointermove', { clientX: 500 + 10 * i }));
    dom.dispatchEvent(ev('pointerup', { clientX: 540 }));
    rig.tick(16);
    expect(rig.preset).toBeNull();
    rig.dispose();

    ({ dom, rig } = atPreset());
    dom.dispatchEvent(ev('wheel', { deltaY: 100 }));
    rig.tick(16);
    expect(rig.preset).toBeNull();
    rig.dispose();
  });

  /** Runs the damping out. */
  const settle = (rig: CameraRig) => {
    for (let i = 1; i <= 400; i++) rig.tick(16 * i);
  };
  const target = (rig: CameraRig) => rig.controls.target.clone();

  it('a two-finger trackpad scroll pans the target and keeps the distance; it leaves the preset', () => {
    const { dom, rig } = atPreset();
    const d0 = dist(rig);
    const t0 = target(rig);
    // Chrome / Safari on macOS: legacy wheelDelta === -3 x delta (trackpad)
    for (let i = 0; i < 5; i++) dom.dispatchEvent(ev('wheel', { deltaX: 6, deltaY: 10, wheelDeltaX: -18, wheelDeltaY: -30 }));
    settle(rig);
    expect(target(rig).distanceTo(t0)).toBeGreaterThan(0.05);
    expect(dist(rig)).toBeCloseTo(d0, 6);
    expect(rig.preset).toBeNull();
    rig.dispose();
  });

  it('a pinch (wheel with ctrlKey) and a mouse wheel dolly: the distance changes, the target stays', () => {
    for (const e of [{ deltaY: -8, ctrlKey: true }, { deltaY: -100, wheelDeltaY: 120 }]) {
      const { dom, rig } = atPreset();
      const d0 = dist(rig);
      const t0 = target(rig);
      dom.dispatchEvent(ev('wheel', e));
      settle(rig);
      expect(dist(rig)).toBeLessThan(d0 - 1e-3);
      expect(target(rig).distanceTo(t0)).toBeLessThan(1e-9);
      expect(rig.preset).toBeNull();
      rig.dispose();
    }
  });

  it('Shift + left drag pans (the target moves, the distance stays); a plain left drag orbits (target kept)', () => {
    let { dom, rig } = atPreset();
    let d0 = dist(rig);
    let t0 = target(rig);
    dom.dispatchEvent(ev('pointerdown', { shiftKey: true }));
    for (let i = 1; i <= 4; i++) dom.dispatchEvent(ev('pointermove', { clientX: 500 + 20 * i, shiftKey: true }));
    dom.dispatchEvent(ev('pointerup', { clientX: 580, shiftKey: true }));
    settle(rig);
    expect(target(rig).distanceTo(t0)).toBeGreaterThan(0.05);
    expect(dist(rig)).toBeCloseTo(d0, 6);
    expect(rig.preset).toBeNull();
    rig.dispose();

    ({ dom, rig } = atPreset());
    d0 = dist(rig);
    t0 = target(rig);
    dom.dispatchEvent(ev('pointerdown'));
    for (let i = 1; i <= 4; i++) dom.dispatchEvent(ev('pointermove', { clientX: 500 + 20 * i }));
    dom.dispatchEvent(ev('pointerup', { clientX: 580 }));
    settle(rig);
    expect(target(rig).distanceTo(t0)).toBeLessThan(1e-9);
    rig.dispose();
  });

  it('the arrow keys on the focused view pan it, leave the preset, and are kept from the plan (defaultPrevented)', () => {
    const { dom, rig } = atPreset();
    const t0 = target(rig);
    const d0 = dist(rig);
    const key = Object.assign(new Event('keydown', { cancelable: true }), { code: 'ArrowRight', key: 'ArrowRight', ctrlKey: false, metaKey: false, shiftKey: false });
    dom.dispatchEvent(key);
    settle(rig);
    expect(key.defaultPrevented).toBe(true);
    expect(target(rig).distanceTo(t0)).toBeGreaterThan(1e-3);
    expect(dist(rig)).toBeCloseTo(d0, 6);
    expect(rig.preset).toBeNull();
    rig.dispose();
  });

  it('a Safari pinch (gesturechange) dollies: fingers apart bring the camera closer', () => {
    const { dom, rig } = atPreset();
    const d0 = dist(rig);
    const gesture = (type: string, scale: number) => Object.assign(new Event(type, { cancelable: true }), { scale, clientX: 500, clientY: 350 });
    dom.dispatchEvent(gesture('gesturestart', 1));
    const change = gesture('gesturechange', 1.25);
    dom.dispatchEvent(change);
    dom.dispatchEvent(gesture('gestureend', 1.25));
    settle(rig);
    expect(change.defaultPrevented).toBe(true);
    expect(dist(rig)).toBeCloseTo(d0 / 1.25, 3);
    expect(rig.preset).toBeNull();
    rig.dispose();
  });

  it('the orbit bound follows a smaller level once the camera is closer, never pulling the camera in (review M5)', () => {
    const { rig } = atPreset();
    const big = boundsOf([[{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }]], 0, 2.4);
    const small = boundsOf([[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }]], 0, 2.4);
    rig.setBounds(big);
    rig.goTo(presetPose('overview', big, null, rig.camera.aspect), true, 0, 'overview');
    const far = dist(rig);
    expect(rig.controls.maxDistance).toBeGreaterThanOrEqual(far);
    // the level shrinks: the camera far away is not pulled in
    rig.setBounds(small);
    rig.tick(16);
    expect(dist(rig)).toBeCloseTo(far, 6);
    // the camera comes close: the bound is the small level's, not the big one's
    rig.goTo(presetPose('overview', small, null, rig.camera.aspect), true, 32, 'overview');
    rig.tick(48);
    const fit = presetPose('overview', small, null, rig.camera.aspect);
    const fitted = Math.hypot(fit.pos[0] - fit.tgt[0], fit.pos[1] - fit.tgt[1], fit.pos[2] - fit.tgt[2]);
    expect(rig.controls.maxDistance).toBeCloseTo(Math.max(maxDistance(small), 1.5 * fitted), 6);
    expect(rig.controls.maxDistance).toBeLessThan(far);
    rig.dispose();
  });

  it('in a narrow view, a new box (structure edit) never pulls the fitted camera in', () => {
    const rig = new CameraRig(fakeDom(), () => {});
    rig.setAspect(0.3);
    const b = boundsOf([[{ x: -20, y: -20 }, { x: 420, y: -20 }, { x: 420, y: 420 }, { x: -20, y: 420 }]], 0, 2.4);
    rig.goTo(presetPose('overview', b, null, 0.3), true, 0, 'overview');
    const fitted = dist(rig);
    rig.setBounds(b);
    rig.tick(0);
    rig.tick(16);
    expect(dist(rig)).toBeCloseTo(fitted, 6);
    expect(rig.preset).toBe('overview');
    // a smaller box: still no pull
    rig.setBounds(boundsOf([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]], 0, 2.4));
    rig.tick(32);
    expect(dist(rig)).toBeCloseTo(fitted, 6);
    rig.dispose();
  });

  it('the overview of the active level and its lower levels frames both boxes', () => {
    const a = boundsOf([[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }]], 2.7, 5.1);
    const low = boundsOf([[{ x: -300, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 900 }]], 0, 2.5);
    const u = unionBounds(a, low);
    expect(u).toEqual({ minX: -3, maxX: 4, minZ: 0, maxZ: 9, minY: 0, maxY: 5.1 });
  });
});

describe('targeted updates (spec 8.3)', () => {
  it('moving an object or editing a cupboard keeps the structure; each cupboard is rebuilt alone and its geometries freed', () => {
    const level = attic();
    const right = findWall(level, 410, -10, 410, 410);
    const c2 = createCupboard(findWall(level, -10, 410, -10, -10), 100, 'right', { width: 120 });
    level.cupboards[c2.id] = c2;
    const c1 = Object.values(level.cupboards).find((c) => c.wallId === right)!;
    const layer = new CupboardLayer(createMaterials(null));
    expect(layer.sync(level, deriveLevel(level))).toBe(true);
    expect(layer.buildCount).toBe(2);
    const g1 = layer.groupOf(c1.id)!;
    const g2 = layer.groupOf(c2.id)!;
    expect(g1.name).toBe(`cupboard:${c1.id}`);

    // an object moves: same structure, same cupboards
    const bed = place('bed-160', 200, 200);
    const moved: Level = { ...level, objects: { [bed.id]: bed } };
    expect(sameStructure(level, moved)).toBe(true);
    expect(layer.sync(moved, deriveLevel(moved))).toBe(false);
    expect(layer.buildCount).toBe(2);

    // the second cupboard gets narrower: structure unchanged, only it is rebuilt
    const spies: Array<ReturnType<typeof vi.spyOn>> = [];
    g2.traverse((n) => {
      if (n instanceof Mesh) spies.push(vi.spyOn(n.geometry, 'dispose'));
    });
    const edited: Level = { ...moved, cupboards: { ...moved.cupboards, [c2.id]: { ...c2, width: 90 } } };
    expect(sameStructure(moved, edited)).toBe(true);
    expect(layer.sync(edited, deriveLevel(edited))).toBe(true);
    expect(layer.buildCount).toBe(3);
    expect(layer.groupOf(c1.id)).toBe(g1);
    expect(layer.groupOf(c2.id)).not.toBe(g2);
    expect(g2.parent).toBeNull();
    expect(spies.length).toBeGreaterThan(0);
    for (const s of spies) expect(s).toHaveBeenCalled();

    // a slope change is a structure change (and rebuilds the ceiling-mode cupboard under it only)
    const slopes = { ...edited.slopes };
    const sid = Object.keys(slopes)[0]!;
    slopes[sid] = { ...slopes[sid]!, heightEnd: 160 };
    const sloped: Level = { ...edited, slopes };
    expect(sameStructure(edited, sloped)).toBe(false);
    const g2b = layer.groupOf(c2.id);
    layer.sync(sloped, deriveLevel(sloped));
    expect(layer.buildCount).toBe(4);
    expect(layer.groupOf(c2.id)).toBe(g2b);
    expect(layer.groupOf(c1.id)).not.toBe(g1);
    layer.dispose();
    expect(layer.root.children).toHaveLength(0);
  });

  it('cupboard materials of a color no cupboard uses any more are disposed, not while a tinted cupboard holds them (review M4)', () => {
    const level = attic();
    const c2 = createCupboard(findWall(level, -10, 410, -10, -10), 100, 'right', { width: 120, color: '#336699' });
    level.cupboards[c2.id] = c2;
    const mats = createMaterials(null);
    const layer = new CupboardLayer(mats);
    layer.sync(level, deriveLevel(level));
    const blue = mats.cupboard('#336699');
    const spy = vi.spyOn(blue, 'dispose');
    const tints = new AlertTints();
    tints.sync(new Map([[layer.groupOf(c2.id)! as Object3D, 'error' as const]]));
    // recolored while in alert: the tint still holds the blue original
    const l2: Level = { ...level, cupboards: { ...level.cupboards, [c2.id]: { ...c2, color: '#996633' } } };
    expect(layer.sync(l2, deriveLevel(l2))).toBe(true);
    tints.sync(new Map());
    layer.purge([]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(mats.cupboard('#336699')).not.toBe(blue);
    // the default color, still used by the other cupboard, is kept
    const beige = mats.cupboard('#e8e1d4');
    layer.purge([]);
    expect(mats.cupboard('#e8e1d4')).toBe(beige);
    layer.dispose();
  });

  it('a cupboard tinted by an alert keeps its original material through a purge', () => {
    const level = attic();
    const mats = createMaterials(null);
    const layer = new CupboardLayer(mats);
    layer.sync(level, deriveLevel(level));
    const c = Object.values(level.cupboards)[0]!;
    const beige = mats.cupboard('#e8e1d4');
    const spy = vi.spyOn(beige, 'dispose');
    const tints = new AlertTints();
    tints.sync(new Map([[layer.groupOf(c.id)! as Object3D, 'error' as const]]));
    layer.purge(tints.originals());
    expect(spy).not.toHaveBeenCalled();
    tints.sync(new Map());
    expect(mats.cupboard('#e8e1d4')).toBe(beige);
    layer.dispose();
  });

  it('an object without a name gets no label; the kit drops the materials no object uses any more, not those of a tinted object', () => {
    const made: string[] = [];
    const kit = new Kit();
    const layer = new FurnitureLayer(kit, { make: (t) => (made.push(t), new Group()), free: () => {} });
    const named = place('pouf', 100, 100);
    const unnamed = place('pouf', 200, 100, { name: '  ' });
    const level = levelFromWalls([]);
    level.objects = { [named.id]: named, [unnamed.id]: unnamed };
    layer.sync(level, {}, true);
    expect(made).toEqual(['Pouf']);

    const material = () => {
      let m: MeshStandardMaterial | null = null;
      layer.groupOf(named.id)!.traverse((n) => {
        if (n instanceof Mesh && !m) m = n.material as MeshStandardMaterial;
      });
      return m!;
    };
    // the named pouf in alert: its original material is held by the tint
    const tints = new AlertTints();
    const before = kit.size;
    // recolor both: the old color is used by nobody but the tinted original
    tints.sync(new Map([[layer.groupOf(named.id)! as Object3D, 'error' as const]]));
    const original = [...tints.originals()][0]! as MeshStandardMaterial;
    const spy = vi.spyOn(original, 'dispose');
    const l2: Level = { ...level, objects: { [named.id]: named, [unnamed.id]: { ...unnamed, color: '#123456' } } };
    expect(layer.sync(l2, {}, true)).toBe(true);
    layer.purge(tints.originals());
    expect(spy).not.toHaveBeenCalled();
    // the alert goes, the named pouf is recolored too: the old material is now unused, disposed and forgotten
    tints.sync(new Map());
    const l3: Level = { ...l2, objects: { [named.id]: { ...named, color: '#123456' }, [unnamed.id]: l2.objects[unnamed.id]! } };
    layer.sync(l3, {}, true);
    layer.purge(tints.originals());
    expect(spy).toHaveBeenCalled();
    expect(kit.size).toBeLessThanOrEqual(before);
    expect(`#${material().color.getHexString()}`).toBe('#123456');
    // and asking for the old color again gives a fresh material, not the disposed one
    expect(kit.mat(`#${original.color.getHexString()}`)).not.toBe(original);
    layer.dispose();
  });
});

describe('picking and selection outline', () => {
  it('onClick: a press and release in place is a click; a second finger down during the gesture (pinch) is not (review M3)', () => {
    const dom = new EventTarget() as EventTarget & { getBoundingClientRect(): object };
    dom.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
    const e = (type: string, id: number, x = 100, y = 50, primary = id === 1) =>
      Object.assign(new Event(type), { pointerId: id, button: 0, isPrimary: primary, clientX: x, clientY: y });
    const clicks: Array<{ x: number; y: number }> = [];
    const off = onClick(dom as unknown as HTMLElement, (p) => clicks.push(p));
    dom.dispatchEvent(e('pointerdown', 1));
    dom.dispatchEvent(e('pointerup', 1));
    expect(clicks).toEqual([{ x: 0, y: 0 }]);
    // pinch: one finger still, the other moves; the still one is released first, then the other
    dom.dispatchEvent(e('pointerdown', 1));
    dom.dispatchEvent(e('pointerdown', 2, 150, 50));
    dom.dispatchEvent(e('pointermove', 2, 170, 50));
    dom.dispatchEvent(e('pointerup', 1));
    dom.dispatchEvent(e('pointerup', 2, 170, 50));
    // and the same with the still finger released last
    dom.dispatchEvent(e('pointerdown', 1));
    dom.dispatchEvent(e('pointerdown', 2, 150, 50));
    dom.dispatchEvent(e('pointerup', 2, 150, 50));
    dom.dispatchEvent(e('pointerup', 1));
    // a mouse held down while a finger taps (both primary pointers of their own type)
    dom.dispatchEvent(e('pointerdown', 1));
    dom.dispatchEvent(e('pointerdown', 3, 150, 50, true));
    dom.dispatchEvent(e('pointerup', 3, 150, 50, true));
    dom.dispatchEvent(e('pointerup', 1));
    expect(clicks).toHaveLength(1);
    // after the gesture, a plain click works again
    dom.dispatchEvent(e('pointerdown', 1));
    dom.dispatchEvent(e('pointerup', 1));
    expect(clicks).toHaveLength(2);
    off();
  });

  /** A 4 x 4 m room with a bed in the middle, the bed group, and the level view. */
  function scene() {
    const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
    const bed = place('bed-160', 200, 200);
    level.objects[bed.id] = bed;
    const view = buildLevelView(level, deriveLevel(level), createMaterials(null));
    const layer = new FurnitureLayer(new Kit(), null);
    layer.sync(level, {}, false);
    const root = new Group();
    root.add(view.root, layer.root);
    root.updateMatrixWorld(true);
    return { level, bed, view, layer, roots: [view.root, layer.root] };
  }
  const camera = (pos: [number, number, number], tgt: [number, number, number]) => {
    const c = new PerspectiveCamera(45, 1, 0.05, 200);
    c.position.set(...pos);
    c.lookAt(...tgt);
    c.updateMatrixWorld(true);
    return c;
  };

  it('a click on the bed from above selects it; on the floor, nothing', () => {
    const { bed, roots } = scene();
    const cam = camera([2, 6, 2.01], [2, 0, 2]);
    expect(pickAt(cam, { x: 0, y: 0 }, roots)).toEqual({ kind: 'object', id: bed.id });
    expect(pickAt(cam, { x: 0.9, y: 0.9 }, roots)).toBeNull();
  });

  it('a wall in front of the bed hides it, unless the cut-away hid the wall', () => {
    const { level, bed, view, roots } = scene();
    const cam = camera([-3, 0.3, 2], [2, 0.3, 2]);
    expect(pickAt(cam, { x: 0, y: 0 }, roots)).toBeNull();
    view.wallGroups.get(findWall(level, -10, 410, -10, -10))!.visible = false;
    expect(pickAt(cam, { x: 0, y: 0 }, roots)).toEqual({ kind: 'object', id: bed.id });
  });

  it('beams and cupboards are picked by their ids (cupboards from the CupboardLayer, as in the app)', () => {
    const level = attic();
    const b = createBeam({ x: 191, y: 0 }, { x: 191, y: 400 });
    level.beams[b.id] = b;
    const d = deriveLevel(level);
    const mats = createMaterials(null);
    const view = buildLevelView(level, d, mats, { cupboards: false });
    const cupboards = new CupboardLayer(mats);
    cupboards.sync(level, d);
    view.root.updateMatrixWorld(true);
    cupboards.root.updateMatrixWorld(true);
    const roots = [view.root, cupboards.root];
    const c = Object.values(level.cupboards)[0]!;
    expect(meshCount(view.cupboards)).toBe(0);
    // looking at the cupboards along the right wall from inside the room
    expect(pickAt(camera([1.5, 1, 2], [4, 1, 2]), { x: 0, y: 0 }, roots)).toEqual({ kind: 'cupboard', id: c.id });
    // looking up at the beam (x 1.85 .. 1.97, under the 2.40 m ceiling) from below
    expect(pickAt(camera([1.91, 1, 2.01], [1.91, 2.4, 2]), { x: 0, y: 0 }, roots)).toEqual({ kind: 'beam', id: b.id });
    cupboards.dispose();
  });

  it('outlines the selected object with a blue box that follows it, and frees it when deselected or rebuilt', () => {
    const { layer, bed, level } = scene();
    const outline = new SelectionOutline();
    const g = layer.groupOf(bed.id)!;
    outline.sync([{ root: g, box: true }]);
    const lines = g.children.filter((n): n is LineSegments => n instanceof LineSegments);
    expect(lines).toHaveLength(1);
    expect(`#${(lines[0]!.material as LineBasicMaterial).color.getHexString()}`).toBe(SELECTION_COLOR);
    // its box: the bed (1.60 x 2.00 m) plus 1 cm on each side
    lines[0]!.geometry.computeBoundingBox();
    const size = lines[0]!.geometry.boundingBox!.max.clone().sub(lines[0]!.geometry.boundingBox!.min);
    expect(size.x).toBeCloseTo(1.62, 2);
    expect(size.z).toBeCloseTo(2.02, 2);
    const spy = vi.spyOn(lines[0]!.geometry, 'dispose');
    // the bed moves: a new group, the old outline is freed and the new group outlined
    layer.sync({ ...level, objects: { [bed.id]: { ...bed, x: 150 } } }, {}, false);
    const g2 = layer.groupOf(bed.id)!;
    outline.sync([{ root: g2, box: true }]);
    expect(spy).toHaveBeenCalled();
    expect(outline.outlined).toEqual([g2]);
    outline.sync([]);
    expect(g2.children.some((n) => n instanceof LineSegments)).toBe(false);
    outline.dispose();
  });
});
