import { pointInRing } from '../../geometry/polygon';
import { HEIGHT_TOLERANCE, makeCheck, nameOf, targetOf, type CheckContext, type Item } from '../context';
import type { Check } from '../types';

/**
 * `support` carries `item`: its level top is at the underside of `item` (1 cm tolerance) and its
 * footprint contains the center of `item`. Any object can carry (a shelf on a wall included), and
 * so can a cupboard of fixed height; a cupboard following the ceiling has no level top.
 */
export function carries(support: Item, item: Item): boolean {
  return (
    support !== item &&
    support.flatTop &&
    Math.abs(support.top - item.bottom) <= HEIGHT_TOLERANCE &&
    pointInRing(item.center, support.footprint)
  );
}

/**
 * Floating objects (spec 5.4): an 'onTop' object above the floor (underside more than 1 cm up)
 * that nothing carries at its height. Message gender-neutral (ruling V2-R17).
 */
export function floatingChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  for (const item of ctx.objects) {
    if (item.pose !== 'onTop' || item.bottom <= HEIGHT_TOLERANCE) continue;
    if (ctx.items.some((s) => carries(s, item))) continue;
    out.push(makeCheck('floating', 'warning', `${nameOf(ctx, item)} : aucun support en dessous.`, [targetOf(item)]));
  }
  return out;
}
