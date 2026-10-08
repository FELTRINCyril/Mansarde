import { describe, expect, it, vi } from 'vitest';
import { addDimension } from '@/core/commands/dimensions';
import { addObject } from '@/core/commands/objects';
import { addOpening } from '@/core/commands/openings';
import { addRectRoom, addWallChain } from '@/core/commands/walls';
import { createObjectFromSize, createOpening } from '@/core/model/factory';
import type { Id, Level, PlacedObject, Vec2 } from '@/core/model/types';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { objectHandles } from '@/editor/handles';
import { createSelectTool } from '@/editor/tools/selectTool';
import type { PointerInfo, Tool, ToolContext } from '@/editor/tools/types';
import { emptyProject } from '../core/helpers';

const box = (x: number, y: number, w = 50, d = 40): PlacedObject =>
  createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, x, y, { width: w, depth: d, height: 50 }, 'Caisse', '#ccc');

/** 1 px per cm, screen = world: distances in the tests are both. */
function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  const levelId = p.levels[0]!.id;
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

function click(tool: Tool, ctx: ToolContext, p: Vec2, mods: Partial<PointerInfo> = {}) {
  tool.onPointerDown!(at(p.x, p.y, mods), ctx);
  tool.onPointerUp!(at(p.x, p.y, mods), ctx);
}

/** Press at a, move through the steps (the last one is the release point), release. */
function drag(tool: Tool, ctx: ToolContext, a: Vec2, steps: Vec2[], mods: Partial<PointerInfo> = {}) {
  tool.onPointerDown!(at(a.x, a.y, mods), ctx);
  for (const s of steps) tool.onPointerMove!(at(s.x, s.y, mods), ctx);
  const end = steps[steps.length - 1] ?? a;
  tool.onPointerUp!(at(end.x, end.y, mods), ctx);
}

const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;
const add = (store: EditorStore, o: PlacedObject) => expect(store.getState().execute('Add', addObject(level(store).id, o))).toBe(true);
const room = (store: EditorStore) =>
  expect(store.getState().execute('Room', addRectRoom(level(store).id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250))).toBe(true);
const objectOf = (store: EditorStore, id: Id) => level(store).objects[id]!;
const entries = (store: EditorStore) => store.getState().history.past.length;

