import type { Draft } from 'immer';
import { MAX_CUPBOARD_DOORS } from '../model/defaults';
import type { Cupboard, Id, Level } from '../model/types';
import { fitCupboardOnWall } from '../geometry/clearances';
import { cupboardFitsWall, cupboardTopProfile } from '../geometry/cupboards';
import { wallLength } from '../geometry/walls';
import { CommandError, getLevel, touch, type Recipe } from './apply';
import { levelSnapshot } from './reconcile';
import { ERR_POSITION, ERR_SIZE, SIDES, isNonNegative, isOneOf, isPositive, lookup, patchEntries, writeChanges } from './volumeHelpers';

const ERR_CUPBOARD_NOT_FOUND = 'Placard introuvable';
const ERR_WALL_NOT_FOUND = 'Mur introuvable';
const ERR_NO_ROOM = 'Pas assez de place sur ce mur';
const ERR_DOORS = 'Nombre de portes invalide';

/** Below this (cm), the offset given by the free stretch is the current one (no spurious patch). */
const OFFSET_EPS = 1e-9;

const HEIGHT_MODES = ['fixed', 'ceiling'] as const;
const DOOR_TYPES = ['hinged', 'sliding'] as const;

type DLevel = Draft<Level>;

const requireCupboard = (level: DLevel, id: Id): Draft<Cupboard> => lookup(level.cupboards, id, ERR_CUPBOARD_NOT_FOUND);

function requireValidNumbers(c: Cupboard): void {
  if (!Number.isFinite(c.offset) || !isOneOf(SIDES, c.side)) throw new CommandError(ERR_POSITION);
  if (!isPositive(c.width) || !isPositive(c.depth) || !isPositive(c.height)) throw new CommandError(ERR_SIZE);
  if (!isNonNegative(c.plinth) || !isNonNegative(c.gap)) throw new CommandError(ERR_SIZE);
  if (!isOneOf(HEIGHT_MODES, c.heightMode) || !isOneOf(DOOR_TYPES, c.doorType)) throw new CommandError(ERR_SIZE);
  if (!Number.isInteger(c.doorCount) || c.doorCount < 1 || c.doorCount > MAX_CUPBOARD_DOORS) throw new CommandError(ERR_DOORS);
}

/** The cupboard must lie within the length of its wall (spec 4.4); cupboards may overlap each other. */
function requireRoom(level: DLevel, c: Cupboard): void {
  if (!Object.hasOwn(level.walls, c.wallId)) throw new CommandError(ERR_WALL_NOT_FOUND);
  if (!cupboardFitsWall(c, wallLength(level, c.wallId))) throw new CommandError(ERR_NO_ROOM);
}

/**
 * Fixed mode: the plinth under the top. Ceiling mode: the gap under the level ceiling, and the
 * plinth under the real top, i.e. the lowest point of the top under slopes and beams (ceiling
 * minus gap, cupboardTopProfile); called once the wall is known to exist.
 */
function requireConsistentHeights(level: DLevel, c: Cupboard): void {
  if (c.heightMode === 'fixed' && !(c.plinth < c.height)) throw new CommandError(ERR_SIZE);
  if (c.heightMode === 'ceiling') {
    if (!(c.gap < level.height)) throw new CommandError(ERR_SIZE);
    const lowestTop = Math.min(...cupboardTopProfile(level as Level, c).map((p) => p.top));
    if (!(c.plinth < lowestTop)) throw new CommandError(ERR_SIZE);
  }
}

/** The fields whose change re-validates the heights (requireConsistentHeights). */
const HEIGHT_KEYS: ReadonlySet<keyof Cupboard> = new Set<keyof Cupboard>(['plinth', 'heightMode', 'height', 'gap']);

/**
 * Numbers and room on the wall always; the heights only when `checkHeights` (a new cupboard, or a
 * patch changing one of HEIGHT_KEYS). A later slope, beam or level height edit may leave a
 * ceiling-mode cupboard's top under its plinth: the checks engine flags it (ruling V2-R36), and
 * the edits that do not touch the heights (colour, doors, a move, the other face) stay possible.
 */
function requireValidCupboard(level: DLevel, c: Cupboard, checkHeights: boolean): void {
  requireValidNumbers(c);
  requireRoom(level, c);
  if (checkHeights) requireConsistentHeights(level, c);
}

/** Refused (CommandError) when the cupboard does not fit its wall or a value is invalid. */
export function addCupboard(levelId: Id, c: Cupboard): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireValidCupboard(level, c, true);
    level.cupboards[c.id] = { ...c };
    touch(draft);
  };
}

/** Moves a cupboard along its wall or onto another wall (and face); the heights are not re-validated (see requireValidCupboard). */
export function moveCupboard(levelId: Id, id: Id, wallId: Id, offset: number, side?: 'left' | 'right'): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const c = requireCupboard(level, id);
    const candidate: Cupboard = { ...c, wallId, offset, side: side ?? c.side };
    requireValidCupboard(level, candidate, false);
    if (c.wallId === candidate.wallId && c.offset === candidate.offset && c.side === candidate.side) return;
    c.wallId = candidate.wallId;
    c.offset = candidate.offset;
    c.side = candidate.side;
    touch(draft);
  };
}

/**
 * The patched cupboard must stay valid and fit its wall (the offset is the center, so a wider
 * cupboard grows on both sides, then is pushed back onto the free stretch of its face like the
 * cupboard tool does, ruling V2-R32); the heights are re-validated only when the patch changes
 * one of HEIGHT_KEYS. doorCount is not recomputed from a new width. No-op without touch
 * when nothing changes.
 */
export function updateCupboard(levelId: Id, id: Id, patch: Partial<Omit<Cupboard, 'id' | 'wallId'>>): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const c = requireCupboard(level, id);
    const entries = patchEntries<Cupboard>(patch, ['id', 'wallId']);
    const next: Cupboard = { ...c, ...Object.fromEntries(entries) };
    requireValidNumbers(next);
    if (next.width !== c.width || next.side !== c.side) {
      // a wider cupboard (or one on the other face) stays on the free stretch of its face, as the
      // cupboard tool places it (ruling V2-R32): pushed back from a corner wall, refused when too long
      const snap = levelSnapshot(level);
      if (!Object.hasOwn(snap.walls, next.wallId)) throw new CommandError(ERR_WALL_NOT_FOUND);
      const fit = fitCupboardOnWall(snap, next.wallId, next.side, next.width, next.offset, true);
      if (!fit.fits) throw new CommandError(ERR_NO_ROOM);
      if (Math.abs(fit.offset - next.offset) > OFFSET_EPS) entries.push(['offset', fit.offset]);
      next.offset = fit.offset;
    }
    const heightsChange = entries.some(([key, value]) => HEIGHT_KEYS.has(key) && value !== c[key]);
    requireValidCupboard(level, next, heightsChange);
    if (writeChanges(c, entries)) touch(draft);
  };
}

export function deleteCupboards(levelId: Id, ids: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of ids) requireCupboard(level, id);
    if (ids.length === 0) return;
    for (const id of ids) delete level.cupboards[id];
    touch(draft);
  };
}
