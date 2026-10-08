import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '@/core/model/types';
import { createEditorStore, ERR_GEOMETRY } from '@/editor/store';
import { TOOLS } from '@/editor/tools/registry';
import type { PointerInfo, Tool, ToolContext } from '@/editor/tools/types';
import { createWallTool } from '@/editor/tools/wallTool';
import { emptyProject } from '../core/helpers';

/** polygon-clipping whose union fails whenever an input x lies in [4980, 5080] (every retry too). */
const ctl = vi.hoisted(() => ({ poison: 4980 }));
vi.mock('polygon-clipping', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: Record<string, (...a: unknown[]) => unknown> }).default;
  const union = (...geoms: unknown[]) => {
    if (JSON.stringify(geoms).match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.some((n) => +n >= ctl.poison && +n <= ctl.poison + 100)) {
      throw new Error('Unable to complete output ring (simulated)');
    }
    return real.union!(...geoms);
  };
  return { default: { ...real, union } };
});

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

const at = (x: number, y: number): PointerInfo => ({ world: { x, y }, screen: { x, y }, button: 0, shift: false, alt: false, meta: false, detail: 1 });
const move = (tool: Tool, ctx: ToolContext, p: Vec2) => tool.onPointerMove!(at(p.x, p.y), ctx);
function click(tool: Tool, ctx: ToolContext, p: Vec2) {
  move(tool, ctx, p);
  tool.onPointerDown!(at(p.x, p.y), ctx);
}
const key = (k: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent;

describe('wall tool: a refused chain is kept (final review item 5)', () => {
  it('the preview turns red on a point whose chain would be refused, and back on a valid one', () => {
    const { store, ctx, tool } = setup();
    click(tool, ctx, { x: 0, y: 0 });
    move(tool, ctx, { x: 400, y: 0 });
    expect(store.getState().overlay.previewInvalid).toBe(false);
    move(tool, ctx, { x: 5000, y: 0 });
    expect(store.getState().overlay.previewInvalid).toBe(true);
    move(tool, ctx, { x: 400, y: 300 });
    expect(store.getState().overlay.previewInvalid).toBe(false);
  });

  it('Enter on a refused chain toasts, keeps every point, and the corrected chain is accepted', () => {
    const { store, ctx, tool } = setup();
    for (const p of [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 5000, y: 0 }]) click(tool, ctx, p);
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(true);
    expect(store.getState().toast?.message).toBe(ERR_GEOMETRY);
    expect(Object.keys(store.getState().project!.levels[0]!.walls)).toHaveLength(0);
    expect(store.getState().history.past).toHaveLength(0);
    // the chain is still being drawn: Mod+Z removes its last point, then it can be finished
    expect(tool.onKeyDown!(key('z', { metaKey: true }), ctx)).toBe(true);
    click(tool, ctx, { x: 400, y: 300 });
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(true);
    expect(Object.keys(store.getState().project!.levels[0]!.walls)).toHaveLength(2);
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().overlay.previewInvalid).toBe(false);
  });

  it('Escape right after a refusal drops the chain instead of committing it again', () => {
    const { store, ctx, tool } = setup();
    for (const p of [{ x: 0, y: 0 }, { x: 5000, y: 0 }]) click(tool, ctx, p);
    tool.onKeyDown!(key('Enter'), ctx);
    expect(store.getState().toast?.message).toBe(ERR_GEOMETRY);
    const toastId = store.getState().toast!.id;
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().toast!.id).toBe(toastId); // no second attempt
    expect(store.getState().overlay.ghost).toBeNull();
    expect(store.getState().overlay.previewInvalid).toBe(false);
    // idle again: keys are no longer the chain's
    expect(tool.onKeyDown!(key('Enter'), ctx)).toBe(false);
  });
});
