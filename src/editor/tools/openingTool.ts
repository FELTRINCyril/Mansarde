import { addOpening } from '@/core/commands/openings';
import { wallFaceInterval } from '@/core/geometry/clearances';
import { openingsOverlap } from '@/core/geometry/openings';
import { dot, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { OPENING_DEFAULTS, SNAP_PX } from '@/core/model/defaults';
import { createOpening } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Id, Level, Opening, Vec2 } from '@/core/model/types';
import { activeLevel, type EditorStore } from '../store';
import { measureOpening } from './clearanceDims';
import { hoveredWall } from './selectTool';
import type { Tool, ToolContext } from './types';

export type PlacedOpeningKind = 'door' | 'window';

/** Where the door or window tool would place its opening: the default opening on the hovered wall. */
export interface OpeningPreview { opening: Opening; valid: boolean }

/**
 * Ghost payload of the door and window tools (overlay.ghost): the opening drawn with its real
 * symbol on `level` (OpeningGhostView), in red when it does not fit.
 */
export interface OpeningGhost { kind: 'opening'; level: Level; opening: Opening; valid: boolean }

export function isOpeningGhost(g: unknown): g is OpeningGhost {
  return typeof g === 'object' && g !== null && (g as { kind?: unknown }).kind === 'opening';
}

const PREVIEW_ID = 'opening-preview';
const ERR_NO_ROOM = 'Pas assez de place sur ce mur';
const LABELS: Record<PlacedOpeningKind, string> = { door: 'Ajouter une porte', window: 'Ajouter une fenêtre' };

/**
 * Pure placement rule of the door / window tools: on the wall whose axis is within half its
 * thickness + tol of p (the closest), the default opening of that kind centered on the projection
 * of p (rounded to 1 cm unless raw), pushed back so that it fits on the free stretch of the wall
 * between the faces of the walls met at its ends (wallFaceInterval; the wall ends when nothing
 * meets them), opening towards the side of the wall p is on. Invalid when that stretch is shorter
 * than the opening or the opening overlaps another one of that wall. Null when no wall is hovered.
 */
export function openingPreview(level: Level, kind: PlacedOpeningKind, p: Vec2, tol: number, raw = false): OpeningPreview | null {
  const wallId = hoveredWall(level, p, tol);
  if (!wallId) return null;
  const f = wallFrame(level, wallId);
  const [lo, hi] = wallFaceInterval(level, wallId);
  const width = OPENING_DEFAULTS[kind].width;
  const v = sub(p, f.start);
  const along = dot(v, f.dir);
  const fits = hi - lo >= width;
  const offset = fits ? Math.min(hi - width / 2, Math.max(lo + width / 2, raw ? along : Math.round(along))) : (lo + hi) / 2;
  const swing = dot(v, f.normal) >= 0 ? 'left' : 'right';
  const opening: Opening = { ...createOpening(wallId, kind, offset, { swing }), id: PREVIEW_ID };
  const free = !Object.values(level.openings).some((o) => o.wallId === wallId && openingsOverlap(o, opening));
  return { opening, valid: fits && free };
}

/**
 * Door (P) and window (F) tools: hovering a wall shows the default opening with its real symbol
 * (red when it does not fit) and its clearances; a click adds it (addOpening) and selects it. The
 * tool stays active for the next one; Escape returns to the selection tool. Alt places it to the
 * millimetre instead of the centimetre.
 */
export function createOpeningTool(kind: PlacedOpeningKind): Tool {
  let preview: { levelId: Id; opening: Opening; valid: boolean } | null = null;

  const clear = (store: EditorStore) => {
    preview = null;
    const o = store.getState().overlay;
    if (o.ghost !== null || o.dynamicDims.length > 0) store.getState().setOverlay({ ghost: null, dynamicDims: [], activeDimIndex: null });
  };

  function hover(world: Vec2, alt: boolean, c: ToolContext): void {
    const st = c.store.getState();
    const level = activeLevel(st);
    const pv = level && !st.gesture ? openingPreview(level, kind, world, SNAP_PX / c.pxPerCm(), alt) : null;
    if (!level || !pv) return clear(c.store);
    preview = { levelId: level.id, opening: pv.opening, valid: pv.valid };
    const ghost: OpeningGhost = { kind: 'opening', level, opening: pv.opening, valid: pv.valid };
    st.setOverlay({ ghost, dynamicDims: pv.valid ? measureOpening(level, pv.opening).dims : [], activeDimIndex: null });
  }

  return {
    id: kind,
    cursor: 'crosshair',

    onPointerMove(e, c) {
      hover(e.world, e.alt, c);
    },

    onPointerDown(e, c) {
      if (e.button !== 0) return;
      hover(e.world, e.alt, c);
      if (!preview) return;
      const st = c.store.getState();
      // the command accepts an opening reaching into a neighbour wall, the tool does not
      if (!preview.valid) return st.showToast(ERR_NO_ROOM);
      const opening = { ...preview.opening, id: newId() };
      if (!st.execute(LABELS[kind], addOpening(preview.levelId, opening))) return;
      c.store.getState().setSelection([{ kind: 'opening', id: opening.id }]);
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

export const doorTool: Tool = createOpeningTool('door');
export const windowTool: Tool = createOpeningTool('window');
