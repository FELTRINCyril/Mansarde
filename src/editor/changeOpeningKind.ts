import { applyCommand } from '@/core/commands/apply';
import { updateOpening } from '@/core/commands/openings';
import { OPENING_DEFAULTS } from '@/core/model/defaults';
import type { Id, OpeningKind } from '@/core/model/types';
import type { EditorStore } from './store';

export const MSG_KIND_KEEPS_SIZE = 'Les dimensions par défaut de ce type ne tiennent pas à cet endroit : largeur et hauteur conservées.';
const LABEL = "Modifier l'ouverture";

/**
 * Changes the kind of an opening (properties panel) in one history entry, with the defaults of the
 * new kind: variant, sill, width and height. When the default size does not fit there, the current
 * width and height are kept and a toast says so.
 */
export function changeOpeningKind(store: EditorStore, levelId: Id, openingId: Id, kind: OpeningKind): boolean {
  const project = store.getState().project;
  if (!project) return false;
  const d = OPENING_DEFAULTS[kind];
  const kindOnly = { kind, variant: d.variant, sillHeight: d.sillHeight };
  const withSize = updateOpening(levelId, openingId, { ...kindOnly, width: d.width, height: d.height });
  if (applyCommand(project, withSize, { validate: false }).ok) return store.getState().execute(LABEL, withSize);
  const ok = store.getState().execute(LABEL, updateOpening(levelId, openingId, kindOnly));
  if (ok) store.getState().showToast(MSG_KIND_KEEPS_SIZE);
  return ok;
}
