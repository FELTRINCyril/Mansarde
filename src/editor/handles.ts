import { add, deg2rad, dist, rotate } from '@/core/geometry/vec';
import type { Level, PlacedObject, Vec2 } from '@/core/model/types';
import type { SelectionItem } from './selection';

/** Side of a resize handle square, screen px. */
export const HANDLE_PX = 8;
/** Distance between the back of the object and the rotation handle, screen px. */
export const ROTATE_HANDLE_PX = 24;
/** A press closer than this (screen px) to a handle center grabs it. */
export const HANDLE_GRAB_PX = 7;
/** A side handle is only shown when its side is at least this long on screen (px). */
export const MIN_SIDE_HANDLE_PX = 20;

/**
 * A handle of a selected object. `sx`, `sy` give the moved side in the object frame (-1, 0, 1 on
 * local x and y); the rotation handle sits beyond the back (local -y). `at` is its world position,
 * `anchor` the middle of the back for the rotation handle (start of its stem).
 */
export interface ObjectHandle { kind: 'resize' | 'rotate'; sx: -1 | 0 | 1; sy: -1 | 0 | 1; at: Vec2; anchor?: Vec2 }

const SIGNS = [-1, 0, 1] as const;

/** The object whose handles are shown: the only selected item, when it is an existing object. */
export function handleTarget(selection: SelectionItem[], level: Level | undefined): PlacedObject | null {
  if (!level || selection.length !== 1) return null;
  const item = selection[0]!;
  return item.kind === 'object' ? (level.objects[item.id] ?? null) : null;
}

/** Local point of the object frame to world. */
export function objectLocalToWorld(o: PlacedObject, local: Vec2): Vec2 {
  return add({ x: o.x, y: o.y }, rotate(local, deg2rad(o.rotation)));
}

/** World point to the object frame (center at the origin, unrotated). */
export function worldToObjectLocal(o: PlacedObject, p: Vec2): Vec2 {
  return rotate({ x: p.x - o.x, y: p.y - o.y }, -deg2rad(o.rotation));
}

/**
 * 4 corner and 4 side resize handles on the bounding rectangle, then the rotation handle. A side
 * handle sits in the middle of a side; it is left out when that side is shorter than
 * MIN_SIDE_HANDLE_PX on screen (it would crowd the corners and the body).
 */
export function objectHandles(o: PlacedObject, pxPerCm: number): ObjectHandle[] {
  const out: ObjectHandle[] = [];
  for (const sy of SIGNS) {
    for (const sx of SIGNS) {
      if (sx === 0 && sy === 0) continue;
      // (sx, 0) lies on a side of length depth, (0, sy) on a side of length width
      if (sy === 0 && o.depth * pxPerCm < MIN_SIDE_HANDLE_PX) continue;
      if (sx === 0 && o.width * pxPerCm < MIN_SIDE_HANDLE_PX) continue;
      out.push({ kind: 'resize', sx, sy, at: objectLocalToWorld(o, { x: (sx * o.width) / 2, y: (sy * o.depth) / 2 }) });
    }
  }
  const back = -o.depth / 2;
  out.push({
    kind: 'rotate',
    sx: 0,
    sy: -1,
    at: objectLocalToWorld(o, { x: 0, y: back - ROTATE_HANDLE_PX / pxPerCm }),
    anchor: objectLocalToWorld(o, { x: 0, y: back }),
  });
  return out;
}

/**
 * Handle under the world point p (closest within HANDLE_GRAB_PX screen pixels), or null. A press
 * inside the bounding rectangle never grabs a side handle (the body moves instead): only corners
 * and the rotation handle win over the body there.
 */
export function hitHandle(o: PlacedObject, p: Vec2, pxPerCm: number): ObjectHandle | null {
  const local = worldToObjectLocal(o, p);
  const inBody = Math.abs(local.x) < o.width / 2 && Math.abs(local.y) < o.depth / 2;
  let best: ObjectHandle | null = null;
  let bestD = HANDLE_GRAB_PX / pxPerCm;
  for (const h of objectHandles(o, pxPerCm)) {
    if (inBody && h.kind === 'resize' && (h.sx === 0 || h.sy === 0)) continue;
    const d = dist(h.at, p);
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