describe('select tool: selection', () => {
  it('a click selects an object, a click in the void clears, Shift toggles', () => {
    const { store, ctx, tool } = setup();
    const a = box(100, 100);
    const b = box(300, 100);
    add(store, a);
    add(store, b);
    click(tool, ctx, { x: 100, y: 100 });
    expect(store.getState().selection).toEqual([{ kind: 'object', id: a.id }]);
    click(tool, ctx, { x: 300, y: 100 }, { shift: true });
    expect(store.getState().selection).toHaveLength(2);
    click(tool, ctx, { x: 100, y: 100 }, { shift: true });
    expect(store.getState().selection).toEqual([{ kind: 'object', id: b.id }]);
    click(tool, ctx, { x: 600, y: 600 });
    expect(store.getState().selection).toEqual([]);
  });

  it('a click in a room selects the room', () => {
    const { store, ctx, tool } = setup();
    room(store);
    click(tool, ctx, { x: 200, y: 150 });
    expect(store.getState().selection).toEqual([{ kind: 'room', id: 'room-0' }]);
  });

  it('a rectangle selects the objects fully inside it, Shift adds to the selection', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const a = box(100, 100);
    const b = box(200, 100);
    const c = box(300, 200);
    for (const o of [a, b, c]) add(store, o);
    // starts inside the room: still a rectangle, not a room drag
    drag(tool, ctx, { x: 60, y: 60 }, [{ x: 150, y: 100 }, { x: 240, y: 140 }]);
    expect(store.getState().overlay.marquee).toBeNull();
    expect(store.getState().selection).toEqual([
      { kind: 'object', id: a.id },
      { kind: 'object', id: b.id },
    ]);
    drag(tool, ctx, { x: 260, y: 170 }, [{ x: 340, y: 230 }], { shift: true });
    expect(store.getState().selection.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  it('shows the rectangle in the overlay while dragging', () => {
    const { store, ctx, tool } = setup();
    tool.onPointerDown!(at(10, 10), ctx);
    tool.onPointerMove!(at(50, 40), ctx);
    expect(store.getState().overlay.marquee).toEqual({ a: { x: 10, y: 10 }, b: { x: 50, y: 40 } });
    tool.onPointerUp!(at(50, 40), ctx);
    expect(store.getState().overlay.marquee).toBeNull();
  });
});

describe('select tool: moving objects', () => {
  it('drags an object by the total delta in one history entry, with clearances during the drag', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const o = box(200, 150);
    add(store, o);
    const before = entries(store);
    tool.onPointerDown!(at(200, 150), ctx);
    tool.onPointerMove!(at(210, 150), ctx);
    tool.onPointerMove!(at(230, 160), ctx);
    expect(objectOf(store, o.id)).toMatchObject({ x: 230, y: 160 });
    const dims = store.getState().overlay.dynamicDims;
    expect(dims).toHaveLength(4);
    // inner faces at x = 10, 390 and y = 10, 290; sides at x = 205, 255 and y = 140, 180
    expect(dims.map((d) => Math.round(d.value)).sort((x, y) => x - y)).toEqual([110, 130, 135, 195]);
    tool.onPointerUp!(at(230, 160), ctx);
    expect(entries(store)).toBe(before + 1);
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    store.getState().undo();
    expect(objectOf(store, o.id)).toMatchObject({ x: 200, y: 150 });
  });

  it('a press without movement does not create a history entry', () => {
    const { store, ctx, tool } = setup();
    const o = box(100, 100);
    add(store, o);
    const before = entries(store);
    tool.onPointerDown!(at(100, 100), ctx);
    tool.onPointerMove!(at(101, 101), ctx); // below the drag threshold
    tool.onPointerUp!(at(101, 101), ctx);
    expect(entries(store)).toBe(before);
    expect(store.getState().gesture).toBeNull();
  });

  it('pulls a single object against a wall face, Alt disables it', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const o = box(200, 150, 50, 40);
    add(store, o);
    // back edge 5 cm from the inner face of the top wall (y = 10): snapped flush, y = 30
    drag(tool, ctx, { x: 200, y: 150 }, [{ x: 200, y: 100 }, { x: 200, y: 35 }]);
    expect(objectOf(store, o.id)).toMatchObject({ x: 200, y: 30, rotation: 0 });
    store.getState().undo();
    drag(tool, ctx, { x: 200, y: 150 }, [{ x: 200, y: 100 }, { x: 200, y: 35 }], { alt: true });
    expect(objectOf(store, o.id)).toMatchObject({ x: 200, y: 35 });
  });

  it('moves the whole selection when dragging one of its objects', () => {
    const { store, ctx, tool } = setup();
    const a = box(100, 100);
    const b = box(300, 100);
    add(store, a);
    add(store, b);
    store.getState().setSelection([
      { kind: 'object', id: a.id },
      { kind: 'object', id: b.id },
    ]);
    drag(tool, ctx, { x: 100, y: 100 }, [{ x: 110, y: 100 }, { x: 125, y: 107 }]);
    expect(objectOf(store, a.id)).toMatchObject({ x: 125, y: 107 });
    expect(objectOf(store, b.id)).toMatchObject({ x: 325, y: 107 });
    expect(store.getState().selection).toHaveLength(2);
  });

  it('Escape cancels the drag and restores the object', () => {
    const { store, ctx, tool } = setup();
    const o = box(100, 100);
    add(store, o);
    const before = entries(store);
    tool.onPointerDown!(at(100, 100), ctx);
    tool.onPointerMove!(at(150, 100), ctx);
    expect(tool.onKeyDown!({ key: 'Escape' } as KeyboardEvent, ctx)).toBe(true);
    expect(objectOf(store, o.id).x).toBe(100);
    tool.onPointerMove!(at(170, 100), ctx);
    tool.onPointerUp!(at(170, 100), ctx);
    expect(objectOf(store, o.id).x).toBe(100);
    expect(entries(store)).toBe(before);
  });
});

