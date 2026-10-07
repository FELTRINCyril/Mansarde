import { newId } from '../model/ids';
import type { Id, RoomLabel, Vec2 } from '../model/types';
import { CommandError, getLevel, touch, type Recipe } from './apply';

const ERR_POSITION = 'Position invalide';

/**
 * Rooms are computed, only their labels are stored. With an existing label the name is changed
 * (trimmed); otherwise a label is added anchored at labelPoint. A blank name removes the label
 * (nothing to do when there is none).
 */
export function renameRoom(
  levelId: Id,
  room: { label: RoomLabel | null; labelPoint: Vec2 },
  name: string,
): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const trimmed = name.trim();
    const index = room.label ? level.roomLabels.findIndex((l) => l.id === room.label!.id) : -1;
    if (room.label && index < 0) throw new CommandError('Étiquette introuvable');

    if (trimmed === '') {
      if (index < 0) return;
      level.roomLabels.splice(index, 1);
    } else if (index >= 0) {
      if (level.roomLabels[index]!.name === trimmed) return;
      level.roomLabels[index]!.name = trimmed;
    } else {
      if (!Number.isFinite(room.labelPoint.x) || !Number.isFinite(room.labelPoint.y)) {
        throw new CommandError(ERR_POSITION);
      }
      level.roomLabels.push({ id: newId(), name: trimmed, anchor: { x: room.labelPoint.x, y: room.labelPoint.y } });
    }
    touch(draft);
  };
}
