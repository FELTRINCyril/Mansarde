import type { BoundsCm } from '@/export/pageLayout';
import type { ViewBox } from '@/render/PlanSvg';

/** The bounds grown on one axis to the width:height aspect of the thumbnail, centered. */
export function thumbnailViewBox(b: BoundsCm, width: number, height: number): ViewBox {
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const aspect = width / height;
  const vw = Math.max(w, h * aspect);
  const vh = vw / aspect;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { x: cx - vw / 2, y: cy - vh / 2, width: vw, height: vh };
}
