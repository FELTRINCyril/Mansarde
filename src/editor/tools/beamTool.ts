import { addBeam } from '@/core/commands/beams';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { dist } from '@/core/geometry/vec';
import { BEAM_DEFAULTS, MIN_WALL_LENGTH } from '@/core/model/defaults';
import { createBeam } from '@/core/model/factory';
import type { Beam, Id, Level, Vec2 } from '@/core/model/types';
import { activeLevel, type EditorStore } from '../store';
import { markerGhost, markerOf, undoKeyOf } from './drawing';
import type { PointerInfo, Tool, ToolContext } from './types';
import { snapVolumePoint, type BeamGhost } from './volumeTools';

/** Dynamic length dimension of a beam, drawn beside it (clear of its dashed outline). */
export function beamLengthDim(a: Vec2, b: Vec2, width: number): DimLine {
  return { a, b, offset: -(width / 2 + 15), value: dist(a, b), kind: 'dynamic' };
}

type State = { step: 'a' } | { step: 'b'; levelId: Id; a: Vec2 };

/**
 * The beam a new click pair gives: default width and drop, 'ceiling' mode, and `bottom` (used if
 * the mode is switched to 'fixed') at the level height minus the drop.
 */
export function newBeam(level: Level, a: Vec2, b: Vec2): Beam {
  return createBeam(a, b, { bottom: level.height - BEAM_DEFAULTS.drop });
}

/**
 * Beam tool (B, spec 7.1): a click, a click (snapped to wall nodes, wall middles, axes and faces by
 * snapVolumePoint and shown by the snapped cursor marker like the wall tool, Shift = horizontal or
 * vertical, Alt = free) adds a beam with the default values (addBeam), which is selected.
 * The tool stays active. Escape cancels the beam in progress, or returns to the selection tool;
 * Mod+Z drops the beam in progress.
 */
export function createBeamTool(): Tool {
  let state: State = { step: 'a' };

  const reset = (store: EditorStore) => {
    state = { step: 'a' };
    store.getState().setOverlay({ ghost: null, dynamicDims: [], activeDimIndex: null, guides: [] });
  };

  const currentLevel = (c: ToolContext): Level | null => {
    const level = activeLevel(c.store.getState());
    if (!level) return null;
    if (state.step === 'b' && state.levelId !== level.id) reset(c.store);
    return level;
  };

  function preview(e: PointerInfo, c: ToolContext, level: Level): Vec2 {
    const st = c.store.getState();
    const from = state.step === 'b' ? state.a : undefined;
    const gridStep = st.project?.settings.gridStep ?? 0;
    const p = snapVolumePoint(level, e.world, { pxPerCm: c.pxPerCm(), gridStep, enabled: !e.alt, from, ortho: e.shift });
    if (state.step === 'a') {
      st.setOverlay({ ghost: markerGhost(p), guides: p.guides, dynamicDims: [] });
    } else {
      const long = dist(state.a, p.point) >= MIN_WALL_LENGTH;
      const beam = long ? newBeam(level, state.a, p.point) : null;
      const ghost: BeamGhost = { kind: 'volume-beam', marks: [state.a, p.point], beam, marker: markerOf(p) };
      const line = beamLengthDim(state.a, p.point, BEAM_DEFAULTS.width);
      st.setOverlay({ ghost, guides: p.guides, dynamicDims: long ? [line] : [] });
    }
    return p.point;
  }

  return {
    id: 'beam',
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
      if (state.step === 'a') {
        state = { step: 'b', levelId: level.id, a: p };
        return;
      }
      if (dist(state.a, p) < MIN_WALL_LENGTH) return;
      const beam = newBeam(level, state.a, p);
      const levelId = state.levelId;
      reset(c.store);
      if (c.store.getState().execute('Ajouter une poutre', addBeam(levelId, beam))) c.store.getState().setSelection([{ kind: 'beam', id: beam.id }]);
    },

    onKeyDown(e, c) {
      if (undoKeyOf(e)) {
        if (state.step === 'a') return false;
        reset(c.store);
        return true;
      }
      if (e.key !== 'Escape') return false;
      if (state.step === 'b') reset(c.store);
      else c.store.getState().setTool('select');
      return true;
    },

    onCancel() {
      // a click is complete at its press: nothing to abandon
    },

    onDeactivate() {
      state = { step: 'a' }; // setTool already reset the overlay
    },
  };
}

export const beamTool: Tool = createBeamTool();
