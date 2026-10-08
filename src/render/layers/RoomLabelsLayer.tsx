import type { JSX } from 'react';
import type { Room } from '@/core/geometry/rooms';
import { roomLabelBox, roomLabelLayout } from '../roomLabelLayout';
import { CAP_HEIGHT, FONT_FAMILY, num, STYLE } from '../style';

/**
 * Room name, and the area on the line below when the room is large enough to hold both lines;
 * the block is centered on the label point. Baselines use dy offsets (no dominant-baseline, which
 * svg2pdf ignores).
 */
function RoomLabel({ room, lineUnit }: { room: Room; lineUnit: number }): JSX.Element {
  const { nameSize, areaSize, area, showArea } = roomLabelLayout(room, lineUnit);
  const x = num(room.labelPoint.x);
  const y = num(room.labelPoint.y);
  const common = { x, y, textAnchor: 'middle' as const, fontFamily: FONT_FAMILY, fill: STYLE.roomText, stroke: 'none' };
  const box = roomLabelBox(room, lineUnit);
  return (
    <g data-kind="room-label" data-id={room.key}>
      {/* a mask of the room color under the texts: they stay readable over the furniture (ruling R21) */}
      <rect
        data-kind="text-mask"
        x={num(box.minX)}
        y={num(box.minY)}
        width={num(box.maxX - box.minX)}
        height={num(box.maxY - box.minY)}
        fill={STYLE.roomFill}
        stroke="none"
      />
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
