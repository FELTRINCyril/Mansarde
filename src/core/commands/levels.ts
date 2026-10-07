import { current } from 'immer';
import { SLAB_THICKNESS } from '../model/defaults';
import { cloneLevelWithNewIds } from '../model/clone';
import { createLevel } from '../model/factory';
import type { Id } from '../model/types';
import { CommandError, getLevel, touch, type Recipe } from './apply';

const ERR_NAME = 'Nom invalide';
const ERR_ELEVATION = 'Altitude invalide';
const ERR_HEIGHT = 'Hauteur invalide';
const ERR_INDEX = 'Position invalide';
const ERR_LAST_LEVEL = 'Un projet doit garder au moins un niveau';

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new CommandError(ERR_NAME);
  return trimmed;
}

/**
 * New empty level next to the reference one. above: elevation = ref.elevation + ref.height +
 * SLAB_THICKNESS, inserted right after it. below: elevation = ref.elevation - (default ceiling
 * height + SLAB_THICKNESS), inserted right before it. Its height is the default ceiling height.
 */
export function addLevel(refLevelId: Id, where: 'above' | 'below', name: string, out?: { levelId: Id }): Recipe {
  return (draft) => {
    const ref = getLevel(draft, refLevelId);
    const levelName = requireName(name);
    const height = draft.settings.defaultCeilingHeight;
    const elevation =
      where === 'above' ? ref.elevation + ref.height + SLAB_THICKNESS : ref.elevation - (height + SLAB_THICKNESS);
    const level = createLevel(levelName, elevation, height);
    const refIndex = draft.levels.findIndex((l) => l.id === refLevelId);
    draft.levels.splice(where === 'above' ? refIndex + 1 : refIndex, 0, level);
    if (out) out.levelId = level.id;
    touch(draft);
  };
}

export function renameLevel(levelId: Id, name: string): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const trimmed = requireName(name);
    if (level.name === trimmed) return;
    level.name = trimmed;
    touch(draft);
  };
}

export function setLevelProps(levelId: Id, p: { elevation?: number; height?: number }): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    if (p.elevation !== undefined && !Number.isFinite(p.elevation)) throw new CommandError(ERR_ELEVATION);
    if (p.height !== undefined && !(Number.isFinite(p.height) && p.height > 0)) throw new CommandError(ERR_HEIGHT);
    let changed = false;
    if (p.elevation !== undefined && p.elevation !== level.elevation) {
      level.elevation = p.elevation;
      changed = true;
    }
    if (p.height !== undefined && p.height !== level.height) {
      level.height = p.height;
      changed = true;
    }
    if (changed) touch(draft);
  };
}

/** Deep copy with new ids, named name, inserted just above the source (same elevation as the source). */
export function duplicateLevel(levelId: Id, name: string, out?: { levelId: Id }): Recipe {
  return (draft) => {
    const source = getLevel(draft, levelId);
    const levelName = requireName(name);
    const copy = cloneLevelWithNewIds(current(source));
    copy.name = levelName;
    const index = draft.levels.findIndex((l) => l.id === levelId);
    draft.levels.splice(index + 1, 0, copy);
    if (out) out.levelId = copy.id;
    touch(draft);
  };
}

export function deleteLevel(levelId: Id): Recipe {
  return (draft) => {
    getLevel(draft, levelId);
    if (draft.levels.length <= 1) throw new CommandError(ERR_LAST_LEVEL);
    draft.levels.splice(
      draft.levels.findIndex((l) => l.id === levelId),
      1,
    );
    touch(draft);
  };
}

/** Moves the level to toIndex in the bottom-to-top order. */
export function moveLevel(levelId: Id, toIndex: number): Recipe {
  return (draft) => {
    getLevel(draft, levelId);
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= draft.levels.length) {
      throw new CommandError(ERR_INDEX);
    }
    const from = draft.levels.findIndex((l) => l.id === levelId);
    if (from === toIndex) return;
    const [level] = draft.levels.splice(from, 1);
    draft.levels.splice(toIndex, 0, level!);
    touch(draft);
  };
}
