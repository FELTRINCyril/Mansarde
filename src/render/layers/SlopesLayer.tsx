import type { JSX } from 'react';
import { slopeBand, slopeFrame, slopeIsolines, type Isoline } from '@/core/geometry/slopes';
import { add, angleOf, rad2deg, scale } from '@/core/geometry/vec';
import { formatLength } from '@/core/model/format';
import type { Id, Slope } from '@/core/model/types';
import type { Box } from '../dimLayout';
import { labelAlong } from '../labelAlong';
import { ringsPath } from '../path';
import { CAP_HEIGHT, dashArray, FONT_FAMILY, num, readableAngle, STYLE, textWidth } from '../style';

/** Room names (opaque, must be avoided) and furniture drawn over the labels (avoided if possible). */
export interface LabelObstacles { hiding: Box[]; covering: Box[] }

/** Gradient id of a slope (ids are unique within a project; the same slope always gives the same gradient). */
const gradientId = (s: Slope): string => `slope-gradient-${s.id}`;

/**
 * A level line with its height, the text just above the line in its reading direction: at
 * mid-line unless a room name or furniture is there (labelAlong).
 */
function LevelLine({ line, lineUnit, obstacles }: { line: Isoline; lineUnit: number; obstacles: LabelObstacles }): JSX.Element {
  const angle = num(readableAngle(rad2deg(angleOf({ x: line.b.x - line.a.x, y: line.b.y - line.a.y }))));
  const text = formatLength(line.height);
  const fontSize = STYLE.slopeText * lineUnit;
  // the text box straddles the line: it may sit on either side once turned
  const reach = 2 * (STYLE.slopeTextGap * lineUnit + CAP_HEIGHT * fontSize);
  const at = labelAlong(line.a, line.b, textWidth(text, fontSize), reach, angle, obstacles);
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

function SlopeView({ s, lineUnit, obstacles }: { s: Slope; lineUnit: number; obstacles: LabelObstacles }): JSX.Element {
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
        {slopeIsolines(s).map((line, i) =>
          line.kind === 'level' ? (
            <LevelLine key={i} line={line} lineUnit={lineUnit} obstacles={obstacles} />
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
 * the band, darker towards the lower ceiling, the level lines every 20 cm dashed with their height
 * (kept clear of the room names, and of the furniture when possible: `labelObstacles`), the start
 * and end lines solid.
 * A degenerate slope (start line without length, depth <= 0) is not drawn. svg2pdf flattens a
 * gradient with stop opacities to its mean opacity: the PDF shows an even tint of the band.
 */
export function SlopesLayer({
  slopes,
  labelObstacles,
  lineUnit,
}: {
  slopes: Record<Id, Slope>;
  labelObstacles: LabelObstacles;
  lineUnit: number;
}): JSX.Element {
  return (
    <g data-kind="slopes">
      {Object.values(slopes)
        .filter((s) => s.depth > 0 && slopeFrame(s).length > 0)
        .map((s) => (
          <SlopeView key={s.id} s={s} lineUnit={lineUnit} obstacles={labelObstacles} />
        ))}
    </g>
  );
}
