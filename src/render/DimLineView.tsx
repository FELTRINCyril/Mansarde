import type { JSX } from 'react';
import { dimLineEnds, type DimLine } from '@/core/geometry/autoDimensions';
import { add, angleOf, deg2rad, dot, lerp, normalize, perp, scale, sub } from '@/core/geometry/vec';
import { formatLength } from '@/core/model/format';
import type { Vec2 } from '@/core/model/types';
import { FONT_FAMILY, num, readableAngle, STYLE } from './style';

function Seg({ p, q, width }: { p: Vec2; q: Vec2; width: number }): JSX.Element {
  return <line x1={num(p.x)} y1={num(p.y)} x2={num(q.x)} y2={num(q.y)} strokeWidth={width} />;
}

const CAP_HEIGHT = 0.75; // digit height, in em: baseline offset when the text hangs below the line

/**
 * A dimension: extension lines from the measured points, the dimension line with 45 degree ticks,
 * and the length in meters along the line, rotated with it but never upside down. The text sits
 * on the far side of the line from the measured points, or between them and the line with
 * `textInside` (opening widths: keeps them clear of the room dimensions drawn just beyond).
 */
export function DimLineView({
  dim,
  lineUnit,
  color = STYLE.dimColor,
  kind,
  id,
  textInside = false,
}: {
  dim: DimLine;
  lineUnit: number;
  color?: string;
  kind: string;
  id: string;
  textInside?: boolean;
}): JSX.Element | null {
  if (!(dim.value > 1e-6)) return null;
  const [p, q] = dimLineEnds(dim);
  const u = normalize(sub(dim.b, dim.a));
  const n = normalize(perp(u));
  const side = Math.sign(dim.offset); // the dimension line lies on this side of a-b along n
  const gap = STYLE.dimExtGap * lineUnit;
  const overshoot = STYLE.dimExtOvershoot * lineUnit;
  const hasExtensions = Math.abs(dim.offset) > gap;
  const ext = (from: Vec2, to: Vec2) => [add(from, scale(n, side * gap)), add(to, scale(n, side * overshoot))] as const;
  const tick = scale(normalize(add(u, n)), STYLE.dimTick * lineUnit);
  const mid = lerp(p, q, 0.5);
  const angle = readableAngle((angleOf(u) * 180) / Math.PI);
  const fontSize = STYLE.dimText * lineUnit;
  const textGap = STYLE.dimTextGap * lineUnit;
  // "up" of the rotated text in world coordinates; the text goes above the line (negative dy) when
  // that is the wanted side, else it hangs below it (baseline one cap height further)
  const up = { x: Math.sin(deg2rad(angle)), y: -Math.cos(deg2rad(angle)) };
  const wanted = side === 0 ? up : scale(n, textInside ? -side : side);
  const dy = dot(up, wanted) >= 0 ? -textGap : textGap + CAP_HEIGHT * fontSize;
  const [e1a, e1b] = ext(dim.a, p);
  const [e2a, e2b] = ext(dim.b, q);
  return (
    <g data-kind={kind} data-id={id} stroke={color} fill="none">
      {hasExtensions && <Seg p={e1a} q={e1b} width={STYLE.dimLine * lineUnit} />}
      {hasExtensions && <Seg p={e2a} q={e2b} width={STYLE.dimLine * lineUnit} />}
      <Seg p={p} q={q} width={STYLE.dimLine * lineUnit} />
      <Seg p={sub(p, tick)} q={add(p, tick)} width={STYLE.dimTickWidth * lineUnit} />
      <Seg p={sub(q, tick)} q={add(q, tick)} width={STYLE.dimTickWidth * lineUnit} />
      <text
        x={num(mid.x)}
        y={num(mid.y)}
        dy={num(dy)}
        transform={`rotate(${num(angle)} ${num(mid.x)} ${num(mid.y)})`}
        fontSize={fontSize}
        fontFamily={FONT_FAMILY}
        textAnchor="middle"
        fill={color}
        stroke="none"
      >
        {formatLength(dim.value)}
      </text>
    </g>
  );
}
