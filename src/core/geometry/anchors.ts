import type { Anchor, Level, Vec2 } from '../model/types';
import { objectCorners } from './objects';

/** World position of a dimension anchor; null when the node or object it points to does not exist. */
export function resolveAnchor(level: Level, a: Anchor): Vec2 | null {
  switch (a.kind) {
    case 'node': {
      const n = level.nodes[a.nodeId];
      return n ? { x: n.x, y: n.y } : null;
    }
    case 'objectCorner': {
      const o = level.objects[a.objectId];
      return o ? (objectCorners(o)[a.corner] ?? null) : null;
    }
    case 'point':
      return { x: a.x, y: a.y };
  }
}
