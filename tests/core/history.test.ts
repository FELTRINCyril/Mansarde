import { describe, expect, it } from 'vitest';
import { applyCommand } from '@/core/commands/apply';
import { emptyHistory, pushEntry, redo, undo } from '@/core/commands/history';
import type { History } from '@/core/commands/history';
import { createProject } from '@/core/model/factory';
import type { Project } from '@/core/model/types';

function rename(p: Project, h: History, name: string): { project: Project; history: History } {
  const r = applyCommand(p, (d) => {
    d.name = name;
  });
  if (!r.ok) throw new Error(r.error);
  return {
    project: r.project,
    history: pushEntry(h, { label: name, patches: r.patches, inverse: r.inverse }),
  };
}

describe('history', () => {
  it('undo returns to the state after A, redo to the state after B', () => {
    const p0 = createProject('0');
    const a = rename(p0, emptyHistory, 'A');
    const b = rename(a.project, a.history, 'B');
    const u = undo(b.project, b.history);
    expect(u).not.toBeNull();
    expect(u!.project.name).toBe('A');
    expect(u!.history.past).toHaveLength(1);
    expect(u!.history.future).toHaveLength(1);
    const r = redo(u!.project, u!.history);
    expect(r).not.toBeNull();
    expect(r!.project.name).toBe('B');
    expect(r!.history.past).toHaveLength(2);
    expect(r!.history.future).toHaveLength(0);
  });

  it('push after undo clears the future', () => {
    const a = rename(createProject('0'), emptyHistory, 'A');
    const b = rename(a.project, a.history, 'B');
    const u = undo(b.project, b.history)!;
    const c = rename(u.project, u.history, 'C');
    expect(c.history.future).toHaveLength(0);
    expect(c.history.past.map((e) => e.label)).toEqual(['A', 'C']);
    expect(redo(c.project, c.history)).toBeNull();
  });

  it('undo on empty history returns null', () => {
    expect(undo(createProject('0'), emptyHistory)).toBeNull();
    expect(redo(createProject('0'), emptyHistory)).toBeNull();
  });

  it('does not mutate the history it receives', () => {
    const a = rename(createProject('0'), emptyHistory, 'A');
    undo(a.project, a.history);
    expect(a.history.past).toHaveLength(1);
    expect(a.history.future).toHaveLength(0);
    expect(emptyHistory.past).toHaveLength(0);
  });
});
