import type { JSX } from 'react';
import { beamLowestBottom } from '@/core/geometry/ceiling';
import { angleOf, dist, rad2deg } from '@/core/geometry/vec';
import { formatLength } from '@/core/model/format';
import type { Beam, Id, Level, Ring } from '@/core/model/types';
import type { Box } from '../dimLayout';
import { labelAlong } from '../labelAlong';
import { ringsPath } from '../path';
import { CAP_HEIGHT, dashArray, FONT_FAMILY, num, readableAngle, STYLE, textWidth } from '../style';

/**
 * The free height under the beam (its lowest underside) written on its axis, turned with it but
 * never upside down, over a mask of the room color so that furniture lines never cross it; at the
 * middle of the beam unless a room name is there (labelAlong).
 */
function BeamLabel({ beam, height, lineUnit, obstacles }: { beam: Beam; height: number; lineUnit: number; obstacles: Box[] }): JSX.Element {
  const angle = num(readableAngle(rad2deg(angleOf({ x: beam.b.x - beam.a.x, y: beam.b.y - beam.a.y }))));
  const text = formatLength(height);
  const fontSize = STYLE.beamText * lineUnit;
  const pad = 0.2 * fontSize;
  const w = textWidth(text, fontSize) + 2 * pad;
  const h = CAP_HEIGHT * fontSize + 2 * pad;
  const at = labelAlong(beam.a, beam.b, w, h, angle, { hiding: obstacles });
  return (
    <g data-kind="beam-label" transform={`translate(${num(at.x)} ${num(at.y)}) rotate(${angle})`}>
      <rect
        data-kind="text-mask"
        x={num(-w / 2)}
        y={num(-h / 2)}
        width={num(w)}
        height={num(h)}
        fill={STYLE.roomFill}
        fillOpacity={STYLE.beamTextMaskOpacity}
        stroke="none"
      />
      {/* baseline half a cap height below the axis: the digits are centered on it */}
      <text x={0} y={0} dy={num((CAP_HEIGHT * fontSize) / 2)} fontSize={fontSize} fontFamily={FONT_FAMILY} textAnchor="middle" fill={STYLE.volumeInk} stroke="none">
        {text}
      </text>
    </g>
  );
}

/**
 * Ceiling beams (spec 7.3), above the furniture and the walls: the footprint outlined in dashes and
 * the free height under the beam ("2,25 m": its lowest underside, beamLowestBottom), kept clear of
 * the room names (`labelObstacles`, drawn above). A beam without length is not drawn.
 */
export function BeamsLayer({
  level,
  footprints,
  labelObstacles,
  lineUnit,
}: {
  level: Level;
  footprints: Map<Id, Ring>;
  labelObstacles: Box[];
  lineUnit: number;
}): JSX.Element {
  return (
    <g data-kind="beams">
      {Object.values(level.beams)
        .filter((b) => dist(b.a, b.b) > 0 && footprints.has(b.id))
        .map((b) => (
          <g key={b.id} data-kind="beam" data-id={b.id}>
            <path
              d={ringsPath([footprints.get(b.id)!])}
              fill="none"
              stroke={STYLE.volumeInk}
              strokeWidth={STYLE.beamLine * lineUnit}
              strokeDasharray={dashArray(lineUnit, STYLE.beamDash)}
            />
            <BeamLabel beam={b} height={beamLowestBottom(level, b)} lineUnit={lineUnit} obstacles={labelObstacles} />
          </g>
        ))}
    </g>
  );
}
