import type { Id, Level, Ring } from '../model/types';
import type { DerivedLevel } from './derived';
import { ringEdges } from './polygon';
import { dot, sub } from './vec';
import { wallFrame } from './walls';

/** A ring point within this distance (cm) of a face line lies on that face (as in roomRect). */
const FACE_TOLERANCE = 0.05;

/**
 * Length of each face of a wall (spec 6: the wall panel shows them), 'left' being the +perp(dir)
 * face, the one the wall tool calls "Face gauche" (ruling V2-R22). Measured on the rings the
 * interior and facade dimensions are drawn from (room rings, room islands, facade rings): the
 * parts of their edges lying on the face line, within the extent of the wall's own outline on
 * that face (its miter corners, or its square end where a collinear wall goes on). A face
 * partly covered by another wall therefore only counts its visible part. On a degraded level (no
 * rooms nor facades) the extent of the outline alone. Null for an unknown wall or one without
 * an outline (zero length).
 */
export function wallFaceLengths(level: Level, d: DerivedLevel, wallId: Id): { left: number; right: number } | null {
  const wall = level.walls[wallId];
  const outline = d.outlines.get(wallId);
  if (!wall || !outline) return null;
  const f = wallFrame(level, wallId);
  const h = wall.thickness / 2;
  const t = (p: Ring[number]): number => dot(sub(p, f.start), f.dir);
  const onFace = (p: Ring[number], sign: number): boolean => Math.abs(dot(sub(p, f.start), f.normal) - sign * h) <= FACE_TOLERANCE;
  const rings: Ring[] = [...d.rooms.flatMap((r) => [r.ring, ...r.islands]), ...d.facadeRings];

  const face = (sign: number): number => {
    const ts = outline.filter((p) => onFace(p, sign)).map(t);
    if (ts.length < 2) return 0;
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    if (rings.length === 0) return hi - lo;
    let sum = 0;
    for (const ring of rings) {
      for (const [a, b] of ringEdges(ring)) {
        if (!onFace(a, sign) || !onFace(b, sign)) continue;
        const ta = t(a);
        const tb = t(b);
        sum += Math.max(0, Math.min(hi, Math.max(ta, tb)) - Math.max(lo, Math.min(ta, tb)));
      }
    }
    return sum;
  };
  return { left: face(1), right: face(-1) };
}