describe('select tool: walls, nodes, openings, dimensions', () => {
  it('drags a wall by a grid-rounded delta', () => {
    const { store, ctx, tool } = setup();
    room(store);
    // top wall axis y = 0, inside the wall at (200, 5)
    drag(tool, ctx, { x: 200, y: 5 }, [{ x: 200, y: -10 }, { x: 203, y: -26 }]);
    const ys = Object.values(level(store).nodes).map((n) => n.y).sort((a, b) => a - b);
    expect(ys).toEqual([-30, -30, 300, 300]);
  });

  it('drags a node with snapping and merges it into the node it is dropped on', () => {
    const { store, ctx, tool } = setup();
    const L = level(store).id;
    store.getState().execute('A', addWallChain(L, [{ kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 200, y: 0 }], 20, 250));
    store.getState().execute('B', addWallChain(L, [{ kind: 'free', x: 300, y: 0 }, { kind: 'free', x: 300, y: 200 }], 20, 250));
    expect(Object.keys(level(store).nodes)).toHaveLength(4);
    // grid snap while moving freely
    tool.onPointerDown!(at(200, 0), ctx);
    tool.onPointerMove!(at(243, 52), ctx);
    const moved = Object.values(level(store).nodes).find((n) => n.x === 240 && n.y === 50);
    expect(moved).toBeDefined();
    // released 3 cm from the node (300, 0): merged
    tool.onPointerMove!(at(297, 2), ctx);
    tool.onPointerUp!(at(297, 2), ctx);
    const nodes = Object.values(level(store).nodes);
    expect(nodes).toHaveLength(3);
    expect(nodes.filter((n) => n.x === 300 && n.y === 0)).toHaveLength(1);
    expect(Object.keys(level(store).walls)).toHaveLength(2);
  });

  it('slides an opening along its wall with clearances, refused positions drawn as a red ghost', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const top = Object.values(level(store).walls).find((w) => {
      const a = level(store).nodes[w.startNodeId]!;
      const b = level(store).nodes[w.endNodeId]!;
      return a.y === 0 && b.y === 0;
    })!;
    expect(level(store).nodes[top.startNodeId]).toMatchObject({ x: 0, y: 0 }); // offsets measured from x = 0
    const door = createOpening(top.id, 'door', 200);
    store.getState().execute('Door', addOpening(level(store).id, door));
    tool.onPointerDown!(at(200, 0), ctx);
    tool.onPointerMove!(at(150, 0), ctx);
    tool.onPointerMove!(at(120, 3), ctx);
    expect(level(store).openings[door.id]!.offset).toBe(120);
    const dims = store.getState().overlay.dynamicDims;
    // ruling R29: to the inner faces of the side walls (x = 10 and x = 390)
    expect(dims.map((d) => d.value).sort((a, b) => a - b)).toEqual([68.5, 228.5]);
    // beyond the wall end: clamped against the inner face of the left wall (x = 10, ruling R29)
    tool.onPointerMove!(at(-100, 0), ctx);
    expect(level(store).openings[door.id]!.offset).toBeCloseTo(51.5, 9);
    tool.onPointerUp!(at(-100, 0), ctx);
    expect(store.getState().history.past.at(-1)!.label).toBe("Déplacer l'ouverture");
  });

  it('a refused opening position keeps the last valid one and shows a ghost', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const walls = Object.values(level(store).walls);
    const top = walls.find((w) => level(store).nodes[w.startNodeId]!.y === 0 && level(store).nodes[w.endNodeId]!.y === 0)!;
    expect(level(store).nodes[top.startNodeId]).toMatchObject({ x: 0, y: 0 });
    const a = createOpening(top.id, 'door', 100);
    const b = createOpening(top.id, 'door', 300);
    store.getState().execute('A', addOpening(level(store).id, a));
    store.getState().execute('B', addOpening(level(store).id, b));
    tool.onPointerDown!(at(100, 0), ctx);
    tool.onPointerMove!(at(150, 0), ctx);
    tool.onPointerMove!(at(280, 0), ctx); // overlaps the other door
    expect(level(store).openings[a.id]!.offset).toBe(150);
    expect(store.getState().overlay.previewInvalid).toBe(true);
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'outline' });
    tool.onPointerUp!(at(280, 0), ctx);
    expect(level(store).openings[a.id]!.offset).toBe(150);
  });

  it('drags a manual dimension to change its offset', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const nodes = Object.values(level(store).nodes);
    const n0 = nodes.find((n) => n.x === 0 && n.y === 0)!;
    const n1 = nodes.find((n) => n.x === 400 && n.y === 0)!;
    const out = { id: '' };
    // from (0,0) to (400,0): offset towards perp(b - a) = (0, 1), drawn at y = -60 with offset -60
    store.getState().execute('Dim', addDimension(level(store).id, { kind: 'node', nodeId: n0.id }, { kind: 'node', nodeId: n1.id }, -60, out));
    drag(tool, ctx, { x: 200, y: -60 }, [{ x: 200, y: -70 }, { x: 210, y: -90 }]);
    expect(level(store).dimensions[out.id]!.offset).toBe(-90);
  });
});

