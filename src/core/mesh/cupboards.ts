import type { Cupboard, Level, Vec2 } from '../model/types';
import { cupboardDoors, cupboardFrame, cupboardTopProfile, type CupboardFrame, type ProfilePoint } from '../geometry/cupboards';
import { signedArea } from '../geometry/polygon';
import { add, dist, scale } from '../geometry/vec';
import { MeshBuilder, at3, type V3 } from './builder';
import { triangulate } from './triangulate';
import type { CupboardParts, MeshData } from './types';

/** Joint around each door (cm): 1 cm between two doors, half of it at the ends and under the top. */
const JOINT = 1;
/** Thickness of a door (cm); sliding doors run on two rails, one door thickness apart. */
const DOOR_THICKNESS = 2;
/** The plinth stands back from the front by this much (cm). */
const PLINTH_RECESS = 5;
const HANDLE = { width: 2, height: 16, depth: 2.5, inset: 4, center: 105, margin: 2 } as const;
const EPS = 1e-9;

/** Point of a section of the cupboard: s along its width, y = height (cm). */
interface SY { s: number; y: number }

/**
 * Top of the profile at s; at a vertical step, the value just before s ('left') or just after
 * it ('right'). Beyond the ends, the end values.
 */
function profileValue(profile: ProfilePoint[], s: number, side: 'left' | 'right'): number {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (s <= first.s) return first.top;
  if (s >= last.s) return last.top;
  for (let i = 0; i + 1 < profile.length; i++) {
    const p = profile[i]!;
    const q = profile[i + 1]!;
    if (q.s - p.s <= EPS) continue;
    const hit = side === 'right' ? s >= p.s && s < q.s : s > p.s && s <= q.s;
    if (hit) return p.top + ((q.top - p.top) * (s - p.s)) / (q.s - p.s);
  }
  return last.top;
}

/** The profile between s0 and s1 (both ends included), lowered by `drop`. */
function clipProfile(profile: ProfilePoint[], s0: number, s1: number, drop: number): SY[] {
  return [
    { s: s0, y: profileValue(profile, s0, 'right') - drop },
    ...profile.filter((p) => p.s > s0 + EPS && p.s < s1 - EPS).map((p) => ({ s: p.s, y: p.top - drop })),
    { s: s1, y: profileValue(profile, s1, 'left') - drop },
  ];
}

/**
 * Closed section between `bottom` and the polyline `tops` (from s0 to s1, each top raised to
 * bottom at least), or null when it encloses no area.
 */
function section(s0: number, s1: number, bottom: number, tops: SY[]): SY[] | null {
  const raw: SY[] = [{ s: s0, y: bottom }, { s: s1, y: bottom }, ...[...tops].reverse().map((p) => ({ s: p.s, y: Math.max(bottom, p.y) }))];
  const pts = raw.filter((p, i) => {
    const q = raw[(i + 1) % raw.length]!;
    return Math.abs(p.s - q.s) > EPS || Math.abs(p.y - q.y) > EPS;
  });
  if (pts.length < 3 || !(Math.abs(signedArea(pts.map((p) => ({ x: p.s, y: p.y })))) > EPS)) return null;
  return pts;
}

/**
 * The section extruded across the cupboard depth, from d0 to d1 (cm from the wall face):
 * point (s, y, d) = back[0] + dir * s + outward * d, at height y. A closed solid.
 */
function prism(b: MeshBuilder, f: CupboardFrame, sec: SY[], d0: number, d1: number): void {
  const ring = sec.map((p) => ({ x: p.s, y: p.y }));
  const ccw = signedArea(ring) > 0 ? sec : [...sec].reverse();
  const plan = (s: number, d: number): Vec2 => add(add(f.back[0], scale(f.dir, s)), scale(f.outward, d));
  const P = (p: SY, d: number): V3 => at3(plan(p.s, d), p.y);
  const tris = triangulate(
    ccw.map((p) => ({ x: p.s, y: p.y })),
    [],
  );
  const front: V3 = [f.outward.x, 0, f.outward.y];
  const back: V3 = [-f.outward.x, 0, -f.outward.y];
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const [i, j, k] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    b.tri(P(ccw[i]!, d1), P(ccw[j]!, d1), P(ccw[k]!, d1), front);
    b.tri(P(ccw[i]!, d0), P(ccw[j]!, d0), P(ccw[k]!, d0), back);
  }
  for (let i = 0; i < ccw.length; i++) {
    const u = ccw[i]!;
    const v = ccw[(i + 1) % ccw.length]!;
    const es = v.s - u.s;
    const ey = v.y - u.y;
    const l = Math.hypot(es, ey);
    if (!(l > EPS)) continue;
    // outward normal of a counter-clockwise section: right of the edge
    const ns = ey / l;
    const ny = -es / l;
    b.quad(P(u, d0), P(v, d0), P(v, d1), P(u, d1), [f.dir.x * ns, ny, f.dir.y * ns]);
  }
}

