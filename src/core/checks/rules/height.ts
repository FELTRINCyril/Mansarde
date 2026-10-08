import { ceilingUnder } from '../../geometry/ceiling';
import { formatLength } from '../../model/format';
import type { Level } from '../../model/types';
import { HEIGHT_TOLERANCE, makeCheck, nameOf, targetOf, type CheckContext } from '../context';
import type { Check } from '../types';

/**
 * Lowest ceiling the level can have anywhere: the level height, the lowest end of each slope and
 * the lowest underside of each beam. A top under it (plus the tolerance) cannot hit the ceiling,
 * which spares the exact ceilingUnder for most objects.
 */
function lowestCeiling(level: Level): number {
  let noBeams = level.height;
  for (const s of Object.values(level.slopes)) noBeams = Math.min(noBeams, s.heightStart, s.heightEnd);
  let low = noBeams;
  for (const b of Object.values(level.beams)) low = Math.min(low, b.mode === 'fixed' ? b.bottom : noBeams - b.drop);
  return low;
}

/**
 * Height under the ceiling (spec 5.4): an object whose top (elevation + height) is more than 1 cm
 * above the lowest ceiling over its footprint, and the same for a cupboard of fixed height (a
 * cupboard in 'ceiling' mode follows the ceiling). Stairs and other catalog 'Structure' entries
 * cross the ceiling on purpose and are not checked (ruling V2-R16).
 */
export function heightChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  const floor = lowestCeiling(ctx.level) + HEIGHT_TOLERANCE;
  for (const item of ctx.items) {
    if (item.structure || (item.cupboard && item.cupboard.heightMode !== 'fixed')) continue;
    if (!(item.top > floor)) continue;
    const under = ceilingUnder(ctx.level, item.footprint);
    if (!(item.top > under.height + HEIGHT_TOLERANCE)) continue;
    const message = `${nameOf(ctx, item)} : monte à ${formatLength(item.top)}, plafond à ${formatLength(under.height)} à cet endroit.`;
    out.push(makeCheck('height', 'error', message, [targetOf(item)]));
  }
  return out;
}
