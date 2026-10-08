import type { Project } from '@/core/model/types';
import type { EditorStore } from '@/editor/store';

export type SaveStatus = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string };

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Debounced autosave of the open project. Every change of the project object (identity) restarts
 * the timer; the latest project is saved delayMs after the last change.
 * - If the project id changes (or the project is closed) while a save is pending, the pending
 *   project is saved immediately: its last edit is never dropped nor saved under another id.
 * - Opening a project (id change, or reopening after a close) does not save it: the project
 *   object seen first is the unmodified baseline. Only a later, different object with the same id
 *   (an edit) is saved.
 * - Null is never saved. Intermediate states of a gesture are not saved, only its committed result.
 * - Saves run one at a time, in order. A failure stays reported (state 'error') until a later save
 *   of the same project succeeds, even if other projects save fine in between.
 * - Status: 'saving' as soon as a change is waiting, 'saved' when nothing is waiting or running.
 *   'idle' is never emitted: it is the caller's initial state.
 * - The initial state of the store is not saved. Unsubscribing flushes the pending save (so a
 *   teardown or pagehide never loses an edit); saves already running keep reporting their outcome.
 * - A throwing onStatus is logged and never breaks the save queue.
 * Returns the unsubscribe function; it returns a promise settled once every save queued so far
 * (the flushed one included) has completed, successfully or not: wait for it before reading the
 * stored projects back.
 */
export function startAutosave(
  store: EditorStore,
  saver: (p: Project) => Promise<void>,
  onStatus: (s: SaveStatus) => void,
  delayMs = 500,
): () => Promise<void> {
  let lastSeen: Project | null = store.getState().project;
  let pending: Project | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let running = 0; // saves queued or in flight
  const failures = new Map<string, string>(); // project id -> message of its last failed save
  let emitted = '';

  const emit = (s: SaveStatus): void => {
    const key = s.state === 'error' ? `error:${s.message}` : s.state;
    if (key === emitted) return;
    emitted = key;
    try {
      onStatus(s);
    } catch (e) {
      console.error('autosave: onStatus callback threw', e);
    }
  };

  const report = (): void => {
    if (running > 0 || timer !== null) return;
    const first = failures.values().next();
    emit(first.done ? { state: 'saved' } : { state: 'error', message: first.value });
  };

  const enqueue = (p: Project): void => {
    running++;
    emit({ state: 'saving' });
    queue = queue
      .then(async () => {
        try {
          await saver(p);
          failures.delete(p.id);
        } catch (e) {
          failures.set(p.id, messageOf(e));
        } finally {
          running--;
          report();
        }
      })
      .catch((e: unknown) => console.error('autosave: unexpected queue failure', e));
  };

  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending) {
      const p = pending;
      pending = null;
      enqueue(p);
    }
  };

  const unsubscribe = store.subscribe((state) => {
    if (state.gesture) return;
    const project = state.project;
    if (project === lastSeen) return;
    const previous = lastSeen;
    lastSeen = project;
    if (!project) {
      flush();
      return;
    }
    if (previous?.id !== project.id) {
      // a project was just opened: flush the previous one, keep this one as the unmodified baseline
      flush();
      return;
    }
    pending = project;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delayMs);
    emit({ state: 'saving' });
  });

  return () => {
    unsubscribe();
    flush();
    return queue;
  };
}
