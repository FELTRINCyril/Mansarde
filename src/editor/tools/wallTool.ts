import { addWallChain } from '@/core/commands/walls';
import { closeNumericInput, openNumericInput } from '../numericOverlay';
import { drawingEnv, EMPTY_DRAW_OVERLAY, isDigitKey, modsOf, undoKeyOf, watchActiveLevel } from './drawing';
import type { Tool, ToolContext } from './types';
import { reduceWallTool, WALL_IDLE, wallToolOverlay, type WallToolEvent, type WallToolState } from './wallMachine';

/** The wall tool (M): thin wiring of reduceWallTool (wallMachine.ts) to the editor store. */
export function createWallTool(): Tool {
  let state: WallToolState = WALL_IDLE;

  /** Drops the chain, its ghost and its numeric field (active level or project changed). */
  const abandon = (c: ToolContext) => {
    if (state.phase === 'idle') return;
    state = WALL_IDLE;
    if (c.store.getState().tool !== 'wall') return;
    closeNumericInput(c.store);
    c.store.getState().setOverlay(EMPTY_DRAW_OVERLAY);
  };

  const owner = {};
  const dispatch = (event: WallToolEvent, c: ToolContext): void => {
    watchActiveLevel(c.store, owner, () => abandon(c));
    const env = drawingEnv(c);
    if (!env) {
      state = WALL_IDLE;
      c.store.getState().setOverlay(EMPTY_DRAW_OVERLAY);
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
      if (e.button === 0) dispatch({ type: 'click', world: e.world, screen: e.screen, mods: modsOf(e), detail: e.detail }, c);
    },
    onPointerMove(e, c) {
      dispatch({ type: 'move', world: e.world, screen: e.screen, mods: modsOf(e) }, c);
    },
    onDoubleClick(e, c) {
      dispatch({ type: 'finish', meta: e.meta }, c);
    },
    onKeyDown(e, c) {
      if (state.phase !== 'drawing') return false;
      const undo = undoKeyOf(e);
      if (undo) {
        // R32: Mod+Z removes the last point, redo does nothing; the history is never touched mid-chain
        if (undo === 'undo') dispatch({ type: 'undoPoint' }, c);
        return true;
      }
      if (e.altKey) return false;
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') dispatch({ type: 'escape', meta }, c);
      else if (e.key === 'Enter') dispatch({ type: 'finish', meta }, c);
      else if (isDigitKey(e)) dispatch({ type: 'digit', key: e.key, meta }, c);
      else return false;
      return true; // handled: the caller prevents the default (a digit must not reach the new field)
    },
    onNumericSubmit(value, c) {
      dispatch({ type: 'numericSubmit', value }, c);
    },
    onNumericCancel(c) {
      dispatch({ type: 'numericCancel' }, c);
    },
    /**
     * Pointer cancel, capture lost or window blur: a click is complete at pointerdown, so there is
     * no press in progress to abandon; the chain is kept (Escape / Mod+Z are there to drop it).
     */
    onCancel() {},
    onDeactivate() {
      state = WALL_IDLE;
    },
  };
}

export const wallTool: Tool = createWallTool();
