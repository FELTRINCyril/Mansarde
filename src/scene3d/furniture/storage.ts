import { Group } from 'three';
import { main, named, parts, type Builder, type Kit } from './parts';

/*
 * Storage of plan-chambre (nightstand, wardrobe, dresser, bookcase, display cabinet, low TV unit,
 * wall shelf). Fronts, handles and knobs stand out of the body: the bodies are made shallower so
 * that they stay in the object's depth (plan-chambre lets them overhang by up to 3 cm).
 */

/** Cabinet of plan-chambre (body and one or two front panels), as deep as `d` with its panels. */
function cabinet(kit: Kit, w: number, d: number, h: number, body: string, panel: string): Group {
  const p = parts(kit);
  const g = new Group();
  g.add(p.rbox(w, h, d - 0.01, 0.01, body, 0, h / 2, -0.005, { roughness: 0.55 }));
  const n = w > 0.7 ? 2 : 1;
  for (let i = 0; i < n; i++) g.add(p.box(w / n - 0.02, h - 0.06, 0.008, panel, -w / 2 + (w / n) * (i + 0.5), h / 2, d / 2 - 0.006));
  return g;
}

/** plan-chambre's nightstand without its lamp (the bedside lamp is an object of its own). */
export const nightstand: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('nightstand');
  const body = d - 0.03;
  g.add(p.rbox(w, h, body, 0.015, main(s, '#c9a27c'), 0, h / 2, -0.015, { roughness: 0.6 }));
  const front = d / 2 - 0.03;
  const dy = Math.max(0.05, h - 0.12);
  g.add(p.rbox(w - 0.05, Math.min(0.16, h / 3), 0.012, 0.004, '#b48b63', 0, dy, front + 0.006));
  g.add(p.cyl(0.012, 0.012, 0.016, '#6b5b4a', 0, dy, front + 0.012 + 0.008).rotateX(Math.PI / 2));
  return g;
};

/** plan-chambre's wardrobe: body, two or three doors with their handles. */
export const wardrobe: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('wardrobe');
  const body = d - 0.03;
  g.add(p.rbox(w, h, body, 0.01, main(s, '#e5d9c6'), 0, h / 2, -0.015, { roughness: 0.6 }));
  const front = d / 2 - 0.03;
  const n = w > 1.3 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    g.add(p.box(w / n - 0.012, h - 0.08, 0.01, s.custom ? s.color : '#efe6d6', x, h / 2 + 0.02, front + 0.005));
    g.add(p.box(0.02, Math.min(0.22, h / 4), 0.015, '#8f8a82', x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.06), h * 0.52, front + 0.0175, { metalness: 0.5, roughness: 0.3 }));
  }
  return g;
};

/** plan-chambre's dresser: four feet, body, drawers with their handles. */
export const dresser: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('dresser');
  const body = d - 0.03;
  g.add(p.rbox(w, h - 0.05, body, 0.01, main(s, '#c9a27c'), 0, (h - 0.05) / 2 + 0.05, -0.015, { roughness: 0.55 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.box(0.03, 0.05, 0.03, '#2b2b2b', sx * (w / 2 - 0.05), 0.025, sz * (d / 2 - 0.05)));
  const front = d / 2 - 0.03;
  const n = Math.max(2, Math.round((h - 0.1) / 0.22));
  const dh = (h - 0.09) / n;
  for (let i = 0; i < n; i++) {
    const y = 0.07 + dh * (i + 0.5);
    g.add(p.box(w - 0.04, dh - 0.015, 0.01, '#d4ae86', 0, y, front + 0.005));
    g.add(p.box(Math.min(0.12, w / 3), 0.015, 0.02, '#5d5148', 0, y, front + 0.02));
  }
  return g;
};

const BOOKS = ['#4f6f96', '#c96f4a', '#e0b84d', '#5f8a4f', '#8a6a9e', '#3a3f47'];

/** plan-chambre's bookcase: sides, top, back, shelves and rows of books. */
export const bookcase: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('bookcase');
  const wood = main(s, '#e9dfcf');
  const t = 0.02;
  for (const sx of [-1, 1]) g.add(p.box(t, h, d, wood, sx * (w / 2 - t / 2), h / 2, 0));
  g.add(p.box(w, t, d, wood, 0, h - t / 2, 0));
  g.add(p.box(w - 2 * t, h - t, 0.006, '#d9d2c4', 0, (h - t) / 2, -d / 2 + 0.003));
  const n = Math.max(2, Math.round(h / 0.36));
  const sh = h / n;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const y = i * sh;
    g.add(p.box(w - 2 * t, t, d, wood, 0, y + t / 2, 0));
    let x = -w / 2 + t + 0.01;
    while (x < w / 2 - t - 0.06) {
      const bw = 0.025 + (k % 3) * 0.01;
      const bh = Math.min(sh - 0.05, 0.2 + (k % 5) * 0.025);
      if (k % 7 !== 3 && bh > 0.02) g.add(p.box(bw, bh, d * 0.8, BOOKS[k % 6]!, x + bw / 2, y + t + bh / 2, 0));
      x += bw + 0.004;
      k++;
    }
  }
  return g;
};

