import type { JSX } from 'react';
import { slopeBand, slopeFrame, slopeIsolines, type Isoline } from '@/core/geometry/slopes';
import { add, scale } from '@/core/geometry/vec';
import type { Id, Slope, Vec2 } from '@/core/model/types';
import { ringsPath } from '../path';
import { dashArray, FONT_FAMILY, num, STYLE } from '../style';
import { drawnSlopes, slopeLabel, slopeLabelKey } from '../volumeLabels';

/** Gradient id of a slope (ids are unique within a project; the same slope always gives the same gradient). */
const gradientId = (s: Slope): string => `slope-gradient-${s.id}`;

/**
 * A level line with its height, the text just above the line in its reading direction, at `at`
 * (layoutVolumeLabels: mid-line unless a room name, furniture or another label is there).
 */
function LevelLine({ line, lineUnit, at }: { line: Isoline; lineUnit: number; at: Vec2 }): JSX.Element {
  const { text, angle, fontSize } = slopeLabel(line, lineUnit);
  return (
    <>
      <line
        data-kind="slope-level"
        x1={num(line.a.x)}
        y1={num(line.a.y)}
        x2={num(line.b.x)}
        y2={num(line.b.y)}
        strokeWidth={STYLE.slopeLevelLine * lineUnit}
        strokeDasharray={dashArray(lineUnit)}
      />
      <text
        x={num(at.x)}
        y={num(at.y)}
        dy={num(-STYLE.slopeTextGap * lineUnit)}
        transform={`rotate(${angle} ${num(at.x)} ${num(at.y)})`}
        fontSize={fontSize}
        fontFamily={FONT_FAMILY}
        textAnchor="middle"
        fill={STYLE.volumeInk}
        stroke="none"
      >
        {text}
      </text>
    </>
  );
}

function SlopeView({ s, lineUnit, labels, levelHeight }: { s: Slope; lineUnit: number; labels: Map<string, Vec2>; levelHeight: number }): JSX.Element {
  const f = slopeFrame(s);
  const end = add(s.a, scale(f.normal, s.depth));
  const id = gradientId(s);
  // the tint grows towards the lower ceiling: towards the end line, or the start line when the ceiling rises
  const rises = s.heightEnd > s.heightStart;
  return (
    <g data-kind="slope" data-id={s.id}>
      <defs>
        {/* along the normal, from the start line to the end line (spec 7.3) */}
        <linearGradient
          id={id}
          data-kind="slope-gradient"
          gradientUnits="userSpaceOnUse"
          x1={num(s.a.x)}
          y1={num(s.a.y)}
          x2={num(end.x)}
          y2={num(end.y)}
        >
          <stop offset="0" stopColor={STYLE.volumeInk} stopOpacity={rises ? STYLE.slopeMaxOpacity : 0} />
          <stop offset="1" stopColor={STYLE.volumeInk} stopOpacity={rises ? 0 : STYLE.slopeMaxOpacity} />
        </linearGradient>
      </defs>
      <path d={ringsPath([slopeBand(s)])} fill={`url(#${id})`} stroke="none" />
      <g stroke={STYLE.volumeInk} strokeOpacity={STYLE.slopeLineOpacity} fill="none">
        {slopeIsolines(s, undefined, levelHeight).map((line, i) =>
          line.kind === 'level' ? (
            <LevelLine key={i} line={line} lineUnit={lineUnit} at={labels.get(slopeLabelKey(s.id, i)) ?? line.a} />
          ) : (
            <line
              key={i}
              data-kind={line.kind === 'start' ? 'slope-start' : 'slope-end'}
              x1={num(line.a.x)}
              y1={num(line.a.y)}
              x2={num(line.b.x)}
              y2={num(line.b.y)}
              strokeWidth={STYLE.slopeLine * lineUnit}
            />
          ),
        )}
      </g>
    </g>
  );
}

/**
 * Roof slopes (spec 7.3), above the rooms and under the furniture: a light blue gradient across
 * the band, darker towards the lower ceiling, the level lines every 20 cm under the level height
 * (the ceiling never reaches the others) dashed with their height (placed by layoutVolumeLabels:
 * `labels`, same slopeIsolines call so the indexes match), the start and end lines solid.
 * A degenerate slope (start line without length, depth <= 0) is not drawn. svg2pdf flattens a
 * gradient with stop opacities to its mean opacity: the PDF shows an even tint of the band.
 */
export function SlopesLayer({
  slopes,
  labels,
  lineUnit,
  levelHeight,
}: {
  slopes: Record<Id, Slope>;
  labels: Map<string, Vec2>;
  lineUnit: number;
  levelHeight: number;
}): JSX.Element {
  return (
    <g data-kind="slopes">
      {drawnSlopes(slopes).map((s) => (
        <SlopeView key={s.id} s={s} lineUnit={lineUnit} labels={labels} levelHeight={levelHeight} />
      ))}
    </g>
  );
}
