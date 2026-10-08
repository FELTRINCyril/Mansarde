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
 * the line from the measured points, or between them and the line with `textInside`. Null for a
 * dimension of zero length.
 */
export function dimText(dim: DimLine, lineUnit: number, textInside: boolean): DimText | null {
  if (!(dim.value > 1e-6)) return null;
  const [p, q] = dimLineEnds(dim);
  const u = normalize(sub(dim.b, dim.a));
  const n = normalize(perp(u));
  const side = Math.sign(dim.offset);
  const angle = readableAngle((angleOf(u) * 180) / Math.PI);
  const fontSize = STYLE.dimText * lineUnit;
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

const PRIORITY: Record<DimLine['kind'], number> = { manual: 0, dynamic: 0, facade: 1, room: 2, opening: 3 };

/**
 * Which automatic dimensions are drawn: a dimension whose length is longer than its own line, or
 * whose text would overlap a text already placed (an obstacle such as a room label or a manual
 * dimension, or a dimension of higher priority: facades, then rooms, then openings; same kind:
 * list order), is left out. Zoomed in (or at a larger print scale) they come back.
 */
export function visibleAutoDims(dims: Array<{ dim: DimLine; textInside?: boolean }>, obstacles: Box[], lineUnit: number): boolean[] {
  const placed = [...obstacles];
  const visible = dims.map(() => false);
  const order = dims.map((_, i) => i).sort((i, j) => PRIORITY[dims[i]!.dim.kind] - PRIORITY[dims[j]!.dim.kind] || i - j);
  for (const i of order) {
    const { dim, textInside = false } = dims[i]!;
    const t = dimText(dim, lineUnit, textInside);
    if (!t || t.width > t.lineLength) continue;
    const box = dimTextBox(t);
    if (placed.some((b) => boxesOverlap(b, box))) continue;
    placed.push(box);
    visible[i] = true;
  }
  return visible;
}
