import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import type { Level, Vec2 } from '@/core/model/types';
import { applyNumericInput, openNumericInput, tabNumericInput } from '@/editor/numericOverlay';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { RECT_IDLE, reduceRectTool, rectToolOverlay, type RectToolEvent, type RectToolState } from '@/editor/tools/rectRoomMachine';
import { createRectRoomTool } from '@/editor/tools/rectRoomTool';
import { TOOLS, type PointerInfo, type ToolContext } from '@/editor/tools/types';
import type { Mods, WallToolEnv } from '@/editor/tools/wallMachine';
import { emptyProject } from '../core/helpers';

const NO_MODS: Mods = { shift: false, alt: false, meta: false };

function envOf(lvl: Level): WallToolEnv {
  return { level: lvl, pxPerCm: 1, gridStep: 10, thickness: 20, partitionThickness: 7, height: 250 };
}

const pointer = (type: 'down' | 'move' | 'up', p: Vec2, mods: Mods = NO_MODS): RectToolEvent => ({ type, world: p, screen: p, mods });

function run(env: WallToolEnv, events: RectToolEvent[], start: RectToolState = RECT_IDLE) {
  let state = start;
  const effects = [];
  for (const e of events) {
    const r = reduceRectTool(state, e, env);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

describe('rectangle tool: state machine', () => {
  const env = envOf(emptyProject().levels[0]!);

  it('press, drag, release -> addRectRoom between the snapped corners', () => {
    const { state, effects } = run(env, [pointer('move', { x: 2, y: 1 }), pointer('down', { x: 2, y: 1 }), pointer('move', { x: 250, y: 100 }), pointer('up', { x: 398, y: 303 })]);
    expect(state).toEqual(RECT_IDLE);
    expect(effects).toEqual([{ type: 'commit', levelId: env.level.id, a: { x: 0, y: 0 }, b: { x: 400, y: 300 }, thickness: 20, height: 250 }]);
  });

  it('a click without a real rectangle does nothing; Escape cancels the drag', () => {
    expect(run(env, [pointer('down', { x: 0, y: 0 }), pointer('up', { x: 2, y: 2 })]).effects).toEqual([]);
    expect(run(env, [pointer('down', { x: 0, y: 0 }), pointer('move', { x: 300, y: 200 }), { type: 'escape' }, pointer('up', { x: 300, y: 200 })]).effects).toEqual([]);
  });

  it('typed width, Tab, typed height, Enter: sizes follow the side of the cursor', () => {
    const { effects } = run(env, [
      pointer('down', { x: 100, y: 100 }),
      pointer('move', { x: 20, y: 30 }), // up-left of the press
      { type: 'digit', key: '4' },
      { type: 'numericTab', value: 400 },
      { type: 'numericSubmit', value: 300 },
    ]);
    expect(effects[0]).toEqual({ type: 'openNumeric', initial: '4', screen: { x: 20, y: 30 }, label: 'Largeur' });
    expect(effects[1]).toEqual({ type: 'openNumeric', initial: '', screen: { x: 20, y: 30 }, label: 'Hauteur' });
    expect(effects[2]).toMatchObject({ type: 'commit', a: { x: 100, y: 100 }, b: { x: -300, y: -200 } });
  });

  it('Enter on the width alone keeps the cursor height; Ctrl / Cmd draws partitions', () => {
    const meta = { ...NO_MODS, meta: true };
    const { effects } = run(env, [pointer('down', { x: 0, y: 0 }, meta), pointer('move', { x: 120, y: 250 }, meta), { type: 'digit', key: '3' }, { type: 'numericSubmit', value: 350 }]);
    expect(effects[1]).toMatchObject({ type: 'commit', a: { x: 0, y: 0 }, b: { x: 350, y: 250 }, thickness: 7 });
  });

  it('a release while typing waits for Enter; dismissing the field then cancels', () => {
    let r = run(env, [pointer('down', { x: 0, y: 0 }), pointer('move', { x: 120, y: 250 }), { type: 'digit', key: '3' }, pointer('up', { x: 120, y: 250 })]);
    expect(r.effects.filter((e) => e.type === 'commit')).toEqual([]);
    expect(r.state.phase).toBe('drag');
    r = run(env, [{ type: 'numericCancel' }], r.state);
    expect(r.state).toEqual(RECT_IDLE);
    expect(r.effects).toEqual([]);
  });

  it('overlay: rectangle ghost, width and height dimensions, the typed one highlighted', () => {
    const { state } = run(env, [pointer('down', { x: 0, y: 0 }), pointer('move', { x: 400, y: 300 }), { type: 'digit', key: '4' }, { type: 'numericTab', value: null }]);
    const ov = rectToolOverlay(state, env);
    expect(ov.dynamicDims.map((d) => d.value)).toEqual([400, 300]);
    expect(ov.activeDimIndex).toBe(1);
    expect(ov.ghost?.paths[0]).toMatchObject({ closed: true, thickness: 20 });
    expect(ov.ghost?.label?.lines).toEqual(['Mur 20 cm']);
  });
});

describe('rectangle tool: in the editor', () => {
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
  const at = (x: number, y: number): PointerInfo => ({ world: { x, y }, screen: { x, y }, button: 0, shift: false, alt: false, meta: false, detail: 1 });
  const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;

  it('a drag creates 4 walls in one history entry and one room', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(200, 100), ctx);
    tool.onPointerMove!(at(400, 300), ctx);
    tool.onPointerUp!(at(400, 300), ctx);
    expect(Object.keys(level(store).walls)).toHaveLength(4);
    expect(store.getState().history.past.map((e) => e.label)).toEqual(['Pièce rectangulaire']);
    expect(deriveLevel(level(store)).rooms[0]!.area).toBeCloseTo(380 * 280, 6);
    store.getState().undo();
    expect(Object.keys(level(store).walls)).toHaveLength(0);
  });

  it('Tab in the numeric field fixes the width and opens the height (tabNumericInput)', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(100, 100), ctx);
    expect(tool.onKeyDown!({ key: '5', metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent, ctx)).toBe(true);
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '5', label: 'Largeur' });
    expect(tabNumericInput(store, ctx, 'abc')).toBe('invalid');
    expect(tabNumericInput(store, ctx, '500')).toBe('ok');
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '', label: 'Hauteur' });
    expect(store.getState().overlay.activeDimIndex).toBe(1);
  });

  it('tabNumericInput is unhandled for a tool without onNumericTab', () => {
    const store = createEditorStore();
    store.getState().openProject(emptyProject());
    const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    expect(store.getState().tool).toBe('select');
    expect(tabNumericInput(store, ctx, '3')).toBe('unhandled');
  });

  const MOD = { metaKey: true, ctrlKey: true, altKey: false, shiftKey: false };
  const keyOf = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

  it('R32: Mod+Z abandons the drag (history untouched), redo is ignored', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerUp!(at(400, 300), ctx); // a first room, one history entry
    tool.onPointerDown!(at(0, 500), ctx);
    tool.onPointerMove!(at(300, 700), ctx);
    expect(tool.onKeyDown!(keyOf('z', { ...MOD, shiftKey: true }), ctx)).toBe(true);
    expect(tool.onKeyDown!(keyOf('z', MOD), ctx)).toBe(true);
    expect(store.getState().overlay.ghost).toBeNull(); // the rectangle preview is gone
    tool.onPointerUp!(at(300, 700), ctx);
    expect(Object.keys(level(store).walls)).toHaveLength(4);
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('a pointer cancel abandons the drag: the next release elsewhere creates nothing', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(300, 200), ctx);
    tool.onKeyDown!(keyOf('4'), ctx);
    tool.onCancel!(ctx);
    expect(store.getState().overlay.numericInput).toBeNull();
    tool.onPointerUp!(at(600, 600), ctx);
    expect(Object.keys(level(store).walls)).toHaveLength(0);
  });

  it('3, Tab, Tab, Enter: returning to the width prefills it with 3', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(300, 200), ctx);
    tool.onKeyDown!(keyOf('3'), ctx);
    expect(tabNumericInput(store, ctx, '3')).toBe('ok');
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '', label: 'Hauteur' });
    expect(tabNumericInput(store, ctx, '', true)).toBe('ok'); // Shift+Tab
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '3', label: 'Largeur' });
    expect(applyNumericInput(store, ctx, '3')).toBe(true);
    const xs = Object.values(level(store).nodes).map((n) => n.x);
    const ys = Object.values(level(store).nodes).map((n) => n.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(3);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(200);
  });

  it('the partition thickness stays once Ctrl / Cmd was seen during the drag', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!({ ...at(0, 0), meta: true }, ctx);
    tool.onPointerMove!(at(200, 100), ctx);
    tool.onPointerUp!(at(400, 300), ctx);
    expect(Object.values(level(store).walls).map((w) => w.thickness)).toEqual([7, 7, 7, 7]);
  });

  it('a change of the active level drops the drag and its ghost', () => {
    const { store, ctx, tool } = setup();
    const p = store.getState().project!;
    store.setState({ project: { ...p, levels: [...p.levels, { ...p.levels[0]!, id: 'level-2' }] } });
    tool.onPointerDown!(at(0, 0), ctx);
    tool.onPointerMove!(at(300, 200), ctx);
    store.getState().setActiveLevel('level-2');
    expect(store.getState().overlay.ghost).toBeNull();
    tool.onPointerUp!(at(300, 200), ctx);
    expect(store.getState().project!.levels.every((l) => Object.keys(l.walls).length === 0)).toBe(true);
  });
});
