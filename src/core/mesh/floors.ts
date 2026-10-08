import type { Room } from '../geometry/rooms';
import { MeshBuilder, UP } from './builder';
import { toCell } from './cells';
import type { MeshData } from './types';

/** Floor of a room at height 0: its ring minus its islands, facing up, UV = plan coordinates in meters. */
export function buildFloor(room: Room): MeshData {
  const b = new MeshBuilder();
  const cell = toCell({ outer: room.ring, holes: room.islands });
  if (cell) b.surface(cell.pts, cell.tris, () => 0, 'up', UP);
  return b.build();
}
