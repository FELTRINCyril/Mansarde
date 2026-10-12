import { describe, expect, it } from 'vitest';
import { addLevel, deleteLevel } from '@/core/commands/levels';
import { addObject, deleteObjects, moveObjects } from '@/core/commands/objects';
import { addRectRoom } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { createObjectFromSize } from '@/core/model/factory';
import type { Id, PlacedObject, Project } from '@/core/model/types';
import { pruneSelection } from '@/editor/selection';
import { activeLevel, createEditorStore, createOverlay, DEFAULT_DISPLAY } from '@/editor/store';
import { emptyProject, lvl } from '../core/helpers';

const box = (x = 100, y = 100): PlacedObject =>
  createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, x, y, { width: 50, depth: 50, height: 50 }, 'Caisse', '#ccc');

function openedStore() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  return { store, p, levelId: p.levels[0]!.id };
}

/** Store with one object; returns the object id too. */
function storeWithObject() {
  const { store, p, levelId } = openedStore();
  const obj = box();
  expect(store.getState().execute('Add', addObject(levelId, obj))).toBe(true);
  return { store, levelId, id: obj.id, base: store.getState().project as Project, p };
}

const objectX = (project: Project | null, id: Id): number => project!.levels[0]!.objects[id]!.x;

describe('openProject / closeProject', () => {
  it('starts empty', () => {
    const s = createEditorStore().getState();
    expect(s.project).toBeNull();
    expect(s.tool).toBe('select');
    expect(s.history).toEqual({ past: [], future: [] });
    expect(s.overlay.previewInvalid).toBe(false);
    expect(s.display).toEqual(DEFAULT_DISPLAY);
    expect(DEFAULT_DISPLAY).toMatchObject({ dimMode: 'all', showLowerLevel: true, showGrid: true, view: 'plan' });
    expect(activeLevel(s)).toBeUndefined();
  });

  it('openProject resets history, selection, gesture and picks the first level', () => {
    const { store, levelId, id } = storeWithObject();
    store.getState().setSelection([{ kind: 'object', id }]);
    store.getState().beginGesture('Move');
    const other = emptyProject();
    store.getState().openProject(other);
    const s = store.getState();
    expect(s.project).toBe(other);
    expect(s.history).toEqual({ past: [], future: [] });
    expect(s.selection).toEqual([]);
    expect(s.gesture).toBeNull();
    expect(s.activeLevelId).toBe(other.levels[0]!.id);
    expect(s.activeLevelId).not.toBe(levelId);
    expect(activeLevel(s)).toBe(other.levels[0]);
  });

  it('closeProject clears everything', () => {
    const { store } = storeWithObject();
    store.getState().closeProject();
    const s = store.getState();
    expect(s.project).toBeNull();
    expect(s.activeLevelId).toBeNull();
    expect(s.history.past).toEqual([]);
    expect(s.gesture).toBeNull();
  });
});

