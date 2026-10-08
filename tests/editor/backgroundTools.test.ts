import { describe, expect, it, vi } from 'vitest';
import { setBackground, updateBackground } from '@/core/commands/project';
import type { Background, Level, Vec2 } from '@/core/model/types';
import { watchBackgroundMode } from '@/editor/background';
import { createEditorStore } from '@/editor/store';
import { createCalibrateTool } from '@/editor/tools/calibrateTool';
import { createMoveBackgroundTool } from '@/editor/tools/moveBackgroundTool';
import type { PointerInfo, Tool, ToolContext } from '@/editor/tools/types';
import { emptyProject } from '../core/helpers';

const BG: Background = {
  imageId: 'img', widthPx: 800, heightPx: 600, scale: 1, x: 0, y: 0, rotation: 0, opacity: 0.5, locked: false, visible: true,
};

function setup(bg: Partial<Background> = {}) {
  const store = createEditorStore();
  const p = emptyProject();
  store.getState().openProject(p);
  expect(store.getState().execute('bg', setBackground(p.levels[0]!.id, { ...BG, ...bg }))).toBe(true);
  const ctx: ToolContext = { store, toWorld: (q) => q, pxPerCm: () => 1, fitView: vi.fn() };
  const level = (): Level => store.getState().project!.levels[0]!;
  return { store, ctx, level };
}

const at = (p: Vec2): PointerInfo => ({ world: p, screen: p, button: 0, shift: false, alt: false, meta: false, detail: 1 });
const click = (tool: Tool, ctx: ToolContext, p: Vec2) => {
  tool.onPointerDown!(at(p), ctx);
  tool.onPointerUp!(at(p), ctx);
};
const key = (k: string) => ({ key: k }) as KeyboardEvent;

describe('calibrate tool', () => {
  it('two clicks open the length field, the value rescales the image keeping the first point', () => {
    const { store, ctx, level } = setup();
    store.getState().setTool('calibrate');
    const tool = createCalibrateTool();
    click(tool, ctx, { x: 100, y: 100 });
    expect(store.getState().overlay.numericInput).toBeNull();
    tool.onPointerMove!(at({ x: 200, y: 100 }), ctx);
    expect(store.getState().overlay.ghost).not.toBeNull();
    click(tool, ctx, { x: 300, y: 100 });
    const ni = store.getState().overlay.numericInput!;
    expect(ni.value).toBe('');
    expect(ni.kind).toBe('positive');
    expect(ni.label).toBe('Longueur réelle');

    store.getState().setOverlay({ numericInput: null });
    tool.onNumericSubmit!(100, ctx);
    expect(level().background!.scale).toBeCloseTo(0.5, 12);
    expect(level().background!.x).toBeCloseTo(50, 9); // p1 - k * (p1 - pos) = 100 - 0.5 * 100
    expect(store.getState().tool).toBe('select');
    expect(store.getState().history.past).toHaveLength(2);
  });

  it('cancelling the field forgets the segment and changes nothing', () => {
    const { store, ctx, level } = setup();
    const tool = createCalibrateTool();
    click(tool, ctx, { x: 0, y: 0 });
    click(tool, ctx, { x: 400, y: 0 });
    tool.onNumericCancel!(ctx);
    expect(store.getState().overlay.ghost).toBeNull();
    expect(level().background!.scale).toBe(1);
    click(tool, ctx, { x: 10, y: 10 }); // starts a new segment
    expect(store.getState().overlay.ghost).not.toBeNull();
  });

  it('ignores a second click on the first point', () => {
    const { store, ctx } = setup();
    const tool = createCalibrateTool();
    click(tool, ctx, { x: 10, y: 10 });
    click(tool, ctx, { x: 11, y: 10 });
    expect(store.getState().overlay.numericInput).toBeNull();
  });

  it('Escape cancels the segment, then leaves the tool', () => {
    const { store, ctx } = setup();
    store.getState().setTool('calibrate');
    const tool = createCalibrateTool();
    click(tool, ctx, { x: 10, y: 10 });
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().overlay.ghost).toBeNull();
    expect(store.getState().tool).toBe('calibrate');
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(store.getState().tool).toBe('select');
    expect(tool.onKeyDown!(key('a'), ctx)).toBe(false);
  });
});

