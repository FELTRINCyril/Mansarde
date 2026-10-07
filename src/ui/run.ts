import type { Recipe } from '@/core/commands/apply';
import { useEditor } from '@/editor/store';

/** Runs a command on the open project (one history entry; a refusal is toasted). */
export const run = (label: string, recipe: Recipe): boolean => useEditor.getState().execute(label, recipe);
