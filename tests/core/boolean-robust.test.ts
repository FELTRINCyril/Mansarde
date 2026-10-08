import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPolygonClippingLimits, POLYGON_CLIPPING_LIMITS } from '../../vite.polygonClipping';
import { applyCommand } from '@/core/commands/apply';
import { addWallChain } from '@/core/commands/walls';
import { difference, unionRings } from '@/core/geometry/boolean';
import { deriveLevel } from '@/core/geometry/derived';
import { area } from '@/core/geometry/polygon';
import type { Project, Ring, Shape } from '@/core/model/types';
import { emptyProject, levelId, lvl } from './helpers';

const rect = (x: number, y: number, w: number, h: number): Ring => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const shapeArea = (s: Shape): number => s.reduce((acc, p) => acc + area(p.outer) - p.holes.reduce((a, h) => a + area(h), 0), 0);

describe('robust boolean operations (ruling R37)', () => {
  it('the reported plan (two chains, 7 and 20 cm) derives without throwing', () => {
    // polygon-clipping alone throws "Unable to complete output ring" on this union
    let p: Project = emptyProject();
    const chain = (pts: Array<[number, number]>, thickness: number) => {
      const r = applyCommand(p, addWallChain(levelId(p), pts.map(([x, y]) => ({ kind: 'free' as const, x, y })), thickness, 250));
      if (!r.ok) throw new Error(r.error);
      p = r.project;
    };
    chain([[70, 310], [80, 530], [160, 350], [360, 230]], 7);
    chain([[370, 130], [500, 20], [480, 0], [500, 140]], 20);
    const d = deriveLevel(lvl(p));
    expect(d.degraded).toBe(false); // recovered by a retry on rounded coordinates: exact shape
    // the two chains do not touch: two polygons, no hole, the area of the walls (bodies + joints)
    expect(d.shapeNoOpenings).toHaveLength(2);
    const bodies = Object.values(lvl(p).walls).reduce((sum, w) => {
      const a = lvl(p).nodes[w.startNodeId]!;
      const b = lvl(p).nodes[w.endNodeId]!;
      return sum + Math.hypot(b.x - a.x, b.y - a.y) * w.thickness;
    }, 0);
    // joints add, overlaps at inner corners remove: same order of magnitude as the bodies
    expect(shapeArea(d.shapeNoOpenings)).toBeGreaterThan(bodies * 0.8);
    expect(shapeArea(d.shapeNoOpenings)).toBeLessThan(bodies * 1.2);
    expect(d.rooms).toEqual([]);
  });

  it('unionRings ignores degenerate rings (fewer than 3 points, zero area, non-finite)', () => {
    const s = unionRings([
      rect(0, 0, 10, 10),
      [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }],
      [{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }, { x: 10, y: 0 }],
    ]);
    expect(s).toHaveLength(1);
    expect(shapeArea(s)).toBeCloseTo(100);
    expect(unionRings([[{ x: 1, y: 1 }]])).toEqual([]);
  });

  it('difference never returns the subject itself: a deep copy when there is nothing to subtract', () => {
    const subject: Shape = [{ outer: rect(0, 0, 10, 10), holes: [rect(2, 2, 2, 2)] }];
    for (const clip of [[], [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]]) {
      const out = difference(subject, clip);
      expect(out).toEqual(subject);
      expect(out).not.toBe(subject);
      expect(out[0]).not.toBe(subject[0]);
      expect(out[0]!.outer).not.toBe(subject[0]!.outer);
      expect(out[0]!.outer[0]).not.toBe(subject[0]!.outer[0]);
      expect(out[0]!.holes[0]).not.toBe(subject[0]!.holes[0]);
    }
  });
});

describe('polygon-clipping loop limits (vite.polygonClipping.ts)', () => {
  it('are written into both builds of the installed library (ESM and the UMD the browser gets)', () => {
    for (const file of ['polygon-clipping.esm.js', 'polygon-clipping.umd.js']) {
      const code = readFileSync(`node_modules/polygon-clipping/dist/${file}`, 'utf8');
      const out = applyPolygonClippingLimits(code);
      expect(out).toContain('POLYGON_CLIPPING_MAX_QUEUE_SIZE = 200000;');
      expect(out).toContain('POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = 20000;');
      expect(out).not.toContain('process.env.POLYGON_CLIPPING');
    }
  });

  it('refuses a library whose guards changed, instead of silently keeping 1e6', () => {
    expect(() => applyPolygonClippingLimits('const x = 1;')).toThrow(/guard not found/);
  });

  it('are given to the library under Node (Vitest) as environment variables', () => {
    expect(process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS).toBe(String(POLYGON_CLIPPING_LIMITS.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS));
    expect(process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE).toBe(String(POLYGON_CLIPPING_LIMITS.POLYGON_CLIPPING_MAX_QUEUE_SIZE));
  });
});
