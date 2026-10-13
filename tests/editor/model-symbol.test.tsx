import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { afterEach } from 'vitest';
import { CATALOG } from '@/catalog/catalog';
import { ModelSymbol } from '@/catalog/symbols';
import { createObjectFromSize } from '@/core/model/factory';
import { ObjectsLayer } from '@/render/layers/ObjectsLayer';
import { loadModelOutlines, modelOutline, setModelOutlines } from '@/render/modelOutlines';

type Top = { outline: number[][]; detail: number[][] };

const square: Top = { outline: [[-500, -500, 500, -500, 500, 500, -500, 500]], detail: [[-500, -500, 500, -500, 500, -250, -500, -250]] };
const render = (top: Top, w: number, d: number) =>
  renderToStaticMarkup(<ModelSymbol top={top} w={w} d={d} lineUnit={1} stroke="#222222" fill="#cccccc" />);

describe('ModelSymbol', () => {
  it('scales the outline to the object size', () => {
    const m = render(square, 200, 100);
    expect(m).toContain('d="M-100 -50L100 -50L100 50L-100 50Z"');
    expect(m).toContain('fill="#cccccc"');
    expect(m).toContain('fill-rule="evenodd"');
  });

  it('draws the detail as lines on the back side', () => {
    const m = render(square, 200, 100);
    expect(m).toContain('<path data-detail="1" d="M-100 -50L100 -50L100 -25L-100 -25Z"></path>');
  });

  it('omits the detail when there is none', () => {
    expect(render({ ...square, detail: [] }, 200, 100)).not.toContain('data-detail');
  });

  it('stays finite at extreme sizes', () => {
    for (const [w, d] of [[5, 5], [600, 10], [10, 600], [0.5, 0.5]] as const) {
      const m = render(square, w, d);
      expect(m).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('falls back to the box when the outline is empty', () => {
    expect(render({ outline: [], detail: [] }, 80, 40)).toMatch(/<rect x="-40" y="-20" width="80" height="40"/);
  });
});

describe('ObjectsLayer with downloaded models', () => {
  afterEach(() => setModelOutlines(null));
  const table = () => JSON.parse(readFileSync('public/models/outlines.json', 'utf8')) as Record<string, [number[][], number[][]]>;

  const layer = (catalogId: string) => {
    const o = createObjectFromSize({ kind: 'catalog', catalogId }, 0, 0, { width: 100, depth: 50, height: 80 }, 'x', '#cccccc', {});
    return renderToStaticMarkup(
      <svg>
        <ObjectsLayer objects={{ [o.id]: o }} customObjects={{}} lineUnit={1} />
      </svg>,
    );
  };

  it('draws a model by its box until the top views are loaded, then by its outline', async () => {
    const model = CATALOG.find((e) => e.model)!;
    expect(layer(model.id)).toContain('<rect');
    await loadModelOutlines(async () => table());
    expect(modelOutline(model.id)).not.toBeNull();
    const m = layer(model.id);
    expect(m).toContain('fill-rule="evenodd"');
    expect(m).not.toContain('<rect');
  });

  it('loads the top views once and keeps the boxes when they cannot be loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchTable = vi.fn(() => Promise.reject(new Error('offline')));
    await Promise.all([loadModelOutlines(fetchTable), loadModelOutlines(fetchTable)]);
    await loadModelOutlines(fetchTable);
    expect(fetchTable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(layer(CATALOG.find((e) => e.model)!.id)).toContain('<rect');
    warn.mockRestore();
  });

  it('unknown model id falls back to a rectangle', () => {
    const m = layer('kn-does-not-exist');
    expect(m).toContain('<rect');
    expect(m).not.toContain('evenodd');
  });
});
