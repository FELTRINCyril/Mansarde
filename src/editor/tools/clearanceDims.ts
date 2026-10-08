import type { Recipe } from '@/core/commands/apply';
import { setObjectTransform } from '@/core/commands/objects';
import { moveOpening } from '@/core/commands/openings';
import { OPENING_GAP, type DimLine } from '@/core/geometry/autoDimensions';
import { objectClearances, openingClearances, placeAtClearance, placeOpeningAtClearance } from '@/core/geometry/clearances';
import { deriveLevel } from '@/core/geometry/derived';
import type { Id, Level, Opening, PlacedObject } from '@/core/model/types';

/**
 * Dynamic dimensions of the element being moved (spec 6.5) and typed distances (spec 7.4): the
 * clearances of an object or an opening as DimLines, each with the name of its side, so that the
 * active one (Tab) can be followed while the list changes during a drag.
 */
export interface Measure { dims: DimLine[]; sides: string[] }

/** Element whose clearances can be typed: a placed object or an opening of a level. */
export interface MeasureTarget { kind: 'object' | 'opening'; levelId: Id; id: Id }

/** Clearances of an object to the nearest wall faces in the four directions of its frame. */
export function measureObject(level: Level, o: PlacedObject): Measure {
  const cs = objectClearances(o, deriveLevel(level));
  return {
    dims: cs.map((c) => ({ a: c.from, b: c.to, offset: 0, value: c.distance, kind: 'dynamic' })),
    sides: cs.map((c) => c.side),
  };
}

/**
 * Clearances of an opening along its wall (it does not have to belong to the level: tool previews),
 * drawn like its width dimension, beyond the wall face opposite to the swing.
 */
export function measureOpening(level: Level, o: Opening): Measure {
  const wall = level.walls[o.wallId];
  if (!wall) return { dims: [], sides: [] };
  const offset = (o.swing === 'left' ? -1 : 1) * (wall.thickness / 2 + OPENING_GAP);
  const cs = openingClearances(level, o);
  return {
    dims: cs.map((c) => ({ a: c.from, b: c.to, offset, value: c.distance, kind: 'dynamic' })),
    sides: cs.map((c) => c.side),
  };
}

/** Measure of the target in the level; empty when it does not exist there. */
export function measureTarget(level: Level, t: MeasureTarget): Measure {
  if (t.kind === 'object') {
    const o = level.objects[t.id];
    return o ? measureObject(level, o) : { dims: [], sides: [] };
  }
  const o = level.openings[t.id];
  return o ? measureOpening(level, o) : { dims: [], sides: [] };
}

/** Drops floating point noise of the ray casts (1e-14 cm): a typed 60 gives 60, not 59.99999999999997. */
const tidy = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;

/** The side after `active` in the list (before it with backwards), the first one when active is absent. */
export function nextSide(sides: string[], active: string | null, backwards = false): string | null {
  if (sides.length === 0) return null;
  const i = active === null ? -1 : sides.indexOf(active);
  if (i < 0) return backwards ? sides[sides.length - 1]! : sides[0]!;
  return sides[(i + (backwards ? sides.length - 1 : 1)) % sides.length]!;
}

/** Refusal of a typed opening distance that leaves the free stretch (same text as the commands). */
export const ERR_NO_ROOM = 'Pas assez de place sur ce mur';

/** Result of a typed distance: the recipe to apply, or why the value is refused. */
export type TypedPlacement = { ok: true; recipe: Recipe } | { ok: false; error: string };

/**
 * Placement of the target so that its clearance on `side` (measured in `level`) takes `value`:
 * placeAtClearance for an object (absolute position and rotation, so it can be applied to a
 * gesture base), placeOpeningAtClearance along the current wall of an opening. An opening must stay
 * between its two current obstacles (the nearest wall faces or neighbour openings, ruling R29): a
 * value that would push it into a wall or past a neighbour is refused (ERR_NO_ROOM). Null when the
 * target or that clearance does not exist.
 */
export function typedPlacement(level: Level, t: MeasureTarget, side: string, value: number): TypedPlacement | null {
  if (t.kind === 'object') {
    const o = level.objects[t.id];
    const c = o && objectClearances(o, deriveLevel(level)).find((x) => x.side === side);
    if (!o || !c) return null;
    const p = placeAtClearance(o, c, value);
    return { ok: true, recipe: setObjectTransform(t.levelId, o.id, { x: tidy(p.x), y: tidy(p.y), rotation: o.rotation }) };
  }
  const o = level.openings[t.id];
  if (!o || !level.walls[o.wallId]) return null;
  const cs = openingClearances(level, o);
  const c = cs.find((x) => x.side === side);
  if (!c) return null;
  const free = cs.reduce((sum, x) => sum + x.distance, 0); // room left between the two obstacles
  if (value > free + 1e-6) return { ok: false, error: ERR_NO_ROOM };
  return { ok: true, recipe: moveOpening(t.levelId, o.id, o.wallId, tidy(placeOpeningAtClearance(o, c, value))) };
}
