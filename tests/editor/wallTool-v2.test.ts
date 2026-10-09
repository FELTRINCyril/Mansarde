import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRectRoomInterior } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import type { Level, Vec2 } from '@/core/model/types';
import { createEditorStore, flipWallReference, type EditorStore } from '@/editor/store';
import { DYN_DIM_GAP_PX } from '@/editor/tools/drawing';
import { TOOLS } from '@/editor/tools/registry';
import type { PointerInfo, Tool, ToolContext } from '@/editor/tools/types';
import { pendingChain, reduceWallTool, WALL_IDLE, wallToolOverlay, type Mods, type WallToolEnv, type WallToolState } from '@/editor/tools/wallMachine';
import { createWallTool } from '@/editor/tools/wallTool';
import { emptyProject } from '../core/helpers';

/*
 * V2 (spec 6): reference line of the wall tool. 'left' = the clicked line is the left face of the
 * walls in the model frame (+perp(direction), the side a clockwise loop on screen encloses): the
 * walls stand on its other side. 'right' the opposite; Space flips (axis -> left).
 */

const NO_MODS: Mods = { shift: false, alt: false, meta: false };

const original = TOOLS.wall;
afterEach(() => {
  TOOLS.wall = original;
});

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
const at = (x: number, y: number): PointerInfo => ({ world: { x, y }, screen: { x, y }, button: 0, shift: false, alt: false, meta: false, detail: 1 });

function click(tool: Tool, ctx: ToolContext, p: Vec2) {
  tool.onPointerMove!(at(p.x, p.y), ctx);
  tool.onPointerDown!(at(p.x, p.y), ctx);
  tool.onPointerUp?.(at(p.x, p.y), ctx);
}

/** Clockwise on screen (y down): right, down, left, back up to the start. */
const CLOCKWISE_400: Vec2[] = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }, { x: 0, y: 0 }];

function drawSquare(reference: 'axis' | 'left' | 'right') {
  const { store, ctx, tool } = setup();
  store.getState().setWallReference(reference);
  for (const p of CLOCKWISE_400) click(tool, ctx, p);
  const rooms = deriveLevel(level(store)).rooms;
  return { store, rooms };
}

function bbox(ring: Vec2[]) {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

describe('wall tool v2: reference line', () => {
  it('the store remembers the reference, axis by default, not reset by opening a project', () => {
    const store = createEditorStore();
    expect(store.getState().wallReference).toBe('axis');
    store.getState().setWallReference('right');
    store.getState().openProject(emptyProject());
    store.getState().closeProject();
    expect(store.getState().wallReference).toBe('right');
  });

  it("'left' on a clockwise closed square of 400: interior room 400 x 400, walls outside", () => {
    const { store, rooms } = drawSquare('left');
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(160000, 6);
    expect(bbox(rooms[0]!.ring)).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 400 });
    expect(Object.keys(level(store).walls)).toHaveLength(4);
    expect(Object.keys(level(store).nodes)).toHaveLength(4);
    expect(bbox(Object.values(level(store).nodes))).toEqual({ minX: -10, minY: -10, maxX: 410, maxY: 410 });
  });

  it("'right' on the same square: walls inside (360 x 360); 'axis': 380 x 380 as in V1", () => {
    expect(drawSquare('right').rooms[0]!.area).toBeCloseTo(360 * 360, 6);
    expect(drawSquare('axis').rooms[0]!.area).toBeCloseTo(380 * 380, 6);
  });

  it('Space flips left and right; from axis it goes to left', () => {
    expect(flipWallReference('axis')).toBe('left');
    expect(flipWallReference('left')).toBe('right');
    expect(flipWallReference('right')).toBe('left');
    const { store, ctx, tool } = setup();
    tool.onSpaceTap!(ctx);
    expect(store.getState().wallReference).toBe('left');
    tool.onSpaceTap!(ctx);
    expect(store.getState().wallReference).toBe('right');
  });

  it('Space while drawing flips the side of the chain in progress (the preview follows at once)', () => {
    const { store, ctx, tool } = setup();
    store.getState().setWallReference('right');
    click(tool, ctx, { x: 0, y: 0 });
    tool.onPointerMove!(at(300, 0), ctx);
    const ghostBefore = store.getState().overlay.ghost as { paths: { points: Vec2[] }[] };
    expect(ghostBefore.paths[0]!.points).toEqual([{ x: 0, y: 10 }, { x: 300, y: 10 }]);
    tool.onSpaceTap!(ctx);
    const ghost = store.getState().overlay.ghost as { paths: { points: Vec2[] }[] };
    expect(ghost.paths[0]!.points).toEqual([{ x: 0, y: -10 }, { x: 300, y: -10 }]);
    for (const p of [{ x: 300, y: 0 }]) click(tool, ctx, p);
    tool.onKeyDown!({ key: 'Enter', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent, ctx);
    const nodes = Object.values(level(store).nodes);
    expect(nodes.map((n) => n.y)).toEqual([-10, -10]);
  });
});

