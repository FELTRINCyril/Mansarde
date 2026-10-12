import { CommandError } from './apply';
import type { Vec2 } from '../model/types';

// Shared checks and patch helpers of the volume commands (slopes, beams, cupboards).

export const ERR_POSITION = 'Position invalide';
export const ERR_LENGTH = 'Longueur invalide';
export const ERR_SIZE = 'Dimension invalide';
export const ERR_HEIGHT = 'Hauteur invalide';

export const SIDES = ['left', 'right'] as const;

export const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;
export const isNonNegative = (n: number): boolean => Number.isFinite(n) && n >= 0;
export const isOneOf = (values: readonly string[], v: unknown): boolean => values.includes(v as string);

export function requireFinitePoint(p: Vec2): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new CommandError(ERR_POSITION);
}

/** Own key lookup: ids may come from untrusted input ("constructor", "toString"...). */
export function lookup<T>(rec: Record<string, T>, id: string, notFound: string): T {
  if (!Object.hasOwn(rec, id)) throw new CommandError(notFound);
  return rec[id]!;
}

/** The defined entries of a patch, without the keys the patch may not change. */
export function patchEntries<T extends object>(patch: object, locked: readonly string[]): Array<[keyof T, unknown]> {
  return Object.entries(patch).filter(([key, value]) => value !== undefined && !locked.includes(key)) as Array<[keyof T, unknown]>;
}

/**
 * Writes the changed entries into target (deep copies, compared by value so that an equal point is
 * not a change); returns whether anything changed.
 */
export function writeChanges<T extends object>(target: T, entries: Array<[keyof T, unknown]>): boolean {
  let changed = false;
  for (const [key, value] of entries) {
    if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
    (target as Record<keyof T, unknown>)[key] = structuredClone(value);
    changed = true;
  }
  return changed;
}

/** Moves points in place by delta. */
export function translate(points: Vec2[], delta: Vec2): void {
  for (const p of points) {
    p.x += delta.x;
    p.y += delta.y;
  }
}
