import { describe, expect, it } from 'vitest';
import { beamBottomAt, beamFootprint } from '@/core/geometry/beams';
import { ceilingAt, ceilingUnder, ceilingWithoutBeams } from '@/core/geometry/ceiling';
import { deriveVolumes } from '@/core/geometry/derived';
import { area, distanceToRing, pointInRing } from '@/core/geometry/polygon';
import { slopeBand, slopeFrame, slopeHeightAt, slopeIsolines } from '@/core/geometry/slopes';
import { createBeam, createSlope } from '@/core/model/factory';
import type { Beam, Level, Ring, Slope } from '@/core/model/types';
import { levelFromWalls, rectRoom } from './fixtures';

/**
 * The `plan-chambre` room: interior 0..400 x 0..400 (wall axes at -10 and 410, 20 cm thick),
 * ceiling 240, slope starting on x = 197 going down towards +x over 203 cm, 240 -> 150.
 * The start line goes from (197, -50) to (197, 450): dir = +y, perp(dir) = -x, so +x is 'right'.
 */
function chambre(): { level: Level; slope: Slope } {
  const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
  level.height = 240;
  const slope = createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150);
  level.slopes[slope.id] = slope;
  return { level, slope };
}

const addBeam = (level: Level, b: Beam): Beam => {
  level.beams[b.id] = b;
  return b;
};

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Height of the chambre slope at abscissa x (inside its lateral extent). */
const hx = (x: number): number => 240 - ((x - 197) * 90) / 203;

describe('slopes', () => {
  it('frame: normal points down-slope, left = +perp(b - a)', () => {
    const { slope } = chambre();
    const f = slopeFrame(slope);
    expect(f.dir.x).toBeCloseTo(0, 12);
    expect(f.dir.y).toBeCloseTo(1, 12);
    expect(f.normal.x).toBeCloseTo(1, 12);
    expect(f.normal.y).toBeCloseTo(0, 12);
    expect(f.length).toBe(500);
    expect(f.depth).toBe(203);
    const left = slopeFrame({ ...slope, side: 'left' });
    expect(left.normal.x).toBeCloseTo(-1, 12);
  });

  it('band is the quad a, b, b + normal * depth, a + normal * depth', () => {
    const { slope } = chambre();
    const band = slopeBand(slope);
    expect(band).toHaveLength(4);
    expect(band[0]).toEqual({ x: 197, y: -50 });
    expect(band[1]).toEqual({ x: 197, y: 450 });
    expect(band[2]!.x).toBeCloseTo(400, 9);
    expect(band[2]!.y).toBeCloseTo(450, 9);
    expect(band[3]!.x).toBeCloseTo(400, 9);
    expect(band[3]!.y).toBeCloseTo(-50, 9);
    expect(area(band)).toBeCloseTo(203 * 500, 6);
  });

  it('height: linear in the band, heightEnd beyond, null upslope or outside the lateral extent', () => {
    const { slope } = chambre();
    expect(slopeHeightAt(slope, { x: 197, y: 200 })).toBeCloseTo(240, 9);
    expect(slopeHeightAt(slope, { x: 300, y: 200 })).toBeCloseTo(240 - (103 * 90) / 203, 9);
    expect(slopeHeightAt(slope, { x: 400, y: 200 })).toBeCloseTo(150, 9);
    expect(slopeHeightAt(slope, { x: 420, y: 200 })).toBe(150);
    expect(slopeHeightAt(slope, { x: 150, y: 200 })).toBeNull();
    expect(slopeHeightAt(slope, { x: 300, y: 460 })).toBeNull();
    expect(slopeHeightAt(slope, { x: 300, y: -60 })).toBeNull();
  });

  it('isolines: start, every 20 cm strictly between, end', () => {
    const { slope } = chambre();
    const lines = slopeIsolines(slope);
    expect(lines.map((l) => [l.kind, l.height])).toEqual([
      ['start', 240],
      ['level', 220],
      ['level', 200],
      ['level', 180],
      ['level', 160],
      ['end', 150],
    ]);
    // x of height h: 197 + (240 - h) * 203 / 90
    const xs = [197, 242.1111, 287.2222, 332.3333, 377.4444, 400];
    lines.forEach((l, i) => {
      expect(l.a.x).toBeCloseTo(xs[i]!, 3);
      expect(l.b.x).toBeCloseTo(xs[i]!, 3);
      expect(l.a.y).toBeCloseTo(-50, 9);
      expect(l.b.y).toBeCloseTo(450, 9);
    });
  });

  it('isolines of a rising slope go up; equal heights give start and end only', () => {
    const rising = createSlope({ x: 0, y: 0 }, { x: 100, y: 0 }, 'left', 100, 150, 200);
    expect(slopeIsolines(rising).map((l) => l.height)).toEqual([150, 160, 180, 200]);
    const flat = createSlope({ x: 0, y: 0 }, { x: 100, y: 0 }, 'left', 100, 200, 200);
    expect(slopeIsolines(flat).map((l) => l.kind)).toEqual(['start', 'end']);
    expect(slopeIsolines(createSlope({ x: 0, y: 0 }, { x: 100, y: 0 }, 'left', 100, 240, 150), 50).map((l) => l.height)).toEqual([
      240, 200, 150,
    ]);
  });
});

