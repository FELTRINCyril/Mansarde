import { applyPatches } from 'immer';
import { expect, vi } from 'vitest';
import { applyCommand, type Recipe } from '@/core/commands/apply';
import { createProject } from '@/core/model/factory';
import type { Id, Level, Project } from '@/core/model/types';
import { levelFromWalls, type WallSegment } from './fixtures';

export const T0 = new Date('2026-01-01T00:00:00.000Z');

export function emptyProject(): Project {
  return createProject('Maison', T0);
}

export function projectFrom(segments: WallSegment[], setup?: (level: Level) => void): Project {
  const p = createProject('Maison', T0);
  const level = levelFromWalls(segments);
  setup?.(level);
  p.levels = [level];
  return p;
}

export const lvl = (p: Project): Level => p.levels[0]!;
export const levelId = (p: Project): Id => lvl(p).id;

/** Applies a recipe that must succeed, checks the round trip through the inverse patches. */
export function run(p: Project, recipe: Recipe): Project {
  // frozen clock one second after the project's last update: chained runs never share a millisecond
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(p.updatedAt) + 1000);
  let r: ReturnType<typeof applyCommand>;
  try {
    r = applyCommand(p, recipe);
  } finally {
    vi.useRealTimers();
  }
  if (!r.ok) throw new Error(`unexpected refusal: ${r.error}`);
  expect(r.project.updatedAt).not.toBe(p.updatedAt);
  expect(applyPatches(r.project, r.inverse)).toEqual(p);
  return r.project;
}

export function refuse(p: Project, recipe: Recipe): string {
  const snapshot = JSON.stringify(p);
  const r = applyCommand(p, recipe);
  if (r.ok) throw new Error('expected a refusal');
  expect(JSON.stringify(p)).toBe(snapshot);
  return r.error;
}

/** Applies a recipe that does nothing: ok, no patch, project untouched (not even updatedAt). */
export function noop(p: Project, recipe: Recipe): void {
  const r = applyCommand(p, recipe);
  if (!r.ok) throw new Error(`unexpected refusal: ${r.error}`);
  expect(r.patches).toEqual([]);
  expect(r.project).toBe(p);
}
