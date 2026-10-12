import { describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@/core/commands/apply';
import { addBeam } from '@/core/commands/beams';
import { addCupboard } from '@/core/commands/cupboards';
import { addObject } from '@/core/commands/objects';
import { addSlope } from '@/core/commands/slopes';
import { addRectRoom, addWallChain } from '@/core/commands/walls';
import { computeChecks } from '@/core/checks/computeChecks';
import { cupboardFootprint } from '@/core/geometry/cupboards';
import { deriveLevel } from '@/core/geometry/derived';
import { createBeam, createCupboard, createObjectFromSize, createSlope } from '@/core/model/factory';
import type { Level, PlacedObject, Vec2 } from '@/core/model/types';
import { objectFromRef, placeObjectRecipe } from '@/editor/placeObject';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { volumeHandles } from '@/editor/handles';
import { createSelectTool } from '@/editor/tools/selectTool';
import type { PointerInfo, Tool, ToolContext } from '@/editor/tools/types';
import { findWall } from '../core/fixtures';
import { emptyProject } from '../core/helpers';

/** Room 400 x 300 on the axes, walls 20 cm: inner faces x = 10, x = 390, y = 10, y = 290. 1 px per cm. */
function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
  expect(store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250))).toBe(true);
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  return { store, levelId, ctx, tool: createSelectTool() };
}

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

function click(tool: Tool, ctx: ToolContext, p: Vec2) {
  tool.onPointerDown!(at(p.x, p.y), ctx);
  tool.onPointerUp!(at(p.x, p.y), ctx);
}

function drag(tool: Tool, ctx: ToolContext, a: Vec2, steps: Vec2[], mods: Partial<PointerInfo> = {}) {
  tool.onPointerDown!(at(a.x, a.y, mods), ctx);
  for (const s of steps) tool.onPointerMove!(at(s.x, s.y, mods), ctx);
  const end = steps[steps.length - 1] ?? a;
  tool.onPointerUp!(at(end.x, end.y, mods), ctx);
}

const key = (k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, defaultPrevented: false, target: null, ...mods }) as unknown as KeyboardEvent;

const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;
const entries = (store: EditorStore) => store.getState().history.past.length;
const exec = (store: EditorStore, recipe: Recipe) =>
  expect(store.getState().execute('Setup', recipe)).toBe(true);
const catalog = (store: EditorStore, id: string, x: number, y: number): PlacedObject => objectFromRef(store.getState().project!, `catalog:${id}`, { x, y })!;

