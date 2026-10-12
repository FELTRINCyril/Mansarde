import { describe, expect, it } from 'vitest';
import { fitView, keepCenterOnResize, MAX_ZOOM, MIN_ZOOM, screenToWorld, worldToScreen, zoomAt, type View } from '@/editor/view';

const view: View = { pxPerCm: 2, tx: 30, ty: -20 };
const finiteView = (v: View) => [v.pxPerCm, v.tx, v.ty].every(Number.isFinite);

describe('view math', () => {
  it('worldToScreen applies screen = world * pxPerCm + t', () => {
    expect(worldToScreen(view, { x: 10, y: 5 })).toEqual({ x: 50, y: -10 });
  });

  it('screenToWorld inverts worldToScreen', () => {
    const p = { x: 123.5, y: -77.25 };
    const back = screenToWorld(view, worldToScreen(view, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const cursor = { x: 400, y: 250 };
    const before = screenToWorld(view, cursor);
    const zoomed = zoomAt(view, cursor, 1.5);
    expect(zoomed.pxPerCm).toBeCloseTo(3, 9);
    const after = screenToWorld(zoomed, cursor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('zoomAt clamps to MAX_ZOOM and MIN_ZOOM and still keeps the point fixed', () => {
    const cursor = { x: 100, y: 100 };
    const before = screenToWorld(view, cursor);
    const max = zoomAt(view, cursor, 1e6);
    expect(max.pxPerCm).toBe(MAX_ZOOM);
    expect(screenToWorld(max, cursor).x).toBeCloseTo(before.x, 9);
    const min = zoomAt(view, cursor, 1e-9);
    expect(min.pxPerCm).toBe(MIN_ZOOM);
    expect(screenToWorld(min, cursor).y).toBeCloseTo(before.y, 9);
  });

  it('zoomAt ignores a non-finite or non-positive factor', () => {
    const cursor = { x: 1, y: 1 };
    for (const f of [NaN, Infinity, 0, -2]) expect(zoomAt(view, cursor, f)).toEqual(view);
  });
});

describe('view math never produces NaN or Infinity', () => {
  const ok = (p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y);
  const badViews: View[] = [
    { pxPerCm: 0, tx: 0, ty: 0 }, { pxPerCm: -2, tx: 0, ty: 0 }, { pxPerCm: NaN, tx: 0, ty: 0 },
    { pxPerCm: Infinity, tx: 0, ty: 0 }, { pxPerCm: 1, tx: NaN, ty: 0 }, { pxPerCm: 1, tx: 0, ty: -Infinity },
  ];

  it('invalid views fall back to the default view', () => {
    for (const bad of badViews) {
      expect(worldToScreen(bad, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
      expect(screenToWorld(bad, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
      expect(finiteView(zoomAt(bad, { x: 5, y: 5 }, 2))).toBe(true);
      expect(finiteView(zoomAt(bad, { x: 5, y: 5 }, NaN))).toBe(true);
    }
  });

  it('non-finite points give finite results', () => {
    for (const p of [{ x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: -Infinity, y: NaN }]) {
      expect(ok(worldToScreen(view, p))).toBe(true);
      expect(ok(screenToWorld(view, p))).toBe(true);
      expect(zoomAt(view, p, 2)).toEqual(view);
    }
  });
});

describe('fitView', () => {
  const viewport = { width: 800, height: 600 };

  it('null bounds -> default view, world origin at the viewport center', () => {
    const v = fitView(null, viewport);
    expect(v).toEqual({ pxPerCm: 1, tx: 400, ty: 300 });
  });

  it('degenerate (single point) bounds -> default view, finite, zoom 1', () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, viewport);
    expect(finiteView(v)).toBe(true);
    expect(v.pxPerCm).toBe(1);
    expect(v).toEqual({ pxPerCm: 1, tx: 400, ty: 300 });
  });

  it('non-finite bounds -> default view', () => {
    const v = fitView({ minX: NaN, minY: 0, maxX: Infinity, maxY: 10 }, viewport);
    expect(v).toEqual({ pxPerCm: 1, tx: 400, ty: 300 });
  });

  it('fits the bounds inside the margin and centers them', () => {
    // 1000 x 500 cm into (800-80) x (600-80) = 720 x 520 -> limited by width: 0.72
    const v = fitView({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, viewport);
    expect(v.pxPerCm).toBeCloseTo(0.72, 9);
    const c = worldToScreen(v, { x: 500, y: 250 });
    expect(c.x).toBeCloseTo(400, 9);
    expect(c.y).toBeCloseTo(300, 9);
    const a = worldToScreen(v, { x: 0, y: 0 });
    const b = worldToScreen(v, { x: 1000, y: 500 });
    expect(a.x).toBeCloseTo(40, 9);
    expect(b.x).toBeCloseTo(760, 9);
    expect(a.y).toBeGreaterThanOrEqual(40 - 1e-9);
    expect(b.y).toBeLessThanOrEqual(560 + 1e-9);
  });

  it('a flat (zero height) box fits on its width', () => {
    const v = fitView({ minX: 0, minY: 10, maxX: 720, maxY: 10 }, viewport);
    expect(v.pxPerCm).toBeCloseTo(1, 9);
    expect(finiteView(v)).toBe(true);
  });

  it('clamps the zoom for tiny boxes and never returns NaN or Infinity', () => {
    const tiny = fitView({ minX: 0, minY: 0, maxX: 0.001, maxY: 0.001 }, viewport);
    expect(tiny.pxPerCm).toBe(MAX_ZOOM);
    const huge = fitView({ minX: 0, minY: 0, maxX: 1e9, maxY: 1e9 }, viewport);
    expect(huge.pxPerCm).toBe(MIN_ZOOM);
    for (const vp of [{ width: 0, height: 0 }, { width: 50, height: 50 }, { width: NaN, height: 100 }]) {
      expect(finiteView(fitView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, vp))).toBe(true);
      expect(finiteView(fitView(null, vp))).toBe(true);
    }
  });

  it('keepCenterOnResize keeps the world point at the center of the viewport, zoom unchanged', () => {
    const before = { width: 800, height: 600 };
    const after = { width: 400, height: 500 };
    const center = screenToWorld(view, { x: 400, y: 300 });
    const v = keepCenterOnResize(view, before, after);
    expect(v.pxPerCm).toBe(view.pxPerCm);
    const c = worldToScreen(v, center);
    expect(c.x).toBeCloseTo(200, 9);
    expect(c.y).toBeCloseTo(250, 9);
    // same size, or an empty (hidden) viewport on either side: unchanged
    expect(keepCenterOnResize(view, before, before)).toBe(view);
    expect(keepCenterOnResize(view, { width: 0, height: 0 }, after)).toBe(view);
    expect(keepCenterOnResize(view, before, { width: 0, height: 0 })).toBe(view);
  });
});
