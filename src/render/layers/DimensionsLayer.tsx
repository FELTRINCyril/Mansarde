import type { JSX } from 'react';
import { computeAutoDimensions, manualDimLine, OPENING_GAP } from '@/core/geometry/autoDimensions';
import type { DerivedLevel } from '@/core/geometry/derived';
import type { Level } from '@/core/model/types';
import { DimLineView } from '../DimLineView';
import { CAP_HEIGHT, STYLE } from '../style';

export type DimMode = 'all' | 'manual' | 'none';

/**
 * Opening widths put their text between the wall and the line when it fits in the OPENING_GAP
 * space: the room dimensions run just beyond, with their text on the room side.
 */
const openingTextFits = (lineUnit: number): boolean => (STYLE.dimTextGap + CAP_HEIGHT * STYLE.dimText + 2) * lineUnit <= OPENING_GAP;

/**
 * Automatic dimensions (rooms, facades, openings; 'all' only) then manual ones ('all' and
 * 'manual'). Manual dimensions carry data-kind "dimension" and their id; automatic ones
 * "auto-dimension" and an index, since they are not selectable.
 */
export function DimensionsLayer({ level, derived, dimMode, lineUnit }: { level: Level; derived: DerivedLevel; dimMode: DimMode; lineUnit: number }): JSX.Element | null {
  if (dimMode === 'none') return null;
  const auto = dimMode === 'all' ? computeAutoDimensions(level, derived) : [];
  const openingInside = openingTextFits(lineUnit);
  return (
    <g data-kind="dimensions">
      {auto.map((dim, i) => (
        <DimLineView
          key={`auto-${i}`}
          dim={dim}
          lineUnit={lineUnit}
          kind="auto-dimension"
          id={`${dim.kind}-${i}`}
          textInside={dim.kind === 'opening' && openingInside}
        />
      ))}
      {Object.values(level.dimensions).map((m) => {
        const dim = manualDimLine(level, m);
        return dim && <DimLineView key={m.id} dim={dim} lineUnit={lineUnit} kind="dimension" id={m.id} />;
      })}
    </g>
  );
}
