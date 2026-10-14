/**
 * Top view outline of a normalized model (spec 6): the model lies in the unit box
 * [-0.5, 0.5] x [0, 1] x [-0.5, 0.5] (y up), seen from above on a grid. Rings are flat
 * [x0, y0, x1, y1, ...] arrays in thousandths of the box, x right, y = model +z (the front, plan +y).
 */

export interface TopTriangle {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
}

export interface Outline {
  outline: number[][];
  /** Upper parts (at least DETAIL_LEVEL of the top), drawn as lines. */
  detail: number[][];
}

const DETAIL_LEVEL = 0.6;
/** Holes smaller than this share of the outline area are filled. */
const HOLE_FILL = 0.02;
/** Rings smaller than this share of the outline area are dropped. */
const RING_MIN = 0.005;
/** Douglas-Peucker tolerance, in cells. */
const SIMPLIFY = 0.6;
const DETAIL_MIN = 0.03;
const DETAIL_MAX = 0.9;

export function computeOutline(tris: TopTriangle[], grid = 128): Outline {
  const heights = rasterize(tris, grid);
  const mask = close(Array.from(heights, (h) => h > -Infinity), grid);
  const total = fillHoles(mask, grid);
  if (total === 0) return { outline: [], detail: [] };
  const outline = rings(mask, grid, total);
  let top = -Infinity;
  for (const h of heights) top = Math.max(top, h);
  const level = DETAIL_LEVEL * top;
  const high = close(Array.from(heights, (h) => h >= level), grid);
  const highCount = fillHoles(high, grid);
  const share = highCount / total;
  const detail = top > 0 && share >= DETAIL_MIN && share <= DETAIL_MAX ? rings(high, grid, highCount) : [];
  return { outline, detail };
}

/** Highest point of the triangles over each cell (-Infinity where there is none). */
function rasterize(tris: TopTriangle[], g: number): Float64Array {
  const h = new Float64Array(g * g).fill(-Infinity);
  const toCell = (v: number) => (v + 0.5) * g; // continuous cell coordinate
  const mark = (i: number, j: number, y: number) => {
    if (i < 0 || j < 0 || i >= g || j >= g) return;
    const k = j * g + i;
    if (y > h[k]!) h[k] = y;
  };
  for (const t of tris) {
    const ax = toCell(t.a[0]), az = toCell(t.a[2]);
    const bx = toCell(t.b[0]), bz = toCell(t.b[2]);
    const cx = toCell(t.c[0]), cz = toCell(t.c[2]);
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) > 1e-12) {
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(g - 1, Math.ceil(Math.max(ax, bx, cx)));
      const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), j1 = Math.min(g - 1, Math.ceil(Math.max(az, bz, cz)));
      const eps = 1e-9;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = i + 0.5, pz = j + 0.5;
          const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
          const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < -eps || l2 < -eps || l3 < -eps) continue;
          mark(i, j, l1 * t.a[1] + l2 * t.b[1] + l3 * t.c[1]);
        }
      }
    }
    // edges, so that faces seen edge-on (thin vertical panels) still show
    const edge = (p: [number, number, number], q: [number, number, number]) => {
      const px = toCell(p[0]), pz = toCell(p[2]), qx = toCell(q[0]), qz = toCell(q[2]);
      const steps = Math.max(1, Math.ceil(2 * Math.hypot(qx - px, qz - pz)));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        mark(Math.floor(px + u * (qx - px)), Math.floor(pz + u * (qz - pz)), p[1] + u * (q[1] - p[1]));
      }
    };
    edge(t.a, t.b);
    edge(t.b, t.c);
    edge(t.c, t.a);
  }
  return h;
}

/** Morphological closing by one cell (dilate, then erode with the outside counting as set). */
function close(m: boolean[], g: number): boolean[] {
  const at = (a: boolean[], i: number, j: number, outside: boolean) => (i < 0 || j < 0 || i >= g || j >= g ? outside : a[j * g + i]!);
  const dilated = m.map((_, k) => {
    const i = k % g, j = (k - i) / g;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (at(m, i + di, j + dj, false)) return true;
    return false;
  });
  return dilated.map((_, k) => {
    const i = k % g, j = (k - i) / g;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!at(dilated, i + di, j + dj, true)) return false;
    return true;
  });
}

