import { describe, expect, it, vi } from 'vitest';
import { addRectRoom } from '@/core/commands/walls';
import type { Level } from '@/core/model/types';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { createBeamTool } from '@/editor/tools/beamTool';
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
const key = (k: string): KeyboardEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, defaultPrevented: false, target: null }) as unknown as KeyboardEvent;

function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
  store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  store.getState().setTool('beam');
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  return { store, ctx, tool: createBeamTool() };
}
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;
const beams = (store: EditorStore) => Object.values(level(store).beams);

function click(tool: Tool, ctx: ToolContext, x: number, y: number, mods: Partial<PointerInfo> = {}) {
  tool.onPointerMove!(at(x, y, mods), ctx);
  tool.onPointerDown!(at(x, y, mods), ctx);
  tool.onPointerUp?.(at(x, y, mods), ctx);
}

describe('beam tool', () => {
  it('two clicks snapped to the wall nodes add a beam with the default values', () => {
    const { store, ctx, tool } = setup();
    const before = store.getState().history.past.length;
    click(tool, ctx, 3, -4); // node (0, 0)
    tool.onPointerMove!(at(250, 4), ctx);
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'volume-beam', beam: { width: 12 } });
    click(tool, ctx, 397, 2); // node (400, 0)
    expect(beams(store)).toHaveLength(1);
    expect(beams(store)[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, width: 12, drop: 15, mode: 'ceiling', bottom: 235 });
    expect(store.getState().history.past.length).toBe(before + 1);
    expect(store.getState().history.past.at(-1)!.label).toBe('Ajouter une poutre');
    expect(store.getState().selection).toEqual([{ kind: 'beam', id: beams(store)[0]!.id }]);
    expect(store.getState().overlay.ghost).toBeNull();
    expect(store.getState().tool).toBe('beam');
  });

  it('snaps to a wall face and to a wall axis; Alt is free', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 15, 140); // 5 cm from the inner face x = 10
    click(tool, ctx, 403, 160); // 3 cm from the axis x = 400
    expect(beams(store)[0]).toMatchObject({ a: { x: 10, y: 140 }, b: { x: 400, y: 160 } });
    click(tool, ctx, 15, 140, { alt: true });
    click(tool, ctx, 203.5, 141.2, { alt: true });
    expect(beams(store)[1]).toMatchObject({ a: { x: 15, y: 140 }, b: { x: 203.5, y: 141.2 } });
  });

  it('a second click on the first point is ignored; Escape cancels, then leaves the tool', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 100);
    click(tool, ctx, 100, 100);
    expect(beams(store)).toHaveLength(0);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('beam');
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('select');
    expect(beams(store)).toHaveLength(0);
  });
});

describe('beam tool: snapped cursor marker and Shift', () => {
  const ghost = (store: EditorStore) => store.getState().overlay.ghost;

  it('before the first click, the marker shows the snap: grid, node, wall face', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerMove!(at(153, 147), ctx);
    expect(ghost(store)).toMatchObject({ marker: { at: { x: 150, y: 150 }, snap: 'grid' } });
    tool.onPointerMove!(at(3, -4), ctx);
    expect(ghost(store)).toMatchObject({ marker: { at: { x: 0, y: 0 }, snap: 'node' } });
    tool.onPointerMove!(at(15, 140), ctx);
    expect(ghost(store)).toMatchObject({ marker: { at: { x: 10, y: 140 }, snap: 'face' } });
  });

  it('while placing the second point: the marker and the dynamic length', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 100);
    tool.onPointerMove!(at(397, 103), ctx);
    expect(ghost(store)).toMatchObject({ kind: 'volume-beam', marker: { at: { x: 400, y: 103 }, snap: 'wallAxis' } });
    expect(store.getState().overlay.dynamicDims[0]!.value).toBeCloseTo(Math.hypot(300, 3), 9);
  });

  it('Shift: the beam is horizontal or vertical from its first point', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, 100, 100);
    tool.onPointerMove!(at(302, 128, { shift: true }), ctx);
    expect(ghost(store)).toMatchObject({ kind: 'volume-beam', marker: { at: { x: 300, y: 100 }, snap: 'ortho' } });
    expect(store.getState().overlay.dynamicDims[0]).toMatchObject({ value: 200 });
    click(tool, ctx, 302, 128, { shift: true });
    expect(beams(store)[0]).toMatchObject({ a: { x: 100, y: 100 }, b: { x: 300, y: 100 } });
  });
});
