import type { JSX } from 'react';
import { deriveLevel } from '@/core/geometry/derived';
import type { Level } from '@/core/model/types';
import { shapePath } from '../path';
import { STYLE } from '../style';

/** Walls of the level below, in light grey, to align the current level on it (no openings, no objects). */
export function LowerLevelLayer({ level }: { level: Level | null | undefined }): JSX.Element | null {
  if (!level) return null;
  const d = shapePath(deriveLevel(level).shapeNoOpenings);
  if (!d) return null;
  return <path data-kind="lower-level" data-id={level.id} d={d} fillRule="evenodd" fill={STYLE.ghostFill} stroke="none" />;
}
