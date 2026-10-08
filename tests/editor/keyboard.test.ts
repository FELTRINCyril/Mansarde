import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addObject } from '@/core/commands/objects';
import { addRectRoom } from '@/core/commands/walls';
import { createObjectFromSize } from '@/core/model/factory';
import type { Id, PlacedObject } from '@/core/model/types';
import { deleteSelection, handleGlobalKey, isTypingTarget } from '@/editor/keyboard';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { selectTool } from '@/editor/tools/selectTool';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import { emptyProject } from '../core/helpers';

const box = (x = 100, y = 100): PlacedObject =>
  createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, x, y, { width: 50, depth: 40, height: 50 }, 'Caisse', '#ccc');

function ctxOf(store: EditorStore): ToolContext {
  return { store, toWorld: (p) => p, pxPerCm: () => 1, fitView: vi.fn() };
}

/** Store with one object (selected) and one history entry. */
function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
  const o = box();
  expect(store.getState().execute('Add', addObject(levelId, o))).toBe(true);
  store.getState().setSelection([{ kind: 'object', id: o.id }]);
  return { store, levelId, id: o.id, ctx: ctxOf(store) };
}

interface FakeKey {
  key: string;
  target?: unknown;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}
const key = (k: FakeKey): KeyboardEvent =>
  ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, defaultPrevented: false, target: null, ...k }) as unknown as KeyboardEvent;
/** Cmd+key: the tests run as macOS (navigator stubbed below) unless a test says otherwise. */
const mod = (k: string, extra: Partial<FakeKey> = {}): KeyboardEvent => key({ key: k, metaKey: true, ...extra });
const ctrl = (k: string, extra: Partial<FakeKey> = {}): KeyboardEvent => key({ key: k, ctrlKey: true, ...extra });

beforeEach(() => vi.stubGlobal('navigator', { platform: 'MacIntel' }));
afterEach(() => vi.unstubAllGlobals());

const objects = (store: EditorStore): PlacedObject[] => Object.values(store.getState().project!.levels[0]!.objects);
const objectAt = (store: EditorStore, id: Id): PlacedObject => store.getState().project!.levels[0]!.objects[id]!;

describe('isTypingTarget: only text-like inputs', () => {
  const input = (type?: string) => ({ tagName: 'INPUT', type }) as unknown as EventTarget;

  it('text-like input types are typing targets', () => {
    for (const type of [undefined, '', 'text', 'search', 'number', 'email', 'url', 'tel', 'password', 'TEXT']) {
      expect(isTypingTarget(input(type))).toBe(true);
    }
  });

  it('checkbox, radio, buttons, range, color and file inputs are not', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']) {
      expect(isTypingTarget(input(type))).toBe(false);
    }
  });

  it('shortcuts act while a checkbox or a color input has the focus', () => {
    for (const type of ['checkbox', 'color']) {
      const { store, ctx, id } = setup();
      const target = { tagName: 'INPUT', type };
      expect(handleGlobalKey(mod('z', { target }), store, ctx)).toBe(true);
      expect(objects(store)).toHaveLength(0);
      expect(handleGlobalKey(mod('z', { target, shiftKey: true }), store, ctx)).toBe(true);
      expect(objects(store)).toHaveLength(1);
      store.getState().setSelection([{ kind: 'object', id: objects(store)[0]!.id }]); // undo pruned it
      expect(handleGlobalKey(key({ key: 'ArrowRight', target }), store, ctx)).toBe(true);
      expect(objectAt(store, id).x).toBe(101);
      expect(handleGlobalKey(key({ key: 'Delete', target }), store, ctx)).toBe(true);
      expect(objects(store)).toHaveLength(0);
    }
  });

  it('a focused slider or radio keeps its arrow keys', () => {
    const { store, ctx, id } = setup();
    for (const type of ['range', 'radio']) {
      expect(handleGlobalKey(key({ key: 'ArrowRight', target: { tagName: 'INPUT', type } }), store, ctx)).toBe(false);
    }
    expect(objectAt(store, id).x).toBe(100);
  });
});

