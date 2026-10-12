import { beamLowestBottom } from '@/core/geometry/ceiling';
import { slopeFrame, slopeIsolines, type Isoline } from '@/core/geometry/slopes';
import { angleOf, dist, rad2deg } from '@/core/geometry/vec';
import { formatLength } from '@/core/model/format';
import type { Beam, Id, Level, Ring, Slope, Vec2 } from '@/core/model/types';
import type { Box } from './dimLayout';
import { labelAlong, turnedRect, type Obstacle } from './labelAlong';
import { CAP_HEIGHT, num, readableAngle, STYLE, textWidth } from './style';

/** The slopes drawn by SlopesLayer: a degenerate one (start line without length, depth <= 0) is not. */
export const drawnSlopes = (slopes: Record<Id, Slope>): Slope[] => Object.values(slopes).filter((s) => s.depth > 0 && slopeFrame(s).length > 0);

/** The beams drawn by BeamsLayer: with a length and a footprint. */
export const drawnBeams = (level: Level, footprints: Map<Id, Ring>): Beam[] =>
  Object.values(level.beams).filter((b) => dist(b.a, b.b) > 0 && footprints.has(b.id));

interface LabelSize { text: string; angle: number; fontSize: number; width: number; height: number; shift: number }

/**
 * Text, angle (never upside down), font size and box of the label of a slope level line: the text
 * stands slopeTextGap above the line in its reading direction (`shift`: from the line to the box
 * center, towards the top of the text), a cap height tall with a little padding.
 */
export function slopeLabel(line: Isoline, lineUnit: number): LabelSize {
  const angle = num(readableAngle(rad2deg(angleOf({ x: line.b.x - line.a.x, y: line.b.y - line.a.y }))));
  const text = formatLength(line.height);
  const fontSize = STYLE.slopeText * lineUnit;
  const pad = 0.15 * fontSize;
  const cap = CAP_HEIGHT * fontSize;
  return { text, angle, fontSize, width: textWidth(text, fontSize) + 2 * pad, height: cap + 2 * pad, shift: STYLE.slopeTextGap * lineUnit + cap / 2 };
}

/** Text, angle, font size and masked box (w x h, centered on the axis) of the label of a beam. */
export function beamLabel(level: Level, beam: Beam, lineUnit: number): LabelSize {
  const angle = num(readableAngle(rad2deg(angleOf({ x: beam.b.x - beam.a.x, y: beam.b.y - beam.a.y }))));
  const text = formatLength(beamLowestBottom(level, beam));
  const fontSize = STYLE.beamText * lineUnit;
  const pad = 0.2 * fontSize;
  return { text, angle, fontSize, width: textWidth(text, fontSize) + 2 * pad, height: CAP_HEIGHT * fontSize + 2 * pad, shift: 0 };
}

/** Key of the label of the level line `index` (in slopeIsolines order) of a slope. */
export const slopeLabelKey = (slopeId: Id, index: number): string => `${slopeId}:${index}`;

export interface VolumeLabelPositions {
  /** By slopeLabelKey, level lines only. */
  slopes: Map<string, Vec2>;
  /** By beam id. */
  beams: Map<Id, Vec2>;
}

/**
 * Where the labels of the slope level lines and of the beams go (labelAlong), in one pass so that
 * they keep clear of each other too (each placed label is an obstacle for the next ones), of the
 * room names and of the dimension texts (drawn above them with an opaque mask), and, for the slope
 * labels, of the furniture drawn over them (`overSlopes`), in that order of importance.
 * Slope labels first (in drawing order), then the beam labels.
 */
export function layoutVolumeLabels(
  level: Level,
  beamFootprints: Map<Id, Ring>,
  lineUnit: number,
  obstacles: { roomNames: Box[]; dimTexts: Box[]; overSlopes: Box[] },
): VolumeLabelPositions {
  const { roomNames: hiding, dimTexts: masking, overSlopes } = obstacles;
  const placed: Obstacle[] = [];
  const slopes = new Map<string, Vec2>();
  for (const s of drawnSlopes(level.slopes)) {
    slopeIsolines(s).forEach((line, i) => {
      if (line.kind !== 'level') return;
      const l = slopeLabel(line, lineUnit);
      const at = labelAlong(line.a, line.b, l.width, l.height, l.angle, { hiding, labels: placed, masking, covering: overSlopes }, l.shift);
      slopes.set(slopeLabelKey(s.id, i), at);
      placed.push(turnedRect(at, l.width, l.height, l.angle, l.shift));
    });
  }
  const beams = new Map<Id, Vec2>();
  for (const b of drawnBeams(level, beamFootprints)) {
    const l = beamLabel(level, b, lineUnit);
    const at = labelAlong(b.a, b.b, l.width, l.height, l.angle, { hiding, labels: placed, masking }, l.shift);
    beams.set(b.id, at);
    placed.push(turnedRect(at, l.width, l.height, l.angle));
  }
  return { slopes, beams };
}
