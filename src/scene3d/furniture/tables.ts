import { CylinderGeometry } from 'three';
import { main, mesh, named, parts, type Builder } from './parts';

/**
 * plan-chambre's desk: light top and four black legs. Its screen, keyboard and plant stand above
 * the desk height, outside the object's box: they are left out (the chair is its own object).
 */
export const desk: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('desk');
  const top = Math.min(0.035, h / 4);
  g.add(p.rbox(w, top, d, 0.01, main(s, '#d8c3a5'), 0, h - top / 2, 0, { roughness: 0.5 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.box(0.04, h - top, 0.04, '#2b2b2b', sx * (w / 2 - 0.05), (h - top) / 2, sz * (d / 2 - 0.05)));
  return g;
};

/** Dining table: the desk's top, thicker, on four wooden legs set back from the edges. */
export const tableRect: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('table-rect');
  const wood = main(s, '#c9a27c');
  const top = Math.min(0.04, h / 4);
  g.add(p.rbox(w, top, d, 0.012, wood, 0, h - top / 2, 0, { roughness: 0.55 }));
  const leg = Math.min(0.06, w / 6, d / 6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.box(leg, h - top, leg, '#a8835f', sx * (w / 2 - 0.08), (h - top) / 2, sz * (d / 2 - 0.08)));
  // apron under the top
  g.add(p.box(w - 0.16, 0.08, d - 0.16, '#a8835f', 0, h - top - 0.04, 0));
  return g;
};

/** Round (or oval) table on a central column and a round foot. */
export const tableRound: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('table-round');
  const wood = main(s, '#c9a27c');
  const top = Math.min(0.04, h / 4);
  const t = mesh(new CylinderGeometry(w / 2, w / 2, top, 48), kit.mat(wood, { roughness: 0.55 }), 0, h - top / 2, 0);
  t.scale.z = d / w;
  g.add(t);
  const r = Math.min(w, d) / 2;
  g.add(p.cyl(0.05, 0.06, h - top - 0.03, '#a8835f', 0, 0.03 + (h - top - 0.03) / 2, 0));
  g.add(p.cyl(r * 0.45, r * 0.5, 0.03, '#a8835f', 0, 0.015, 0, undefined, 32));
  return g;
};

/** Low coffee table: top, four legs and a shelf underneath. */
export const coffeeTable: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('coffee-table');
  const wood = main(s, '#b48b63');
  const top = Math.min(0.035, h / 4);
  g.add(p.rbox(w, top, d, 0.012, wood, 0, h - top / 2, 0, { roughness: 0.55 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.box(0.035, h - top, 0.035, '#2b2b2b', sx * (w / 2 - 0.04), (h - top) / 2, sz * (d / 2 - 0.04)));
  g.add(p.box(w - 0.1, 0.018, d - 0.1, wood, 0, Math.min(0.1, h / 3), 0, { roughness: 0.55 }));
  return g;
};
