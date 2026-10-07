import type { Draft } from 'immer';
import type { Id, Level, Opening } from '../model/types';
import { openingFitsWall, openingsOverlap } from '../geometry/openings';
import { wallLength } from '../geometry/walls';
import { CommandError, getLevel, touch, type Recipe } from './apply';

const ERR_WALL_NOT_FOUND = 'Mur introuvable';
const ERR_OPENING_NOT_FOUND = 'Ouverture introuvable';
const ERR_NO_ROOM = 'Pas assez de place sur ce mur';
const ERR_SIZE = 'Dimension invalide';
const ERR_POSITION = 'Position invalide';

type DLevel = Draft<Level>;

const isFiniteNumber = (n: number): boolean => Number.isFinite(n);

function requireOpening(level: DLevel, id: Id): Draft<Opening> {
  const o = level.openings[id];
  if (!o) throw new CommandError(ERR_OPENING_NOT_FOUND);
  return o;
}

function requireValidNumbers(o: Opening): void {
  if (!isFiniteNumber(o.offset)) throw new CommandError(ERR_POSITION);
  if (!isFiniteNumber(o.width) || !(o.width > 0)) throw new CommandError(ERR_SIZE);
  if (!isFiniteNumber(o.height) || !(o.height > 0)) throw new CommandError(ERR_SIZE);
  if (!isFiniteNumber(o.sillHeight) || o.sillHeight < 0) throw new CommandError(ERR_SIZE);
}

/** The opening must lie within its wall and not overlap another opening of that wall. */
function requireRoom(level: DLevel, o: Opening): void {
  if (!level.walls[o.wallId]) throw new CommandError(ERR_WALL_NOT_FOUND);
  if (!openingFitsWall(o, wallLength(level, o.wallId))) throw new CommandError(ERR_NO_ROOM);
  for (const other of Object.values(level.openings)) {
    if (other.id !== o.id && other.wallId === o.wallId && openingsOverlap(o, other)) {
      throw new CommandError(ERR_NO_ROOM);
    }
  }
}

/** Refused (CommandError) when the opening does not fit its wall or overlaps another opening. */
export function addOpening(levelId: Id, opening: Opening): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireValidNumbers(opening);
    requireRoom(level, opening);
    level.openings[opening.id] = { ...opening };
    touch(draft);
  };
}

/** Moves an opening along its wall or onto another wall, with the same checks as addOpening. */
export function moveOpening(levelId: Id, openingId: Id, wallId: Id, offset: number): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const o = requireOpening(level, openingId);
    const candidate: Opening = { ...o, wallId, offset };
    requireValidNumbers(candidate);
    requireRoom(level, candidate);
    if (o.wallId === wallId && o.offset === offset) return;
    o.wallId = wallId;
    o.offset = offset;
    touch(draft);
  };
}

export function updateOpening(
  levelId: Id,
  openingId: Id,
  patch: Partial<Omit<Opening, 'id' | 'wallId'>>,
): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const o = requireOpening(level, openingId);
    const changes = Object.entries(patch).filter(
      ([key, value]) => value !== undefined && key !== 'id' && key !== 'wallId',
    ) as Array<[keyof Opening, never]>;
    const candidate: Opening = { ...o, ...Object.fromEntries(changes) };
    requireValidNumbers(candidate);
    requireRoom(level, candidate);
    let changed = false;
    for (const [key, value] of changes) {
      if (o[key] === value) continue;
      (o as Record<keyof Opening, unknown>)[key] = value;
      changed = true;
    }
    if (changed) touch(draft);
  };
}

export function deleteOpenings(levelId: Id, ids: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of ids) requireOpening(level, id);
    if (ids.length === 0) return;
    for (const id of ids) delete level.openings[id];
    touch(draft);
  };
}
