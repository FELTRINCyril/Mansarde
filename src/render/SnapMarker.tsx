import type { JSX } from 'react';
import type { CursorMarker } from '@/editor/tools/drawing';
import type { Vec2 } from '@/core/model/types';
import { num, STYLE } from './style';

const MARKER_PX = 5; // half size of the snapped cursor marker

const pts = (points: Vec2[]): string => points.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');

/** Shape of the snapped point: square on a node, diamond on a wall (middle, axis or face), cross elsewhere. */
function Shape({ at, snap, h }: { at: Vec2; snap: string; h: number }): JSX.Element {
  const { x, y } = at;
  if (snap === 'node') return <rect data-snap={snap} x={num(x - h)} y={num(y - h)} width={num(2 * h)} height={num(2 * h)} />;
  if (snap === 'wallMid' || snap === 'wallAxis' || snap === 'face') {
    return <polygon data-snap={snap} points={pts([{ x, y: y - h }, { x: x + h, y }, { x, y: y + h }, { x: x - h, y }])} />;
  }
  return <path data-snap={snap} d={`M${num(x - h)} ${num(y)}H${num(x + h)}M${num(x)} ${num(y - h)}V${num(y + h)}`} />;
}

/**
 * The snapped cursor marker shared by every point-picking tool (wall, rectangle, slope, beam, and
 * the slope / beam end handles): one implementation, so that the same snap always looks the same.
 */
export function SnapMarker({ marker, lineUnit }: { marker: CursorMarker; lineUnit: number }): JSX.Element {
  return (
    <g data-kind="snap-marker" fill="none" stroke={STYLE.selection} strokeWidth={STYLE.handleWidth * lineUnit}>
      <Shape at={marker.at} snap={marker.snap} h={MARKER_PX * lineUnit} />
    </g>
  );
}