describe('wall tool v2: state machine', () => {
  const lvl = emptyProject().levels[0]!; // one level: a state is dropped when the level id changes
  const env = (reference: 'axis' | 'left' | 'right'): WallToolEnv => ({
    level: lvl, pxPerCm: 1, gridStep: 10, thickness: 20, partitionThickness: 7, height: 250, reference,
  });

  function clicks(e: WallToolEnv, points: Vec2[]) {
    let state: WallToolState = WALL_IDLE;
    const effects = [];
    for (const p of points) {
      let r = reduceWallTool(state, { type: 'move', world: p, screen: p, mods: NO_MODS }, e);
      r = reduceWallTool(r.state, { type: 'click', world: p, screen: p, mods: NO_MODS }, e);
      state = r.state;
      effects.push(...r.effects);
    }
    return { state, effects };
  }

  it('an open chain is offset by thickness / 2 before addWallChain (free points, mitered corner)', () => {
    const { state } = clicks(env('left'), [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }]);
    const r = reduceWallTool(state, { type: 'finish' }, env('left'));
    expect(r.effects).toEqual([
      {
        type: 'commit',
        levelId: env('left').level.id,
        points: [
          { kind: 'free', x: 0, y: -10 },
          { kind: 'free', x: 310, y: -10 },
          { kind: 'free', x: 310, y: 200 },
        ],
        thickness: 20,
        height: 250,
      },
    ]);
  });

  it('axis: the clicked points are committed as they are', () => {
    const { state } = clicks(env('axis'), [{ x: 0, y: 0 }, { x: 300, y: 0 }]);
    const r = reduceWallTool(state, { type: 'finish' }, env('axis'));
    expect(r.effects[0]).toMatchObject({ points: [{ kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 300, y: 0 }] });
  });

  it('a closed chain with a sharp corner may give more points than clicked (bevel), still closed on its first point', () => {
    const tri: Vec2[] = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 40 }, { x: 0, y: 0 }];
    const { effects } = clicks(env('right'), tri);
    expect(effects).toHaveLength(1);
    const fx = effects[0]!;
    if (fx.type !== 'commit') throw new Error('commit expected');
    expect(fx.points.length).toBeGreaterThan(tri.length);
    expect(fx.points[fx.points.length - 1]).toEqual(fx.points[0]);
  });

  it('the pending chain (red preview check) uses the offset points', () => {
    let state: WallToolState = clicks(env('right'), [{ x: 0, y: 0 }]).state;
    state = reduceWallTool(state, { type: 'move', world: { x: 200, y: 0 }, screen: { x: 200, y: 0 }, mods: NO_MODS }, env('right')).state;
    expect(pendingChain(state, env('right'))?.points).toEqual([{ kind: 'free', x: 0, y: 10 }, { kind: 'free', x: 200, y: 10 }]);
  });

  it('preview: the offset wall without its axis, the clicked line dashed, the length beyond the wall', () => {
    let state: WallToolState = clicks(env('left'), [{ x: 0, y: 0 }]).state;
    state = reduceWallTool(state, { type: 'move', world: { x: 200, y: 0 }, screen: { x: 200, y: 0 }, mods: NO_MODS }, env('left')).state;
    const ov = wallToolOverlay(state, env('left'));
    expect(ov.ghost!.paths).toEqual([
      { points: [{ x: 0, y: -10 }, { x: 200, y: -10 }], closed: false, thickness: 20, axis: false },
      { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], closed: false, thickness: 0 },
    ]);
    expect(ov.dynamicDims).toEqual([{ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, offset: -(20 + DYN_DIM_GAP_PX), value: 200, kind: 'dynamic' }]);
    expect(ov.ghost!.label!.lines).toEqual(['0°', 'Mur 20 cm', 'Face gauche']);
    // axis: unchanged V1 preview
    const axisOv = wallToolOverlay(state, env('axis'));
    expect(axisOv.ghost!.paths).toEqual([{ points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], closed: false, thickness: 20 }]);
    expect(axisOv.ghost!.label!.lines).toEqual(['0°', 'Mur 20 cm']);
  });
});

