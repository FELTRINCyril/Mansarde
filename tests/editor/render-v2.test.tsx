import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBeam, createCupboard, createObjectFromSize, createOpening, createSlope } from '@/core/model/factory';
import type { Beam, Cupboard, Project } from '@/core/model/types';
import { deriveLevel } from '@/core/geometry/derived';
import { labelAlong } from '@/render/labelAlong';
import { roomLabelBox } from '@/render/roomLabelLayout';
import { PlanSvg, type PlanSvgProps } from '@/render/PlanSvg';
import { CAP_HEIGHT, textWidth } from '@/render/style';
import { findWall, rectRoom } from '../core/fixtures';
import { lvl, projectFrom } from '../core/helpers';

/**
 * plan-chambre: interior 0..400 x 0..400 (wall axes at -10 and 410), ceiling 240, slope from
 * x = 197 towards +x (240 -> 150 over 203), a beam along x = 191 in 'ceiling' mode (bottom 2,25 m),
 * a hinged cupboard with 2 doors against the right wall (y 40..160), a box.
 */
function chambre(setup?: (beam: Beam, cupboard: Cupboard) => void): Project {
  return projectFrom(rectRoom(-10, -10, 410, 410), (level) => {
    level.height = 240;
    const slope = createSlope({ x: 197, y: -10 }, { x: 197, y: 410 }, 'right', 203, 240, 150);
    slope.id = 'slope';
    level.slopes[slope.id] = slope;
    const beam = createBeam({ x: 191, y: 0 }, { x: 191, y: 400 });
    beam.id = 'beam';
    level.beams[beam.id] = beam;
    const cupboard = createCupboard(findWall(level, 410, -10, 410, 410), 110, 'left', { doorCount: 2, doorType: 'hinged' });
    cupboard.id = 'cupboard';
    level.cupboards[cupboard.id] = cupboard;
    level.objects['box'] = createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, 100, 300, { width: 60, depth: 40, height: 50 }, 'Boîte', '#999', { id: 'box' });
    level.roomLabels.push({ id: 'label', name: 'Chambre', anchor: { x: 100, y: 100 } });
    setup?.(beam, cupboard);
  });
}

function render(project: Project, over: Partial<PlanSvgProps> = {}): string {
  const props: PlanSvgProps = {
    project,
    level: lvl(project),
    viewBox: { x: -100, y: -100, width: 600, height: 600 },
    lineUnit: 1,
    dimMode: 'all',
    showGrid: false,
    mode: 'screen',
    imageUrls: {},
    ...over,
  };
  return renderToStaticMarkup(<PlanSvg {...props} />);
}

/** The markup of the first element tagged with this data-kind (and data-id), up to its closing tag. */
function group(markup: string, kind: string, id?: string, tag = 'g'): string {
  const attr = id === undefined ? `data-kind="${kind}"` : `data-kind="${kind}" data-id="${id}"`;
  const at = markup.indexOf(attr);
  expect(at, attr).toBeGreaterThanOrEqual(0);
  const start = markup.lastIndexOf(`<${tag}`, at);
  // count nested tags of the same name to find the matching closing tag
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return markup.slice(start, m.index + m[0].length);
  }
  throw new Error(`unclosed ${attr}`);
}

const count = (s: string, needle: string): number => s.split(needle).length - 1;

