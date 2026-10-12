import { current, isDraft, type Draft } from 'immer';
import type { Id, Level, Opening } from '../model/types';
import { fitCupboardOnWall } from '../geometry/clearances';
import { deriveLevel } from '../geometry/derived';
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
 * Plain snapshot of a level that may be an Immer draft, for the geometry that caches by identity
 * (deriveLevel): a fresh object, so a level edited earlier in the same recipe is never taken for
 * its cached past. Costs one wall union per call (about 2 ms for 50 walls).
 */
export const levelSnapshot = (level: Draft<Level> | Level): Level => (isDraft(level) ? (current(level) as Level) : (level as Level));

/**
 * Makes every cupboard fit its face again after the walls changed (spec 4.4): like the cupboard
 * tool (fitCupboardOnWall, ruling V2-R32), its offset is clamped onto the free stretch of its
 * face around it, between the faces of the walls met on that side, so a cupboard that still fits
 * never moves and one that a shorter wall or a nearer corner wall would cut is pulled back
 * beside it. Cupboards may overlap each other (a check reports it, not an invariant), so each one
 * is handled on its own. Throws CommandError when a cupboard is longer than its free stretch. On
 * a degraded level (no exact wall shape), the axis length of the wall is the stretch. Every
 * cupboard's wall must exist (removeWalls deletes the cupboards of the walls it removes).
 */
export function reconcileCupboards(level: Draft<Level>): void {
  const cupboards = Object.values(level.cupboards);
  if (cupboards.length === 0) return;
  const snap = levelSnapshot(level);
  const d = deriveLevel(snap);
  for (const c of cupboards) {
    const len = wallLength(level, c.wallId);
    if (c.width > len + EPS) throw new CommandError(CUPBOARDS_DO_NOT_FIT);
    let off: number;
    if (d.degraded) {
      off = Math.min(Math.max(c.offset, c.width / 2), len - c.width / 2);
    } else {
      const fit = fitCupboardOnWall(snap, c.wallId, c.side, c.width, c.offset, true, d);
      if (!fit.fits) throw new CommandError(CUPBOARDS_DO_NOT_FIT);
      off = fit.offset;
    }
    if (Math.abs(off - c.offset) > CHANGE_EPS) c.offset = off;
  }
}
