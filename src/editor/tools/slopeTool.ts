import { addSlope } from '@/core/commands/slopes';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { add, dist, dot, lerp, normalize, perp, scale, sub } from '@/core/geometry/vec';
import { slopeFrame } from '@/core/geometry/slopes';
import { MIN_WALL_LENGTH, SLOPE_DEFAULT_END } from '@/core/model/defaults';
import { createSlope } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Id, Level, Slope, Vec2 } from '@/core/model/types';
import { formatNumber } from '@/ui/numeric';
import { closeNumericInput, openNumericInput } from '../numericOverlay';
import { activeLevel, type EditorStore } from '../store';
import { markerGhost, markerOf, undoKeyOf } from './drawing';
import type { PointerInfo, Tool, ToolContext } from './types';
import { snapVolumePoint, type SlopeGhost } from './volumeTools';

const LABEL_START = 'Hauteur au départ';
const LABEL_END = "Hauteur à l'arrivée";

/**
 * Side and depth of a slope whose start line is a -> b, for the third point p: the side of the
 * line p is on (left = +perp(b - a), spec 4.2) and its distance to the line, rounded to 1 cm
 * unless raw; at least MIN_WALL_LENGTH.
 */
export function slopeSideAndDepth(a: Vec2, b: Vec2, p: Vec2, raw = false): { side: 'left' | 'right'; depth: number } {
  const v = dot(sub(p, a), normalize(perp(sub(b, a))));
  const d = Math.abs(v);
  return { side: v >= 0 ? 'left' : 'right', depth: Math.max(MIN_WALL_LENGTH, raw ? d : Math.round(d)) };
}

/** Where the depth dimension stands along the start line: off its middle, where the room name usually is. */
const DEPTH_DIM_AT = 0.15;

/** Dynamic dimension of the depth of a slope, across the band near the start of its start line. */
export function slopeDepthDim(s: Slope): DimLine {
  const f = slopeFrame(s);
  const from = lerp(s.a, s.b, DEPTH_DIM_AT);
  return { a: from, b: add(from, scale(f.normal, s.depth)), offset: 0, value: s.depth, kind: 'dynamic' };
}

type State =
  | { step: 'a' }
  | { step: 'b'; levelId: Id; a: Vec2 }
  | { step: 'depth'; levelId: Id; a: Vec2; b: Vec2 }
  // the slope is fixed in plan; its heights are typed in the numeric field (`field`), opened at
  // the release of the third click (`open` false until then: a field focused at the press would
  // lose the focus to the plan right away)
  | { step: 'heights'; levelId: Id; slope: Slope; field: 'start' | 'end'; open: boolean; screen: Vec2 };

/**
 * Slope tool (T, spec 7.1): a click, a click: the start line (snapped by snapVolumePoint and shown
 * by the snapped cursor marker like the wall tool, Shift = horizontal or vertical, Alt = free); moving then sets the side and the depth (dynamic dimension); a third click fixes them and
 * opens the numeric field: height at the start (the level height preselected), Tab, height at the
 * end (150), Enter adds the slope (one addSlope, one history entry) and selects it. Escape (or
 * leaving the field) during the heights keeps the values given so far, defaults for the others,
 * and adds the slope too. Escape before cancels the slope in progress, or returns to the selection
 * tool; Mod+Z drops the slope in progress. The tool stays active.
 */
