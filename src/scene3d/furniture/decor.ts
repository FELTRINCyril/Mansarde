import { BoxGeometry, CylinderGeometry, PlaneGeometry } from 'three';
import { main, mesh, named, parts, type Builder } from './parts';

/**
 * TV standing on a piece of furniture: plan-chambre's TV without its cabinet (the TV unit is an
 * object of its own): foot plate, column and screen near the back, facing the front (+z).
 */
export const tv: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('tv');
  const th = Math.max(0.05, Math.min(h - 0.06, w / 1.78));
  const tw = Math.min(w, th * 1.78);
  // column at the back, screen just in front of it
  const col = Math.min(0.04, d * 0.25);
  const t = Math.min(0.04, d * 0.25);
  const sz = -d / 2 + col + t / 2;
  g.add(p.box(Math.min(0.32, w * 0.3), 0.015, d, '#1a1a1a', 0, 0.0075, 0));
  g.add(p.box(0.06, h - th / 2, col, '#1a1a1a', 0, (h - th / 2) / 2, -d / 2 + col / 2));
  g.add(p.rbox(tw, th, t, 0.008, main(s, '#111216'), 0, h - th / 2, sz, { roughness: 0.3 }));
  g.add(mesh(new PlaneGeometry(tw - 0.03, th - 0.03), kit.screen(0.35), 0, h - th / 2, sz + t / 2 + 0.001, false));
  return g;
};

/** plan-chambre's wall TV: bracket on the back, thin body, lit screen on the front. */
export const tvWall: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('tv-wall');
  const bracket = Math.min(0.03, d / 3);
  g.add(p.box(Math.min(0.4, w * 0.4), Math.min(0.3, h * 0.5), bracket, '#333', 0, h / 2, -d / 2 + bracket / 2));
  const body = Math.max(0.01, d - bracket);
  g.add(p.rbox(w, h, body, 0.008, main(s, '#111216'), 0, h / 2, d / 2 - body / 2, { roughness: 0.3 }));
  g.add(mesh(new PlaneGeometry(w - 0.03, h - 0.03), kit.screen(0.4), 0, h / 2, d / 2 + 0.001, false));
  return g;
};

/** plan-chambre's plant: pot and seven leafy balls, kept under the object height. */
export const plant: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('plant');
  const r = Math.min(w, d) / 2;
  const ph = Math.min(0.4, h * 0.3);
  g.add(p.cyl(r * 0.6, r * 0.45, ph, main(s, '#e8e1d4'), 0, ph / 2, 0, { roughness: 0.6 }));
  const leaves = ['#5f8a4f', '#6f9a5c', '#4f7a43'];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const rr = r * (0.2 + (i % 3) * 0.2);
    const lr = Math.min(r * (0.55 - (i % 3) * 0.08), r - rr, (h - ph) / 2);
    const y = ph + (h - ph) * (0.35 + (i % 4) * 0.17);
    g.add(p.sphere(lr, leaves[i % 3]!, Math.cos(a) * rr, Math.min(h - lr, y), Math.sin(a) * rr));
  }
  return g;
};

/** Bedside lamp (plan-chambre's nightstand lamp, and its floor lamp): base, stem and a lit shade. */
export const lamp: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('lamp');
  const r = Math.min(w, d) / 2;
  const shadeH = Math.min(0.16, h * 0.4);
  g.add(p.cyl(r * 0.55, r * 0.6, 0.03, main(s, '#5d5148'), 0, 0.015, 0));
  g.add(p.cyl(0.008, 0.008, h - 0.03 - shadeH / 2, main(s, '#5d5148'), 0, 0.03 + (h - 0.03 - shadeH / 2) / 2, 0));
  g.add(mesh(new CylinderGeometry(r * 0.68, r, shadeH, 32, 1, true), kit.glow(), 0, h - shadeH / 2, 0));
  return g;
};

/**
 * plan-chambre's rug (1.2 cm there, the object height here): a slab with the canvas pattern on
 * top (plain in the object color when set); casts no shadow.
 */
export const rugRect: Builder = (s, kit) => {
  const { w, d, h } = s;
  const g = named('rug-rect');
  const t = h;
  const side = kit.mat(main(s, '#b5643f'), { roughness: 1 });
  const top = s.custom ? side : kit.rug(false);
  // BoxGeometry groups: +x, -x, +y (top), -y, +z, -z
  g.add(mesh(new BoxGeometry(w, t, d), [side, side, top, side, side, side], 0, t / 2, 0, false));
  return g;
};

export const rugRound: Builder = (s, kit) => {
  const { w, d, h } = s;
  const g = named('rug-round');
  const t = h;
  const side = kit.mat(main(s, '#b5643f'), { roughness: 1 });
  // CylinderGeometry groups: side, top, bottom
  const m = mesh(new CylinderGeometry(w / 2, w / 2, t, 64), [side, s.custom ? side : kit.rug(true), side], 0, t / 2, 0, false);
  m.scale.z = d / w;
  g.add(m);
  return g;
};