/** plan-chambre's display cabinet: dark frame, glass front, sides and shelves, a few objects. */
export const displayCabinet: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('display-cabinet');
  const fr = main(s, '#2e2a26');
  const glass = kit.glass();
  g.add(p.box(w, 0.08, d, fr, 0, 0.04, 0));
  g.add(p.box(w, 0.025, d, fr, 0, h - 0.0125, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.box(0.025, h, 0.025, fr, sx * (w / 2 - 0.0125), h / 2, sz * (d / 2 - 0.0125)));
  g.add(p.box(w - 0.03, h - 0.1, 0.01, '#d9d2c4', 0, h / 2, -d / 2 + 0.01));
  g.add(p.plane(w - 0.05, h - 0.1, glass, 0, h / 2 + 0.01, d / 2 - 0.01));
  for (const sx of [-1, 1]) {
    const side = p.plane(d - 0.05, h - 0.1, glass, sx * (w / 2 - 0.01), h / 2 + 0.01, 0);
    side.rotation.y = Math.PI / 2;
    g.add(side);
  }
  const cols = ['#c96f4a', '#4f6f96', '#e0b84d', '#5f8a4f', '#8a6a9e'];
  const n = Math.max(1, Math.floor((h - 0.2) / 0.37));
  for (let i = 0; i < n; i++) {
    const y = 0.08 + ((i + 1) * (h - 0.1)) / (n + 1);
    g.add(p.box(w - 0.05, 0.008, d - 0.05, glass, 0, y, 0));
    g.add(p.cyl(0.03, 0.03, 0.12, cols[i % 5]!, -w / 4, y + 0.064, 0));
    g.add(p.box(0.08, 0.16, 0.08, cols[(i + 2) % 5]!, 0.02, y + 0.084, 0.02));
    g.add(p.sphere(0.04, cols[(i + 3) % 5]!, w / 4, y + 0.045, -0.02));
  }
  return g;
};

/** plan-chambre's low TV unit (tvstand): four feet and a cabinet. */
export const tvUnit: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('tv-unit');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.cyl(0.015, 0.012, 0.05, '#2b2b2b', sx * (w / 2 - 0.06), 0.025, sz * (d / 2 - 0.05)));
  const cg = cabinet(kit, w, d, h - 0.05, main(s, '#6f5a48'), s.custom ? s.color : '#7d6753');
  cg.position.y = 0.05;
  g.add(cg);
  return g;
};

/**
 * plan-chambre's wall shelf is a board with two brackets under it and books on it, both outside
 * the 3 cm object: only the board is kept.
 */
export const shelfWall: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('shelf-wall');
  g.add(p.rbox(w, h, d, 0.004, main(s, '#c9a27c'), 0, h / 2, 0, { roughness: 0.6 }));
  return g;
};
