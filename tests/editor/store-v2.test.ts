import { describe, expect, it } from 'vitest';
import { createEditorStore } from '@/editor/store';
import { emptyProject } from '../core/helpers';

describe('display options of the checks (spec 7.4)', () => {
  it('alerts are shown and the checks panel is collapsed by default', () => {
    const d = createEditorStore().getState().display;
    expect(d.hideAlerts).toBe(false);
    expect(d.checksOpen).toBe(false);
  });

  it('setDisplay changes hideAlerts and checksOpen without touching the other options', () => {
    const store = createEditorStore();
    const before = store.getState().display;
    store.getState().setDisplay({ hideAlerts: true });
    store.getState().setDisplay({ checksOpen: true });
    expect(store.getState().display).toEqual({ ...before, hideAlerts: true, checksOpen: true });
  });

  it('the options last for the session: opening another project keeps them', () => {
    const store = createEditorStore();
    store.getState().openProject(emptyProject());
    store.getState().setDisplay({ hideAlerts: true, checksOpen: true });
    store.getState().openProject(emptyProject());
    expect(store.getState().display.hideAlerts).toBe(true);
    expect(store.getState().display.checksOpen).toBe(true);
  });
});
