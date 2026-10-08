import { dimLineEnds, type DimLine } from '@/core/geometry/autoDimensions';
import { angleOf, deg2rad, dist, dot, lerp, normalize, perp, scale, sub } from '@/core/geometry/vec';
import { formatLength } from '@/core/model/format';
import type { Vec2 } from '@/core/model/types';
import { CAP_HEIGHT, readableAngle, STYLE, textWidth } from './style';

/** Axis-aligned box in world units. */
export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Where the length of a dimension is written: centered at `at` (the middle of the drawn line),
 * turned by `angle` degrees (never upside down), shifted by `dy` along the turned text's own y axis
 * (baseline), `width` and `fontSize` in world units.
 */
export interface DimText { text: string; at: Vec2; angle: number; dy: number; fontSize: number; width: number; lineLength: number }

/**
 * Text placement of a dimension (shared by DimLineView and the layout below): on the far side of
 * the line from the measured points, or between them and the line with `textInside`; `fontScale`
 * shrinks the text (opening widths, see placeAutoDims). Null for a dimension of zero length.
 */
export function dimText(dim: DimLine, lineUnit: number, textInside: boolean, fontScale = 1): DimText | null {
  if (!(dim.value > 1e-6)) return null;
  const [p, q] = dimLineEnds(dim);
  const u = normalize(sub(dim.b, dim.a));
  const n = normalize(perp(u));
  const side = Math.sign(dim.offset);
  const angle = readableAngle((angleOf(u) * 180) / Math.PI);
  const fontSize = STYLE.dimText * lineUnit * fontScale;
  const textGap = STYLE.dimTextGap * lineUnit;
  // "up" of the turned text in world coordinates; the text goes above the line (negative dy) when
  // that is the wanted side, else it hangs below it (baseline one cap height further)
  const up = { x: Math.sin(deg2rad(angle)), y: -Math.cos(deg2rad(angle)) };
  const wanted = side === 0 ? up : scale(n, textInside ? -side : side);
  const dy = dot(up, wanted) >= 0 ? -textGap : textGap + CAP_HEIGHT * fontSize;
  const text = formatLength(dim.value);
  return { text, at: lerp(p, q, 0.5), angle, dy, fontSize, width: textWidth(text, fontSize), lineLength: dist(p, q) };
}

/**
 * Rectangle of the written length in the text's own frame (origin at `at`, x along the text, y
 * downwards, before the rotation): cap height tall, a little padding around. Used for the paper
 * mask drawn under the text and for the layout below.
 */
export function dimTextRect(t: DimText): { x: number; y: number; width: number; height: number } {
  const pad = 0.15 * t.fontSize;
  const top = t.dy - CAP_HEIGHT * t.fontSize - pad;
  return { x: -t.width / 2 - pad, y: top, width: t.width + 2 * pad, height: CAP_HEIGHT * t.fontSize + 2 * pad };
}

