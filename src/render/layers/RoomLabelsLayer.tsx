import type { JSX } from 'react';
import { pointInRing } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import { formatArea } from '@/core/model/format';
import type { Vec2 } from '@/core/model/types';
import { CAP_HEIGHT, FONT_FAMILY, num, STYLE, textWidth } from '../style';

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
 * Room name, and the area on the line below when the room is large enough to hold both lines;
 * the block is centered on the label point. Baselines use dy offsets (no dominant-baseline, which
 * svg2pdf ignores).
 */
function RoomLabel({ room, lineUnit }: { room: Room; lineUnit: number }): JSX.Element {
  const nameSize = STYLE.text * lineUnit;
  const areaSize = STYLE.areaText * lineUnit;
  const pad = STYLE.labelPadding * lineUnit;
  const area = formatArea(room.area);
  const blockWidth = Math.max(textWidth(room.name, nameSize), textWidth(area, areaSize)) + 2 * pad;
  const blockHeight = nameSize + areaSize + 2 * pad;
  const showArea = boxFits(room, room.labelPoint, blockWidth, blockHeight);
  const x = num(room.labelPoint.x);
  const y = num(room.labelPoint.y);
  const common = { x, y, textAnchor: 'middle' as const, fontFamily: FONT_FAMILY, fill: STYLE.roomText, stroke: 'none' };
  return (
    <g data-kind="room-label" data-id={room.key}>
      {/* name alone: baseline 0.35 em below the center; with the area: just above the center */}
      <text {...common} fontSize={nameSize} fontWeight="bold" dy={num((showArea ? -0.2 : 0.35) * nameSize)}>
        {room.name}
      </text>
      {showArea && (
        <text {...common} fontSize={areaSize} dy={num(0.2 * nameSize + CAP_HEIGHT * areaSize)}>
          {area}
        </text>
      )}
    </g>
  );
}

/** Name and area of every room. Drawn above the furniture so that a bed never hides the room name. */
export function RoomLabelsLayer({ rooms, lineUnit }: { rooms: Room[]; lineUnit: number }): JSX.Element {
  return (
    <g data-kind="room-labels">
      {rooms.map((room) => (
        <RoomLabel key={room.key} room={room} lineUnit={lineUnit} />
      ))}
    </g>
  );
}
