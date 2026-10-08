import { AREA_TOLERANCE, HEIGHT_TOLERANCE, makeCheck, nameOf, targetOf, type CheckContext, type Item } from '../context';
import { ringsOverlapArea } from '../overlap';
import type { Check } from '../types';
import { carries } from './support';

/**
 * The vertical slices overlap by more than 1 cm, or by more than half the thinner one when it is
 * under 2 cm thick: with the plain 1 cm rule, two 1 cm rugs lying on the same floor could never
 * collide.
 */
function slicesOverlap(a: Item, b: Item): boolean {
  const overlap = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
  const thinner = Math.min(a.top - a.bottom, b.top - b.bottom);
  return overlap > Math.min(HEIGHT_TOLERANCE, thinner / 2);
}

/**
 * Pairs that may share space (spec 5.4): a rug and anything that is not a rug, a 'tuckable'
 * object and a catalog table or desk, an 'onTop' object and what carries it.
 */
function allowed(a: Item, b: Item): boolean {
  if ((a.pose === 'covering') !== (b.pose === 'covering')) return true;
  if ((a.pose === 'tuckable' && b.acceptsUnder) || (b.pose === 'tuckable' && a.acceptsUnder)) return true;
  if ((a.pose === 'onTop' && carries(b, a)) || (b.pose === 'onTop' && carries(a, b))) return true;
  return false;
}

/**
 * Collisions (spec 5.4): objects and cupboards whose footprints overlap by more than 1 cm2 and
 * whose vertical slices overlap (see slicesOverlap), except the allowed pairs. Candidates come
 * from a sweep over x of the bounding boxes; the exact overlap (overlap.ts: convex clipping, or
 * boolean.ts for an L shape) is only computed for pairs whose boxes and slices overlap. Messages
 * name the pair in level order.
 */
export function collisionChecks(ctx: CheckContext): Check[] {
  const sorted = [...ctx.items].sort((a, b) => a.box.minX - b.box.minX);
  const pairs: Array<[Item, Item]> = [];
  let active: Item[] = [];
  for (const item of sorted) {
    active = active.filter((o) => o.box.maxX > item.box.minX);
    for (const other of active) {
      if (!(Math.min(item.box.maxY, other.box.maxY) > Math.max(item.box.minY, other.box.minY))) continue;
      if (!slicesOverlap(item, other) || allowed(item, other)) continue;
      if (ringsOverlapArea(item.footprint, item.convex, other.footprint, other.convex) > AREA_TOLERANCE) {
        pairs.push(item.index < other.index ? [item, other] : [other, item]);
      }
    }
    active.push(item);
  }
  pairs.sort(([a1, b1], [a2, b2]) => a1.index - a2.index || b1.index - b2.index);
  return pairs.map(([a, b]) => makeCheck('collision', 'error', `${nameOf(ctx, a)} et ${nameOf(ctx, b)} se chevauchent.`, [targetOf(a), targetOf(b)]));
}