describe('select tool: slopes', () => {
  function withSlope() {
    const env = setup();
    const s = createSlope({ x: 100, y: 100 }, { x: 300, y: 100 }, 'left', 60, 250, 150);
    exec(env.store, addSlope(env.levelId, s));
    return { ...env, id: s.id };
  }

  it('a click on the start line selects the slope and shows its three handles on its lines', () => {
    const { store, ctx, tool, id } = withSlope();
    click(tool, ctx, { x: 200, y: 102 });
    expect(store.getState().selection).toEqual([{ kind: 'slope', id }]);
    const handles = volumeHandles(store.getState().selection, level(store));
    expect(handles.map((h) => [h.role, h.at])).toEqual([
      ['a', { x: 100, y: 100 }],
      ['b', { x: 300, y: 100 }],
      ['depth', { x: 200, y: 160 }],
    ]);
  });

  it('the end handles of the start line move it (snapped), the end line handle sets the depth; one entry each', () => {
    const { store, ctx, tool, id } = withSlope();
    click(tool, ctx, { x: 200, y: 100 });
    const n = entries(store);
    drag(tool, ctx, { x: 101, y: 99 }, [{ x: 90, y: 110 }, { x: 81, y: 119 }]);
    expect(level(store).slopes[id]).toMatchObject({ a: { x: 80, y: 120 }, b: { x: 300, y: 100 }, depth: 60 });
    expect(entries(store)).toBe(n + 1);
    expect(store.getState().history.past.at(-1)!.label).toBe('Modifier la pente');
    // depth handle, now at the middle of the new end line; 25 cm further down-slope
    const depthHandle = volumeHandles(store.getState().selection, level(store)).find((h) => h.role === 'depth')!;
    drag(tool, ctx, depthHandle.at, [{ x: depthHandle.at.x + 5, y: depthHandle.at.y + 10 }]);
    const s = level(store).slopes[id]!;
    expect(s.depth).toBeGreaterThan(60);
    expect(entries(store)).toBe(n + 2);
  });

  it('the depth handle: depth = old depth + the move across the start line, at least 1 cm', () => {
    const { store, ctx, tool, id } = withSlope();
    click(tool, ctx, { x: 200, y: 100 });
    drag(tool, ctx, { x: 200, y: 160 }, [{ x: 210, y: 185.4 }]);
    expect(level(store).slopes[id]!.depth).toBe(85);
    drag(tool, ctx, { x: 200, y: 185 }, [{ x: 200, y: 20 }]);
    expect(level(store).slopes[id]!.depth).toBe(1);
  });

  it('dragging the start line moves the whole slope by grid steps (free with Alt); undo restores it', () => {
    const { store, ctx, tool, id } = withSlope();
    click(tool, ctx, { x: 200, y: 100 });
    const n = entries(store);
    drag(tool, ctx, { x: 200, y: 100 }, [{ x: 213, y: 127 }]);
    expect(level(store).slopes[id]).toMatchObject({ a: { x: 110, y: 130 }, b: { x: 310, y: 130 }, depth: 60 });
    expect(entries(store)).toBe(n + 1);
    store.getState().undo();
    expect(level(store).slopes[id]).toMatchObject({ a: { x: 100, y: 100 } });
    drag(tool, ctx, { x: 200, y: 100 }, [{ x: 213, y: 127 }], { alt: true });
    expect(level(store).slopes[id]).toMatchObject({ a: { x: 113, y: 127 } });
  });
});

describe('select tool: beams', () => {
  it('an end handle snaps to a wall node; dragging the body moves the beam', () => {
    const { store, levelId, ctx, tool } = setup();
    const b = createBeam({ x: 100, y: 200 }, { x: 300, y: 200 });
    exec(store, addBeam(levelId, b));
    click(tool, ctx, { x: 200, y: 203 });
    expect(store.getState().selection).toEqual([{ kind: 'beam', id: b.id }]);
    const n = entries(store);
    drag(tool, ctx, { x: 300, y: 200 }, [{ x: 350, y: 250 }, { x: 397, y: 297 }]);
    expect(level(store).beams[b.id]).toMatchObject({ a: { x: 100, y: 200 }, b: { x: 400, y: 300 } });
    expect(store.getState().history.past.at(-1)!.label).toBe('Modifier la poutre');
    drag(tool, ctx, { x: 250, y: 250 }, [{ x: 258, y: 230 }]); // on the new axis; grid steps
    expect(level(store).beams[b.id]).toMatchObject({ a: { x: 110, y: 180 }, b: { x: 410, y: 280 } });
    expect(entries(store)).toBe(n + 2);
  });
});