describe('ceilingAt', () => {
  it('follows the plan-chambre slope', () => {
    const { level } = chambre();
    expect(ceilingAt(level, { x: 100, y: 200 })).toBe(240);
    expect(ceilingAt(level, { x: 300, y: 200 })).toBeCloseTo(194.33, 2);
    expect(ceilingAt(level, { x: 300, y: 200 })).toBeCloseTo(240 - (103 * 90) / 203, 9);
    expect(ceilingAt(level, { x: 400, y: 200 })).toBeCloseTo(150, 9);
    expect(ceilingAt(level, { x: 420, y: 200 })).toBe(150);
    expect(ceilingAt(level, { x: 150, y: 200 })).toBe(240);
  });

  it('a slope higher than the level is capped by the level height', () => {
    const { level, slope } = chambre();
    level.slopes[slope.id] = { ...slope, heightStart: 300, heightEnd: 260 };
    expect(ceilingWithoutBeams(level, { x: 300, y: 200 })).toBe(240);
  });

  it('two opposite slopes (gable roof): the ridge takes the lower one', () => {
    const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
    level.height = 240;
    // A goes down towards +x from x = 150 over 200 cm; B goes down towards -x from x = 250 over 100 cm
    const sa = createSlope({ x: 150, y: 0 }, { x: 150, y: 400 }, 'right', 200, 240, 150);
    const sb = createSlope({ x: 250, y: 0 }, { x: 250, y: 400 }, 'left', 100, 240, 150);
    level.slopes[sa.id] = sa;
    level.slopes[sb.id] = sb;
    // at x = 200: A = 240 - 50 * 90 / 200 = 217.5, B = 240 - 50 * 90 / 100 = 195
    expect(ceilingAt(level, { x: 200, y: 100 })).toBeCloseTo(195, 9);
    // at x = 300: A = 240 - 150 * 0.45 = 172.5, B upslope
    expect(ceilingAt(level, { x: 300, y: 100 })).toBeCloseTo(172.5, 9);
    // across the ridge: A at x = 220 -> 208.5, B at x = 180 -> 177
    const u = ceilingUnder(level, rect(180, 50, 220, 90));
    expect(u.height).toBeCloseTo(177, 9);
    expect(u.at.x).toBe(180);
  });
});

describe('ceilingUnder', () => {
  it('footprint straddling the start line', () => {
    const { level } = chambre();
    const u = ceilingUnder(level, rect(180, 0, 260, 60));
    expect(u.height).toBeCloseTo(212.07, 2);
    expect(u.height).toBeCloseTo(240 - (63 * 90) / 203, 9);
    expect(u.at.x).toBe(260);
  });

  it('wardrobe deep under the slope', () => {
    const { level } = chambre();
    const u = ceilingUnder(level, rect(330, 100, 390, 160));
    expect(u.height).toBeCloseTo(154.43, 2);
    expect(u.height).toBeCloseTo(hx(390), 9);
    expect(u.at.x).toBe(390);
  });

  it('upslope footprint keeps the level height; a footprint beyond the end line gets heightEnd', () => {
    const { level } = chambre();
    expect(ceilingUnder(level, rect(20, 20, 150, 100)).height).toBe(240);
    expect(ceilingUnder(level, rect(400, 100, 405, 120)).height).toBeCloseTo(150, 9);
  });

  it('only the part inside the lateral extent counts', () => {
    const { level } = chambre();
    // y 440..480 straddles the lateral end y = 450; the worst point is (340, 450) or (340, 440)
    const u = ceilingUnder(level, rect(300, 440, 340, 480));
    expect(u.height).toBeCloseTo(hx(340), 9);
    expect(u.at.x).toBe(340);
    expect(u.at.y).toBeLessThanOrEqual(450 + 1e-9);
    // fully outside the lateral extent
    expect(ceilingUnder(level, rect(300, 460, 340, 480)).height).toBe(240);
  });

  it('cut by a slant edge: the worst point is where the edge leaves the band', () => {
    const { level } = chambre();
    // triangle whose edge (300, 440) -> (380, 460) crosses the lateral end y = 450 at x = 340
    const u = ceilingUnder(level, [
      { x: 300, y: 440 },
      { x: 380, y: 460 },
      { x: 300, y: 460 },
    ]);
    expect(u.height).toBeCloseTo(hx(340), 6);
    expect(u.at.x).toBeCloseTo(340, 6);
    expect(u.at.y).toBeCloseTo(450, 6);
  });
});

