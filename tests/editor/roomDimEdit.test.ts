import { describe, expect, it, vi } from 'vitest';
import { addRectRoomInterior, addWallChain } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import type { Level, Vec2 } from '@/core/model/types';
import { applyNumericInput, cancelNumericInput } from '@/editor/numericDispatch';
import { roomDimensionAt } from '@/editor/roomDimensions';
import { createEditorStore, type EditorStore } from '@/editor/store';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import { selectTool } from '@/editor/tools/selectTool';
import { layoutDimensions } from '@/render/dimensionsLayout';
import { dimText } from '@/render/dimLayout';
import { emptyProject } from '../core/helpers';

/*
 * Spec 6: a double-click on an interior dimension of a rectangular room opens the numeric field
 * with its value, and the value typed resizes the room (setRoomInteriorSize, 'max' side moves).
 */

const PX = 1; // px per cm: lineUnit 1, screen = world
const at = (p: Vec2): PointerInfo => ({ world: p, screen: p, button: 0, shift: false, alt: false, meta: false, detail: 2 });
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;

function setup(build: (store: EditorStore, levelId: string) => void) {
  const store = createEditorStore();
  store.getState().openProject(emptyProject());
  store.getState().setView({ pxPerCm: PX, tx: 0, ty: 0 });
  build(store, level(store).id);
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => PX, fitView: vi.fn() };
  return { store, ctx };
}

/** Where the text of the room dimension measuring `value` is drawn (first match), world cm. */
function roomDimText(lvl: Level, value: number): Vec2 {
  const d = deriveLevel(lvl);
  const { auto } = layoutDimensions(lvl, d, 'all', 1 / PX);
  const placed = auto.find((p) => p && p.dim.kind === 'room' && Math.abs(p.dim.value - value) < 1e-6);
  if (!placed) throw new Error(`no room dimension of ${value} drawn`);
  return dimText(placed.dim, 1 / PX, placed.textInside, placed.fontScale)!.at;
}

const rect400x300 = (store: EditorStore, id: string) =>
  store.getState().execute('room', addRectRoomInterior(id, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));

describe('room dimension edit (double-click, select tool)', () => {
  it('roomDimensionAt finds the room, the axis and the interior value under the text, nothing elsewhere', () => {
    const { store } = setup(rect400x300);
    const lvl = level(store);
    const d = deriveLevel(lvl);
    const hit = roomDimensionAt(lvl, d, roomDimText(lvl, 400), 1, 'all');
    expect(hit).toMatchObject({ roomKey: d.rooms[0]!.key, axis: 'width', value: 400 });
    expect(roomDimensionAt(lvl, d, roomDimText(lvl, 300), 1, 'all')).toMatchObject({ axis: 'depth', value: 300 });
    expect(roomDimensionAt(lvl, d, { x: 200, y: 150 }, 1, 'all')).toBeNull();
    // dimensions hidden: nothing to double-click
    expect(roomDimensionAt(lvl, d, roomDimText(lvl, 400), 1, 'none')).toBeNull();
  });

  it('double-click on the 4,00 m dimension, 450 -> room 450 x 300 (the right side moves)', () => {
    const { store, ctx } = setup(rect400x300);
    const p = roomDimText(level(store), 400);
    selectTool.onDoubleClick!(at(p), ctx);
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '400', kind: 'positive', label: 'Largeur', select: true });
    expect(store.getState().overlay.rename).toBeNull();
    expect(applyNumericInput(store, ctx, '450')).toBe(true);

    const rooms = deriveLevel(level(store)).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(450 * 300, 6);
    const xs = rooms[0]!.ring.map((q) => q.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 450]);
    expect(store.getState().history.past.map((e) => e.label)).toEqual(['room', 'Dimensions de la pièce']);
    expect(store.getState().overlay.numericInput).toBeNull();
  });

  it('a refused size shows the message and gives the value back in red; Escape then changes nothing', () => {
    const { store, ctx } = setup(rect400x300);
    const p = roomDimText(level(store), 300);
    selectTool.onDoubleClick!(at(p), ctx);
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '300', label: 'Profondeur' });
    const before = store.getState().project;
    expect(applyNumericInput(store, ctx, '5')).toBe(true); // parsed, then refused by the command
    expect(store.getState().toast?.message).toBe('Dimension minimale : 10 cm.');
    expect(store.getState().overlay.numericInput).toMatchObject({ value: '5', invalid: true });
    cancelNumericInput(store, ctx);
    expect(store.getState().project).toBe(before);
    // the next submit (another field) is not taken for the room
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('double-click in the room (not on a dimension) still renames it', () => {
    const { store, ctx } = setup(rect400x300);
    selectTool.onDoubleClick!(at({ x: 200, y: 150 }), ctx);
    expect(store.getState().overlay.rename).not.toBeNull();
    expect(store.getState().overlay.numericInput).toBeNull();
  });

  it('double-click on a dimension of a room that is not rectangular renames the room (V1)', () => {
    const { store, ctx } = setup((s, id) =>
      s.getState().execute(
        'L',
        addWallChain(
          id,
          [
            { kind: 'free', x: 0, y: 0 }, { kind: 'free', x: 600, y: 0 }, { kind: 'free', x: 600, y: 300 },
            { kind: 'free', x: 300, y: 300 }, { kind: 'free', x: 300, y: 600 }, { kind: 'free', x: 0, y: 600 }, { kind: 'free', x: 0, y: 0 },
          ],
          20,
          250,
        ),
      ),
    );
    const lvl = level(store);
    const p = roomDimText(lvl, 580);
    expect(roomDimensionAt(lvl, deriveLevel(lvl), p, 1, 'all')).toBeNull();
    selectTool.onDoubleClick!(at(p), ctx);
    expect(store.getState().overlay.numericInput).toBeNull();
    expect(store.getState().overlay.rename).not.toBeNull();
  });
});
