import { deriveLevel } from '@/core/geometry/derived';
import type { Level } from '@/core/model/types';
import { layoutDimensions, type DimMode } from '@/render/dimensionsLayout';
import { SCALES } from './pageLayout';

/**
 * How many automatic dimensions an export drawn at this lineUnit leaves out because their text
 * would be unreadable (same layout as the rendering, ruling R38; opening widths are never left out).
 */
export function culledDimensions(level: Level, dimMode: DimMode, lineUnit: number): number {
  return layoutDimensions(level, deriveLevel(level), dimMode, lineUnit).culled;
}

/** The scale of SCALES just below in denominator (a larger drawing), null at the largest one (1/20). */
export function largerScale(scale: number): number | null {
  const larger = SCALES.filter((s) => s < scale);
  return larger.length > 0 ? larger[larger.length - 1]! : null;
}

/**
 * Notice of the export dialog when dimensions are left out (ruling R38). For a PDF, `scale` is its
 * denominator and the next larger drawing scale is suggested (none at 1/20); a PNG has no scale (null).
 */
export function culledDimsMessage(count: number, scale: number | null): string {
  const what = count > 1 ? `${count} cotes illisibles` : '1 cote illisible';
  const verb = count > 1 ? 'ont été masquées' : 'a été masquée';
  if (scale === null) return `${what} ${verb} dans l'image.`;
  const next = largerScale(scale);
  return next === null ? `${what} à cette échelle ${verb}.` : `${what} à cette échelle ${verb}, essayez le 1/${next}.`;
}
