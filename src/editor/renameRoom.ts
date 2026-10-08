import { renameRoom } from '@/core/commands/rooms';
import { deriveLevel } from '@/core/geometry/derived';
import { pointInRing } from '@/core/geometry/polygon';
import type { Id, RoomLabel, Vec2 } from '@/core/model/types';
import type { EditorStore, RoomRename } from './store';

/**
 * Renames a room (one history entry, blank = back to the default name) and keeps it selected: the
 * room key follows its label, so the renamed room is found again by its label point.
 */
export function renameRoomAt(store: EditorStore, levelId: Id, room: { label: RoomLabel | null; labelPoint: Vec2 }, name: string): boolean {
  const s = store.getState();
  if (!s.execute('Renommer la pièce', renameRoom(levelId, room, name))) return false;
  const level = store.getState().project?.levels.find((l) => l.id === levelId);
  const renamed = level && deriveLevel(level).rooms.find((r) => pointInRing(room.labelPoint, r.ring));
  if (renamed && store.getState().activeLevelId === levelId) store.getState().setSelection([{ kind: 'room', id: renamed.key }]);
  return true;
}

/**
 * Applies the in-place room name field (overlay.rename) with the typed text. Nothing happens when
 * its level is no longer the active one (or no longer exists): the field belonged to another view.
 */
export function commitRoomRename(store: EditorStore, rename: RoomRename, text: string): boolean {
  const s = store.getState();
  if (s.activeLevelId !== rename.levelId || !s.project?.levels.some((l) => l.id === rename.levelId)) return false;
  return renameRoomAt(store, rename.levelId, rename, text);
}
