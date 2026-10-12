import type { Check, CheckTarget } from '@/core/checks/types';
import { cupboardFootprint } from '@/core/geometry/cupboards';
import { objectFootprint, objectShape } from '@/core/geometry/objects';
import { openingCutRing } from '@/core/geometry/openings';
import { bbox } from '@/core/geometry/polygon';
import type { CustomObjectDef, Id, Level, Ring } from '@/core/model/types';
import { activeLevel, type EditorStore } from './store';
import { centerOnBounds, type Bounds } from './view';

/** Footprint of a check target, null when the element (or the wall carrying it) is gone. */
function targetRing(level: Level, t: CheckTarget, customObjects: Record<Id, CustomObjectDef>): Ring | null {
  switch (t.kind) {
    case 'object': {
      const o = Object.hasOwn(level.objects, t.id) ? level.objects[t.id]! : null;
      return o && objectFootprint(o, objectShape(o, customObjects));
    }
    case 'cupboard': {
      const c = Object.hasOwn(level.cupboards, t.id) ? level.cupboards[t.id]! : null;
      return c && Object.hasOwn(level.walls, c.wallId) ? cupboardFootprint(level, c) : null;
    }
    case 'opening': {
      const o = Object.hasOwn(level.openings, t.id) ? level.openings[t.id]! : null;
      return o && Object.hasOwn(level.walls, o.wallId) ? openingCutRing(level, o) : null;
    }
  }
}

/** Bounding box of the footprints of the targets that still exist; null when none does. */
export function targetsBounds(level: Level, targets: CheckTarget[], customObjects: Record<Id, CustomObjectDef>): Bounds | null {
  const points = targets.flatMap((t) => targetRing(level, t, customObjects) ?? []);
  return bbox(points);
}

/**
 * A row of the checks panel was clicked (spec 7.4): the select tool, the targets selected, the
 * plan centered on their box (zoomed out only if they do not fit). The view is kept when the plan
 * has no size (3D only layout).
 */
export function focusCheck(store: EditorStore, check: Check, viewport: { width: number; height: number }): void {
  const s = store.getState();
  if (s.tool !== 'select') s.setTool('select');
  store.getState().setSelection(check.targets.map((t) => ({ kind: t.kind, id: t.id })));
  const level = activeLevel(store.getState());
  const project = store.getState().project;
  if (!level || !project || viewport.width <= 0 || viewport.height <= 0) return;
  const bounds = targetsBounds(level, check.targets, project.customObjects);
  if (bounds) store.getState().setView(centerOnBounds(store.getState().view, bounds, viewport));
}
