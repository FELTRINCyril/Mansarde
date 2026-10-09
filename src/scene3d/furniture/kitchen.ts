import { CylinderGeometry, Group } from 'three';
import { main, mesh, named, parts, type Builder, type FurnitureSpec, type Kit } from './parts';

/*
 * Kitchen (no plan-chambre model): simple rounded versions. Base units are a recessed plinth, a
 * body with one door per 60 cm module and a worktop; taps and knobs above the worktop would leave
 * the object's box and are left out.
 */

const FRONT = '#f2efe9';
const WORKTOP = '#cdb89a';
const PLINTH = '#55504a';
const HANDLE = '#8f8a82';
const STEEL = '#c3c7cb';
const WHITE = '#f4f4f2';

/** Base unit: recessed plinth, body, doors and handles (one per 60 cm module), worktop. */
function baseUnit(s: FurnitureSpec, kit: Kit): Group {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = new Group();
  const top = Math.min(0.04, h / 6);
  const plinth = Math.min(0.1, h / 6);
  const body = h - top - plinth;
  g.add(p.box(w - 0.02, plinth, d - 0.08, PLINTH, 0, plinth / 2, -0.03));
  g.add(p.rbox(w, body, d - 0.04, 0.006, '#e9e5de', 0, plinth + body / 2, -0.02, { roughness: 0.6 }));
  const n = Math.max(1, Math.round(w / 0.6));
  const dw = w / n;
  const front = main(s, FRONT);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    g.add(p.rbox(dw - 0.006, body - 0.006, 0.018, 0.004, front, x, plinth + body / 2, d / 2 - 0.04 + 0.009, { roughness: 0.5 }));
    g.add(p.box(Math.min(0.16, dw * 0.5), 0.012, 0.012, HANDLE, x, plinth + body - 0.06, d / 2 - 0.022 + 0.006 + 0.004, { metalness: 0.6, roughness: 0.3 }));
  }
  g.add(p.rbox(w, top, d, 0.006, WORKTOP, 0, h - top / 2, 0, { roughness: 0.5 }));
  return g;
}

export const counter: Builder = (s, kit) => {
  const g = named('counter');
  g.add(baseUnit(s, kit));
  return g;
};

/** Base unit with a steel sink set in the worktop, towards the front (2D symbol). */
export const sink: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('sink');
  g.add(baseUnit(s, kit));
  const bw = w * 0.7;
  const bd = d * 0.68;
  g.add(p.rbox(bw, 0.004, bd, 0.002, STEEL, 0, h - 0.0005, -d / 2 + d * 0.22 + bd / 2, { metalness: 0.6, roughness: 0.3 }));
  g.add(p.rbox(bw - 0.04, 0.002, bd - 0.04, 0.001, '#9aa0a6', 0, h + 0.0005, -d / 2 + d * 0.22 + bd / 2, { metalness: 0.6, roughness: 0.4 }));
  return g;
};

/** Base unit with a black glass cooktop and four rings. */
export const cooktop: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('cooktop');
  g.add(baseUnit(s, kit));
  g.add(p.rbox(w - 0.04, 0.004, d - 0.06, 0.002, '#15161a', 0, h - 0.0005, 0, { roughness: 0.2 }));
  const r = Math.min(w, d) * 0.16;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ring = mesh(new CylinderGeometry(r, r, 0.002, 32), kit.mat('#3a3b40', { roughness: 0.4 }), (sx * w) / 4, h + 0.0005, (sz * d) / 4, false);
      g.add(ring);
    }
  }
  return g;
};

/** Fridge: white rounded body, freezer door under the fridge door, vertical handles. */
export const fridge: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('fridge');
  const color = main(s, WHITE);
  g.add(p.rbox(w, h, d - 0.03, 0.02, color, 0, h / 2, -0.015, { roughness: 0.4 }));
  const split = h * 0.38;
  const front = d / 2 - 0.03;
  g.add(p.rbox(w - 0.01, split - 0.03, 0.012, 0.004, color, 0, 0.02 + split / 2, front + 0.006, { roughness: 0.4 }));
  g.add(p.rbox(w - 0.01, h - split - 0.04, 0.012, 0.004, color, 0, split + (h - split) / 2, front + 0.006, { roughness: 0.4 }));
  const hx = w / 2 - 0.06;
  g.add(p.box(0.018, Math.min(0.25, split * 0.5), 0.015, HANDLE, hx, split - 0.15, front + 0.02, { metalness: 0.6, roughness: 0.3 }));
  g.add(p.box(0.018, Math.min(0.35, (h - split) * 0.4), 0.015, HANDLE, hx, split + 0.25, front + 0.02, { metalness: 0.6, roughness: 0.3 }));
  return g;
};

/** Dishwasher: white body, front panel, handle bar along the top, dark control strip. */
export const dishwasher: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('dishwasher');
  const color = main(s, WHITE);
  g.add(p.rbox(w, h, d - 0.03, 0.01, color, 0, h / 2, -0.015, { roughness: 0.4 }));
  const front = d / 2 - 0.03;
  g.add(p.rbox(w - 0.01, h - 0.12, 0.012, 0.004, color, 0, 0.04 + (h - 0.12) / 2, front + 0.006, { roughness: 0.4 }));
  g.add(p.box(w - 0.01, 0.07, 0.012, '#3a3b40', 0, h - 0.045, front + 0.006, { roughness: 0.3 }));
  g.add(p.box(w * 0.6, 0.014, 0.015, HANDLE, 0, h - 0.11, front + 0.02, { metalness: 0.6, roughness: 0.3 }));
  return g;
};

/** Microwave: body, dark door window on the left, control panel on the right. */
export const microwave: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('microwave');
  g.add(p.rbox(w, h, d - 0.01, 0.01, main(s, '#e6e6e4'), 0, h / 2, -0.005, { roughness: 0.4 }));
  const ww = w * 0.66;
  g.add(p.rbox(ww - 0.03, h - 0.06, 0.006, 0.003, '#1c1d22', -w / 2 + 0.015 + ww / 2, h / 2, d / 2 - 0.006, { roughness: 0.2 }));
  g.add(p.box(w - ww - 0.05, h - 0.08, 0.006, '#3a3b40', w / 2 - 0.02 - (w - ww - 0.05) / 2, h / 2, d / 2 - 0.006, { roughness: 0.3 }));
  return g;
};
