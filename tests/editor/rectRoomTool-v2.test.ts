import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRectRoomInterior } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { isDrawGhost } from '@/editor/tools/drawing';
import type { Level, Vec2 } from '@/core/model/types';
import { applyNumericInput, tabNumericInput } from '@/editor/numericDispatch';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { DYN_DIM_GAP_PX } from '@/editor/tools/drawing';
import { RECT_IDLE, reduceRectTool, rectToolOverlay, type RectToolEvent, type RectToolState } from '@/editor/tools/rectRoomMachine';
import { createRectRoomTool } from '@/editor/tools/rectRoomTool';
import { TOOLS } from '@/editor/tools/registry';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import type { Mods, WallToolEnv } from '@/editor/tools/wallMachine';
import { emptyProject } from '../core/helpers';

/*
 * V2 (spec 6): the rectangle drawn or typed is the INSIDE of the room; the walls stand outside.
 */

const NO_MODS: Mods = { shift: false, alt: false, meta: false };
const pointer = (type: 'down' | 'move' | 'up', p: Vec2): RectToolEvent => ({ type, world: p, screen: p, mods: NO_MODS });
const at = (x: number, y: number): PointerInfo => ({ world: { x, y }, screen: { x, y }, button: 0, shift: false, alt: false, meta: false, detail: 1 });
const keyOf = (k: string) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }) as KeyboardEvent;
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;

const original = TOOLS.rect;
afterEach(() => {
  TOOLS.rect = original;
});

function setup() {
  const store = createEditorStore();
  store.getState().openProject(emptyProject());
  store.getState().setTool('rect');
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  const tool = createRectRoomTool();
  TOOLS.rect = tool;
  return { store, ctx, tool };
}

function span(lvl: Level): { w: number; h: number } {
  const xs = Object.values(lvl.nodes).map((n) => n.x);
  const ys = Object.values(lvl.nodes).map((n) => n.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

describe('rectangle tool v2: interior dimensions', () => {
  it('400 x 300 typed -> a room of 120000 cm2, walls outside (axes 420 x 320)', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(150, 120), ctx);
    expect(tool.onKeyDown!(keyOf('4'), ctx)).toBe(true);
    expect(tabNumericInput(store, ctx, '400')).toBe('ok');
    expect(applyNumericInput(store, ctx, '300')).toBe(true);
    tool.onPointerUp!(at(150, 120), ctx);

    const rooms = deriveLevel(level(store)).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(120000, 6);
    expect(span(level(store))).toEqual({ w: 420, h: 320 });
    expect(store.getState().history.past.map((e) => e.label)).toEqual(['Pièce rectangulaire']);
  });

  it('a dragged rectangle is the inside of the room', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(200, 100), ctx);
    tool.onPointerUp!(at(400, 300), ctx);
    expect(deriveLevel(level(store)).rooms[0]!.area).toBeCloseTo(400 * 300, 6);
    const xs = Object.values(level(store).nodes).map((n) => n.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(-10);
    expect(xs[xs.length - 1]).toBe(410);
  });

  it('a room under 10 cm inside is refused with a message, nothing created', () => {
    const { store, ctx, tool } = setup();
    const free = (x: number, y: number): PointerInfo => ({ ...at(x, y), alt: true }); // Alt: no snapping
    tool.onPointerDown!(free(0, 0), ctx);
    tool.onPointerMove!(free(6, 50), ctx);
    tool.onPointerUp!(free(6, 50), ctx);
    expect(Object.keys(level(store).walls)).toHaveLength(0);
    expect(store.getState().toast?.message).toBe('Pièce trop petite');
  });

  it('preview: walls outside the dashed interior rectangle, interior dimensions beyond the walls', () => {
    const env: WallToolEnv = { level: emptyProject().levels[0]!, pxPerCm: 1, gridStep: 10, thickness: 20, partitionThickness: 7, height: 250 };
    let state: RectToolState = RECT_IDLE;
    for (const e of [pointer('down', { x: 0, y: 0 }), pointer('move', { x: 400, y: 300 })]) state = reduceRectTool(state, e, env).state;
    const ov = rectToolOverlay(state, env);
    const paths = ov.ghost!.paths;
    // the walls: axes 10 cm outside the interior rectangle, stroked 20 cm, without their own dashed axis
    expect(paths[0]).toEqual({
      points: [{ x: -10, y: -10 }, { x: 410, y: -10 }, { x: 410, y: 310 }, { x: -10, y: 310 }],
      closed: true,
      thickness: 20,
      axis: false,
    });
    // the drawn rectangle itself: a dashed line only
    expect(paths[1]).toEqual({
      points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
      closed: true,
      thickness: 0,
    });
    expect(ov.dynamicDims.map((d) => d.value)).toEqual([400, 300]);
    // measured on the interior faces, drawn outside the walls
    expect(ov.dynamicDims[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, offset: -(20 + DYN_DIM_GAP_PX) });
    expect(ov.dynamicDims[1]).toMatchObject({ a: { x: 0, y: 300 }, b: { x: 0, y: 0 }, offset: -(20 + DYN_DIM_GAP_PX) });
  });
});

describe('rectangle tool v2: a corner on an existing wall draws at the axes (V2-R25)', () => {
  it("room B from A's right wall axis: A keeps 12,00 m2, no parallel wall, B = axis size minus the walls", () => {
    const { store, ctx, tool } = setup();
    expect(store.getState().execute('A', addRectRoomInterior(level(store).id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250))).toBe(true);
    tool.onPointerMove!(at(410, 100), ctx);
    tool.onPointerDown!(at(410, 100), ctx); // snaps on A's right wall axis (x = 410)
    tool.onPointerMove!(at(600, 200), ctx);
    tool.onPointerMove!(at(700, 250), ctx);
    const ghost = store.getState().overlay.ghost;
    if (!isDrawGhost(ghost)) throw new Error('draw ghost expected');
    expect(ghost.label?.lines).toContain("Accroché à un mur : cotes à l'axe");
    // the preview is the V1 one: wall axes on the drawn rectangle
    expect(ghost.paths).toEqual([
      { points: [{ x: 410, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 250 }, { x: 410, y: 250 }], closed: true, thickness: 20 },
    ]);
    expect(store.getState().overlay.dynamicDims.map((d) => d.value)).toEqual([290, 150]);
    tool.onPointerUp!(at(700, 250), ctx);

    const lvl = level(store);
    const areas = deriveLevel(lvl).rooms.map((r) => Math.round(r.area)).sort((a, b) => b - a);
    expect(areas).toEqual([120000, (290 - 20) * (150 - 20)]);
    // no wall doubled inside A's right wall or beside it: every node on the shared axes
    expect([...new Set(Object.values(lvl.nodes).map((n) => n.x))].sort((a, b) => a - b)).toEqual([-10, 410, 700]);
    expect([...new Set(Object.values(lvl.nodes).map((n) => n.y))].sort((a, b) => a - b)).toEqual([-10, 100, 250, 310]);
  });

  it('a free rectangle stays an interior one (no label)', () => {
    const env: WallToolEnv = { level: emptyProject().levels[0]!, pxPerCm: 1, gridStep: 10, thickness: 20, partitionThickness: 7, height: 250 };
    let r = reduceRectTool(RECT_IDLE, pointer('down', { x: 0, y: 0 }), env);
    r = reduceRectTool(r.state, pointer('up', { x: 400, y: 300 }), env);
    expect(r.effects).toEqual([{ type: 'commit', levelId: env.level.id, a: { x: 0, y: 0 }, b: { x: 400, y: 300 }, thickness: 20, height: 250, interior: true }]);
  });
});