describe('beams', () => {
  it('footprint is the rectangle around the axis', () => {
    const b = createBeam({ x: 185, y: 0 }, { x: 185, y: 400 }, { width: 12 });
    const ring = beamFootprint(b);
    expect(area(ring)).toBeCloseTo(12 * 400, 9);
    const xs = ring.map((p) => p.x).sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(179, 9);
    expect(xs[3]).toBeCloseTo(191, 9);
  });

  it('fixed beam: bottom at its height, under the point and under an object across it', () => {
    const { level } = chambre();
    const b = addBeam(level, createBeam({ x: 185, y: 0 }, { x: 185, y: 400 }, { width: 12, mode: 'fixed', bottom: 225 }));
    expect(beamBottomAt(level, b, { x: 185, y: 100 })).toBe(225);
    expect(ceilingAt(level, { x: 185, y: 100 })).toBe(225);
    expect(ceilingAt(level, { x: 175, y: 100 })).toBe(240);
    expect(ceilingWithoutBeams(level, { x: 185, y: 100 })).toBe(240);
    const u = ceilingUnder(level, rect(150, 50, 195, 100));
    expect(u.height).toBe(225);
    expect(u.at.x).toBeGreaterThanOrEqual(179);
    expect(u.at.x).toBeLessThanOrEqual(191);
    // an object next to the beam does not see it
    expect(ceilingUnder(level, rect(150, 50, 178, 100)).height).toBe(240);
  });

  it('ceiling beam under the slope: bottom = ceiling - drop', () => {
    const { level } = chambre();
    const b = addBeam(level, createBeam({ x: 300, y: 0 }, { x: 300, y: 400 }, { width: 12, drop: 15, mode: 'ceiling' }));
    expect(beamBottomAt(level, b, { x: 300, y: 200 })).toBeCloseTo(hx(300) - 15, 9);
    expect(ceilingAt(level, { x: 300, y: 200 })).toBeCloseTo(hx(300) - 15, 9);
    expect(ceilingWithoutBeams(level, { x: 300, y: 200 })).toBeCloseTo(hx(300), 9);
    // the beam (x 294..306) is lowest at x = 306: 191.675 - 15 = 176.675, below the slope at x = 320
    const u = ceilingUnder(level, rect(280, 100, 320, 150));
    expect(u.height).toBeCloseTo(hx(306) - 15, 9);
    // on the beam edge, moved 1e-8 cm into the beam so that ceilingAt sees it
    expect(u.at.x).toBeCloseTo(306, 6);
    expect(ceilingAt(level, u.at)).toBeCloseTo(u.height, 6);
  });

  it('ceiling beam across the lateral end of a slope: exact minimum on the slope edge', () => {
    const { level } = chambre();
    // beam y 430..470, x 290..390 covering the triangle; the ceiling under it drops at y < 450
    addBeam(level, createBeam({ x: 290, y: 450 }, { x: 390, y: 450 }, { width: 40, drop: 15, mode: 'ceiling' }));
    const u = ceilingUnder(level, [
      { x: 300, y: 440 },
      { x: 380, y: 460 },
      { x: 300, y: 460 },
    ]);
    // the worst point (340, 450) is not a vertex of beam/footprint: found by cutting with the band
    expect(u.height).toBeCloseTo(hx(340) - 15, 6);
    expect(u.at.x).toBeCloseTo(340, 6);
  });
});

describe('deriveVolumes', () => {
  it('caches slope bands and beam footprints by identity', () => {
    const { level, slope } = chambre();
    const b = addBeam(level, createBeam({ x: 185, y: 0 }, { x: 185, y: 400 }));
    const v1 = deriveVolumes(level);
    expect(v1.slopeBands.get(slope.id)).toEqual(slopeBand(slope));
    expect(v1.beamFootprints.get(b.id)).toEqual(beamFootprint(b));
    expect(deriveVolumes(level)).toBe(v1);
    // a new level sharing the same volumes and walls reuses the result
    expect(deriveVolumes({ ...level, objects: {} })).toBe(v1);
    // a changed slope set recomputes
    const moved = { ...slope, depth: 100 };
    const v2 = deriveVolumes({ ...level, slopes: { [slope.id]: moved } });
    expect(v2).not.toBe(v1);
    expect(v2.slopeBands.get(slope.id)).toEqual(slopeBand(moved));
  });
});