/** Bounding box (world, axis-aligned) of the written length, turned with it. */
export function dimTextBox(t: DimText): Box {
  const r = dimTextRect(t);
  const a = deg2rad(t.angle);
  const ux = { x: Math.cos(a), y: Math.sin(a) };
  const uy = { x: -Math.sin(a), y: Math.cos(a) };
  const corners = [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x + r.width, r.y + r.height],
    [r.x, r.y + r.height],
  ].map(([x, y]) => ({ x: t.at.x + ux.x * x! + uy.x * y!, y: t.at.y + ux.y * x! + uy.y * y! }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export const boxesOverlap = (a: Box, b: Box): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * Order in which automatic dimensions claim their place (ruling R38): opening widths first, they
 * are never left out; then facades, then rooms (same kind: list order).
 */
const PRIORITY: Record<DimLine['kind'], number> = { manual: 0, dynamic: 0, opening: 1, facade: 2, room: 3 };

/** Smallest text of an opening width, relative to the normal dimension text (about 2 mm at 1/100). */
export const MIN_OPENING_FONT_SCALE = 0.7;
const OPENING_FONT_SCALES = [1, 0.85, MIN_OPENING_FONT_SCALE];
/** How far (in text lines) an opening width may be pushed away from its wall to find a free place. */
const OPENING_OUTWARD_STEPS = [1, 2];

/** How an automatic dimension is drawn: possibly moved away from its wall, possibly with a smaller text. */
export interface DimPlacement { dim: DimLine; textInside: boolean; fontScale: number }

/** The same dimension with its line `delta` further from the measured points. */
const pushedOutward = (dim: DimLine, delta: number): DimLine => ({ ...dim, offset: dim.offset + Math.sign(dim.offset) * delta });

/**
 * Where an opening width is drawn (ruling R38: never left out). In order: the largest text, down
 * to MIN_OPENING_FONT_SCALE, that fits between the ticks without hitting a placed text; else the
 * smallest text in place, wider than its line but clear of the others; else the smallest text
 * pushed away from the wall by one or two text lines; else the smallest text in place anyway.
 */
function placeOpening(dim: DimLine, textInside: boolean, placed: Box[], lineUnit: number): { placement: DimPlacement; box: Box } | null {
  const tryAt = (d: DimLine, fontScale: number, fitLine: boolean) => {
    const t = dimText(d, lineUnit, textInside, fontScale);
    if (!t || (fitLine && t.width > t.lineLength)) return null;
    const box = dimTextBox(t);
    return placed.some((b) => boxesOverlap(b, box)) ? null : { placement: { dim: d, textInside, fontScale }, box };
  };
  for (const scale of OPENING_FONT_SCALES) {
    const r = tryAt(dim, scale, true);
    if (r) return r;
  }
  const inPlace = tryAt(dim, MIN_OPENING_FONT_SCALE, false);
  if (inPlace) return inPlace;
  const t = dimText(dim, lineUnit, textInside, MIN_OPENING_FONT_SCALE);
  if (!t) return null;
  const line = CAP_HEIGHT * t.fontSize + STYLE.dimTextGap * lineUnit;
  for (const k of OPENING_OUTWARD_STEPS) {
    const r = tryAt(pushedOutward(dim, k * line), MIN_OPENING_FONT_SCALE, false);
    if (r) return r;
  }
  return { placement: { dim, textInside, fontScale: MIN_OPENING_FONT_SCALE }, box: dimTextBox(t) };
}

/**
 * Which automatic dimensions are drawn, and how (null = left out). Opening widths are always drawn
 * (placeOpening). Any other dimension whose length is longer than its own line, or whose text would
 * overlap a text already placed (an obstacle such as a room label or a manual dimension, or a
 * dimension placed before it, see PRIORITY), is left out. Zoomed in (or at a larger print scale)
 * they come back. A zero-length dimension is never drawn.
 */
export function placeAutoDims(
  dims: Array<{ dim: DimLine; textInside?: boolean }>,
  obstacles: Box[],
  lineUnit: number,
): Array<DimPlacement | null> {
  const placed = [...obstacles];
  const out: Array<DimPlacement | null> = dims.map(() => null);
  const order = dims.map((_, i) => i).sort((i, j) => PRIORITY[dims[i]!.dim.kind] - PRIORITY[dims[j]!.dim.kind] || i - j);
  for (const i of order) {
    const { dim, textInside = false } = dims[i]!;
    if (dim.kind === 'opening') {
      const r = placeOpening(dim, textInside, placed, lineUnit);
      if (r) {
        placed.push(r.box);
        out[i] = r.placement;
      }
      continue;
    }
    const t = dimText(dim, lineUnit, textInside);
    if (!t || t.width > t.lineLength) continue;
    const box = dimTextBox(t);
    if (placed.some((b) => boxesOverlap(b, box))) continue;
    placed.push(box);
    out[i] = { dim, textInside, fontScale: 1 };
  }
  return out;
}
