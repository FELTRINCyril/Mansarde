import { cupboardFrame } from '../../geometry/cupboards';
import { openingInterval } from '../../geometry/openings';
import { add, dot, scale, sub } from '../../geometry/vec';
import { formatCm } from '../../model/format';
import type { Opening, Shape, Vec2 } from '../../model/types';
import {
  boxesOverlap,
  boxOf,
  HEIGHT_TOLERANCE,
  isLow,
  makeCheck,
  nameOf,
  ringShape,
  targetOf,
  type CheckContext,
  type Item,
} from '../context';
import { clipShape, shapeArea } from '../overlap';
import type { Check, CheckSeverity } from '../types';
import { wallsInside } from './walls';

/** Recommended free passage in front of a cupboard (cm); under CLEARANCE_ERROR it is an error. */
export const CLEARANCE_ADVISED = 60;
export const CLEARANCE_ERROR = 30;
/** Lateral margin (cm) left out of the passage on each side, so that a wall or a neighbour touching its side does not count. */
const SIDE_MARGIN = 1;
const EPS = 1e-6;

const OPENING_RULE: Record<Opening['kind'], { severity: CheckSeverity; what: string }> = {
  door: { severity: 'error', what: 'une porte' },
  passage: { severity: 'error', what: 'un passage' },
  window: { severity: 'warning', what: 'une fenêtre' },
};

/**
 * Cupboard in front of an opening (spec 5.4): the interval of the cupboard along its wall overlaps
 * the interval of an opening of the same wall, and the cupboard (from the floor to its top) rises
 * more than 1 cm into the opening (a low cupboard under a window sill is fine). The wall is
 * crossed by the opening, so either face counts. A door or a passage gives an error, a window a
 * warning.
 */
export function cupboardOpeningChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  const openings = Object.values(ctx.level.openings);
  for (const item of ctx.cupboards) {
    const c = item.cupboard!;
    const lo = c.offset - c.width / 2;
    const hi = c.offset + c.width / 2;
    for (const o of openings) {
      if (o.wallId !== c.wallId) continue;
      const [olo, ohi] = openingInterval(o);
      if (!(Math.min(hi, ohi) - Math.max(lo, olo) > EPS)) continue;
      if (!(Math.min(item.top, o.sillHeight + o.height) - Math.max(0, o.sillHeight) > HEIGHT_TOLERANCE)) continue;
      const rule = OPENING_RULE[o.kind];
      out.push(makeCheck('cupboardOpening', rule.severity, `${nameOf(ctx, item)} : devant ${rule.what}.`, [targetOf(item), { kind: 'opening', id: o.id }]));
    }
  }
  return out;
}

/** Smallest distance from the front edge (along `outward`) of the pieces of `shape` that have an area. */
function nearest(shape: Shape, front: Vec2, outward: Vec2): number {
  let best = Infinity;
  for (const poly of shape) {
    if (shapeArea([poly]) <= EPS) continue;
    for (const p of poly.outer) best = Math.min(best, dot(sub(p, front), outward));
  }
  return best;
}

/**
 * Cupboard clearance (spec 5.4): the free distance in front of the cupboard, over its width (less
 * 1 cm on each side), up to the first obstacle: an object other than a rug with its underside
 * under 200 cm, another cupboard, or a wall. Under 60 cm: a warning; under 30 cm: an error. The
 * targets are the cupboard and the object or cupboard in the way (none for a wall).
 */
export function cupboardClearanceChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  for (const item of ctx.cupboards) {
    const f = cupboardFrame(ctx.level, item.cupboard!); // the wall exists: the item has a footprint
    if (f.width <= 2 * SIDE_MARGIN) continue;
    const a = add(f.front[0], scale(f.dir, SIDE_MARGIN));
    const b = add(f.front[0], scale(f.dir, f.width - SIDE_MARGIN));
    const far = scale(f.outward, CLEARANCE_ADVISED);
    const strip = [a, b, add(b, far), add(a, far)];
    const box = boxOf(strip);

    let best = nearest(wallsInside(ctx.derived, strip, box), f.front[0], f.outward);
    let by: Item | null = null;
    for (const other of ctx.items) {
      if (other === item || !isLow(other) || !boxesOverlap(other.box, box)) continue;
      const d = nearest(clipShape(ringShape(other.footprint), strip), f.front[0], f.outward);
      if (d < best) {
        best = d;
        by = other;
      }
    }

    if (!(best < CLEARANCE_ADVISED - EPS)) continue;
    const free = Math.max(0, Math.floor(best * 10 + EPS) / 10);
    const severity: CheckSeverity = best < CLEARANCE_ERROR - EPS ? 'error' : 'warning';
    const message = `${nameOf(ctx, item)} : ${formatCm(free)} de passage devant (${CLEARANCE_ADVISED} cm conseillés).`;
    out.push(makeCheck('cupboardClearance', severity, message, by ? [targetOf(item), targetOf(by)] : [targetOf(item)]));
  }
  return out;
}
