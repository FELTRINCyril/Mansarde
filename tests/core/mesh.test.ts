import { describe, expect, it } from 'vitest';
import { beamFootprint } from '@/core/geometry/beams';
import { unionRings } from '@/core/geometry/boolean';
import { ceilingWithoutBeams } from '@/core/geometry/ceiling';
import { cupboardFrame, cupboardTopProfile } from '@/core/geometry/cupboards';
import { deriveLevel } from '@/core/geometry/derived';
import { area, pointInPolygon, rectRing, signedArea } from '@/core/geometry/polygon';
import { buildLevelMeshes } from '@/core/mesh';
import { triangulate } from '@/core/mesh/triangulate';
import type { LevelMeshes, MeshData } from '@/core/mesh/types';
import { createBeam, createCupboard, createOpening, createSlope } from '@/core/model/factory';
import type { Level, Ring, Vec2 } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

type V3 = [number, number, number];

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Triangles of a mesh: corners (meters) and the normal attribute of the first corner. */
function triangles(m: MeshData): Array<{ p: [V3, V3, V3]; n: V3 }> {
  const at = (arr: number[], i: number): V3 => [arr[3 * i]!, arr[3 * i + 1]!, arr[3 * i + 2]!];
  const out: Array<{ p: [V3, V3, V3]; n: V3 }> = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    out.push({ p: [at(m.positions, a), at(m.positions, b), at(m.positions, c)], n: at(m.normals, a) });
  }
  return out;
}

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Geometric normal (b - a) x (c - a), length = twice the area. */
const geoNormal = (p: [V3, V3, V3]): V3 => cross3(sub3(p[1], p[0]), sub3(p[2], p[0]));
const triArea = (p: [V3, V3, V3]): number => Math.hypot(...geoNormal(p)) / 2;

/** Sum of area * normal over the triangles: zero for a closed surface. */
function areaVector(m: MeshData): V3 {
  const s: V3 = [0, 0, 0];
  for (const t of triangles(m)) {
    const g = geoNormal(t.p);
    s[0] += g[0] / 2;
    s[1] += g[1] / 2;
    s[2] += g[2] / 2;
  }
  return s;
}

/** Enclosed volume (divergence theorem); exact for a closed, outward oriented surface. */
function volume(m: MeshData): number {
  let v = 0;
  for (const { p } of triangles(m)) v += dot3(p[0], cross3(p[1], p[2])) / 6;
  return v;
}

function vertices(m: MeshData): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < m.positions.length; i += 3) out.push([m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!]);
  return out;
}

function allMeshes(lm: LevelMeshes): MeshData[] {
  return [
    lm.walls,
    ...lm.floors.map((f) => f.mesh),
    ...lm.ceilings.map((c) => c.mesh),
    ...lm.beams.map((b) => b.mesh),
    ...lm.cupboards.flatMap((c) => [c.parts.body, ...c.parts.doors, c.parts.handles]),
  ];
}

/** Well formed: finite numbers, consistent lengths, indices in bounds, unit normals agreeing with the winding. */
function expectWellFormed(m: MeshData): void {
  const n = m.positions.length / 3;
  expect(Number.isInteger(n)).toBe(true);
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(2 * n);
  expect(m.indices.length % 3).toBe(0);
  for (const arr of [m.positions, m.normals, m.uvs]) expect(arr.every((x) => Number.isFinite(x))).toBe(true);
  expect(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < n)).toBe(true);
  for (const t of triangles(m)) {
    expect(Math.hypot(...t.n)).toBeCloseTo(1, 9);
    expect(dot3(geoNormal(t.p), t.n)).toBeGreaterThan(0);
  }
}

/** 400 x 300 interior (axes at -10 and 410 / 310, walls 20 cm), height 250. */
const room400x300 = (): Level => levelFromWalls(rectRoom(-10, -10, 410, 310));

/** plan-chambre: interior 0..400 x 0..400, ceiling 240, slope from x = 197 towards +x, 240 -> 150 over 203. */
function chambre(): Level {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  for (const w of Object.values(level.walls)) w.height = 240;
  const s = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
  level.slopes[s.id] = s;
  return level;
}

const meshesOf = (level: Level): LevelMeshes => buildLevelMeshes(level, deriveLevel(level));

