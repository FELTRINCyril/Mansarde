import type { JSX } from 'react';
import type { SegmentGhost } from '@/editor/tools/types';
import { num, STYLE } from './style';

/** The segment being measured on the tracing image: a line and a dot on each fixed end point. */
export function CalibrationSegment({ ghost, lineUnit }: { ghost: SegmentGhost; lineUnit: number }): JSX.Element {
  return (
    <g data-kind="calibration-segment" stroke={STYLE.selection} strokeWidth={STYLE.selectionWidth * lineUnit}>
      <line x1={num(ghost.a.x)} y1={num(ghost.a.y)} x2={num(ghost.b.x)} y2={num(ghost.b.y)} />
      {ghost.points.map((p, i) => (
        <circle key={i} cx={num(p.x)} cy={num(p.y)} r={STYLE.ghostPointRadius * lineUnit} fill={STYLE.paper} />
      ))}
    </g>
  );
}