describe('execute', () => {
  it('a valid recipe adds one history entry and changes the project', () => {
    const { store, levelId } = openedStore();
    const before = store.getState().project;
    expect(store.getState().execute('Add object', addObject(levelId, box()))).toBe(true);
    const s = store.getState();
    expect(s.history.past).toHaveLength(1);
    expect(s.history.past[0]!.label).toBe('Add object');
    expect(s.project).not.toBe(before);
    expect(Object.keys(lvl(s.project!).objects)).toHaveLength(1);
  });

  it('a refusal toasts the error message and leaves the project and history alone', () => {
    const { store } = openedStore();
    const before = store.getState().project;
    const ok = store.getState().execute('Bad', addObject('missing-level', box()));
    const s = store.getState();
    expect(ok).toBe(false);
    expect(s.toast?.message).toBe('Niveau introuvable');
    expect(s.project).toBe(before);
    expect(s.history.past).toHaveLength(0);
  });

  it('a no-op command (no patches) pushes no history entry', () => {
    const { store, levelId } = openedStore();
    const before = store.getState().project;
    expect(store.getState().execute('Noop', moveObjects(levelId, [], { x: 1, y: 1 }))).toBe(true);
    expect(store.getState().project).toBe(before);
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('does nothing without a project', () => {
    const store = createEditorStore();
    expect(store.getState().execute('x', () => {})).toBe(false);
  });

  it('a new edit empties the redo stack', () => {
    const { store, levelId } = openedStore();
    store.getState().execute('A', addObject(levelId, box()));
    store.getState().undo();
    expect(store.getState().history.future).toHaveLength(1);
    store.getState().execute('B', addObject(levelId, box(300, 300)));
    expect(store.getState().history.future).toHaveLength(0);
  });
});

describe('gestures', () => {
  it('3 cumulative updates then commit give ONE entry and undo restores the base exactly', () => {
    const { store, levelId, id, base } = storeWithObject();
    const pastBefore = store.getState().history.past.length;
    store.getState().beginGesture('Move');
    for (const dx of [10, 25, 40]) {
      expect(store.getState().updateGesture(moveObjects(levelId, [id], { x: dx, y: 0 }))).toBe(true);
      expect(objectX(store.getState().project, id)).toBe(100 + dx); // cumulative from the base, not the previous preview
    }
    expect(store.getState().history.past).toHaveLength(pastBefore); // nothing recorded yet
    store.getState().commitGesture();
    const s = store.getState();
    expect(s.gesture).toBeNull();
    expect(s.history.past).toHaveLength(pastBefore + 1);
    expect(s.history.past[pastBefore]!.label).toBe('Move');
    expect(objectX(s.project, id)).toBe(140);
    store.getState().undo();
    expect(store.getState().project).toEqual(base);
    store.getState().redo();
    expect(objectX(store.getState().project, id)).toBe(140);
  });

  it('a refused update marks the preview invalid and keeps the last valid project; a later valid one clears it', () => {
    const { store, levelId, id } = storeWithObject();
    store.getState().beginGesture('Move');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 10, y: 0 }));
    const valid = store.getState().project;
    expect(store.getState().updateGesture(moveObjects(levelId, ['nope'], { x: 1, y: 0 }))).toBe(false);
    expect(store.getState().overlay.previewInvalid).toBe(true);
    expect(store.getState().project).toBe(valid);
    expect(store.getState().updateGesture(moveObjects(levelId, [id], { x: 30, y: 0 }))).toBe(true);
    expect(store.getState().overlay.previewInvalid).toBe(false);
    expect(objectX(store.getState().project, id)).toBe(130);
    store.getState().commitGesture();
    expect(objectX(store.getState().project, id)).toBe(130);
  });

  it('commit after a refused update commits the last valid state', () => {
    const { store, levelId, id } = storeWithObject();
    store.getState().beginGesture('Move');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 10, y: 0 }));
    store.getState().updateGesture(moveObjects(levelId, ['nope'], { x: 1, y: 0 }));
    store.getState().commitGesture();
    expect(objectX(store.getState().project, id)).toBe(110);
    expect(store.getState().overlay.previewInvalid).toBe(false);
  });

  it('cancelGesture restores the base and leaves history alone', () => {
    const { store, levelId, id, base } = storeWithObject();
    const past = store.getState().history.past;
    store.getState().beginGesture('Move');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 10, y: 0 }));
    store.getState().cancelGesture();
    expect(store.getState().project).toBe(base);
    expect(store.getState().history.past).toBe(past);
    expect(store.getState().gesture).toBeNull();
    expect(store.getState().overlay.previewInvalid).toBe(false);
  });

  it('commit without any accepted update pushes nothing', () => {
    const { store, levelId, id, base } = storeWithObject();
    const past = store.getState().history.past;
    store.getState().beginGesture('Move');
    store.getState().updateGesture(moveObjects(levelId, ['nope'], { x: 1, y: 0 }));
    store.getState().commitGesture();
    expect(store.getState().history.past).toBe(past);
    expect(store.getState().project).toBe(base);
    expect(store.getState().gesture).toBeNull();
    store.getState().beginGesture('Move');
    store.getState().commitGesture();
    expect(store.getState().history.past).toBe(past);
    expect(objectX(store.getState().project, id)).toBe(100);
  });

  it('commit of a no-op update (empty patches) pushes nothing', () => {
    const { store, levelId, base } = storeWithObject();
    const past = store.getState().history.past;
    store.getState().beginGesture('Move');
    expect(store.getState().updateGesture(moveObjects(levelId, [], { x: 1, y: 1 }))).toBe(true);
    store.getState().commitGesture();
    expect(store.getState().history.past).toBe(past);
    expect(store.getState().project).toBe(base);
  });

  it('updateGesture without a gesture is refused', () => {
    const { store, levelId, id } = storeWithObject();
    expect(store.getState().updateGesture(moveObjects(levelId, [id], { x: 1, y: 0 }))).toBe(false);
  });

  it('undo and redo cancel an active gesture first', () => {
    const { store, levelId, id, base } = storeWithObject();
    store.getState().execute('Move', moveObjects(levelId, [id], { x: 5, y: 0 }));
    const afterMove = store.getState().project;
    store.getState().beginGesture('Drag');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 50, y: 0 }));
    store.getState().undo();
    expect(store.getState().gesture).toBeNull();
    expect(store.getState().project).toEqual(base); // base of the gesture was afterMove, undo rolled it back
    store.getState().beginGesture('Drag');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 50, y: 0 }));
    store.getState().redo();
    expect(store.getState().gesture).toBeNull();
    expect(store.getState().project).toEqual(afterMove);
  });

  it('beginGesture while another is active drops the previous preview', () => {
    const { store, levelId, id, base } = storeWithObject();
    store.getState().beginGesture('A');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 10, y: 0 }));
    store.getState().beginGesture('B');
    expect(store.getState().project).toBe(base);
    expect(store.getState().gesture?.label).toBe('B');
  });

  it('setTool cancels the gesture and clears the overlay', () => {
    const { store, levelId, id, base } = storeWithObject();
    store.getState().beginGesture('Move');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 10, y: 0 }));
    store.getState().setOverlay({ marquee: { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, previewInvalid: true });
    store.getState().setTool('wall');
    const s = store.getState();
    expect(s.tool).toBe('wall');
    expect(s.gesture).toBeNull();
    expect(s.project).toBe(base);
    expect(s.overlay.marquee).toBeNull();
    expect(s.overlay.previewInvalid).toBe(false);
  });

  it('execute during a gesture cancels it first, then applies to the base', () => {
    const { store, levelId, id } = storeWithObject();
    store.getState().beginGesture('Drag');
    store.getState().updateGesture(moveObjects(levelId, [id], { x: 50, y: 0 }));
    store.getState().execute('Other', moveObjects(levelId, [id], { x: 1, y: 0 }));
    expect(store.getState().gesture).toBeNull();
    expect(objectX(store.getState().project, id)).toBe(101);
  });
});

