import type { Vec2 } from '../model/types';
import { add, dist, lineIntersection, normalize, perp, scale, sub } from './vec';

const SAME_POINT = 1e-9;

/**
 * Polyline offset used by the wall tool's reference line (spec 6): every segment moves by `offset`
 * along +perp(direction) (positive = left of travel, as for openings and slopes), and each inner
 * vertex becomes the miter point where the two offset lines meet. Open chain: the first and last
 * points move along the normal of their only segment. Closed chain: the closing segment counts and
 * every vertex is mitered; the first point may be repeated at the end or not, the result keeps
 * the same form. Consecutive duplicate points are merged (one output point for them). Where the
 * chain turns back on itself (opposite directions), the point moves along the normal of the
 * incoming segment; no miter limit otherwise (a very sharp turn gives a long miter).
 */
export function offsetChain(points: Vec2[], offset: number, closed: boolean): Vec2[] {
  const pts = points.filter((p, i) => i === 0 || dist(p, points[i - 1]!) > SAME_POINT).map((p) => ({ x: p.x, y: p.y }));
  const repeated = closed && pts.length >= 2 && dist(pts[0]!, pts[pts.length - 1]!) <= SAME_POINT;
  if (repeated) pts.pop();
  if (pts.length < 2) return pts;

  const n = pts.length;
  const segments = closed ? n : n - 1;
  const dirs: Vec2[] = [];
  for (let i = 0; i < segments; i++) dirs.push(normalize(sub(pts[(i + 1) % n]!, pts[i]!)));

  const shifted = (p: Vec2, d: Vec2): Vec2 => add(p, scale(perp(d), offset));
  const out = pts.map((p, i) => {
    const incoming = closed ? dirs[(i - 1 + n) % n]! : dirs[i - 1];
    const outgoing = closed ? dirs[i]! : dirs[i];
    if (!incoming) return shifted(p, outgoing!);
    if (!outgoing) return shifted(p, incoming);
    // parallel lines (straight on, or turning back): no intersection, keep the incoming normal
    return lineIntersection(shifted(p, incoming), incoming, shifted(p, outgoing), outgoing) ?? shifted(p, incoming);
  });
  if (repeated) out.push({ ...out[0]! });
  return out;
}
