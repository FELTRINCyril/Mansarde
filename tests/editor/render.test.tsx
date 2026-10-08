import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createObjectFromSize, createOpening } from '@/core/model/factory';
import { formatLength } from '@/core/model/format';
import type { Background, Level, PlacedObject, Project } from '@/core/model/types';
import { PlanSvg, type PlanSvgProps } from '@/render/PlanSvg';
import { findWall, levelFromWalls, rectRoom } from '../core/fixtures';
import { lvl, projectFrom } from '../core/helpers';

const BED_ID = 'bed-1';
const DOOR_ID = 'door-1';
const DIM_ID = 'dim-1';

/** 400 x 300 room (axes), door on the top wall, a bed, a manual dimension and a "Chambre" label. */
function sampleProject(): Project {
  return projectFrom(rectRoom(0, 0, 400, 300), (level) => {
    const top = findWall(level, 0, 0, 400, 0);
    level.openings[DOOR_ID] = createOpening(top, 'door', 100, { id: DOOR_ID });
    level.objects[BED_ID] = createObjectFromSize(
      { kind: 'catalog', catalogId: 'bed-140' },
      250,
      180,
      { width: 140, depth: 190, height: 50 },
      'Lit 140',
      '#d9c8b4',
      { id: BED_ID },
    );
    level.dimensions[DIM_ID] = {
      id: DIM_ID,
      a: { kind: 'point', x: 0, y: 400 },
      b: { kind: 'point', x: 400, y: 400 },
      offset: 30,
    };
    level.roomLabels.push({ id: 'label-1', name: 'Chambre', anchor: { x: 200, y: 150 } });
  });
}

function render(project: Project, over: Partial<PlanSvgProps> = {}): string {
  const props: PlanSvgProps = {
    project,
    level: lvl(project),
    viewBox: { x: -100, y: -100, width: 600, height: 600 },
    lineUnit: 1,
    dimMode: 'all',
    showGrid: true,
    mode: 'screen',
    imageUrls: {},
    ...over,
  };
  return renderToStaticMarkup(<PlanSvg {...props} />);
}

