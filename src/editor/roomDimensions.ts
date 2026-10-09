import type { DerivedLevel } from '@/core/geometry/derived';
import { mergeCollinear, ringEdges } from '@/core/geometry/polygon';
import { rectangularRoom } from '@/core/geometry/roomRect';
import { deg2rad, dist, dot, normalize, sub } from '@/core/geometry/vec';
import type { Level, Vec2 } from '@/core/model/types';
import { dimText, dimTextRect, type DimText } from '@/render/dimLayout';
import { layoutDimensions, type DimMode } from '@/render/dimensionsLayout';

/** A double-clicked interior dimension of a rectangular room (spec 6). */
export interface RoomDimensionHit {
  roomKey: string;
  axis: 'width' | 'depth'; // axisU / axisV of rectangularRoom
  value: number; // current interior size along that axis (cm)
  at: Vec2; // middle of the written length (world cm)
}

/** Extra margin (display px) around a written length that still counts as on it. */
const TEXT_SLACK_PX = 3;
const SAME_POINT = 1e-6;

/** Whether p (world) lies on the written length t, within `slack` (world units). */
function onText(t: DimText, p: Vec2, slack: number): boolean {
  const r = dimTextRect(t);
  const a = deg2rad(t.angle);
  const v = sub(p, t.at);
  const x = dot(v, { x: Math.cos(a), y: Math.sin(a) });
  const y = dot(v, { x: -Math.sin(a), y: Math.cos(a) });
  return x >= r.x - slack && x <= r.x + r.width + slack && y >= r.y - slack && y <= r.y + r.height + slack;
}

/**
 * The interior dimension of a rectangular room whose written length is under `world`, as the
 * dimensions layer draws them at this lineUnit (layoutDimensions: left-out ones cannot be hit).
 * Only 'room' dimensions measuring an edge of the room's own ring count (not the faces of a wall
 * box standing inside it); null when there is none, or when that room is not rectangular
 * (rectangularRoom).
 */
export function roomDimensionAt(level: Level, d: DerivedLevel, world: Vec2, lineUnit: number, dimMode: DimMode): RoomDimensionHit | null {
  const { auto } = layoutDimensions(level, d, dimMode, lineUnit);
  for (const placed of auto) {
    if (!placed || placed.dim.kind !== 'room') continue;
    const t = dimText(placed.dim, lineUnit, placed.textInside, placed.fontScale);
    if (!t || !onText(t, world, TEXT_SLACK_PX * lineUnit)) continue;
    const { a, b } = placed.dim;
    const room = d.rooms.find((r) =>
      ringEdges(mergeCollinear(r.ring)).some(([p, q]) => dist(p, a) <= SAME_POINT && dist(q, b) <= SAME_POINT),
    );
    const rect = room ? rectangularRoom(level, d, room.key) : null;
    if (!room || !rect) return null;
    const along = Math.abs(dot(normalize(sub(b, a)), rect.axisU)) >= Math.SQRT1_2;
    return { roomKey: room.key, axis: along ? 'width' : 'depth', value: along ? rect.width : rect.depth, at: t.at };
  }
  return null;
}
