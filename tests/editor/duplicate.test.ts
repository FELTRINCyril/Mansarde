import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBeam } from '@/core/commands/beams';
import { addCupboard } from '@/core/commands/cupboards';
import { addObject } from '@/core/commands/objects';
import { addSlope } from '@/core/commands/slopes';
import { addRectRoom } from '@/core/commands/walls';
import { createBeam, createCupboard, createObjectFromSize, createSlope } from '@/core/model/factory';
import type { Cupboard, Id, Level, PlacedObject } from '@/core/model/types';
import { duplicableCount, duplicateSelection, PASTE_OFFSET } from '@/editor/duplicate';
import { handleGlobalKey } from '@/editor/keyboard';
import type { SelectionItem } from '@/editor/selection';
import { createEditorStore, type EditorStore } from '@/editor/store';
import type { ToolContext } from '@/editor/tools/types';
import { emptyProject } from '../core/helpers';

beforeEach(() => vi.stubGlobal('navigator', { platform: 'MacIntel' }));
afterEach(() => vi.unstubAllGlobals());

const NO_ROOM_FOR_COPY = 'Pas assez de place sur ce mur pour un autre placard.';

/**
 * Room 400 x 300 on the axes (walls 20 cm), with a resized L-shaped object (every property away
 * from its default), a cupboard on the top wall, a slope and a beam. Nothing selected.
 */
function scene(cupboardOverrides: Partial<Cupboard> = {}) {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
  const s = store.getState();
  expect(s.execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250))).toBe(true);
  const level0 = store.getState().project!.levels[0]!;
  const top = Object.values(level0.walls).find((w) => level0.nodes[w.startNodeId]!.y === 0 && level0.nodes[w.endNodeId]!.y === 0)!;
  const towardsPlusX = level0.nodes[top.endNodeId]!.x > level0.nodes[top.startNodeId]!.x;
  const o: PlacedObject = {
    ...createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 120, 200, { width: 87, depth: 43, height: 71 }, 'Bureau d angle', '#abcdef'),
    rotation: 30,
    mirrored: true,
    elevation: 12,
    pose: 'wall',
    lshape: { notchWidth: 30, notchDepth: 20 },
  };
  const cupboard = createCupboard(top.id, 200, towardsPlusX ? 'left' : 'right', {
    width: 100,
    depth: 55,
    plinth: 12,
    heightMode: 'ceiling',
    gap: 5,
    doorCount: 3,
    doorType: 'sliding',
    color: '#123456',
    ...cupboardOverrides,
  });
  const slope = createSlope({ x: 50, y: 150 }, { x: 350, y: 150 }, 'left', 100, 240, 140);
  const beam = createBeam({ x: 50, y: 250 }, { x: 350, y: 250 }, { width: 18, drop: 22, mode: 'fixed', bottom: 205 });
  expect(s.execute('Objet', addObject(levelId, o))).toBe(true);
  expect(s.execute('Placard', addCupboard(levelId, cupboard))).toBe(true);
  expect(s.execute('Pente', addSlope(levelId, slope))).toBe(true);
  expect(s.execute('Poutre', addBeam(levelId, beam))).toBe(true);
  const lv = (): Level => store.getState().project!.levels[0]!;
  const select = (...items: SelectionItem[]) => store.getState().setSelection(items);
  const entries = () => store.getState().history.past.length;
  return { store, levelId, o, cupboard, slope, beam, lv, select, entries };
}

const ctxOf = (store: EditorStore): ToolContext => ({ store, toWorld: (p) => p, pxPerCm: () => 1, fitView: vi.fn() });
const modD = { key: 'd', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, target: null } as unknown as KeyboardEvent;
const newIds = (before: Record<Id, unknown>, after: Record<Id, unknown>): Id[] => Object.keys(after).filter((id) => !Object.hasOwn(before, id));

describe('duplicateSelection: objects', () => {
  it('copies an object with every property at +20 +20, selects the copy, one history entry', () => {
    const { store, o, lv, select, entries } = scene();
    select({ kind: 'object', id: o.id });
    const before = lv().objects;
    const n = entries();
    expect(duplicateSelection(store)).toBe(true);
    const [copyId] = newIds(before, lv().objects);
    expect(copyId).toBeDefined();
    expect(lv().objects[copyId!]).toEqual({ ...o, id: copyId, x: o.x + PASTE_OFFSET.x, y: o.y + PASTE_OFFSET.y });
    expect(lv().objects[o.id]).toEqual(o);
    expect(store.getState().selection).toEqual([{ kind: 'object', id: copyId }]);
    expect(entries()).toBe(n + 1);
    expect(store.getState().history.past.at(-1)!.label).toBe('Dupliquer');
    // one undo removes the copy
    store.getState().undo();
    expect(Object.keys(lv().objects)).toEqual([o.id]);
  });

  it('nothing duplicable selected: false, nothing changes', () => {
    const { store, lv, select, entries } = scene();
    const n = entries();
    expect(duplicateSelection(store)).toBe(false);
    const wallId = Object.keys(lv().walls)[0]!;
    select({ kind: 'wall', id: wallId });
    expect(duplicateSelection(store)).toBe(false);
    expect(entries()).toBe(n);
  });
});

