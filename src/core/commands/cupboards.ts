import type { Draft } from 'immer';
import { MAX_CUPBOARD_DOORS } from '../model/defaults';
import type { Cupboard, Id, Level } from '../model/types';
import { wallLength } from '../geometry/walls';
import { CommandError, getLevel, touch, type Recipe } from './apply';
import { ERR_POSITION, ERR_SIZE, SIDES, isNonNegative, isOneOf, isPositive, lookup, patchEntries, writeChanges } from './volumeHelpers';

const ERR_CUPBOARD_NOT_FOUND = 'Placard introuvable';
const ERR_WALL_NOT_FOUND = 'Mur introuvable';
const ERR_NO_ROOM = 'Pas assez de place sur ce mur';
const ERR_DOORS = 'Nombre de portes invalide';

const HEIGHT_MODES = ['fixed', 'ceiling'] as const;
const DOOR_TYPES = ['hinged', 'sliding'] as const;
const FIT_EPS = 1e-6; // same tolerance as openingFitsWall and validateProject

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
  const len = wallLength(level, c.wallId);
  if (!(c.offset - c.width / 2 >= -FIT_EPS && c.offset + c.width / 2 <= len + FIT_EPS)) throw new CommandError(ERR_NO_ROOM);
}

function requireValidCupboard(level: DLevel, c: Cupboard): void {
  requireValidNumbers(c);
  requireRoom(level, c);
}

/** Refused (CommandError) when the cupboard does not fit its wall or a value is invalid. */
export function addCupboard(levelId: Id, c: Cupboard): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireValidCupboard(level, c);
    level.cupboards[c.id] = { ...c };
    touch(draft);
  };
}

/** Moves a cupboard along its wall or onto another wall (and face), with the same checks as addCupboard. */
export function moveCupboard(levelId: Id, id: Id, wallId: Id, offset: number, side?: 'left' | 'right'): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const c = requireCupboard(level, id);
    const candidate: Cupboard = { ...c, wallId, offset, side: side ?? c.side };
    requireValidCupboard(level, candidate);
    if (c.wallId === candidate.wallId && c.offset === candidate.offset && c.side === candidate.side) return;
    c.wallId = candidate.wallId;
    c.offset = candidate.offset;
    c.side = candidate.side;
    touch(draft);
  };
}

/**
 * The patched cupboard must stay valid and fit its wall (the offset is the center, so a wider
 * cupboard grows on both sides). doorCount is not recomputed from a new width. No-op without touch
 * when nothing changes.
 */
export function updateCupboard(levelId: Id, id: Id, patch: Partial<Omit<Cupboard, 'id' | 'wallId'>>): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const c = requireCupboard(level, id);
    const entries = patchEntries<Cupboard>(patch, ['id', 'wallId']);
    requireValidCupboard(level, { ...c, ...Object.fromEntries(entries) });
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
