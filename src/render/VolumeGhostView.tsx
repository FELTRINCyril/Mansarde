import type { JSX } from 'react';
import { beamFootprint } from '@/core/geometry/beams';
import { cupboardFootprint, cupboardFrame } from '@/core/geometry/cupboards';
import { slopeBand } from '@/core/geometry/slopes';
import type { Vec2 } from '@/core/model/types';
import { isVolumeGhost, type BeamGhost, type CupboardGhost, type SlopeGhost } from '@/editor/tools/volumeTools';
import { CupboardDoors } from './layers/CupboardsLayer';
import { ringsPath } from './path';
import { SnapMarker } from './SnapMarker';
import { dashArray, num, STYLE } from './style';

const GHOST_FILL_OPACITY = 0.12;

function Marks({ points, lineUnit, color }: { points: Vec2[]; lineUnit: number; color: string }): JSX.Element {
  return (
    <>
      {points.map((p, i) => (
        <circle key={i} data-kind="ghost-point" cx={num(p.x)} cy={num(p.y)} r={STYLE.ghostPointRadius * lineUnit} fill={color} fillOpacity={0.5} stroke="none" />
      ))}
    </>
  );
}

function Line({ a, b, width, kind, dashed }: { a: Vec2; b: Vec2; width: number; kind: string; dashed?: string }): JSX.Element {
  return <line data-kind={kind} x1={num(a.x)} y1={num(a.y)} x2={num(b.x)} y2={num(b.y)} strokeWidth={width} strokeDasharray={dashed} />;
}

/** The start line so far (and the snapped cursor marker), then the band: start line thick, end line thin, lateral edges dashed. */
function SlopeGhostView({ ghost, lineUnit }: { ghost: SlopeGhost; lineUnit: number }): JSX.Element {
  const color = STYLE.selection;
  const s = ghost.slope;
  // a, b, b + normal * depth, a + normal * depth
  const band = s ? (slopeBand(s) as [Vec2, Vec2, Vec2, Vec2]) : null;
  const w = STYLE.selectionWidth * lineUnit;
  return (
    <g data-kind="slope-ghost" stroke={color} fill="none">
      {band && (
        <>
          <path d={ringsPath([band])} fill={color} fillOpacity={GHOST_FILL_OPACITY} stroke="none" />
          <Line a={band[1]} b={band[2]} width={w / 2} kind="slope-ghost-edge" dashed={dashArray(lineUnit)} />
          <Line a={band[3]} b={band[0]} width={w / 2} kind="slope-ghost-edge" dashed={dashArray(lineUnit)} />
          <Line a={band[2]} b={band[3]} width={w / 2} kind="slope-ghost-end" />
        </>
      )}
      <Line a={ghost.a} b={ghost.b} width={w} kind="slope-ghost-start" />
      <Marks points={ghost.marks} lineUnit={lineUnit} color={color} />
      {ghost.marker && <SnapMarker marker={ghost.marker} lineUnit={lineUnit} />}
    </g>
  );
}

/** The first point and the beam footprint dashed like a real beam, with the snapped cursor marker. */
function BeamGhostView({ ghost, lineUnit }: { ghost: BeamGhost; lineUnit: number }): JSX.Element {
  const color = STYLE.selection;
  return (
    <g data-kind="beam-ghost" stroke={color} fill="none">
      {ghost.beam && (
        <path
          d={ringsPath([beamFootprint(ghost.beam)])}
          fill={color}
          fillOpacity={GHOST_FILL_OPACITY}
          strokeWidth={STYLE.selectionWidth * lineUnit}
          strokeDasharray={dashArray(lineUnit, STYLE.beamDash)}
        />
      )}
      <Marks points={ghost.marks} lineUnit={lineUnit} color={color} />
      {ghost.marker && <SnapMarker marker={ghost.marker} lineUnit={lineUnit} />}
    </g>
  );
}

/** The cupboard with its doors, in the selection color, or red over a faint red area when it does not fit. */
function CupboardGhostView({ ghost, lineUnit }: { ghost: CupboardGhost; lineUnit: number }): JSX.Element | null {
  const { level, cupboard, valid } = ghost;
  if (!Object.hasOwn(level.walls, cupboard.wallId)) return null;
  const color = valid ? STYLE.selection : STYLE.invalid;
  return (
    <g data-kind="cupboard-ghost" data-invalid={valid ? undefined : 'true'} stroke={color} fill="none" strokeLinecap="butt">
      <path
        d={ringsPath([cupboardFootprint(level, cupboard)])}
        fill={color}
        fillOpacity={valid ? GHOST_FILL_OPACITY : STYLE.invalidFillOpacity}
        strokeWidth={STYLE.selectionWidth * lineUnit}
      />
      <CupboardDoors level={level} c={cupboard} f={cupboardFrame(level, cupboard)} lineUnit={lineUnit} />
    </g>
  );
}

/**
 * Previews of the slope, beam and cupboard tools (overlay.ghost of kind 'volume-*'); nothing for
 * any other ghost.
 */
export function VolumeGhostView({ ghost, lineUnit }: { ghost: unknown; lineUnit: number }): JSX.Element | null {
  if (!isVolumeGhost(ghost)) return null;
  switch (ghost.kind) {
    case 'volume-slope':
      return <SlopeGhostView ghost={ghost} lineUnit={lineUnit} />;
    case 'volume-beam':
      return <BeamGhostView ghost={ghost} lineUnit={lineUnit} />;
    case 'volume-cupboard':
      return <CupboardGhostView ghost={ghost} lineUnit={lineUnit} />;
  }
}
