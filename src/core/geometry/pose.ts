import type { CustomObjectDef, Id, Level, PlacedObject, Vec2 } from '../model/types';
import { objectFootprint, objectShape } from './objects';
import { pointInRing } from './polygon';
import { snapObjectToWallFaces } from './snap';

/**
 * Elevation of an object put down at `at` with the 'onTop' pose (spec 5.3): the highest top
 * (elevation + height) of the 'floor' and 'tuckable' objects of the level, other than objectId,
 * whose footprint contains `at`; 0 when there is none. Rugs, objects on top of others and wall
 * objects never carry anything.
 */
export function supportElevation(level: Level, objectId: Id | null, at: Vec2, customObjects: Record<Id, CustomObjectDef>): number {
  let top = 0;
  for (const o of Object.values(level.objects)) {
    if (o.id === objectId || (o.pose !== 'floor' && o.pose !== 'tuckable')) continue;
    const t = o.elevation + o.height;
    if (t > top && pointInRing(at, objectFootprint(o, objectShape(o, customObjects)))) top = t;
  }
  return top;
}

/**
 * Position of a 'wall' object put down near a wall (spec 5.3): its back against the nearest wall
 * face (see snapObjectToWalls), when its back edge is at most 2 * depth from that face; null
 * otherwise. The elevation is left to the caller (kept).
 */
export function snapToWallForPose(o: PlacedObject, level: Level): { x: number; y: number; rotation: number } | null {
  const snap = snapObjectToWallFaces(o, level, 2 * o.depth);
  return snap ? { x: snap.x, y: snap.y, rotation: snap.rotation } : null;
}
