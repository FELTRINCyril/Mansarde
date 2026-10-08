import type { JSX } from 'react';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { pointInRing } from '@/core/geometry/polygon';
import type { DerivedLevel } from '@/core/geometry/derived';
import type { Level } from '@/core/model/types';
import { DimLineView } from '../DimLineView';
import { dimText } from '../dimLayout';
import { layoutDimensions, type DimMode } from '../dimensionsLayout';
import { STYLE } from '../style';

export type { DimMode };

/**
 * Automatic dimensions (rooms, facades, openings; 'all' only) then manual ones ('all' and
 * 'manual'). Manual dimensions carry data-kind "dimension" and their id; automatic ones
 * "auto-dimension" and an index, since they are not selectable. Opening widths are always drawn,
 * with a smaller text or further from the wall if needed (ruling R38); another automatic dimension
 * whose text would not be readable (longer than its line, or over a room label, a manual dimension
 * or an automatic dimension placed before it, see placeAutoDims) is left out; manual ones are
 * always drawn.
 */
export function DimensionsLayer({ level, derived, dimMode, lineUnit }: { level: Level; derived: DerivedLevel; dimMode: DimMode; lineUnit: number }): JSX.Element | null {
  if (dimMode === 'none') return null;
  const { auto, manual } = layoutDimensions(level, derived, dimMode, lineUnit);
  // the text mask takes the color of what lies under the text: a room fill or the paper
  const maskOf = (dim: DimLine, textInside: boolean, fontScale: number): string => {
    const t = dimText(dim, lineUnit, textInside, fontScale);
    const inRoom = t && derived.rooms.some((r) => pointInRing(t.at, r.ring) && !r.islands.some((i) => pointInRing(t.at, i)));
    return inRoom ? STYLE.roomFill : STYLE.paper;
  };
  return (
    <g data-kind="dimensions">
      {auto.map((placed, i) =>
        placed ? (
          <DimLineView
            key={`auto-${i}`}
            dim={placed.dim}
            lineUnit={lineUnit}
            kind="auto-dimension"
            id={`${placed.dim.kind}-${i}`}
            textInside={placed.textInside}
            fontScale={placed.fontScale}
            maskColor={maskOf(placed.dim, placed.textInside, placed.fontScale)}
          />
        ) : null,
      )}
      {manual.map(({ id, dim }) => (
        <DimLineView key={id} dim={dim} lineUnit={lineUnit} kind="dimension" id={id} maskColor={maskOf(dim, false, 1)} />
      ))}
    </g>
  );
}
