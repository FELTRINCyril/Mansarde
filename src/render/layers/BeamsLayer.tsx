import type { JSX } from 'react';
import type { Beam, Id, Level, Ring, Vec2 } from '@/core/model/types';
import { ringsPath } from '../path';
import { CAP_HEIGHT, dashArray, FONT_FAMILY, num, STYLE } from '../style';
import { beamLabel, drawnBeams } from '../volumeLabels';

/**
 * The free height under the beam (its lowest underside) written on its axis, turned with it but
 * never upside down, over a mask of the room color so that furniture lines never cross it; at `at`
 * (layoutVolumeLabels: the middle of the beam unless a room name or a slope label is there).
 */
function BeamLabel({ level, beam, lineUnit, at }: { level: Level; beam: Beam; lineUnit: number; at: Vec2 }): JSX.Element {
  const { text, angle, fontSize, width: w, height: h } = beamLabel(level, beam, lineUnit);
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
 * the free height under the beam ("2,25 m": its lowest underside, beamLowestBottom), placed by
 * layoutVolumeLabels (`labels`). A beam without length is not drawn.
 */
export function BeamsLayer({
  level,
  footprints,
  labels,
  lineUnit,
}: {
  level: Level;
  footprints: Map<Id, Ring>;
  labels: Map<Id, Vec2>;
  lineUnit: number;
}): JSX.Element {
  return (
    <g data-kind="beams">
      {drawnBeams(level, footprints).map((b) => (
          <g key={b.id} data-kind="beam" data-id={b.id}>
            <path
              d={ringsPath([footprints.get(b.id)!])}
              fill="none"
              stroke={STYLE.volumeInk}
              strokeWidth={STYLE.beamLine * lineUnit}
              strokeDasharray={dashArray(lineUnit, STYLE.beamDash)}
            />
            <BeamLabel level={level} beam={b} lineUnit={lineUnit} at={labels.get(b.id) ?? b.a} />
          </g>
        ))}
    </g>
  );
}
