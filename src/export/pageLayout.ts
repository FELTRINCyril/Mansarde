import { resolveAnchor } from '@/core/geometry/anchors';
import { dimLineEnds, manualDimLine } from '@/core/geometry/autoDimensions';
import type { DerivedLevel } from '@/core/geometry/derived';
import { objectCorners } from '@/core/geometry/objects';
import { bbox } from '@/core/geometry/polygon';
import type { Level, Vec2 } from '@/core/model/types';

export type PaperFormat = 'A4' | 'A3';
export type Orientation = 'portrait' | 'landscape';
export const SCALES = [20, 50, 100, 200] as const;
export interface PageSpec {
  format: PaperFormat;
  orientation: Orientation;
  scale: number;
}
export interface BoundsCm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MARGIN_MM = 10;
export const TITLE_BLOCK_MM = { width: 70, height: 28 };

const PAPER_MM: Record<PaperFormat, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
};

/** Page size in mm; the portrait size is swapped for landscape. */
export function pageSizeMm(format: PaperFormat, o: Orientation): { width: number; height: number } {
  const { width, height } = PAPER_MM[format];
  return o === 'portrait' ? { width, height } : { width: height, height: width };
}

/** Page minus the margins on every side, minus the title block height. */
export function drawableAreaMm(spec: PageSpec): { width: number; height: number } {
  const page = pageSizeMm(spec.format, spec.orientation);
  return {
    width: page.width - 2 * MARGIN_MM,
    height: page.height - 2 * MARGIN_MM - TITLE_BLOCK_MM.height,
  };
}

/** Size on paper of the given world bounds at 1/scale: cm * 10 / scale. */
export function contentSizeMm(b: BoundsCm, scale: number): { width: number; height: number } {
  return { width: ((b.maxX - b.minX) * 10) / scale, height: ((b.maxY - b.minY) * 10) / scale };
}

const EPS = 1e-9;

export function fits(b: BoundsCm, spec: PageSpec): boolean {
  const c = contentSizeMm(b, spec.scale);
  const a = drawableAreaMm(spec);
  return c.width <= a.width + EPS && c.height <= a.height + EPS;
}

/** Smallest denominator of SCALES (largest drawing) that fits, null when even the last one does not. */
export function suggestScale(b: BoundsCm, format: PaperFormat, o: Orientation): number | null {
  for (const scale of SCALES) {
    if (fits(b, { format, orientation: o, scale })) return scale;
  }
  return null;
}

/**
 * Bounds of what is printed: wall outlines, object corners and manual dimensions (anchors and the
 * drawn, offset line), grown by marginCm on every side. The background image is excluded.
 * Null for a level with nothing to print.
 */
export function levelBounds(level: Level, d: DerivedLevel, marginCm = 60): BoundsCm | null {
  const pts: Vec2[] = [];
  for (const ring of d.outlines.values()) pts.push(...ring);
  for (const o of Object.values(level.objects)) pts.push(...objectCorners(o));
  for (const dim of Object.values(level.dimensions)) {
    for (const a of [dim.a, dim.b]) {
      const p = resolveAnchor(level, a);
      if (p) pts.push(p);
    }
    const line = manualDimLine(level, dim);
    if (line) pts.push(...dimLineEnds(line));
  }
  const b = bbox(pts);
  if (!b) return null;
  return {
    minX: b.minX - marginCm,
    minY: b.minY - marginCm,
    maxX: b.maxX + marginCm,
    maxY: b.maxY + marginCm,
  };
}

/** 0.25 mm on paper expressed in world cm at 1/scale: 0.025 * scale. */
export function printLineUnit(scale: number): number {
  return 0.025 * scale;
}
