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

/** Gap left between two hinged door panels (cm), at most a tenth of a door. */
const DOOR_GAP = 1;
/** How far a handle stands out of the front face (cm). */
const HANDLE_REACH = 3;

/**
 * Door panels, swing arcs (hinged) or two tracks (sliding), and handles. Hinged panels lie on the
 * front face with a small gap between them; each arc starts at the free end of its panel and is
 * centered on its hinge. Sliding panels run on two tracks just behind the front face. Handles are
 * short pulls standing out of the front face: by the free end of a hinged door, mid-panel on a
 * sliding one.
 */
function Doors({ level, c, f, lineUnit }: { level: Level; c: Cupboard; f: CupboardFrame; lineUnit: number }): JSX.Element {
  const doors = cupboardDoors(level, c);
  const thin = STYLE.objectLine * lineUnit;
  const inset = Math.min(STYLE.cupboardDoorInset, f.depth / 4);
  const handleWidth = STYLE.cupboardHandleWidth * lineUnit;
  const pull = (at: Vec2, key: string): JSX.Element => (
    <Seg key={key} kind="cupboard-handle" p={at} q={add(at, scale(f.outward, HANDLE_REACH))} width={handleWidth} />
  );
  return (
    <>
      {doors.map((d, i) => {
        const w = dist(d.from, d.to);
        const first = i === 0;
        const last = i === doors.length - 1;
        if (c.doorType === 'sliding') {
          // alternate tracks, each panel overlapping its neighbours a little
          const track = inset + (i % 2) * Math.min(STYLE.cupboardTrackGap, f.depth / 4);
          const overlap = Math.min(w * 0.1, 3);
          const from = sub(d.from, scale(f.dir, first ? 0 : overlap));
          const to = add(d.to, scale(f.dir, last ? 0 : overlap));
          return (
            <g key={i}>
              <Seg kind="cupboard-door" p={behind(f, from, track)} q={behind(f, to, track)} width={STYLE.leafWidth * lineUnit} />
              {pull(scale(add(d.from, d.to), 0.5), 'pull')}
            </g>
          );
        }
        // hinged: the panel shortened by half a gap at each end shared with another door
        const gap = Math.min(DOOR_GAP, w / 10) / 2;
        const from = add(d.from, scale(f.dir, first ? 0 : gap));
        const to = sub(d.to, scale(f.dir, last ? 0 : gap));
        // hingeAt is a copy of `from` or of `to` (cupboardDoors)
        const hingeAtFrom = d.hingeAt.x === d.from.x && d.hingeAt.y === d.from.y;
        const hinge = hingeAtFrom ? from : to;
        const free = hingeAtFrom ? to : from;
        const len = dist(from, to);
        const toHinge = normalize(sub(hinge, free));
        const open = add(hinge, scale(f.outward, len));
        const sweep = cross(sub(free, hinge), sub(open, hinge)) > 0 ? 1 : 0;
        const r = num(len);
        return (
          <g key={i}>
            <Seg kind="cupboard-door" p={from} q={to} width={STYLE.leafWidth * lineUnit} />
            <path
              data-kind="cupboard-arc"
              d={`M${num(free.x)} ${num(free.y)}A${r} ${r} 0 0 ${sweep} ${num(open.x)} ${num(open.y)}`}
              strokeWidth={thin * STYLE.arcWidth}
              strokeDasharray={dashArray(lineUnit)}
            />
            {pull(add(free, scale(toHinge, Math.min(8, len / 4))), 'pull')}
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
