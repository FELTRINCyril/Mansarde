import { createLevel } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Id, Level } from '@/core/model/types';

/** [x1, y1, x2, y2, thickness?] - thickness defaults to 20 cm. */
export type WallSegment = [number, number, number, number, number?];

/** Builds a level from wall segments; endpoints closer than 1e-6 share a single node. */
export function levelFromWalls(segments: WallSegment[]): Level {
  const level = createLevel('Test', 0, 250);
  const nodeAt = (x: number, y: number): Id => {
    for (const n of Object.values(level.nodes)) {
      if (Math.hypot(n.x - x, n.y - y) < 1e-6) return n.id;
    }
    const id = newId();
    level.nodes[id] = { id, x, y };
    return id;
  };
  for (const [x1, y1, x2, y2, thickness = 20] of segments) {
    const id = newId();
    level.walls[id] = {
      id,
      startNodeId: nodeAt(x1, y1),
      endNodeId: nodeAt(x2, y2),
      thickness,
      height: 250,
    };
  }
  return level;
}

/** The 4 axis segments of a rectangle (x1, y1)-(x2, y2), clockwise on screen. */
export function rectRoom(x1: number, y1: number, x2: number, y2: number, t = 20): WallSegment[] {
  return [
    [x1, y1, x2, y1, t],
    [x2, y1, x2, y2, t],
    [x2, y2, x1, y2, t],
    [x1, y2, x1, y1, t],
  ];
}
