import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyNumericInput, cancelNumericInput, closeNumericInput, NUMERIC_FIELD_SIZE, openNumericInput,
  numericSession, placeNumericField, submitNumeric,
} from '@/editor/numericOverlay';
import { createEditorStore, createOverlay } from '@/editor/store';
import { TOOLS, type Tool, type ToolContext } from '@/editor/tools/types';

const ctx = (store: ReturnType<typeof createEditorStore>): ToolContext => ({
  store, toWorld: (s) => s, pxPerCm: () => 1, fitView: () => {},
});

const original = TOOLS.wall;
afterEach(() => {
  if (original) TOOLS.wall = original;
  else delete TOOLS.wall;
});

function spyTool() {
  const tool = { id: 'wall', cursor: 'crosshair', onNumericSubmit: vi.fn(), onNumericCancel: vi.fn() } satisfies Tool;
  TOOLS.wall = tool;
  return tool;
}

describe('numeric overlay store state', () => {
  it('createOverlay has no numeric input', () => {
    expect(createOverlay().numericInput).toBeNull();
  });
  it('openNumericInput stores value, position, kind and label; closeNumericInput clears it', () => {
    const store = createEditorStore();
    openNumericInput(store, { initial: '3', screen: { x: 10, y: 20 }, kind: 'nonNegative', label: 'Longueur' });
    expect(store.getState().overlay.numericInput).toEqual({
      value: '3', screen: { x: 10, y: 20 }, kind: 'nonNegative', label: 'Longueur',
    });
    closeNumericInput(store);
    expect(store.getState().overlay.numericInput).toBeNull();
  });
  it('setTool clears the field', () => {
    const store = createEditorStore();
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    store.getState().setTool('wall');
    expect(store.getState().overlay.numericInput).toBeNull();
  });
});

describe('numericSession', () => {
  it('changes at every opening, but not when the text is typed or the field closed', () => {
    const store = createEditorStore();
    const before = numericSession();
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    const first = numericSession();
    expect(first).not.toBe(before);
    store.getState().setOverlay({ numericInput: { ...store.getState().overlay.numericInput!, value: '35' } });
    closeNumericInput(store);
    expect(numericSession()).toBe(first);
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    expect(numericSession()).not.toBe(first);
  });
});

describe('submitNumeric', () => {
  it('parses per kind', () => {
    expect(submitNumeric('350', 'positive')).toEqual({ ok: true, value: 350 });
    expect(submitNumeric('3,5 m', 'positive')).toEqual({ ok: true, value: 350 });
    expect(submitNumeric('0', 'positive')).toEqual({ ok: false });
    expect(submitNumeric('0', 'nonNegative')).toEqual({ ok: true, value: 0 });
    expect(submitNumeric('-40', 'signed')).toEqual({ ok: true, value: -40 });
    expect(submitNumeric('-40', 'nonNegative')).toEqual({ ok: false });
    expect(submitNumeric('90\u00b0', 'angle')).toEqual({ ok: true, value: 90 });
    expect(submitNumeric('abc', 'positive')).toEqual({ ok: false });
    expect(submitNumeric('', 'signed')).toEqual({ ok: false });
  });
  it('keeps the R5 bound on positive values', () => {
    expect(submitNumeric('100001', 'positive')).toEqual({ ok: false });
    expect(submitNumeric('100000', 'positive')).toEqual({ ok: true, value: 100000 });
  });
});

describe('applyNumericInput / cancelNumericInput', () => {
  it('valid text closes the field then calls the active tool with the value', () => {
    const store = createEditorStore();
    const tool = spyTool();
    store.setState({ tool: 'wall' });
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    const c = ctx(store);
    expect(applyNumericInput(store, c, '350')).toBe(true);
    expect(store.getState().overlay.numericInput).toBeNull();
    expect(tool.onNumericSubmit).toHaveBeenCalledWith(350, c);
    expect(tool.onNumericCancel).not.toHaveBeenCalled();
  });
  it('invalid text keeps the field open and calls nothing', () => {
    const store = createEditorStore();
    const tool = spyTool();
    store.setState({ tool: 'wall' });
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    expect(applyNumericInput(store, ctx(store), 'abc')).toBe(false);
    expect(store.getState().overlay.numericInput).not.toBeNull();
    expect(tool.onNumericSubmit).not.toHaveBeenCalled();
  });
  it('cancel closes the field and notifies the tool once; a closed field is a no-op', () => {
    const store = createEditorStore();
    const tool = spyTool();
    store.setState({ tool: 'wall' });
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    cancelNumericInput(store, ctx(store));
    cancelNumericInput(store, ctx(store));
    expect(store.getState().overlay.numericInput).toBeNull();
    expect(tool.onNumericCancel).toHaveBeenCalledTimes(1);
    expect(applyNumericInput(store, ctx(store), '350')).toBe(false);
    expect(tool.onNumericSubmit).not.toHaveBeenCalled();
  });
  it('works with a tool that has no numeric handlers', () => {
    const store = createEditorStore();
    openNumericInput(store, { initial: '3', screen: { x: 0, y: 0 }, kind: 'positive' });
    expect(applyNumericInput(store, ctx(store), '350')).toBe(true);
  });
});

describe('placeNumericField', () => {
  const canvas = { width: 800, height: 600 };
  it('sits next to the cursor', () => {
    expect(placeNumericField({ x: 100, y: 100 }, canvas)).toEqual({ x: 114, y: 114 });
  });
  it('stays inside the canvas near the right and bottom edges', () => {
    const at = placeNumericField({ x: 795, y: 598 }, canvas);
    expect(at).toEqual({ x: 800 - NUMERIC_FIELD_SIZE.x, y: 600 - NUMERIC_FIELD_SIZE.y });
  });
  it('never goes negative, even in a tiny canvas', () => {
    expect(placeNumericField({ x: -50, y: -50 }, { width: 50, height: 10 })).toEqual({ x: 0, y: 0 });
  });
});
