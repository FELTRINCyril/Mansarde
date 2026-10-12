import { deg2rad, lerp } from '@/core/geometry/vec';
import type { Vec2 } from '@/core/model/types';
import type { Box } from './dimLayout';

/**
 * Fractions of the line tried in turn: the middle first, then away from it, up to near its ends
 * (at a large lineUnit, PDF 1:100 or zoomed out, the labels and the room names are big).
 */
const CANDIDATES = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];

/** A turned label: center c, unit direction u of its length, half length hw, half height hh. */
export interface TurnedRect { c: Vec2; u: Vec2; hw: number; hh: number }

/** An obstacle: an axis-aligned box (room name, furniture bounds) or a label already placed. */
export type Obstacle = Box | TurnedRect;

const asRect = (o: Obstacle): TurnedRect =>
  'c' in o ? o : { c: { x: (o.minX + o.maxX) / 2, y: (o.minY + o.maxY) / 2 }, u: { x: 1, y: 0 }, hw: (o.maxX - o.minX) / 2, hh: (o.maxY - o.minY) / 2 };

/** Half extent of r projected on the unit axis n. */
const reach = (r: TurnedRect, n: Vec2): number =>
  r.hw * Math.abs(r.u.x * n.x + r.u.y * n.y) + r.hh * Math.abs(-r.u.y * n.x + r.u.x * n.y);

/**
 * Separating axis test of two turned rectangles (the axes of both). Testing a turned label by its
 * bounding box instead would refuse much more than the label on a diagonal line, hence every
 * candidate near a room name at a large lineUnit.
 */
function overlaps(a: TurnedRect, b: TurnedRect): boolean {
  const d = { x: b.c.x - a.c.x, y: b.c.y - a.c.y };
  for (const n of [a.u, { x: -a.u.y, y: a.u.x }, b.u, { x: -b.u.y, y: b.u.x }]) {
    if (Math.abs(d.x * n.x + d.y * n.y) >= reach(a, n) + reach(b, n)) return false;
  }
  return true;
}

/**
 * The label of size width x height (world units) turned by angleDeg, centered on `at` moved by
 * `shift` towards the top of the turned text (a text written above its line).
 */
export function turnedRect(at: Vec2, width: number, height: number, angleDeg: number, shift = 0): TurnedRect {
  const r = deg2rad(angleDeg);
  const c = { x: at.x + Math.sin(r) * shift, y: at.y - Math.cos(r) * shift };
  return { c, u: { x: Math.cos(r), y: Math.sin(r) }, hw: width / 2, hh: height / 2 };
}

/**
 * Where to write a label of size width x height (world units, turned by angleDeg, its center
 * `shift` above the segment, see turnedRect) on the segment a-b: its middle, unless the label would overlap one of the obstacles, then the first of a few
 * points further along the segment that is clear. By decreasing importance:
 * - `hiding`: room names, opaque and drawn above the label: always avoided when possible;
 * - `labels`: labels already placed (an overlap makes both unreadable);
 * - `masking`: dimension texts, drawn above the label with an opaque mask;
 * - `covering`: furniture drawn over the label at 35 %.
 * The first point clear of all of them; else the least important kind is dropped, one at a time;
 * when no point is clear even of the room names, the one under the fewest of them (middle first).
 */
export function labelAlong(
  a: Vec2,
  b: Vec2,
  width: number,
  height: number,
  angleDeg: number,
  obstacles: { hiding: Obstacle[]; labels?: Obstacle[]; masking?: Obstacle[]; covering?: Obstacle[] },
  shift = 0,
): Vec2 {
  const hiding = obstacles.hiding.map(asRect);
  const labels = [...hiding, ...(obstacles.labels ?? []).map(asRect)];
  const masking = [...labels, ...(obstacles.masking ?? []).map(asRect)];
  const all = [...masking, ...(obstacles.covering ?? []).map(asRect)];
  const at = CANDIDATES.map((t) => lerp(a, b, t));
  const rects = at.map((p) => turnedRect(p, width, height, angleDeg, shift));
  for (const list of [all, masking, labels, hiding]) {
    const i = rects.findIndex((r) => !list.some((o) => overlaps(r, o)));
    if (i >= 0) return at[i]!;
  }
  const hidden = rects.map((r) => hiding.filter((o) => overlaps(r, o)).length);
  return at[hidden.indexOf(Math.min(...hidden))]!;
}
