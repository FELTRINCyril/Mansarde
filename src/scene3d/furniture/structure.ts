import { main, mesh, named, parts, prism, type Builder } from './parts';

/*
 * Stairs (no plan-chambre model): solid steps with rounded edges, going up towards the back side
 * as the arrow of the 2D symbols. Each step is a block from the floor to its tread, the last tread
 * at the object height.
 */

const WOOD = '#c8a27a';
/** Going of a step (m), as the step lines of the 2D symbols (every 25 cm). */
const GOING = 0.25;

/** Number of treads of a straight run of length `len` (m): the 2D symbol's step lines plus one. */
const treads = (len: number) => Math.max(1, Math.ceil(len / Math.max(GOING, len / 80) - 1e-6));

/** Straight stairs: treads across the width, rising from the front (+z) to the back (-z). */
export const stairsStraight: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('stairs-straight');
  const wood = main(s, WOOD);
  const n = treads(d);
  const going = d / n;
  for (let i = 0; i < n; i++) {
    const top = (h * (i + 1)) / n;
    const z1 = d / 2 - i * going;
    g.add(p.rbox(w, top, going, 0.008, wood, 0, top / 2, z1 - going / 2, { roughness: 0.6 }));
  }
  return g;
};

/**
 * Quarter-turn stairs of the 2D symbol: a straight run from the front up to the landing square
 * at the back (side min(w, d)), then four winders turning about the back left corner of the run,
 * leaving on the left side.
 */
export const stairsQuarter: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('stairs-quarter');
  const wood = main(s, WOOD);
  const sq = Math.min(w, d);
  const run = d - sq;
  const nRun = run > 1e-6 ? treads(run) : 0;
  const n = nRun + 4;
  const going = nRun > 0 ? run / nRun : 0;
  const rise = (i: number) => (h * (i + 1)) / n;
  for (let i = 0; i < nRun; i++) {
    const top = rise(i);
    const z1 = d / 2 - i * going;
    g.add(p.rbox(w, top, going, 0.008, wood, 0, top / 2, z1 - going / 2, { roughness: 0.6 }));
  }
  // winders in the back square [-w/2, w/2] x [-d/2, yb], fanning from the pivot (-w/2, yb)
  const yb = -d / 2 + sq;
  const px = -w / 2;
  const hit = (theta: number) => {
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const t = Math.min(c > 1e-9 ? w / c : Infinity, sn > 1e-9 ? sq / sn : Infinity);
    return { x: px + c * t, z: yb - sn * t };
  };
  const inset = 0.004;
  for (let k = 0; k < 4; k++) {
    const a0 = (Math.PI / 2) * (k / 4);
    const a1 = (Math.PI / 2) * ((k + 1) / 4);
    const h0 = hit(a0);
    const h1 = hit(a1);
    const pts = [{ x: px, z: yb }, h0];
    // the corner (w/2, -d/2) of the square lies between a ray on the right side and a ray on the back side
    if (h0.x > w / 2 - 1e-9 && h0.z > -d / 2 + 1e-9 && h1.z < -d / 2 + 1e-9 && h1.x < w / 2 - 1e-9) pts.push({ x: w / 2, z: -d / 2 });
    pts.push(h1);
    // shrink towards the centroid by the bevel, which grows the outline back
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const cz = pts.reduce((a, q) => a + q.z, 0) / pts.length;
    const shrunk = pts.map((q) => {
      const dx = q.x - cx;
      const dz = q.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      return { x: q.x - (dx / len) * inset * 1.5, z: q.z - (dz / len) * inset * 1.5 };
    });
    g.add(mesh(prism(shrunk, 0, rise(nRun + k), inset, 1), kit.mat(wood, { roughness: 0.6 })));
  }
  return g;
};
