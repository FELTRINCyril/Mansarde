import type { JSX } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Level } from '@/core/model/types';
import { shapePath } from '../path';
import { STYLE } from '../style';

/** Walls of the level below, in light grey, to align the current level on it (no openings, no objects). */
export function LowerLevelLayer({ level }: { level: Level | null | undefined }): JSX.Element | null {
  if (!level) return null;
  const { shapeNoOpenings: shape, degraded } = deriveLevel(level);
  if (degraded) {
    // a degraded shape may overlap itself: one path per polygon, as in WallsLayer
    return (
      <g data-kind="lower-level" data-id={level.id} data-degraded="true" fill={STYLE.ghostFill} stroke="none">
        {shape.map((poly, i) => (
          <path key={i} d={shapePath([poly])} fillRule="evenodd" />
        ))}
      </g>
    );
  }
  const d = shapePath(shape);
  if (!d) return null;
  return <path data-kind="lower-level" data-id={level.id} d={d} fillRule="evenodd" fill={STYLE.ghostFill} stroke="none" />;
}
