import { main, named, parts, type Builder } from './parts';

/**
 * plan-chambre's bed: dark plinth, wooden frame, mattress, headboard against the back, pillows,
 * blue duvet over the front two thirds with its fold. plan-chambre's bed body is 0.62 m high
 * (pillows) with a 0.95 m headboard; here everything fits the object height: the body is scaled
 * down below 0.62 m and the headboard rises to the object height (at most 0.95 m). The object
 * color, when set, goes on the frame and the headboard.
 */
export const bed: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('bed');
  const k = Math.min(1, h / 0.62);
  const frame = main(s, '#b08d6a');
  const head = main(s, '#8a6a4e');
  g.add(p.box(w - 0.14, 0.06 * k, d - 0.14, '#3a332c', 0, 0.03 * k, 0));
  g.add(p.rbox(w - 0.02, 0.24 * k, d - 0.03, 0.02, frame, 0, 0.18 * k, 0, { roughness: 0.6 }));
  g.add(p.rbox(w - 0.06, 0.2 * k, d - 0.1, 0.05, '#f4f1ea', 0, 0.39 * k, 0.02));
  const hb = Math.min(h, 0.95);
  g.add(p.rbox(w, hb, 0.07, 0.02, head, 0, hb / 2, -d / 2 + 0.035, { roughness: 0.6 }));
  const two = w >= 1.2;
  const pw = two ? Math.min(0.62, w / 2 - 0.1) : Math.min(0.62, w - 0.2);
  for (const x of two ? [-w / 4, w / 4] : [0]) g.add(p.rbox(pw, 0.13 * k, Math.min(0.42, d * 0.25), 0.06, '#fbf8f2', x, 0.55 * k, -d / 2 + 0.32));
  const dl = d * 0.64;
  // the duvet stays inside the box (plan-chambre lets it overhang by 1.5 cm)
  g.add(p.rbox(w, 0.07 * k, dl, 0.03, '#4f6f96', 0, 0.52 * k, d / 2 - dl / 2 - 0.015, { roughness: 0.95 }));
  g.add(p.rbox(w, 0.08 * k, 0.22, 0.035, '#e9eef6', 0, 0.535 * k, d / 2 - dl + 0.085, { roughness: 0.95 }));
  g.add(p.box(w, 0.24 * k, 0.03, '#4f6f96', 0, 0.4 * k, d / 2 - 0.015, { roughness: 0.95 }));
  return g;
};

/** Baby crib (no plan-chambre model): four posts, rails, bars on every side, mattress. */
export const crib: Builder = (s, kit) => {
  const { w, d, h } = s;
  const p = parts(kit);
  const g = named('crib');
  const wood = main(s, '#efe6d6');
  const t = 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(p.box(t, h, t, wood, sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2)));
  const base = Math.min(0.3, h * 0.35);
  g.add(p.box(w - 2 * t, 0.03, d - 2 * t, wood, 0, base, 0));
  g.add(p.rbox(w - 2 * t - 0.01, 0.1, d - 2 * t - 0.01, 0.03, '#f4f1ea', 0, base + 0.065, 0));
  for (const y of [base + 0.02, h - 0.015]) {
    for (const sx of [-1, 1]) g.add(p.box(0.025, 0.03, d - 2 * t, wood, sx * (w / 2 - t / 2), y, 0));
    for (const sz of [-1, 1]) g.add(p.box(w - 2 * t, 0.03, 0.025, wood, 0, y, sz * (d / 2 - t / 2)));
  }
  const barH = h - base - 0.05;
  const barY = base + 0.035 + barH / 2;
  const along = (len: number) => Math.max(1, Math.round(len / 0.08));
  const nz = along(d - 2 * t);
  for (let i = 1; i < nz; i++) {
    const z = -d / 2 + t + ((d - 2 * t) * i) / nz;
    for (const sx of [-1, 1]) g.add(p.cyl(0.008, 0.008, barH, wood, sx * (w / 2 - t / 2), barY, z, undefined, 8));
  }
  const nx = along(w - 2 * t);
  for (let i = 1; i < nx; i++) {
    const x = -w / 2 + t + ((w - 2 * t) * i) / nx;
    for (const sz of [-1, 1]) g.add(p.cyl(0.008, 0.008, barH, wood, x, barY, sz * (d / 2 - t / 2), undefined, 8));
  }
  return g;
};
