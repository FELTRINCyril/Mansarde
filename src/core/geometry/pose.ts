import type { CustomObjectDef, Id, Level, PlacedObject, Vec2 } from '../model/types';
import { cupboardFootprint } from './cupboards';
import { objectFootprint, objectShape } from './objects';
import { pointInRing } from './polygon';
import { snapObjectToWallFaces } from './snap';
import { cupboardCarries, objectCarries } from './support';

/**
 * Elevation of an object put down at `at` with the 'onTop' pose (spec 5.3): the highest top of
 * what can carry it (objectCarries / cupboardCarries, the definition the checks use too, ruling
 * V2-R37) whose footprint contains `at`: elevation + height of an object other than objectId,
 * height of a fixed cupboard; 0 when there is none. A cupboard whose wall is missing (broken
 * file) is not placed, so it carries nothing.
 */
export function supportElevation(level: Level, objectId: Id | null, at: Vec2, customObjects: Record<Id, CustomObjectDef>): number {
  let top = 0;
  for (const o of Object.values(level.objects)) {
    if (o.id === objectId || !objectCarries(o)) continue;
    const t = o.elevation + o.height;
    if (t > top && pointInRing(at, objectFootprint(o, objectShape(o, customObjects)))) top = t;
  }
  for (const c of Object.values(level.cupboards)) {
    if (!cupboardCarries(c) || !(c.height > top) || !hasWall(level, c.wallId)) continue;
    if (pointInRing(at, cupboardFootprint(level, c))) top = c.height;
  }
  return top;
}

const hasWall = (level: Level, wallId: Id): boolean => {
  const w = Object.hasOwn(level.walls, wallId) ? level.walls[wallId] : undefined;
  return !!w && Object.hasOwn(level.nodes, w.startNodeId) && Object.hasOwn(level.nodes, w.endNodeId);
};

/**
 * Position of a 'wall' object put down near a wall (spec 5.3): its back against the nearest wall
 * face (see snapObjectToWalls), when its back edge is at most 2 * depth from that face; null
 * otherwise. The elevation is left to the caller (kept).
 */
export function snapToWallForPose(o: PlacedObject, level: Level): { x: number; y: number; rotation: number } | null {
  const snap = snapObjectToWallFaces(o, level, 2 * o.depth);
  return snap ? { x: snap.x, y: snap.y, rotation: snap.rotation } : null;
}
