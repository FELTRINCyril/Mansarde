import type { Vec2 } from '../model/types';
import { add, dist, lineIntersection, normalize, perp, scale, sub } from './vec';

const SAME_POINT = 1e-9;

/** Ruling V2-R9: a miter point farther than this many times |offset| from its vertex is beveled. */
const MITER_LIMIT = 4;

/**
 * Polyline offset used by the wall tool's reference line (spec 6): every segment moves by `offset`
 * along +perp(direction) (positive = left of travel, as for openings and slopes), and each inner
 * vertex becomes the miter point where the two offset lines meet. Open chain: the first and last
 * points move along the normal of their only segment. Closed chain: the closing segment counts and
 * every vertex is mitered; the first point may be repeated at the end or not, the result keeps
 * the same form. Consecutive duplicate points are merged (one output point for them). Miter
 * limit (ruling V2-R9): when the miter point would be farther than 4 x |offset| from its vertex
 * (sharp turn, or turning back on itself), the corner is beveled: two points, the vertex shifted
 * along the incoming normal then along the outgoing normal, so the result can have more points
 * than the input.
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
  const out = pts.flatMap((p, i) => {
    const incoming = closed ? dirs[(i - 1 + n) % n]! : dirs[i - 1];
    const outgoing = closed ? dirs[i]! : dirs[i];
    if (!incoming) return [shifted(p, outgoing!)];
    if (!outgoing) return [shifted(p, incoming)];
    const a = shifted(p, incoming);
    const b = shifted(p, outgoing);
    if (dist(a, b) <= SAME_POINT) return [a]; // straight on
    const miter = lineIntersection(a, incoming, b, outgoing);
    if (miter && dist(miter, p) <= MITER_LIMIT * Math.abs(offset)) return [miter];
    return [a, b]; // bevel (also when the chain turns back on itself)
  });
  if (repeated) out.push({ ...out[0]! });
  return out;
}
