import { describe, expect, it } from 'vitest';
import { addOpening } from '@/core/commands/openings';
import { createOpening } from '@/core/model/factory';
import type { Opening, Project } from '@/core/model/types';
import { changeOpeningKind, MSG_KIND_KEEPS_SIZE } from '@/editor/changeOpeningKind';
import { createEditorStore } from '@/editor/store';
import { rectRoom } from '../core/fixtures';
import { projectFrom } from '../core/helpers';

/** A room 400 x 100 (axes, walls 20): the short walls are 100 cm long, a 120 cm window cannot fit there. */
function setup(kind: Opening['kind'], onShortWall: boolean) {
  const p: Project = projectFrom(rectRoom(0, 0, 400, 100));
  const level = p.levels[0]!;
  const wall = Object.values(level.walls).find((w) => {
    const a = level.nodes[w.startNodeId]!;
    const b = level.nodes[w.endNodeId]!;
    return onShortWall ? a.x === b.x : a.y === b.y;
  })!;
  const length = onShortWall ? 100 : 400;
  const o = createOpening(wall.id, kind, length / 2);
  const store = createEditorStore();
  store.getState().openProject(p);
  expect(store.getState().execute('Ajouter', addOpening(level.id, o))).toBe(true);
  return { store, levelId: level.id, id: o.id };
}

const opening = (s: ReturnType<typeof setup>): Opening => s.store.getState().project!.levels[0]!.openings[s.id]!;

describe('changing the kind of an opening applies the new kind defaults (final review item 7)', () => {
  it('window to door: door width, height and no sill, in one history entry', () => {
    const s = setup('window', false);
    expect(opening(s)).toMatchObject({ width: 120, height: 135, sillHeight: 90 });
    expect(changeOpeningKind(s.store, s.levelId, s.id, 'door')).toBe(true);
    expect(opening(s)).toMatchObject({ kind: 'door', variant: 'single', width: 83, height: 204, sillHeight: 0 });
    expect(s.store.getState().history.past).toHaveLength(2);
    s.store.getState().undo();
    expect(opening(s)).toMatchObject({ kind: 'window', width: 120, height: 135, sillHeight: 90 });
  });

  it('door to passage then window', () => {
    const s = setup('door', false);
    changeOpeningKind(s.store, s.levelId, s.id, 'passage');
    expect(opening(s)).toMatchObject({ kind: 'passage', variant: 'none', width: 90, height: 204, sillHeight: 0 });
    changeOpeningKind(s.store, s.levelId, s.id, 'window');
    expect(opening(s)).toMatchObject({ kind: 'window', variant: 'single', width: 120, height: 135, sillHeight: 90 });
  });

  it('when the default width does not fit, keeps width and height and says so', () => {
    // door 83 cm on a short wall (100 cm): a 120 cm window cannot fit
    const s = setup('door', true);
    expect(changeOpeningKind(s.store, s.levelId, s.id, 'window')).toBe(true);
    expect(opening(s)).toMatchObject({ kind: 'window', variant: 'single', width: 83, height: 204, sillHeight: 90 });
    expect(s.store.getState().toast?.message).toBe(MSG_KIND_KEEPS_SIZE);
    expect(s.store.getState().history.past).toHaveLength(2);
  });
});
