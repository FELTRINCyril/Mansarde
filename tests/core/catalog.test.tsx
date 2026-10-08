import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CATALOG, getCatalogEntry } from '../../src/catalog/catalog';
import { SYMBOLS, GenericSymbol } from '../../src/catalog/symbols';

const FORBIDDEN = /[\u2014\u2013\u2026\u00a0\u00d7\u2018\u2019\u201c\u201d\u2192]/;
const GENERIC_IDS = ['generic-rect', 'generic-circle', 'generic-lshape'];
const SIZES: Array<[number, number]> = [
  [100, 50],
  [5, 5],
  [300, 20],
  [20, 300],
  [1000, 1000],
];

function render(id: string, w: number, d: number, lineUnit = 1): string {
  const Sym = SYMBOLS[id];
  if (!Sym) throw new Error(`no symbol for ${id}`);
  return renderToStaticMarkup(<Sym w={w} d={d} lineUnit={lineUnit} stroke="#222222" fill="#cccccc" />);
}

function assertClean(markup: string): void {
  expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  // no negative radius or size attribute
  expect(markup).not.toMatch(/\s(r|rx|ry|width|height)="-/);
}

describe('catalog data', () => {
  it('has unique ids', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has positive dimensions and a hex color', () => {
    for (const e of CATALOG) {
      expect(e.width, e.id).toBeGreaterThan(0);
      expect(e.depth, e.id).toBeGreaterThan(0);
      expect(e.height, e.id).toBeGreaterThan(0);
      expect(e.color, e.id).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('has no forbidden typographic characters in names', () => {
    for (const e of CATALOG) {
      expect(e.name, e.id).not.toMatch(FORBIDDEN);
      expect(e.category, e.id).not.toMatch(FORBIDDEN);
    }
  });

  it('contains the 44 expected entries with exact values', () => {
    expect(CATALOG).toHaveLength(44);
    const e = (id: string) => getCatalogEntry(id);
    expect(e('bed-140')).toMatchObject({ name: 'Lit 140', category: 'Chambre', width: 140, depth: 190, height: 50 });
    expect(e('crib')).toMatchObject({ name: 'Berceau', width: 60, depth: 120, height: 90 });
    expect(e('sofa-corner')).toMatchObject({ name: "Canapé d'angle", category: 'Séjour', width: 250, depth: 200 });
    expect(e('table-round')).toMatchObject({ category: 'Bureau et repas', width: 110, depth: 110, height: 75 });
    expect(e('sink')).toMatchObject({ name: 'Évier', category: 'Cuisine' });
    expect(e('bathtub')).toMatchObject({ category: 'Salle de bain', width: 170, depth: 75, height: 60 });
    expect(e('stairs-quarter')).toMatchObject({ category: 'Structure', width: 90, depth: 250, height: 270 });
    expect(e('generic-lshape')).toMatchObject({
      name: 'Forme en L',
      category: 'Génériques',
      width: 200,
      depth: 150,
      height: 90,
      shape: 'lshape',
      lshape: { notchWidth: 120, notchDepth: 90 },
    });
    expect(e('generic-circle')?.shape).toBe('circle');
    expect(e('generic-rect')?.shape).toBe('rect');
    expect(e('nope')).toBeUndefined();
  });

  it('has the V2 entries with exact values, pose and default elevation', () => {
    const e = (id: string) => getCatalogEntry(id);
    expect(e('tv')).toMatchObject({ name: 'TV', category: 'Séjour', width: 100, depth: 20, height: 60, pose: 'onTop' });
    expect(e('tv-wall')).toMatchObject({ name: 'TV murale', category: 'Séjour', width: 110, depth: 8, height: 65, pose: 'wall', elevation: 110 });
    expect(e('shelf-wall')).toMatchObject({ name: 'Étagère murale', category: 'Séjour', width: 80, depth: 25, height: 3, pose: 'wall', elevation: 150 });
    expect(e('rug-round')).toMatchObject({ name: 'Tapis rond', category: 'Séjour', width: 120, depth: 120, height: 1, pose: 'covering' });
    expect(e('rug-rect')).toMatchObject({ name: 'Tapis', category: 'Séjour', width: 170, depth: 120, height: 1, pose: 'covering' });
    expect(e('plant')).toMatchObject({ name: 'Plante', category: 'Séjour', width: 40, depth: 40, height: 90, pose: 'floor' });
    expect(e('bedside-lamp')).toMatchObject({ name: 'Lampe de chevet', category: 'Chambre', width: 25, depth: 25, height: 45, pose: 'onTop' });
    expect(e('microwave')).toMatchObject({ name: 'Micro-ondes', category: 'Cuisine', width: 50, depth: 40, height: 30, pose: 'onTop' });
    expect(e('pouf')).toMatchObject({ name: 'Pouf', category: 'Séjour', width: 50, depth: 50, height: 40, pose: 'tuckable' });
  });

  it('only wall-mounted entries carry a default elevation', () => {
    for (const e of CATALOG) {
      if (e.id === 'tv-wall' || e.id === 'shelf-wall') expect(e.elevation, e.id).toBeGreaterThan(0);
      else expect(e.elevation, e.id).toBeUndefined();
    }
  });

  it('lists the pose of every entry, old ones included', () => {
    const expected: Record<string, string> = {
      tv: 'onTop', 'tv-wall': 'wall', 'shelf-wall': 'wall', 'rug-round': 'covering', 'rug-rect': 'covering',
      plant: 'floor', 'bedside-lamp': 'onTop', microwave: 'onTop', pouf: 'tuckable', chair: 'tuckable',
    };
    for (const e of CATALOG) expect(e.pose, e.id).toBe(expected[e.id] ?? 'floor');
    expect(getCatalogEntry('desk')?.acceptsUnder).toBe(true);
    expect(getCatalogEntry('chair')?.acceptsUnder).toBeUndefined();
  });

  it('uses the shape "symbol" for every non-generic entry and only those', () => {
    for (const e of CATALOG) {
      if (GENERIC_IDS.includes(e.id)) expect(e.shape, e.id).not.toBe('symbol');
      else expect(e.shape, e.id).toBe('symbol');
    }
  });
});

describe('symbols', () => {
  it('has a symbol for every non-generic entry and no stray keys', () => {
    for (const e of CATALOG) {
      if (GENERIC_IDS.includes(e.id)) expect(SYMBOLS[e.id], e.id).toBeUndefined();
      else expect(SYMBOLS[e.id], e.id).toBeTypeOf('function');
    }
    const ids = new Set(CATALOG.map((e) => e.id));
    for (const key of Object.keys(SYMBOLS)) expect(ids.has(key), key).toBe(true);
  });

  for (const [w, d] of SIZES) {
    it(`renders every symbol cleanly at ${w} x ${d}`, () => {
      for (const id of Object.keys(SYMBOLS)) {
        const markup = render(id, w, d);
        expect(markup, id).toContain('<');
        assertClean(markup);
      }
    });
  }

  it('renders at the catalog default size and with a large lineUnit', () => {
    for (const e of CATALOG) {
      if (e.shape !== 'symbol') continue;
      assertClean(render(e.id, e.width, e.depth, 0.5));
      assertClean(render(e.id, e.width, e.depth, 4));
    }
  });

  it('uses lineUnit as stroke width and applies stroke and fill', () => {
    const markup = render('bed-140', 140, 190, 1.5);
    expect(markup).toContain('stroke-width="1.5"');
    expect(markup).toContain('stroke="#222222"');
    expect(markup).toContain('fill="#cccccc"');
  });

  it('does not use transform scale', () => {
    for (const id of Object.keys(SYMBOLS)) expect(render(id, 100, 50), id).not.toMatch(/scale\(/);
  });

  it('draws 1 pillow for the 90 bed and 2 for wider beds', () => {
    const pillows = (id: string, w: number, d: number) => (render(id, w, d).match(/<rect/g) ?? []).length;
    expect(pillows('bed-140', 140, 190) - pillows('bed-90', 90, 190)).toBe(1);
  });

  it('draws 4 circles for the cooktop and an ellipse for the round table', () => {
    expect((render('cooktop', 60, 60).match(/<circle/g) ?? []).length).toBe(4);
    expect(render('table-round', 110, 110)).toContain('<ellipse');
  });

  it('draws a step line every 25 cm on the straight stairs', () => {
    const markup = render('stairs-straight', 90, 300);
    expect((markup.match(/data-step/g) ?? []).length).toBe(11);
  });

  it('adds the short text labels only when they fit', () => {
    const fridge = render('fridge', 60, 65);
    expect(fridge).toContain('>Frigo<');
    expect(fridge).toContain('font-size="10"');
    expect(render('dishwasher', 60, 60)).toContain('>LV<');
    expect(render('washing-machine', 60, 60)).toContain('>LL<');
    expect(render('fridge', 5, 5)).not.toContain('<text');
    expect(render('fridge', 60, 7)).not.toContain('<text');
    // elongated but deep enough: the font is shrunk to 80 percent of the depth cap, never above 10
    expect(render('fridge', 300, 20)).toContain('font-size="10"');
  });

  it('draws the round table as an ellipse computed from w and d', () => {
    const markup = render('table-round', 100, 50);
    expect(markup).toContain('rx="50"');
    expect(markup).toContain('ry="25"');
  });

  it('places the bed pillows in the back half (y < 0)', () => {
    for (const [id, w, d] of [['bed-90', 90, 190], ['bed-140', 140, 190], ['bed-180', 180, 200]] as const) {
      const pillows = [...render(id, w, d).matchAll(/<rect[^>]*>/g)]
        .map((m) => m[0])
        .filter((r) => !/rx="0"/.test(r));
      expect(pillows.length, id).toBe(id === 'bed-90' ? 1 : 2);
      for (const r of pillows) {
        const y = Number(/ y="([^"]+)"/.exec(r)?.[1]);
        const h = Number(/height="([^"]+)"/.exec(r)?.[1]);
        expect(y, id).toBeLessThan(0);
        expect(y + h, id).toBeLessThan(0);
      }
    }
  });

  it('keeps dresser, counter and tv-unit visually distinct', () => {
    const lines = (id: string, w: number, d: number) => (render(id, w, d).match(/<line/g) ?? []).length;
    expect(lines('dresser', 100, 50)).toBe(3);
    expect(lines('counter', 120, 60)).toBe(2); // back line + one module joint
    expect(lines('tv-unit', 160, 45)).toBe(1);
    expect(render('tv-unit', 160, 45)).toContain('<rect');
  });
});

describe('V2 symbols', () => {
  const V2 = ['tv', 'tv-wall', 'shelf-wall', 'rug-round', 'rug-rect', 'plant', 'bedside-lamp', 'microwave', 'pouf'];
  const sizes: Array<[number, number]> = [[5, 5], [300, 20], [20, 300]];

  it('renders every V2 symbol without NaN at default, tiny, elongated and large sizes', () => {
    for (const id of V2) {
      const e = getCatalogEntry(id)!;
      for (const [w, d] of [[e.width, e.depth], ...sizes] as Array<[number, number]>) {
        for (const lu of [0.5, 1, 4]) {
          const m = render(id, w, d, lu);
          expect(m.length, `${id} ${w}x${d}`).toBeGreaterThan(20);
          assertClean(m);
          expect(m, id).not.toMatch(/scale\(/);
        }
      }
    }
  });

  it('draws the round rug as concentric ellipses computed from w and d', () => {
    const m = render('rug-round', 120, 80);
    expect((m.match(/<ellipse/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(m).toContain('rx="60"');
    expect(m).toContain('ry="40"');
  });

  it('draws fringes on the short sides of the rectangular rug', () => {
    const fringe = (w: number, d: number) => render('rug-rect', w, d).split('data-fringe')[1] ?? '';
    const ticks = (m: string) => [...m.matchAll(/<line[^>]*>/g)].map((t) => t[0]);
    // 170 x 120: n = 12 per short end, vertical ends at x = -85 and x = 85 (ticks have x1 = +-85)
    expect(ticks(fringe(170, 120))).toHaveLength(24);
    expect(ticks(fringe(170, 120)).every((t) => /x1="-?85"/.test(t))).toBe(true);
    // portrait rug: the short ends are the back and front sides (ticks have y1 = +-85)
    expect(ticks(fringe(120, 170)).every((t) => /y1="-?85"/.test(t))).toBe(true);
  });

  it('draws the wall TV as a thick back line with dashes', () => {
    const m = render('tv-wall', 110, 8);
    expect(m).toContain('stroke-dasharray');
    expect(m).toContain('data-thick');
  });

  it('draws a stand under the TV screen on the back side only', () => {
    const m = render('tv', 100, 20);
    expect(m).toContain('data-stand');
    expect(m).toContain('data-screen');
  });

  it('draws a window and a handle line on the microwave and a cross on the lamp', () => {
    expect(render('microwave', 50, 40)).toContain('data-window');
    expect(render('bedside-lamp', 25, 25)).toContain('data-cross');
  });

  it('draws leaves for the plant and a seam for the pouf', () => {
    expect((render('plant', 40, 40).match(/data-leaf/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(render('pouf', 50, 50)).toContain('data-seam');
  });
});

describe('GenericSymbol', () => {
  const gen = (shape: 'rect' | 'circle' | 'lshape', w: number, d: number, lshape: { notchWidth: number; notchDepth: number } | null) =>
    renderToStaticMarkup(<GenericSymbol w={w} d={d} lineUnit={1} stroke="#111111" fill="#eeeeee" shape={shape} lshape={lshape} />);

  it('renders a rect, an ellipse and an L polygon', () => {
    expect(gen('rect', 100, 60, null)).toContain('<rect');
    expect(gen('circle', 80, 80, null)).toContain('<ellipse');
    const l = gen('lshape', 200, 150, { notchWidth: 120, notchDepth: 90 });
    expect(l).toContain('<polygon');
    // notch at the local (+x,+y) corner: points (100,-75) (100,-15) (-20,-15) (-20,75)
    expect(l).toContain('100,-15');
    expect(l).toContain('-20,-15');
    expect(l).toContain('-20,75');
  });

  it('stays finite for degenerate inputs and clamps the notch', () => {
    for (const [w, d] of SIZES) {
      for (const shape of ['rect', 'circle', 'lshape'] as const) {
        assertClean(gen(shape, w, d, { notchWidth: 120, notchDepth: 90 }));
        assertClean(gen(shape, w, d, null));
      }
    }
    assertClean(gen('lshape', 100, 100, { notchWidth: -5, notchDepth: 500 }));
  });

  it('falls back to a rectangle when lshape is null, like objectFootprint', () => {
    const markup = gen('lshape', 200, 150, null);
    expect(markup).toContain('<rect');
    expect(markup).not.toContain('<polygon');
  });
});
