import { describe, expect, it, vi } from 'vitest';
import { doorCountFor } from '@/core/model/defaults';
import type { Level, Project } from '@/core/model/types';
import { createEditorStore, type EditorStore } from '@/editor/store';
import { createCupboardTool, cupboardPreview } from '@/editor/tools/cupboardTool';
import type { PointerInfo, ToolContext } from '@/editor/tools/types';
import { findWall, rectRoom, type WallSegment } from '../core/fixtures';
import { projectFrom } from '../core/helpers';

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

function setup(segments: WallSegment[]) {
  const store = createEditorStore();
  const p: Project = projectFrom(segments);
  store.getState().openProject(p);
  store.getState().setTool('cupboard');
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  return { store, ctx, tool: createCupboardTool() };
}
const level = (store: EditorStore): Level => store.getState().project!.levels[0]!;
const cupboards = (store: EditorStore) => Object.values(level(store).cupboards);

describe('cupboardPreview', () => {
  it('on a wall of 300 hovered 20 cm from its start: pushed back to offset 60, against the face on the cursor side', () => {
    const { store } = setup([[0, 0, 300, 0]]);
    const lv = level(store);
    const wallId = findWall(lv, 0, 0, 300, 0);
    // +y = left of the wall (0, 0) -> (300, 0)
    const pv = cupboardPreview(lv, { x: 20, y: 5 }, 8)!;
    expect(pv.valid).toBe(true);
    expect(pv.cupboard).toMatchObject({ wallId, offset: 60, side: 'left', width: 120, depth: 60, heightMode: 'ceiling', doorCount: 2 });
    expect(cupboardPreview(lv, { x: 150.4, y: -6 }, 8)!.cupboard).toMatchObject({ offset: 150, side: 'right' });
    expect(cupboardPreview(lv, { x: 150.4, y: -6 }, 8, true)!.cupboard.offset).toBeCloseTo(150.4, 9);
    // no wall hovered
    expect(cupboardPreview(lv, { x: 150, y: 40 }, 8)).toBeNull();
  });

  it('is invalid on a wall of 80', () => {
    const { store } = setup([[0, 0, 80, 0]]);
    const pv = cupboardPreview(level(store), { x: 40, y: 5 }, 8)!;
    expect(pv.valid).toBe(false);
  });

  it('in a room, stops at the face of the wall met in the corner', () => {
    const { store } = setup(rectRoom(0, 0, 400, 300));
    // top wall (0, 0) -> (400, 0), inside = +y = left; the side wall face is at x = 10
    const pv = cupboardPreview(level(store), { x: 20, y: 5 }, 8)!;
    expect(pv.valid).toBe(true);
    expect(pv.cupboard.offset).toBeCloseTo(70, 6);
  });
});

describe('cupboard tool', () => {
  it('hovering shows the ghost, a click adds the cupboard and selects it, the tool stays', () => {
    const { store, ctx, tool } = setup([[0, 0, 300, 0]]);
    const before = store.getState().history.past.length;
    tool.onPointerMove!(at(20, 5), ctx);
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'volume-cupboard', valid: true, cupboard: { offset: 60 } });
    tool.onPointerDown!(at(20, 5), ctx);
    expect(cupboards(store)).toHaveLength(1);
    const c = cupboards(store)[0]!;
    expect(c).toMatchObject({ offset: 60, side: 'left', heightMode: 'ceiling', doorCount: doorCountFor(120) });
    expect(c.id).not.toBe('cupboard-preview');
    expect(store.getState().history.past.length).toBe(before + 1);
    expect(store.getState().history.past.at(-1)!.label).toBe('Ajouter un placard');
    expect(store.getState().selection).toEqual([{ kind: 'cupboard', id: c.id }]);
    expect(store.getState().tool).toBe('cupboard');
  });

  it('a click where it does not fit adds nothing and says why; the ghost is red', () => {
    const { store, ctx, tool } = setup([[0, 0, 80, 0]]);
    tool.onPointerMove!(at(40, 5), ctx);
    expect(store.getState().overlay.ghost).toMatchObject({ kind: 'volume-cupboard', valid: false });
    tool.onPointerDown!(at(40, 5), ctx);
    expect(cupboards(store)).toHaveLength(0);
    expect(store.getState().toast?.message).toBe('Pas assez de place sur ce mur');
  });
});