describe('triangulate', () => {
  const triArea2 = (pts: Vec2[], idx: number[]): number[] => {
    const out: number[] = [];
    for (let t = 0; t < idx.length; t += 3) out.push(signedArea([pts[idx[t]!]!, pts[idx[t + 1]!]!, pts[idx[t + 2]!]!]));
    return out;
  };

  it('square with a hole: area of the square minus the hole, every triangle positive', () => {
    const outer = rect(0, 0, 10, 10);
    const hole = rect(3, 3, 6, 6);
    const idx = triangulate(outer, [hole]);
    const pts = [...outer, ...hole];
    expect(idx.length % 3).toBe(0);
    expect(idx.every((i) => i >= 0 && i < pts.length)).toBe(true);
    const areas = triArea2(pts, idx);
    expect(areas.every((a) => a > 0)).toBe(true);
    expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(91, 9);
    // the hole vertices are used (the hole is bridged, not ignored)
    expect(idx.some((i) => i >= 4)).toBe(true);
  });

  it('accepts either orientation of the outer ring and of the holes', () => {
    const outer = [...rect(0, 0, 10, 10)].reverse();
    const holes = [rect(1, 1, 3, 3), [...rect(6, 6, 9, 8)].reverse()];
    const idx = triangulate(outer, holes);
    const pts = [...outer, ...holes.flat()];
    const areas = triArea2(pts, idx);
    expect(areas.every((a) => a > 0)).toBe(true);
    expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(100 - 4 - 6, 9);
  });

  it('non-convex ring with collinear and repeated points', () => {
    const ring: Ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 6, y: 10 },
      { x: 6, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    const idx = triangulate(ring, []);
    const areas = triArea2(ring, idx);
    expect(areas.every((a) => a >= 0)).toBe(true);
    expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(area(ring), 9);
  });

  it('degenerate input gives no triangle', () => {
    expect(triangulate([], [])).toEqual([]);
    expect(triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }], [])).toEqual([]);
    expect(triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [])).toEqual([]);
  });

  it('fuzz: unions of random rectangles are covered exactly, triangles inside the polygon', () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let checked = 0;
    for (let run = 0; run < 60; run++) {
      const rings: Ring[] = [];
      const count = 3 + Math.floor(rnd() * 8);
      for (let k = 0; k < count; k++) {
        const x = Math.round(rnd() * 80);
        const y = Math.round(rnd() * 80);
        rings.push(rect(x, y, x + 5 + Math.round(rnd() * 40), y + 5 + Math.round(rnd() * 40)));
      }
      // frames make holes
      rings.push(rect(100, 100, 160, 110), rect(100, 150, 160, 160), rect(100, 100, 110, 160), rect(150, 100, 160, 160));
      for (const poly of unionRings(rings)) {
        const idx = triangulate(poly.outer, poly.holes);
        const pts = [...poly.outer, ...poly.holes.flat()];
        const areas = triArea2(pts, idx);
        const expected = area(poly.outer) - poly.holes.reduce((s, h) => s + area(h), 0);
        expect(areas.every((a) => a >= -1e-9)).toBe(true);
        expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(expected, 6);
        for (let t = 0; t < idx.length; t += 3) {
          const [a, b, c] = [pts[idx[t]!]!, pts[idx[t + 1]!]!, pts[idx[t + 2]!]!];
          if (signedArea([a, b, c]) < 1e-6) continue;
          const g = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
          expect(pointInPolygon(g, poly)).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('fuzz: unions of random rotated rectangles (slanted edges) are covered exactly', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let checked = 0;
    for (let run = 0; run < 80; run++) {
      const rings: Ring[] = [];
      for (let k = 0; k < 8; k++) rings.push(rectRing(rnd() * 200, rnd() * 200, 10 + rnd() * 80, 5 + rnd() * 30, rnd() * 360));
      for (const poly of unionRings(rings)) {
        const idx = triangulate(poly.outer, poly.holes);
        const pts = [...poly.outer, ...poly.holes.flat()];
        const areas = triArea2(pts, idx);
        const expected = area(poly.outer) - poly.holes.reduce((s, h) => s + area(h), 0);
        expect(areas.every((a) => a >= -1e-9)).toBe(true);
        expect(Math.abs(areas.reduce((s, a) => s + a, 0) - expected) / expected).toBeLessThan(1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('walls', () => {
  it('400 x 300 room: walls from 0 to 2.50 m, well formed', () => {
    const lm = meshesOf(room400x300());
    expectWellFormed(lm.walls);
    const ys = vertices(lm.walls).map((p) => p[1]);
    expect(Math.max(...ys)).toBeCloseTo(2.5, 9);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    // closed except for the bottom: the area vector is the footprint (4.40 x 3.40 - 4.00 x 3.00) upwards
    const s = areaVector(lm.walls);
    expect(s[0]).toBeCloseTo(0, 9);
    expect(s[2]).toBeCloseTo(0, 9);
    expect(s[1]).toBeCloseTo(4.4 * 3.4 - 4 * 3, 9);
  });

  it('meters, y up: plan x -> x, plan y -> z', () => {
    const lm = meshesOf(room400x300());
    const vs = vertices(lm.walls);
    expect(Math.min(...vs.map((p) => p[0]))).toBeCloseTo(-0.2, 9);
    expect(Math.max(...vs.map((p) => p[0]))).toBeCloseTo(4.2, 9);
    expect(Math.min(...vs.map((p) => p[2]))).toBeCloseTo(-0.2, 9);
    expect(Math.max(...vs.map((p) => p[2]))).toBeCloseTo(3.2, 9);
  });

  it('under a slope (plan-chambre): no wall vertex above ceilingWithoutBeams, the low wall at 1.50 m', () => {
    const level = chambre();
    const lm = meshesOf(level);
    expectWellFormed(lm.walls);
    const vs = vertices(lm.walls);
    for (const [x, y, z] of vs) {
      expect(y).toBeLessThanOrEqual(ceilingWithoutBeams(level, { x: x * 100, y: z * 100 }) / 100 + 1e-6);
    }
    // the right wall (x 4.00 .. 4.20) is entirely under the end of the slope: its top is 1.50 m
    const right = vs.filter((p) => p[0] > 4 - 1e-9);
    expect(Math.max(...right.map((p) => p[1]))).toBeCloseTo(1.5, 9);
    // the left part of the room keeps 2.40 m
    expect(Math.max(...vs.map((p) => p[1]))).toBeCloseTo(2.4, 9);
    // the top wall is cut at the start line: a vertex at x = 1.97, z = -0.2, 2.40 m high
    expect(vs.some((p) => Math.abs(p[0] - 1.97) < 1e-9 && Math.abs(p[2] + 0.2) < 1e-9 && Math.abs(p[1] - 2.4) < 1e-9)).toBe(true);
    // a vertex in the middle of the slope follows it exactly
    const mid = vs.filter((p) => Math.abs(p[0] - 3) < 1e-9 && p[1] > 0);
    for (const p of mid) expect(p[1]).toBeCloseTo((240 - (103 * 90) / 203) / 100, 9);
    // still closed except for the bottom
    const s = areaVector(lm.walls);
    expect(s[0]).toBeCloseTo(0, 9);
    expect(s[2]).toBeCloseTo(0, 9);
    expect(s[1]).toBeCloseTo(4.4 * 4.4 - 4 * 4, 9);
  });

  it('window: a sill block of 0.90 m and a lintel from 2.25 m, closed solids', () => {
    const level = room400x300();
    const wallId = findWall(level, -10, -10, 410, -10);
    const win = createOpening(wallId, 'window', 220); // center x = -10 + 220 = 210: x 150 .. 270, sill 90, height 135
    level.openings[win.id] = win;
    const lm = meshesOf(level);
    expectWellFormed(lm.walls);
    const inWindow = (p: V3): boolean => p[0] > 1.5 - 1e-9 && p[0] < 2.7 + 1e-9 && p[2] < 0 + 1e-9;
    const tris = triangles(lm.walls);
    const sillTop = tris.filter((t) => t.n[1] > 0.999 && t.p.every((p) => inWindow(p) && Math.abs(p[1] - 0.9) < 1e-9));
    expect(sillTop.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(1.2 * 0.2, 9);
    const lintelBottom = tris.filter((t) => t.n[1] < -0.999 && t.p.every((p) => inWindow(p) && Math.abs(p[1] - 2.25) < 1e-9));
    expect(lintelBottom.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(1.2 * 0.2, 9);
    // nothing of the wall between the sill and the lintel inside the window
    expect(tris.some((t) => t.p.every((p) => inWindow(p) && p[0] > 1.5 + 1e-6 && p[0] < 2.7 - 1e-6) && t.p.some((p) => p[1] > 0.9 + 1e-6 && p[1] < 2.25 - 1e-6))).toBe(false);
    // bottom-less closed solids: the area vector is the footprint of the wall, window included
    const s = areaVector(lm.walls);
    expect(s[0]).toBeCloseTo(0, 9);
    expect(s[2]).toBeCloseTo(0, 9);
    expect(s[1]).toBeCloseTo(4.4 * 3.4 - 4 * 3, 9);
  });

  it('door: hollowed from the floor, a lintel above 2.04 m and a threshold at 0', () => {
    const level = room400x300();
    const wallId = findWall(level, -10, 310, -10, -10); // left wall, axis x = -10
    const door = createOpening(wallId, 'door', 100); // z 2.10 - 0.415 .. + 0.415
    level.openings[door.id] = door;
    const lm = meshesOf(level);
    expectWellFormed(lm.walls);
    const tris = triangles(lm.walls);
    const inDoor = (p: V3): boolean => p[0] < 0 + 1e-9 && p[2] > 2.1 - 0.415 - 1e-9 && p[2] < 2.1 + 0.415 + 1e-9;
    const lintelBottom = tris.filter((t) => t.n[1] < -0.999 && t.p.every((p) => inDoor(p) && Math.abs(p[1] - 2.04) < 1e-9));
    expect(lintelBottom.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(0.83 * 0.2, 9);
    const threshold = tris.filter((t) => t.n[1] > 0.999 && t.p.every((p) => inDoor(p) && Math.abs(p[1]) < 1e-9));
    expect(threshold.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(0.83 * 0.2, 9);
    const s = areaVector(lm.walls);
    expect(s[1]).toBeCloseTo(4.4 * 3.4 - 4 * 3, 9);
  });

  it('walls of different heights: each keeps its own top, with a step face', () => {
    const level = levelFromWalls([...rectRoom(-10, -10, 410, 310), [200, -10, 200, 310, 10]]);
    const partition = findWall(level, 200, -10, 200, 310);
    level.walls[partition]!.height = 100;
    const lm = meshesOf(level);
    expectWellFormed(lm.walls);
    const vs = vertices(lm.walls);
    const inX = (p: V3): boolean => p[0] > 1.95 - 1e-9 && p[0] < 2.05 + 1e-9 && p[2] > -1e-9 && p[2] < 3 + 1e-9;
    const partitionTops = triangles(lm.walls).filter((t) => t.n[1] > 0.999 && t.p.every(inX));
    expect(partitionTops.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(0.1 * 3, 9);
    for (const t of partitionTops) for (const p of t.p) expect(p[1]).toBeCloseTo(1, 9);
    expect(Math.max(...vs.map((p) => p[1]))).toBeCloseTo(2.5, 9);
    // the step between the partition top and the tall walls: 2 x 0.10 x 1.50 m, facing the partition
    const steps = triangles(lm.walls).filter((t) => Math.abs(t.n[1]) < 1e-9 && t.p.every((p) => inX(p) && p[1] > 1 - 1e-9));
    expect(steps.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(2 * 0.1 * 1.5, 9);
    const s = areaVector(lm.walls);
    expect(s[0]).toBeCloseTo(0, 9);
    expect(s[2]).toBeCloseTo(0, 9);
  });

  it('a slope ending inside the room laterally: the wall top steps, the surface stays closed', () => {
    const level = room400x300();
    // slope over y 100 .. 200 only, going down towards +x from x = 100
    const s = createSlope({ x: 100, y: 100 }, { x: 100, y: 200 }, 'right', 300, 250, 150);
    level.slopes[s.id] = s;
    // a wall crossing the lateral lines: x = 300 partition
    const l2 = levelFromWalls([...rectRoom(-10, -10, 410, 310), [300, -10, 300, 310, 10]]);
    l2.slopes[s.id] = s;
    for (const lvl of [level, l2]) {
      const lm = meshesOf(lvl);
      expectWellFormed(lm.walls);
      const a = areaVector(lm.walls);
      expect(a[0]).toBeCloseTo(0, 9);
      expect(a[2]).toBeCloseTo(0, 9);
    }
    // steps on the lateral line z = 1.00, facing the slope (+z), from the slope up to 2.50 m:
    // right wall x 4.00..4.20 from 1.50; partition x 2.95..3.05 from 1.85 / 1.8167
    const stepArea = (lvl: Level): number =>
      triangles(meshesOf(lvl).walls)
        .filter((t) => t.n[2] > 0.999 && t.p.every((p) => Math.abs(p[2] - 1) < 1e-9))
        .reduce((sum, t) => sum + triArea(t.p), 0);
    expect(stepArea(level)).toBeCloseTo(0.2 * 1, 9);
    expect(stepArea(l2)).toBeCloseTo(0.2 * 1 + (0.1 * (2.5 - 1.85 + 2.5 - (250 - 205 / 3) / 100)) / 2, 9);
    const vs = vertices(meshesOf(l2).walls).filter((p) => Math.abs(p[0] - 2.95) < 1e-9);
    const h = (250 - (195 * 100) / 300) / 100;
    expect(vs.some((p) => Math.abs(p[1] - h) < 1e-9)).toBe(true);
    expect(vs.some((p) => Math.abs(p[1] - 2.5) < 1e-9)).toBe(true);
  });

  it('two slopes crossing (two-pan roof): the top follows the lower one, cut at the ridge', () => {
    const level = room400x300();
    // ridge-less crossing: both start beyond the room and go down towards each other
    const s1 = createSlope({ x: -50, y: -100 }, { x: -50, y: 400 }, 'right', 500, 300, 100);
    const s2 = createSlope({ x: 450, y: 400 }, { x: 450, y: -100 }, 'right', 500, 300, 100);
    level.slopes[s1.id] = s1;
    level.slopes[s2.id] = s2;
    const lm = meshesOf(level);
    expectWellFormed(lm.walls);
    for (const [x, y, z] of vertices(lm.walls)) {
      expect(y).toBeLessThanOrEqual(ceilingWithoutBeams(level, { x: x * 100, y: z * 100 }) / 100 + 1e-6);
    }
    // the ridge (both slopes equal) is at x = 200 where the height is 300 - 250 * 200 / 500 = 200
    const top = vertices(lm.walls).filter((p) => Math.abs(p[0] - 2) < 1e-9);
    expect(Math.max(...top.map((p) => p[1]))).toBeCloseTo(2, 9);
  });

  it('empty level and open walls: no error, well formed', () => {
    const empty = levelFromWalls([]);
    const lm = meshesOf(empty);
    expect(lm.walls.indices).toEqual([]);
    expect(lm.floors).toEqual([]);
    const open = levelFromWalls([
      [0, 0, 300, 0],
      [300, 0, 300, 200],
    ]);
    const lo = meshesOf(open);
    expectWellFormed(lo.walls);
    expect(lo.walls.indices.length).toBeGreaterThan(0);
    expect(lo.floors).toEqual([]);
  });
});

describe('floors', () => {
  it('400 x 300 room: 12 m2, triangles facing +y, UV in meters', () => {
    const lm = meshesOf(room400x300());
    expect(lm.floors).toHaveLength(1);
    const f = lm.floors[0]!.mesh;
    expectWellFormed(f);
    const tris = triangles(f);
    expect(tris.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(12, 9);
    for (const t of tris) {
      expect(geoNormal(t.p)[1]).toBeGreaterThan(0);
      expect(t.n).toEqual([0, 1, 0]);
    }
    expect(vertices(f).every((p) => p[1] === 0)).toBe(true);
    for (let i = 0; i < f.positions.length / 3; i++) {
      expect(f.uvs[2 * i]).toBeCloseTo(f.positions[3 * i]!, 12);
      expect(f.uvs[2 * i + 1]).toBeCloseTo(f.positions[3 * i + 2]!, 12);
    }
  });

  it('islands are left out of the floor', () => {
    const level = levelFromWalls([...rectRoom(-10, -10, 410, 310), ...rectRoom(150, 100, 250, 200, 10)]);
    const lm = meshesOf(level);
    const room = deriveLevel(level).rooms.find((r) => r.islands.length > 0)!;
    const f = lm.floors.find((x) => x.roomKey === room.key)!.mesh;
    expectWellFormed(f);
    const total = triangles(f).reduce((s, t) => s + triArea(t.p), 0);
    expect(total).toBeCloseTo(room.area / 1e4, 9);
    expect(total).toBeLessThan(12 - 1);
  });
});

describe('ceilings', () => {
  it('flat ceiling at the level height, facing down', () => {
    const lm = meshesOf(room400x300());
    expect(lm.ceilings).toHaveLength(1);
    const c = lm.ceilings[0]!.mesh;
    expectWellFormed(c);
    expect(vertices(c).every((p) => Math.abs(p[1] - 2.5) < 1e-12)).toBe(true);
    const tris = triangles(c);
    expect(tris.every((t) => geoNormal(t.p)[1] < 0)).toBe(true);
    expect(tris.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(12, 9);
  });

  it('sloped ceiling (plan-chambre): 2.40 m up to x = 1.97, 1.50 m at x = 4.00, every vertex on ceilingWithoutBeams', () => {
    const level = chambre();
    const lm = meshesOf(level);
    const c = lm.ceilings[0]!.mesh;
    expectWellFormed(c);
    const vs = vertices(c);
    const at4 = vs.filter((p) => Math.abs(p[0] - 4) < 1e-9);
    expect(at4.length).toBeGreaterThan(0);
    for (const p of at4) expect(p[1]).toBeCloseTo(1.5, 9);
    expect(vs.some((p) => Math.abs(p[0] - 1.97) < 1e-9)).toBe(true);
    for (const [x, y, z] of vs) expect(y).toBeCloseTo(ceilingWithoutBeams(level, { x: x * 100, y: z * 100 }) / 100, 9);
    expect(triangles(c).every((t) => t.n[1] < 0)).toBe(true);
    // the plan area is still 16 m2
    const planArea = triangles(c).reduce((s, t) => s + Math.abs(geoNormal(t.p)[1]) / 2, 0);
    expect(planArea).toBeCloseTo(16, 9);
  });

  it('a slope ending laterally inside the room: a vertical step joins the two ceilings', () => {
    const level = room400x300();
    const s = createSlope({ x: 100, y: 100 }, { x: 100, y: 200 }, 'right', 300, 250, 150);
    level.slopes[s.id] = s;
    const c = meshesOf(level).ceilings[0]!.mesh;
    expectWellFormed(c);
    const steps = triangles(c).filter((t) => Math.abs(t.n[1]) < 1e-9);
    // two lateral steps, each a triangle of 3.00 x 1.00 m / 2 seen from the high side
    expect(steps.reduce((sum, t) => sum + triArea(t.p), 0)).toBeCloseTo(2 * (3 * 1) / 2, 9);
    // closed except for the floor-facing side: the area vector is the plan area, downwards
    // the step faces of both lateral lines cancel along z; the plan area is still 12 m2, downwards
    const a = areaVector(c);
    expect(a[2]).toBeCloseTo(0, 9);
    expect(a[1]).toBeCloseTo(-12, 9);
  });
});

describe('beams', () => {
  it('fixed beam: a closed box of length x width x drop at its bottom', () => {
    const level = room400x300();
    const b = createBeam({ x: 0, y: 150 }, { x: 400, y: 150 }, { mode: 'fixed', bottom: 200, drop: 15, width: 12 });
    level.beams[b.id] = b;
    const lm = meshesOf(level);
    expect(lm.beams).toHaveLength(1);
    const m = lm.beams[0]!.mesh;
    expect(lm.beams[0]!.id).toBe(b.id);
    expectWellFormed(m);
    expect(volume(m)).toBeCloseTo(4 * 0.12 * 0.15, 9);
    const ys = vertices(m).map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(2, 9);
    expect(Math.max(...ys)).toBeCloseTo(2.15, 9);
    const a = areaVector(m);
    for (const k of a) expect(k).toBeCloseTo(0, 9);
  });

  it('ceiling beam under a slope: top on the ceiling, bottom drop below, inclined', () => {
    const level = chambre();
    const b = createBeam({ x: 100, y: 200 }, { x: 400, y: 200 }, { drop: 15, width: 12 });
    level.beams[b.id] = b;
    const m = meshesOf(level).beams[0]!.mesh;
    expectWellFormed(m);
    const a = areaVector(m);
    for (const k of a) expect(k).toBeCloseTo(0, 9);
    // constant section: volume = plan area x drop
    expect(volume(m)).toBeCloseTo(3 * 0.12 * 0.15, 9);
    for (const [x, y, z] of vertices(m)) {
      const c = ceilingWithoutBeams(level, { x: x * 100, y: z * 100 }) / 100;
      expect(y > c - 0.15 - 1e-9 && y < c + 1e-9).toBe(true);
    }
    const end = vertices(m).filter((p) => Math.abs(p[0] - 4) < 1e-9);
    expect(Math.min(...end.map((p) => p[1]))).toBeCloseTo(1.35, 9);
    expect(Math.max(...end.map((p) => p[1]))).toBeCloseTo(1.5, 9);
    expect(beamFootprint(b)).toHaveLength(4);
  });
});

describe('cupboards', () => {
  /** Top wall (-10, -10) -> (410, -10): dir +x, left = +y = room side; offset 220 -> x 150..270. */
  function withCupboard(level: Level, overrides = {}) {
    const c = createCupboard(findWall(level, -10, -10, 410, -10), 220, 'left', overrides);
    level.cupboards[c.id] = c;
    return c;
  }

  it('fixed cupboard: plinth, body up to 2.20 m, one door per doorCount with joints, one handle per door', () => {
    const level = room400x300();
    const c = withCupboard(level);
    const lm = meshesOf(level);
    expect(lm.cupboards).toHaveLength(1);
    const { id, parts } = lm.cupboards[0]!;
    expect(id).toBe(c.id);
    for (const m of [parts.body, ...parts.doors, parts.handles]) expectWellFormed(m);
    expect(parts.doors).toHaveLength(c.doorCount);
    expect(c.doorCount).toBe(2);
    const body = vertices(parts.body);
    expect(Math.max(...body.map((p) => p[1]))).toBeCloseTo(2.2, 9);
    expect(Math.min(...body.map((p) => p[1]))).toBeCloseTo(0, 9);
    // body and doors are closed solids within the footprint x 1.50..2.70, z 0..0.60
    for (const m of [parts.body, ...parts.doors, parts.handles]) {
      for (const k of areaVector(m)) expect(k).toBeCloseTo(0, 9);
    }
    for (const m of [parts.body, ...parts.doors]) {
      for (const [x, , z] of vertices(m)) {
        expect(x).toBeGreaterThanOrEqual(1.5 - 1e-9);
        expect(x).toBeLessThanOrEqual(2.7 + 1e-9);
        expect(z).toBeGreaterThanOrEqual(-1e-9);
        expect(z).toBeLessThanOrEqual(0.6 + 1e-9);
      }
    }
    // doors: 1 cm joints between them, 0.5 cm at the ends and under the top
    const xs = parts.doors.map((d) => vertices(d).map((p) => p[0]));
    expect(Math.min(...xs[0]!)).toBeCloseTo(1.505, 9);
    expect(Math.max(...xs[0]!)).toBeCloseTo(2.095, 9);
    expect(Math.min(...xs[1]!)).toBeCloseTo(2.105, 9);
    expect(Math.max(...xs[1]!)).toBeCloseTo(2.695, 9);
    expect(Math.max(...vertices(parts.doors[0]!).map((p) => p[1]))).toBeCloseTo(2.195, 9);
    expect(Math.min(...vertices(parts.doors[0]!).map((p) => p[1]))).toBeCloseTo(0.105, 9);
    // two handle boxes of 12 triangles each, in front of the doors
    expect(parts.handles.indices.length / 3).toBe(24);
    expect(Math.min(...vertices(parts.handles).map((p) => p[2]))).toBeCloseTo(0.6, 9);
  });

  it('ceiling cupboard under a slope: body top on the profile, never above the ceiling', () => {
    const level = chambre();
    const c = withCupboard(level, { heightMode: 'ceiling', offset: 320, width: 160, doorCount: 3 }); // x 230 .. 390
    const profile = cupboardTopProfile(level, c);
    const lm = meshesOf(level);
    const { parts } = lm.cupboards[0]!;
    for (const m of [parts.body, ...parts.doors, parts.handles]) expectWellFormed(m);
    expect(parts.doors).toHaveLength(3);
    const f = cupboardFrame(level, c);
    const topAt = (x: number): number => {
      const s = x * 100 - f.back[0].x;
      for (let i = 1; i < profile.length; i++) {
        const p = profile[i - 1]!;
        const q = profile[i]!;
        if (s >= p.s - 1e-9 && s <= q.s + 1e-9 && q.s > p.s) return p.top + ((q.top - p.top) * (s - p.s)) / (q.s - p.s);
      }
      return profile[0]!.top;
    };
    for (const m of [parts.body, ...parts.doors]) {
      for (const [x, y, z] of vertices(m)) {
        expect(y).toBeLessThanOrEqual(topAt(x) / 100 + 1e-9);
        expect(y).toBeLessThanOrEqual(ceilingWithoutBeams(level, { x: x * 100, y: z * 100 }) / 100 + 1e-9);
      }
    }
    // the body reaches the profile at both ends
    const body = vertices(parts.body);
    const atEnd = body.filter((p) => Math.abs(p[0] - 3.9) < 1e-9);
    expect(Math.max(...atEnd.map((p) => p[1]))).toBeCloseTo(topAt(3.9) / 100, 9);
    for (const k of areaVector(parts.body)) expect(k).toBeCloseTo(0, 9);
  });

  it('a profile with a vertical step (under a fixed beam) is accepted', () => {
    const level = room400x300();
    const b = createBeam({ x: 200, y: -50 }, { x: 200, y: 350 }, { mode: 'fixed', bottom: 200, width: 20 });
    level.beams[b.id] = b;
    const c = withCupboard(level, { heightMode: 'ceiling' });
    const profile = cupboardTopProfile(level, c);
    expect(profile.some((p, i) => i > 0 && Math.abs(p.s - profile[i - 1]!.s) < 1e-9)).toBe(true);
    const { parts } = meshesOf(level).cupboards[0]!;
    for (const m of [parts.body, ...parts.doors, parts.handles]) {
      expectWellFormed(m);
      for (const k of areaVector(m)) expect(k).toBeCloseTo(0, 9);
    }
    const under = (p: V3): boolean => p[0] > 1.9 - 1e-9 && p[0] < 2.1 + 1e-9;
    const tops = triangles(parts.body).filter((t) => t.n[1] > 0.999 && t.p.every(under));
    expect(tops.reduce((s, t) => s + triArea(t.p), 0)).toBeCloseTo(0.2 * 0.58, 9);
    for (const t of tops) for (const p of t.p) expect(p[1]).toBeCloseTo(1.98, 9);
  });

  it('a cupboard on a missing wall is left out', () => {
    const level = room400x300();
    const c = withCupboard(level);
    level.cupboards[c.id] = { ...c, wallId: 'missing' };
    expect(meshesOf(level).cupboards).toEqual([]);
  });
});

describe('buildLevelMeshes', () => {
  function fullLevel(): Level {
    const level = chambre();
    const top = findWall(level, -10, -10, 410, -10);
    const left = findWall(level, -10, 410, -10, -10);
    const w = createOpening(top, 'window', 115);
    const d = createOpening(left, 'door', 60);
    level.openings[w.id] = w;
    level.openings[d.id] = d;
    const b = createBeam({ x: 0, y: 300 }, { x: 400, y: 300 });
    level.beams[b.id] = b;
    const c = createCupboard(findWall(level, 410, -10, 410, 410), 300, 'left', { heightMode: 'ceiling' });
    level.cupboards[c.id] = c;
    return level;
  }

  it('no NaN, indices in bounds, normals consistent on a level with everything', () => {
    const lm = meshesOf(fullLevel());
    for (const m of allMeshes(lm)) expectWellFormed(m);
    expect(lm.beams).toHaveLength(1);
    expect(lm.cupboards).toHaveLength(1);
    expect(lm.floors).toHaveLength(1);
    expect(lm.ceilings).toHaveLength(1);
    expect(lm.floors[0]!.roomKey).toBe(deriveLevel(fullLevel()).rooms[0]!.key);
  });

  it('memoized per level identity and reused when only the objects change', () => {
    const level = fullLevel();
    const d = deriveLevel(level);
    const a = buildLevelMeshes(level, d);
    expect(buildLevelMeshes(level, d)).toBe(a);
    const moved = { ...level, objects: { ...level.objects }, name: 'renamed' };
    expect(buildLevelMeshes(moved, deriveLevel(moved))).toBe(a);
    const raised = { ...level, height: 260 };
    expect(buildLevelMeshes(raised, deriveLevel(raised))).not.toBe(a);
    const noBeams = { ...level, beams: {} };
    const nb = buildLevelMeshes(noBeams, deriveLevel(noBeams));
    expect(nb).not.toBe(a);
    expect(nb.beams).toEqual([]);
  });

  it('never throws on a broken level (wall with a missing node, opening on a missing wall)', () => {
    const level = fullLevel();
    const wallId = Object.keys(level.walls)[0]!;
    level.walls[wallId] = { ...level.walls[wallId]!, startNodeId: 'missing' };
    const o = createOpening('missing-wall', 'window', 50);
    level.openings[o.id] = o;
    const lm = meshesOf(level);
    for (const m of allMeshes(lm)) expectWellFormed(m);
  });
});