/** Small box of the handle: s, y, d ranges. */
function handleBox(b: MeshBuilder, f: CupboardFrame, s: number, y: number, h: number, d: number): void {
  const w = HANDLE.width / 2;
  prism(
    b,
    f,
    [
      { s: s - w, y: y - h / 2 },
      { s: s + w, y: y - h / 2 },
      { s: s + w, y: y + h / 2 },
      { s: s - w, y: y + h / 2 },
    ],
    d,
    d + HANDLE.depth,
  );
}

/**
 * A cupboard (spec 8.1): the body (plinth set back from the front, carcass up to the top
 * profile, which may contain vertical steps), one front per door (cupboardDoors) with 1 cm
 * joints, and a small handle near the free edge of each door (the edge opposite its hinge).
 * Sliding doors alternate between two rails. Throws if the wall of the cupboard is missing.
 */
export function buildCupboard(level: Level, c: Cupboard): CupboardParts {
  const f = cupboardFrame(level, c);
  const profile = cupboardTopProfile(level, c);
  const doors = cupboardDoors(level, c);
  const sliding = c.doorType === 'sliding';
  const plinth = Math.max(0, c.plinth);
  const doorZone = Math.min((sliding ? 2 : 1) * DOOR_THICKNESS, c.depth / 2);
  const rail = doorZone / (sliding ? 2 : 1);

  const body = new MeshBuilder();
  if (plinth > 0) {
    const recess = c.depth > 4 * PLINTH_RECESS ? PLINTH_RECESS : 0;
    const box = section(0, f.width, 0, [
      { s: 0, y: plinth },
      { s: f.width, y: plinth },
    ]);
    if (box) prism(body, f, box, 0, c.depth - recess);
  }
  const carcass = section(0, f.width, plinth, clipProfile(profile, 0, f.width, 0));
  if (carcass) prism(body, f, carcass, 0, c.depth - doorZone);

  const doorMeshes: MeshData[] = [];
  const handles = new MeshBuilder();
  const w = f.width / doors.length;
  doors.forEach((door, i) => {
    const mb = new MeshBuilder();
    const s0 = i * w + JOINT / 2;
    const s1 = (i + 1) * w - JOINT / 2;
    const bottom = plinth + JOINT / 2;
    const tops = clipProfile(profile, s0, s1, JOINT / 2);
    const sec = s1 - s0 > EPS ? section(s0, s1, bottom, tops) : null;
    const back = sliding && i % 2 === 1 ? c.depth - 2 * rail : c.depth - rail;
    if (sec) {
      prism(mb, f, sec, back, back + rail);
      const hingeAtStart = dist(door.hingeAt, door.from) <= dist(door.hingeAt, door.to);
      const sh = s1 - s0 > 2 * HANDLE.inset ? (hingeAtStart ? s1 - HANDLE.inset : s0 + HANDLE.inset) : (s0 + s1) / 2;
      const top = Math.min(profileValue(profile, sh, 'left'), profileValue(profile, sh, 'right')) - JOINT / 2;
      const free = top - bottom;
      const h = Math.min(HANDLE.height, free / 2);
      if (h > EPS) {
        const lo = bottom + h / 2 + HANDLE.margin;
        const hi = top - h / 2 - HANDLE.margin;
        const y = lo <= hi ? Math.min(Math.max(HANDLE.center, lo), hi) : (bottom + top) / 2;
        handleBox(handles, f, sh, y, h, back + rail);
      }
    }
    doorMeshes.push(mb.build());
  });
  return { body: body.build(), doors: doorMeshes, handles: handles.build() };
}
