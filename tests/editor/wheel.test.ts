import { describe, expect, it } from 'vitest';
import { classifyWheel, trackControlKey, wheelIntent, wheelPlanView, WheelSourceLatch, WHEEL_LATCH_MS, type WheelSample } from '@/editor/wheel';
import type { View } from '@/editor/view';

/** A wheel event in pixel mode without modifiers and without the legacy fields (Firefox, synthetic). */
const w = (f: Partial<WheelSample> = {}): WheelSample => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...f });

describe('classifyWheel: mouse wheel or trackpad scroll', () => {
  it('line and page units only come from wheels (Firefox mouse)', () => {
    expect(classifyWheel(w({ deltaY: 3, deltaMode: 1 }))).toBe('mouse');
    expect(classifyWheel(w({ deltaY: 0.1, deltaMode: 1 }))).toBe('mouse');
    expect(classifyWheel(w({ deltaY: 1, deltaMode: 2 }))).toBe('mouse');
  });

  it('large integer pixel steps (100, 120, 53) are wheel notches', () => {
    expect(classifyWheel(w({ deltaY: 100 }))).toBe('mouse');
    expect(classifyWheel(w({ deltaY: -120 }))).toBe('mouse');
    expect(classifyWheel(w({ deltaY: 53 }))).toBe('mouse');
    // Chrome on Windows: 100 px, legacy wheelDelta -120 (not -3 x 100)
    expect(classifyWheel(w({ deltaY: 100, wheelDeltaY: -120 }))).toBe('mouse');
  });

  it('Chrome / Safari on macOS: legacy wheelDelta === -3 x delta is a trackpad, anything else a wheel', () => {
    expect(classifyWheel(w({ deltaY: 2, wheelDeltaY: -6 }))).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: -40, wheelDeltaY: 120 }))).toBe('trackpad');
    // macOS mouse: 4.000244140625 px for a slow notch, wheelDelta -120 or -12
    expect(classifyWheel(w({ deltaY: 4.000244140625, wheelDeltaY: -120 }))).toBe('mouse');
    expect(classifyWheel(w({ deltaY: 4.000244140625, wheelDeltaY: -12 }))).toBe('mouse');
  });

  it('a horizontal delta without Shift is a two-finger scroll', () => {
    expect(classifyWheel(w({ deltaX: 3, deltaY: 1 }))).toBe('trackpad');
    expect(classifyWheel(w({ deltaX: -7 }))).toBe('trackpad');
    // Shift + wheel: the browser turns the notch into deltaX, it stays a mouse
    expect(classifyWheel(w({ deltaX: 100, shiftKey: true }))).toBe('mouse');
    expect(classifyWheel(w({ deltaX: 100, shiftKey: true, wheelDeltaX: -120, wheelDeltaY: 0 }))).toBe('mouse');
  });

  it('without the legacy fields, small or fractional pixel deltas are a trackpad (Firefox on macOS)', () => {
    expect(classifyWheel(w({ deltaY: 1 }))).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: 2.5 }))).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: -13.75 }))).toBe('trackpad');
    expect(classifyWheel(w({ deltaY: 66.5 }))).toBe('trackpad');
  });

  it('an event without any delta says nothing', () => {
    expect(classifyWheel(w())).toBeNull();
  });
});

describe('WheelSourceLatch: one gesture, one classification', () => {
  it('keeps the first classification while the events keep coming, and decides again after a pause', () => {
    const latch = new WheelSourceLatch();
    expect(latch.source(w({ deltaY: 2, wheelDeltaY: -6 }), 0)).toBe('trackpad');
    // a momentum event that would look like a notch, inside the same gesture
    expect(latch.source(w({ deltaY: 100 }), 16)).toBe('trackpad');
    expect(latch.source(w({ deltaY: 100 }), 16 + WHEEL_LATCH_MS - 1)).toBe('trackpad');
    // a pause: a new gesture
    expect(latch.source(w({ deltaY: 100 }), 16 + 3 * WHEEL_LATCH_MS)).toBe('mouse');
  });

  it('defaults to the mouse when nothing is known; a pinch (Ctrl) does not latch', () => {
    const latch = new WheelSourceLatch();
    expect(latch.source(w(), 0)).toBe('mouse');
    expect(latch.source(w({ ctrlKey: true, deltaY: 1.5 }), 10)).toBe('mouse');
    expect(latch.source(w({ deltaY: 2, wheelDeltaY: -6 }), 20)).toBe('trackpad');
  });
});

