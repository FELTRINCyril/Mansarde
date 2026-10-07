import { describe, expect, it } from 'vitest';
import { addLevel } from '@/core/commands/levels';
import { addRectRoom } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { commitRoomRename } from '@/editor/renameRoom';
import { activeLevel, createEditorStore, type RoomRename } from '@/editor/store';
import { emptyProject } from '../core/helpers';

function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
  store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  const room = deriveLevel(activeLevel(store.getState())!).rooms[0]!;
  const rename: RoomRename = { levelId, label: room.label, labelPoint: room.labelPoint, placeholder: room.name };
  return { store, levelId, rename };
}

const roomNames = (store: ReturnType<typeof setup>['store']) => deriveLevel(activeLevel(store.getState())!).rooms.map((r) => r.name);

describe('commitRoomRename', () => {
  it('renames the room of the active level and keeps it selected', () => {
    const { store, rename } = setup();
    expect(commitRoomRename(store, rename, 'Mezzanine')).toBe(true);
    expect(roomNames(store)).toEqual(['Mezzanine']);
    expect(store.getState().selection).toEqual([{ kind: 'room', id: activeLevel(store.getState())!.roomLabels[0]!.id }]);
  });

  it('does nothing once another level is active', () => {
    const { store, rename } = setup();
    store.getState().execute('Level', addLevel(store.getState().activeLevelId!, 'above', 'Étage'));
    const other = store.getState().project!.levels.find((l) => l.id !== rename.levelId)!;
    store.getState().setActiveLevel(other.id);
    const history = store.getState().history;
    expect(commitRoomRename(store, rename, 'Mezzanine')).toBe(false);
    expect(store.getState().history).toBe(history);
    expect(store.getState().toast).toBeNull();
  });
});