describe('undo / redo', () => {
  it('prunes selection and active level after undo', () => {
    const { store, levelId } = openedStore();
    const s = () => store.getState();
    const out = { levelId: '' };
    expect(s().execute('Add level', addLevel(levelId, 'above', 'Etage', out))).toBe(true);
    s().setActiveLevel(out.levelId);
    const obj = box();
    expect(s().execute('Add object', addObject(out.levelId, obj))).toBe(true);
    s().setSelection([{ kind: 'object', id: obj.id }]);
    expect(s().activeLevelId).toBe(out.levelId);

    s().undo(); // object gone
    expect(s().selection).toEqual([]);
    expect(activeLevel(s())?.id).toBe(out.levelId);

    s().undo(); // level gone
    expect(s().project!.levels.map((l) => l.id)).toEqual([levelId]);
    expect(s().activeLevelId).toBe(levelId);
    expect(activeLevel(s())).toBeDefined();
    expect(s().selection).toEqual([]);

    s().redo();
    s().redo();
    expect(s().project!.levels).toHaveLength(2);
    expect(Object.keys(s().project!.levels[1]!.objects)).toEqual([obj.id]);
  });

  it('undo with nothing to undo is a no-op', () => {
    const { store } = openedStore();
    const before = store.getState().project;
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().project).toBe(before);
  });

  it('keeps the selection of elements that still exist', () => {
    const { store, levelId } = openedStore();
    const keep = box(10, 10);
    store.getState().execute('A', addObject(levelId, keep));
    const gone = box(300, 300);
    store.getState().execute('B', addObject(levelId, gone));
    store.getState().setSelection([{ kind: 'object', id: keep.id }, { kind: 'object', id: gone.id }]);
    store.getState().undo();
    expect(store.getState().selection).toEqual([{ kind: 'object', id: keep.id }]);
  });
});

describe('selection and active level after other edits', () => {
  it('execute(deleteLevel of the active level) prunes the selection and falls back to an existing level', () => {
    const { store, levelId } = openedStore();
    const s = () => store.getState();
    const out = { levelId: '' };
    s().execute('Add level', addLevel(levelId, 'above', 'Etage', out));
    s().setActiveLevel(out.levelId);
    const o = box();
    s().execute('Add object', addObject(out.levelId, o));
    s().setSelection([{ kind: 'object', id: o.id }]);
    expect(s().execute('Delete level', deleteLevel(out.levelId))).toBe(true);
    expect(s().project!.levels.map((l) => l.id)).toEqual([levelId]);
    expect(s().activeLevelId).toBe(levelId);
    expect(s().selection).toEqual([]);
  });

  it('commitGesture prunes a selection that points at an element the gesture removed', () => {
    const { store, levelId, id } = storeWithObject();
    const other = box(400, 400);
    store.getState().execute('Add', addObject(levelId, other));
    store.getState().setSelection([{ kind: 'object', id }, { kind: 'object', id: other.id }]);
    store.getState().beginGesture('Delete');
    store.getState().updateGesture(deleteObjects(levelId, [id]));
    store.getState().commitGesture();
    expect(store.getState().selection).toEqual([{ kind: 'object', id: other.id }]);
  });

  it('a room selection is pruned after an undo that removes the room', () => {
    const { store, levelId } = openedStore();
    const s = () => store.getState();
    s().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    const rooms = deriveLevel(s().project!.levels[0]!).rooms;
    expect(rooms).toHaveLength(1);
    s().setSelection([{ kind: 'room', id: rooms[0]!.key }]);
    s().undo();
    expect(s().selection).toEqual([]);
    s().redo();
    expect(s().selection).toEqual([]); // not restored by redo
  });
});

