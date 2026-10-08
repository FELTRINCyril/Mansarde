import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRectRoom } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import type { Level, Vec2 } from '@/core/model/types';
import { applyNumericInput } from '@/editor/numericOverlay';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { FIELD_DROP_PX, isDrawGhost } from '@/editor/tools/drawing';
import { TOOLS, type PointerInfo, type Tool, type ToolContext } from '@/editor/tools/types';
import { reduceWallTool, WALL_IDLE, wallToolOverlay, type Mods, type WallToolEnv, type WallToolState } from '@/editor/tools/wallMachine';
import { createWallTool } from '@/editor/tools/wallTool';
import { emptyProject } from '../core/helpers';

const NO_MODS: Mods = { shift: false, alt: false, meta: false };

const original = TOOLS.wall;
afterEach(() => {
  TOOLS.wall = original;
});

/** 1 px per cm, screen = world; the tool under test is the registered wall tool (numeric field callbacks). */
function setup() {
  const store = createEditorStore();
  store.getState().openProject(emptyProject());
  store.getState().setTool('wall');
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  const tool = createWallTool();
  TOOLS.wall = tool;
  return { store, ctx, tool };
}

const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;

const at = (x: number, y: number, mods: Partial<PointerInfo> = {}): PointerInfo => ({
  world: { x, y }, screen: { x, y }, button: 0, shift: false, alt: false, meta: false, detail: 1, ...mods,
});

function click(tool: Tool, ctx: ToolContext, p: Vec2, mods: Partial<PointerInfo> = {}) {
  tool.onPointerMove!(at(p.x, p.y, mods), ctx);
  tool.onPointerDown!(at(p.x, p.y, mods), ctx);
  tool.onPointerUp?.(at(p.x, p.y, mods), ctx);
}

