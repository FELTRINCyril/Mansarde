import type { JSX } from 'react';
import type { DrawGhost } from '@/editor/tools/drawing';
import type { Vec2 } from '@/core/model/types';
import { CAP_HEIGHT, FONT_FAMILY, num, STYLE } from './style';

const MARKER_PX = 5; // half size of the snapped cursor marker
const LABEL_DISTANCE_PX = 16;
const DEFAULT_TOWARD: Vec2 = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
const LABEL_LINE_PX = 14;
const SIDE = 0.3; // |component| above which the label block sits fully on that side

/**
 * First baseline and anchor of a block of lines placed LABEL_DISTANCE_PX from `at` along `toward`,
 * the block lying on that side of the point (start / middle / end, above / centered / below).
 */
function labelPlacement(label: NonNullable<DrawGhost['label']>, lineUnit: number, fontSize: number) {
  const t = label.toward ?? DEFAULT_TOWARD;
  const x = label.at.x + t.x * LABEL_DISTANCE_PX * lineUnit;
  const y = label.at.y + t.y * LABEL_DISTANCE_PX * lineUnit;
  const lineH = LABEL_LINE_PX * lineUnit;
  const cap = CAP_HEIGHT * fontSize;
  const height = (label.lines.length - 1) * lineH + cap;
  const anchor: 'start' | 'middle' | 'end' = t.x > SIDE ? 'start' : t.x < -SIDE ? 'end' : 'middle';
  const first = t.y < -SIDE ? y - (label.lines.length - 1) * lineH : t.y > SIDE ? y + cap : y - height / 2 + cap;
  return { x, first, anchor, lineH };
}
const WALL_OPACITY = 0.35;

const pts = (points: Vec2[]): string => points.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');

/** Marker of the snapped point: square on a node, diamond on a wall (middle or axis), cross elsewhere. */
function Marker({ at, snap, lineUnit, color }: { at: Vec2; snap: string; lineUnit: number; color: string }): JSX.Element {
  const h = MARKER_PX * lineUnit;
  const { x, y } = at;
  if (snap === 'node') return <rect data-snap={snap} x={num(x - h)} y={num(y - h)} width={num(2 * h)} height={num(2 * h)} fill="none" />;
  if (snap === 'wallMid' || snap === 'wallAxis') {
    return <polygon data-snap={snap} points={pts([{ x, y: y - h }, { x: x + h, y }, { x, y: y + h }, { x: x - h, y }])} fill="none" />;
  }
  return (
    <path
      data-snap={snap}
      d={`M${num(x - h)} ${num(y)}H${num(x + h)}M${num(x)} ${num(y - h)}V${num(y + h)}`}
      stroke={color}
    />
  );
}

/**
 * Ghost of the wall and rectangle tools (overlay.ghost of kind 'draw'): the wall axes stroked with
 * the wall thickness (translucent, mitered joints like the real walls) and the axis itself dashed
 * (unless `axis: false`; a reference line is a path of thickness 0), the
 * snapped cursor marker, and the label lines next to the cursor (white halo for legibility).
 */
export function DrawGhostView({ ghost, lineUnit }: { ghost: DrawGhost; lineUnit: number }): JSX.Element {
  const color = STYLE.selection;
  const fontSize = STYLE.dimText * lineUnit;
  const label = ghost.label && labelPlacement(ghost.label, lineUnit, fontSize);
  return (
    <g data-kind="draw-ghost" fill="none" stroke={color}>
      {ghost.paths.map((p, i) => {
        const Shape = p.closed ? 'polygon' : 'polyline';
        return (
          <g key={i} data-kind={p.thickness > 0 ? 'wall-preview' : 'reference-line'}>
            <Shape points={pts(p.points)} strokeWidth={p.thickness} strokeOpacity={WALL_OPACITY} strokeLinejoin="miter" strokeMiterlimit={8} />
            {p.axis !== false && <Shape points={pts(p.points)} strokeWidth={lineUnit} strokeDasharray={`${4 * lineUnit} ${3 * lineUnit}`} />}
          </g>
        );
      })}
      {ghost.marker && (
        <g data-kind="snap-marker" strokeWidth={STYLE.handleWidth * lineUnit}>
          <Marker at={ghost.marker.at} snap={ghost.marker.snap} lineUnit={lineUnit} color={color} />
        </g>
      )}
      {label && (
        <text
          data-kind="draw-label"
          x={num(label.x)}
          y={num(label.first)}
          textAnchor={label.anchor}
          fontSize={fontSize}
          fontFamily={FONT_FAMILY}
          fill={color}
          stroke={STYLE.paper}
          strokeWidth={3 * lineUnit}
          paintOrder="stroke"
        >
          {ghost.label!.lines.map((line, i) => (
            <tspan key={i} x={num(label.x)} dy={i === 0 ? 0 : num(label.lineH)}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}
