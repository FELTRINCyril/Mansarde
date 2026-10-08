import { resolveAnchor } from '@/core/geometry/anchors';
import { dimLineEnds, manualDimLine } from '@/core/geometry/autoDimensions';
import type { DerivedLevel } from '@/core/geometry/derived';
import { objectCorners } from '@/core/geometry/objects';
import { openingFrame } from '@/core/geometry/openings';
import { bbox } from '@/core/geometry/polygon';
import { add, scale } from '@/core/geometry/vec';
import type { Level, Opening, Vec2 } from '@/core/model/types';

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

export const ERR_EMPTY_LEVEL = 'Ce niveau est vide : rien à exporter';

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
 * Length of the swinging door leaves of an opening (radius of their arcs), 0 when nothing that
 * counts for the print bounds swings out of the wall: sliding and pocket doors, passages, and every
 * window (ruling R39: window arcs are drawn, thin and dashed, but may run into the margin).
 */
function leafLength(o: Opening): number {
  if (o.kind !== 'door' || o.variant === 'sliding' || o.variant === 'pocket') return 0;
  return o.variant === 'double' ? o.width / 2 : o.width;
}

/** Corners of the box swept by the leaves: the opening span, from the wall face out to the leaf length. */
function swingExtent(level: Level, o: Opening): Vec2[] {
  const len = leafLength(o);
  if (len <= 0 || !level.walls[o.wallId]) return [];
  const f = openingFrame(level, o);
  const out = scale(f.normal, (o.swing === 'left' ? 1 : -1) * (f.thickness / 2 + len));
  return [add(f.start, out), add(f.end, out)];
}

/**
 * Bounds of what is printed: wall outlines, door swing arcs (not window ones, R39), object corners and manual
 * dimensions (anchors and the drawn, offset line), grown by marginCm on every side. The background
 * image is excluded. Null for a level with nothing to print.
 */
export function levelBounds(level: Level, d: DerivedLevel, marginCm = 60): BoundsCm | null {
  const pts: Vec2[] = [];
  for (const ring of d.outlines.values()) pts.push(...ring);
  for (const o of Object.values(level.openings)) pts.push(...swingExtent(level, o));
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

/** PNG export: at 1x one pixel is one centimeter; the plan is drawn like the screen at that zoom (lineUnit 1). */
export const PNG_LINE_UNIT = 1;

/** 0.25 mm on paper expressed in world cm at 1/scale: 0.025 * scale. */
export function printLineUnit(scale: number): number {
  return 0.025 * scale;
}

/**
 * Bleed around levelBounds, in print units (multiples of lineUnit, 0.25 mm on paper): the facade
 * dimensions sit 50 cm beyond the walls and their text adds about 12 units, which exceeds the
 * 60 cm margin at 1/50 and above. The plan keeps its place and scale; the SVG viewport just extends
 * 5 mm into the page margins so that this text is not clipped.
 */
export const BLEED_PX = 20;

/** Where the plan SVG goes on the sheet: its viewBox (world cm) and its box on the page (mm). */
export interface PlanPlacement {
  viewBox: { x: number; y: number; width: number; height: number };
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The bounds centered in the drawing area (drawableAreaMm, from the top-left margins: above the
 * title block band), at exactly 1/scale, grown by the bleed. A plan larger than the area (never
 * exported, see fits) would start on the margins.
 */
export function planPlacement(b: BoundsCm, spec: PageSpec): PlanPlacement {
  const bleedCm = BLEED_PX * printLineUnit(spec.scale);
  const mmPerCm = 10 / spec.scale;
  const area = drawableAreaMm(spec);
  const size = contentSizeMm(b, spec.scale);
  const left = MARGIN_MM + Math.max(0, (area.width - size.width) / 2);
  const top = MARGIN_MM + Math.max(0, (area.height - size.height) / 2);
  const viewBox = {
    x: b.minX - bleedCm,
    y: b.minY - bleedCm,
    width: b.maxX - b.minX + 2 * bleedCm,
    height: b.maxY - b.minY + 2 * bleedCm,
  };
  const bleedMm = bleedCm * mmPerCm;
  return {
    viewBox,
    x: left - bleedMm,
    y: top - bleedMm,
    width: viewBox.width * mmPerCm,
    height: viewBox.height * mmPerCm,
  };
}

/** Title block frame in mm: bottom right corner, inside the margins. */
export function titleBlockRect(spec: PageSpec): { x: number; y: number; width: number; height: number } {
  const page = pageSizeMm(spec.format, spec.orientation);
  return {
    x: page.width - MARGIN_MM - TITLE_BLOCK_MM.width,
    y: page.height - MARGIN_MM - TITLE_BLOCK_MM.height,
    width: TITLE_BLOCK_MM.width,
    height: TITLE_BLOCK_MM.height,
  };
}

/** Length of the graphic scale bar in meters (1 m segments): 1 m at 1/20, 2 m at 1/50, 5 m beyond. */
export function scaleBarMeters(scale: number): number {
  if (scale <= 20) return 1;
  if (scale <= 50) return 2;
  return 5;
}

/** Local date as dd/mm/yyyy. */
export function formatPrintDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()}`;
}
