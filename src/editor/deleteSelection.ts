import type { Recipe } from '@/core/commands/apply';
import { deleteDimensions } from '@/core/commands/dimensions';
import { deleteObjects } from '@/core/commands/objects';
import { deleteOpenings } from '@/core/commands/openings';
import { deleteWalls } from '@/core/commands/walls';
import type { Id } from '@/core/model/types';
import type { SelectionItem } from './selection';

/**
 * One recipe deleting the selected walls, openings, objects and manual dimensions. Rooms (a blank
 * name is not a deletion) and nodes are ignored. Order matters: deleting objects or walls also
 * removes the dimensions and openings attached to them, so those go first.
 */
export function deleteSelectionRecipe(levelId: Id, selection: SelectionItem[]): Recipe {
  const ids = (kind: SelectionItem['kind']): Id[] => [...new Set(selection.filter((i) => i.kind === kind).map((i) => i.id))];
  const dims = ids('dimension');
  const openings = ids('opening');
  const objects = ids('object');
  const walls = ids('wall');
  return (draft) => {
    if (dims.length > 0) deleteDimensions(levelId, dims)(draft);
    if (openings.length > 0) deleteOpenings(levelId, openings)(draft);
    if (objects.length > 0) deleteObjects(levelId, objects)(draft);
    if (walls.length > 0) deleteWalls(levelId, walls)(draft);
  };
}

/** Number of items deleteSelectionRecipe would act on. */
export function deletableCount(selection: SelectionItem[]): number {
  return selection.filter((i) => i.kind !== 'room' && i.kind !== 'node').length;
}
