import { describe, expect, it } from 'vitest';
import { applyCommand, type Recipe } from '@/core/commands/apply';
import { emptyHistory, pushEntry, redo, undo } from '@/core/commands/history';
import type { History } from '@/core/commands/history';
import { addLevel, deleteLevel, moveLevel } from '@/core/commands/levels';
import { addOpening, deleteOpenings } from '@/core/commands/openings';
import { renameRoom } from '@/core/commands/rooms';
import { addRectRoom, addWallChain, deleteWalls, splitWall } from '@/core/commands/walls';
import { createOpening, createProject } from '@/core/model/factory';
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

describe('history: structural edits round-trip through undo and redo', () => {
  it('walls, nodes, openings, a level splice and the roomLabels array come back deep-equal', () => {
    let project = createProject('0');
    let history = emptyHistory;
    const snapshots: Project[] = [project];
    const step = (label: string, recipe: (p: Project) => Recipe) => {
      const r = applyCommand(project, recipe(project));
      if (!r.ok) throw new Error(`${label}: ${r.error}`);
      expect(r.patches.length, label).toBeGreaterThan(0);
      project = r.project;
      history = pushEntry(history, { label, patches: r.patches, inverse: r.inverse });
      snapshots.push(project);
    };
    const L = (p: Project) => p.levels[0]!.id;
    const wallIds = (p: Project) => Object.keys(p.levels[0]!.walls);

    step('room', (p) => addRectRoom(L(p), { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    step('partition (T junctions: splits two walls)', (p) => addWallChain(L(p), [{ kind: 'free', x: 200, y: 0 }, { kind: 'free', x: 200, y: 300 }], 7, 250));
    step('split', (p) => splitWall(L(p), wallIds(p)[0]!, 0.25));
    step('door', (p) => addOpening(L(p), createOpening(wallIds(p)[1]!, 'door', 50)));
    step('window', (p) => addOpening(L(p), createOpening(wallIds(p)[2]!, 'window', 60)));
    step('label A', (p) => renameRoom(L(p), { label: null, labelPoint: { x: 100, y: 150 } }, 'Cuisine'));
    step('label B', (p) => renameRoom(L(p), { label: null, labelPoint: { x: 300, y: 150 } }, 'Salon'));
    step('remove label A (array splice)', (p) => renameRoom(L(p), { label: p.levels[0]!.roomLabels[0]!, labelPoint: { x: 0, y: 0 } }, ''));
    step('delete the door', (p) => deleteOpenings(L(p), Object.keys(p.levels[0]!.openings).slice(0, 1)));
    step('delete walls (orphan nodes go)', (p) => deleteWalls(L(p), wallIds(p).slice(-2)));
    step('level above', (p) => addLevel(L(p), 'above', 'Étage'));
    step('level below', (p) => addLevel(L(p), 'below', 'Sous-sol'));
    step('move level (splice)', (p) => moveLevel(p.levels[2]!.id, 0));
    step('delete level (splice)', (p) => deleteLevel(p.levels[1]!.id));

    // every intermediate state is reached again, both ways
    for (let i = snapshots.length - 2; i >= 0; i--) {
      const u = undo(project, history)!;
      expect(u, `undo to ${i}`).not.toBeNull();
      ({ project, history } = u);
      expect(project, `undo to ${i}`).toEqual(snapshots[i]);
    }
    expect(undo(project, history)).toBeNull();
    for (let i = 1; i < snapshots.length; i++) {
      ({ project, history } = redo(project, history)!);
      expect(project, `redo to ${i}`).toEqual(snapshots[i]);
    }
    expect(redo(project, history)).toBeNull();
  });
});
