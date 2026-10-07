import { describe, expect, it, vi } from 'vitest';
import { addOpening } from '@/core/commands/openings';
import { addRectRoom, addWallChain } from '@/core/commands/walls';
import { createOpening } from '@/core/model/factory';
import type { Level } from '@/core/model/types';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { createOpeningTool, isOpeningGhost, openingPreview } from '@/editor/tools/openingTool';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import { findWall, levelFromWalls, rectRoom } from '../core/fixtures';
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

const key = (k: string, extra: Record<string, unknown> = {}): KeyboardEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, defaultPrevented: false, target: null, ...extra }) as unknown as KeyboardEvent;

function setup() {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  store.getState().setTool('door');
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  return { store, ctx, levelId: p.levels[0]!.id };
}
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;

describe('openingPreview', () => {
  it('a door hovering a 300 cm wall 20 cm from its start is pushed back into the wall (offset 41.5)', () => {
    const lv = levelFromWalls([[0, 0, 300, 0]]);
    const pv = openingPreview(lv, 'door', { x: 20, y: 4 }, 8)!;
    expect(pv.valid).toBe(true);
    expect(pv.opening.offset).toBe(41.5);
    expect(pv.opening.width).toBe(83);
    expect(pv.opening.wallId).toBe(findWall(lv, 0, 0, 300, 0));
  });

  it('a door hovering a 60 cm wall is invalid', () => {
    const lv = levelFromWalls([[0, 0, 60, 0]]);
    const pv = openingPreview(lv, 'door', { x: 30, y: 0 }, 8)!;
    expect(pv.valid).toBe(false);
  });

  it('in a room, stays clear of the perpendicular walls: pushed back against their inner faces', () => {
    const lv = levelFromWalls(rectRoom(0, 0, 400, 300));
    const pv = openingPreview(lv, 'door', { x: 20, y: 4 }, 8)!;
    expect(pv.valid).toBe(true);
    expect(pv.opening.offset).toBeCloseTo(10 + 41.5, 6);
    // 90 cm between axes, 70 cm between the faces of the two side walls: no room for 83 cm
    const narrow = levelFromWalls(rectRoom(0, 0, 90, 300));
    expect(openingPreview(narrow, 'door', { x: 45, y: 0 }, 8)!.valid).toBe(false);
  });

  it('centers on the cursor projection (1 cm rounding, raw with Alt), swing on the cursor side', () => {
    const lv = levelFromWalls([[0, 0, 300, 0]]);
    // wall normal = perp(dir) = (0, 1): y > 0 is the left side
    const below = openingPreview(lv, 'window', { x: 150.4, y: 12 }, 8)!;
    expect(below.opening).toMatchObject({ kind: 'window', offset: 150, width: 120, sillHeight: 90, swing: 'left' });
    const above = openingPreview(lv, 'window', { x: 150.4, y: -12 }, 8, true)!;
    expect(above.opening.offset).toBeCloseTo(150.4, 9);
    expect(above.opening.swing).toBe('right');
  });

  it('is null away from any wall and invalid over another opening', () => {
    const lv = levelFromWalls([[0, 0, 300, 0]]);
    expect(openingPreview(lv, 'door', { x: 150, y: 30 }, 8)).toBeNull();
    const w = createOpening(findWall(lv, 0, 0, 300, 0), 'window', 150);
    lv.openings[w.id] = w;
    expect(openingPreview(lv, 'door', { x: 120, y: 0 }, 8)!.valid).toBe(false);
  });
});

describe('door / window tool', () => {
  it('hover shows the ghost and its clearances, a click adds the door and the tool stays active', () => {
    const { store, ctx, levelId } = setup();
    store.getState().execute('W', addWallChain(levelId, [{ kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 300, y: 0 }], 20, 250));
    const tool = createOpeningTool('door');
    tool.onPointerMove!(at(100, 5), ctx);
    const ov = store.getState().overlay;
    expect(isOpeningGhost(ov.ghost)).toBe(true);
    expect(ov.dynamicDims.map((d) => d.value)).toEqual([58.5, 158.5]);
    tool.onPointerDown!(at(100, 5), ctx);
    const placed = Object.values(level(store).openings);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ kind: 'door', offset: 100, width: 83, height: 204, swing: 'left' });
    expect(store.getState().history.past.at(-1)!.label).toBe('Ajouter une porte');
    expect(store.getState().selection).toEqual([{ kind: 'opening', id: placed[0]!.id }]);
    expect(store.getState().tool).toBe('door');
    // a second door next to it
    tool.onPointerMove!(at(220, -5), ctx);
    tool.onPointerDown!(at(220, -5), ctx);
    expect(Object.keys(level(store).openings)).toHaveLength(2);
  });

  it('a click on a position that does not fit between the faces is refused with a message', () => {
    const { store, ctx, levelId } = setup();
    // 90 x 300 room: the short walls have 70 cm between faces, the wall itself is 90 cm long
    store.getState().execute('Room', addRectRoom(levelId, { x: 0, y: 0 }, { x: 90, y: 300 }, 20, 250));
    const tool = createOpeningTool('door');
    tool.onPointerDown!(at(45, 0), ctx);
    expect(Object.keys(level(store).openings)).toHaveLength(0);
    expect(store.getState().toast?.message).toBe('Pas assez de place sur ce mur');
  });

  it('an invalid position shows a red ghost and a click adds nothing', () => {
    const { store, ctx, levelId } = setup();
    store.getState().execute('W', addWallChain(levelId, [{ kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 60, y: 0 }], 20, 250));
    const tool = createOpeningTool('door');
    tool.onPointerMove!(at(30, 0), ctx);
    const ghost = store.getState().overlay.ghost;
    expect(isOpeningGhost(ghost) && ghost.valid).toBe(false);
    expect(store.getState().overlay.dynamicDims).toEqual([]);
    tool.onPointerDown!(at(30, 0), ctx);
    expect(Object.keys(level(store).openings)).toHaveLength(0);
    expect(store.getState().toast?.message).toBe('Pas assez de place sur ce mur');
  });

  it('nothing happens away from the walls; Escape returns to the selection tool', () => {
    const { store, ctx, levelId } = setup();
    store.getState().execute('W', addWallChain(levelId, [{ kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 300, y: 0 }], 20, 250));
    const tool = createOpeningTool('window');
    tool.onPointerMove!(at(100, 5), ctx);
    tool.onPointerMove!(at(100, 80), ctx);
    expect(store.getState().overlay.ghost).toBeNull();
    tool.onPointerDown!(at(100, 80), ctx);
    expect(Object.keys(level(store).openings)).toHaveLength(0);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('select');
  });

  it('a window cannot overlap an existing door', () => {
    const { store, ctx, levelId } = setup();
    store.getState().execute('W', addWallChain(levelId, [{ kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 300, y: 0 }], 20, 250));
    const wallId = Object.keys(level(store).walls)[0]!;
    store.getState().execute('D', addOpening(levelId, createOpening(wallId, 'door', 100)));
    const tool = createOpeningTool('window');
    tool.onPointerMove!(at(150, 0), ctx);
    const ghost = store.getState().overlay.ghost;
    expect(isOpeningGhost(ghost) && ghost.valid).toBe(false);
  });
});
