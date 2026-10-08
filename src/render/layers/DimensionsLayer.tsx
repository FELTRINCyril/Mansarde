import type { JSX } from 'react';
import { autoDimensionsOf, manualDimLine, OPENING_GAP, type DimLine } from '@/core/geometry/autoDimensions';
import { pointInRing } from '@/core/geometry/polygon';
import type { DerivedLevel } from '@/core/geometry/derived';
import type { Level } from '@/core/model/types';
import { DimLineView } from '../DimLineView';
import { dimText, dimTextBox, visibleAutoDims, type Box } from '../dimLayout';
import { roomLabelBox } from '../roomLabelLayout';
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
 * "auto-dimension" and an index, since they are not selectable. An automatic dimension whose text
 * would not be readable (longer than its line, or over a room label, a manual dimension or a more
 * important automatic dimension, see visibleAutoDims) is left out; manual ones are always drawn.
 */
export function DimensionsLayer({ level, derived, dimMode, lineUnit }: { level: Level; derived: DerivedLevel; dimMode: DimMode; lineUnit: number }): JSX.Element | null {
  if (dimMode === 'none') return null;
  const openingInside = openingTextFits(lineUnit);
  const manual = Object.values(level.dimensions).flatMap((m) => {
    const dim = manualDimLine(level, m);
    return dim ? [{ id: m.id, dim }] : [];
  });
  const auto = (dimMode === 'all' ? autoDimensionsOf(level, derived) : []).map((dim) => ({ dim, textInside: dim.kind === 'opening' && openingInside }));
  const obstacles: Box[] = [
    ...derived.rooms.map((room) => roomLabelBox(room, lineUnit)),
    ...manual.flatMap(({ dim }) => {
      const t = dimText(dim, lineUnit, false);
      return t ? [dimTextBox(t)] : [];
    }),
  ];
  const visible = visibleAutoDims(auto, obstacles, lineUnit);
  // the text mask takes the color of what lies under the text: a room fill or the paper
  const maskOf = (dim: DimLine, textInside: boolean): string => {
    const t = dimText(dim, lineUnit, textInside);
    const inRoom = t && derived.rooms.some((r) => pointInRing(t.at, r.ring) && !r.islands.some((i) => pointInRing(t.at, i)));
    return inRoom ? STYLE.roomFill : STYLE.paper;
  };
  return (
    <g data-kind="dimensions">
      {auto.map(({ dim, textInside }, i) =>
        visible[i] ? (
          <DimLineView
            key={`auto-${i}`}
            dim={dim}
            lineUnit={lineUnit}
            kind="auto-dimension"
            id={`${dim.kind}-${i}`}
            textInside={textInside}
            maskColor={maskOf(dim, textInside)}
          />
        ) : null,
      )}
      {manual.map(({ id, dim }) => (
        <DimLineView key={id} dim={dim} lineUnit={lineUnit} kind="dimension" id={id} maskColor={maskOf(dim, false)} />
      ))}
    </g>
  );
}
