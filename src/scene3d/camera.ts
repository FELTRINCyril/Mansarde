import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pointInRing, vertexCentroid } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import type { Ring } from '@/core/model/types';

export type Preset = 'overview' | 'top' | 'room';

/** Box of a level in meters: x, z = plan y, y up from its floor (elevation) to the top of its walls. */
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }

export type V3 = [number, number, number];
export interface Pose { pos: V3; tgt: V3 }

/** Duration of the animated presets (ms, spec 8.3). */
export const PRESET_MS = 750;
/** Height of the eye above the floor in the room preset (m, spec 8.3) and of the point it looks at. */
const EYE = 1.6;
const ROOM_TARGET = 0.9;
/** Vertical field of view of the camera (degrees, spec 8.3). */
export const FOV = 45;
/** Share of the view the level takes on its limiting axis in the overview and top presets. */
export const FIT_MARGIN = 0.85;

/**
 * Directions of plan-chambre's poses, from the target to the camera: overview from (-1.7, 4.6, 6.1)
 * towards (2, 0.6, 2), top from (2, 9.5, 2.6) towards (2, 0, 2). The distance is fitted to the level.
 */
const OVERVIEW_DIR: V3 = [-3.7, 4.0, 4.1];
const TOP_DIR: V3 = [0, 9.5, 0.6];

/**
 * Box of the given plan rings (cm), in meters, from `bottom` to `top` (m); a 4 x 4 m square at the
 * origin when there is nothing.
 */
export function boundsOf(rings: Ring[], bottom = 0, top = 2.5): Bounds {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const r of rings) {
    for (const p of r) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x / 100);
      maxX = Math.max(maxX, p.x / 100);
      minZ = Math.min(minZ, p.y / 100);
      maxZ = Math.max(maxZ, p.y / 100);
    }
  }
  const minY = Number.isFinite(bottom) ? bottom : 0;
  const maxY = Number.isFinite(top) && top > minY ? top : minY + 2.5;
  if (!(maxX >= minX)) return { minX: 0, maxX: 4, minZ: 0, maxZ: 4, minY, maxY };
  return { minX, maxX, minZ, maxZ, minY, maxY };
}

/** Largest distance the orbit allows (m); CameraRig.goTo raises it for a preset farther away. */
export function maxDistance(b: Bounds): number {
  return Math.max(16, 4 * Math.max(b.maxX - b.minX, b.maxZ - b.minZ, b.maxY - b.minY));
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addScaled = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The 8 corners of a box. */
export function corners(b: Bounds): V3[] {
  const out: V3[] = [];
  for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) out.push([x, y, z]);
  return out;
}

/**
 * Camera looking along -dir (dir: from the target to the camera) that frames the box: the distance
 * puts the farthest projected corner at FIT_MARGIN of the view on the limiting axis, using both the
 * vertical (FOV) and the horizontal (FOV and aspect) field; the target is shifted in the view plane
 * so that the projected box is centered. Exact for the corners (perspective projection), a few
 * centering passes.
 */
export function fitPose(b: Bounds, direction: V3, aspect: number): Pose {
  const dir = norm(direction);
  const f: V3 = [-dir[0], -dir[1], -dir[2]];
  let r = cross(f, [0, 1, 0]);
  r = Math.hypot(...r) < 1e-9 ? [1, 0, 0] : norm(r);
  const u = cross(r, f);
  const tanV = Math.tan((FOV * Math.PI) / 360);
  const tanH = tanV * (aspect > 0 && Number.isFinite(aspect) ? aspect : 1);
  const cs = corners(b);
  let tgt: V3 = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
  const distance = (t: V3): number => {
    let d = 0;
    for (const c of cs) {
      const v = sub(c, t);
      const depth = dot(v, f);
      d = Math.max(d, Math.abs(dot(v, r)) / (FIT_MARGIN * tanH) - depth, Math.abs(dot(v, u)) / (FIT_MARGIN * tanV) - depth, 0.1 - depth);
    }
    return d;
  };
  let d = distance(tgt);
  for (let pass = 0; pass < 4; pass++) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cs) {
      const v = sub(c, tgt);
      const z = d + dot(v, f);
      const x = dot(v, r) / (z * tanH);
      const y = dot(v, u) / (z * tanV);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    tgt = addScaled(addScaled(tgt, r, ((minX + maxX) / 2) * d * tanH), u, ((minY + maxY) / 2) * d * tanV);
    d = distance(tgt);
  }
  return { pos: addScaled(tgt, dir, d), tgt };
}

