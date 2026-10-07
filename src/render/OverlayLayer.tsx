import type { JSX } from 'react';
import { HANDLE_PX, type ObjectHandle } from '@/editor/handles';
import type { Overlay } from '@/editor/store';
import { isOutlineGhost } from '@/editor/tools/types';
import { isDrawGhost } from '@/editor/tools/drawing';
import { DimLineView } from './DimLineView';
import { DrawGhostView } from './DrawGhostView';
import { ringsPath } from './path';
import { dashArray, num, STYLE } from './style';

/**
 * Interaction layer, drawn last on screen (passed to PlanSvg as `overlay`), driven by the store's
 * `overlay`: selection rectangle, snap guides, dynamic dimensions (the active one highlighted),
 * the tool ghost (red when the preview is invalid) and the handles of the selected object. The
 * selection highlight itself is SelectionLayer's (PlanSvg `selection`). Sizes are screen pixels
 * times lineUnit, like every other layer.
 */
export function OverlayLayer({
  overlay,
  handles,
  lineUnit,
}: {
  overlay: Overlay;
  handles: ObjectHandle[];
  lineUnit: number;
}): JSX.Element {
  const { marquee, guides, dynamicDims, activeDimIndex, ghost, previewInvalid } = overlay;
  const ghostColor = previewInvalid ? STYLE.invalid : STYLE.selection;
  const half = (HANDLE_PX / 2) * lineUnit;
  return (
    <g data-kind="overlay">
      {isDrawGhost(ghost) && <DrawGhostView ghost={ghost} lineUnit={lineUnit} />}
      {guides.map((g, i) => (
        <line
          key={`guide-${i}`}
          data-kind="guide"
          x1={num(g.a.x)}
          y1={num(g.a.y)}
          x2={num(g.b.x)}
          y2={num(g.b.y)}
          stroke={STYLE.guide}
          strokeWidth={STYLE.guideWidth * lineUnit}
          strokeDasharray={dashArray(lineUnit, STYLE.guideDash)}
        />
      ))}
      {dynamicDims.map((dim, i) => (
        <DimLineView
          key={`dim-${i}`}
          dim={dim}
          lineUnit={lineUnit}
          color={i === activeDimIndex ? STYLE.activeDynamicDim : STYLE.dynamicDim}
          kind="dynamic-dimension"
          id={String(i)}
        />
      ))}
      {isOutlineGhost(ghost) && (
        <g data-kind="ghost" data-invalid={previewInvalid ? 'true' : undefined} stroke={ghostColor} strokeWidth={STYLE.selectionWidth * lineUnit}>
          {ghost.rings.length > 0 && (
            <path d={ringsPath(ghost.rings)} fill={ghostColor} fillOpacity={STYLE.invalidFillOpacity} fillRule="evenodd" strokeLinejoin="round" />
          )}
          {ghost.points.map((p, i) => (
            <circle key={i} cx={num(p.x)} cy={num(p.y)} r={STYLE.ghostPointRadius * lineUnit} fill={ghostColor} fillOpacity={STYLE.invalidFillOpacity} />
          ))}
        </g>
      )}
      {handles.length > 0 && (
        <g data-kind="handles" stroke={STYLE.selection} strokeWidth={STYLE.handleWidth * lineUnit} fill={STYLE.paper}>
          {handles.map((h) =>
            h.kind === 'rotate' ? (
              <g key="rotate" data-kind="handle-rotate">
                {h.anchor && <line x1={num(h.anchor.x)} y1={num(h.anchor.y)} x2={num(h.at.x)} y2={num(h.at.y)} />}
                <circle cx={num(h.at.x)} cy={num(h.at.y)} r={STYLE.handleRadius * lineUnit} />
              </g>
            ) : (
              <rect
                key={`${h.sx},${h.sy}`}
                data-kind="handle-resize"
                x={h.at.x - half}
                y={h.at.y - half}
                width={2 * half}
                height={2 * half}
              />
            ),
          )}
        </g>
      )}
      {marquee && (
        <rect
          data-kind="marquee"
          x={num(Math.min(marquee.a.x, marquee.b.x))}
          y={num(Math.min(marquee.a.y, marquee.b.y))}
          width={num(Math.abs(marquee.b.x - marquee.a.x))}
          height={num(Math.abs(marquee.b.y - marquee.a.y))}
          fill={STYLE.selection}
          fillOpacity={STYLE.marqueeFillOpacity}
          stroke={STYLE.selection}
          strokeWidth={lineUnit}
          strokeDasharray={dashArray(lineUnit, STYLE.guideDash)}
        />
      )}
    </g>
  );
}
