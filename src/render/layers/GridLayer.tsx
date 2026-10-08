import type { JSX } from 'react';
import { num, STYLE } from '../style';

export interface ViewBox { x: number; y: number; width: number; height: number }

const MAJOR_EVERY = 10;
const MAX_LINES = 2000; // per direction, safety net against an absurd step

/** Multiples of `step` in [lo, hi], minus the multiples of `skipEvery * step` when skipEvery > 0. */
function positions(lo: number, hi: number, step: number, skipEvery: number): number[] {
  const first = Math.ceil(lo / step);
  const last = Math.floor(hi / step);
  if (last - first > MAX_LINES) return [];
  const out: number[] = [];
  for (let i = first; i <= last; i++) {
    if (skipEvery > 0 && i % skipEvery === 0) continue;
    out.push(i * step); // integer index times step: no accumulated rounding error
  }
  return out;
}

function linesPath(vb: ViewBox, step: number, skipEvery: number): string {
  const x1 = vb.x + vb.width;
  const y1 = vb.y + vb.height;
  const vertical = positions(vb.x, x1, step, skipEvery).map((x) => `M${num(x)} ${num(vb.y)}V${num(y1)}`);
  const horizontal = positions(vb.y, y1, step, skipEvery).map((y) => `M${num(vb.x)} ${num(y)}H${num(x1)}`);
  return vertical.join('') + horizontal.join('');
}

/**
 * Grid lines every gridStep cm and a stronger line every 10 steps, limited to the view box. A grid
 * whose lines would be closer than STYLE.gridMinPx display pixels is not drawn.
 */
export function GridLayer({ viewBox, gridStep, lineUnit }: { viewBox: ViewBox; gridStep: number; lineUnit: number }): JSX.Element | null {
  if (!(gridStep > 0) || !(lineUnit > 0)) return null;
  const major = gridStep * MAJOR_EVERY;
  const showMinor = gridStep / lineUnit >= STYLE.gridMinPx;
  const showMajor = major / lineUnit >= STYLE.gridMinPx;
  if (!showMajor) return null;
  return (
    <g data-kind="grid" fill="none">
      {showMinor && (
        <path data-kind="grid-minor" d={linesPath(viewBox, gridStep, MAJOR_EVERY)} stroke={STYLE.gridMinor} strokeWidth={STYLE.gridMinorWidth * lineUnit} />
      )}
      <path data-kind="grid-major" d={linesPath(viewBox, major, 0)} stroke={STYLE.gridMajor} strokeWidth={STYLE.gridMajorWidth * lineUnit} />
    </g>
  );
}