const key = (k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent;

function envOf(lvl: Level, over: Partial<WallToolEnv> = {}): WallToolEnv {
  return { level: lvl, pxPerCm: 1, gridStep: 10, thickness: 20, partitionThickness: 7, height: 250, ...over };
}

/** Runs click events through the pure reducer; returns the final state and every effect. */
function clicks(env: WallToolEnv, points: Vec2[], mods: Mods = NO_MODS, start: WallToolState = WALL_IDLE) {
  let state = start;
  const effects = [];
  for (const p of points) {
    let r = reduceWallTool(state, { type: 'move', world: p, screen: p, mods }, env);
    r = reduceWallTool(r.state, { type: 'click', world: p, screen: p, mods }, env);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const nodeDegrees = (lvl: Level): number[] =>
  Object.keys(lvl.nodes).map((id) => Object.values(lvl.walls).filter((w) => w.startNodeId === id || w.endNodeId === id).length);

describe('wall tool: state machine', () => {
  it('closing on the first point gives one addWallChain with 5 points, the last one on the first node', () => {
    const lvl = emptyProject().levels[0]!;
    const { state, effects } = clicks(envOf(lvl), [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 0 },
    ]);
    expect(state.phase).toBe('idle');
    expect(effects).toHaveLength(1);
    const fx = effects[0]!;
    expect(fx.type).toBe('commit');
    if (fx.type !== 'commit') return;
    expect(fx.points).toEqual([
      { kind: 'free', x: 0, y: 0 },
      { kind: 'free', x: 400, y: 0 },
      { kind: 'free', x: 400, y: 300 },
      { kind: 'free', x: 0, y: 300 },
      { kind: 'free', x: 0, y: 0 }, // same place as the first free point: addWallChain reuses its node
    ]);
    expect(fx.thickness).toBe(20);
    expect(fx.height).toBe(250);
  });

  it('closing on a first point that is an existing node reuses that node id', () => {
    const p = emptyProject();
    const store = createEditorStore();
    store.getState().openProject(p);
    store.getState().execute('Room', addRectRoom(p.levels[0]!.id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    const lvl = level(store);
    const corner = Object.values(lvl.nodes).find((n) => n.x === 400 && n.y === 0)!;
    const { effects } = clicks(envOf(lvl), [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 0 }]);
    const fx = effects[0]!;
    if (fx.type !== 'commit') throw new Error('commit expected');
    expect(fx.points[0]).toEqual({ kind: 'node', nodeId: corner.id });
    expect(fx.points[3]).toEqual({ kind: 'node', nodeId: corner.id });
  });

  it('a point on a wall axis becomes onWall (T junction)', () => {
    const p = emptyProject();
    const store = createEditorStore();
    store.getState().openProject(p);
    store.getState().execute('Room', addRectRoom(p.levels[0]!.id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    const { state } = clicks(envOf(level(store)), [{ x: 153, y: 2 }]);
    if (state.phase !== 'drawing') throw new Error('drawing expected');
    expect(state.points[0]!.wp).toMatchObject({ kind: 'onWall' });
    expect(state.points[0]!.at).toEqual({ x: 153, y: 0 });
  });

  it('ignores zero-length clicks and the second click of a double-click; finish commits', () => {
    const env = envOf(emptyProject().levels[0]!);
    let { state, effects } = clicks(env, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(effects).toEqual([]);
    // second click of a double-click, 2 px away, would snap to another grid point (210 vs 200)
    const r1 = reduceWallTool(state, { type: 'click', world: { x: 206, y: 0 }, screen: { x: 202, y: 0 }, mods: NO_MODS }, env);
    if (r1.state.phase !== 'drawing') throw new Error('drawing expected');
    expect(r1.state.points).toHaveLength(2);
    const r2 = reduceWallTool(r1.state, { type: 'finish' }, env);
    expect(r2.state.phase).toBe('idle');
    expect(r2.effects).toHaveLength(1);
    if (r2.effects[0]!.type !== 'commit') throw new Error('commit expected');
    expect(r2.effects[0]!.points).toHaveLength(2);
    // a single point: finish and Escape cancel without committing
    ({ state, effects } = clicks(env, [{ x: 0, y: 0 }]));
    expect(reduceWallTool(state, { type: 'escape' }, env)).toEqual({ state: { phase: 'idle', hover: null }, effects: [] });
    expect(reduceWallTool(state, { type: 'finish' }, env).effects).toEqual([]);
  });

  it('Escape with at least 2 points finishes the chain', () => {
    const env = envOf(emptyProject().levels[0]!);
    const { state } = clicks(env, [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }]);
    const r = reduceWallTool(state, { type: 'escape' }, env);
    expect(r.state.phase).toBe('idle');
    if (r.effects[0]?.type !== 'commit') throw new Error('commit expected');
    expect(r.effects[0].points).toHaveLength(3);
  });

  it('Ctrl / Cmd held uses the partition thickness and says so in the preview', () => {
    const env = envOf(emptyProject().levels[0]!);
    const meta = { ...NO_MODS, meta: true };
    const { state } = clicks(env, [{ x: 0, y: 0 }, { x: 300, y: 0 }], meta);
    const ov = wallToolOverlay(state, env);
    expect(isDrawGhost(ov.ghost) && ov.ghost.paths[0]!.thickness).toBe(7);
    expect(ov.ghost?.label?.lines).toContain('Cloison 7 cm');
    const r = reduceWallTool(state, { type: 'finish' }, env);
    if (r.effects[0]?.type !== 'commit') throw new Error('commit expected');
    expect(r.effects[0].thickness).toBe(7);
    // without the modifier: the default thickness
    const plain = clicks(env, [{ x: 0, y: 0 }]);
    const moved = reduceWallTool(plain.state, { type: 'move', world: { x: 0, y: -300 }, screen: { x: 0, y: -300 }, mods: NO_MODS }, env);
    const ov2 = wallToolOverlay(moved.state, env);
    expect(ov2.ghost?.label?.lines).toEqual(['90°', 'Mur 20 cm']);
    expect(ov2.dynamicDims).toHaveLength(1);
    expect(ov2.dynamicDims[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 0, y: -300 }, value: 300, kind: 'dynamic' });
  });

  it('Shift constrains to 90 degrees, Alt disables snapping', () => {
    const env = envOf(emptyProject().levels[0]!);
    const { state } = clicks(env, [{ x: 0, y: 0 }]);
    const ortho = reduceWallTool(state, { type: 'move', world: { x: 233, y: 61 }, screen: { x: 233, y: 61 }, mods: { ...NO_MODS, shift: true } }, env);
    expect(ortho.state.hover?.point).toEqual({ x: 230, y: 0 });
    const free = reduceWallTool(state, { type: 'move', world: { x: 233, y: 61 }, screen: { x: 233, y: 61 }, mods: { ...NO_MODS, alt: true } }, env);
    expect(free.state.hover).toMatchObject({ kind: 'none', point: { x: 233, y: 61 } });
  });

  it('snaps to the chain own points (alignment guide with the first point)', () => {
    const env = envOf(emptyProject().levels[0]!);
    const { state } = clicks(env, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }]);
    const r = reduceWallTool(state, { type: 'move', world: { x: 3, y: 296 }, screen: { x: 3, y: 296 }, mods: NO_MODS }, env);
    expect(r.state.hover).toMatchObject({ kind: 'align', point: { x: 0, y: 300 } });
  });

  it('a typed length closing on the first point finishes the loop', () => {
    const env = envOf(emptyProject().levels[0]!);
    let { state } = clicks(env, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]);
    state = reduceWallTool(state, { type: 'move', world: { x: 0, y: 100 }, screen: { x: 0, y: 100 }, mods: NO_MODS }, env).state;
    state = reduceWallTool(state, { type: 'digit', key: '3' }, env).state;
    const r = reduceWallTool(state, { type: 'numericSubmit', value: 300 }, env);
    expect(r.state.phase).toBe('idle');
    if (r.effects[0]?.type !== 'commit') throw new Error('commit expected');
    expect(r.effects[0].points).toHaveLength(5);
    expect(r.effects[0].points[4]).toEqual({ kind: 'free', x: 0, y: 0 });
  });

  it('switching the active level drops the chain', () => {
    const p = emptyProject();
    const env = envOf(p.levels[0]!);
    const { state } = clicks(env, [{ x: 0, y: 0 }, { x: 300, y: 0 }]);
    const other = { ...p.levels[0]!, id: 'other' };
    const r = reduceWallTool(state, { type: 'finish' }, envOf(other));
    expect(r).toEqual({ state: WALL_IDLE, effects: [] });
  });
});

describe('wall tool: in the editor', () => {
  it('clicks (0,0) (400,0) (400,300) (0,300) (0,0) draw a closed room in one history entry', () => {
    const { store, ctx, tool } = setup();
    for (const p of [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 0 }]) click(tool, ctx, p);
    const lvl = level(store);
    expect(Object.keys(lvl.walls)).toHaveLength(4);
    expect(Object.keys(lvl.nodes)).toHaveLength(4);
    expect(nodeDegrees(lvl)).toEqual([2, 2, 2, 2]); // the last wall ends on the first node
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().history.past[0]!.label).toBe('Tracer des murs');
    const rooms = deriveLevel(lvl).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(380 * 280, 6);
    // the tool stays active, ready for a new chain; Escape now is left to the global handler
    expect(store.getState().tool).toBe('wall');
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(false);
  });

  it('click (0,0), cursor to the right, typing 350 + Enter adds the point (350,0)', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, { x: 0, y: 0 });
    tool.onPointerMove!(at(123, 0), ctx);
    expect(tool.onKeyDown!(key('3'), ctx)).toBe(true);
    // the field opens under the cursor, lowered below the angle / thickness label (down-right of it)
    expect(store.getState().overlay.numericInput).toMatchObject({
      value: '3', screen: { x: 123, y: FIELD_DROP_PX }, kind: 'positive', label: 'Longueur',
    });
    // the preview direction is frozen while typing
    tool.onPointerMove!(at(0, 200), ctx);
    expect(applyNumericInput(store, ctx, '350')).toBe(true);
    expect(store.getState().overlay.numericInput).toBeNull();
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(true);
    const lvl = level(store);
    const pts = Object.values(lvl.nodes).map((n) => ({ x: n.x, y: n.y }));
    expect(pts).toHaveLength(2);
    expect(pts).toContainEqual({ x: 0, y: 0 });
    expect(pts).toContainEqual({ x: 350, y: 0 });
  });

  it('a chain ending on a wall axis splits it (T junction)', () => {
    const { store, ctx, tool } = setup();
    store.getState().execute('Room', addRectRoom(level(store).id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    click(tool, ctx, { x: 200, y: 0 }); // wall middle
    click(tool, ctx, { x: 200, y: 300 });
    tool.onDoubleClick!(at(200, 300), ctx);
    const lvl = level(store);
    expect(Object.keys(lvl.walls)).toHaveLength(7);
    expect(deriveLevel(lvl).rooms).toHaveLength(2);
    expect(store.getState().history.past).toHaveLength(2);
  });

  it('shows the snapped point while idle, ignores keys while idle and resets on deactivation', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerMove!(at(104, 57), ctx);
    const ov = store.getState().overlay;
    expect(isDrawGhost(ov.ghost) && ov.ghost.marker).toEqual({ at: { x: 100, y: 60 }, snap: 'grid' });
    expect(tool.onKeyDown!(key('3'), ctx)).toBe(false);
    click(tool, ctx, { x: 0, y: 0 });
    expect(tool.onKeyDown!(key('z', { metaKey: true, altKey: true, ctrlKey: true }), ctx)).toBe(false);
    tool.onDeactivate!(ctx);
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(false);
  });

  // both modifiers set: Mod is Cmd on macOS and Ctrl elsewhere, the tests run on either
  const MOD = { metaKey: true, ctrlKey: true };

  it('R32: Mod+Z removes the last point, then the chain; redo is ignored; the history is untouched', () => {
    const { store, ctx, tool } = setup();
    store.getState().execute('Room', addRectRoom(level(store).id, { x: 0, y: 500 }, { x: 300, y: 700 }, 20, 250));
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 300, y: 0 });
    click(tool, ctx, { x: 300, y: 200 });
    expect(tool.onKeyDown!(key('z', MOD), ctx)).toBe(true);
    expect(tool.onKeyDown!(key('z', { ...MOD, shiftKey: true }), ctx)).toBe(true);
    expect(tool.onKeyDown!(key('y', MOD), ctx)).toBe(true);
    // the preview now starts from (300, 0)
    const ov = store.getState().overlay;
    expect(ov.dynamicDims[0]?.a).toEqual({ x: 300, y: 0 });
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(true);
    let lvl = level(store);
    expect(Object.keys(lvl.walls)).toHaveLength(5); // the room + one wall
    expect(store.getState().history.past).toHaveLength(2);
    // a lone point: Mod+Z cancels the chain, the room stays
    click(tool, ctx, { x: 0, y: 900 });
    expect(tool.onKeyDown!(key('z', MOD), ctx)).toBe(true);
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(false); // idle again
    lvl = level(store);
    expect(Object.keys(lvl.walls)).toHaveLength(5);
    expect(store.getState().history.past).toHaveLength(2);
  });

  it('a pointer cancel keeps the chain', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 300, y: 0 });
    tool.onCancel!(ctx);
    click(tool, ctx, { x: 300, y: 200 });
    tool.onKeyDown!(key('Enter'), ctx);
    expect(Object.keys(level(store).walls)).toHaveLength(2);
  });

  it('the partition thickness is frozen by a click made with Ctrl / Cmd, and Cmd+Enter finishes', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 300, y: 0 }, { meta: true });
    click(tool, ctx, { x: 300, y: 200 }); // modifier released
    tool.onKeyDown!(key('Enter'), ctx);
    expect(Object.values(level(store).walls).map((w) => w.thickness)).toEqual([7, 7]);
    click(tool, ctx, { x: 0, y: 500 });
    click(tool, ctx, { x: 300, y: 500 });
    expect(tool.onKeyDown!(key('Enter', MOD), ctx)).toBe(true);
    expect(Object.values(level(store).walls).map((w) => w.thickness)).toEqual([7, 7, 7]);
    // no modifier anywhere: the default thickness
    click(tool, ctx, { x: 0, y: 900 });
    click(tool, ctx, { x: 300, y: 900 });
    tool.onKeyDown!(key('Enter'), ctx);
    expect(Object.values(level(store).walls).map((w) => w.thickness)).toEqual([7, 7, 7, 20]);
  });

  it('Alt held: a click within the tolerance of the first free point still closes the loop', () => {
    const { store, ctx, tool } = setup();
    for (const p of [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }]) click(tool, ctx, p, { alt: true });
    click(tool, ctx, { x: 4, y: -3 }, { alt: true });
    const lvl = level(store);
    expect(Object.keys(lvl.walls)).toHaveLength(3);
    expect(nodeDegrees(lvl)).toEqual([2, 2, 2]);
    expect(store.getState().tool).toBe('wall');
  });

  it('a click with a click count of 2 (double-click) adds nothing', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 300, y: 0 });
    click(tool, ctx, { x: 320, y: 0 }, { detail: 2 });
    tool.onDoubleClick!(at(320, 0), ctx);
    const lvl = level(store);
    expect(Object.values(lvl.nodes).map((n) => n.x).sort((a, b) => a - b)).toEqual([0, 300]);
  });

  it('a change of the active level drops the chain, its ghost and its numeric field', () => {
    const { store, ctx, tool } = setup();
    const p = store.getState().project!;
    const other = { ...p.levels[0]!, id: 'level-2', name: 'Étage' };
    store.setState({ project: { ...p, levels: [...p.levels, other] } });
    click(tool, ctx, { x: 0, y: 0 });
    tool.onPointerMove!(at(200, 0), ctx);
    tool.onKeyDown!(key('2'), ctx);
    expect(store.getState().overlay.numericInput).not.toBeNull();
    store.getState().setActiveLevel('level-2');
    expect(store.getState().overlay.ghost).toBeNull();
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    expect(store.getState().overlay.numericInput).toBeNull();
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(false);
  });
});
