import { addRectRoom } from '@/core/commands/walls';
import { openNumericInput } from '../numericOverlay';
import { RECT_IDLE, reduceRectTool, rectToolOverlay, type RectToolEvent, type RectToolState } from './rectRoomMachine';
import type { Tool, ToolContext } from './types';
import { drawingEnv, isDigitKey, modsOf } from './wallTool';

/** The rectangular room tool (R): thin wiring of reduceRectTool (rectRoomMachine.ts) to the editor store. */
export function createRectRoomTool(): Tool {
  let state: RectToolState = RECT_IDLE;

  const dispatch = (event: RectToolEvent, c: ToolContext): void => {
    const env = drawingEnv(c);
    if (!env) {
      state = RECT_IDLE;
      return;
    }
    const r = reduceRectTool(state, event, env);
    state = r.state;
    for (const fx of r.effects) {
      if (fx.type === 'commit') {
        c.store.getState().execute('Pièce rectangulaire', addRectRoom(fx.levelId, fx.a, fx.b, fx.thickness, fx.height));
      } else {
        openNumericInput(c.store, { initial: fx.initial, screen: fx.screen, kind: 'positive', label: fx.label });
      }
    }
    c.store.getState().setOverlay(rectToolOverlay(state, env));
  };

  return {
    id: 'rect',
    cursor: 'crosshair',
    onPointerDown(e, c) {
      if (e.button === 0) dispatch({ type: 'down', world: e.world, screen: e.screen, mods: modsOf(e) }, c);
    },
    onPointerMove(e, c) {
      dispatch({ type: 'move', world: e.world, screen: e.screen, mods: modsOf(e) }, c);
    },
    onPointerUp(e, c) {
      if (e.button === 0) dispatch({ type: 'up', world: e.world, screen: e.screen, mods: modsOf(e) }, c);
    },
    onKeyDown(e, c) {
      if (state.phase !== 'drag' || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key === 'Escape') dispatch({ type: 'escape' }, c);
      else if (isDigitKey(e)) dispatch({ type: 'digit', key: e.key }, c);
      else return false;
      return true;
    },
    onNumericTab(value, c) {
      dispatch({ type: 'numericTab', value }, c);
    },
    onNumericSubmit(value, c) {
      dispatch({ type: 'numericSubmit', value }, c);
    },
    onNumericCancel(c) {
      dispatch({ type: 'numericCancel' }, c);
    },
    onDeactivate() {
      state = RECT_IDLE;
    },
  };
}

export const rectRoomTool: Tool = createRectRoomTool();
