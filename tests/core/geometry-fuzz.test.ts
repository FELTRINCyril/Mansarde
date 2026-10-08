import { describe, expect, it, vi } from 'vitest';
import { applyCommand, type Recipe } from '@/core/commands/apply';
import { addOpening } from '@/core/commands/openings';
import { addWallChain, moveNodes, setWallThickness } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { createOpening } from '@/core/model/factory';
import type { Project, Shape } from '@/core/model/types';
import { emptyProject, levelId, lvl } from './helpers';

// passthrough to the real library, counting its failures: proves the fuzz really hits them
const failures = vi.hoisted(() => ({ count: 0 }));
vi.mock('polygon-clipping', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: Record<string, (...a: unknown[]) => unknown> }).default;
  const counted =
    (f: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) => {
      try {
        return f(...a);
      } catch (e) {
        failures.count++;
        throw e;
      }
    };
  return { default: { ...real, union: counted(real.union!), difference: counted(real.difference!) } };
});

/** Small deterministic PRNG (mulberry32): the scenarios are the same on every run. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const finiteShape = (s: Shape): boolean =>
  s.every((p) => [p.outer, ...p.holes].every((r) => r.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));

/** One random plan built through the real commands (refused commands are simply skipped). */
function scenario(rnd: () => number, gridded: boolean): Project {
  let p = emptyProject();
  const L = levelId(p);
  const apply = (recipe: Recipe) => {
    const r = applyCommand(p, recipe);
    if (r.ok) p = r.project;
  };
  const coord = () => (gridded ? Math.round(rnd() * 60) * 10 : rnd() * 600);
  const chains = 2 + Math.floor(rnd() * 4);
  for (let c = 0; c < chains; c++) {
    const n = 3 + Math.floor(rnd() * 4);
    const pts = Array.from({ length: n }, () => ({ kind: 'free' as const, x: coord(), y: coord() }));
    apply(addWallChain(L, pts, rnd() < 0.5 ? 7 : 20, 250));
  }
  const walls = Object.keys(lvl(p).walls);
  const nodes = Object.keys(lvl(p).nodes);
  if (walls.length === 0) return p;
  for (let i = 0; i < 2; i++) {
    const w = walls[Math.floor(rnd() * walls.length)]!;
    apply(addOpening(L, createOpening(w, rnd() < 0.5 ? 'door' : 'window', 50 + rnd() * 100)));
  }
  apply(moveNodes(L, [{ nodeId: nodes[Math.floor(rnd() * nodes.length)]!, to: { x: coord(), y: coord() } }]));
  apply(setWallThickness(L, [walls[Math.floor(rnd() * walls.length)]!], 5 + rnd() * 30));
  return p;
}

describe('geometry fuzz (ruling R37)', () => {
  it('deriveLevel never throws on 300 seeded random plans built through the commands', () => {
    const rnd = prng(2);
    let degraded = 0;
    failures.count = 0;
    for (let k = 0; k < 300; k++) {
      const level = lvl(scenario(rnd, k % 3 === 0));
      let d: ReturnType<typeof deriveLevel> | null = null;
      expect(() => {
        d = deriveLevel(level);
      }, `scenario ${k}`).not.toThrow();
      const r = d!;
      expect(finiteShape(r.shapeNoOpenings) && finiteShape(r.shapeWithOpenings), `scenario ${k}`).toBe(true);
      if (r.degraded) {
        degraded++;
        expect(r.rooms).toEqual([]);
      } else {
        expect(r.rooms.every((room) => Number.isFinite(room.area) && room.area > 0), `scenario ${k}`).toBe(true);
      }
    }
    // the raw library fails on some of these plans; the retries recover every one of them
    expect(failures.count).toBeGreaterThan(0);
    expect(degraded).toBe(0);
  }, 30_000);
});