describe('move background tool', () => {
  const drag = (tool: Tool, ctx: ToolContext, a: Vec2, b: Vec2) => {
    tool.onPointerDown!(at(a), ctx);
    tool.onPointerMove!(at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), ctx);
    tool.onPointerMove!(at(b), ctx);
    tool.onPointerUp!(at(b), ctx);
  };

  it('a drag moves the image by the pointer delta in one history entry', () => {
    const { store, ctx, level } = setup({ x: 10, y: 20 });
    const before = store.getState().history.past.length;
    drag(createMoveBackgroundTool(), ctx, { x: 100, y: 100 }, { x: 160, y: 70 });
    expect(level().background).toMatchObject({ x: 70, y: -10 });
    expect(store.getState().history.past.length).toBe(before + 1);
    store.getState().undo();
    expect(level().background).toMatchObject({ x: 10, y: 20 });
  });

  it('does not move a locked image', () => {
    const { store, ctx, level } = setup({ locked: true });
    const before = store.getState().history.past.length;
    drag(createMoveBackgroundTool(), ctx, { x: 0, y: 0 }, { x: 50, y: 50 });
    expect(level().background).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().history.past.length).toBe(before);
  });

  it('Escape cancels a drag in progress, then leaves the mode', () => {
    const { store, ctx, level } = setup();
    store.getState().setTool('moveBackground');
    const tool = createMoveBackgroundTool();
    tool.onPointerDown!(at({ x: 0, y: 0 }), ctx);
    tool.onPointerMove!(at({ x: 30, y: 30 }), ctx);
    expect(level().background!.x).toBe(30);
    expect(tool.onKeyDown!(key('Escape'), ctx)).toBe(true);
    expect(level().background!.x).toBe(0);
    expect(store.getState().tool).toBe('moveBackground');
    tool.onKeyDown!(key('Escape'), ctx);
    expect(store.getState().tool).toBe('select');
  });

  it('onCancel (pointercancel, window blur) abandons the drag: the image no longer follows the pointer', () => {
    const { store, ctx, level } = setup();
    store.getState().setTool('moveBackground');
    const tool = createMoveBackgroundTool();
    const before = store.getState().history.past.length;
    tool.onPointerDown!(at({ x: 0, y: 0 }), ctx);
    tool.onPointerMove!(at({ x: 30, y: 30 }), ctx);
    tool.onCancel!(ctx);
    expect(store.getState().gesture).toBeNull();
    expect(level().background).toMatchObject({ x: 0, y: 0 });
    tool.onPointerMove!(at({ x: 80, y: 80 }), ctx);
    tool.onPointerUp!(at({ x: 80, y: 80 }), ctx);
    expect(level().background).toMatchObject({ x: 0, y: 0 });
    expect(store.getState().history.past.length).toBe(before);
    expect(store.getState().tool).toBe('moveBackground');
    tool.onCancel!(ctx); // nothing in progress: harmless
    expect(store.getState().tool).toBe('moveBackground');
  });
});

describe('watchBackgroundMode', () => {
  it('leaves the move mode as soon as the image is locked or hidden, and only then', () => {
    for (const patch of [{ locked: true }, { visible: false }]) {
      const { store, level } = setup();
      const stop = watchBackgroundMode(store);
      store.getState().setTool('moveBackground');
      store.getState().execute('opacity', updateBackground(level().id, { opacity: 0.3 }));
      expect(store.getState().tool).toBe('moveBackground');
      store.getState().execute('patch', updateBackground(level().id, patch));
      expect(store.getState().tool).toBe('select');
      // undo makes the image usable again: the mode is not re-entered by itself, but can be
      store.getState().undo();
      store.getState().setTool('moveBackground');
      expect(store.getState().tool).toBe('moveBackground');
      // an undo that locks / hides it again leaves the mode too
      store.getState().redo();
      expect(store.getState().tool).toBe('select');
      stop();
    }
  });

  it('leaves the move mode when the image is removed, never touches the other tools', () => {
    const { store, level } = setup();
    const stop = watchBackgroundMode(store);
    store.getState().setTool('calibrate');
    store.getState().execute('lock', updateBackground(level().id, { locked: true }));
    expect(store.getState().tool).toBe('calibrate'); // calibrating a locked image stays possible
    store.getState().execute('unlock', updateBackground(level().id, { locked: false }));
    store.getState().setTool('moveBackground');
    store.getState().execute('remove', setBackground(level().id, null));
    expect(store.getState().tool).toBe('select');
    stop();
    store.getState().undo();
    store.getState().setTool('moveBackground');
    store.getState().execute('lock', updateBackground(level().id, { locked: true }));
    expect(store.getState().tool).toBe('moveBackground'); // unsubscribed
  });
});
