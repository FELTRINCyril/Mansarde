import { autoDimensionsOf, manualDimLine, OPENING_GAP, type DimLine } from '@/core/geometry/autoDimensions';
import type { DerivedLevel } from '@/core/geometry/derived';
import type { Id, Level } from '@/core/model/types';
import { dimText, dimTextBox, placeAutoDims, type Box, type DimPlacement } from './dimLayout';
import { roomLabelBox } from './roomLabelLayout';
import { CAP_HEIGHT, STYLE } from './style';

export type DimMode = 'all' | 'manual' | 'none';

/**
 * Opening widths put their text between the wall and the line when it fits in the OPENING_GAP
 * space: the room dimensions run just beyond, with their text on the room side.
 */
const openingTextFits = (lineUnit: number): boolean => (STYLE.dimTextGap + CAP_HEIGHT * STYLE.dimText + 2) * lineUnit <= OPENING_GAP;

export interface DimensionsLayout {
  /** Placement of each automatic dimension (index of autoDimensionsOf), null when left out. */
  auto: Array<DimPlacement | null>;
  manual: Array<{ id: Id; dim: DimLine }>;
  /** How many automatic dimensions are left out because their text would be unreadable. */
  culled: number;
}

/**
 * The dimensions of a level as DimensionsLayer draws them at this lineUnit: automatic ones ('all'
 * only) placed by placeAutoDims around the room labels and the manual dimensions ('all' and
 * 'manual'), which are always drawn. Shared with the export dialog, which reports the culled count.
 */
export function layoutDimensions(level: Level, derived: DerivedLevel, dimMode: DimMode, lineUnit: number): DimensionsLayout {
  if (dimMode === 'none') return { auto: [], manual: [], culled: 0 };
  const openingInside = openingTextFits(lineUnit);
  const manual = Object.values(level.dimensions).flatMap((m) => {
    const dim = manualDimLine(level, m);
    return dim ? [{ id: m.id, dim }] : [];
  });
  const dims = (dimMode === 'all' ? autoDimensionsOf(level, derived) : []).map((dim) => ({
    dim,
    textInside: dim.kind === 'opening' && openingInside,
  }));
  const obstacles: Box[] = [
    ...derived.rooms.map((room) => roomLabelBox(room, lineUnit)),
    ...manual.flatMap(({ dim }) => {
      const t = dimText(dim, lineUnit, false);
      return t ? [dimTextBox(t)] : [];
    }),
  ];
  const auto = placeAutoDims(dims, obstacles, lineUnit);
  const culled = auto.filter((p, i) => p === null && dims[i]!.dim.value > 1e-6).length;
  return { auto, manual, culled };
}
