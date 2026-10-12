import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { objectFootprint, objectShape } from '@/core/geometry/objects';
import { distanceToRing, pointInRing, ringEdges, vertexCentroid } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import { segmentIntersection } from '@/core/geometry/vec';
import { CLICK_SLOP } from './picking';
import type { CustomObjectDef, Id, Level, Ring, Vec2 } from '@/core/model/types';

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

/** The box around both boxes (the active level and the lower levels shown under it). */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
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

/** Objects whose top is above this height (cm) block the eye of the room preset (task 12 review). */
export const TALL = 120;
/** Objects whose top is above this height (cm) would fill the foreground when the eye is next to them. */
export const MEDIUM = 60;
/** The eye prefers to be this far (cm) from medium objects (a chair back right under the eye hides the room). */
const NEAR = 45;
/** The eye of the room preset is this far (cm) from the walls, and this far from tall obstacles. */
const EYE_INSET = 40;
const OBSTACLE_GAP = 15;
/** Space (cm) kept between the eye and the ceiling above it. */
const HEAD_ROOM = 25;
/** Spacing (cm) of the candidate eye positions along the room outline. */
const EYE_STEP = 25;
/** What a crowded eye position loses (cm of distance to the target) against a free one. */
const CROWDED_PENALTY = 100;

/**
 * What the room preset avoids: the footprints (plan, cm) of everything taller than TALL (objects
 * by their top, cupboards; the room islands come with the room), and the ceiling height at a
 * point (cm), so that the eye stays under a slope.
 */
export interface RoomSurroundings { obstacles: Ring[]; ceiling?: (p: Vec2) => number; medium?: Ring[] }

/** Footprints of the objects and cupboards of a level whose top is above `above` (cm, TALL by default). */
export function tallFootprints(level: Level, customObjects: Record<Id, CustomObjectDef>, cupboards: Map<Id, Ring>, above = TALL): Ring[] {
  const out: Ring[] = [];
  for (const o of Object.values(level.objects)) {
    if (o.elevation + o.height > above) out.push(objectFootprint(o, objectShape(o, customObjects)));
  }
  for (const [id, ring] of cupboards) {
    const c = level.cupboards[id];
    if (c && (c.heightMode === 'ceiling' || c.height > above)) out.push(ring);
  }
  return out;
}

const meets = (p: Vec2, q: Vec2, ring: Ring): boolean =>
  pointInRing(p, ring) || pointInRing(q, ring) || ringEdges(ring).some(([a, b]) => segmentIntersection(p, q, a, b) !== null);

/**
 * Eye of the room preset (plan, cm): candidates every EYE_STEP along the room outline, each moved
 * towards the target until it is EYE_INSET from the walls; kept when it is clear of the tall
 * obstacles, under a ceiling high enough for the eye and, preferably, with a free line of sight to
 * the target. The farthest from the target wins (the widest view of the room), a position next to
 * a medium object counting CROWDED_PENALTY less; without any acceptable candidate, the conditions
 * are dropped one by one (line of sight, then obstacles).
 */
export function roomEye(room: Pick<Room, 'ring' | 'islands'>, target: Vec2, around: RoomSurroundings = { obstacles: [] }): Vec2 {
  const ring = room.ring;
  const blocks = [...around.obstacles, ...room.islands];
  const inRoom = (p: Vec2) => pointInRing(p, ring) && !room.islands.some((i) => pointInRing(p, i));
  const candidates: Array<{ p: Vec2; clear: boolean; free: boolean; far: number }> = [];
  for (const [a, b] of ringEdges(ring)) {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(l / EYE_STEP));
    for (let i = 0; i < n; i++) {
      const s = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      const far = Math.hypot(target.x - s.x, target.y - s.y);
      if (far < 1) continue;
      // along the line towards the target until the eye is EYE_INSET away from every wall
      let eye: Vec2 | null = null;
      for (let k = EYE_INSET; k < far; k += 10) {
        const p = { x: s.x + ((target.x - s.x) * k) / far, y: s.y + ((target.y - s.y) * k) / far };
        if (inRoom(p) && distanceToRing(p, ring) >= EYE_INSET - 1e-6) {
          eye = p;
          break;
        }
      }
      if (!eye) continue;
      if (around.ceiling && around.ceiling(eye) < EYE * 100 + HEAD_ROOM) continue;
      const free = blocks.every((r) => !pointInRing(eye, r) && distanceToRing(eye, r) >= OBSTACLE_GAP);
      const clear = free && blocks.every((r) => !meets(eye, target, r));
      // next to a medium object (chair back, desk), the eye is worth less: it would fill the foreground
      const crowded = (around.medium ?? []).some((r) => pointInRing(eye, r) || distanceToRing(eye, r) < NEAR);
      candidates.push({ p: eye, clear, free, far: Math.hypot(target.x - eye.x, target.y - eye.y) - (crowded ? CROWDED_PENALTY : 0) });
    }
  }
  for (const pick of [(c: (typeof candidates)[number]) => c.clear, (c: (typeof candidates)[number]) => c.free, () => true]) {
    let best: (typeof candidates)[number] | null = null;
    for (const c of candidates) if (pick(c) && (!best || c.far > best.far + 1e-6)) best = c;
    if (best) return best.p;
  }
  return legacyEye(ring, target);
}

