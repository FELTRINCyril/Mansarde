import type { Draft } from 'immer';
import { MIN_WALL_LENGTH } from '../model/defaults';
import type { Id, Level, Slope, Vec2 } from '../model/types';
import { dist } from '../geometry/vec';
import { CommandError, getLevel, touch, type Recipe } from './apply';
import {
  ERR_HEIGHT,
  ERR_LENGTH,
  ERR_POSITION,
  ERR_SIZE,
  SIDES,
  isOneOf,
  isPositive,
  lookup,
  patchEntries,
  requireFinitePoint,
  translate,
  writeChanges,
} from './volumeHelpers';

const ERR_SLOPE_NOT_FOUND = 'Pente introuvable';

const requireSlope = (level: Draft<Level>, id: Id): Draft<Slope> => lookup(level.slopes, id, ERR_SLOPE_NOT_FOUND);

/** Start line at least MIN_WALL_LENGTH long, depth and heights finite and positive (spec 4.2, 10). */
function requireValidSlope(s: Slope): void {
  requireFinitePoint(s.a);
  requireFinitePoint(s.b);
  if (!isOneOf(SIDES, s.side)) throw new CommandError(ERR_POSITION);
  if (!(dist(s.a, s.b) >= MIN_WALL_LENGTH)) throw new CommandError(ERR_LENGTH);
  if (!isPositive(s.depth)) throw new CommandError(ERR_SIZE);
  if (!isPositive(s.heightStart) || !isPositive(s.heightEnd)) throw new CommandError(ERR_HEIGHT);
}

export function addSlope(levelId: Id, s: Slope): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireValidSlope(s);
    level.slopes[s.id] = structuredClone(s);
    touch(draft);
  };
}

/** The patched slope must stay valid (see addSlope); no-op without touch when nothing changes. */
export function updateSlope(levelId: Id, id: Id, patch: Partial<Omit<Slope, 'id'>>): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const s = requireSlope(level, id);
    const entries = patchEntries<Slope>(patch, ['id']);
    requireValidSlope({ ...s, ...Object.fromEntries(entries) });
    if (writeChanges(s, entries)) touch(draft);
  };
}

/** Moves the start line of each slope once by delta. */
export function moveSlopes(levelId: Id, ids: Id[], delta: Vec2): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireFinitePoint(delta);
    const slopes = new Set(ids.map((id) => requireSlope(level, id)));
    if (slopes.size === 0 || (delta.x === 0 && delta.y === 0)) return;
    for (const s of slopes) translate([s.a, s.b], delta);
    touch(draft);
  };
}

export function deleteSlopes(levelId: Id, ids: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of ids) requireSlope(level, id);
    if (ids.length === 0) return;
    for (const id of ids) delete level.slopes[id];
    touch(draft);
  };
}
