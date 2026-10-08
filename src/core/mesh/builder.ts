import type { Vec2 } from '../model/types';
import type { MeshData } from './types';

/** A point or a direction in mesh space: meters, x = plan x, y = up, z = plan y. */
export type V3 = [number, number, number];

/** Plan point p (cm) at height h (cm) in mesh space (meters, y up). */
export const at3 = (p: Vec2, h: number): V3 => [p.x / 100, h / 100, p.y / 100];

/** Horizontal direction of mesh space for a plan direction. */
export const horizontal = (d: Vec2): V3 => [d.x, 0, d.y];

export const UP: V3 = [0, 1, 0];
export const DOWN: V3 = [0, -1, 0];

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Triangles with less than this doubled area (m2) are dropped (1e-12 m2 = 1e-8 cm2). */
const MIN_DOUBLE_AREA = 1e-12;

/** Unit vector of n, or null when n has no length or is not finite. */
export function unit(n: V3): V3 | null {
  const l = Math.hypot(n[0], n[1], n[2]);
  if (!(l > 1e-15) || !Number.isFinite(l)) return null;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/**
 * Accumulates flat shaded triangles: each triangle has its own three vertices, all carrying the
 * normal of its face. UV: plan coordinates in meters (x, z) on faces closer to horizontal,
 * otherwise (horizontal position along the face, height), in meters.
 */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  /**
   * Triangle a, b, c with the unit normal n: the winding is made counter-clockwise seen from n
   * (three.js front face). Degenerate or non-finite triangles are dropped.
   */
  tri(a: V3, b: V3, c: V3, n: V3): void {
    if (![...a, ...b, ...c, ...n].every(Number.isFinite)) return;
    const g = cross3(sub3(b, a), sub3(c, a));
    if (!(Math.hypot(g[0], g[1], g[2]) > MIN_DOUBLE_AREA)) return;
    const [q, r] = dot3(g, n) < 0 ? [c, b] : [b, c];
    const base = this.positions.length / 3;
    const flat = Math.abs(n[1]) >= Math.SQRT1_2;
    for (const p of [a, q, r]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      if (flat) this.uvs.push(p[0], p[2]);
      else this.uvs.push(p[0] * -n[2] + p[2] * n[0], p[1]);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  /** Quad a, b, c, d (in order around it) as the triangles a, b, c and a, c, d. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3): void {
    this.tri(a, b, c, n);
    this.tri(a, c, d, n);
  }

  /**
   * Planar face over a triangulated plan polygon (pts, tris as from triangulate), each vertex at
   * the height h(p) (cm), h affine over the polygon. The normal is that of the plane, pointing up
   * or down as asked (or `normal` when given). A vertical plane is skipped.
   */
  surface(pts: Vec2[], tris: number[], h: (p: Vec2) => number, facing: 'up' | 'down', normal?: V3): void {
    const v = pts.map((p) => at3(p, h(p)));
    let n: V3 | null = normal ?? null;
    if (!n) {
      const sum: V3 = [0, 0, 0];
      for (let t = 0; t + 2 < tris.length; t += 3) {
        const a = v[tris[t]!]!;
        const g = cross3(sub3(v[tris[t + 1]!]!, a), sub3(v[tris[t + 2]!]!, a));
        sum[0] += g[0];
        sum[1] += g[1];
        sum[2] += g[2];
      }
      n = unit(sum);
      if (!n || Math.abs(n[1]) < 1e-9) return;
      if ((n[1] > 0) !== (facing === 'up')) n = [-n[0], -n[1], -n[2]];
    }
    for (let t = 0; t + 2 < tris.length; t += 3) this.tri(v[tris[t]!]!, v[tris[t + 1]!]!, v[tris[t + 2]!]!, n);
  }

  /**
   * Vertical band over the plan segment a -> b, between the heights lo and hi (cm, at a then at
   * b, both linear along the segment), facing the horizontal plan direction `out`. Only the part
   * where hi > lo is emitted (split where they cross).
   */
  band(a: Vec2, b: Vec2, lo: [number, number], hi: [number, number], out: Vec2): void {
    const n = horizontal(out);
    const d0 = hi[0] - lo[0];
    const d1 = hi[1] - lo[1];
    if (d0 <= 0 && d1 <= 0) return;
    if (d0 >= 0 && d1 >= 0) {
      this.quad(at3(a, lo[0]), at3(b, lo[1]), at3(b, hi[1]), at3(a, hi[0]), n);
      return;
    }
    const t = d0 / (d0 - d1);
    const x = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const hx = lo[0] + (lo[1] - lo[0]) * t;
    if (d0 > 0) this.tri(at3(a, lo[0]), at3(x, hx), at3(a, hi[0]), n);
    else this.tri(at3(x, hx), at3(b, lo[1]), at3(b, hi[1]), n);
  }

  get empty(): boolean {
    return this.indices.length === 0;
  }

  build(): MeshData {
    return { positions: [...this.positions], normals: [...this.normals], uvs: [...this.uvs], indices: [...this.indices] };
  }
}

export const emptyMesh = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });
