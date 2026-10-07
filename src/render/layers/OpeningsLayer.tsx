import type { JSX } from 'react';
import { openingFrame, type OpeningFrame } from '@/core/geometry/openings';
import { add, cross, scale, sub } from '@/core/geometry/vec';
import type { Level, Opening, Vec2 } from '@/core/model/types';
import { dashArray, num, STYLE } from '../style';

/**
 * Opening symbols, drawn in world coordinates from the opening frame. Local coordinates (a, b):
 * a along the wall axis from the opening center (-width/2 = start side), b along the wall normal
 * (+b = left of the wall = swing 'left'). The wall faces are at b = +-thickness/2.
 */
interface Ctx {
  f: OpeningFrame;
  o: Opening;
  lineUnit: number;
  hw: number; // half width
  ht: number; // half thickness
  s: 1 | -1; // swing side along the normal
}

const P = (c: Ctx, a: number, b: number): Vec2 => add(c.f.center, add(scale(c.f.dir, a), scale(c.f.normal, b)));

function Seg({ p, q, width, stroke = STYLE.openingStroke, dashed }: { p: Vec2; q: Vec2; width: number; stroke?: string; dashed?: string }): JSX.Element {
  return <line x1={num(p.x)} y1={num(p.y)} x2={num(q.x)} y2={num(q.y)} stroke={stroke} strokeWidth={width} strokeDasharray={dashed} />;
}

/**
 * A swinging leaf hinged at local a = hingeA on the wall face of the swing side, of length len,
 * closing towards `toward` (+1 = towards +a): the leaf drawn open (perpendicular to the wall) and
 * the dashed quarter circle its free end travels.
 */
function Leaf({ c, hingeA, len, toward, thin }: { c: Ctx; hingeA: number; len: number; toward: 1 | -1; thin: boolean }): JSX.Element {
  const faceB = c.s * c.ht;
  const hinge = P(c, hingeA, faceB);
  const open = P(c, hingeA, faceB + c.s * len);
  const closed = P(c, hingeA + toward * len, faceB);
  // SVG sweep-flag 1 = increasing angle = cross(from - center, to - center) > 0 (y down)
  const sweep = cross(sub(open, hinge), sub(closed, hinge)) > 0 ? 1 : 0;
  const r = num(len);
  const k = thin ? STYLE.frameWidth / STYLE.leafWidth : 1;
  return (
    <>
      <Seg p={hinge} q={open} width={STYLE.leafWidth * k * c.lineUnit} />
      <path
        d={`M${num(open.x)} ${num(open.y)}A${r} ${r} 0 0 ${sweep} ${num(closed.x)} ${num(closed.y)}`}
        fill="none"
        stroke={STYLE.openingStroke}
        strokeWidth={STYLE.arcWidth * k * c.lineUnit}
        strokeDasharray={dashArray(c.lineUnit)}
      />
    </>
  );
}

/** One leaf hinged on the `hinge` side, or two half leaves hinged on both jambs. */
function Leaves({ c, count, thin }: { c: Ctx; count: 1 | 2; thin: boolean }): JSX.Element {
  if (count === 2) {
    return (
      <>
        <Leaf c={c} hingeA={-c.hw} len={c.hw} toward={1} thin={thin} />
        <Leaf c={c} hingeA={c.hw} len={c.hw} toward={-1} thin={thin} />
      </>
    );
  }
  const atStart = c.o.hinge === 'start';
  return <Leaf c={c} hingeA={atStart ? -c.hw : c.hw} len={2 * c.hw} toward={atStart ? 1 : -1} thin={thin} />;
}

/** Two panels offset across the thickness, overlapping a little in the middle. */
function SlidingPanels({ c, width }: { c: Ctx; width: number }): JSX.Element {
  const overlap = Math.min(c.hw * 0.2, 10);
  const b = c.ht * 0.35;
  return (
    <>
      <Seg p={P(c, -c.hw, -b)} q={P(c, overlap, -b)} width={width} />
      <Seg p={P(c, -overlap, b)} q={P(c, c.hw, b)} width={width} />
    </>
  );
}

/** Thin lines on both wall faces across the opening (window frame). */
function Faces({ c }: { c: Ctx }): JSX.Element {
  const w = STYLE.frameWidth * c.lineUnit;
  return (
    <>
      <Seg p={P(c, -c.hw, -c.ht)} q={P(c, c.hw, -c.ht)} width={w} />
      <Seg p={P(c, -c.hw, c.ht)} q={P(c, c.hw, c.ht)} width={w} />
    </>
  );
}

const Center = ({ c }: { c: Ctx }): JSX.Element => (
  <Seg p={P(c, -c.hw, 0)} q={P(c, c.hw, 0)} width={STYLE.frameWidth * c.lineUnit} />
);

function DoorSymbol({ c }: { c: Ctx }): JSX.Element {
  const leafWidth = STYLE.leafWidth * c.lineUnit;
  switch (c.o.variant) {
    case 'double':
      return <Leaves c={c} count={2} thin={false} />;
    case 'sliding':
      return <SlidingPanels c={c} width={leafWidth} />;
    case 'pocket': {
      // the leaf across the opening, and dashed (light, over the dark wall) where it slides into the wall
      const atStart = c.o.hinge === 'start';
      const jamb = atStart ? -c.hw : c.hw;
      // the pocket is as long as the leaf, but stops at the wall end (axis node)
      const inside = atStart ? Math.max(jamb - 2 * c.hw, -c.o.offset) : Math.min(jamb + 2 * c.hw, c.f.wallLength - c.o.offset);
      return (
        <>
          <Seg p={P(c, -c.hw, 0)} q={P(c, c.hw, 0)} width={leafWidth} />
          <Seg p={P(c, jamb, 0)} q={P(c, inside, 0)} width={leafWidth} stroke={STYLE.pocketStroke} dashed={dashArray(c.lineUnit)} />
        </>
      );
    }
    default:
      return <Leaves c={c} count={1} thin={false} />;
  }
}

function WindowSymbol({ c }: { c: Ctx }): JSX.Element {
  switch (c.o.variant) {
    case 'sliding':
      return (
        <>
          <Faces c={c} />
          <SlidingPanels c={c} width={STYLE.frameWidth * c.lineUnit} />
        </>
      );
    case 'fixed':
      return (
        <>
          <Faces c={c} />
          <Center c={c} />
        </>
      );
    case 'double':
      return (
        <>
          <Faces c={c} />
          <Center c={c} />
          <Leaves c={c} count={2} thin />
        </>
      );
    default:
      return (
        <>
          <Faces c={c} />
          <Center c={c} />
          <Leaves c={c} count={1} thin />
        </>
      );
  }
}

/** Door, window or passage symbols; a passage is just the gap cut in the wall. */
export function OpeningsLayer({ level, lineUnit }: { level: Level; lineUnit: number }): JSX.Element {
  return (
    <g data-kind="openings" fill="none" strokeLinecap="butt">
      {Object.values(level.openings).map((o) => {
        if (!level.walls[o.wallId]) return null; // broken reference: never crash the whole plan
        const f = openingFrame(level, o);
        const c: Ctx = { f, o, lineUnit, hw: o.width / 2, ht: f.thickness / 2, s: o.swing === 'left' ? 1 : -1 };
        return (
          <g key={o.id} data-kind="opening" data-id={o.id}>
            {o.kind === 'door' && <DoorSymbol c={c} />}
            {o.kind === 'window' && <WindowSymbol c={c} />}
          </g>
        );
      })}
    </g>
  );
}
