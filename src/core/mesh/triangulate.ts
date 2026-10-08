import type { Ring, Vec2 } from '../model/types';
import { signedArea } from '../geometry/polygon';

/**
 * Ear clipping with holes, written for this project (no dependency, src/core stays free of
 * three): each hole is bridged to the outer ring from its rightmost vertex (D. Eberly,
 * "Triangulation by Ear Clipping", 2002), then ears are clipped from the single weakly simple
 * ring obtained. The hole bridging and the ear test follow the approach of the earcut library
 * (mapbox/earcut, ISC) without its optimisations (z-order hashing, local intersection cures):
 * plans have a few hundred vertices at most. The result is checked (orientation, total area,
 * centroids inside); when it cannot be proven right, an exact trapezoid decomposition is used.
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
 * Clips ears until three vertices are left. When a full turn finds no ear, a flat vertex (it
 * encloses no area) is dropped; if there is none, the clipping gives up and returns false (the
 * caller falls back to an exact decomposition: no triangle is ever forced).
 */
function earClip(start: Node, out: number[]): boolean {
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
    let flat: Node | null = null;
    let p = ear;
    do {
      if (orient(p.prev, p, p.next) === 0) {
        flat = p;
        break;
      }
      p = p.next;
    } while (p !== ear);
    if (!flat) return false;
    const next = flat.next;
    remove(flat);
    count--;
    ear = next;
    stop = next;
  }
  if (orient(ear.prev, ear, ear.next) > 0) out.push(ear.prev.i, ear.i, ear.next.i);
  return true;
}

/** Holes thinner than this (cm, 2 x area / perimeter) or smaller than MIN_AREA (cm2) are slivers. */
const MIN_THICKNESS = 1e-3;
const MIN_AREA = 1e-6;

function perimeter(r: Ring): number {
  let l = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    l += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return l;
}

/** A ring of finite points enclosing an area that is neither tiny nor a hairline. */
export function isSubstantialRing(r: Ring): boolean {
  if (r.length < 3 || r.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const a = Math.abs(signedArea(r));
  return a >= MIN_AREA && (2 * a) / perimeter(r) >= MIN_THICKNESS;
}

/** Even-odd containment in a set of rings. */
function inRings(p: P, rings: Ring[]): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i]!;
      const b = r[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Ear clipping of the outer ring and the kept holes; null unless the result is proven right:
 * every triangle counter-clockwise, their areas adding up to the net area of the polygon, and the
 * centroid of every non-negligible triangle inside the polygon.
 */
function earTriangles(outer: Ring, holes: Array<{ ring: Ring; offset: number }>, net: number): number[] | null {
  const start = linkRing(outer, 0, true);
  if (!start) return null;
  const holeStarts: Node[] = [];
  for (const h of holes) {
    const n = linkRing(h.ring, h.offset, false);
    if (n) holeStarts.push(rightmost(n));
  }
  holeStarts.sort((a, b) => b.x - a.x);
  for (const m of holeStarts) {
    const bridge = findBridge(m, start);
    if (!bridge) return null;
    splice(bridge, m);
  }
  const out: number[] = [];
  if (!earClip(start, out)) return null;
  const pts = (i: number): P => {
    if (i < outer.length) return outer[i]!;
    const h = holes.find((x) => i >= x.offset && i < x.offset + x.ring.length)!;
    return h.ring[i - h.offset]!;
  };
  const rings = [outer, ...holes.map((h) => h.ring)];
  let sum = 0;
  for (let t = 0; t < out.length; t += 3) {
    const a = pts(out[t]!);
    const b = pts(out[t + 1]!);
    const c = pts(out[t + 2]!);
    const s = orient(a, b, c) / 2;
    if (s < 0) return null;
    sum += s;
    if (s > 1e-9 * net && !inRings({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }, rings)) return null;
  }
  return Math.abs(sum - net) <= 1e-9 * net + 1e-9 ? out : null;
}

/**
 * Exact decomposition into trapezoids, used when the ear clipping cannot be proven right (rings
 * touching at a vertex, rounding): vertical strips between consecutive vertex abscissas, in which
 * the edges crossing the strip are paired by the even-odd rule. Corners that are not input
 * vertices are appended to `points`.
 */
function trapezoids(rings: Ring[], points: Vec2[]): number[] {
  const index = new Map<string, number>();
  points.forEach((p, i) => {
    const k = `${p.x},${p.y}`;
    if (!index.has(k)) index.set(k, i);
  });
  const id = (x: number, y: number): number => {
    const k = `${x},${y}`;
    let i = index.get(k);
    if (i === undefined) {
      i = points.length;
      points.push({ x, y });
      index.set(k, i);
    }
    return i;
  };
  const edges: Array<[P, P]> = [];
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % r.length]!;
      if (a.x !== b.x) edges.push(a.x < b.x ? [a, b] : [b, a]);
    }
  }
  const xs = [...new Set(rings.flat().map((p) => p.x))].sort((a, b) => a - b);
  const yAt = ([a, b]: [P, P], x: number): number => (x === a.x ? a.y : x === b.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
  const out: number[] = [];
  for (let k = 0; k + 1 < xs.length; k++) {
    const x0 = xs[k]!;
    const x1 = xs[k + 1]!;
    const xm = (x0 + x1) / 2;
    const active = edges.filter(([a, b]) => a.x <= x0 && b.x >= x1).sort((e, f) => yAt(e, xm) - yAt(f, xm));
    for (let j = 0; j + 1 < active.length; j += 2) {
      const lo = active[j]!;
      const hi = active[j + 1]!;
      const q = [id(x0, yAt(lo, x0)), id(x1, yAt(lo, x1)), id(x1, yAt(hi, x1)), id(x0, yAt(hi, x0))];
      for (const [u, v, w] of [
        [q[0]!, q[1]!, q[2]!],
        [q[0]!, q[2]!, q[3]!],
      ] as const) {
        if (orient(points[u]!, points[v]!, points[w]!) > 0) out.push(u, v, w);
      }
    }
  }
  return out;
}

