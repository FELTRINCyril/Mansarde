import type { Draft } from 'immer';
import type { Id, Level, Opening } from '../model/types';
import { wallLength } from '../geometry/walls';
import { CommandError } from './apply';

const EPS = 1e-6; // same tolerance as openingFitsWall / openingsOverlap
const CHANGE_EPS = 1e-9; // below this, an offset is left untouched (no spurious patch)

export const OPENINGS_DO_NOT_FIT = 'Le mur est trop court pour ses ouvertures';

/**
 * Makes every opening fit its wall again after the walls changed length:
 * 1. each offset is clamped into [width / 2, wallLength - width / 2];
 * 2. on each wall, openings keep their order along the axis; a forward pass pushes an opening
 *    overlapping the previous one forward, then a backward pass pulls openings that went past
 *    the wall end backward. Openings that already fit and do not overlap never move.
 * Throws CommandError when an opening is wider than its wall or the openings of a wall are wider
 * than the wall all together.
 */
export function reconcileOpenings(level: Draft<Level>): void {
  const byWall = new Map<Id, Draft<Opening>[]>();
  for (const o of Object.values(level.openings)) {
    const list = byWall.get(o.wallId) ?? [];
    list.push(o);
    byWall.set(o.wallId, list);
  }

  for (const [wallId, openings] of byWall) {
    const len = wallLength(level, wallId);
    const offsets = new Map<Draft<Opening>, number>();
    for (const o of openings) {
      if (o.width > len + EPS) throw new CommandError(OPENINGS_DO_NOT_FIT);
      offsets.set(o, Math.min(Math.max(o.offset, o.width / 2), len - o.width / 2));
    }
    // order along the axis before the change (clamping alone could swap a narrow and a wide one)
    const sorted = [...openings].sort((a, b) => a.offset - b.offset);

    let cursor = 0;
    for (const o of sorted) {
      const off = Math.max(offsets.get(o)!, cursor + o.width / 2);
      offsets.set(o, off);
      cursor = off + o.width / 2;
    }
    cursor = len;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const o = sorted[i]!;
      const off = Math.min(offsets.get(o)!, cursor - o.width / 2);
      offsets.set(o, off);
      cursor = off - o.width / 2;
    }
    if (cursor < -EPS) throw new CommandError(OPENINGS_DO_NOT_FIT);

    for (const o of openings) {
      const off = offsets.get(o)!;
      if (Math.abs(off - o.offset) > CHANGE_EPS) o.offset = off;
    }
  }
}

export const CUPBOARDS_DO_NOT_FIT = 'Le mur est trop court pour ses placards';

/**
 * Makes every cupboard fit its wall again after the walls changed length (spec 4.4): its offset
 * is clamped into [width / 2, wallLength - width / 2], so a cupboard that still fits never moves
 * and one that went past the wall end is pulled back inside. Cupboards may overlap each other (a
 * check reports it, not an invariant), so each one is handled on its own. Throws CommandError when
 * a cupboard is wider than its wall. Every cupboard's wall must exist (removeWalls deletes the
 * cupboards of the walls it removes).
 */
export function reconcileCupboards(level: Draft<Level>): void {
  const lengths = new Map<Id, number>();
  for (const c of Object.values(level.cupboards)) {
    let len = lengths.get(c.wallId);
    if (len === undefined) {
      len = wallLength(level, c.wallId);
      lengths.set(c.wallId, len);
    }
    if (c.width > len + EPS) throw new CommandError(CUPBOARDS_DO_NOT_FIT);
    const off = Math.min(Math.max(c.offset, c.width / 2), len - c.width / 2);
    if (Math.abs(off - c.offset) > CHANGE_EPS) c.offset = off;
  }
}
