import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addObject, moveObjects } from '@/core/commands/objects';
import { createObjectFromSize } from '@/core/model/factory';
import type { Project } from '@/core/model/types';
import { createEditorStore } from '@/editor/store';
import { startAutosave, type SaveStatus } from '@/storage/autosave';
import { emptyProject } from '../core/helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const obj = () => createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 0, 0, { width: 10, depth: 10, height: 10 }, 'o', '#fff');

function setup(delay?: number) {
  const store = createEditorStore();
  const first = emptyProject();
  store.getState().openProject(first);
  const saved: Project[] = [];
  const saver = vi.fn(async (p: Project) => {
    saved.push(p);
  });
  const statuses: SaveStatus[] = [];
  const stop = startAutosave(store, saver, (s) => statuses.push(s), delay);
  return { store, first, saved, saver, statuses, stop };
}

describe('autosave', () => {
  it('3 quick edits give 1 save after 500 ms, with the latest project', async () => {
    const { store, first, saved, saver, statuses } = setup();
    const levelId = first.levels[0]!.id;
    store.getState().execute('a', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(100);
    store.getState().execute('b', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(100);
    store.getState().execute('c', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(499);
    expect(saver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saved[0]).toBe(store.getState().project);
    expect(Object.keys(saved[0]!.levels[0]!.objects)).toHaveLength(3);
    expect(statuses[0]).toEqual({ state: 'saving' });
    expect(statuses.at(-1)).toEqual({ state: 'saved' });
    // nothing else is scheduled
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('does not save at start, nor when nothing changes', async () => {
    const { saver, statuses } = setup();
    await vi.advanceTimersByTimeAsync(2000);
    expect(saver).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it('honors a custom delay', async () => {
    const { store, first, saver } = setup(50);
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(49);
    expect(saver).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('a project change before the delay flushes A immediately; B (unmodified) is not saved, an edit of B is saved after the delay', async () => {
    const { store, first, saved, saver } = setup();
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    const lastOfA = store.getState().project!;
    await vi.advanceTimersByTimeAsync(100);
    expect(saver).not.toHaveBeenCalled();
    const other = emptyProject();
    store.getState().openProject(other);
    await vi.advanceTimersByTimeAsync(0);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saved[0]).toBe(lastOfA); // A with its last edit, not B
    expect(saved[0]!.id).toBe(first.id);
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).toHaveBeenCalledTimes(1); // opening B did not save it
    store.getState().execute('b', addObject(other.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(499);
    expect(saver).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(saver).toHaveBeenCalledTimes(2);
    expect(saved[1]).toBe(store.getState().project);
    expect(saved[1]!.id).toBe(other.id);
  });

  it('opening a project with nothing pending saves nothing and emits no status', async () => {
    const { store, saver, statuses } = setup();
    store.getState().openProject(emptyProject());
    store.getState().closeProject();
    store.getState().openProject(emptyProject());
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it('closing the project flushes the pending save and never saves null', async () => {
    const { store, first, saved, saver } = setup();
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    const last = store.getState().project!;
    store.getState().closeProject();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual([last]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saved.every((p) => p !== null)).toBe(true);
  });

  it('a rejecting saver reports an error status with its message; a later good save clears it', async () => {
    const { store, first, statuses, saver } = setup();
    saver.mockRejectedValueOnce(new Error('Quota exceeded'));
    const levelId = first.levels[0]!.id;
    store.getState().execute('a', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toEqual({ state: 'error', message: 'Quota exceeded' });
    const id = Object.keys(store.getState().project!.levels[0]!.objects)[0]!;
    store.getState().execute('b', moveObjects(levelId, [id], { x: 1, y: 1 }));
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toEqual({ state: 'saved' });
  });

  it('a non-Error rejection still yields a message', async () => {
    const { store, first, statuses, saver } = setup();
    saver.mockRejectedValueOnce('boom');
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toEqual({ state: 'error', message: 'boom' });
  });

  it('an error on project A is not hidden by a successful save of project B', async () => {
    const { store, first, statuses, saver } = setup();
    saver.mockRejectedValueOnce(new Error('disque plein'));
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    const b = emptyProject();
    store.getState().openProject(b); // flushes A (rejects)
    store.getState().execute('b', addObject(b.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(500); // saves B (ok)
    expect(saver).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toEqual({ state: 'error', message: 'disque plein' });
  });

  it('saves are serialized: a slow save finishes before the next one starts', async () => {
    const { store, first, saver } = setup();
    const order: string[] = [];
    let release!: () => void;
    saver.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        order.push('start1');
        release = () => { order.push('end1'); resolve(); };
      }),
    );
    saver.mockImplementationOnce(async () => { order.push('start2'); });
    const levelId = first.levels[0]!.id;
    store.getState().execute('a', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(500);
    store.getState().execute('b', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual(['start1']);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['start1', 'end1', 'start2']);
  });

  it('does not save the intermediate states of a gesture, only the committed result', async () => {
    const { store, first, saved, saver } = setup();
    const levelId = first.levels[0]!.id;
    const o = obj();
    store.getState().execute('add', addObject(levelId, o));
    await vi.advanceTimersByTimeAsync(500);
    expect(saver).toHaveBeenCalledTimes(1);
    store.getState().beginGesture('move');
    store.getState().updateGesture(moveObjects(levelId, [o.id], { x: 10, y: 0 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saver).toHaveBeenCalledTimes(1);
    store.getState().updateGesture(moveObjects(levelId, [o.id], { x: 20, y: 0 }));
    store.getState().commitGesture();
    await vi.advanceTimersByTimeAsync(500);
    expect(saver).toHaveBeenCalledTimes(2);
    expect(saved[1]!.levels[0]!.objects[o.id]!.x).toBe(20);
  });

  it('a cancelled gesture does not trigger a save', async () => {
    const { store, first, saver } = setup();
    const levelId = first.levels[0]!.id;
    const o = obj();
    store.getState().execute('add', addObject(levelId, o));
    await vi.advanceTimersByTimeAsync(500);
    store.getState().beginGesture('move');
    store.getState().updateGesture(moveObjects(levelId, [o.id], { x: 10, y: 0 }));
    store.getState().cancelGesture();
    await vi.advanceTimersByTimeAsync(2000);
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe flushes the pending edit exactly once, then ignores later changes', async () => {
    const { store, first, saved, saver, stop } = setup();
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(100);
    store.getState().execute('b', addObject(first.levels[0]!.id, obj()));
    const latest = store.getState().project!;
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saved[0]).toBe(latest);
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).toHaveBeenCalledTimes(1); // the cancelled timer does not save again
    store.getState().execute('c', addObject(first.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe returns a promise settled once the flushed save (and any running one) completed', async () => {
    const { store, first, saver, stop } = setup();
    let finish!: () => void;
    saver.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    let done = false;
    void stop().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('the promise returned by unsubscribe resolves even when the save fails', async () => {
    const { store, first, saver, stop } = setup();
    saver.mockImplementationOnce(async () => { throw new Error('plein'); });
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    await expect(stop()).resolves.toBeUndefined();
  });

  it('unsubscribe with nothing pending saves nothing', async () => {
    const { saver, stop } = setup();
    stop();
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(saver).not.toHaveBeenCalled();
  });

  it('a throwing onStatus does not break the save queue', async () => {
    const store = createEditorStore();
    const first = emptyProject();
    store.getState().openProject(first);
    const saver = vi.fn(async (_p: Project) => {});
    const onStatus = vi.fn(() => {
      throw new Error('ui exploded');
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    startAutosave(store, saver, onStatus);
    const levelId = first.levels[0]!.id;
    store.getState().execute('a', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(500);
    store.getState().execute('b', addObject(levelId, obj()));
    await vi.advanceTimersByTimeAsync(500);
    expect(saver).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('an in-flight save that fails after unsubscribe still reports its error', async () => {
    const { store, first, statuses, saver, stop } = setup();
    let fail!: (e: Error) => void;
    saver.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    store.getState().execute('a', addObject(first.levels[0]!.id, obj()));
    await vi.advanceTimersByTimeAsync(500);
    stop();
    fail(new Error('echec'));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toEqual({ state: 'error', message: 'echec' });
  });
});
