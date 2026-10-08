import { produceWithPatches, enablePatches, type Patch, type Draft } from 'immer';
import type { Id, Level, Project } from '../model/types';
import { validateProject } from './validate';

enablePatches();

/** Expected, user-facing failure of a command (message is shown as is, in French). */
export class CommandError extends Error {}

export type Recipe = (draft: Draft<Project>) => void;

export type CommandResult =
  | { ok: true; project: Project; patches: Patch[]; inverse: Patch[] }
  | { ok: false; error: string };

/** Validation is on everywhere except production builds. Guarded so plain Node (no import.meta.env) still works. */
function defaultValidate(): boolean {
  const env = (import.meta as { env?: { PROD?: boolean } }).env;
  return env?.PROD !== true;
}

export function applyCommand(project: Project, recipe: Recipe, opts?: { validate?: boolean }): CommandResult {
  let produced: [Project, Patch[], Patch[]];
  try {
    produced = produceWithPatches(project, recipe) as [Project, Patch[], Patch[]];
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, error: e.message };
    throw e;
  }
  const [next, patches, inverse] = produced;
  if (opts?.validate ?? defaultValidate()) {
    const problems = validateProject(next);
    if (problems.length > 0) {
      throw new Error(`Invariant violation: ${problems.join('; ')}`);
    }
  }
  return { ok: true, project: next, patches, inverse };
}

export function getLevel(draft: Draft<Project> | Project, levelId: Id): Draft<Level> {
  const level = draft.levels.find((l) => l.id === levelId);
  if (!level) throw new CommandError('Niveau introuvable');
  return level as Draft<Level>;
}

export function touch(draft: Draft<Project>, now: Date = new Date()): void {
  draft.updatedAt = now.toISOString();
}