/** The eye of a room too small for the inset: 75 % of the way to its farthest corner, closer until inside. */
function legacyEye(ring: Ring, c: Vec2): Vec2 {
  let far = ring[0]!;
  for (const q of ring) if (Math.hypot(q.x - c.x, q.y - c.y) > Math.hypot(far.x - c.x, far.y - c.y)) far = q;
  for (let t = 0.75; t > 0; t -= 0.05) {
    const e = { x: c.x + (far.x - c.x) * t, y: c.y + (far.y - c.y) * t };
    if (pointInRing(e, ring)) return e;
  }
  return c;
}

/**
 * Pose of a preset (spec 8.3) for a view of the given aspect (width / height). 'overview' and
 * 'top' look along plan-chambre's directions and fit the box (footprint and height, at its
 * elevation); 'room' puts the eye 1.60 m above the floor of the level (b.minY) inside the room
 * (roomEye: near its outline, clear of tall furniture, under the ceiling), looking at its center;
 * without a room it is the overview.
 */
export function presetPose(p: Preset, b: Bounds, room: Room | null = null, aspect = 16 / 9, around?: RoomSurroundings): Pose {
  if (p === 'top') return fitPose(b, TOP_DIR, aspect);
  if (p === 'room' && room) {
    const c = room.labelPoint ?? vertexCentroid(room.ring);
    const eye = roomEye(room, c, around);
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
  /**
   * The preset the camera was last sent to, until the user really moves the camera (a drag beyond
   * CLICK_SLOP, a pinch, a wheel zoom; a click to select does not): a view left on a fitted preset
   * is fitted again when its size changes (split separator, window).
   */
  preset: Preset | null = null;
  /** Orbit bound of the level (maxDistance(b), 1.5 x its fitted overview) and of the last preset (1.5 x its distance). */
  private levelBound = 16;
  private presetBound = 0;
  private readonly pressed = new Map<number, { x: number; y: number }>();
  private readonly offDom: () => void;

  constructor(dom: HTMLElement, onChange: () => void) {
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = MAX_POLAR;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = 16;
    this.controls.addEventListener('change', onChange);
    // OrbitControls emits 'start' on every press, a click included: the rig watches the pointer
    // itself and leaves the preset (and stops the animation, as plan-chambre) only on a real move
    const down = (e: PointerEvent) => {
      this.pressed.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pressed.size > 1) this.userMoved();
    };
    const move = (e: PointerEvent) => {
      const p = this.pressed.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) this.userMoved();
    };
    const up = (e: PointerEvent) => {
      this.pressed.delete(e.pointerId);
    };
    const wheel = () => this.userMoved();
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel);
    this.offDom = () => {
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
    };
  }

  /** The user moves the camera: the animation stops and the camera leaves its preset. */
  private userMoved(): void {
    this.tween = null;
    this.preset = null;
  }

  /** Distance (m) from the camera, or from where its animation ends, to its target. */
  get distance(): number {
    const to = this.tween?.to;
    const d = (p: V3, t: V3) => Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]);
    const now = d(this.camera.position.toArray() as V3, this.controls.target.toArray() as V3);
    return to ? Math.max(now, d(to.pos, to.tgt)) : now;
  }

  /**
   * The orbit bound: the level's and the last preset's, but never less than where the camera is
   * (else OrbitControls would pull the camera in at its next update: a jump, the house cropped).
   * A bound left above them by a farther camera comes down as the camera comes closer (tick).
   */
  private clampBound(): void {
    this.controls.maxDistance = Math.max(this.levelBound, this.presetBound, this.distance);
  }

  /**
   * Orbit bound for a new box (after a structure change): maxDistance(b), but at least the fitted
   * overview distance for this view with the 1.5 margin of goTo; it replaces the bound of the
   * previous box (a smaller level gets a smaller bound) without pulling the camera in.
   */
  setBounds(b: Bounds): void {
    const fit = presetPose('overview', b, null, this.camera.aspect);
    const fitted = Math.hypot(fit.pos[0] - fit.tgt[0], fit.pos[1] - fit.tgt[1], fit.pos[2] - fit.tgt[2]);
    this.levelBound = Math.max(maxDistance(b), 1.5 * fitted);
    this.presetBound = 0;
    this.clampBound();
  }

  /** Moves to a pose, animated over PRESET_MS unless `instant` or the user prefers reduced motion. */
  goTo(to: Pose, instant: boolean, now: number, preset: Preset | null = null): void {
    this.preset = preset;
    // a preset fitted to a large level or a narrow view may lie beyond the orbit bound
    const dist = Math.hypot(to.pos[0] - to.tgt[0], to.pos[1] - to.tgt[1], to.pos[2] - to.tgt[2]);
    this.presetBound = 1.5 * dist;
    this.controls.maxDistance = Math.max(this.controls.maxDistance, this.presetBound);
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
    // a bound kept for a farther camera follows it down to the level's and preset's
    if (!this.tween && this.controls.maxDistance > Math.max(this.levelBound, this.presetBound)) this.clampBound();
    return moving;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // a narrower view may need a farther camera: never clamp the current one
    this.clampBound();
  }

  dispose(): void {
    this.offDom();
    this.controls.dispose();
  }
}
