import { pointInRing } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import { formatArea } from '@/core/model/format';
import type { Vec2 } from '@/core/model/types';
import type { Box } from './dimLayout';
import { STYLE, textWidth } from './style';

/** Rough check: the rectangle of size w x h centered on c lies inside the room (corners only). */
function boxFits(room: Room, c: Vec2, w: number, h: number): boolean {
  const corners: Vec2[] = [
    { x: c.x - w / 2, y: c.y - h / 2 },
    { x: c.x + w / 2, y: c.y - h / 2 },
    { x: c.x + w / 2, y: c.y + h / 2 },
    { x: c.x - w / 2, y: c.y + h / 2 },
  ];
  return corners.every((p) => pointInRing(p, room.ring) && !room.islands.some((i) => pointInRing(p, i)));
}

/**
 * Font sizes of a room label, its area text, whether the area line fits in the room (else only
 * the name is written) and the size of the written block, padding included (world units).
 */
export function roomLabelLayout(room: Room, lineUnit: number) {
  const nameSize = STYLE.text * lineUnit;
  const areaSize = STYLE.areaText * lineUnit;
  const pad = STYLE.labelPadding * lineUnit;
  const area = formatArea(room.area);
  const blockWidth = Math.max(textWidth(room.name, nameSize), textWidth(area, areaSize)) + 2 * pad;
  const blockHeight = nameSize + areaSize + 2 * pad;
  const showArea = boxFits(room, room.labelPoint, blockWidth, blockHeight);
  return {
    nameSize,
    areaSize,
    area,
    showArea,
    width: showArea ? blockWidth : textWidth(room.name, nameSize) + 2 * pad,
    height: showArea ? blockHeight : nameSize + 2 * pad,
  };
}

/** Box of a room label (world units): its mask, and the automatic dimensions keep their text out of it. */
export function roomLabelBox(room: Room, lineUnit: number): Box {
  const { width, height } = roomLabelLayout(room, lineUnit);
  const c = room.labelPoint;
  return { minX: c.x - width / 2, minY: c.y - height / 2, maxX: c.x + width / 2, maxY: c.y + height / 2 };
}