/**
 * Triangles covering the polygon `outer` minus `holes` (holes inside the outer ring, not
 * overlapping each other; they may touch it or each other at vertices). `points` starts with the
 * concatenated input vertices [...outer, ...holes[0], ...]; it is followed by the vertices added
 * when the polygon had to be split into trapezoids. Every triangle has a positive signed area
 * (signedArea of polygon.ts). Either orientation is accepted for every ring. Sliver holes (area
 * under 1e-6 cm2 or thinner than 1e-3 cm) are filled; a degenerate outer ring gives no triangle.
 */
export function triangulatePolygon(outer: Ring, holes: Ring[]): { points: Vec2[]; indices: number[] } {
  const points: Vec2[] = [...outer, ...holes.flat()].map((p) => ({ x: p.x, y: p.y }));
  if (!isSubstantialRing(outer)) return { points, indices: [] };
  const kept: Array<{ ring: Ring; offset: number }> = [];
  let offset = outer.length;
  for (const h of holes) {
    if (isSubstantialRing(h)) kept.push({ ring: h, offset });
    offset += h.length;
  }
  const net = Math.abs(signedArea(outer)) - kept.reduce((s, h) => s + Math.abs(signedArea(h.ring)), 0);
  if (!(net > 0)) return { points, indices: [] };
  const ears = earTriangles(outer, kept, net);
  if (ears) return { points, indices: ears };
  return { points, indices: trapezoids([outer, ...kept.map((h) => h.ring)], points) };
}

/**
 * Triangles of the polygon `outer` minus `holes` as indices into the concatenated vertices
 * [...outer, ...holes[0], ...] (see triangulatePolygon, whose result this is when it needs no
 * added vertex). A polygon that can only be covered with added vertices gives no triangle here:
 * the mesh code uses triangulatePolygon.
 */
export function triangulate(outer: Ring, holes: Ring[]): number[] {
  const n = outer.length + holes.reduce((s, h) => s + h.length, 0);
  const { points, indices } = triangulatePolygon(outer, holes);
  return points.length === n ? indices : [];
}
