import { current, isDraft, type Draft } from 'immer';
import type { Id, Level, Opening, Project } from '../model/types';
import { cupboardOnFreeStretch, fitCupboardOnWall } from '../geometry/clearances';
import { deriveLevel } from '../geometry/derived';
import { wallLength } from '../geometry/walls';
import { CommandError } from './errors';

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

/** The walls or the nodes they use differ (ids, ends, thickness, node positions): the wall shape may have changed. */
function wallsChanged(before: Level, after: Draft<Level>): boolean {
  const ids = Object.keys(after.walls);
  if (ids.length !== Object.keys(before.walls).length) return true;
  for (const id of ids) {
    const a = after.walls[id]!;
    const b = Object.hasOwn(before.walls, id) ? before.walls[id]! : undefined;
    if (!b || a.startNodeId !== b.startNodeId || a.endNodeId !== b.endNodeId || a.thickness !== b.thickness) return true;
    for (const n of [a.startNodeId, a.endNodeId]) {
      const na = after.nodes[n];
      const nb = before.nodes[n];
      if (!na || !nb || na.x !== nb.x || na.y !== nb.y) return true;
    }
  }
  return false;
}

/**
 * Keeps the cupboards of a level out of the walls after its walls changed (spec 4.4, rulings
 * V2-R32 and V2-R39), `before` being the level before the command:
 * - a cupboard that stood on the free stretch of its face before (cupboardOnFreeStretch) and no
 *   longer does is clamped onto it like the cupboard tool places it (fitCupboardOnWall); refused
 *   with CUPBOARDS_DO_NOT_FIT when the stretch has become shorter than the cupboard;
 * - a cupboard that did not stand on its free stretch before (an import, an older version) is not
 *   moved for a conflict the command did not cause: it only stays within the length of its wall
 *   (the invariant of validateProject), the checks flag it ("empiète sur un mur");
 * - a cupboard added by the command, or every cupboard of a degraded level, is only kept within
 *   the length of its wall.
 * A cupboard wider than its wall is always refused. Cupboards may overlap each other (a check
 * reports it), so each one is handled on its own. Every cupboard's wall must exist (removeWalls
 * deletes the cupboards of the walls it removes).
 */
export function reconcileCupboards(level: Draft<Level>, before: Level): void {
  const cupboards = Object.values(level.cupboards);
  if (cupboards.length === 0) return;
  const after = levelSnapshot(level);
  const dAfter = deriveLevel(after);
  const dBefore = deriveLevel(before);
  for (const c of cupboards) {
    const len = wallLength(level, c.wallId);
    if (c.width > len + EPS) throw new CommandError(CUPBOARDS_DO_NOT_FIT);
    let off = Math.min(Math.max(c.offset, c.width / 2), len - c.width / 2);
    const old = Object.hasOwn(before.cupboards, c.id) ? before.cupboards[c.id]! : undefined;
    const fittedBefore = !!old && !dBefore.degraded && cupboardOnFreeStretch(before, old, dBefore);
    if (fittedBefore && !dAfter.degraded && !cupboardOnFreeStretch(after, { ...c, offset: off }, dAfter)) {
      const fit = fitCupboardOnWall(after, c.wallId, c.side, c.width, c.offset, true, dAfter);
      if (!fit.fits) throw new CommandError(CUPBOARDS_DO_NOT_FIT);
      off = fit.offset;
    }
    if (Math.abs(off - c.offset) > CHANGE_EPS) c.offset = off;
  }
}

/**
 * The convergence point of every wall edit, run by applyCommand after each command (ruling
 * V2-R39): on each level that existed before and has cupboards, if its walls changed
 * (wallsChanged), reconcileCupboards against its state before the command. Wall commands do not
 * call it themselves, so a new one cannot forget it.
 */
export function reconcileWallEdits(before: Project, draft: Draft<Project>): void {
  for (const level of draft.levels) {
    if (Object.keys(level.cupboards).length === 0) continue;
    const old = before.levels.find((l) => l.id === level.id);
    if (old && wallsChanged(old, level)) reconcileCupboards(level, old);
  }
}