export function createSlopeTool(): Tool {
  let state: State = { step: 'a' };

  const reset = (store: EditorStore) => {
    const wasOpen = state.step === 'heights' && state.open;
    state = { step: 'a' };
    if (wasOpen) closeNumericInput(store);
    store.getState().setOverlay({ ghost: null, dynamicDims: [], activeDimIndex: null, guides: [] });
  };

  /** Level of the slope in progress; resets the tool when the active level changed meanwhile. */
  const currentLevel = (c: ToolContext): Level | null => {
    const level = activeLevel(c.store.getState());
    if (!level) return null;
    if (state.step !== 'a' && state.levelId !== level.id) reset(c.store);
    return level;
  };

  const snap = (e: PointerInfo, c: ToolContext, level: Level, from?: Vec2) =>
    snapVolumePoint(level, e.world, {
      pxPerCm: c.pxPerCm(),
      gridStep: c.store.getState().project?.settings.gridStep ?? 0,
      enabled: !e.alt,
      from,
      ortho: e.shift,
    });

  /** The slope of the depth step for the cursor at p (the future id is set at the commit). */
  const slopeFor = (level: Level, a: Vec2, b: Vec2, p: Vec2, raw: boolean): Slope => {
    const { side, depth } = slopeSideAndDepth(a, b, p, raw);
    return { ...createSlope(a, b, side, depth, level.height, SLOPE_DEFAULT_END), id: 'slope-preview' };
  };

  function preview(e: PointerInfo, c: ToolContext, level: Level): Vec2 {
    const st = c.store.getState();
    if (state.step === 'heights') return e.world;
    if (state.step === 'a') {
      const p = snap(e, c, level);
      st.setOverlay({ ghost: markerGhost(p), guides: p.guides, dynamicDims: [] });
      return p.point;
    }
    if (state.step === 'b') {
      const p = snap(e, c, level, state.a);
      const ghost: SlopeGhost = { kind: 'volume-slope', a: state.a, b: p.point, slope: null, marks: [state.a, p.point], marker: markerOf(p) };
      const line: DimLine = { a: state.a, b: p.point, offset: 0, value: dist(state.a, p.point), kind: 'dynamic' };
      st.setOverlay({ ghost, guides: p.guides, dynamicDims: [line] });
      return p.point;
    }
    const s = slopeFor(level, state.a, state.b, e.world, e.alt);
    const ghost: SlopeGhost = { kind: 'volume-slope', a: state.a, b: state.b, slope: s, marks: [state.a, state.b] };
    st.setOverlay({ ghost, guides: [], dynamicDims: [slopeDepthDim(s)] });
    return e.world;
  }

  function openField(c: ToolContext): void {
    if (state.step !== 'heights') return;
    state.open = true;
    const value = state.field === 'start' ? state.slope.heightStart : state.slope.heightEnd;
    openNumericInput(c.store, {
      initial: formatNumber(value),
      screen: state.screen,
      kind: 'positive',
      label: state.field === 'start' ? LABEL_START : LABEL_END,
      select: true,
    });
  }

  /** Adds the slope of the heights step with its current heights, selects it, back to the first step. */
  function commit(c: ToolContext): void {
    if (state.step !== 'heights') return;
    const { levelId, slope } = state;
    reset(c.store);
    const s: Slope = { ...slope, id: newId() };
    if (c.store.getState().execute('Ajouter une pente', addSlope(levelId, s))) c.store.getState().setSelection([{ kind: 'slope', id: s.id }]);
  }

  /** The typed value goes to the height being typed. */
  const setHeight = (value: number) => {
    if (state.step !== 'heights') return;
    state.slope = state.field === 'start' ? { ...state.slope, heightStart: value } : { ...state.slope, heightEnd: value };
  };

  return {
    id: 'slope',
    cursor: 'crosshair',

    onPointerMove(e, c) {
      const level = currentLevel(c);
      if (level) preview(e, c, level);
    },

    onPointerDown(e, c) {
      if (e.button !== 0) return;
      const level = currentLevel(c);
      if (!level || state.step === 'heights') return;
      const p = preview(e, c, level);
      if (state.step === 'a') {
        state = { step: 'b', levelId: level.id, a: p };
      } else if (state.step === 'b') {
        if (dist(state.a, p) < MIN_WALL_LENGTH) return;
        state = { step: 'depth', levelId: level.id, a: state.a, b: p };
        preview(e, c, level);
      } else {
        const slope = slopeFor(level, state.a, state.b, e.world, e.alt);
        state = { step: 'heights', levelId: level.id, slope, field: 'start', open: false, screen: e.screen };
        const ghost: SlopeGhost = { kind: 'volume-slope', a: slope.a, b: slope.b, slope, marks: [] };
        c.store.getState().setOverlay({ ghost, dynamicDims: [slopeDepthDim(slope)] });
      }
    },

    onPointerUp(_e, c) {
      if (state.step === 'heights' && !state.open) openField(c);
    },

    onKeyDown(e, c) {
      if (undoKeyOf(e)) {
        if (state.step === 'a') return false; // the plain undo
        reset(c.store);
        return true;
      }
      if (e.key !== 'Escape') return false;
      if (state.step === 'heights') commit(c);
      else if (state.step !== 'a') reset(c.store);
      else c.store.getState().setTool('select');
      return true;
    },

    onNumericTab(value, c) {
      if (state.step !== 'heights') return;
      if (value !== null) setHeight(value);
      // two values: Tab and Shift+Tab both go to the other one
      state.field = state.field === 'start' ? 'end' : 'start';
      openField(c);
    },

    onNumericSubmit(value, c) {
      setHeight(value);
      commit(c);
    },

    onNumericCancel(c) {
      // Escape or blur in the field: the slope is added with the heights given so far (spec 7.1)
      if (state.step === 'heights') {
        state.open = false;
        commit(c);
      }
    },

    onCancel(c) {
      // the release of the third click was lost (pointercancel, capture lost, window blur): the
      // heights field opens anyway, the tool never stays without it. Otherwise a click is complete
      // at its press: nothing to abandon (Escape drops the slope in progress)
      if (state.step === 'heights' && !state.open) openField(c);
    },

    onDeactivate(c) {
      // another tool while the heights are typed: the slope was created by the third click
      if (state.step === 'heights') {
        state.open = false;
        commit(c);
      }
      state = { step: 'a' };
    },
  };
}

export const slopeTool: Tool = createSlopeTool();
