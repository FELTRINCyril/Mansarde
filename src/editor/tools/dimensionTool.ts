import { addDimension, MIN_DIMENSION_LENGTH } from '@/core/commands/dimensions';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { objectCorners } from '@/core/geometry/objects';
import { dist, dot, normalize, perp, sub } from '@/core/geometry/vec';
import { SNAP_PX } from '@/core/model/defaults';
import type { Anchor, Id, Level, Vec2 } from '@/core/model/types';
import { activeLevel, type EditorStore } from '../store';
import type { OutlineGhost, PointerInfo, Tool, ToolContext } from './types';

/** A clicked point of the dimension tool: its anchor and where it is now. */
export interface DimensionPoint { anchor: Anchor; point: Vec2; snapped: boolean }

/**
 * Snapping of the dimension tool (ruling R17): the nearest wall node within tol, else the nearest
 * object corner within tol, else the free point itself. Wall faces are not snap targets. With
 * `enabled` false (Alt), always the free point.
 */
export function snapDimensionPoint(level: Level, p: Vec2, tol: number, enabled = true): DimensionPoint {
  if (enabled) {
    let best: DimensionPoint | null = null;
    let bestD = tol;
    for (const n of Object.values(level.nodes)) {
      const d = dist(p, n);
      if (d < bestD) {
        bestD = d;
        best = { anchor: { kind: 'node', nodeId: n.id }, point: { x: n.x, y: n.y }, snapped: true };
      }
    }
    if (best) return best;
    for (const o of Object.values(level.objects)) {
      objectCorners(o).forEach((c, i) => {
        const d = dist(p, c);
        if (d < bestD) {
          bestD = d;
          best = { anchor: { kind: 'objectCorner', objectId: o.id, corner: i as 0 | 1 | 2 | 3 }, point: c, snapped: true };
        }
      });
    }
    if (best) return best;
  }
  return { anchor: { kind: 'point', x: p.x, y: p.y }, point: { x: p.x, y: p.y }, snapped: false };
}

/** Signed offset of the dimension line through `cursor`, along perp(b - a) (DimLine convention). */
function offsetThrough(a: Vec2, b: Vec2, cursor: Vec2, raw: boolean): number {
  const v = dot(sub(cursor, a), normalize(perp(sub(b, a))));
  return raw ? v : Math.round(v) + 0;
}

type State =
  | { step: 'first' }
  | { step: 'second'; levelId: Id; a: DimensionPoint }
  | { step: 'offset'; levelId: Id; a: DimensionPoint; b: DimensionPoint };

/**
 * Dimension tool (C): a click on the first point, a click on the second (both snapped by
 * snapDimensionPoint, Alt = free), then the line follows the cursor and a third click fixes its
 * offset (1 cm steps, free with Alt) and adds the dimension (addDimension), which is selected. The
 * tool stays active. Escape cancels the dimension in progress, or returns to the selection tool.
 */
export function createDimensionTool(): Tool {
  let state: State = { step: 'first' };

  const reset = (store: EditorStore) => {
    state = { step: 'first' };
    store.getState().setOverlay({ ghost: null, dynamicDims: [], activeDimIndex: null });
  };

  /** Level of the dimension in progress; resets the tool when the active level changed meanwhile. */
  const currentLevel = (c: ToolContext): Level | null => {
    const level = activeLevel(c.store.getState());
    if (!level) return null;
    if (state.step !== 'first' && state.levelId !== level.id) reset(c.store);
    return level;
  };

  function preview(e: PointerInfo, c: ToolContext, level: Level): DimensionPoint {
    const p = snapDimensionPoint(level, e.world, SNAP_PX / c.pxPerCm(), !e.alt);
    const st = c.store.getState();
    const marks = (pts: DimensionPoint[]): OutlineGhost => ({ kind: 'outline', rings: [], points: pts.filter((x) => x.snapped).map((x) => x.point) });
    if (state.step === 'first') {
      st.setOverlay({ ghost: marks([p]), dynamicDims: [] });
    } else if (state.step === 'second') {
      const line: DimLine = { a: state.a.point, b: p.point, offset: 0, value: dist(state.a.point, p.point), kind: 'dynamic' };
      st.setOverlay({ ghost: marks([state.a, p]), dynamicDims: [line] });
    } else {
      const { a, b } = state;
      const line: DimLine = { a: a.point, b: b.point, offset: offsetThrough(a.point, b.point, e.world, e.alt), value: dist(a.point, b.point), kind: 'dynamic' };
      st.setOverlay({ ghost: marks([a, b]), dynamicDims: [line] });
    }
    return p;
  }

  return {
    id: 'dimension',
    cursor: 'crosshair',

    onPointerMove(e, c) {
      const level = currentLevel(c);
      if (level) preview(e, c, level);
    },

    onPointerDown(e, c) {
      if (e.button !== 0) return;
      const level = currentLevel(c);
      if (!level) return;
      const p = preview(e, c, level);
      if (state.step === 'first') {
        state = { step: 'second', levelId: level.id, a: p };
      } else if (state.step === 'second') {
        if (dist(state.a.point, p.point) < MIN_DIMENSION_LENGTH) return;
        state = { step: 'offset', levelId: level.id, a: state.a, b: p };
        preview(e, c, level);
      } else {
        const { a, b, levelId } = state;
        const out = { id: '' };
        const offset = offsetThrough(a.point, b.point, e.world, e.alt);
        const ok = c.store.getState().execute('Ajouter une cote', addDimension(levelId, a.anchor, b.anchor, offset, out));
        reset(c.store);
        if (ok) c.store.getState().setSelection([{ kind: 'dimension', id: out.id }]);
      }
    },

    onKeyDown(e, c) {
      if (e.key !== 'Escape') return false;
      if (state.step !== 'first') reset(c.store);
      else c.store.getState().setTool('select');
      return true;
    },

    onDeactivate() {
      state = { step: 'first' }; // setTool already reset the overlay
    },
  };
}

export const dimensionTool: Tool = createDimensionTool();