describe('select tool: cupboards', () => {
  function withCupboard() {
    const env = setup();
    const wallId = findWall(level(env.store), 0, 0, 400, 0);
    // top wall (0, 0) -> (400, 0), inside = left: footprint x 140..260, y 10..70
    const c = createCupboard(wallId, 200, 'left');
    exec(env.store, addCupboard(env.levelId, c));
    return { ...env, id: c.id, wallId };
  }

  it('slides along its wall, kept on the free stretch of its face; one entry; undo / redo', () => {
    const { store, ctx, tool, id, wallId } = withCupboard();
    click(tool, ctx, { x: 200, y: 40 });
    expect(store.getState().selection).toEqual([{ kind: 'cupboard', id }]);
    const n = entries(store);
    drag(tool, ctx, { x: 210, y: 40 }, [{ x: 160, y: 45 }, { x: 110.4, y: 45 }]);
    expect(level(store).cupboards[id]).toMatchObject({ wallId, offset: 100, side: 'left' });
    expect(entries(store)).toBe(n + 1);
    expect(store.getState().history.past.at(-1)!.label).toBe('Déplacer le placard');
    // pushed against the side wall face (x = 10): offset 10 + 60 (the cursor is not over that wall)
    drag(tool, ctx, { x: 100, y: 40 }, [{ x: 20, y: 40 }]);
    expect(level(store).cupboards[id]!.offset).toBeCloseTo(70, 6);
    store.getState().undo();
    expect(level(store).cupboards[id]!.offset).toBe(100);
    store.getState().undo();
    expect(level(store).cupboards[id]!.offset).toBe(200);
    store.getState().redo();
    expect(level(store).cupboards[id]!.offset).toBe(100);
  });

  it('moves onto another hovered wall, against the face on the cursor side', () => {
    const { store, ctx, tool, id } = withCupboard();
    click(tool, ctx, { x: 200, y: 40 });
    drag(tool, ctx, { x: 200, y: 40 }, [{ x: 395, y: 150 }]);
    const right = findWall(level(store), 400, 0, 400, 300);
    const c = level(store).cupboards[id]!;
    expect(c.wallId).toBe(right);
    // inside the room = left of (400, 0) -> (400, 300) when it was drawn that way
    const w = level(store).walls[right]!;
    const startsAtTop = level(store).nodes[w.startNodeId]!.y === 0;
    expect(c.side).toBe(startsAtTop ? 'left' : 'right');
    expect(c.offset).toBe(150);
  });
});

