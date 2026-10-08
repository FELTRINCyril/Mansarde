import type { Ring } from '../model/types';
import { signedArea } from '../geometry/polygon';

/**
 * Ear clipping with holes, written for this project (no dependency, src/core stays free of
 * three): each hole is bridged to the outer ring from its rightmost vertex (D. Eberly,
 * "Triangulation by Ear Clipping", 2002), then ears are clipped from the single weakly simple
 * ring obtained. The hole bridging and the ear test follow the approach of the earcut library
 * (mapbox/earcut, ISC) without its optimisations (z-order hashing, local intersection cures):
 * plans have a few hundred vertices at most.
 */

interface Node {
  i: number; // index in the concatenated vertices
  x: number;
  y: number;
  prev: Node;
  next: Node;
}

interface P { x: number; y: number }

/** Twice the signed area of a, b, c: > 0 when c is on the left of a -> b. */
const orient = (a: P, b: P, c: P): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const same = (a: P, b: P): boolean => a.x === b.x && a.y === b.y;

function insertAfter(i: number, p: P, last: Node | null): Node {
  const node = { i, x: p.x, y: p.y } as Node;
  if (last === null) {
    node.prev = node;
    node.next = node;
  } else {
    node.next = last.next;
    node.prev = last;
    last.next.prev = node;
    last.next = node;
  }
  return node;
}

function remove(n: Node): void {
  n.next.prev = n.prev;
  n.prev.next = n.next;
}

function size(start: Node): number {
  let n = 0;
  let p = start;
  do {
    n++;
    p = p.next;
  } while (p !== start);
  return n;
}

/**
 * Circular list of the ring, counter-clockwise (positive area) when ccw, clockwise otherwise;
 * consecutive repeated points are dropped. Null for a ring without area or with a non-finite point.
 */
function linkRing(ring: Ring, offset: number, ccw: boolean): Node | null {
  if (ring.length < 3 || ring.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const a = signedArea(ring);
  if (!(Math.abs(a) > 0)) return null;
  const forward = a > 0 === ccw;
  let last: Node | null = null;
  for (let k = 0; k < ring.length; k++) {
    const idx = forward ? k : ring.length - 1 - k;
    const p = ring[idx]!;
    if (last && same(last, p)) continue;
    last = insertAfter(offset + idx, p, last);
  }
  if (!last) return null;
  if (last.next !== last && same(last, last.next)) {
    const first = last.next;
    remove(last);
    last = first;
  }
  return size(last) >= 3 ? last : null;
}

/** b lies inside the polygon angle at node a (the polygon is counter-clockwise). */
function locallyInside(a: Node, b: P): boolean {
  if (orient(a.prev, a, a.next) > 0) return orient(a.prev, a, b) > 0 && orient(a, a.next, b) > 0;
  return orient(a.prev, a, b) > 0 || orient(a, a.next, b) > 0;
}

const pointInTriangle = (a: P, b: P, c: P, p: P): boolean => orient(a, b, p) >= 0 && orient(b, c, p) >= 0 && orient(c, a, p) >= 0;

/**
 * Vertex of the outer list visible from m (Eberly): the ray from m towards +x hits the nearest
 * edge going up (interior on its left) at i; the candidate is the end of that edge with the
 * largest x, unless a vertex lies in the triangle (m, i, candidate), in which case the one making
 * the smallest angle with the ray is taken. Among nodes sharing the chosen position (earlier
 * bridges), the one whose angle contains m.
 */
function findBridge(m: Node, outer: Node): Node | null {
  let hitX = Infinity;
  let cand: Node | null = null;
  let p = outer;
  do {
    const q = p.next;
    if (p.y <= m.y && m.y <= q.y && q.y > p.y) {
      const x = p.x + ((m.y - p.y) * (q.x - p.x)) / (q.y - p.y);
      if (x >= m.x && x < hitX) {
        hitX = x;
        cand = p.x > q.x ? p : q;
        if (x === p.x && m.y === p.y) cand = p;
        else if (x === q.x && m.y === q.y) cand = q;
      }
    }
    p = q;
  } while (p !== outer);
  if (!cand) return null;

  if (hitX !== cand.x || m.y !== cand.y) {
    const i = { x: hitX, y: m.y };
    const tri: [P, P, P] = cand.y < m.y ? [m, cand, i] : [m, i, cand];
    let best = cand;
    let bestTan = Infinity;
    let bestDist = Infinity;
    p = outer;
    do {
      if (p !== cand && p.x >= m.x && !same(p, m) && pointInTriangle(tri[0], tri[1], tri[2], p) && locallyInside(p, m)) {
        const dx = p.x - m.x;
        const tan = dx > 0 ? Math.abs(p.y - m.y) / dx : Infinity;
        const d = Math.hypot(dx, p.y - m.y);
        if (tan < bestTan || (tan === bestTan && d < bestDist)) {
          best = p;
          bestTan = tan;
          bestDist = d;
        }
      }
      p = p.next;
    } while (p !== outer);
    cand = best;
  }

  if (!locallyInside(cand, m)) {
    p = outer;
    do {
      if (same(p, cand) && locallyInside(p, m)) return p;
      p = p.next;
    } while (p !== outer);
  }
  return cand;
}

/** Splices the hole (starting at its node m) into the outer list through the bridge a <-> m. */
function splice(a: Node, m: Node): void {
  const a2 = { i: a.i, x: a.x, y: a.y } as Node;
  const m2 = { i: m.i, x: m.x, y: m.y } as Node;
  const an = a.next;
  const mp = m.prev;
  a.next = m;
  m.prev = a;
  a2.next = an;
  an.prev = a2;
  m2.next = a2;
  a2.prev = m2;
  mp.next = m2;
  m2.prev = mp;
}

function rightmost(start: Node): Node {
  let best = start;
  let p = start.next;
  while (p !== start) {
    if (p.x > best.x || (p.x === best.x && p.y < best.y)) best = p;
    p = p.next;
  }
  return best;
}

function isEar(ear: Node): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (orient(a, b, c) <= 0) return false;
  for (let p = c.next; p !== a; p = p.next) {
    if (same(p, a) || same(p, b) || same(p, c)) continue;
    if (pointInTriangle(a, b, c, p)) return false;
  }
  return true;
}