describe('isTypingTarget', () => {
  it('recognizes fields and editable elements, not the rest', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('keyboard guard (Review Focus 1)', () => {
  const targets: Array<[string, unknown]> = [
    ['input', { tagName: 'INPUT' }],
    ['textarea', { tagName: 'TEXTAREA' }],
    ['contenteditable', { tagName: 'DIV', isContentEditable: true }],
  ];
  for (const [name, target] of targets) {
    it(`ignores shortcuts typed in a ${name}`, () => {
      const { store, ctx } = setup();
      const before = store.getState();
      const events = [
        key({ key: 'm', target }),
        key({ key: 'M', target, shiftKey: true }),
        key({ key: 'Delete', target }),
        key({ key: 'Backspace', target }),
        mod('z', { target }),
        mod('z', { target, shiftKey: true }),
        key({ key: 'ArrowLeft', target }),
        key({ key: 'Escape', target }),
        key({ key: '0', target }),
      ];
      for (const e of events) expect(handleGlobalKey(e, store, ctx)).toBe(false);
      const after = store.getState();
      expect(after.tool).toBe('select');
      expect(after.selection).toBe(before.selection);
      expect(after.history).toBe(before.history);
      expect(after.project).toBe(before.project);
      expect(ctx.fitView).not.toHaveBeenCalled();
    });
  }

  it('ignores a key already handled elsewhere (defaultPrevented)', () => {
    const { store, ctx } = setup();
    const before = store.getState();
    for (const k of ['Escape', 'm', 'Delete', 'ArrowLeft']) {
      expect(handleGlobalKey({ ...key({ key: k }), defaultPrevented: true } as KeyboardEvent, store, ctx)).toBe(false);
    }
    expect(handleGlobalKey({ ...mod('z'), defaultPrevented: true } as KeyboardEvent, store, ctx)).toBe(false);
    expect(store.getState().selection).toBe(before.selection);
    expect(store.getState().tool).toBe('select');
    expect(store.getState().history).toBe(before.history);
  });

  describe('while a modal dialog is open', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('ignores every key, Escape included', () => {
      const { store, ctx } = setup();
      const querySelector = vi.fn((selector: string) => (selector === '[aria-modal="true"]' ? {} : null));
      vi.stubGlobal('document', { querySelector });
      const before = store.getState();
      for (const e of [key({ key: 'Escape' }), key({ key: 'm' }), key({ key: 'Delete' }), mod('z'), key({ key: '0' })]) {
        expect(handleGlobalKey(e, store, ctx)).toBe(false);
      }
      expect(querySelector).toHaveBeenCalled();
      expect(store.getState().selection).toBe(before.selection);
      expect(store.getState().history).toBe(before.history);
      expect(store.getState().tool).toBe('select');
      expect(ctx.fitView).not.toHaveBeenCalled();
      // dialog closed: Escape clears the selection again
      vi.stubGlobal('document', { querySelector: () => null });
      expect(handleGlobalKey(key({ key: 'Escape' }), store, ctx)).toBe(true);
      expect(store.getState().selection).toEqual([]);
    });
  });

  it('the same keys act outside a field (control)', () => {
    const { store, ctx } = setup();
    const target = { tagName: 'DIV' };
    expect(handleGlobalKey(key({ key: 'm', target }), store, ctx)).toBe(true);
    expect(store.getState().tool).toBe('wall');
    expect(handleGlobalKey(key({ key: 'v', target }), store, ctx)).toBe(true);
    expect(handleGlobalKey(key({ key: 'Delete', target }), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(0);
    expect(store.getState().selection).toEqual([]);
    expect(handleGlobalKey(mod('z', { target }), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(1);
  });
});

describe('handleGlobalKey', () => {
  it('switches tools with V M R P F C', () => {
    const { store, ctx } = setup();
    const expected: Array<[string, string]> = [['m', 'wall'], ['r', 'rect'], ['p', 'door'], ['f', 'window'], ['c', 'dimension'], ['V', 'select']];
    for (const [k, tool] of expected) {
      expect(handleGlobalKey(key({ key: k }), store, ctx)).toBe(true);
      expect(store.getState().tool).toBe(tool);
    }
  });

  it('maps Mod to Cmd on macOS: Ctrl+Z does nothing there', () => {
    const { store, ctx } = setup();
    expect(handleGlobalKey(ctrl('z'), store, ctx)).toBe(false);
    expect(handleGlobalKey(ctrl('d'), store, ctx)).toBe(false);
    expect(objects(store)).toHaveLength(1);
    expect(handleGlobalKey(mod('z'), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(0);
  });

  it('maps Mod to Ctrl elsewhere: Cmd (Meta) + Z does nothing there', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const { store, ctx } = setup();
    expect(handleGlobalKey(mod('z'), store, ctx)).toBe(false);
    expect(objects(store)).toHaveLength(1);
    expect(handleGlobalKey(ctrl('z'), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(0);
    expect(handleGlobalKey(ctrl('y'), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(1);
  });

  it('Mod+Z, Mod+Shift+Z and Mod+Y during a gesture only cancel it', () => {
    for (const e of [mod('z'), mod('z', { shiftKey: true }), mod('y')]) {
      const { store, ctx, levelId, id } = setup();
      const entries = store.getState().history.past.length;
      store.getState().beginGesture('Move');
      store.getState().updateGesture((d) => {
        d.levels.find((l) => l.id === levelId)!.objects[id]!.x = 300;
      });
      expect(handleGlobalKey(e, store, ctx)).toBe(true);
      expect(store.getState().gesture).toBeNull();
      expect(objectAt(store, id).x).toBe(100); // gesture abandoned, the object still exists
      expect(store.getState().history.past.length).toBe(entries);
    }
  });

  it('Mod+Z, Mod+Shift+Z and Mod+Y during a selection rectangle only cancel the rectangle', () => {
    const at = (x: number, y: number): PointerInfo => ({ world: { x, y }, screen: { x, y }, button: 0, shift: false, alt: false, meta: false, detail: 1 });
    for (const e of [mod('z'), mod('z', { shiftKey: true }), mod('y')]) {
      const { store, ctx, id } = setup();
      store.getState().setSelection([]);
      const entries = store.getState().history.past.length;
      // the selection tool is the active one (TOOLS.select): a press in the void, then a drag
      selectTool.onPointerDown!(at(10, 10), ctx);
      selectTool.onPointerMove!(at(200, 200), ctx);
      expect(store.getState().overlay.marquee).not.toBeNull();
      expect(handleGlobalKey(e, store, ctx)).toBe(true);
      expect(store.getState().overlay.marquee).toBeNull();
      expect(objectAt(store, id).x).toBe(100); // not undone
      expect(store.getState().history.past.length).toBe(entries);
      expect(store.getState().history.future).toHaveLength(0);
      // the release that follows selects nothing
      selectTool.onPointerMove!(at(220, 220), ctx);
      selectTool.onPointerUp!(at(220, 220), ctx);
      expect(store.getState().selection).toEqual([]);
      expect(store.getState().overlay.marquee).toBeNull();
      selectTool.onDeactivate!(ctx);
    }
  });

  it('undo with Mod+Z, redo with Mod+Shift+Z and Mod+Y', () => {
    const { store, ctx } = setup();
    expect(handleGlobalKey(mod('z'), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(0);
    expect(handleGlobalKey(mod('Z', { shiftKey: true }), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(1);
    handleGlobalKey(mod('z'), store, ctx);
    expect(handleGlobalKey(mod('y'), store, ctx)).toBe(true);
    expect(objects(store)).toHaveLength(1);
  });

  it('nudges the selection by 1 cm, 10 cm with Shift, one history entry per key press', () => {
    const { store, ctx, id } = setup();
    const entries = store.getState().history.past.length;
    expect(handleGlobalKey(key({ key: 'ArrowRight' }), store, ctx)).toBe(true);
    expect(handleGlobalKey(key({ key: 'ArrowRight' }), store, ctx)).toBe(true);
    expect(handleGlobalKey(key({ key: 'ArrowUp', shiftKey: true }), store, ctx)).toBe(true);
    expect(objectAt(store, id)).toMatchObject({ x: 102, y: 90 });
    expect(store.getState().history.past.length).toBe(entries + 3);
    handleGlobalKey(mod('z'), store, ctx);
    expect(objectAt(store, id)).toMatchObject({ x: 102, y: 100 });
  });

  it('nudges selected walls and nodes once each', () => {
    const store = createEditorStore();
    const p = emptyProject();
    store.getState().openProject(p);
    const levelId = p.levels[0]!.id;
    store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    const level = store.getState().project!.levels[0]!;
    const top = Object.values(level.walls).find((w) => level.nodes[w.startNodeId]!.y === 0 && level.nodes[w.endNodeId]!.y === 0)!;
    store.getState().setSelection([
      { kind: 'wall', id: top.id },
      { kind: 'node', id: top.startNodeId },
    ]);
    handleGlobalKey(key({ key: 'ArrowDown', shiftKey: true }), store, ctxOf(store));
    const next = store.getState().project!.levels[0]!;
    expect(next.nodes[top.startNodeId]!.y).toBe(10);
    expect(next.nodes[top.endNodeId]!.y).toBe(10);
  });

  it('ignores arrows when nothing is selected', () => {
    const { store, ctx } = setup();
    store.getState().setSelection([]);
    expect(handleGlobalKey(key({ key: 'ArrowRight' }), store, ctx)).toBe(false);
  });

  it('copies and pastes objects at +20 +20 and selects the copies', () => {
    const { store, ctx, id } = setup();
    expect(handleGlobalKey(mod('c'), store, ctx)).toBe(true);
    expect(store.getState().clipboard.map((o) => o.id)).toEqual([id]);
    expect(handleGlobalKey(mod('v'), store, ctx)).toBe(true);
    const all = objects(store);
    expect(all).toHaveLength(2);
    const copy = all.find((o) => o.id !== id)!;
    expect(copy).toMatchObject({ x: 120, y: 120, width: 50, depth: 40 });
    expect(store.getState().selection).toEqual([{ kind: 'object', id: copy.id }]);
    // a second paste lands 20 cm further
    handleGlobalKey(mod('v'), store, ctx);
    expect(objects(store).map((o) => o.x).sort((a, b) => a - b)).toEqual([100, 120, 140]);
  });

  it('copy without selected object does nothing; paste of an empty clipboard does nothing', () => {
    const { store, ctx } = setup();
    store.getState().setSelection([]);
    expect(handleGlobalKey(mod('c'), store, ctx)).toBe(false);
    expect(handleGlobalKey(mod('v'), store, ctx)).toBe(false);
    expect(objects(store)).toHaveLength(1);
  });

  it('duplicates the selected objects with Mod+D in one history entry', () => {
    const { store, ctx, id } = setup();
    const entries = store.getState().history.past.length;
    expect(handleGlobalKey(mod('d'), store, ctx)).toBe(true);
    const copy = objects(store).find((o) => o.id !== id)!;
    expect(copy).toMatchObject({ x: 120, y: 120 });
    expect(store.getState().selection).toEqual([{ kind: 'object', id: copy.id }]);
    expect(store.getState().history.past.length).toBe(entries + 1);
  });

  it('Escape clears the selection; 0 fits the view', () => {
    const { store, ctx } = setup();
    expect(handleGlobalKey(key({ key: 'Escape' }), store, ctx)).toBe(true);
    expect(store.getState().selection).toEqual([]);
    expect(handleGlobalKey(key({ key: '0' }), store, ctx)).toBe(true);
    expect(ctx.fitView).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels an active gesture first', () => {
    const { store, ctx, levelId, id } = setup();
    store.getState().beginGesture('Move');
    store.getState().updateGesture((d) => {
      d.levels.find((l) => l.id === levelId)!.objects[id]!.x = 300;
    });
    expect(handleGlobalKey(key({ key: 'Escape' }), store, ctx)).toBe(true);
    expect(store.getState().gesture).toBeNull();
    expect(objectAt(store, id).x).toBe(100);
    expect(store.getState().selection).toHaveLength(1);
  });

  it('gives the active tool the first chance', () => {
    const { store, ctx } = setup();
    // the select tool does not handle 'm' itself: the global shortcut applies
    expect(handleGlobalKey(key({ key: 'm' }), store, ctx)).toBe(true);
    expect(store.getState().tool).toBe('wall');
  });

  it('does nothing without a project', () => {
    const store = createEditorStore();
    expect(handleGlobalKey(key({ key: 'm' }), store, ctxOf(store))).toBe(false);
    expect(store.getState().tool).toBe('select');
  });
});

describe('deleteSelection', () => {
  it('deletes objects, ignores rooms and clears the selection', () => {
    const { store, id } = setup();
    store.getState().setSelection([
      { kind: 'object', id },
      { kind: 'room', id: 'room-0' },
    ]);
    deleteSelection(store);
    expect(objects(store)).toHaveLength(0);
    expect(store.getState().selection).toEqual([]);
  });

  it('a selection of rooms only changes nothing', () => {
    const { store } = setup();
    store.getState().setSelection([{ kind: 'room', id: 'room-0' }]);
    const before = store.getState();
    deleteSelection(store);
    expect(store.getState().history).toBe(before.history);
    expect(store.getState().selection).toBe(before.selection);
  });
});
