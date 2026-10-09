import { SphereGeometry } from 'three';
import { main, mesh, named, parts, type Builder, type FurnitureSpec, type Kit } from './parts';

/**
 * Office chair of plan-chambre's desk (seat, back, column, round foot), on its own here; its back
 * is on the back side (-z), as in the 2D symbol. The object color, when set, goes on the seat and
 * the back.
 */
export const chair: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('chair');
  const fabric = main(s, '#3a3f47');
  const seatY = Math.min(0.47, h * 0.52);
  const foot = Math.min(w, d) / 2 - 0.01;
  g.add(p.cyl(foot, foot, 0.03, '#222', 0, 0.015, 0));
  const column = seatY - 0.035 - 0.03;
  g.add(p.cyl(0.025, 0.025, column, '#222', 0, 0.03 + column / 2, 0));
  g.add(p.rbox(w, 0.07, d - 0.06, 0.03, fabric, 0, seatY, 0.03));
  const backH = h - (seatY + 0.05);
  g.add(p.rbox(w * 0.96, backH, 0.05, 0.02, fabric, 0, h - backH / 2, -d / 2 + 0.025));
  return g;
};

/** plan-chambre's armchair: legs, seat block, cushion, back and two arms in a green fabric. */
export const armchair: Builder = (s, kit) => upholstered(s, kit, 1, 'armchair');

export const sofa2: Builder = (s, kit) => upholstered(s, kit, 2, 'sofa-2');
export const sofa3: Builder = (s, kit) => upholstered(s, kit, 3, 'sofa-3');

/**
 * plan-chambre's armchair widened into a sofa of `seats` cushions: same legs, seat block, back
 * (20 cm, against -z) and arms (at most 14 cm); the 2D symbol of the sofas uses the same parts.
 */
function upholstered(s: FurnitureSpec, kit: Kit, seats: number, name: string) {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named(name);
  const fab = main(s, '#7f9c83');
  const cushion = s.custom ? s.color : '#93ae96';
  const aw = Math.min(0.14, w / 5);
  const bt = Math.min(0.2, d * 0.25);
  const k = Math.min(1, h / 0.85);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.cyl(0.02, 0.015, 0.1 * k, '#3a332c', sx * (w / 2 - 0.08), 0.05 * k, sz * (d / 2 - 0.08)));
  g.add(p.rbox(w, 0.3 * k, d, 0.05, fab, 0, 0.25 * k, 0, { roughness: 0.95 }));
  const cw = (w - 2 * aw) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + aw + cw * (i + 0.5);
    g.add(p.rbox(cw - (seats > 1 ? 0.01 : 0), 0.12 * k, d - bt - 0.02, 0.05, cushion, x, 0.46 * k, bt / 2 - 0.01, { roughness: 0.95 }));
  }
  g.add(p.rbox(w, h - 0.1 * k, bt, 0.06, fab, 0, 0.1 * k + (h - 0.1 * k) / 2, -d / 2 + bt / 2, { roughness: 0.95 }));
  const armH = Math.min(0.52, h * 0.62);
  for (const sx of [-1, 1]) g.add(p.rbox(aw, armH, d, 0.05, fab, sx * (w / 2 - aw / 2), 0.1 * k + armH / 2, 0, { roughness: 0.95 }));
  return g;
}

/**
 * Corner sofa of the 2D symbol: back along the back side and along the left side, an arm on the
 * right, a seat block over the whole footprint with its cushions (the left part split in two).
 */
export const sofaCorner: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('sofa-corner');
  const fab = main(s, '#7f9c83');
  const cushion = s.custom ? s.color : '#93ae96';
  const bt = Math.min(0.25, d * 0.25);
  const at = Math.min(0.18, w * 0.1);
  const k = Math.min(1, h / 0.85);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.cyl(0.02, 0.015, 0.1 * k, '#3a332c', sx * (w / 2 - 0.08), 0.05 * k, sz * (d / 2 - 0.08)));
  g.add(p.rbox(w, 0.3 * k, d, 0.05, fab, 0, 0.25 * k, 0, { roughness: 0.95 }));
  const backY = 0.1 * k + (h - 0.1 * k) / 2;
  g.add(p.rbox(w, h - 0.1 * k, bt, 0.06, fab, 0, backY, -d / 2 + bt / 2, { roughness: 0.95 }));
  g.add(p.rbox(bt, h - 0.1 * k, d - bt, 0.06, fab, -w / 2 + bt / 2, backY, bt / 2, { roughness: 0.95 }));
  const armH = Math.min(0.52, h * 0.62);
  g.add(p.rbox(at, armH, d - bt, 0.05, fab, w / 2 - at / 2, 0.1 * k + armH / 2, bt / 2, { roughness: 0.95 }));
  // cushions: the left part (40 %) front and back, the right part in one piece
  const x0 = -w / 2 + bt;
  const x1 = w / 2 - at;
  const xm = x0 + (x1 - x0) * 0.4;
  const z0 = -d / 2 + bt;
  const zm = z0 + (d / 2 - z0) * 0.5;
  const c = (xa: number, xb: number, za: number, zb: number) =>
    g.add(p.rbox(xb - xa - 0.01, 0.12 * k, zb - za - 0.01, 0.05, cushion, (xa + xb) / 2, 0.46 * k, (za + zb) / 2, { roughness: 0.95 }));
  c(x0, xm, z0, zm);
  c(x0, xm, zm, d / 2);
  c(xm, x1, z0, d / 2);
  return g;
};

/** plan-chambre's pouf: a flattened sphere with a button on top. */
export const pouf: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('pouf');
  const r = w / 2;
  const m = mesh(new SphereGeometry(Math.max(0.002, r), 48, 32), kit.mat(main(s, '#c96f4a'), { roughness: 0.95 }), 0, h / 2, 0);
  m.scale.set(1, h / (2 * r), d / w);
  g.add(m);
  const b = Math.min(0.04, r / 6, h / 4);
  g.add(p.sphere(b, '#a85a3b', 0, h - b, 0));
  return g;
};
