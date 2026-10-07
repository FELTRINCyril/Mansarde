import type { Vec2 } from '@/core/model/types';

/** screen = world * pxPerCm + t */
export interface View { pxPerCm: number; tx: number; ty: number }

export const MIN_ZOOM = 0.05, MAX_ZOOM = 20;

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export const DEFAULT_VIEW: View = { pxPerCm: 1, tx: 0, ty: 0 };

/** A view the math can use: finite translation, finite strictly positive zoom. */
export const isValidView = (v: View): boolean =>
  Number.isFinite(v.pxPerCm) && v.pxPerCm > 0 && Number.isFinite(v.tx) && Number.isFinite(v.ty);

const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const finiteOr = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);

/*
 * Guards: an invalid view is replaced by DEFAULT_VIEW and a non-finite coordinate counts as 0, so
 * the helpers never return NaN or Infinity (callers are expected to pass valid input anyway).
 */
export function worldToScreen(view: View, p: Vec2): Vec2 {
  const v = isValidView(view) ? view : DEFAULT_VIEW;
  p = { x: finiteOr(p.x, 0), y: finiteOr(p.y, 0) };
  return { x: p.x * v.pxPerCm + v.tx, y: p.y * v.pxPerCm + v.ty };
}

export function screenToWorld(view: View, p: Vec2): Vec2 {
  const v = isValidView(view) ? view : DEFAULT_VIEW;
  p = { x: finiteOr(p.x, 0), y: finiteOr(p.y, 0) };
  return { x: (p.x - v.tx) / v.pxPerCm, y: (p.y - v.ty) / v.pxPerCm };
}

/** Zooms by factor around a screen point: the world point under it does not move. Zoom is clamped. */
export function zoomAt(view: View, screenPoint: Vec2, factor: number): View {
  const v = isValidView(view) ? view : DEFAULT_VIEW;
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) {
    return v;
  }
  const pxPerCm = clampZoom(v.pxPerCm * factor);
  const world = screenToWorld(v, screenPoint);
  return { pxPerCm, tx: screenPoint.x - world.x * pxPerCm, ty: screenPoint.y - world.y * pxPerCm };
}

/**
 * View that shows the bounds inside the viewport with a margin (px) on each side, centered.
 * Null, non-finite or point-like bounds give the default view: 1 px per cm, world origin at the
 * viewport center. A box flat on one axis is fitted on the other axis.
 */
export function fitView(bounds: Bounds | null, viewport: { width: number; height: number }, margin = 40): View {
  const width = Math.max(0, finiteOr(viewport.width, 0));
  const height = Math.max(0, finiteOr(viewport.height, 0));
  const fallback: View = { pxPerCm: 1, tx: width / 2, ty: height / 2 };
  if (!bounds) return fallback;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (![w, h, bounds.minX, bounds.minY].every(Number.isFinite) || w < 0 || h < 0) return fallback;
  const EPS = 1e-9;
  if (w < EPS && h < EPS) return fallback;
  const m = Math.max(0, finiteOr(margin, 0));
  const availW = Math.max(width - 2 * m, 1);
  const availH = Math.max(height - 2 * m, 1);
  const zooms = [w >= EPS ? availW / w : Infinity, h >= EPS ? availH / h : Infinity];
  const pxPerCm = clampZoom(Math.min(...zooms));
  const cx = bounds.minX + w / 2;
  const cy = bounds.minY + h / 2;
  return { pxPerCm, tx: width / 2 - cx * pxPerCm, ty: height / 2 - cy * pxPerCm };
}
