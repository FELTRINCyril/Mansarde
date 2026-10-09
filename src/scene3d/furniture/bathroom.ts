import { CylinderGeometry } from 'three';
import { main, mesh, named, parts, type Builder } from './parts';

/*
 * Bathroom (no plan-chambre model): simple rounded versions in white ceramic, laid out as the 2D
 * symbols (tank and taps on the back side, bath drain on the left).
 */

const CERAMIC = '#f7f7f5';
const SHADOW = '#dfe3e6';

/** WC: tank against the back, oval bowl and seat in front. */
export const wc: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('wc');
  const white = main(s, CERAMIC);
  const tw = w * 0.75;
  const td = Math.min(d * 0.28, 0.2);
  const th = Math.min(0.42, h * 0.5);
  g.add(p.rbox(tw, th, td, 0.02, white, 0, h - th / 2, -d / 2 + td / 2, { roughness: 0.3 }));
  g.add(p.rbox(tw * 0.9, h - th, td * 0.6, 0.02, white, 0, (h - th) / 2, -d / 2 + td * 0.3, { roughness: 0.3 }));
  const bowlD = d - td;
  const seat = Math.min(0.42, h * 0.55);
  const bowl = mesh(new CylinderGeometry(w * 0.45, w * 0.3, seat - 0.02, 32), kit.mat(white, { roughness: 0.3 }), 0, (seat - 0.02) / 2, -d / 2 + td + bowlD / 2);
  bowl.scale.z = bowlD / (w * 0.9);
  g.add(bowl);
  const lid = mesh(new CylinderGeometry(w * 0.47, w * 0.47, 0.025, 32), kit.mat(white, { roughness: 0.4 }), 0, seat, -d / 2 + td + bowlD / 2);
  lid.scale.z = bowlD / (w * 0.94);
  g.add(lid);
  return g;
};

/** Washbasin: pedestal and a basin with its bowl. */
export const washbasin: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('washbasin');
  const white = main(s, CERAMIC);
  const bh = Math.min(0.16, h / 3);
  g.add(p.cyl(0.07, 0.09, h - bh, white, 0, (h - bh) / 2, -d / 2 + Math.min(0.15, d / 2), { roughness: 0.3 }));
  g.add(p.rbox(w, bh, d, 0.04, white, 0, h - bh / 2, 0, { roughness: 0.3 }));
  const bowl = mesh(new CylinderGeometry(w * 0.38, w * 0.38, 0.004, 32), kit.mat(SHADOW, { roughness: 0.3 }), 0, h + 0.001, d * 0.08, false);
  bowl.scale.z = (d * 0.34) / (w * 0.38);
  g.add(bowl);
  return g;
};

/** Shower: tray, glass panels on the front and the right, column and head on the back. */
export const shower: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('shower');
  g.add(p.rbox(w, 0.06, d, 0.02, main(s, CERAMIC), 0, 0.03, 0, { roughness: 0.3 }));
  const glass = kit.glass();
  const gh = h - 0.07;
  g.add(p.box(w - 0.02, gh, 0.008, glass, 0, 0.06 + gh / 2, d / 2 - 0.006));
  g.add(p.box(0.008, gh, d - 0.02, glass, w / 2 - 0.006, 0.06 + gh / 2, 0));
  g.add(p.box(w - 0.01, 0.015, 0.015, '#b8bcc0', 0, h - 0.0075, d / 2 - 0.0075, { metalness: 0.6, roughness: 0.3 }));
  const cz = -d / 2 + 0.03;
  g.add(p.cyl(0.012, 0.012, h - 0.25, '#b8bcc0', 0, 0.06 + (h - 0.25) / 2, cz, { metalness: 0.6, roughness: 0.3 }));
  g.add(p.cyl(0.09, 0.09, 0.015, '#b8bcc0', 0, h - 0.19, cz + 0.06, { metalness: 0.6, roughness: 0.3 }));
  return g;
};

/** Bathtub: base, four rounded rims, the inside floor and the drain on the left. */
export const bathtub: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('bathtub');
  const white = main(s, CERAMIC);
  const e = Math.min(0.08, w * 0.1, d * 0.1);
  const base = Math.min(0.15, h / 3);
  g.add(p.rbox(w, base, d, 0.02, white, 0, base / 2, 0, { roughness: 0.3 }));
  for (const sz of [-1, 1]) g.add(p.rbox(w, h, e, 0.02, white, 0, h / 2, sz * (d / 2 - e / 2), { roughness: 0.3 }));
  for (const sx of [-1, 1]) g.add(p.rbox(e, h, d, 0.02, white, sx * (w / 2 - e / 2), h / 2, 0, { roughness: 0.3 }));
  g.add(p.rbox(w - 2 * e, 0.004, d - 2 * e, 0.002, SHADOW, 0, base, 0, { roughness: 0.3 }));
  const drain = Math.min(w, d) * 0.03;
  g.add(p.cyl(drain, drain, 0.004, '#9aa0a6', -w / 2 + e + Math.min(w - 2 * e, d - 2 * e) * 0.3, base + 0.003, 0, { metalness: 0.6, roughness: 0.3 }));
  return g;
};

/** Washing machine: white body, round door with its dark glass, control strip on top. */
export const washingMachine: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('washing-machine');
  g.add(p.rbox(w, h, d - 0.03, 0.015, main(s, '#f4f4f2'), 0, h / 2, -0.015, { roughness: 0.4 }));
  const front = d / 2 - 0.03;
  const r = Math.min(w * 0.33, (h - 0.15) * 0.4);
  const cy = (h - 0.12) / 2 + 0.02;
  const door = mesh(new CylinderGeometry(r, r, 0.016, 40), kit.mat('#c9ccd0', { metalness: 0.5, roughness: 0.3 }), 0, cy, front + 0.008);
  door.rotation.x = Math.PI / 2;
  g.add(door);
  const pane = mesh(new CylinderGeometry(r * 0.72, r * 0.72, 0.006, 40), kit.mat('#2a3340', { roughness: 0.15 }), 0, cy, front + 0.019, false);
  pane.rotation.x = Math.PI / 2;
  g.add(pane);
  g.add(p.box(w - 0.04, 0.08, 0.01, '#e2e2df', 0, h - 0.06, front + 0.005));
  return g;
};
