import { produceWithPatches, enablePatches, type Patch, type Draft } from 'immer';
import type { Id, Level, Project } from '../model/types';
import { CommandError } from './errors';
import { reconcileWallEdits } from './reconcile';
import { validateProject } from './validate';

enablePatches();

export { CommandError };

export type Recipe = (draft: Draft<Project>) => void;

export type CommandResult =
  | { ok: true; project: Project; patches: Patch[]; inverse: Patch[] }
  | { ok: false; error: string };

/** Validation is on everywhere except production builds. Guarded so plain Node (no import.meta.env) still works. */
function defaultValidate(): boolean {
  const env = (import.meta as { env?: { PROD?: boolean } }).env;
  return env?.PROD !== true;
}

/**
 * Runs a command on the project: the recipe, then the single convergence point of the wall edits
 * (reconcileWallEdits: the cupboards of every level whose walls changed are kept out of the walls,
 * ruling V2-R39), in one history entry. A CommandError of either is a refusal.
 */
export function applyCommand(project: Project, recipe: Recipe, opts?: { validate?: boolean }): CommandResult {
  let produced: [Project, Patch[], Patch[]];
  try {
    produced = produceWithPatches(project, (draft: Draft<Project>) => {
      recipe(draft);
      reconcileWallEdits(project, draft);
    }) as [Project, Patch[], Patch[]];
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
