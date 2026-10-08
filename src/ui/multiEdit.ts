import type { Recipe } from '@/core/commands/apply';
import { updateObject } from '@/core/commands/objects';
import type { Id, PlacedObject } from '@/core/model/types';

export type ObjectPatch = Partial<Omit<PlacedObject, 'id' | 'source'>>;

/** One command applying the same patch to several objects (one history entry). */
export function updateObjectsRecipe(levelId: Id, ids: Id[], patch: ObjectPatch): Recipe {
  return (draft) => {
    for (const id of ids) updateObject(levelId, id, patch)(draft);
  };
}

