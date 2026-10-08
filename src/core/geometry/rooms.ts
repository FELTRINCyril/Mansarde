import polylabel from 'polylabel';
import type { Level, Ring, RoomLabel, Shape, Vec2 } from '../model/types';
import { area, pointInRing } from './polygon';
import { computeWallShape } from './walls';

export interface Room {
  key: string; // label id if labelled, else 'room-' + index (stable within one computation)
  ring: Ring; // interior boundary (a hole of the wall shape)
  islands: Ring[]; // outer rings of free-standing wall shapes directly inside this room (closets, boxes)
  area: number; // cm2, net of the islands footprint
  labelPoint: Vec2; // pole of inaccessibility of the ring minus the islands
  label: RoomLabel | null;
  name: string; // label name or the default room name
}

export const DEFAULT_ROOM_NAME = 'Pièce';
const LABEL_POINT_PRECISION = 1;
/** Holes smaller than this (cm2) are slivers left by the boolean library, not rooms. */
const MIN_ROOM_AREA = 1;

const roomHoles = (polygon: Shape[number]): Ring[] => polygon.holes.filter((h) => area(h) >= MIN_ROOM_AREA);

/** Outer rings of the shape polygons lying directly inside each hole (innermost enclosing hole wins). */
function islandsByHole(shape: Shape): Map<Ring, Ring[]> {
  const holes = shape.flatMap(roomHoles);
  const islands = new Map<Ring, Ring[]>(holes.map((hole) => [hole, []]));
  const holeAreas = new Map(holes.map((hole) => [hole, area(hole)]));
  for (const polygon of shape) {
    const probe = polygon.outer[0];
    if (!probe) continue;
    let owner: Ring | null = null;
    for (const hole of holes) {
      if (!pointInRing(probe, hole)) continue;
      if (owner === null || holeAreas.get(hole)! < holeAreas.get(owner)!) owner = hole;
    }
    if (owner) islands.get(owner)!.push(polygon.outer);
  }
  return islands;
}

const toPolylabelRing = (ring: Ring): number[][] => ring.map((p) => [p.x, p.y]);

/**
 * Rooms are the holes of the wall shape computed without openings, so that a door never merges
 * two rooms (holes under MIN_ROOM_AREA are boolean slivers, not rooms). A closed wall shape standing free inside a hole is an island: it is subtracted from
 * the room area and from label matching and label point. Each room takes the oldest unused label
 * whose anchor lies inside its ring and outside its islands; labels in no room, or outranked by
 * an older one, are ignored (not deleted).
 */
export function computeRooms(level: Level, wallShape?: Shape): Room[] {
  const shape = wallShape ?? computeWallShape(level, { withOpenings: false });
  const islandsOf = islandsByHole(shape);
  const used = new Set<string>();
  const rooms: Room[] = [];
  for (const polygon of shape) {
    for (const ring of roomHoles(polygon)) {
      const islands = islandsOf.get(ring) ?? [];
      const label =
        level.roomLabels.find(
          (l) => !used.has(l.id) && pointInRing(l.anchor, ring) && !islands.some((i) => pointInRing(l.anchor, i)),
        ) ?? null;
      if (label) used.add(label.id);
      const [x, y] = polylabel([toPolylabelRing(ring), ...islands.map(toPolylabelRing)], LABEL_POINT_PRECISION);
      rooms.push({
        key: label ? label.id : `room-${rooms.length}`,
        ring,
        islands,
        area: area(ring) - islands.reduce((sum, i) => sum + area(i), 0),
        labelPoint: { x: x!, y: y! },
        label,
        name: label ? label.name : DEFAULT_ROOM_NAME,
      });
    }
  }
  return rooms;
}
