import type { Vec2 } from '@/core/model/types';
import { zoomAt, type View } from './view';

/*
 * Wheel input shared by the plan (PlanCanvas) and the 3D view (scene3d CameraRig): a two-finger
 * trackpad scroll pans, a pinch and a mouse wheel zoom.
 *
 * There is no standard way to tell a trackpad scroll from a mouse wheel (w3c/uievents#337,
 * w3c/pointerevents#596): both arrive as `wheel` events. classifyWheel is a heuristic, in order:
 *   1. deltaMode is line or page: a wheel (Firefox reports its mouse wheel in lines, its trackpad
 *      in pixels).
 *   2. a horizontal delta without Shift: a two-finger scroll (a wheel only gives deltaX with Shift,
 *      which browsers turn into a horizontal scroll, or with a rare tilt wheel).
 *   3. the legacy wheelDeltaX/Y of Blink and WebKit (Chrome, Edge, Safari), on the dominant axis:
 *      equal to -3 x delta for a trackpad (pixel deltas, the legacy field is delta / 40 x 120),
 *      anything else for a wheel (120 per notch; on macOS the wheel delta also has an irregular
 *      fractional part, e.g. 4.000244140625 px for -120 or -12, so the equality fails).
 *      Samples (fbjs normalizeWheel.js): "OS X + Chrome (trackpad) 2 pixel delta (wheelDelta -6)",
 *      "OS X + Chrome (mouse) 4 pixel delta (wheelDelta -120)", "Win8 + Chrome (mouse) 100 pixel
 *      delta (wheelDelta -120)". Mac trackpads never give fractional deltas, wheels do
 *      (public-webapps-github 2022Dec/0534, about w3c/uievents#337).
 *   4. without the legacy fields (Firefox, synthetic events): a large integer step (>= 50 px,
 *      typically 100 or 120) is a wheel notch, anything smaller or fractional a trackpad.
 * A wrong guess stays usable: Ctrl / Cmd + wheel and a pinch always zoom, Shift + wheel always
 * pans sideways, and the drags (right or middle button, Space, Shift in 3D) always pan.
 * Known misses: a free-spinning or high-resolution wheel in Firefox (small pixel steps) passes for
 * a trackpad; a trackpad at a browser zoom other than 100 % (fractional deltas in Chrome) passes
 * for a wheel; Chrome on Windows precision touchpads is not covered by rule 3.
 *
 * WheelSourceLatch keeps the first decision while the events of a gesture keep coming (momentum
 * included), so that one gesture is never half pan, half zoom.
 */

export type WheelSource = 'mouse' | 'trackpad';

/** The fields of a WheelEvent the heuristic reads (wheelDeltaX/Y: non-standard, Blink and WebKit only). */
export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  wheelDeltaX?: number;
  wheelDeltaY?: number;
}

/** Pixel deltas at or above this size, integer, are wheel notches when nothing else tells (rule 4). */
const NOTCH_MIN_PX = 50;
/** A gesture ends after this long without a wheel event (ms); the next event is classified again. */
export const WHEEL_LATCH_MS = 300;
/** Pixels per line and per page of a wheel event in line or page mode. */
const LINE_PX = 16;
const PAGE_PX = 400;
/** Zoom factor per wheel pixel: exp(-delta x WHEEL_ZOOM). */
const WHEEL_ZOOM = 0.0015;
/**
 * Zoom factor per pinch pixel: Chromium sends a pinch as a wheel event with ctrlKey and
 * deltaY = -100 ln(scale), so exp(-deltaY / 100) follows the fingers.
 */
const PINCH_ZOOM = 0.01;

/** Mouse wheel or trackpad scroll (heuristic, see above); null for an event without any delta. */
export function classifyWheel(e: WheelSample): WheelSource | null {
  if (e.deltaX === 0 && e.deltaY === 0) return null;
  if (e.deltaMode !== 0) return 'mouse';
  if (e.deltaX !== 0 && !e.shiftKey) return 'trackpad';
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const delta = horizontal ? e.deltaX : e.deltaY;
  const legacy = horizontal ? e.wheelDeltaX : e.wheelDeltaY;
  if (typeof legacy === 'number' && legacy !== 0) return legacy === -3 * delta ? 'trackpad' : 'mouse';
  return Number.isInteger(delta) && Math.abs(delta) >= NOTCH_MIN_PX ? 'mouse' : 'trackpad';
}

/** classifyWheel over a gesture: the first decision holds until WHEEL_LATCH_MS without an event. */
export class WheelSourceLatch {
  private latched: WheelSource | null = null;
  private last = -Infinity;
  private readonly ms: number;

  constructor(ms = WHEEL_LATCH_MS) {
    this.ms = ms;
  }

  /** Source of this event at time `now` (ms); a mouse when nothing is known yet. Ctrl / Cmd events (zoom anyway) do not latch. */
  source(e: WheelSample, now: number): WheelSource {
    if (e.ctrlKey || e.metaKey) return this.latched ?? 'mouse';
    if (this.latched && now - this.last < this.ms) {
      this.last = now;
      return this.latched;
    }
    const guess = classifyWheel(e);
    if (guess) {
      this.latched = guess;
      this.last = now;
    }
    return guess ?? 'mouse';
  }
}

/** What a wheel event asks for: a zoom (delta in px, > 0 zooms out) or a pan (px, the scroll direction). */
export type WheelIntent = { kind: 'zoom'; delta: number; pinch: boolean } | { kind: 'pan'; dx: number; dy: number };

/**
 * Ctrl / Cmd + wheel and a pinch (ctrlKey, small pixel delta) zoom; Shift + wheel pans sideways
 * (from deltaY, or from the deltaX the browser made of it); otherwise a trackpad pans on both
 * axes and a wheel zooms.
 */
export function wheelIntent(e: WheelSample, source: WheelSource): WheelIntent {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) {
    return { kind: 'zoom', delta: dy, pinch: e.ctrlKey && e.deltaMode === 0 && Math.abs(dy) < NOTCH_MIN_PX };
  }
  if (e.shiftKey) return { kind: 'pan', dx: dx !== 0 ? dx : dy, dy: 0 };
  if (source === 'trackpad') return { kind: 'pan', dx, dy };
  return { kind: 'zoom', delta: dy, pinch: false };
}

/** The plan view after a wheel intent at a screen point: a zoom around it, or a pan (the content follows the scroll). */
export function wheelPlanView(view: View, intent: WheelIntent, at: Vec2): View {
  if (intent.kind === 'pan') return { ...view, tx: view.tx - intent.dx, ty: view.ty - intent.dy };
  return zoomAt(view, at, Math.exp(-intent.delta * (intent.pinch ? PINCH_ZOOM : WHEEL_ZOOM)));
}
