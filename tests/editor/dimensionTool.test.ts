import { describe, expect, it, vi } from 'vitest';
import { addObject } from '@/core/commands/objects';
import { addRectRoom } from '@/core/commands/walls';
import { createObjectFromSize } from '@/core/model/factory';
import type { Level } from '@/core/model/types';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { createDimensionTool, snapDimensionPoint } from '@/editor/tools/dimensionTool';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
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
  store.getState().setTool('dimension');
  // 1 px per cm: the snap tolerance is 8 cm
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  return { store, ctx, levelId, tool: createDimensionTool() };
}
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;
const nodeAt = (store: EditorStore, x: number, y: number) => Object.values(level(store).nodes).find((n) => n.x === x && n.y === y)!;

describe('snapDimensionPoint (ruling R17)', () => {
  it('node first, then an object corner within the tolerance, else a free point', () => {
    const { store, levelId } = setup();
    const bed = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 200, 150, { width: 100, depth: 50, height: 50 }, 'X', '#999');
    store.getState().execute('Bed', addObject(levelId, bed));
    const lv = level(store);
    expect(snapDimensionPoint(lv, { x: 3, y: -4 }, 8)).toMatchObject({ anchor: { kind: 'node', nodeId: nodeAt(store, 0, 0).id }, point: { x: 0, y: 0 } });
    // corner 0 = local (-w/2, -d/2) = (150, 125)
    expect(snapDimensionPoint(lv, { x: 154, y: 121 }, 8)).toMatchObject({ anchor: { kind: 'objectCorner', objectId: bed.id, corner: 0 }, point: { x: 150, y: 125 } });
    expect(snapDimensionPoint(lv, { x: 100, y: 100 }, 8)).toMatchObject({ anchor: { kind: 'point', x: 100, y: 100 }, snapped: false });
    // a wall face is not a snap target: a point 2 cm from the inner face stays free
    expect(snapDimensionPoint(lv, { x: 12, y: 150 }, 8).anchor.kind).toBe('point');
    // disabled (Alt): free point
    expect(snapDimensionPoint(lv, { x: 3, y: -4 }, 8, false).anchor).toEqual({ kind: 'point', x: 3, y: -4 });
  });
});

describe('dimension tool', () => {
  it('click, click, then a click for the offset adds a manual dimension between two nodes', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerMove!(at(2, 3), ctx);
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'outline', points: [{ x: 0, y: 0 }] });
    tool.onPointerDown!(at(2, 3), ctx);
    tool.onPointerMove!(at(250, 40), ctx);
    expect(store.getState().overlay.dynamicDims).toHaveLength(1);
    tool.onPointerDown!(at(397, 2), ctx);
    tool.onPointerMove!(at(200, -60.4), ctx);
    const preview = store.getState().overlay.dynamicDims[0]!;
    expect(preview).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, offset: -60, value: 400 });
    tool.onPointerDown!(at(200, -60.4), ctx);
    const dims = Object.values(level(store).dimensions);
    expect(dims).toHaveLength(1);
    expect(dims[0]).toMatchObject({
      a: { kind: 'node', nodeId: nodeAt(store, 0, 0).id },
      b: { kind: 'node', nodeId: nodeAt(store, 400, 0).id },
      offset: -60,
    });
    expect(store.getState().history.past.at(-1)!.label).toBe('Ajouter une cote');
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    expect(store.getState().tool).toBe('dimension');
    // Alt: raw offset
    tool.onPointerDown!(at(100, 100), ctx);
    tool.onPointerDown!(at(200, 100), ctx);
    tool.onPointerDown!(at(150, 130.4, { alt: true }), ctx);
    const second = Object.values(level(store).dimensions).find((d) => d.a.kind === 'point')!;
    expect(second.offset).toBeCloseTo(30.4, 9);
  });

  it('a second click on the first point is ignored', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerDown!(at(1, 1), ctx); // snaps on the same node
    tool.onPointerDown!(at(100, 100), ctx); // this is the second point
    tool.onPointerDown!(at(100, 140), ctx);
    expect(Object.values(level(store).dimensions)).toHaveLength(1);
  });

  it('Escape cancels the dimension in progress, then returns to the selection tool', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerDown!(at(400, 0), ctx);
    tool.onPointerMove!(at(200, -50), ctx);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    tool.onPointerDown!(at(200, -50), ctx); // a new first point, not the offset
    expect(Object.values(level(store).dimensions)).toHaveLength(0);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('dimension');
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('select');
  });
});