describe('select tool: handles', () => {
  it('the rotation handle turns the object by 15 degree steps, freely with Alt', () => {
    const { store, ctx, tool } = setup();
    const o = box(100, 100, 50, 40);
    add(store, o);
    store.getState().setSelection([{ kind: 'object', id: o.id }]);
    // handle 24 px beyond the back (y = 80): (100, 56)
    drag(tool, ctx, { x: 100, y: 56 }, [{ x: 120, y: 60 }, { x: 150, y: 103 }]);
    expect(objectOf(store, o.id).rotation).toBe(90);
    store.getState().undo();
    drag(tool, ctx, { x: 100, y: 56 }, [{ x: 110, y: 60 }, { x: 110, y: 50 }]);
    expect(objectOf(store, o.id).rotation).toBe(15); // atan2(10, 50) = 11.3 deg
    store.getState().undo();
    drag(tool, ctx, { x: 100, y: 56 }, [{ x: 110, y: 60 }, { x: 110, y: 50 }], { alt: true });
    expect(objectOf(store, o.id).rotation).toBeCloseTo(11.31, 2);
  });

  it('a side handle resizes with the opposite side fixed, down to 1 cm', () => {
    const { store, ctx, tool } = setup();
    const o = box(100, 100, 50, 40);
    add(store, o);
    store.getState().setSelection([{ kind: 'object', id: o.id }]);
    // right handle at (125, 100)
    drag(tool, ctx, { x: 125, y: 100 }, [{ x: 130, y: 100 }, { x: 145, y: 103 }]);
    expect(objectOf(store, o.id)).toMatchObject({ width: 70, depth: 40, x: 110, y: 100 });
    store.getState().undo();
    drag(tool, ctx, { x: 125, y: 100 }, [{ x: 100, y: 100 }, { x: -50, y: 100 }]);
    expect(objectOf(store, o.id)).toMatchObject({ width: 1, x: 75.5 });
  });

  it('a corner handle of a rotated object resizes in the object frame', () => {
    const { store, ctx, tool } = setup();
    const o = { ...box(100, 100, 50, 40), rotation: 90 };
    add(store, o);
    store.getState().setSelection([{ kind: 'object', id: o.id }]);
    // rotation 90: local (x, y) -> world (-y, x); corner (+25, +20) at world (80, 125)
    drag(tool, ctx, { x: 80, y: 125 }, [{ x: 75, y: 130 }, { x: 70, y: 135 }]);
    // local delta: world (-10, +10) -> local (+10, +10)
    expect(objectOf(store, o.id)).toMatchObject({ width: 60, depth: 50 });
    // the opposite corner, local (-w/2, -d/2) = world offset (d/2, -w/2), stays at world (120, 75)
    const c = objectOf(store, o.id);
    expect(c.x + c.depth / 2).toBeCloseTo(120);
    expect(c.y - c.width / 2).toBeCloseTo(75);
  });
});

