import type { JSX } from 'react';
import type { Shape } from '@/core/model/types';
import { shapePath } from '../path';
import { STYLE } from '../style';

/**
 * The united wall shape (openings cut out) as a single even-odd path, no stroke: no line at the
 * joints. A degraded shape (ruling R37) is made of polygons that may overlap, which even-odd would
 * punch out: each polygon is then a path of its own.
 */
export function WallsLayer({ shape, degraded = false }: { shape: Shape; degraded?: boolean }): JSX.Element | null {
  if (degraded) {
    return (
      <g data-kind="wall-shape" data-degraded="true" fill={STYLE.wallFill} stroke="none">
        {shape.map((poly, i) => (
          <path key={i} d={shapePath([poly])} fillRule="evenodd" />
        ))}
      </g>
    );
  }
  const d = shapePath(shape);
  if (!d) return null;
  return <path data-kind="wall-shape" d={d} fillRule="evenodd" fill={STYLE.wallFill} stroke="none" />;
}