describe('duplicateSelection: cupboards', () => {
  it('puts the copy right next to the original on the same face, with all its settings, and selects it', () => {
    const { store, cupboard, lv, select, entries } = scene();
    select({ kind: 'cupboard', id: cupboard.id });
    const n = entries();
    expect(duplicateSelection(store)).toBe(true);
    const [copyId] = newIds({ [cupboard.id]: 1 }, lv().cupboards);
    expect(lv().cupboards[copyId!]).toEqual({ ...cupboard, id: copyId, offset: cupboard.offset + cupboard.width });
    expect(store.getState().selection).toEqual([{ kind: 'cupboard', id: copyId }]);
    expect(entries()).toBe(n + 1);
  });

  it('takes the other side when the end of the face is too close', () => {
    // along the top wall the free stretch of the room face is [10, 390]; [280, 380] leaves no room after it
    const { store, cupboard, lv, select } = scene({ offset: 330 });
    select({ kind: 'cupboard', id: cupboard.id });
    duplicateSelection(store);
    const [copyId] = newIds({ [cupboard.id]: 1 }, lv().cupboards);
    expect(lv().cupboards[copyId!]!.offset).toBe(230);
  });

  it('refuses with a toast when the copy fits nowhere on that face; nothing changes', () => {
    const { store, cupboard, lv, select, entries } = scene({ width: 300, doorCount: 5 });
    select({ kind: 'cupboard', id: cupboard.id });
    const n = entries();
    expect(duplicateSelection(store)).toBe(true); // the shortcut was used, the refusal is told
    expect(Object.keys(lv().cupboards)).toEqual([cupboard.id]);
    expect(store.getState().toast?.message).toBe(NO_ROOM_FOR_COPY);
    expect(entries()).toBe(n);
    expect(store.getState().selection).toEqual([{ kind: 'cupboard', id: cupboard.id }]);
  });

  it('Mod+D duplicates a selected cupboard', () => {
    const { store, cupboard, lv, select } = scene();
    select({ kind: 'cupboard', id: cupboard.id });
    expect(handleGlobalKey(modD, store, ctxOf(store))).toBe(true);
    expect(Object.keys(lv().cupboards)).toHaveLength(2);
  });
});

describe('duplicateSelection: slopes, beams and a mixed selection', () => {
  it('copies slopes and beams at +20 +20 with their settings', () => {
    const { store, slope, beam, lv, select } = scene();
    select({ kind: 'slope', id: slope.id }, { kind: 'beam', id: beam.id });
    expect(duplicateSelection(store)).toBe(true);
    const [slopeCopy] = newIds({ [slope.id]: 1 }, lv().slopes);
    const [beamCopy] = newIds({ [beam.id]: 1 }, lv().beams);
    const shift = (p: { x: number; y: number }) => ({ x: p.x + 20, y: p.y + 20 });
    expect(lv().slopes[slopeCopy!]).toEqual({ ...slope, id: slopeCopy, a: shift(slope.a), b: shift(slope.b) });
    expect(lv().beams[beamCopy!]).toEqual({ ...beam, id: beamCopy, a: shift(beam.a), b: shift(beam.b) });
    expect(store.getState().selection).toEqual([
      { kind: 'slope', id: slopeCopy },
      { kind: 'beam', id: beamCopy },
    ]);
  });

  it('a mixed selection duplicates objects, cupboards, slopes and beams in one history entry; walls are ignored', () => {
    const { store, o, cupboard, slope, beam, lv, select, entries } = scene();
    const wallId = Object.keys(lv().walls)[0]!;
    select(
      { kind: 'wall', id: wallId },
      { kind: 'object', id: o.id },
      { kind: 'cupboard', id: cupboard.id },
      { kind: 'slope', id: slope.id },
      { kind: 'beam', id: beam.id },
    );
    const n = entries();
    const walls = Object.keys(lv().walls).length;
    expect(duplicateSelection(store)).toBe(true);
    expect(entries()).toBe(n + 1);
    expect(Object.keys(lv().objects)).toHaveLength(2);
    expect(Object.keys(lv().cupboards)).toHaveLength(2);
    expect(Object.keys(lv().slopes)).toHaveLength(2);
    expect(Object.keys(lv().beams)).toHaveLength(2);
    expect(Object.keys(lv().walls)).toHaveLength(walls);
    expect(store.getState().selection.map((i) => i.kind)).toEqual(['object', 'cupboard', 'slope', 'beam']);
    store.getState().undo();
    expect(Object.keys(lv().objects)).toHaveLength(1);
    expect(Object.keys(lv().cupboards)).toHaveLength(1);
    expect(Object.keys(lv().slopes)).toHaveLength(1);
    expect(Object.keys(lv().beams)).toHaveLength(1);
  });

  it('a cupboard without room refuses the whole mixed duplication', () => {
    const { store, o, cupboard, lv, select, entries } = scene({ width: 300, doorCount: 5 });
    select({ kind: 'object', id: o.id }, { kind: 'cupboard', id: cupboard.id });
    const n = entries();
    duplicateSelection(store);
    expect(entries()).toBe(n);
    expect(Object.keys(lv().objects)).toHaveLength(1);
    expect(store.getState().toast?.message).toBe(NO_ROOM_FOR_COPY);
  });
});

describe('duplicableCount', () => {
  it('counts the objects, cupboards, slopes and beams of a selection', () => {
    expect(duplicableCount([])).toBe(0);
    expect(duplicableCount([{ kind: 'wall', id: 'w' }, { kind: 'room', id: 'r' }, { kind: 'opening', id: 'o' }])).toBe(0);
    expect(
      duplicableCount([
        { kind: 'object', id: 'a' },
        { kind: 'cupboard', id: 'b' },
        { kind: 'slope', id: 'c' },
        { kind: 'beam', id: 'd' },
        { kind: 'wall', id: 'w' },
      ]),
    ).toBe(4);
  });
});
