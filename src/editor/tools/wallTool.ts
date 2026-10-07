import { addWallChain } from '@/core/commands/walls';
import { openNumericInput } from '../numericOverlay';
import { activeLevel } from '../store';
import type { PointerInfo, Tool, ToolContext } from './types';
import { reduceWallTool, WALL_IDLE, wallToolOverlay, type Mods, type WallToolEnv, type WallToolEvent, type WallToolState } from './wallMachine';

/** Environment of the drawing tools: active level, zoom and project settings; null without a project. */
export function drawingEnv(c: ToolContext): WallToolEnv | null {
  const st = c.store.getState();
  const level = activeLevel(st);
  if (!st.project || !level) return null;
  const s = st.project.settings;
  return {
    level,
    pxPerCm: c.pxPerCm(),
    gridStep: s.gridStep,
    thickness: s.defaultWallThickness,
    partitionThickness: s.partitionThickness,
    height: s.defaultCeilingHeight,
  };
}

export const modsOf = (e: PointerInfo): Mods => ({ shift: e.shift, alt: e.alt, meta: e.meta });

/** A plain digit (no modifier): opens the numeric field of a drawing tool. */
export const isDigitKey = (e: KeyboardEvent): boolean => /^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey;

/** The wall tool (M): thin wiring of reduceWallTool (wallMachine.ts) to the editor store. */
export function createWallTool(): Tool {
  let state: WallToolState = WALL_IDLE;

  const dispatch = (event: WallToolEvent, c: ToolContext): void => {
    const env = drawingEnv(c);
    if (!env) {
      state = WALL_IDLE;
      return;
    }
    const r = reduceWallTool(state, event, env);
    state = r.state;
    for (const fx of r.effects) {
      if (fx.type === 'commit') {
        c.store.getState().execute('Tracer des murs', addWallChain(fx.levelId, fx.points, fx.thickness, fx.height));
      } else {
        openNumericInput(c.store, { initial: fx.initial, screen: fx.screen, kind: 'positive', label: 'Longueur' });
      }
    }
    c.store.getState().setOverlay(wallToolOverlay(state, env));
  };

  return {
    id: 'wall',
    cursor: 'crosshair',
    onPointerDown(e, c) {
      if (e.button === 0) dispatch({ type: 'click', world: e.world, screen: e.screen, mods: modsOf(e) }, c);
    },
    onPointerMove(e, c) {
      dispatch({ type: 'move', world: e.world, screen: e.screen, mods: modsOf(e) }, c);
    },
    onDoubleClick(_e, c) {
      dispatch({ type: 'finish' }, c);
    },
    onKeyDown(e, c) {
      if (state.phase !== 'drawing' || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key === 'Escape') dispatch({ type: 'escape' }, c);
      else if (e.key === 'Enter') dispatch({ type: 'finish' }, c);
      else if (isDigitKey(e)) dispatch({ type: 'digit', key: e.key }, c);
      else return false;
      return true; // handled: the caller prevents the default (a digit must not reach the new field)
    },
    onNumericSubmit(value, c) {
      dispatch({ type: 'numericSubmit', value }, c);
    },
    onNumericCancel(c) {
      dispatch({ type: 'numericCancel' }, c);
    },
    onDeactivate() {
      state = WALL_IDLE;
    },
  };
}

export const wallTool: Tool = createWallTool();
