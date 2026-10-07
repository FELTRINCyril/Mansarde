import type { JSX } from 'react';
import type { Shape } from '@/core/model/types';
import { shapePath } from '../path';
import { STYLE } from '../style';

/** The united wall shape (openings cut out) as a single even-odd path, no stroke: no line at the joints. */
export function WallsLayer({ shape }: { shape: Shape }): JSX.Element | null {
  const d = shapePath(shape);
  if (!d) return null;
  return <path data-kind="wall-shape" d={d} fillRule="evenodd" fill={STYLE.wallFill} stroke="none" />;
}
