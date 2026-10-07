import polylabel from 'polylabel';
import type { Level, Ring, RoomLabel, Shape, Vec2 } from '../model/types';
import { area, pointInRing } from './polygon';
import { computeWallShape } from './walls';

export interface Room {
  key: string; // label id if labelled, else 'room-' + index (stable within one computation)
  ring: Ring; // interior boundary (a hole of the wall shape)
  area: number; // cm2
  labelPoint: Vec2; // pole of inaccessibility
  label: RoomLabel | null;
  name: string; // label name or the default room name
}

export const DEFAULT_ROOM_NAME = 'Pièce';
const LABEL_POINT_PRECISION = 1;

/**
 * Rooms are the holes of the wall shape computed without openings, so that a door never merges
 * two rooms. Each room takes the oldest unused label whose anchor lies inside its ring; labels
 * in no room, or outranked by an older one, are ignored (not deleted).
 */
export function computeRooms(level: Level, wallShape?: Shape): Room[] {
  const shape = wallShape ?? computeWallShape(level, { withOpenings: false });
  const used = new Set<string>();
  const rooms: Room[] = [];
  for (const polygon of shape) {
    for (const ring of polygon.holes) {
      const label = level.roomLabels.find((l) => !used.has(l.id) && pointInRing(l.anchor, ring)) ?? null;
      if (label) used.add(label.id);
      const [x, y] = polylabel([ring.map((p) => [p.x, p.y])], LABEL_POINT_PRECISION);
      rooms.push({
        key: label ? label.id : `room-${rooms.length}`,
        ring,
        area: area(ring),
        labelPoint: { x: x!, y: y! },
        label,
        name: label ? label.name : DEFAULT_ROOM_NAME,
      });
    }
  }
  return rooms;
}
