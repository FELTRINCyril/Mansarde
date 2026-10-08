import { updateBackground } from '@/core/commands/project';
import type { Id, Vec2 } from '@/core/model/types';
import { activeLevel } from '../store';
import type { Tool } from './types';

interface Drag { levelId: Id; start: Vec2; x: number; y: number }

/**
 * Move mode of the tracing image: dragging anywhere on the plan moves the image (one history
 * entry per drag). A locked image does not move. Escape cancels the drag in progress (so does an
 * interrupted press, onCancel), then leaves the mode (the "Terminer" button of the background panel
 * leaves it too).
 */
export function createMoveBackgroundTool(): Tool {
  let drag: Drag | null = null;
  return {
    id: 'moveBackground',
    cursor: 'move',
    onPointerDown(e, c) {
      if (e.button !== 0) return;
      const s = c.store.getState();
      const level = activeLevel(s);
      const bg = level?.background;
      if (!level || !bg || bg.locked) return;
      s.beginGesture("Déplacer l'image");
      drag = { levelId: level.id, start: e.world, x: bg.x, y: bg.y };
    },
    onPointerMove(e, c) {
      if (!drag) return;
      const patch = { x: drag.x + e.world.x - drag.start.x, y: drag.y + e.world.y - drag.start.y };
      c.store.getState().updateGesture(updateBackground(drag.levelId, patch));
    },
    onPointerUp(_e, c) {
      if (!drag) return;
      drag = null;
      c.store.getState().commitGesture();
    },
    onKeyDown(e, c) {
      if (e.key !== 'Escape') return false;
      const s = c.store.getState();
      if (drag) {
        drag = null;
        s.cancelGesture();
      } else s.setTool('select');
      return true;
    },
    // pointercancel, capture lost, window blur: the drag is abandoned, the image goes back
    onCancel(c) {
      if (!drag) return;
      drag = null;
      c.store.getState().cancelGesture();
    },
    onDeactivate() {
      drag = null;
    },
  };
}

export const moveBackgroundTool = createMoveBackgroundTool();