/**
 * Pose of a preset (spec 8.3) for a view of the given aspect (width / height). 'overview' and
 * 'top' look along plan-chambre's directions and fit the level's box (footprint and height, at
 * its elevation); 'room' puts the eye 1.60 m above the floor of the level inside the room, towards
 * its farthest corner from the center, looking at its center; without a room it is the overview.
 */
export function presetPose(p: Preset, b: Bounds, room: Room | null = null, aspect = 16 / 9): Pose {
  if (p === 'top') return fitPose(b, TOP_DIR, aspect);
  if (p === 'room' && room) {
    const c = room.labelPoint ?? vertexCentroid(room.ring);
    let far = room.ring[0]!;
    for (const q of room.ring) if (Math.hypot(q.x - c.x, q.y - c.y) > Math.hypot(far.x - c.x, far.y - c.y)) far = q;
    // the eye from 75 % of the way towards that corner, closer to the center until it is inside
    let eye = c;
    for (let t = 0.75; t > 0; t -= 0.05) {
      const e = { x: c.x + (far.x - c.x) * t, y: c.y + (far.y - c.y) * t };
      if (pointInRing(e, room.ring)) {
        eye = e;
        break;
      }
    }
    return { pos: [eye.x / 100, b.minY + EYE, eye.y / 100], tgt: [c.x / 100, b.minY + ROOM_TARGET, c.y / 100] };
  }
  return fitPose(b, OVERVIEW_DIR, aspect);
}

/** Ease in-out cubic of plan-chambre, k in [0, 1]. */
export const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Distance bounds and pole angle of the orbit (spec 8.3, plan-chambre). */
const MIN_DISTANCE = 0.3;
const MAX_POLAR = Math.PI * 0.495;

/**
 * PerspectiveCamera(45) and damped OrbitControls (polar angle at most 0.495 pi, distance bounded
 * by the level size), and the animated presets. `tick` advances the animation and the damping; it
 * returns true while the camera still moves, so that the view renders only then (render on demand).
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(45, 1, 0.05, 200);
  readonly controls: OrbitControls;
  private tween: { t0: number; from: Pose; to: Pose } | null = null;

  constructor(dom: HTMLElement, onChange: () => void) {
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = MAX_POLAR;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = 16;
    this.controls.addEventListener('change', onChange);
    // a user gesture stops the animation (plan-chambre)
    this.controls.addEventListener('start', () => {
      this.tween = null;
    });
  }

  setBounds(b: Bounds): void {
    this.controls.maxDistance = maxDistance(b);
  }

  /** Moves to a pose, animated over PRESET_MS unless `instant` or the user prefers reduced motion. */
  goTo(to: Pose, instant: boolean, now: number): void {
    // a preset fitted to a large level or a narrow view may lie beyond the orbit bound
    const dist = Math.hypot(to.pos[0] - to.tgt[0], to.pos[1] - to.tgt[1], to.pos[2] - to.tgt[2]);
    this.controls.maxDistance = Math.max(this.controls.maxDistance, 1.5 * dist);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduce) {
      this.tween = null;
      this.camera.position.set(...to.pos);
      this.controls.target.set(...to.tgt);
      this.controls.update();
      return;
    }
    const from: Pose = { pos: this.camera.position.toArray() as V3, tgt: this.controls.target.toArray() as V3 };
    this.tween = { t0: now, from, to };
  }

  get animating(): boolean {
    return this.tween !== null;
  }

  /** One frame: the animation step, then the controls (damping). True while something moves. */
  tick(now: number): boolean {
    let moving = false;
    if (this.tween) {
      const { t0, from, to } = this.tween;
      const k = Math.min(1, Math.max(0, (now - t0) / PRESET_MS));
      const e = ease(k);
      this.camera.position.lerpVectors(new Vector3(...from.pos), new Vector3(...to.pos), e);
      this.controls.target.lerpVectors(new Vector3(...from.tgt), new Vector3(...to.tgt), e);
      if (k >= 1) this.tween = null;
      else moving = true;
    }
    if (this.controls.update()) moving = true;
    return moving;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