describe('select tool: fix round 1', () => {
  it('onCancel (pointercancel, lost capture, blur) abandons the drag like Escape', () => {
    const { store, ctx, tool } = setup();
    const o = box(100, 100);
    add(store, o);
    const before = entries(store);
    tool.onPointerDown!(at(100, 100), ctx);
    tool.onPointerMove!(at(160, 100), ctx);
    expect(objectOf(store, o.id).x).toBe(160);
    tool.onCancel!(ctx);
    expect(store.getState().gesture).toBeNull();
    expect(objectOf(store, o.id).x).toBe(100);
    tool.onPointerMove!(at(180, 100), ctx);
    tool.onPointerUp!(at(180, 100), ctx);
    expect(objectOf(store, o.id).x).toBe(100);
    expect(entries(store)).toBe(before);
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    tool.onCancel!(ctx); // nothing in progress: harmless
  });

  it('a node dropped on the axis of another wall splits it (T junction, R30)', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const L = level(store).id;
    store.getState().execute('Spur', addWallChain(L, [{ kind: 'free', x: 150, y: 200 }, { kind: 'free', x: 150, y: 120 }], 10, 250));
    const before = entries(store);
    drag(tool, ctx, { x: 150, y: 120 }, [{ x: 150, y: 60 }, { x: 150, y: 3 }]);
    const lv = level(store);
    expect(Object.keys(lv.nodes)).toHaveLength(6);
    expect(Object.keys(lv.walls)).toHaveLength(6);
    const joint = Object.values(lv.nodes).find((n) => n.x === 150 && n.y === 0)!;
    expect(joint).toBeDefined();
    expect(Object.values(lv.walls).filter((w) => w.startNodeId === joint.id || w.endNodeId === joint.id)).toHaveLength(3);
    expect(entries(store)).toBe(before + 1);
    store.getState().undo();
    expect(Object.keys(level(store).nodes)).toHaveLength(6);
    expect(Object.values(level(store).nodes).some((n) => n.x === 150 && n.y === 120)).toBe(true);
  });

  it('a press inside the body next to a side handle moves the object; corners still resize', () => {
    const { store, ctx, tool } = setup();
    const o = box(100, 100, 50, 40);
    add(store, o);
    store.getState().setSelection([{ kind: 'object', id: o.id }]);
    // 3 px left of the right side handle (125, 100), inside the body
    drag(tool, ctx, { x: 122, y: 100 }, [{ x: 130, y: 100 }, { x: 142, y: 100 }]);
    expect(objectOf(store, o.id)).toMatchObject({ x: 120, width: 50 });
    // inside the body next to the corner (145, 120): resize
    drag(tool, ctx, { x: 143, y: 118 }, [{ x: 150, y: 125 }, { x: 153, y: 128 }]);
    expect(objectOf(store, o.id)).toMatchObject({ width: 60, depth: 50 });
  });

  it('side handles are hidden when their side is shorter than 20 screen px', () => {
    const o = box(100, 100, 10, 40);
    const sides = (px: number) => objectHandles(o, px).filter((h) => h.kind === 'resize' && (h.sx === 0 || h.sy === 0));
    // width 10 cm at 1 px/cm: the top and bottom side handles go, left and right stay
    expect(sides(1).map((h) => [h.sx, h.sy])).toEqual([[-1, 0], [1, 0]]);
    expect(sides(0.4)).toHaveLength(0);
    expect(sides(2)).toHaveLength(4);
    expect(objectHandles(o, 1).filter((h) => h.kind === 'resize' && h.sx !== 0 && h.sy !== 0)).toHaveLength(4);
  });
});

describe('select tool: room rename', () => {
  it('a double-click in a room opens the rename input in the overlay', () => {
    const { store, ctx, tool } = setup();
    room(store);
    tool.onDoubleClick!(at(200, 150), ctx);
    const r = store.getState().overlay.rename;
    expect(r).toMatchObject({ levelId: level(store).id, label: null, placeholder: 'Pièce' });
    expect(store.getState().selection).toEqual([{ kind: 'room', id: 'room-0' }]);
  });

  it('a double-click on an object does not', () => {
    const { store, ctx, tool } = setup();
    room(store);
    add(store, box(200, 150));
    tool.onDoubleClick!(at(200, 150), ctx);
    expect(store.getState().overlay.rename).toBeNull();
  });
});