/** Fills, in place, the empty regions not reached from the border and smaller than HOLE_FILL; returns the set count. */
function fillHoles(m: boolean[], g: number): number {
  const seen = new Uint8Array(g * g);
  let count = m.filter(Boolean).length;
  if (count === 0) return 0;
  const region = (start: number): { cells: number[]; border: boolean } => {
    const cells: number[] = [];
    let border = false;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      const i = k % g, j = (k - i) / g;
      if (i === 0 || j === 0 || i === g - 1 || j === g - 1) border = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g || nj >= g) continue;
        const n = nj * g + ni;
        if (!seen[n] && !m[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    return { cells, border };
  };
  for (let k = 0; k < g * g; k++) {
    if (m[k] || seen[k]) continue;
    const r = region(k);
    if (!r.border && r.cells.length < HOLE_FILL * count) {
      for (const c of r.cells) m[c] = true;
      count += r.cells.length;
    }
  }
  return count;
}

/** Boundary rings of the mask (filled side on the left), simplified, in thousandths. */
function rings(m: boolean[], g: number, total: number): number[][] {
  const set = (i: number, j: number) => i >= 0 && j >= 0 && i < g && j < g && m[j * g + i]!;
  // directed boundary edges between grid vertices, keyed by their start vertex
  const W = g + 1;
  const out = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const list = out.get(k);
    if (list) list.push(y1 * W + x1);
    else out.set(k, [y1 * W + x1]);
  };
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      if (!set(i, j)) continue;
      if (!set(i, j - 1)) add(i, j, i + 1, j);
      if (!set(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (!set(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (!set(i - 1, j)) add(i, j + 1, i, j);
    }
  }
  const result: number[][] = [];
  const minArea = RING_MIN * total;
  for (const startKey of [...out.keys()]) {
    while ((out.get(startKey)?.length ?? 0) > 0) {
      const loop: number[] = [startKey];
      let prev = startKey;
      let cur = takeNext(out, startKey, null, W)!;
      while (cur !== startKey) {
        loop.push(cur);
        const next = takeNext(out, cur, prev, W);
        if (next === null) break;
        prev = cur;
        cur = next;
      }
      const pts = loop.map((k) => [k % W, Math.floor(k / W)] as [number, number]);
      if (Math.abs(signedArea(pts)) < minArea) continue;
      const simple = simplifyRing(pts, SIMPLIFY);
      if (simple.length < 3) continue;
      result.push(simple.flatMap(([x, y]) => [Math.round((x / g - 0.5) * 1000), Math.round((y / g - 0.5) * 1000)]));
    }
  }
  return result;
}

/** Removes and returns the edge leaving `at`; at a vertex with two, the left turn (keeps diagonal cells apart). */
function takeNext(out: Map<number, number[]>, at: number, from: number | null, W: number): number | null {
  const list = out.get(at);
  if (!list || list.length === 0) return null;
  let pick = 0;
  if (list.length > 1 && from !== null) {
    const dx = (at % W) - (from % W), dy = Math.floor(at / W) - Math.floor(from / W);
    let best = -Infinity;
    list.forEach((n, idx) => {
      const nx = (n % W) - (at % W), ny = Math.floor(n / W) - Math.floor(at / W);
      const cross = dx * ny - dy * nx; // > 0: left turn
      if (cross > best) {
        best = cross;
        pick = idx;
      }
    });
  }
  const [n] = list.splice(pick, 1);
  return n!;
}

function signedArea(p: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Douglas-Peucker on a closed ring, split at the vertex farthest from the first one. */
function simplifyRing(p: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (p.length < 4) return p;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i]![0] - p[0]![0], p[i]![1] - p[0]![1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dp([...p.slice(0, far + 1)], tol);
  const b = dp([...p.slice(far), p[0]!], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function dp(p: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (p.length < 3) return p;
  const [ax, ay] = p[0]!;
  const [bx, by] = p[p.length - 1]!;
  const len = Math.hypot(bx - ax, by - ay);
  let idx = -1;
  let max = -1;
  for (let i = 1; i < p.length - 1; i++) {
    const [x, y] = p[i]!;
    const d = len === 0 ? Math.hypot(x - ax, y - ay) : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len;
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= tol) return [p[0]!, p[p.length - 1]!];
  return [...dp(p.slice(0, idx + 1), tol).slice(0, -1), ...dp(p.slice(idx), tol)];
}