describe('ceilingUnder: reported point and random cross-check', () => {
  it('`at` is inside the footprint and ceilingAt(at) is the reported height, even on a beam edge', () => {
    const { level } = chambre();
    addBeam(level, createBeam({ x: 185, y: 0 }, { x: 185, y: 400 }, { width: 12, mode: 'fixed', bottom: 225 }));
    // footprints sharing an edge with the beam (x 179..191): the minimum (225) sits on beam edges
    for (const fp of [rect(150, 50, 191, 100), rect(179, 50, 195, 100), rect(185, 50, 191, 100), rect(179, 50, 191, 100)]) {
      const u = ceilingUnder(level, fp);
      expect(u.height).toBe(225);
      expect(Math.abs(ceilingAt(level, u.at) - u.height)).toBeLessThan(1e-6);
      expect(pointInRing(u.at, fp) || distanceToRing(u.at, fp) < 1e-6).toBe(true);
    }
    // the minimum on a vertex that ceilingAt sees is reported as is (brief: at.x === 260)
    expect(ceilingUnder(level, rect(195, 0, 260, 60)).at).toEqual({ x: 260, y: 0 });
  });

  it('matches a dense sampling of ceilingAt (random levels and footprints, fixed seed)', () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const R = (a: number, b: number): number => a + (b - a) * rnd();
    let checked = 0;
    for (let iter = 0; iter < 150; iter++) {
      const level = levelFromWalls([]);
      level.height = R(220, 280);
      for (let i = Math.floor(R(0, 4)); i > 0; i--) {
        const a = { x: R(0, 400), y: R(0, 400) };
        const ang = R(0, 2 * Math.PI);
        const L = R(30, 400);
        const s = createSlope(a, { x: a.x + L * Math.cos(ang), y: a.y + L * Math.sin(ang) }, rnd() < 0.5 ? 'left' : 'right', R(60, 300), R(150, 300), R(100, 260));
        level.slopes[s.id] = s;
      }
      for (let i = Math.floor(R(0, 4)); i > 0; i--) {
        const a = { x: R(0, 400), y: R(0, 400) };
        const ang = R(0, 2 * Math.PI);
        const L = R(20, 400);
        addBeam(level, createBeam(a, { x: a.x + L * Math.cos(ang), y: a.y + L * Math.sin(ang) }, { width: R(5, 40), drop: R(5, 40), mode: rnd() < 0.5 ? 'fixed' : 'ceiling', bottom: R(150, 260) }));
      }
      const cx = R(0, 400);
      const cy = R(0, 400);
      const w = R(10, 150);
      const h = R(10, 150);
      const rot = R(0, 2 * Math.PI);
      const kind = rnd();
      const local =
        kind < 0.5
          ? [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]
          : kind < 0.8
            ? [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: h / 2 }, { x: -w / 2, y: h / 2 }]
            : Array.from({ length: 32 }, (_, k) => ({ x: (w / 2) * Math.cos((k * Math.PI) / 16), y: (h / 2) * Math.sin((k * Math.PI) / 16) }));
      const fp = local.map((p) => ({ x: cx + p.x * Math.cos(rot) - p.y * Math.sin(rot), y: cy + p.x * Math.sin(rot) + p.y * Math.cos(rot) }));
      const u = ceilingUnder(level, fp);
      expect(pointInRing(u.at, fp) || distanceToRing(u.at, fp) < 1e-6).toBe(true);
      expect(Math.abs(ceilingAt(level, u.at) - u.height)).toBeLessThan(1e-6);
      // dense sampling: never below u.height, and close to it
      const xs = fp.map((p) => p.x);
      const ys = fp.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      let m = Infinity;
      const N = 60;
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const p = { x: x0 + ((x1 - x0) * i) / N, y: y0 + ((y1 - y0) * j) / N };
          if (pointInRing(p, fp)) m = Math.min(m, ceilingAt(level, p));
        }
      }
      // u.height is reached at u.at inside the footprint (so it is not too low) and no sample is
      // lower (so it misses nothing the grid sees)
      if (m !== Infinity) expect(u.height).toBeLessThanOrEqual(m + 1e-6);
      if (m !== Infinity) checked++;
    }
    expect(checked).toBeGreaterThan(140);
  });
});