describe('select tool: Tab and typed distances (spec 7.4, ruling R27)', () => {
  const key = (k: string, shift = false): KeyboardEvent =>
    ({ key: k, metaKey: false, ctrlKey: false, shiftKey: shift, altKey: false, repeat: false, defaultPrevented: false, target: null }) as unknown as KeyboardEvent;
  const topWall = (store: EditorStore) =>
    Object.values(level(store).walls).find((w) => level(store).nodes[w.startNodeId]!.y === 0 && level(store).nodes[w.endNodeId]!.y === 0)!;

  it('while dragging an object: Tab picks a clearance, a digit opens the field, Enter places it and commits', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const o = box(200, 150); // 50 x 40
    add(store, o);
    const before = entries(store);
    tool.onPointerDown!(at(200, 150), ctx);
    tool.onPointerMove!(at(210, 155), ctx);
    tool.onPointerMove!(at(220, 160), ctx);
    // sides in order back (-y), front, left, right; back clearance = 160 - 20 - 10
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true);
    expect(store.getState().overlay.activeDimIndex).toBe(0);
    expect(store.getState().overlay.dynamicDims[0]!.value).toBeCloseTo(130, 6);
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true);
    expect(store.getState().overlay.activeDimIndex).toBe(1);
    expect(tool.onKeyDown!(key('Tab', true), ctx)).toBe(true);
    expect(store.getState().overlay.activeDimIndex).toBe(0);
    // the digit opens the shared field with that digit; the key is used (no double insertion)
    expect(tool.onKeyDown!(key('6'), ctx)).toBe(true);
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '6', kind: 'nonNegative', screen: { x: 220, y: 160 } });
    // pointer moves are frozen while typing
    tool.onPointerMove!(at(300, 200), ctx);
    expect(objectOf(store, o.id)).toMatchObject({ x: 220, y: 160 });
    store.getState().setOverlay({ numericInput: null });
    tool.onNumericSubmit!(60, ctx);
    expect(objectOf(store, o.id)).toMatchObject({ x: 220, y: 90 });
    expect(store.getState().gesture).toBeNull();
    expect(entries(store)).toBe(before + 1);
    // the clearances stay shown, the typed one active
    const ov = store.getState().overlay;
    expect(ov.dynamicDims[ov.activeDimIndex!]!.value).toBeCloseTo(60, 6);
    tool.onPointerMove!(at(320, 220), ctx);
    tool.onPointerUp!(at(320, 220), ctx);
    expect(objectOf(store, o.id)).toMatchObject({ x: 220, y: 90 });
    expect(entries(store)).toBe(before + 1);
    store.getState().undo();
    expect(objectOf(store, o.id)).toMatchObject({ x: 200, y: 150 });
  });

  it('released while typing: Enter still places and commits; Escape in the field keeps the dropped position', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const o = box(200, 150);
    add(store, o);
    tool.onPointerDown!(at(200, 150), ctx);
    tool.onPointerMove!(at(220, 160), ctx);
    tool.onKeyDown!(key('Tab'), ctx);
    tool.onKeyDown!(key('Tab'), ctx); // front: 290 - (160 + 20) = 110
    tool.onKeyDown!(key('5'), ctx);
    tool.onPointerUp!(at(220, 160), ctx);
    expect(store.getState().gesture).not.toBeNull();
    tool.onNumericSubmit!(50, ctx);
    expect(objectOf(store, o.id)).toMatchObject({ x: 220, y: 220 });
    expect(store.getState().gesture).toBeNull();

    tool.onPointerDown!(at(220, 220), ctx);
    tool.onPointerMove!(at(240, 220), ctx);
    tool.onKeyDown!(key('Tab'), ctx);
    tool.onKeyDown!(key('3'), ctx);
    tool.onPointerUp!(at(240, 220), ctx);
    tool.onNumericCancel!(ctx);
    expect(store.getState().gesture).toBeNull();
    expect(objectOf(store, o.id)).toMatchObject({ x: 240, y: 220 });
    expect(store.getState().overlay.dynamicDims).toEqual([]);
  });

  it('while dragging an opening: the typed value becomes the distance to the inner face', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const door = createOpening(topWall(store).id, 'door', 200);
    store.getState().execute('Door', addOpening(level(store).id, door));
    tool.onPointerDown!(at(200, 0), ctx);
    tool.onPointerMove!(at(180, 0), ctx);
    tool.onKeyDown!(key('Tab'), ctx); // before: to the left wall inner face x = 10
    expect(store.getState().overlay.dynamicDims[0]!.value).toBeCloseTo(180 - 41.5 - 10, 6);
    tool.onKeyDown!(key('3'), ctx);
    tool.onNumericSubmit!(30, ctx);
    expect(level(store).openings[door.id]!.offset).toBeCloseTo(10 + 30 + 41.5, 6);
    expect(store.getState().history.past.at(-1)!.label).toBe("Déplacer l'ouverture");
  });

  it('a refused typed opening position keeps the drag going and tells why', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const door = createOpening(topWall(store).id, 'door', 200);
    store.getState().execute('Door', addOpening(level(store).id, door));
    tool.onPointerDown!(at(200, 0), ctx);
    tool.onPointerMove!(at(180, 0), ctx);
    tool.onKeyDown!(key('Tab'), ctx);
    tool.onKeyDown!(key('9'), ctx);
    tool.onNumericSubmit!(900, ctx);
    expect(store.getState().toast?.message).toBe('Pas assez de place sur ce mur');
    expect(store.getState().gesture).not.toBeNull();
    tool.onPointerMove!(at(170, 0), ctx);
    expect(level(store).openings[door.id]!.offset).toBe(170);
  });

  it('a single selected object without dragging: Tab shows its clearances, typing moves it (one entry)', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const o = box(200, 150);
    add(store, o);
    click(tool, ctx, { x: 200, y: 150 });
    const before = entries(store);
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true);
    expect(store.getState().overlay.dynamicDims).toHaveLength(4);
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true);
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(true); // left: 200 - 25 - 10 = 165
    expect(store.getState().overlay.activeDimIndex).toBe(2);
    expect(tool.onKeyDown!(key('2'), ctx)).toBe(true);
    expect(store.getState().overlay.numericInput?.value).toBe('2');
    tool.onNumericSubmit!(25, ctx);
    expect(objectOf(store, o.id)).toMatchObject({ x: 60, y: 150 });
    expect(entries(store)).toBe(before + 1);
    const ov = store.getState().overlay;
    expect(ov.activeDimIndex).toBe(2);
    expect(ov.dynamicDims[2]!.value).toBeCloseTo(25, 6);
    // any other key ends it; Escape is used for that, the selection stays
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    expect(store.getState().selection).toEqual([{ kind: 'object', id: o.id }]);
  });

  it('onCancel while typing abandons the gesture, closes the field and drops the Tab measure', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const o = box(200, 150);
    add(store, o);
    const before = entries(store);
    tool.onPointerDown!(at(200, 150), ctx);
    tool.onPointerMove!(at(220, 160), ctx);
    tool.onKeyDown!(key('Tab'), ctx);
    tool.onKeyDown!(key('6'), ctx);
    expect(store.getState().overlay.numericInput).not.toBeNull();
    tool.onCancel!(ctx);
    expect(store.getState().gesture).toBeNull();
    expect(store.getState().overlay.numericInput).toBeNull();
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    expect(objectOf(store, o.id)).toMatchObject({ x: 200, y: 150 });
    expect(entries(store)).toBe(before);
    tool.onNumericSubmit!(60, ctx); // a late submit does nothing
    expect(objectOf(store, o.id)).toMatchObject({ x: 200, y: 150 });
  });

  it('digits and Tab are left to the shortcuts when nothing can be measured', () => {
    const { store, ctx, tool } = setup();
    room(store);
    const a = box(100, 100);
    const b = box(300, 100);
    add(store, a);
    add(store, b);
    expect(tool.onKeyDown!(key('0'), ctx)).toBe(false); // fit view stays available
    click(tool, ctx, { x: 100, y: 100 });
    expect(tool.onKeyDown!(key('0'), ctx)).toBe(false); // no Tab yet
    click(tool, ctx, { x: 300, y: 100 }, { shift: true });
    expect(tool.onKeyDown!(key('Tab'), ctx)).toBe(false); // two objects selected
    expect(store.getState().overlay.dynamicDims).toEqual([]);
  });
});
