import { add, deg2rad, dist, rotate } from '@/core/geometry/vec';
import type { Level, PlacedObject, Vec2 } from '@/core/model/types';
import type { SelectionItem } from './selection';

/** Side of a resize handle square, screen px. */
export const HANDLE_PX = 8;
/** Distance between the back of the object and the rotation handle, screen px. */
export const ROTATE_HANDLE_PX = 24;
/** A press closer than this (screen px) to a handle center grabs it. */
export const HANDLE_GRAB_PX = 7;

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

/** 4 corner and 4 side resize handles on the bounding rectangle, then the rotation handle. */
export function objectHandles(o: PlacedObject, pxPerCm: number): ObjectHandle[] {
  const out: ObjectHandle[] = [];
  for (const sy of SIGNS) {
    for (const sx of SIGNS) {
      if (sx === 0 && sy === 0) continue;
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

/** Handle under the world point p (closest within HANDLE_GRAB_PX screen pixels), or null. */
export function hitHandle(o: PlacedObject, p: Vec2, pxPerCm: number): ObjectHandle | null {
  let best: ObjectHandle | null = null;
  let bestD = HANDLE_GRAB_PX / pxPerCm;
  for (const h of objectHandles(o, pxPerCm)) {
    const d = dist(h.at, p);
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
