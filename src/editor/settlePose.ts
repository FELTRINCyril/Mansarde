import { applyCommand, type Recipe } from '@/core/commands/apply';
import { setObjectTransform, updateObject } from '@/core/commands/objects';
import { snapToWallForPose, supportElevation } from '@/core/geometry/pose';
import type { CustomObjectDef, Id, Level, PlacedObject, Project, Vec2 } from '@/core/model/types';

/**
 * Pose of objects that were just moved (spec 5.3), computed on `level`, the level after the move:
 * an 'onTop' object takes the elevation of its support under its center (supportElevation, 0 when
 * none); with `wallSnap` (a single object dragged alone, without Alt) a 'wall' object is set
 * against the nearest wall face (snapToWallForPose). The recipes are appended to the move, so
 * that it stays one history entry. Used at the release of a drag, after a typed distance and
 * after an arrow nudge.
 */
export function poseFixes(level: Level, objectIds: Id[], wallSnap: boolean, customObjects: Record<Id, CustomObjectDef>): Recipe[] {
  const fixes: Recipe[] = [];
  for (const id of objectIds) {
    const o = level.objects[id];
    if (!o) continue;
    if (o.pose === 'onTop') {
      const elevation = supportElevation(level, id, o, customObjects);
      if (elevation !== o.elevation) fixes.push(updateObject(level.id, id, { elevation }));
    } else if (o.pose === 'wall' && wallSnap) {
      const t = snapToWallForPose(o, level);
      if (t && (t.x !== o.x || t.y !== o.y || t.rotation !== o.rotation)) fixes.push(setObjectTransform(level.id, id, t));
    }
  }
  return fixes;
}

/**
 * `move` followed by the pose of the moved objects (poseFixes without wall snap, as for a typed
 * distance), as one recipe. The level after the move is computed here, outside the recipe, so
 * the recipe stays deterministic; `move` alone when it is refused or nothing needs posing.
 */
export function withPose(project: Project, levelId: Id, move: Recipe, objectIds: Id[]): Recipe {
  if (objectIds.length === 0) return move;
  const r = applyCommand(project, move, { validate: false });
  const level = r.ok ? r.project.levels.find((l) => l.id === levelId) : undefined;
  const fixes = level ? poseFixes(level, objectIds, false, project.customObjects) : [];
  if (fixes.length === 0) return move;
  return (draft) => {
    move(draft);
    for (const fix of fixes) fix(draft);
  };
}

/**
 * Objects about to be added at +delta (paste, duplicate) with the pose of a drop (spec 5.3): an
 * 'onTop' copy takes the elevation of its support under its new center, the other copies
 * counting as supports (a lamp pasted with its table lands on the copy of the table). Positions
 * are left as they are (the paste adds delta).
 */
export function settledCopies(level: Level, objects: PlacedObject[], delta: Vec2, customObjects: Record<Id, CustomObjectDef>): PlacedObject[] {
  if (!objects.some((o) => o.pose === 'onTop')) return objects;
  const keyOf = (i: number): Id => `\u0000paste-${i}`; // cannot collide with a real id
  const shifted = objects.map((o, i) => ({ ...o, id: keyOf(i), x: o.x + delta.x, y: o.y + delta.y }));
  const withCopies: Level = { ...level, objects: { ...level.objects, ...Object.fromEntries(shifted.map((o) => [o.id, o])) } };
  return objects.map((o, i) => (o.pose === 'onTop' ? { ...o, elevation: supportElevation(withCopies, keyOf(i), shifted[i]!, customObjects) } : o));
}
