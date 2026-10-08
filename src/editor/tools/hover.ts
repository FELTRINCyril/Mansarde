import { dot, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import type { Id, Level, Vec2 } from '@/core/model/types';

/**
 * Wall the cursor hovers: its axis projection lies within the wall and its distance to the axis is at
 * most half the thickness + tol (cm); the closest such wall. Shared by the selection tool (opening
 * drags) and the door / window tools.
 */
export function hoveredWall(level: Level, p: Vec2, tol: number): Id | null {
  let best: Id | null = null;
  let bestD = Infinity;
  for (const w of Object.values(level.walls)) {
    const f = wallFrame(level, w.id);
    if (f.length < 1e-9) continue;
    const v = sub(p, f.start);
    const along = dot(v, f.dir);
    if (along < 0 || along > f.length) continue;
    const across = Math.abs(dot(v, f.normal));
    if (across <= w.thickness / 2 + tol && across < bestD) {
      best = w.id;
      bestD = across;
    }
  }
  return best;
}
