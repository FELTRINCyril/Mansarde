import type { JSX } from 'react';
import { CLEARANCE_ADVISED } from '@/core/checks/rules/cupboards';
import { cupboardDoors, cupboardFrame, type CupboardFrame } from '@/core/geometry/cupboards';
import { add, cross, dist, normalize, scale, sub } from '@/core/geometry/vec';
import type { Cupboard, Id, Level, Ring, Vec2 } from '@/core/model/types';
import { ringsPath } from '../path';
import { dashArray, num, STYLE } from '../style';

function Seg({ p, q, kind, width, dashed }: { p: Vec2; q: Vec2; kind: string; width: number; dashed?: string }): JSX.Element {
  return <line data-kind={kind} x1={num(p.x)} y1={num(p.y)} x2={num(q.x)} y2={num(q.y)} strokeWidth={width} strokeDasharray={dashed} />;
}

/** The point at distance `inset` behind the front edge point p (towards the wall). */
const behind = (f: CupboardFrame, p: Vec2, inset: number): Vec2 => sub(p, scale(f.outward, inset));

/** Door panels, swing arcs (hinged) or two tracks (sliding), and handles. */
function Doors({ level, c, f, lineUnit }: { level: Level; c: Cupboard; f: CupboardFrame; lineUnit: number }): JSX.Element {
  const doors = cupboardDoors(level, c);
  const thin = STYLE.objectLine * lineUnit;
  const inset = Math.min(STYLE.cupboardDoorInset, f.depth / 4);
  const handleWidth = STYLE.cupboardHandleWidth * lineUnit;
  return (
    <>
      {doors.map((d, i) => {
        const w = dist(d.from, d.to);
        // hingeAt is a copy of `from` or of `to` (cupboardDoors)
        const hingeAtFrom = d.hingeAt.x === d.from.x && d.hingeAt.y === d.from.y;
        const toFree = normalize(sub(hingeAtFrom ? d.to : d.from, d.hingeAt));
        const handleLen = Math.min(12, w / 3);
        if (c.doorType === 'sliding') {
          // alternate tracks, each panel overlapping its neighbours a little
          const track = inset + (i % 2) * Math.min(STYLE.cupboardTrackGap, f.depth / 4);
          const overlap = Math.min(w * 0.1, 3);
          const from = sub(d.from, scale(f.dir, i > 0 ? overlap : 0));
          const to = add(d.to, scale(f.dir, i < doors.length - 1 ? overlap : 0));
          const mid = scale(add(d.from, d.to), 0.5);
          const h = behind(f, mid, track + Math.min(3, f.depth / 6));
          return (
            <g key={i}>
              <Seg kind="cupboard-door" p={behind(f, from, track)} q={behind(f, to, track)} width={STYLE.leafWidth * lineUnit} />
              <Seg kind="cupboard-handle" p={sub(h, scale(f.dir, handleLen / 2))} q={add(h, scale(f.dir, handleLen / 2))} width={handleWidth} />
            </g>
          );
        }
        // hinged: the closed panel, the dashed quarter circle of its free end, the handle by the free end
        const open = add(d.hingeAt, scale(f.outward, w));
        const free = add(d.hingeAt, scale(toFree, w));
        const sweep = cross(sub(free, d.hingeAt), sub(open, d.hingeAt)) > 0 ? 1 : 0;
        const r = num(w);
        const h = behind(f, sub(free, scale(toFree, Math.min(8, w / 4))), inset + Math.min(3, f.depth / 6));
        return (
          <g key={i}>
            <Seg kind="cupboard-door" p={behind(f, d.from, inset)} q={behind(f, d.to, inset)} width={STYLE.leafWidth * lineUnit} />
            <path
              data-kind="cupboard-arc"
              d={`M${num(free.x)} ${num(free.y)}A${r} ${r} 0 0 ${sweep} ${num(open.x)} ${num(open.y)}`}
              strokeWidth={thin * STYLE.arcWidth}
              strokeDasharray={dashArray(lineUnit)}
            />
            <Seg kind="cupboard-handle" p={sub(h, scale(toFree, handleLen / 2))} q={add(h, scale(toFree, handleLen / 2))} width={handleWidth} />
          </g>
        );
      })}
    </>
  );
}

/** The free zone advised in front of the cupboard (CLEARANCE_ADVISED deep, across its width). */
function clearanceRing(f: CupboardFrame): Ring {
  const out = scale(f.outward, CLEARANCE_ADVISED);
  return [f.front[0], f.front[1], add(f.front[1], out), add(f.front[0], out)];
}

/**
 * Built-in cupboards (spec 7.3), drawn with the furniture just before it: the footprint filled
 * with the cupboard color at the furniture opacity, the doors (panels, swing arcs of hinged doors
 * or the two tracks of sliding doors) and their handles. A selected cupboard (screen only: the
 * caller passes no selection in print mode) shows the 60 cm clearance advised in front of it.
 * Cupboards left out of `footprints` (missing wall) are not drawn.
 */
export function CupboardsLayer({
  level,
  footprints,
  selectedIds,
  lineUnit,
}: {
  level: Level;
  footprints: Map<Id, Ring>;
  selectedIds: ReadonlySet<Id>;
  lineUnit: number;
}): JSX.Element {
  const shown = Object.values(level.cupboards).filter((c) => footprints.has(c.id));
  return (
    <g data-kind="cupboards">
      {shown
        .filter((c) => selectedIds.has(c.id))
        .map((c) => (
          <path
            key={`clearance-${c.id}`}
            data-kind="cupboard-clearance"
            data-id={c.id}
            d={ringsPath([clearanceRing(cupboardFrame(level, c))])}
            fill={STYLE.clearanceFill}
            fillOpacity={STYLE.clearanceOpacity}
            stroke="none"
          />
        ))}
      {shown.map((c) => (
        <g key={c.id} data-kind="cupboard" data-id={c.id} stroke={STYLE.objectStroke} fill="none" strokeLinecap="butt">
          <path d={ringsPath([footprints.get(c.id)!])} fill={c.color} fillOpacity={STYLE.objectFillOpacity} strokeWidth={STYLE.objectLine * lineUnit} />
          <Doors level={level} c={c} f={cupboardFrame(level, c)} lineUnit={lineUnit} />
        </g>
      ))}
    </g>
  );
}
