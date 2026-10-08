import type { Draft } from 'immer';
import { MIN_WALL_LENGTH } from '../model/defaults';
import type { Beam, Id, Level, Vec2 } from '../model/types';
import { dist } from '../geometry/vec';
import { CommandError, getLevel, touch, type Recipe } from './apply';
import {
  ERR_HEIGHT,
  ERR_LENGTH,
  ERR_POSITION,
  ERR_SIZE,
  isOneOf,
  isPositive,
  lookup,
  patchEntries,
  requireFinitePoint,
  translate,
  writeChanges,
} from './volumeHelpers';

const ERR_BEAM_NOT_FOUND = 'Poutre introuvable';
const MODES = ['ceiling', 'fixed'] as const;

const requireBeam = (level: Draft<Level>, id: Id): Draft<Beam> => lookup(level.beams, id, ERR_BEAM_NOT_FOUND);

/** Axis at least MIN_WALL_LENGTH long, width, drop and bottom finite and positive (spec 4.3, 10). */
function requireValidBeam(b: Beam): void {
  requireFinitePoint(b.a);
  requireFinitePoint(b.b);
  if (!isOneOf(MODES, b.mode)) throw new CommandError(ERR_POSITION);
  if (!(dist(b.a, b.b) >= MIN_WALL_LENGTH)) throw new CommandError(ERR_LENGTH);
  if (!isPositive(b.width) || !isPositive(b.drop)) throw new CommandError(ERR_SIZE);
  if (!isPositive(b.bottom)) throw new CommandError(ERR_HEIGHT);
}

export function addBeam(levelId: Id, b: Beam): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireValidBeam(b);
    level.beams[b.id] = structuredClone(b);
    touch(draft);
  };
}

/** The patched beam must stay valid (see addBeam); no-op without touch when nothing changes. */
export function updateBeam(levelId: Id, id: Id, patch: Partial<Omit<Beam, 'id'>>): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const b = requireBeam(level, id);
    const entries = patchEntries<Beam>(patch, ['id']);
    requireValidBeam({ ...b, ...Object.fromEntries(entries) });
    if (writeChanges(b, entries)) touch(draft);
  };
}

/** Moves both ends of each beam once by delta. */
export function moveBeams(levelId: Id, ids: Id[], delta: Vec2): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireFinitePoint(delta);
    const beams = new Set(ids.map((id) => requireBeam(level, id)));
    if (beams.size === 0 || (delta.x === 0 && delta.y === 0)) return;
    for (const b of beams) translate([b.a, b.b], delta);
    touch(draft);
  };
}

export function deleteBeams(levelId: Id, ids: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of ids) requireBeam(level, id);
    if (ids.length === 0) return;
    for (const id of ids) delete level.beams[id];
    touch(draft);
  };
}
