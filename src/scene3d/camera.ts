import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pointInRing, vertexCentroid } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import type { Ring } from '@/core/model/types';

export type Preset = 'overview' | 'top' | 'room';

/** Horizontal extent of a level in meters (x, z = plan y) and its height (m). */
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

export type V3 = [number, number, number];
export interface Pose { pos: V3; tgt: V3 }

/** Duration of the animated presets (ms, spec 8.3). */
export const PRESET_MS = 750;
/** Height of the eye in the room preset (m, spec 8.3) and of the point it looks at. */
const EYE = 1.6;
const ROOM_TARGET = 0.9;

/**
 * plan-chambre frames a 4 m room whose walls (15 cm) give a 4.30 m extent with these poses; other
 * levels are scaled by their own extent (never below a quarter of it, for a tiny level).
 */
const REF_EXTENT = 4.3;
const REF_OVERVIEW = { offset: [-3.7, 4.6, 4.1] as V3, targetY: 0.6 };
const REF_TOP = { height: 9.5, back: 0.6 };

/** Bounds of the given plan rings (cm), in meters; a 4 x 4 m square at the origin when there is nothing. */
export function boundsOf(rings: Ring[]): Bounds {
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
  if (!(maxX >= minX)) return { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
  return { minX, maxX, minZ, maxZ };
}

const scaleOf = (b: Bounds): number => Math.max(0.25, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / REF_EXTENT);
const centerOf = (b: Bounds): [number, number] => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];

/** Largest distance the orbit allows (m): far enough to see the whole level from the top preset. */
export function maxDistance(b: Bounds): number {
  return Math.max(16, 4 * REF_TOP.height * scaleOf(b));
}

/** Aspect ratio (width / height) of plan-chambre's 3D view, for which its poses were chosen. */
export const REF_ASPECT = 1224 / 760;

/**
 * Pose of a preset (spec 8.3). 'overview' and 'top' are those of plan-chambre scaled to the level,
 * and moved back from their target in a view narrower than plan-chambre's (`aspect`), so that the
 * level still fits across; 'room' puts the eye at 1.60 m inside the room, towards its farthest
 * corner from the center, looking at its center; without a room it is the overview.
 */
export function presetPose(p: Preset, b: Bounds, room: Room | null = null, aspect = REF_ASPECT): Pose {
  const k = scaleOf(b);
  const [cx, cz] = centerOf(b);
  const away = (pose: Pose): Pose => {
    const f = aspect > 0 && Number.isFinite(aspect) ? Math.max(1, REF_ASPECT / aspect) : 1;
    return { pos: pose.pos.map((v, i) => pose.tgt[i]! + (v - pose.tgt[i]!) * f) as V3, tgt: pose.tgt };
  };
  if (p === 'top') return away({ pos: [cx, REF_TOP.height * k, cz + REF_TOP.back * k], tgt: [cx, 0, cz] });
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
    return { pos: [eye.x / 100, EYE, eye.y / 100], tgt: [c.x / 100, ROOM_TARGET, c.y / 100] };
  }
  const o = REF_OVERVIEW.offset;
  return away({ pos: [cx + o[0] * k, o[1] * k, cz + o[2] * k], tgt: [cx, REF_OVERVIEW.targetY, cz] });
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
