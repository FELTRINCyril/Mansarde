import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addObject } from '@/core/commands/objects';
import { createObjectFromSize } from '@/core/model/factory';
import type { SelectionItem } from '@/editor/selection';
import { useEditor } from '@/editor/store';
import { DuplicateButton } from '@/ui/DuplicateButton';
import { emptyProject } from '../core/helpers';

afterEach(() => {
  useEditor.getState().closeProject();
  vi.unstubAllGlobals();
});

const markup = (selection: SelectionItem[]) => renderToStaticMarkup(<DuplicateButton selection={selection} />);

describe('DuplicateButton', () => {
  it('shows "Dupliquer" with the shortcut in its tooltip when the selection has an object, a cupboard, a slope or a beam', () => {
    for (const kind of ['object', 'cupboard', 'slope', 'beam'] as const) {
      const html = markup([{ kind, id: 'x' }]);
      expect(html).toContain('data-testid="duplicate-selection"');
      expect(html).toContain('>Dupliquer</button>');
      expect(html).toMatch(/title="Dupliquer \((Cmd|Ctrl)\+D\)"/);
    }
    // a multiple selection with objects among walls
    expect(markup([{ kind: 'wall', id: 'w' }, { kind: 'object', id: 'o' }])).toContain('Dupliquer');
  });

  it('is absent when nothing in the selection can be duplicated', () => {
    expect(markup([])).toBe('');
    expect(markup([{ kind: 'wall', id: 'w' }, { kind: 'room', id: 'r' }, { kind: 'opening', id: 'o' }, { kind: 'dimension', id: 'd' }])).toBe('');
  });

  it('a click duplicates the selection of the editor store (one entry, copy selected)', () => {
    const p = emptyProject();
    const s = useEditor.getState();
    s.openProject(p);
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 100, 100, { width: 50, depth: 40, height: 50 }, 'Caisse', '#ccc');
    expect(s.execute('Objet', addObject(p.levels[0]!.id, o))).toBe(true);
    const selection: SelectionItem[] = [{ kind: 'object', id: o.id }];
    useEditor.getState().setSelection(selection);
    const button = DuplicateButton({ selection }) as ReactElement<{ onClick(): void }>;
    button.props.onClick();
    const objects = Object.values(useEditor.getState().project!.levels[0]!.objects);
    expect(objects).toHaveLength(2);
    const copy = objects.find((c) => c.id !== o.id)!;
    expect(copy).toMatchObject({ x: 120, y: 120, width: 50, depth: 40 });
    expect(useEditor.getState().selection).toEqual([{ kind: 'object', id: copy.id }]);
  });
});
