import type { Recipe } from '@/core/commands/apply';
import { addObject } from '@/core/commands/objects';
import { snapObjectToWalls } from '@/core/geometry/snap';
import { createObjectFromSize } from '@/core/model/factory';
import type { Id, Level, PlacedObject, Project, Vec2 } from '@/core/model/types';
import { getCatalogEntry } from '@/catalog/catalog';
import { activeLevel, type EditorStore } from './store';

/** Drag and drop payload type of catalog items; the value is "catalog:<id>" or "custom:<id>". */
export const CATALOG_DRAG_TYPE = 'application/x-plan-maison-object';

/**
 * New object (fresh id) centered on `at` for a catalog reference: "catalog:<catalog id>" or
 * "custom:<custom object id>" of the project. Null for an unknown or malformed reference.
 */
export function objectFromRef(project: Project, ref: string, at: Vec2): PlacedObject | null {
  const sep = ref.indexOf(':');
  if (sep < 0) return null;
  const kind = ref.slice(0, sep);
  const id = ref.slice(sep + 1);
  if (kind === 'catalog') {
    const e = getCatalogEntry(id);
    if (!e) return null;
    const size = { width: e.width, depth: e.depth, height: e.height };
    return createObjectFromSize({ kind: 'catalog', catalogId: e.id }, at.x, at.y, size, e.name, e.color, {
      lshape: e.lshape ? { ...e.lshape } : null,
    });
  }
  if (kind === 'custom') {
    if (!Object.hasOwn(project.customObjects, id)) return null;
    const d = project.customObjects[id]!;
    const size = { width: d.width, depth: d.depth, height: d.height };
    return createObjectFromSize({ kind: 'custom', customObjectId: d.id }, at.x, at.y, size, d.name, d.color, {
      lshape: d.lshape ? { ...d.lshape } : null,
    });
  }
  return null;
}

/**
 * Adds the object after pulling it against the closest wall face (snapObjectToWalls, tolerance in
 * screen pixels at pxPerCm). The snap is computed here, outside the recipe, so the recipe stays
 * deterministic.
 */
export function placeObjectRecipe(levelId: Id, o: PlacedObject, level: Level, pxPerCm: number): Recipe {
  const s = snapObjectToWalls(o, level, pxPerCm);
  return addObject(levelId, { ...o, x: s.x, y: s.y, rotation: s.rotation });
}

/** Places a catalog or custom object on the active level at `at` (snapped), then selects it. */
export function placeObjectAt(store: EditorStore, ref: string, at: Vec2): boolean {
  const s = store.getState();
  const level = activeLevel(s);
  if (!s.project || !level) return false;
  const o = objectFromRef(s.project, ref, at);
  if (!o) return false;
  if (!s.execute('Ajouter un objet', placeObjectRecipe(level.id, o, level, s.view.pxPerCm))) return false;
  store.getState().setSelection([{ kind: 'object', id: o.id }]);
  return true;
}
