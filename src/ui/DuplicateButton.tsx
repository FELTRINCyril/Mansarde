import type { JSX } from 'react';
import { duplicableCount, duplicateSelection } from '@/editor/duplicate';
import { MOD_LABEL } from '@/editor/keyboard';
import type { SelectionItem } from '@/editor/selection';
import { useEditor } from '@/editor/store';

/**
 * "Dupliquer" of the properties panel, shown when the selection holds an object, a cupboard, a
 * slope or a beam (alone or in a multiple selection): the same action as Mod+D, whose shortcut
 * the tooltip gives (duplicateSelection: one history entry, the copies are selected).
 */
export function DuplicateButton({ selection }: { selection: SelectionItem[] }): JSX.Element | null {
  if (duplicableCount(selection) === 0) return null;
  return (
    <button
      type="button"
      className="btn btn-block"
      data-testid="duplicate-selection"
      title={`Dupliquer (${MOD_LABEL}+D)`}
      onClick={() => duplicateSelection(useEditor)}
    >
      Dupliquer
    </button>
  );
}
