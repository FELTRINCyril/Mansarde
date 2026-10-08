import type { JSX } from 'react';
import { dimLineEnds, type DimLine } from '@/core/geometry/autoDimensions';
import { formatLength } from '@/core/model/format';
import { FONT_FAMILY, num, STYLE } from './style';

/** Below this (cm) a dimension has no length to draw (DimLineView draws nothing). */
const ZERO = 1e-6;

/**
 * The active dynamic dimension when its value is 0 (an element flush against a face): DimLineView
 * draws nothing for it, so the Tab choice would be invisible. A dot in the active color on the
 * measured point, with "0,00 m" next to it. Nothing otherwise.
 */
export function ZeroClearanceMarker({ dims, active, lineUnit }: { dims: DimLine[]; active: number | null; lineUnit: number }): JSX.Element | null {
  const dim = active === null ? undefined : dims[active];
  if (!dim || dim.value > ZERO) return null;
  const [p] = dimLineEnds(dim);
  const gap = STYLE.ghostPointRadius * 1.5 * lineUnit;
  return (
    <g data-kind="zero-clearance" fill={STYLE.activeDynamicDim}>
      <circle cx={num(p.x)} cy={num(p.y)} r={STYLE.ghostPointRadius * lineUnit} />
      <text x={num(p.x + gap)} y={num(p.y - gap)} fontSize={STYLE.dimText * lineUnit} fontFamily={FONT_FAMILY}>
        {formatLength(0)}
      </text>
    </g>
  );
}
