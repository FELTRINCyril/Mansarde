import type { Draft } from 'immer';
import { newId } from '../model/ids';
import type { Anchor, Id, Level } from '../model/types';
import { resolveAnchor } from '../geometry/anchors';
import { dist } from '../geometry/vec';
import { CommandError, getLevel, touch, type Recipe } from './apply';

/** Two anchors closer than this (cm) do not make a dimension. */
const MIN_DIMENSION_LENGTH = 1;

const ERR_DIMENSION_NOT_FOUND = 'Cote introuvable';
const ERR_ANCHOR = 'Ancre introuvable';
const ERR_TOO_SHORT = 'Cote trop courte';
const ERR_POSITION = 'Position invalide';

function requireDimension(level: Draft<Level>, id: Id) {
  const d = level.dimensions[id];
  if (!d) throw new CommandError(ERR_DIMENSION_NOT_FOUND);
  return d;
}

/** The two resolved points must differ by at least 1 cm. out.id receives the new dimension id. */
export function addDimension(levelId: Id, a: Anchor, b: Anchor, offset: number, out?: { id: Id }): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    if (!Number.isFinite(offset)) throw new CommandError(ERR_POSITION);
    const pa = resolveAnchor(level, a);
    const pb = resolveAnchor(level, b);
    if (!pa || !pb) throw new CommandError(ERR_ANCHOR);
    if (![pa.x, pa.y, pb.x, pb.y].every(Number.isFinite)) throw new CommandError(ERR_POSITION);
    if (!(dist(pa, pb) >= MIN_DIMENSION_LENGTH)) throw new CommandError(ERR_TOO_SHORT);
    const id = newId();
    level.dimensions[id] = { id, a: structuredClone(a), b: structuredClone(b), offset };
    if (out) out.id = id;
    touch(draft);
  };
}

export function setDimensionOffset(levelId: Id, id: Id, offset: number): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const d = requireDimension(level, id);
    if (!Number.isFinite(offset)) throw new CommandError(ERR_POSITION);
    if (d.offset === offset) return;
    d.offset = offset;
    touch(draft);
  };
}

export function deleteDimensions(levelId: Id, ids: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of ids) requireDimension(level, id);
    if (ids.length === 0) return;
    for (const id of ids) delete level.dimensions[id];
    touch(draft);
  };
}
