import { afterEach, describe, expect, it, vi } from 'vitest';
import { addWallChain, moveNodes } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import type { Project } from '@/core/model/types';
import { createEditorStore, ERR_GEOMETRY } from '@/editor/store';
import { rectRoom } from '../core/fixtures';
import { projectFrom } from '../core/helpers';

/** polygon-clipping whose union fails whenever an input x lies in [poison, poison + 100] (every retry too). */
const ctl = vi.hoisted(() => ({ poison: null as number | null }));
vi.mock('polygon-clipping', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: Record<string, (...a: unknown[]) => unknown> }).default;
  const union = (...geoms: unknown[]) => {
    const p = ctl.poison;
    if (p !== null && JSON.stringify(geoms).match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.some((n) => +n >= p && +n <= p + 100)) {
      throw new Error('Unable to complete output ring (simulated)');
    }
    return real.union!(...geoms);
  };
  return { default: { ...real, union } };
});

afterEach(() => {
  ctl.poison = null;
});

const free = (x: number, y: number) => ({ kind: 'free' as const, x, y });

function opened(p: Project) {
  const store = createEditorStore();
  store.getState().openProject(p);
  return { store, levelId: p.levels[0]!.id };
}

describe('edits whose geometry cannot be computed are refused (ruling R37)', () => {
  it('execute refuses the command, keeps the project and the history, toasts the reason', () => {
    ctl.poison = 4980;
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const { store, levelId } = opened(p);
    expect(store.getState().execute('Murs', addWallChain(levelId, [free(5000, 0), free(5000, 300)], 20, 250))).toBe(false);
    const s = store.getState();
    expect(s.project).toBe(p);
    expect(s.history.past).toHaveLength(0);
    expect(s.toast?.message).toBe(ERR_GEOMETRY);
    // the same wall elsewhere is accepted
    expect(store.getState().execute('Murs', addWallChain(levelId, [free(600, 0), free(600, 300)], 20, 250))).toBe(true);
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('a gesture keeps its last valid preview and flags it invalid, then accepts a valid position again', () => {
    ctl.poison = 4980;
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const { store, levelId } = opened(p);
    const node = Object.values(p.levels[0]!.nodes).find((n) => n.x === 400 && n.y === 0)!;
    store.getState().beginGesture('Déplacer');
    expect(store.getState().updateGesture(moveNodes(levelId, [{ nodeId: node.id, to: { x: 450, y: 0 } }]))).toBe(true);
    const valid = store.getState().project;
    expect(store.getState().updateGesture(moveNodes(levelId, [{ nodeId: node.id, to: { x: 5000, y: 0 } }]))).toBe(false);
    expect(store.getState().project).toBe(valid);
    expect(store.getState().overlay.previewInvalid).toBe(true);
    expect(store.getState().updateGesture(moveNodes(levelId, [{ nodeId: node.id, to: { x: 500, y: 0 } }]))).toBe(true);
    expect(store.getState().overlay.previewInvalid).toBe(false);
    store.getState().commitGesture();
    expect(store.getState().project!.levels[0]!.nodes[node.id]).toMatchObject({ x: 500, y: 0 });
    expect(deriveLevel(store.getState().project!.levels[0]!).degraded).toBe(false);
  });

  it('a level that is already degraded stays editable (the user can repair it)', () => {
    ctl.poison = 4980;
    const p = projectFrom([...rectRoom(0, 0, 400, 300), [5000, 0, 5000, 300]]);
    expect(deriveLevel(p.levels[0]!).degraded).toBe(true);
    const { store, levelId } = opened(p);
    expect(store.getState().execute('Murs', addWallChain(levelId, [free(600, 0), free(600, 300)], 20, 250))).toBe(true);
    expect(store.getState().history.past).toHaveLength(1);
  });
});