/** All [x1, y1, x2, y2] of the <line> elements of the group with the given data-kind/data-id. */
function linesOf(markup: string, kind: string, id: string): number[][] {
  const start = markup.indexOf(`data-kind="${kind}" data-id="${id}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = markup.indexOf('</g>', start);
  const group = markup.slice(start, end);
  return [...group.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map((m) =>
    m.slice(1, 5).map(Number),
  );
}

describe('PlanSvg', () => {
  it('renders walls, openings, objects, dimensions and room labels without NaN', () => {
    const markup = render(sampleProject());
    expect(markup).toContain('data-kind="wall-shape"');
    expect(markup).toContain('data-kind="opening"');
    expect(markup).toContain('data-kind="object"');
    expect(markup).toContain('data-kind="dimension"');
    expect(markup).toContain('Chambre');
    expect(markup).toContain('m²');
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
    // the room is 380 x 280 inside: 10,64 m2; manual dimension 4,00 m
    expect(markup).toContain('10,64 m²');
    expect(markup).toContain('4,00 m');
  });

  it('builds the walls as one even-odd path with a hole', () => {
    const p = sampleProject();
    lvl(p).openings = {}; // the door would open the ring into a single C-shaped polygon
    const markup = render(p);
    const walls = markup.match(/<path[^>]*data-kind="wall-shape"[^>]*>/g) ?? [];
    expect(walls).toHaveLength(1);
    expect(walls[0]).toContain('fill-rule="evenodd"');
    expect(walls[0]!.match(/Z/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('shows no dimension at all with dimMode none, only manual ones with dimMode manual', () => {
    const none = render(sampleProject(), { dimMode: 'none' });
    expect(none).not.toContain('data-kind="dimension"');
    expect(none).not.toContain('data-kind="auto-dimension"');

    const manual = render(sampleProject(), { dimMode: 'manual' });
    expect(manual).toContain(`data-kind="dimension" data-id="${DIM_ID}"`);
    expect(manual).not.toContain('data-kind="auto-dimension"');

    const all = render(sampleProject(), { dimMode: 'all' });
    expect(all).toContain('data-kind="auto-dimension"');
    // inner faces 380 and 280, facade faces 420 and 320, door 83 cm
    for (const text of ['3,80 m', '2,80 m', '4,20 m', '3,20 m', '0,83 m']) expect(all).toContain(text);
  });

  it('writes dimension and room texts over a mask of the color beneath (furniture never crosses them)', () => {
    const markup = render(sampleProject());
    const groups = [...markup.matchAll(/<g data-kind="auto-dimension"[\s\S]*?<\/g>/g)].map((m) => m[0]);
    // the room dimensions are written inside the room, the facade ones on the paper
    const masks = groups.map((g) => g.match(/<rect data-kind="text-mask"[^>]*fill="([^"]+)"/)?.[1]);
    expect(masks).toContain('#f4efe6');
    expect(masks).toContain('#ffffff');
    for (const g of groups) expect(g.indexOf('text-mask')).toBeLessThan(g.indexOf('<text')); // mask drawn first
    const label = markup.match(/<g data-kind="room-label"[\s\S]*?<\/g>/)![0];
    expect(label).toMatch(/^<g[^>]*><rect data-kind="text-mask"[^>]*fill="#f4efe6"/);
  });

  it('leaves out the automatic dimensions that would be unreadable when zoomed out, never an opening width nor a manual one', () => {
    const near = render(sampleProject(), { lineUnit: 1 });
    expect(near).toContain('0,83 m');
    expect(near).toMatch(/font-size="11"[^>]*>0,83 m</);
    // 5 cm per pixel: "0,83 m" (about 36 px) no longer fits on its 83 cm (17 px) line; it is still
    // drawn (R38), with the smallest text (11 px * 0.7 at 5 cm per px = 38.5)
    const far = render(sampleProject(), { lineUnit: 5, viewBox: { x: -500, y: -500, width: 1500, height: 1500 } });
    expect(far).toMatch(/font-size="38.5"[^>]*>0,83 m</);
    expect(far).toContain('4,20 m'); // the facade still fits
    expect(far).not.toContain('2,80 m'); // a room dimension is left out: its text would hit another text
    expect(far).toContain(`data-kind="dimension" data-id="${DIM_ID}"`);
    expect(far).not.toContain('NaN');
  });

  it('hides grid, selection and overlay in print mode', () => {
    const overlay = <circle data-kind="test-overlay" cx={0} cy={0} r={5} />;
    const selection = [{ kind: 'object' as const, id: BED_ID }];
    const screen = render(sampleProject(), { selection, overlay });
    expect(screen).toContain(`data-kind="selected-object" data-id="${BED_ID}"`);
    expect(screen).toContain('data-kind="grid"');
    expect(screen).toContain('data-kind="selection"');
    expect(screen).toContain('data-kind="test-overlay"');

    const print = render(sampleProject(), { mode: 'print', selection, overlay });
    expect(print).not.toContain('data-kind="grid"');
    expect(print).not.toContain('data-kind="selection"');
    expect(print).not.toContain('data-kind="test-overlay"');
  });

  it('hides the grid when showGrid is false and skips the minor grid when denser than 6 px', () => {
    expect(render(sampleProject(), { showGrid: false })).not.toContain('data-kind="grid"');
    // gridStep 10 cm at 2 cm per pixel = 5 px between lines: minor grid skipped, major kept
    const coarse = render(sampleProject(), { lineUnit: 2 });
    expect(coarse).toContain('data-kind="grid-major"');
    expect(coarse).not.toContain('data-kind="grid-minor"');
    const fine = render(sampleProject(), { lineUnit: 1 });
    expect(fine).toContain('data-kind="grid-minor"');
  });

  it('never uses non-scaling strokes and scales text with lineUnit', () => {
    const markup = render(sampleProject(), { lineUnit: 0.5 });
    expect(markup).not.toMatch(/vector-effect|non-scaling/);
    expect(markup).toContain('font-size="6"'); // 12 * 0.5
    expect(markup).toContain('font-family="Helvetica, Arial, sans-serif"');
  });

  it('keeps dimension text readable: rotation always within [-90, 90[, verticals bottom-to-top (ISO 129)', () => {
    const markup = render(sampleProject());
    const angles = [...markup.matchAll(/<text[^>]*transform="rotate\(([-\d.e]+)/g)].map((m) => Number(m[1]));
    expect(angles.length).toBeGreaterThan(0);
    for (const a of angles) {
      expect(a).toBeGreaterThanOrEqual(-90);
      expect(a).toBeLessThan(90);
    }
    expect(angles).toContain(-90); // vertical room and facade dimensions
    expect(angles).not.toContain(90);
  });

  it('draws a diagonal manual dimension with a readable angle and no NaN', () => {
    const p = sampleProject();
    // from (300, 0) down-left to (0, 300): direction 135 degrees, text turned to -45
    lvl(p).dimensions[DIM_ID] = { id: DIM_ID, a: { kind: 'point', x: 300, y: 0 }, b: { kind: 'point', x: 0, y: 300 }, offset: 20 };
    const markup = render(p, { dimMode: 'manual' });
    const start = markup.indexOf(`data-kind="dimension" data-id="${DIM_ID}"`);
    const group = markup.slice(start, markup.indexOf('</g>', start));
    expect(group).not.toMatch(/NaN|Infinity/);
    expect(group).toContain(formatLength(Math.hypot(300, 300)));
    expect(group).toMatch(/transform="rotate\(-45 /);
  });

  it('draws a single door leaf from the hinge towards the swing side', () => {
    // top wall goes from (0,0) to (400,0): dir +x, normal (left) = +y = inside the room
    const p = sampleProject();
    const markup = render(p);
    const [leaf] = linesOf(markup, 'opening', DOOR_ID);
    // door center at x = 100, width 83: hinge 'start' at x = 58.5, wall face at y = 10
    expect(leaf).toEqual([58.5, 10, 58.5, 93]);

    const level = lvl(p);
    level.openings[DOOR_ID] = { ...level.openings[DOOR_ID]!, hinge: 'end', swing: 'right' };
    const [flipped] = linesOf(render(p), 'opening', DOOR_ID);
    expect(flipped).toEqual([141.5, -10, 141.5, -93]);

    level.openings[DOOR_ID] = { ...level.openings[DOOR_ID]!, hinge: 'start', swing: 'right' };
    expect(linesOf(render(p), 'opening', DOOR_ID)[0]).toEqual([58.5, -10, 58.5, -93]);

    level.openings[DOOR_ID] = { ...level.openings[DOOR_ID]!, hinge: 'end', swing: 'left' };
    expect(linesOf(render(p), 'opening', DOOR_ID)[0]).toEqual([141.5, 10, 141.5, 93]);
  });

  it('closes the arc on the opposite jamb, on the swing side', () => {
    const p = sampleProject();
    const level = lvl(p);
    for (const [hinge, swing, end] of [
      ['start', 'left', '141.5 10'],
      ['end', 'right', '58.5 -10'],
    ] as const) {
      level.openings[DOOR_ID] = { ...level.openings[DOOR_ID]!, hinge, swing };
      const markup = render(p);
      const start = markup.indexOf(`data-kind="opening" data-id="${DOOR_ID}"`);
      const group = markup.slice(start, markup.indexOf('</g>', start));
      expect(group).toMatch(new RegExp(`<path d="M[^"]*A83 83 0 0 [01] ${end}"`));
    }
  });

  it('paints the door and window gaps with the page color so the grid does not show through', () => {
    const markup = render(sampleProject());
    const start = markup.indexOf(`data-kind="opening" data-id="${DOOR_ID}"`);
    const group = markup.slice(start, markup.indexOf('</g>', start));
    // the gap across the wall thickness: x 58.5..141.5, y -10..10
    expect(group).toMatch(/<path data-kind="opening-gap" d="M58.5 -10L141.5 -10L141.5 10L58.5 10Z" fill="#ffffff"/);
  });

  it('places objects with translate, rotate and mirror scale', () => {
    const p = sampleProject();
    const level = lvl(p);
    level.objects[BED_ID] = { ...level.objects[BED_ID]!, rotation: 90, mirrored: true };
    const markup = render(p);
    expect(markup).toContain('transform="translate(250 180) rotate(90) scale(-1 1)"');
    expect(markup).toContain('fill-opacity="0.35"');
  });

  it('keeps symbol labels opaque and readable when the object is rotated or mirrored', () => {
    const p = sampleProject();
    const fridge = createObjectFromSize({ kind: 'catalog', catalogId: 'fridge' }, 100, 200, { width: 60, depth: 65, height: 180 }, 'Réfrigérateur', '#c4d3de', {
      id: 'fridge-1',
      rotation: 180,
      mirrored: true,
    });
    lvl(p).objects[fridge.id] = fridge;
    const label = render(p).match(/<text[^>]*>Frigo<\/text>/)?.[0] ?? '';
    expect(label).toContain('fill-opacity="1"');
    expect(label).toContain('transform="scale(-1 1) rotate(180)"');
  });

  it('renders every door and window variant without NaN, with one arc per leaf', () => {
    const variants = { door: ['single', 'double', 'sliding', 'pocket'], window: ['single', 'double', 'sliding', 'fixed'] } as const;
    const arcs: Record<string, number> = { single: 1, double: 2, sliding: 0, pocket: 0, fixed: 0 };
    for (const kind of ['door', 'window'] as const) {
      for (const variant of variants[kind]) {
        const p = sampleProject();
        const level = lvl(p);
        level.openings[DOOR_ID] = { ...level.openings[DOOR_ID]!, kind, variant, width: 90 };
        const markup = render(p);
        expect(markup, `${kind} ${variant}`).not.toMatch(/NaN|Infinity/);
        const start = markup.indexOf(`data-kind="opening" data-id="${DOOR_ID}"`);
        const group = markup.slice(start, markup.indexOf('</g>', start));
        expect(group.match(/<path d="M[^"]*A/g)?.length ?? 0, `${kind} ${variant}`).toBe(arcs[variant]);
      }
    }
  });

  it('stops the pocket of a sliding pocket door at the face of the neighbour wall', () => {
    const p = sampleProject();
    const level = lvl(p);
    // door center 60 cm from the wall start, 83 wide (jamb at 18.5): the 83 cm pocket would reach
    // x = -64.5; the left wall (20 cm thick) has its inner face at x = 10
    level.openings[DOOR_ID] = { ...level.openings[DOOR_ID]!, variant: 'pocket', offset: 60 };
    const xs = linesOf(render(p), 'opening', DOOR_ID).flatMap(([x1, , x2]) => [x1!, x2!]);
    expect(Math.min(...xs)).toBe(10);
  });

  it('renders custom objects with their definition shape', () => {
    const p = sampleProject();
    p.customObjects['c1'] = {
      id: 'c1',
      name: 'Poêle',
      shape: 'circle',
      width: 60,
      depth: 60,
      height: 100,
      color: '#aa5500',
      lshape: null,
    };
    lvl(p).objects['o2'] = createObjectFromSize(
      { kind: 'custom', customObjectId: 'c1' },
      100,
      200,
      { width: 60, depth: 60, height: 100 },
      'Poêle',
      '#aa5500',
      { id: 'o2' },
    );
    const markup = render(p);
    expect(markup).toMatch(/data-kind="object" data-id="o2"[^]*?<ellipse/);
  });

  it('draws a custom L object from the placed object lshape only (R22)', () => {
    const p = sampleProject();
    p.customObjects['c2'] = {
      id: 'c2',
      name: 'Bureau en L',
      shape: 'lshape',
      width: 200,
      depth: 150,
      height: 75,
      color: '#888888',
      lshape: { notchWidth: 120, notchDepth: 90 },
    };
    const place = (lshape: PlacedObject['lshape']) =>
      createObjectFromSize({ kind: 'custom', customObjectId: 'c2' }, 200, 150, { width: 200, depth: 150, height: 75 }, 'Bureau en L', '#888888', {
        id: 'o3',
        lshape,
      });
    const groupOf = (markup: string) => {
      const start = markup.indexOf('data-kind="object" data-id="o3"');
      return markup.slice(start, markup.indexOf('</g></g>', start));
    };
    lvl(p).objects['o3'] = place(null);
    const plain = groupOf(render(p));
    expect(plain).toContain('<rect');
    expect(plain).not.toContain('<polygon');
    lvl(p).objects['o3'] = place({ notchWidth: 120, notchDepth: 90 });
    expect(groupOf(render(p))).toContain('<polygon');
  });

  it('draws the background image at its scale, rotation and opacity, only when visible and known', () => {
    const p = sampleProject();
    const bg: Background = {
      imageId: 'img-1',
      widthPx: 1000,
      heightPx: 500,
      scale: 0.5,
      x: -20,
      y: 30,
      rotation: 10,
      opacity: 0.4,
      locked: false,
      visible: true,
    };
    lvl(p).background = bg;
    const markup = render(p, { imageUrls: { 'img-1': 'data:image/png;base64,AAAA' } });
    const image = markup.match(/<image[^>]*>/)?.[0] ?? '';
    expect(image).toContain('data-kind="background"');
    expect(image).toContain('x="-20"');
    expect(image).toContain('y="30"');
    expect(image).toContain('width="500"');
    expect(image).toContain('height="250"');
    expect(image).toContain('transform="rotate(10 -20 30)"');
    expect(image).toContain('opacity="0.4"');
    expect(image).toContain('href="data:image/png;base64,AAAA"');

    expect(render(p, { imageUrls: {} })).not.toContain('<image');
    lvl(p).background = { ...bg, visible: false };
    expect(render(p, { imageUrls: { 'img-1': 'x' } })).not.toContain('<image');
  });

  it('draws the lower level as a light ghost of its walls only', () => {
    const p = sampleProject();
    const lower: Level = levelFromWalls(rectRoom(-50, -50, 300, 250));
    lower.openings['lo'] = createOpening(findWall(lower, -50, -50, 300, -50), 'door', 100, { id: 'lo' });
    const markup = render(p, { lowerLevel: lower });
    expect(markup).toContain('data-kind="lower-level"');
    expect(markup).not.toContain('data-id="lo"');
    expect(render(p)).not.toContain('data-kind="lower-level"');
  });

  it('hides the area of a room too small to hold it but keeps its name', () => {
    const p = projectFrom(rectRoom(0, 0, 60, 60), (level) => {
      level.roomLabels.push({ id: 'l', name: 'Placard', anchor: { x: 30, y: 30 } });
    });
    const markup = render(p, { viewBox: { x: -50, y: -50, width: 200, height: 200 } });
    expect(markup).toContain('Placard');
    expect(markup).not.toContain('m²');
  });
});
