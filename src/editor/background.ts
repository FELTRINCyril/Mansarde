import { bbox } from '@/core/geometry/polygon';
import type { Background, Vec2 } from '@/core/model/types';
import { add, deg2rad, dist, rotate } from '@/core/geometry/vec';
import type { BoundsCm } from '@/export/pageLayout';
import { activeLevel, type EditorState, type EditorStore } from './store';

/**
 * Rescales the background so that the world distance p1-p2 becomes realCm. World point p1 stays on
 * the same image pixel, hence fixed in the world: with the image at (x, y) rotated around its
 * top-left corner, p1 = pos + R * (q * s), so scaling s by k only moves pos to p1 - k * (p1 - pos)
 * whatever the rotation. Throws on invalid input (the UI never calls it with one).
 */
export function calibrateBackground(bg: Background, p1: Vec2, p2: Vec2, realCm: number): Background {
  if (![p1.x, p1.y, p2.x, p2.y, realCm].every(Number.isFinite)) throw new Error('calibrateBackground: non-finite input');
  if (realCm <= 0) throw new Error('calibrateBackground: realCm must be positive');
  const d = dist(p1, p2);
  if (d === 0) throw new Error('calibrateBackground: points are identical');
  const k = realCm / d;
  return {
    ...bg,
    scale: bg.scale * k,
    x: p1.x - k * (p1.x - bg.x),
    y: p1.y - k * (p1.y - bg.y),
  };
}

/**
 * Leaves the move mode of the tracing image (back to the selection tool) whenever the image of the
 * active level can no longer be moved: locked, hidden or removed, whatever the cause (panel, undo,
 * level change). Returns the unsubscribe function.
 */
export function watchBackgroundMode(store: EditorStore): () => void {
  const check = (s: EditorState) => {
    if (s.tool !== 'moveBackground') return;
    const bg = activeLevel(s)?.background;
    if (!bg || bg.locked || !bg.visible) s.setTool('select');
  };
  check(store.getState());
  return store.subscribe(check);
}

/**
 * What "show everything" (key 0, and the view of a freshly opened project) frames: the plan bounds
 * (levelBounds) grown to the tracing image when it is shown, its corners turned about its top-left
 * corner like BackgroundLayer draws it. Null when there is neither.
 */
export function fitBounds(plan: BoundsCm | null, bg: Background | null | undefined): BoundsCm | null {
  if (!bg?.visible) return plan;
  const w = bg.widthPx * bg.scale;
  const h = bg.heightPx * bg.scale;
  const rad = deg2rad(bg.rotation);
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map((c) => add({ x: bg.x, y: bg.y }, rotate(c, rad)));
  const img = bbox(plan ? [...corners, { x: plan.minX, y: plan.minY }, { x: plan.maxX, y: plan.maxY }] : corners)!;
  // 0 + tiny rounding noise of the rotation (cos 90 degrees) would show as -0.0000001
  const clean = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
  return { minX: clean(img.minX), minY: clean(img.minY), maxX: clean(img.maxX), maxY: clean(img.maxY) };
}