describe('pose at the drop (spec 5.3)', () => {
  const tvUnit = (store: EditorStore) => {
    const unit = catalog(store, 'tv-unit', 200, 150);
    expect(unit.pose).toBe('floor');
    expect(unit.height).toBe(50);
    exec(store, addObject(level(store).id, unit));
    return unit;
  };

  it('catalog: a TV dropped on a TV unit lands on it (elevation 50), elsewhere on the floor', () => {
    const { store, levelId } = setup();
    tvUnit(store);
    const tv = catalog(store, 'tv', 210, 150);
    exec(store, placeObjectRecipe(levelId, tv, level(store), 1, store.getState().project!.customObjects));
    expect(level(store).objects[tv.id]!.elevation).toBe(50);
    const other = catalog(store, 'tv', 100, 250);
    exec(store, placeObjectRecipe(levelId, other, level(store), 1));
    expect(level(store).objects[other.id]!.elevation).toBe(0);
  });

  it('catalog: a wall TV dropped near a wall is set against it, beyond the plain snap tolerance', () => {
    const { store, levelId } = setup();
    // depth 8: back edge at y = 21, 11 cm from the face y = 10 (plain snap: 8 cm at 1 px / cm)
    const tv = catalog(store, 'tv-wall', 200, 25);
    exec(store, placeObjectRecipe(levelId, tv, level(store), 1));
    expect(level(store).objects[tv.id]).toMatchObject({ y: 14, rotation: 0, elevation: 110 });
    // a floor object at the same distance is not pulled
    const box = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 200, 25, { width: 110, depth: 8, height: 65 }, 'X', '#999');
    exec(store, placeObjectRecipe(levelId, box, level(store), 1));
    expect(level(store).objects[box.id]).toMatchObject({ y: 25 });
  });

  it('select tool: a TV dragged onto a TV unit takes its top, dragged off goes back to 0; one entry per drag', () => {
    const { store, ctx, tool } = setup();
    tvUnit(store);
    const tv = catalog(store, 'tv', 100, 250);
    exec(store, addObject(level(store).id, tv));
    const n = entries(store);
    drag(tool, ctx, { x: 100, y: 250 }, [{ x: 150, y: 200 }, { x: 205, y: 152 }]);
    expect(level(store).objects[tv.id]).toMatchObject({ x: 205, y: 152, elevation: 50 });
    expect(entries(store)).toBe(n + 1);
    drag(tool, ctx, { x: 205, y: 152 }, [{ x: 100, y: 250 }]);
    expect(level(store).objects[tv.id]).toMatchObject({ x: 100, y: 250, elevation: 0 });
    expect(entries(store)).toBe(n + 2);
    store.getState().undo();
    expect(level(store).objects[tv.id]).toMatchObject({ x: 205, elevation: 50 });
  });

  it('select tool: a wall TV released near a wall is set against it (not with Alt)', () => {
    const { store, ctx, tool } = setup();
    const tv = catalog(store, 'tv-wall', 200, 150);
    exec(store, addObject(level(store).id, tv));
    const n = entries(store);
    drag(tool, ctx, { x: 200, y: 150 }, [{ x: 200, y: 60 }, { x: 200, y: 25 }]);
    expect(level(store).objects[tv.id]).toMatchObject({ y: 14, rotation: 0, elevation: 110 });
    expect(entries(store)).toBe(n + 1);
    drag(tool, ctx, { x: 200, y: 14 }, [{ x: 200, y: 60 }, { x: 200, y: 25 }], { alt: true });
    expect(level(store).objects[tv.id]).toMatchObject({ y: 25 });
  });

  it('a bedside lamp dropped on a 90 cm fixed cupboard is lifted to 90 and raises no alert (ruling V2-R37)', () => {
    const { store, levelId } = setup();
    const wallId = findWall(level(store), 0, 0, 400, 0);
    let c = createCupboard(wallId, 200, 'left', { heightMode: 'fixed', height: 90, doorType: 'sliding' });
    if (cupboardFootprint(level(store), c).some((q) => q.y < 0)) c = { ...c, side: 'right' }; // the room side
    exec(store, addCupboard(levelId, c));
    const ring = cupboardFootprint(level(store), c);
    const center = { x: ring.reduce((s, q) => s + q.x, 0) / 4, y: ring.reduce((s, q) => s + q.y, 0) / 4 };
    const lamp = catalog(store, 'bedside-lamp', center.x, center.y);
    exec(store, placeObjectRecipe(levelId, lamp, level(store), 1));
    expect(level(store).objects[lamp.id]!.elevation).toBe(90);
    const lv = level(store);
    expect(computeChecks(lv, deriveLevel(lv), {})).toEqual([]);
  });

  it('several objects moved together: no wall snap, but each onTop object is posed', () => {
    const { store, ctx, tool } = setup();
    const unit = tvUnit(store);
    const tv = catalog(store, 'tv', 210, 150);
    exec(store, placeObjectRecipe(level(store).id, tv, level(store), 1));
    store.getState().setSelection([
      { kind: 'object', id: unit.id },
      { kind: 'object', id: tv.id },
    ]);
    drag(tool, ctx, { x: 200, y: 150 }, [{ x: 200, y: 200 }]);
    expect(level(store).objects[tv.id]).toMatchObject({ y: 200, elevation: 50 });
  });
});

