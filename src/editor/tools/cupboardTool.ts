import { addCupboard } from '@/core/commands/cupboards';
import { wallFaceInterval } from '@/core/geometry/clearances';
import { dot, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { CUPBOARD_DEFAULTS, SNAP_PX } from '@/core/model/defaults';
import { createCupboard } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Cupboard, Id, Level, Vec2 } from '@/core/model/types';
import { activeLevel, type EditorStore } from '../store';
import { hoveredWall } from './hover';
import type { Tool, ToolContext } from './types';
import type { CupboardGhost } from './volumeTools';

const PREVIEW_ID = 'cupboard-preview';
const ERR_NO_ROOM = 'Pas assez de place sur ce mur';

/** Where the cupboard tool would place its cupboard, and whether it fits. */
export interface CupboardPreview { cupboard: Cupboard; valid: boolean }

/**
 * Offset of a cupboard of that width centered as near as possible to `along` (rounded to 1 cm
 * unless raw) on the free stretch of its face around `along` (wallFaceInterval on that side only:
 * between the faces of the walls met on that side, the wall ends when nothing is met). `fits`
 * false when the stretch is shorter than the cupboard (the offset is then the stretch middle).
 */
export function fitCupboardOnWall(
  level: Level,
  wallId: Id,
  side: 'left' | 'right',
  width: number,
  along: number,
  raw = false,
): { offset: number; fits: boolean } {
  const [lo, hi] = wallFaceInterval(level, wallId, along, undefined, side);
  if (hi - lo < width) return { offset: (lo + hi) / 2, fits: false };
  const at = raw ? along : Math.round(along);
  return { offset: Math.min(hi - width / 2, Math.max(lo + width / 2, at)), fits: true };
}

/**
 * Pure placement rule of the cupboard tool (spec 7.1): on the wall hovered at p (hoveredWall, as
 * the door tool), the default cupboard set against the face on the side of p, centered on the
 * projection of p and pushed back so that it fits on its free stretch (fitCupboardOnWall), in
 * 'ceiling' height mode (ruling V2-R1). Invalid when the stretch is too short. Null when no wall
 * is hovered.
 */
export function cupboardPreview(level: Level, p: Vec2, tol: number, raw = false): CupboardPreview | null {
  const wallId = hoveredWall(level, p, tol);
  if (!wallId) return null;
  const f = wallFrame(level, wallId);
  const v = sub(p, f.start);
  const side = dot(v, f.normal) >= 0 ? 'left' : 'right';
  const { offset, fits } = fitCupboardOnWall(level, wallId, side, CUPBOARD_DEFAULTS.width, dot(v, f.dir), raw);
  const cupboard: Cupboard = { ...createCupboard(wallId, offset, side, { heightMode: 'ceiling' }), id: PREVIEW_ID };
  return { cupboard, valid: fits };
}

/**
 * Cupboard tool (K): hovering a wall shows the default cupboard against the face on the cursor
 * side (red when it does not fit); a click adds it (addCupboard) and selects it. The tool stays
 * active; Escape returns to the selection tool. Alt places it to the millimetre.
 */
export function createCupboardTool(): Tool {
  let preview: { levelId: Id; cupboard: Cupboard; valid: boolean } | null = null;

  const clear = (store: EditorStore) => {
    preview = null;
    if (store.getState().overlay.ghost !== null) store.getState().setOverlay({ ghost: null });
  };

  function hover(world: Vec2, alt: boolean, c: ToolContext): void {
    const st = c.store.getState();
    const level = activeLevel(st);
    const pv = level && !st.gesture ? cupboardPreview(level, world, SNAP_PX / c.pxPerCm(), alt) : null;
    if (!level || !pv) return clear(c.store);
    preview = { levelId: level.id, cupboard: pv.cupboard, valid: pv.valid };
    const ghost: CupboardGhost = { kind: 'volume-cupboard', level, cupboard: pv.cupboard, valid: pv.valid };
    st.setOverlay({ ghost });
  }

  return {
    id: 'cupboard',
    cursor: 'crosshair',

    onPointerMove(e, c) {
      hover(e.world, e.alt, c);
    },

    onPointerDown(e, c) {
      if (e.button !== 0) return;
      hover(e.world, e.alt, c);
      if (!preview) return;
      const st = c.store.getState();
      if (!preview.valid) return st.showToast(ERR_NO_ROOM);
      const cupboard = { ...preview.cupboard, id: newId() };
      if (!st.execute('Ajouter un placard', addCupboard(preview.levelId, cupboard))) return;
      c.store.getState().setSelection([{ kind: 'cupboard', id: cupboard.id }]);
      clear(c.store); // the next move shows the next preview
    },

    onKeyDown(e, c) {
      if (e.key !== 'Escape') return false;
      c.store.getState().setTool('select');
      return true;
    },

    onDeactivate() {
      preview = null; // setTool already reset the overlay
    },
  };
}

export const cupboardTool: Tool = createCupboardTool();