describe('wall tool v2: face-mode ends stay connected (V2-R21)', () => {
  const enter = { key: 'Enter', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
  const degrees = (lvl: Level): Map<string, number> => {
    const m = new Map<string, number>(Object.keys(lvl.nodes).map((id) => [id, 0]));
    for (const w of Object.values(lvl.walls)) {
      m.set(w.startNodeId, m.get(w.startNodeId)! + 1);
      m.set(w.endNodeId, m.get(w.endNodeId)! + 1);
    }
    return m;
  };
  const nodeAt = (lvl: Level, x: number, y: number) => Object.values(lvl.nodes).find((n) => Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6);

  /** Room A inside 0..400 x 0..300, wall axes on -10 / 410 and -10 / 310; then a face-mode wall. */
  function drawFrom(reference: 'left' | 'right', from: Vec2, to: Vec2) {
    const { store, ctx, tool } = setup();
    expect(store.getState().execute('A', addRectRoomInterior(level(store).id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250))).toBe(true);
    store.getState().setWallReference(reference);
    click(tool, ctx, from);
    click(tool, ctx, to);
    tool.onKeyDown!(enter, ctx);
    const lvl = level(store);
    const deg = degrees(lvl);
    return { store, lvl, deg, ends: [...deg.values()].filter((d) => d === 1).length };
  }

  it("from A's corner node (left face): the corner gets a third wall, nothing floats", () => {
    const { lvl, deg, ends } = drawFrom('left', { x: 410, y: -10 }, { x: 710, y: -10 });
    const corner = nodeAt(lvl, 410, -10)!;
    expect(deg.get(corner.id)).toBe(3);
    expect(ends).toBe(1); // only the free far end of the open chain
    expect(nodeAt(lvl, 710, -20)).toBeDefined(); // the far end keeps the plain offset
    expect(deriveLevel(lvl).rooms.map((r) => Math.round(r.area))).toEqual([120000]);
  });

  it("from A's corner node (right face): A's side wall is split where the offset line crosses it", () => {
    const { lvl, deg, ends } = drawFrom('right', { x: 410, y: -10 }, { x: 710, y: -10 });
    const split = nodeAt(lvl, 410, 0)!;
    expect(split).toBeDefined();
    expect(deg.get(split.id)).toBe(3);
    expect(ends).toBe(1);
  });

  it("from the middle of A's wall: T junction on A's wall axis at the offset line", () => {
    const { lvl, deg, ends } = drawFrom('left', { x: 410, y: 150 }, { x: 710, y: 150 });
    const t = nodeAt(lvl, 410, 140)!;
    expect(t).toBeDefined();
    expect(deg.get(t.id)).toBe(3);
    expect(ends).toBe(1);
    expect(deriveLevel(lvl).rooms.map((r) => Math.round(r.area))).toEqual([120000]);
  });

  it('a chain ending on an existing wall is joined at that end too', () => {
    const { lvl, deg, ends } = drawFrom('left', { x: 710, y: 150 }, { x: 410, y: 150 });
    // travelling left, +perp points up: with the left face clicked the axis is 10 cm below, y = 160
    const t = nodeAt(lvl, 410, 160)!;
    expect(t).toBeDefined();
    expect(deg.get(t.id)).toBe(3);
    expect(ends).toBe(1);
  });
});