describe('fix round 1', () => {
  const tvOnUnit = () => {
    const env = setup();
    const unit = catalog(env.store, 'tv-unit', 200, 150);
    exec(env.store, addObject(env.levelId, unit));
    return env;
  };

  it('a typed distance during a drag poses the object too (TV on its unit: elevation 50)', () => {
    const { store, ctx, tool, levelId } = tvOnUnit();
    const tv = catalog(store, 'tv', 100, 250);
    exec(store, addObject(levelId, tv));
    const n = entries(store);
    tool.onPointerDown!(at(100, 250), ctx);
    tool.onPointerMove!(at(150, 200), ctx);
    tool.onPointerMove!(at(205, 152), ctx);
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true);
    expect(tool.onKeyDown!(key('1'), ctx)).toBe(true);
    expect(store.getState().overlay.numericInput).not.toBeNull();
    // any side typed 140 keeps the TV over the unit (x 120..280, y 127.5..172.5)
    tool.onNumericSubmit!(140, ctx);
    const o = level(store).objects[tv.id]!;
    expect(o.x).toBeGreaterThan(120);
    expect(o.x).toBeLessThan(280);
    expect(o.elevation).toBe(50);
    expect(entries(store)).toBe(n + 1);
  });

  it('a typed distance without drag (Tab on the selected object) poses it too', () => {
    const { store, ctx, tool, levelId } = tvOnUnit();
    const tv = catalog(store, 'tv', 205, 152);
    exec(store, addObject(levelId, tv)); // added at elevation 0, not posed
    expect(level(store).objects[tv.id]!.elevation).toBe(0);
    store.getState().setSelection([{ kind: 'object', id: tv.id }]);
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true);
    expect(tool.onKeyDown!(key('1'), ctx)).toBe(true);
    tool.onNumericSubmit!(140, ctx);
    expect(level(store).objects[tv.id]!.elevation).toBe(50);
  });

  it('a cupboard released on a refused position goes back where it was, nothing in the history', () => {
    const { store, levelId, ctx, tool } = setup();
    // a lone wall of 80, too short for the cupboard
    exec(store, addWallChain(levelId, [{ kind: 'free', x: 500, y: 100 }, { kind: 'free', x: 580, y: 100 }], 20, 250));
    const c = createCupboard(findWall(level(store), 0, 0, 400, 0), 200, 'left');
    exec(store, addCupboard(levelId, c));
    click(tool, ctx, { x: 200, y: 40 });
    const n = entries(store);
    tool.onPointerDown!(at(200, 40), ctx);
    tool.onPointerMove!(at(150, 40), ctx); // valid: offset 150
    expect(level(store).cupboards[c.id]!.offset).toBe(150);
    tool.onPointerMove!(at(540, 98), ctx); // over the short wall: refused, red
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'volume-cupboard', valid: false });
    tool.onPointerUp!(at(540, 98), ctx);
    expect(level(store).cupboards[c.id]).toMatchObject({ offset: 200 });
    expect(entries(store)).toBe(n);
  });

  it('on a wall drawn the other way, the cupboard keeps the grabbed spot under the cursor', () => {
    const { store, levelId, ctx, tool } = setup();
    const lv = level(store);
    const bottom = findWall(lv, 0, 300, 400, 300);
    // precondition: the bottom wall runs from x = 400 to x = 0 (opposite to the top wall)
    expect(lv.nodes[lv.walls[bottom]!.startNodeId]!.x).toBe(400);
    const c = createCupboard(findWall(lv, 0, 0, 400, 0), 200, 'left');
    exec(store, addCupboard(levelId, c));
    click(tool, ctx, { x: 200, y: 40 });
    // grabbed 30 cm right of its center, released over the bottom wall at x = 300
    drag(tool, ctx, { x: 230, y: 40 }, [{ x: 260, y: 200 }, { x: 300, y: 295 }]);
    const moved = level(store).cupboards[c.id]!;
    expect(moved.wallId).toBe(bottom);
    const fp = cupboardFootprint(level(store), moved);
    const centerX = (fp[0]!.x + fp[1]!.x) / 2;
    expect(centerX).toBeCloseTo(270, 6);
  });

  it('Shift + press on a slope handle edits the selection, the slope does not move', () => {
    const { store, levelId, ctx, tool } = setup();
    const s = createSlope({ x: 100, y: 100 }, { x: 300, y: 100 }, 'left', 60, 250, 150);
    exec(store, addSlope(levelId, s));
    click(tool, ctx, { x: 200, y: 100 });
    drag(tool, ctx, { x: 100, y: 100 }, [{ x: 80, y: 120 }], { shift: true });
    expect(level(store).slopes[s.id]!.a).toEqual({ x: 100, y: 100 });
    expect(store.getState().selection).toEqual([]);
  });
});