/**
 * Clips ears until three vertices are left. When a full turn finds no ear (rounding, touching
 * rings), a flat vertex is dropped (it encloses no area), or else the first convex vertex is
 * clipped anyway, so that the loop always ends.
 */
function earClip(start: Node, out: number[]): void {
  let count = size(start);
  let ear = start;
  let stop = ear;
  while (count > 3) {
    if (isEar(ear)) {
      out.push(ear.prev.i, ear.i, ear.next.i);
      const next = ear.next;
      remove(ear);
      count--;
      ear = next;
      stop = next;
      continue;
    }
    ear = ear.next;
    if (ear !== stop) continue;
    let fixed: Node | null = null;
    let p = ear;
    do {
      if (orient(p.prev, p, p.next) === 0) {
        fixed = p;
        break;
      }
      p = p.next;
    } while (p !== ear);
    if (!fixed) {
      p = ear;
      do {
        if (orient(p.prev, p, p.next) > 0) {
          out.push(p.prev.i, p.i, p.next.i);
          fixed = p;
          break;
        }
        p = p.next;
      } while (p !== ear);
    }
    if (!fixed) return;
    const next = fixed.next;
    remove(fixed);
    count--;
    ear = next;
    stop = next;
  }
  if (orient(ear.prev, ear, ear.next) > 0) out.push(ear.prev.i, ear.i, ear.next.i);
}

/**
 * Triangles covering the polygon `outer` minus `holes` (holes inside the outer ring, not
 * overlapping each other), as indices into the concatenated vertices [...outer, ...holes[0],
 * ...]. Either orientation is accepted for every ring; every triangle has a positive signed
 * area (signedArea of polygon.ts, the orientation of a counter-clockwise ring). Degenerate
 * rings (fewer than 3 points, no area, non-finite points) are ignored; a degenerate outer ring
 * gives no triangle.
 */
export function triangulate(outer: Ring, holes: Ring[]): number[] {
  const start = linkRing(outer, 0, true);
  if (!start) return [];
  const holeStarts: Node[] = [];
  let offset = outer.length;
  for (const h of holes) {
    const n = linkRing(h, offset, false);
    offset += h.length;
    if (n) holeStarts.push(rightmost(n));
  }
  holeStarts.sort((a, b) => b.x - a.x);
  for (const m of holeStarts) {
    const bridge = findBridge(m, start);
    if (bridge) splice(bridge, m);
  }
  const out: number[] = [];
  earClip(start, out);
  return out;
}
