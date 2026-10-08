import type { JSX } from 'react';
import { dimLineEnds, type DimLine } from '@/core/geometry/autoDimensions';
import { add, normalize, perp, scale, sub } from '@/core/geometry/vec';
import type { Vec2 } from '@/core/model/types';
import { dimText, dimTextRect } from './dimLayout';
import { FONT_FAMILY, num, STYLE } from './style';

function Seg({ p, q, width }: { p: Vec2; q: Vec2; width: number }): JSX.Element {
  return <line x1={num(p.x)} y1={num(p.y)} x2={num(q.x)} y2={num(q.y)} strokeWidth={width} />;
}

/**
 * A dimension: extension lines from the measured points, the dimension line with 45 degree ticks,
 * and the length in meters along the line, rotated with it but never upside down (dimText). The
 * text sits on the far side of the line from the measured points, or between them and the line with
 * `textInside` (opening widths: keeps them clear of the room dimensions drawn just beyond). A mask
 * (`maskColor`, the color of what lies under the text: paper, or the room fill) is drawn under the
 * text, so that furniture and other lines never cross it. A rectangle rather than a stroked text
 * outline: svg2pdf does not scale text strokes with the view.
 */
export function DimLineView({
  dim,
  lineUnit,
  color = STYLE.dimColor,
  kind,
  id,
  textInside = false,
  fontScale = 1,
  maskColor = STYLE.paper,
}: {
  dim: DimLine;
  lineUnit: number;
  color?: string;
  kind: string;
  id: string;
  textInside?: boolean;
  /** Text size relative to the normal dimension text (an opening width may be shrunk, R38). */
  fontScale?: number;
  maskColor?: string;
}): JSX.Element | null {
  const t = dimText(dim, lineUnit, textInside, fontScale);
  if (!t) return null;
  const [p, q] = dimLineEnds(dim);
  const u = normalize(sub(dim.b, dim.a));
  const n = normalize(perp(u));
  const side = Math.sign(dim.offset); // the dimension line lies on this side of a-b along n
  const gap = STYLE.dimExtGap * lineUnit;
  const overshoot = STYLE.dimExtOvershoot * lineUnit;
  const hasExtensions = Math.abs(dim.offset) > gap;
  const ext = (from: Vec2, to: Vec2) => [add(from, scale(n, side * gap)), add(to, scale(n, side * overshoot))] as const;
  const tick = scale(normalize(add(u, n)), STYLE.dimTick * lineUnit);
  const [e1a, e1b] = ext(dim.a, p);
  const [e2a, e2b] = ext(dim.b, q);
  const turn = `rotate(${num(t.angle)} ${num(t.at.x)} ${num(t.at.y)})`;
  const mask = dimTextRect(t);
  return (
    <g data-kind={kind} data-id={id} stroke={color} fill="none">
      {hasExtensions && <Seg p={e1a} q={e1b} width={STYLE.dimLine * lineUnit} />}
      {hasExtensions && <Seg p={e2a} q={e2b} width={STYLE.dimLine * lineUnit} />}
      <Seg p={p} q={q} width={STYLE.dimLine * lineUnit} />
      <Seg p={sub(p, tick)} q={add(p, tick)} width={STYLE.dimTickWidth * lineUnit} />
      <Seg p={sub(q, tick)} q={add(q, tick)} width={STYLE.dimTickWidth * lineUnit} />
      <rect
        data-kind="text-mask"
        x={num(t.at.x + mask.x)}
        y={num(t.at.y + mask.y)}
        width={num(mask.width)}
        height={num(mask.height)}
        transform={turn}
        fill={maskColor}
        stroke="none"
      />
      <text
        x={num(t.at.x)}
        y={num(t.at.y)}
        dy={num(t.dy)}
        transform={turn}
        fontSize={t.fontSize}
        fontFamily={FONT_FAMILY}
        textAnchor="middle"
        fill={color}
        stroke="none"
      >
        {t.text}
      </text>
    </g>
  );
}