describe('PlanSvg volumes', () => {
  it('draws the slope, the beam, the cupboard and the alerts, without NaN', () => {
    const p = chambre();
    const alerts = new Map([['object:box', 'error' as const]]);
    const markup = render(p, { alerts });
    for (const kind of ['slope', 'beam', 'cupboard', 'alert']) expect(markup).toContain(`data-kind="${kind}"`);
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('slope: gradient #2438a0 from 0 to 0.18 across the band, labelled dashed level lines, solid start and end lines', () => {
    const slope = group(render(chambre()), 'slope', 'slope');
    // level lines at 2,20 / 2,00 / 1,80 / 1,60 m (multiples of 20 strictly between 240 and 150)
    for (const label of ['2,20 m', '2,00 m', '1,80 m', '1,60 m']) expect(slope).toContain(`>${label}</text>`);
    expect(slope).not.toContain('>2,40 m<');
    expect(count(slope, 'data-kind="slope-level"')).toBe(4);
    expect(group(slope, 'slope-level', undefined, 'line')).toMatch(/stroke-dasharray="[^"]+"/);
    for (const kind of ['slope-start', 'slope-end']) {
      expect(count(slope, `data-kind="${kind}"`)).toBe(1);
      expect(group(slope, kind, undefined, 'line')).not.toContain('stroke-dasharray');
    }
    // the 2,00 m line is at x = 197 + 203 * 40 / 90 = 287.22
    expect(slope).toMatch(/data-kind="slope-level" x1="287.22" y1="-10" x2="287.22" y2="410"/);
    // gradient along the normal, from the start line (x = 197) to the end line (x = 400)
    const grad = group(slope, 'slope-gradient', undefined, 'linearGradient');
    expect(grad).toContain('gradientUnits="userSpaceOnUse"');
    expect(grad).toMatch(/x1="197" y1="-10" x2="400" y2="-10"/);
    expect(grad).toMatch(/<stop offset="0" stop-color="#2438a0" stop-opacity="0"/);
    expect(grad).toMatch(/<stop offset="1" stop-color="#2438a0" stop-opacity="0.18"/);
    const id = /id="([^"]+)"/.exec(grad)![1]!;
    expect(slope).toContain(`fill="url(#${id})"`);
  });

  it('slope label: moved along its line off the furniture drawn over it', () => {
    const at = (markup: string) => /<text x="287.22" y="([^"]+)"[^>]*>2,00 m<\/text>/.exec(group(markup, 'slope', 'slope'))?.[1];
    expect(at(render(chambre()))).toBe('200');
    const p = chambre();
    lvl(p).objects['desk'] = createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, 287, 200, { width: 60, depth: 40, height: 75 }, 'Bureau', '#999', { id: 'desk' });
    expect(at(render(p))).toBe('137');
  });

  it('slope and beam labels: never under a room name, even when furniture leaves no clear spot, at lineUnit 0.5, 1 and 2 (reviewer case)', () => {
    // a 300 x 250 room "Bureau" over a 300 x 200 room, a diagonal slope and beam, cupboards, a desk and a wardrobe
    const p = projectFrom([...rectRoom(-10, -10, 310, 260), [310, 260, 310, 460], [310, 460, -10, 460], [-10, 460, -10, 260]], (level) => {
      const s = createSlope({ x: 0, y: 150 }, { x: 150, y: 0 }, 'left', 180, 250, 140);
      s.id = 'slope';
      level.slopes[s.id] = s;
      const b = createBeam({ x: 20, y: 240 }, { x: 290, y: 30 });
      level.beams[b.id] = b;
      const box = (id: string, x: number, y: number, width: number, depth: number, height: number) =>
        (level.objects[id] = createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, x, y, { width, depth, height }, id, '#999', { id }));
      const between = findWall(level, 310, 260, -10, 260);
      for (const [id, offset, side, width] of [['c1', 80, 'right', 150], ['c2', 240, 'left', 130]] as const) {
        level.cupboards[id] = createCupboard(between, offset, side, { id, width, doorCount: 3 });
      }
      box('desk', 200, 120, 120, 60, 75);
      box('wardrobe', 60, 60, 80, 50, 210);
      level.roomLabels.push({ id: 'l1', name: 'Bureau', anchor: { x: 150, y: 125 } });
      level.roomLabels.push({ id: 'l2', name: 'Salle de bain', anchor: { x: 150, y: 360 } });
    });
    const names = deriveLevel(lvl(p)).rooms;
    // the area actually drawn by a label: sampled points of its turned rectangle (local x0..x1, y0..y1)
    const area = (at: { x: number; y: number }, angle: number, x0: number, x1: number, y0: number, y1: number) => {
      const r = (angle * Math.PI) / 180;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 4; j++) {
          const lx = x0 + ((x1 - x0) * i) / 8;
          const ly = y0 + ((y1 - y0) * j) / 4;
          pts.push({ x: at.x + lx * Math.cos(r) - ly * Math.sin(r), y: at.y + lx * Math.sin(r) + ly * Math.cos(r) });
        }
      }
      return pts;
    };
    const num = (re: RegExp, s: string) => Number(re.exec(s)![1]);
    for (const lineUnit of [0.5, 1, 2]) {
      const boxes = names.map((room) => roomLabelBox(room, lineUnit));
      const markup = render(p, { lineUnit });
      const drawn: Array<{ what: string; pts: Array<{ x: number; y: number }> }> = [];
      for (const m of group(markup, 'slope', 'slope').matchAll(/<text [^>]*>[^<]+<\/text>/g)) {
        const t = m[0];
        const at = { x: num(/ x="([^"]+)"/, t), y: num(/ y="([^"]+)"/, t) };
        const fs = num(/font-size="([^"]+)"/, t);
        const text = />([^<]+)</.exec(t)![1]!;
        const w = textWidth(text, fs);
        // baseline dy above the line (negative), glyphs one cap height above it
        const dy = num(/dy="([^"]+)"/, t);
        drawn.push({ what: `slope ${text}`, pts: area(at, num(/rotate\(([^ ]+) /, t), -w / 2, w / 2, dy - CAP_HEIGHT * fs, dy) });
      }
      expect(drawn.map((d) => d.what)).toContain('slope 2,00 m');
      for (const m of markup.matchAll(/<g data-kind="beam-label" transform="translate\(([^ ]+) ([^)]+)\) rotate\(([^)]+)\)"><rect [^>]*width="([^"]+)" height="([^"]+)"/g)) {
        const [w, h] = [Number(m[4]), Number(m[5])];
        drawn.push({ what: 'beam', pts: area({ x: Number(m[1]), y: Number(m[2]) }, Number(m[3]), -w / 2, w / 2, -h / 2, h / 2) });
      }
      expect(drawn.some((d) => d.what === 'beam')).toBe(true);
      for (const d of drawn) {
        for (const [i, b] of boxes.entries()) {
          const hit = d.pts.find((q) => q.x > b.minX && q.x < b.maxX && q.y > b.minY && q.y < b.maxY);
          expect(hit, `${d.what} under the name "${names[i]!.name}" at lineUnit ${lineUnit}`).toBeUndefined();
        }
      }
    }
  });

  it('slope label: a rug (covering) is not an obstacle', () => {
    const p = chambre();
    lvl(p).objects['rug'] = createObjectFromSize({ kind: 'catalog', catalogId: 'rug-rect' }, 287, 200, { width: 60, depth: 40, height: 1 }, 'Tapis', '#999', {
      id: 'rug',
      pose: 'covering',
    });
    expect(/<text x="287.22" y="([^"]+)"[^>]*>2,00 m<\/text>/.exec(group(render(p), 'slope', 'slope'))?.[1]).toBe('200');
  });

  it('slope gradient: darker towards the lower ceiling, also when the ceiling rises', () => {
    const p = chambre();
    const s = lvl(p).slopes['slope']!;
    s.heightStart = 150;
    s.heightEnd = 240;
    const grad = group(group(render(p), 'slope', 'slope'), 'slope-gradient', undefined, 'linearGradient');
    expect(grad).toMatch(/<stop offset="0" stop-color="#2438a0" stop-opacity="0.18"/);
    expect(grad).toMatch(/<stop offset="1" stop-color="#2438a0" stop-opacity="0"/);
  });

  it('beam: dashed outline and the lowest underside along it', () => {
    const beam = group(render(chambre()), 'beam', 'beam');
    expect(beam).toMatch(/stroke-dasharray="[^"]+"/);
    expect(beam).toContain('>2,25 m</text>'); // ceiling 240 up to the slope start (x = 197) - drop 15
  });

  it('beam label: at the middle of the beam, or moved along it when the room name is there', () => {
    // the room name is centered at (200, 200), over the middle of the beam (191, 200)
    const label = group(render(chambre()), 'beam-label');
    expect(label).toContain('transform="translate(191 140) rotate(-90)"');
    const p = chambre((beam) => {
      beam.a = { x: 50, y: 0 };
      beam.b = { x: 50, y: 400 };
    });
    expect(group(render(p), 'beam-label')).toContain('transform="translate(50 200) rotate(-90)"');
  });

  it('beam across the slope: the underside where the slope is lowest', () => {
    const p = chambre((beam) => {
      beam.a = { x: 100, y: 200 };
      beam.b = { x: 380, y: 200 };
    });
    // 240 - (380 - 197) * 90 / 203 - 15 = 143.87
    expect(group(render(p), 'beam', 'beam')).toContain('>1,44 m</text>');
  });

  it('beam in fixed mode: its bottom', () => {
    const p = chambre((beam) => {
      beam.mode = 'fixed';
      beam.bottom = 210;
    });
    expect(group(render(p), 'beam', 'beam')).toContain('>2,10 m</text>');
  });

  it('hinged cupboard: footprint filled at 35 %, door lines, one arc and one handle per door', () => {
    const c = group(render(chambre()), 'cupboard', 'cupboard');
    expect(c).toMatch(/fill="#e8e1d4" fill-opacity="0.35"/);
    expect(count(c, 'data-kind="cupboard-arc"')).toBe(2);
    expect(count(c, 'data-kind="cupboard-handle"')).toBe(2);
    expect(count(c, 'data-kind="cupboard-door"')).toBe(2);
    expect(c).not.toContain('data-kind="cupboard-track"');
  });

  it('hinged doors: panels on the front face with a gap between them, arcs from the panel ends, handles on the front face', () => {
    const c = group(render(chambre()), 'cupboard', 'cupboard');
    const segs = (kind: string) =>
      [...c.matchAll(new RegExp(`data-kind="${kind}" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"`, 'g'))].map((m) => m.slice(1, 5).map(Number));
    // front face x = 340; door 0 hinged at y = 40, door 1 at y = 160 (pair opening from its outer sides)
    expect(segs('cupboard-door')).toEqual([
      [340, 40, 340, 99.5],
      [340, 100.5, 340, 160],
    ]);
    const arcs = [...c.matchAll(/data-kind="cupboard-arc" d="M([^ ]+) ([^A]+)A([^ ]+) /g)].map((m) => m.slice(1, 4).map(Number));
    expect(arcs).toEqual([
      [340, 99.5, 59.5],
      [340, 100.5, 59.5],
    ]);
    // a short pull out of the front face, near the free end of each door
    expect(segs('cupboard-handle')).toEqual([
      [340, 91.5, 337, 91.5],
      [340, 108.5, 337, 108.5],
    ]);
  });

  it('sliding cupboard: two offset door lines, no arc', () => {
    const p = chambre((_b, cupboard) => {
      cupboard.doorType = 'sliding';
    });
    const c = group(render(p), 'cupboard', 'cupboard');
    expect(c).not.toContain('data-kind="cupboard-arc"');
    expect(count(c, 'data-kind="cupboard-door"')).toBe(2);
    expect(count(c, 'data-kind="cupboard-handle"')).toBe(2);
    // the two doors run along the front (x = 340) on two tracks at different depths
    const xs = [...c.matchAll(/data-kind="cupboard-door" x1="([^"]+)" y1="[^"]+" x2="([^"]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(xs).toHaveLength(2);
    for (const [x1, x2] of xs) expect(x1).toBe(x2);
    expect(xs[0]![0]).not.toBe(xs[1]![0]);
    for (const [x] of xs) expect(x! > 340 && x! < 350).toBe(true);
    // each handle sits on its own panel (its door line), mid-panel, standing out towards the room (-x)
    const doors = [...c.matchAll(/data-kind="cupboard-door" x1="([^"]+)" y1="([^"]+)" x2="[^"]+" y2="([^"]+)"/g)].map((m) => m.slice(1).map(Number));
    const handles = [...c.matchAll(/data-kind="cupboard-handle" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map((m) => m.slice(1).map(Number));
    expect(handles).toHaveLength(2);
    for (const [i, [hx1, hy1, hx2, hy2]] of handles.entries()) {
      const [dx, dy1, dy2] = doors[i]!;
      expect(hx1).toBeCloseTo(dx!, 6);
      expect(hy1! > Math.min(dy1!, dy2!) && hy1! < Math.max(dy1!, dy2!)).toBe(true);
      expect(hy2).toBe(hy1);
      expect(hx2! < hx1!).toBe(true);
    }
  });

  it('cupboard clearance: 60 cm orange zone in front of a selected cupboard only, on screen only', () => {
    const p = chambre();
    expect(render(p)).not.toContain('data-kind="cupboard-clearance"');
    const selection = [{ kind: 'cupboard' as const, id: 'cupboard' }];
    const zone = group(render(p, { selection }), 'cupboard-clearance', 'cupboard', 'path');
    expect(zone).toContain('fill="#f3b26b"');
    expect(zone).toContain('fill-opacity="0.22"');
    // in front of the cupboard: x 280..340, y 40..160
    expect(zone).toContain('d="M340 40L340 160L280 160L280 40Z"');
    expect(render(p, { selection, mode: 'print' })).not.toContain('data-kind="cupboard-clearance"');
  });

  it('alerts: 2.2 lineUnit outline, red for an error, orange for a warning, never in print mode', () => {
    const p = chambre();
    const alerts = new Map<string, 'error' | 'warning'>([
      ['object:box', 'error'],
      ['cupboard:cupboard', 'warning'],
      ['object:gone', 'error'], // stale key: nothing drawn
    ]);
    const markup = render(p, { alerts, lineUnit: 2 });
    expect(count(markup, 'data-kind="alert"')).toBe(2);
    const box = group(markup, 'alert', 'object:box', 'path');
    expect(box).toContain('stroke="#cf2e2e"');
    expect(box).toContain('stroke-width="4.4"');
    expect(box).toContain('d="M70 280L130 280L130 320L70 320Z"');
    const cupboard = group(markup, 'alert', 'cupboard:cupboard', 'path');
    expect(cupboard).toContain('stroke="#e08a1e"');
    expect(render(p, { alerts, mode: 'print' })).not.toContain('data-kind="alert"');
    expect(render(p)).not.toContain('data-kind="alert"');
  });

  it('a selected element in alert keeps its red outline visible on both sides of the selection line', () => {
    const p = chambre();
    const alerts = new Map([['object:box', 'error' as const]]);
    const markup = render(p, { alerts, selection: [{ kind: 'object', id: 'box' }], lineUnit: 2 });
    const box = group(markup, 'alert', 'object:box', 'path');
    // (2.2 + 2 + 2.2) x lineUnit: 2.2 px of red on each side of the 2 px selection line drawn over it
    expect(box).toContain('stroke-width="12.8"');
    expect(markup.indexOf('data-kind="alerts"')).toBeLessThan(markup.indexOf('data-kind="selection"'));
  });

  it('an alert on an opening outlines its cut', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300), () => {});
    const level = lvl(p);
    const wall = findWall(level, 0, 0, 400, 0);
    level.openings['door'] = createOpening(wall, 'door', 200, { id: 'door' });
    const markup = render(p, { alerts: new Map([['opening:door', 'error' as const]]) });
    expect(group(markup, 'alert', 'opening:door', 'path')).toContain('stroke="#cf2e2e"');
  });

  it('print mode draws the slopes, beams and cupboards', () => {
    const markup = render(chambre(), { mode: 'print' });
    for (const kind of ['slope', 'beam', 'cupboard']) expect(markup).toContain(`data-kind="${kind}"`);
  });

  it('layers: rooms, slopes, cupboards, objects, walls, openings, beams, dimensions, room labels, alerts, selection', () => {
    const selection = [{ kind: 'beam' as const, id: 'beam' }];
    const markup = render(chambre(), { alerts: new Map([['object:box', 'error' as const]]), selection });
    const order = ['rooms', 'slopes', 'cupboards', 'objects', 'wall-shape', 'beams', 'dimensions', 'room-labels', 'alerts', 'selection'].map((k) => {
      const i = markup.indexOf(`data-kind="${k}"`);
      expect(i, k).toBeGreaterThanOrEqual(0);
      return i;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('selection outlines slopes, beams and cupboards', () => {
    const selection = [
      { kind: 'slope' as const, id: 'slope' },
      { kind: 'beam' as const, id: 'beam' },
      { kind: 'cupboard' as const, id: 'cupboard' },
    ];
    const sel = group(render(chambre(), { selection }), 'selection');
    expect(sel).toContain('data-kind="selected-slope" data-id="slope" d="M197 -10L197 410L400 410L400 -10Z"');
    expect(sel).toContain('data-kind="selected-beam" data-id="beam"');
    expect(sel).toContain('data-kind="selected-cupboard" data-id="cupboard" d="M400 40L400 160L340 160L340 40Z"');
  });

  it('a cupboard on a missing wall (broken file) is skipped, never crashes the plan', () => {
    const p = chambre((_b, cupboard) => {
      cupboard.wallId = 'missing';
    });
    const selection = [{ kind: 'cupboard' as const, id: 'cupboard' }];
    const markup = render(p, { selection, alerts: new Map([['cupboard:cupboard', 'warning' as const]]) });
    expect(markup).not.toContain('data-kind="cupboard"');
    expect(markup).not.toContain('data-kind="alert"');
    expect(markup).not.toContain('data-kind="selected-cupboard"');
  });
});

describe('labelAlong', () => {
  const box = { minX: 90, minY: -10, maxX: 110, maxY: 10 };
  const line = [{ x: 0, y: 0 }, { x: 200, y: 0 }] as const;
  it('the middle of the segment when it is clear', () => {
    expect(labelAlong(...line, 20, 10, 0, { hiding: [] })).toEqual({ x: 100, y: 0 });
  });
  it('further along when the middle is taken, the turned size counted', () => {
    expect(labelAlong(...line, 20, 10, 0, { hiding: [box] })).toEqual({ x: 70, y: 0 });
    expect(labelAlong(...line, 20, 10, 0, { hiding: [], covering: [box] })).toEqual({ x: 70, y: 0 });
    // turned by 90 degrees, 40 long: half extent 20 along y, 5 along x
    expect(labelAlong({ x: 100, y: -100 }, { x: 100, y: 100 }, 40, 10, 90, { hiding: [box] })).toEqual({ x: 100, y: -30 });
  });
  it('near the ends of the segment (0.1, 0.9) when every point closer to the middle is taken', () => {
    const middle = { minX: 32, minY: -10, maxX: 168, maxY: 10 };
    expect(labelAlong(...line, 20, 10, 0, { hiding: [middle] })).toEqual({ x: 20, y: 0 });
    expect(labelAlong(...line, 20, 10, 0, { hiding: [middle, { minX: 0, minY: -10, maxX: 31, maxY: 10 }] })).toEqual({ x: 180, y: 0 });
  });
  it('a turned label is tested as turned, not by its bounding box', () => {
    const diagonal = [{ x: 0, y: 0 }, { x: 200, y: 200 }] as const;
    // inside the bounding box of the 45 degree label at the middle (82.3..117.7) but beside the label itself
    const beside = { minX: 112, minY: 80, maxX: 130, maxY: 92 };
    expect(labelAlong(...diagonal, 40, 10, 45, { hiding: [beside] })).toEqual({ x: 100, y: 100 });
    // across the label: moved
    const across = { minX: 95, minY: 95, maxX: 105, maxY: 105 };
    expect(labelAlong(...diagonal, 40, 10, 45, { hiding: [across] })).not.toEqual({ x: 100, y: 100 });
  });
  it('when nothing is clear of both, the first point clear of the hiding obstacles', () => {
    const furniture = { minX: -1000, minY: -10, maxX: 1000, maxY: 10 };
    expect(labelAlong(...line, 20, 10, 0, { hiding: [box], covering: [furniture] })).toEqual({ x: 70, y: 0 });
  });
  it('the middle when nothing is clear of the hiding obstacles', () => {
    const wide = { minX: -1000, minY: -10, maxX: 1000, maxY: 10 };
    expect(labelAlong(...line, 20, 10, 0, { hiding: [wide] })).toEqual({ x: 100, y: 0 });
  });
});
