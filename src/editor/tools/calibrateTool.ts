import { updateBackground } from '@/core/commands/project';
import { dist } from '@/core/geometry/vec';
import type { Background, Vec2 } from '@/core/model/types';
import { calibrateBackground } from '../background';
import { openNumericInput } from '../numericOverlay';
import { activeLevel } from '../store';
import type { PointerInfo, SegmentGhost, Tool, ToolContext } from './types';

/** Two clicks closer than this on screen (px) do not define a segment. */
export const MIN_SEGMENT_PX = 4;

/** Calibration progress: nothing clicked, first point set, both points set (the real length is typed). */
export type CalibrateState =
  | { phase: 'first' }
  | { phase: 'second'; p1: Vec2 }
  | { phase: 'length'; p1: Vec2; p2: Vec2 };

export const CALIBRATE_START: CalibrateState = { phase: 'first' };

/** Next state after a click at `world`; a second click closer than minDist (cm) to the first is ignored. */
export function calibrateClick(s: CalibrateState, world: Vec2, minDist: number): CalibrateState {
  if (s.phase === 'first') return { phase: 'second', p1: world };
  if (s.phase === 'second') return dist(s.p1, world) < minDist ? s : { phase: 'length', p1: s.p1, p2: world };
  return s;
}

/** Segment preview: first point to the cursor, then first to second point. */
export function calibrateGhost(s: CalibrateState, cursor: Vec2): SegmentGhost | null {
  if (s.phase === 'first') return null;
  if (s.phase === 'second') return { kind: 'segment', a: s.p1, b: cursor, points: [s.p1] };
  return { kind: 'segment', a: s.p1, b: s.p2, points: [s.p1, s.p2] };
}

/** The recalibrated background, or null when the points are not both set or the length is not positive. */
export function calibrateResult(s: CalibrateState, bg: Background, realCm: number): Background | null {
  if (s.phase !== 'length' || !(realCm > 0) || !Number.isFinite(realCm)) return null;
  return calibrateBackground(bg, s.p1, s.p2, realCm);
}

const LENGTH_LABEL = 'Longueur réelle';

/**
 * Calibrate tool: two clicks on a known length of the tracing image (no snapping), then the real
 * length in cm in the shared numeric field. The image is rescaled so that the first point stays
 * put on screen. Escape cancels the current segment, then leaves the tool.
 */
export function createCalibrateTool(): Tool {
  let state: CalibrateState = CALIBRATE_START;
  const reset = (c: ToolContext) => {
    state = CALIBRATE_START;
    c.store.getState().setOverlay({ ghost: null });
  };
  return {
    id: 'calibrate',
    cursor: 'crosshair',
    onPointerDown(e, c) {
      if (e.button !== 0) return;
      const before = state;
      state = calibrateClick(state, e.world, MIN_SEGMENT_PX / c.pxPerCm());
      if (state !== before) c.store.getState().setOverlay({ ghost: calibrateGhost(state, e.world) });
    },
    onPointerMove(e, c) {
      if (state.phase === 'second') c.store.getState().setOverlay({ ghost: calibrateGhost(state, e.world) });
    },
    // The field opens on release: opening it on press would lose the focus to the canvas (mousedown default).
    onPointerUp(e: PointerInfo, c) {
      if (state.phase !== 'length' || c.store.getState().overlay.numericInput) return;
      openNumericInput(c.store, { initial: '', screen: e.screen, kind: 'positive', label: LENGTH_LABEL });
    },
    onNumericSubmit(valueCm, c) {
      const s = c.store.getState();
      const level = activeLevel(s);
      const bg = level?.background;
      const next = level && bg ? calibrateResult(state, bg, valueCm) : null;
      reset(c);
      if (!level || !next) return;
      const { scale, x, y } = next;
      if (s.execute("Mettre l'image à l'échelle", updateBackground(level.id, { scale, x, y }))) s.setTool('select');
    },
    onNumericCancel(c) {
      reset(c);
    },
    onKeyDown(e, c) {
      if (e.key !== 'Escape') return false;
      if (state.phase !== 'first') reset(c);
      else c.store.getState().setTool('select');
      return true;
    },
    onDeactivate() {
      state = CALIBRATE_START;
    },
  };
}

export const calibrateTool = createCalibrateTool();
