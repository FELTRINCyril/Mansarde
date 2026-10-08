import { describe, expect, it } from 'vitest';
import { calibrateBackground } from '@/editor/background';
import { CALIBRATE_START, calibrateClick, calibrateGhost, calibrateResult } from '@/editor/tools/calibrateTool';
import type { Background, Vec2 } from '@/core/model/types';

const bg = (over: Partial<Background> = {}): Background => ({
  imageId: 'img', widthPx: 800, heightPx: 600, scale: 1, x: 0, y: 0,
  rotation: 0, opacity: 0.5, locked: false, visible: true, ...over,
});

/** World position of image pixel q (rotation around the top-left corner, clockwise on screen). */
function pixelToWorld(b: Background, q: Vec2): Vec2 {
  const r = (b.rotation * Math.PI) / 180;
  const sx = q.x * b.scale;
  const sy = q.y * b.scale;
  return { x: b.x + sx * Math.cos(r) - sy * Math.sin(r), y: b.y + sx * Math.sin(r) + sy * Math.cos(r) };
}

describe('calibrateBackground', () => {
  it('doubles the scale when 400 cm are declared 800 cm', () => {
    const r = calibrateBackground(bg(), { x: 0, y: 0 }, { x: 400, y: 0 }, 800);
    expect(r.scale).toBe(2);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(0, 9);
  });

  it('keeps the first point fixed: the image pixel under p1 stays under p1', () => {
    const before = bg();
    const p1 = { x: 100, y: 100 };
    const r = calibrateBackground(before, p1, { x: 300, y: 100 }, 100);
    expect(r.scale).toBeCloseTo(0.5, 12);
    // pixel (100, 100) was under p1 at scale 1, and still is
    const w = pixelToWorld(r, { x: 100, y: 100 });
    expect(w.x).toBeCloseTo(100, 9);
    expect(w.y).toBeCloseTo(100, 9);
  });

  it('keeps p1 fixed with an offset position and a rotation', () => {
    const before = bg({ scale: 2.5, x: -120, y: 80, rotation: 30 });
    const p1 = { x: 200, y: 50 };
    const p2 = { x: 500, y: 450 };
    // pixel under p1 before
    const r0 = (-before.rotation * Math.PI) / 180;
    const dx = p1.x - before.x;
    const dy = p1.y - before.y;
    const q = {
      x: (dx * Math.cos(r0) - dy * Math.sin(r0)) / before.scale,
      y: (dx * Math.sin(r0) + dy * Math.cos(r0)) / before.scale,
    };
    const r = calibrateBackground(before, p1, p2, 1000);
    expect(r.scale).toBeCloseTo(before.scale * (1000 / 500), 12);
    const w = pixelToWorld(r, q);
    expect(w.x).toBeCloseTo(p1.x, 9);
    expect(w.y).toBeCloseTo(p1.y, 9);
    // untouched fields
    expect(r.rotation).toBe(30);
    expect(r.imageId).toBe('img');
  });

  it('does not mutate its input', () => {
    const before = bg();
    const copy = { ...before };
    calibrateBackground(before, { x: 0, y: 0 }, { x: 10, y: 0 }, 20);
    expect(before).toEqual(copy);
  });

  it('throws on realCm <= 0', () => {
    expect(() => calibrateBackground(bg(), { x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toThrow();
    expect(() => calibrateBackground(bg(), { x: 0, y: 0 }, { x: 10, y: 0 }, -5)).toThrow();
  });

  it('throws on non-finite input', () => {
    expect(() => calibrateBackground(bg(), { x: 0, y: 0 }, { x: 10, y: 0 }, NaN)).toThrow();
    expect(() => calibrateBackground(bg(), { x: 0, y: 0 }, { x: 10, y: 0 }, Infinity)).toThrow();
    expect(() => calibrateBackground(bg(), { x: NaN, y: 0 }, { x: 10, y: 0 }, 5)).toThrow();
    expect(() => calibrateBackground(bg(), { x: 0, y: 0 }, { x: 10, y: Infinity }, 5)).toThrow();
  });

  it('throws when the two points coincide', () => {
    expect(() => calibrateBackground(bg(), { x: 5, y: 5 }, { x: 5, y: 5 }, 100)).toThrow();
  });
});

describe('calibrate state machine', () => {
  const MIN = 1;

  it('walks first -> second -> length with two clicks', () => {
    const s1 = calibrateClick(CALIBRATE_START, { x: 100, y: 100 }, MIN);
    expect(s1).toEqual({ phase: 'second', p1: { x: 100, y: 100 } });
    const s2 = calibrateClick(s1, { x: 300, y: 100 }, MIN);
    expect(s2).toEqual({ phase: 'length', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 } });
  });

  it('ignores a second click too close to the first point', () => {
    const s1 = calibrateClick(CALIBRATE_START, { x: 100, y: 100 }, MIN);
    expect(calibrateClick(s1, { x: 100.2, y: 100.2 }, MIN)).toBe(s1);
  });

  it('ignores clicks once the length is awaited', () => {
    const s2 = calibrateClick(calibrateClick(CALIBRATE_START, { x: 0, y: 0 }, MIN), { x: 50, y: 0 }, MIN);
    expect(calibrateClick(s2, { x: 9, y: 9 }, MIN)).toBe(s2);
  });

  it('previews nothing at first, a segment from the second phase on', () => {
    expect(calibrateGhost(CALIBRATE_START, { x: 5, y: 5 })).toBeNull();
    const s1 = calibrateClick(CALIBRATE_START, { x: 100, y: 100 }, MIN);
    expect(calibrateGhost(s1, { x: 200, y: 150 })).toEqual({
      kind: 'segment',
      a: { x: 100, y: 100 },
      b: { x: 200, y: 150 },
      points: [{ x: 100, y: 100 }],
    });
    const s2 = calibrateClick(s1, { x: 300, y: 100 }, MIN);
    expect(calibrateGhost(s2, { x: 0, y: 0 })?.points).toEqual([{ x: 100, y: 100 }, { x: 300, y: 100 }]);
  });

  it('applies the typed length only once both points are known', () => {
    const s1 = calibrateClick(CALIBRATE_START, { x: 0, y: 0 }, MIN);
    expect(calibrateResult(s1, bg(), 800)).toBeNull();
    const s2 = calibrateClick(s1, { x: 400, y: 0 }, MIN);
    const r = calibrateResult(s2, bg(), 800);
    expect(r?.scale).toBe(2);
    expect(calibrateResult(s2, bg(), 0)).toBeNull();
  });
});
