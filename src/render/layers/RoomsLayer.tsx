import type { JSX } from 'react';
import type { Room } from '@/core/geometry/rooms';
import { ringsPath } from '../path';
import { STYLE } from '../style';

/** Light fill of every room, islands cut out. Labels are drawn later by RoomLabelsLayer, above the furniture. */
export function RoomsLayer({ rooms, translucent }: { rooms: Room[]; translucent: boolean }): JSX.Element {
  return (
    <g data-kind="rooms">
      {rooms.map((room) => (
        <path
          key={room.key}
          data-kind="room"
          data-id={room.key}
          d={ringsPath([room.ring, ...room.islands])}
          fillRule="evenodd"
          fill={STYLE.roomFill}
          fillOpacity={translucent ? STYLE.roomFillOverImage : undefined}
          stroke="none"
        />
      ))}
    </g>
  );
}