describe('wheelIntent', () => {
  it('a trackpad scroll pans on both axes, a mouse wheel zooms', () => {
    expect(wheelIntent(w({ deltaX: 3, deltaY: -5 }), 'trackpad')).toEqual({ kind: 'pan', dx: 3, dy: -5 });
    expect(wheelIntent(w({ deltaY: 100 }), 'mouse')).toMatchObject({ kind: 'zoom', delta: 100, pinch: false });
  });

  it('a pinch (Ctrl, small pixel delta) and Ctrl / Cmd + wheel always zoom, whatever the source', () => {
    expect(wheelIntent(w({ deltaY: -2.5, ctrlKey: true }), 'trackpad')).toMatchObject({ kind: 'zoom', delta: -2.5, pinch: true });
    expect(wheelIntent(w({ deltaY: -2.5, ctrlKey: true }), 'mouse')).toMatchObject({ kind: 'zoom', pinch: true });
    expect(wheelIntent(w({ deltaY: 100, ctrlKey: true }), 'mouse')).toMatchObject({ kind: 'zoom', delta: 100, pinch: false });
    expect(wheelIntent(w({ deltaY: 100, metaKey: true }), 'trackpad')).toMatchObject({ kind: 'zoom', delta: 100, pinch: false });
  });

  it('Shift + wheel pans horizontally, from deltaY or from the deltaX the browser made of it', () => {
    expect(wheelIntent(w({ deltaY: 100, shiftKey: true }), 'mouse')).toEqual({ kind: 'pan', dx: 100, dy: 0 });
    expect(wheelIntent(w({ deltaX: -100, shiftKey: true }), 'mouse')).toEqual({ kind: 'pan', dx: -100, dy: 0 });
  });

  it('lines and pages are converted to pixels', () => {
    expect(wheelIntent(w({ deltaY: 3, deltaMode: 1 }), 'mouse')).toMatchObject({ kind: 'zoom', delta: 48 });
    expect(wheelIntent(w({ deltaY: 1, deltaMode: 1, shiftKey: true }), 'mouse')).toEqual({ kind: 'pan', dx: 16, dy: 0 });
  });
});

describe('wheelPlanView: the plan under the wheel', () => {
  const view: View = { pxPerCm: 2, tx: 100, ty: 50 };
  const at = { x: 300, y: 200 };
  /** World point under a screen point. */
  const worldAt = (v: View, p: { x: number; y: number }) => ({ x: (p.x - v.tx) / v.pxPerCm, y: (p.y - v.ty) / v.pxPerCm });

  it('a trackpad scroll moves the view (content follows the fingers) and keeps the zoom', () => {
    const next = wheelPlanView(view, wheelIntent(w({ deltaX: 10, deltaY: -20 }), 'trackpad'), at);
    expect(next).toEqual({ pxPerCm: 2, tx: 90, ty: 70 });
  });

  it('a mouse wheel and a pinch zoom around the cursor', () => {
    for (const [e, source] of [
      [w({ deltaY: -100 }), 'mouse'],
      [w({ deltaY: -3, ctrlKey: true }), 'trackpad'],
    ] as const) {
      const next = wheelPlanView(view, wheelIntent(e, source), at);
      expect(next.pxPerCm).toBeGreaterThan(view.pxPerCm);
      const a = worldAt(view, at);
      const b = worldAt(next, at);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
    // zoom out the other way
    expect(wheelPlanView(view, wheelIntent(w({ deltaY: 100 }), 'mouse'), at).pxPerCm).toBeLessThan(view.pxPerCm);
  });

  it('a pinch zooms by about its own scale: delta = -100 ln(scale) (Chromium)', () => {
    const next = wheelPlanView(view, wheelIntent(w({ deltaY: -100 * Math.log(1.1), ctrlKey: true }), 'trackpad'), at);
    expect(next.pxPerCm / view.pxPerCm).toBeCloseTo(1.1, 6);
  });

  it('Ctrl + mouse wheel on macOS (Control held) zooms at the wheel rate, a pinch at the pinch rate (nav review M7)', () => {
    // measured in Chromium: a pinch is a ctrlKey wheel with a small fractional delta and wheelDeltaY = +-120,
    // exactly what a slow macOS wheel notch looks like (4.000244140625 px, wheelDeltaY -120): only the
    // Control key tells them apart
    const notch = w({ deltaY: 4.000244140625, wheelDeltaY: -120, ctrlKey: true });
    expect(wheelIntent(notch, 'mouse', true)).toMatchObject({ kind: 'zoom', pinch: false });
    expect(wheelPlanView(view, wheelIntent(notch, 'mouse', true), at).pxPerCm / view.pxPerCm).toBeCloseTo(Math.exp(-4.000244140625 * 0.0015), 9);
    const pinch = w({ deltaY: -100 * Math.log(1.05), wheelDeltaY: 120, ctrlKey: true });
    expect(wheelPlanView(view, wheelIntent(pinch, 'mouse', false), at).pxPerCm / view.pxPerCm).toBeCloseTo(1.05, 9);
    // Control held over a trackpad scroll (legacy -3 x delta): the pinch rate
    expect(wheelIntent(w({ deltaY: -3, wheelDeltaY: 9, ctrlKey: true }), 'trackpad', true)).toMatchObject({ kind: 'zoom', pinch: true });
  });

  it('trackControlKey follows the Control key (keydown, keyup, window blur)', () => {
    const target = new EventTarget();
    const key = (type: string, k: string) => target.dispatchEvent(Object.assign(new Event(type), { key: k }));
    const ctrl = trackControlKey(target);
    expect(ctrl.held()).toBe(false);
    key('keydown', 'Control');
    expect(ctrl.held()).toBe(true);
    key('keydown', 'a');
    expect(ctrl.held()).toBe(true);
    key('keyup', 'Control');
    expect(ctrl.held()).toBe(false);
    key('keydown', 'Control');
    target.dispatchEvent(new Event('blur'));
    expect(ctrl.held()).toBe(false);
    ctrl.dispose();
    key('keydown', 'Control');
    expect(ctrl.held()).toBe(false);
  });

  it('Shift + wheel pans along x only', () => {
    const next = wheelPlanView(view, wheelIntent(w({ deltaY: 100, shiftKey: true }), 'mouse'), at);
    expect(next).toEqual({ pxPerCm: 2, tx: 0, ty: 50 });
  });
});
