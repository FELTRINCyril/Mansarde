import { roomTouchesWall, sideToMove } from '@/core/commands/roomSize';
import type { DerivedLevel } from '@/core/geometry/derived';
import type { RectRoom } from '@/core/geometry/roomRect';
import type { Level } from '@/core/model/types';

/**
 * Whether changing the width or depth of the rectangular room on the 'min' / 'max' side moves a
 * wall another room stands against (spec 6: "La pièce voisine sera modifiée."). Same walls and
 * same contact test as setRoomInteriorSize (sideToMove, roomTouchesWall).
 */
export function roomSideShared(level: Level, d: DerivedLevel, rect: RectRoom, axis: 'width' | 'depth', moveSide: 'min' | 'max'): boolean {
  const { wallIds } = sideToMove(rect, axis === 'width' ? rect.axisU : rect.axisV, moveSide);
  return d.rooms.some((r) => r.key !== rect.room.key && wallIds.some((id) => roomTouchesWall(r, level, id)));
}