describe('simple setters', () => {
  it('setActiveLevel clears the selection and ignores unknown levels', () => {
    const { store, levelId, id } = storeWithObject();
    store.getState().setSelection([{ kind: 'object', id }]);
    store.getState().setActiveLevel('missing');
    expect(store.getState().activeLevelId).toBe(levelId);
    expect(store.getState().selection).toHaveLength(1);
    store.getState().setActiveLevel(levelId);
    expect(store.getState().selection).toEqual([]);
  });

  it('setView, setOverlay, setDisplay merge', () => {
    const { store } = openedStore();
    store.getState().setView({ pxPerCm: 2, tx: 1, ty: 2 });
    expect(store.getState().view).toEqual({ pxPerCm: 2, tx: 1, ty: 2 });
    store.getState().setOverlay({ activeDimIndex: 2 });
    store.getState().setOverlay({ previewInvalid: true });
    expect(store.getState().overlay.activeDimIndex).toBe(2);
    expect(store.getState().overlay.previewInvalid).toBe(true);
    store.getState().setDisplay({ showGrid: false });
    expect(store.getState().display).toEqual({ ...DEFAULT_DISPLAY, showGrid: false });
  });

  it('setView ignores invalid views and keeps the current one', () => {
    const { store } = openedStore();
    const good = { pxPerCm: 2, tx: 1, ty: 2 };
    store.getState().setView(good);
    for (const bad of [
      { pxPerCm: 0, tx: 0, ty: 0 }, { pxPerCm: -1, tx: 0, ty: 0 }, { pxPerCm: NaN, tx: 0, ty: 0 },
      { pxPerCm: Infinity, tx: 0, ty: 0 }, { pxPerCm: 1, tx: NaN, ty: 0 }, { pxPerCm: 1, tx: 0, ty: Infinity },
    ]) {
      store.getState().setView(bad);
      expect(store.getState().view).toBe(good);
    }
  });

  it('resets give a fresh overlay each time (no shared mutable object)', () => {
    const { store } = openedStore();
    const a = store.getState().overlay;
    store.getState().setTool('wall');
    const b = store.getState().overlay;
    store.getState().setTool('rect');
    const c = store.getState().overlay;
    expect(b).not.toBe(a);
    expect(c).not.toBe(b);
    expect(b.guides).not.toBe(c.guides);
    expect(createOverlay()).not.toBe(createOverlay());
    expect(createOverlay().guides).not.toBe(createOverlay().guides);
    b.guides.push({} as never); // mutating one never leaks into the next reset
    expect(c.guides).toEqual([]);
    expect(createOverlay().guides).toEqual([]);
  });

  it('showToast gives each toast a new id, even for the same message', () => {
    const { store } = openedStore();
    store.getState().showToast('Salut');
    const a = store.getState().toast!;
    store.getState().showToast('Salut');
    const b = store.getState().toast!;
    expect(a.message).toBe('Salut');
    expect(b.id).not.toBe(a.id);
  });
});

describe('pruneSelection', () => {
  it('keeps existing elements of every kind, drops the others, and returns the same array when nothing changes', () => {
    const { p, levelId } = openedStore();
    const obj = box();
    const withRoom: Project = (() => {
      const store = createEditorStore();
      store.getState().openProject(p);
      store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
      store.getState().execute('Obj', addObject(levelId, obj));
      return store.getState().project!;
    })();
    const level = withRoom.levels[0]!;
    const rooms = deriveLevel(level).rooms;
    expect(rooms).toHaveLength(1);
    const wallId = Object.keys(level.walls)[0]!;
    const nodeId = Object.keys(level.nodes)[0]!;

    const all = [
      { kind: 'wall' as const, id: wallId },
      { kind: 'node' as const, id: nodeId },
      { kind: 'object' as const, id: obj.id },
      { kind: 'room' as const, id: rooms[0]!.key },
    ];
    expect(pruneSelection(all, level, rooms)).toBe(all);

    const stale = [
      ...all,
      { kind: 'wall' as const, id: 'gone' },
      { kind: 'opening' as const, id: 'gone' },
      { kind: 'dimension' as const, id: 'gone' },
      { kind: 'object' as const, id: wallId }, // right id, wrong kind
      { kind: 'room' as const, id: 'room-9' },
    ];
    expect(pruneSelection(stale, level, rooms)).toEqual(all);
  });

  it('empties the selection when there is no level', () => {
    expect(pruneSelection([{ kind: 'wall', id: 'a' }], undefined, [])).toEqual([]);
  });
});
