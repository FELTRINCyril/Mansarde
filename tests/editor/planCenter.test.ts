import { describe, expect, it } from 'vitest';
import { planCenter } from '@/editor/planCenter';
import { createEditorStore } from '@/editor/store';
import { rectRoom } from '../core/fixtures';
import { emptyProject, projectFrom } from '../core/helpers';

describe('planCenter (review I3: editor opened in the 3D layout)', () => {
  it('plan never measured: the center of the level the plan will fit, not the default view origin', () => {
    const store = createEditorStore();
    store.getState().openProject(projectFrom(rectRoom(-10, -10, 410, 410)));
    const c = planCenter(store.getState(), { width: 0, height: 0 });
    expect(c.x).toBeCloseTo(200, 6);
    expect(c.y).toBeCloseTo(200, 6);
  });

  it('plan never measured on an empty level: the origin, where the fitted plan is centered', () => {
    const store = createEditorStore();
    store.getState().openProject(emptyProject());
    expect(planCenter(store.getState(), { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('measured plan: the world point under the middle of the plan view', () => {
    const store = createEditorStore();
    store.getState().openProject(projectFrom(rectRoom(-10, -10, 410, 410)));
    store.getState().setView({ pxPerCm: 2, tx: 100, ty: 50 });
    expect(planCenter(store.getState(), { width: 800, height: 600 })).toEqual({ x: 150, y: 125 });
  });
});
