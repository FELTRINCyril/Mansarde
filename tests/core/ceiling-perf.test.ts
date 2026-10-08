import { describe, expect, it } from 'vitest';
import { ceilingUnder } from '@/core/geometry/ceiling';
import { rectRing } from '@/core/geometry/polygon';
import { createBeam, createLevel, createSlope } from '@/core/model/factory';

describe('ceilingUnder performance (ruling V2-R6)', () => {
  it('300 footprints under 4 slopes and 6 beams', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const level = createLevel('P', 0, 250);
    for (let i = 0; i < 4; i++) {
      const s = createSlope({ x: 100 + i * 200, y: -50 }, { x: 130 + i * 200, y: 1050 }, i % 2 ? 'left' : 'right', 200, 250, 150);
      level.slopes[s.id] = s;
    }
    for (let i = 0; i < 6; i++) {
      const b = createBeam({ x: -10, y: 80 + i * 150 }, { x: 1010, y: 100 + i * 150 }, { width: 14, drop: 15, mode: i % 2 ? 'ceiling' : 'fixed', bottom: 230 });
      level.beams[b.id] = b;
    }
    const fps = Array.from({ length: 300 }, () => rectRing(rnd() * 1000, rnd() * 1000, 40 + rnd() * 160, 40 + rnd() * 160, rnd() * 360));
    for (const f of fps) ceilingUnder(level, f); // warm-up
    const runs: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      for (const f of fps) ceilingUnder(level, f);
      runs.push(performance.now() - t0);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    console.log(`ceilingUnder x300, 4 slopes, 6 beams: mean ${mean.toFixed(2)} ms (${runs.map((r) => r.toFixed(2)).join(', ')})`);
    // generous bound so that a slow machine never makes it flaky; the target is < 8 ms
    expect(mean).toBeLessThan(40);
  });
});
