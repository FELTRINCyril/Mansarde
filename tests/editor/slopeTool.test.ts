import { describe, expect, it, vi } from 'vitest';
import { addRectRoom } from '@/core/commands/walls';
import type { Level } from '@/core/model/types';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { createSlopeTool, slopeSideAndDepth } from '@/editor/tools/slopeTool';
import type { PointerInfo, Tool, ToolContext } from '@/editor/tools/types';
import { emptyProject } from '../core/helpers';

const at = (x: number, y: number, mods: Partial<PointerInfo> = {}): PointerInfo => ({
  world: { x, y },
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  meta: false,
  detail: 1,
  ...mods,
});
const key = (k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, defaultPrevented: false, target: null, ...mods }) as unknown as KeyboardEvent;

function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
  // room 400 x 300 on the axes, walls 20 cm: inner faces at x = 10, x = 390, y = 10, y = 290
  store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  store.getState().setTool('slope');
  // 1 px per cm: the snap tolerance is 8 cm
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  return { store, ctx, tool: createSlopeTool() };
}
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;
const slopes = (store: EditorStore) => Object.values(level(store).slopes);

function click(tool: Tool, ctx: ToolContext, x: number, y: number, mods: Partial<PointerInfo> = {}) {
  tool.onPointerMove!(at(x, y, mods), ctx);
  tool.onPointerDown!(at(x, y, mods), ctx);
  tool.onPointerUp!(at(x, y, mods), ctx);
}

describe('slopeSideAndDepth', () => {
  it('left = +perp(b - a), depth = distance to the start line, rounded unless raw, at least 1', () => {
    // a -> b along +x: +perp = +y
    expect(slopeSideAndDepth({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 60.4 })).toEqual({ side: 'left', depth: 60 });
    expect(slopeSideAndDepth({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: -42 })).toEqual({ side: 'right', depth: 42 });
    expect(slopeSideAndDepth({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 60.4 }, true).depth).toBeCloseTo(60.4, 9);
    expect(slopeSideAndDepth({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 0.2 }).depth).toBe(1);
  });
});

describe('slope tool', () => {
  it('three clicks, then the start height, Tab, the end height and Enter add one slope', () => {
    const { store, ctx, tool } = setup();
    const before = store.getState().history.past.length;
    click(tool, ctx, 100, 100);
    tool.onPointerMove!(at(250, 100), ctx);
    expect(store.getState().overlay.dynamicDims[0]).toMatchObject({ value: 150 });
    click(tool, ctx, 300, 100);
    // the third point sets the side and the depth (dynamic dimension)
    tool.onPointerMove!(at(200, 160), ctx);
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'volume-slope', slope: { side: 'left', depth: 60 } });
    expect(store.getState().overlay.dynamicDims[0]).toMatchObject({ value: 60 });
    tool.onPointerDown!(at(200, 160), ctx);
    // nothing added yet, the field opens at the release with the level height selected
    expect(store.getState().overlay.numericInput).toBeNull();
    tool.onPointerUp!(at(200, 160), ctx);
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '250', label: 'Hauteur au départ', select: true });
    expect(slopes(store)).toHaveLength(0);
    tool.onNumericTab!(240, ctx);
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '150', label: "Hauteur à l'arrivée" });
    expect(slopes(store)).toHaveLength(0);
    tool.onNumericSubmit!(150, ctx);
    const [s] = slopes(store);
    expect(slopes(store)).toHaveLength(1);
    expect(s).toMatchObject({ a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, side: 'left', depth: 60, heightStart: 240, heightEnd: 150 });
    expect(store.getState().history.past.length).toBe(before + 1);
    expect(store.getState().history.past.at(-1)!.label).toBe('Ajouter une pente');
    expect(store.getState().selection).toEqual([{ kind: 'slope', id: s!.id }]);
    expect(store.getState().overlay.ghost).toBeNull();
    expect(store.getState().tool).toBe('slope');
  });

  it('the side follows the third point; Escape in the heights keeps the defaults', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 200);
    click(tool, ctx, 300, 200);
    click(tool, ctx, 150, 120); // 80 cm on the -y side: right of a -> b
    tool.onNumericCancel!(ctx);
    expect(slopes(store)).toHaveLength(1);
    expect(slopes(store)[0]).toMatchObject({ side: 'right', depth: 80, heightStart: 250, heightEnd: 150 });
  });

  it('a value given with Tab is kept when the field is then left with Escape', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 200);
    click(tool, ctx, 300, 200);
    click(tool, ctx, 150, 120);
    tool.onNumericTab!(230, ctx);
    tool.onNumericCancel!(ctx);
    expect(slopes(store)[0]).toMatchObject({ heightStart: 230, heightEnd: 150 });
  });

  it('snaps the start line to a wall face, a node or an axis; Alt is free', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 13, 150); // 3 cm from the inner face x = 10
    click(tool, ctx, 397, 150, { alt: true }); // free
    click(tool, ctx, 200, 250);
    tool.onNumericSubmit!(250, ctx);
    expect(slopes(store)[0]).toMatchObject({ a: { x: 10, y: 150 }, b: { x: 397, y: 150 } });
  });

  it('Escape cancels the slope in progress, then returns to the selection tool; Mod+Z drops it', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 100);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().overlay.ghost).toBeNull();
    click(tool, ctx, 100, 100);
    click(tool, ctx, 300, 100);
    expect(tool.onKeyDown!(key('z', { metaKey: true, ctrlKey: true }), ctx)).toBe(true);
    expect(store.getState().overlay.ghost).toBeNull();
    // nothing in progress: Mod+Z is the plain undo
    expect(tool.onKeyDown!(key('z', { metaKey: true, ctrlKey: true }), ctx)).toBe(false);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('select');
    expect(slopes(store)).toHaveLength(0);
  });

  it('a second click on the first point is ignored', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 100);
    click(tool, ctx, 100, 100);
    click(tool, ctx, 300, 100);
    click(tool, ctx, 200, 150);
    tool.onNumericSubmit!(200, ctx);
    expect(slopes(store)[0]).toMatchObject({ a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, depth: 50, heightStart: 200, heightEnd: 150 });
  });
});
