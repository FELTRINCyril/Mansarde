import { addRectRoom, addRectRoomInterior } from '@/core/commands/walls';
import { closeNumericInput, openNumericInput } from '../numericOverlay';
import { drawingEnv, EMPTY_DRAW_OVERLAY, isDigitKey, modsOf, undoKeyOf, watchActiveLevel } from './drawing';
import { RECT_IDLE, reduceRectTool, rectToolOverlay, type RectToolEvent, type RectToolState } from './rectRoomMachine';
import type { Tool, ToolContext } from './types';

/** The rectangular room tool (R): thin wiring of reduceRectTool (rectRoomMachine.ts) to the editor store; the rectangle is the inside of the room. */
export function createRectRoomTool(): Tool {
  let state: RectToolState = RECT_IDLE;

  /** Drops the drag, its ghost and its numeric field (active level or project changed). */
  const abandon = (c: ToolContext) => {
    if (state.phase === 'idle') return;
    state = RECT_IDLE;
    if (c.store.getState().tool !== 'rect') return;
    closeNumericInput(c.store);
    c.store.getState().setOverlay(EMPTY_DRAW_OVERLAY);
  };

  const owner = {};
  const dispatch = (event: RectToolEvent, c: ToolContext): void => {
    watchActiveLevel(c.store, owner, () => abandon(c));
    const env = drawingEnv(c);
    if (!env) {
      state = RECT_IDLE;
      closeNumericInput(c.store);
      c.store.getState().setOverlay(EMPTY_DRAW_OVERLAY);
      return;
    }
    const r = reduceRectTool(state, event, env);
    state = r.state;
    for (const fx of r.effects) {
      if (fx.type === 'commit') {
        // interior rectangle, or wall axes when a corner is on an existing wall (V2-R25)
        const add = fx.interior ? addRectRoomInterior : addRectRoom;
        c.store.getState().execute('Pièce rectangulaire', add(fx.levelId, fx.a, fx.b, fx.thickness, fx.height));
      } else if (fx.type === 'openNumeric') {
        openNumericInput(c.store, { initial: fx.initial, screen: fx.screen, kind: 'positive', label: fx.label });
      } else {
        closeNumericInput(c.store);
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
      if (state.phase !== 'drag') return false;
      const undo = undoKeyOf(e);
      if (undo) {
        // R32: Mod+Z abandons the rectangle, redo does nothing; the history is never touched mid-drag
        if (undo === 'undo') dispatch({ type: 'escape' }, c);
        return true;
      }
      if (e.altKey) return false;
      if (e.key === 'Escape') dispatch({ type: 'escape' }, c);
      else if (isDigitKey(e)) dispatch({ type: 'digit', key: e.key, meta: e.metaKey || e.ctrlKey }, c);
      else return false;
      return true;
    },
    onNumericTab(value, c, backward) {
      dispatch({ type: 'numericTab', value, backward }, c);
    },
    onNumericSubmit(value, c) {
      dispatch({ type: 'numericSubmit', value }, c);
    },
    onNumericCancel(c) {
      dispatch({ type: 'numericCancel' }, c);
    },
    /** Pointer cancel, capture lost or window blur during the drag: abandoned like Escape. */
    onCancel(c) {
      if (state.phase === 'drag') dispatch({ type: 'escape' }, c);
    },
    onDeactivate() {
      state = RECT_IDLE;
    },
  };
}

export const rectRoomTool: Tool = createRectRoomTool();
