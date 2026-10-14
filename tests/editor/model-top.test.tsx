import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG } from '@/catalog/catalog';
import { createObjectFromSize } from '@/core/model/factory';
import type { Level, PlacedObject } from '@/core/model/types';
import { modelTopDataUrls } from '@/export/modelTops';
import { ObjectsLayer } from '@/render/layers/ObjectsLayer';
import { levelFromWalls } from '../core/fixtures';

/* The plan draws a downloaded model by its top view, an image rendered from the model (13/10/2026). */

const MODEL = CATALOG.find((e) => e.model)!;
const OTHER = CATALOG.find((e) => e.model && e.id !== MODEL.id)!;

const obj = (catalogId: string, size = { width: 100, depth: 50, height: 80 }): PlacedObject =>
  createObjectFromSize({ kind: 'catalog', catalogId }, 0, 0, size, 'x', '#cccccc', {});

const layer = (objects: PlacedObject[], modelImageUrls?: Record<string, string>) =>
  renderToStaticMarkup(
    <svg>
      <ObjectsLayer objects={Object.fromEntries(objects.map((o) => [o.id, o]))} customObjects={{}} lineUnit={1} modelImageUrls={modelImageUrls} />
    </svg>,
  );

describe('ObjectsLayer with downloaded models', () => {
  it('draws the top view stretched over the footprint, its box under it while it loads', () => {
    const m = layer([obj(MODEL.id, { width: 200, depth: 80, height: 90 })]);
    expect(m).toContain(`href="/models/top/${MODEL.id}.webp"`);
    expect(m).toMatch(/<image data-kind="model-top"[^>]* x="-100" y="-40" width="200" height="80" preserveAspectRatio="none"/);
    // the placeholder box comes first (under the image); the e2e checks it goes once loaded
    expect(m.indexOf('<rect')).toBeGreaterThan(-1);
    expect(m.indexOf('<rect')).toBeLessThan(m.indexOf('<image'));
  });

  it('stays finite at extreme sizes', () => {
    for (const [w, d] of [[5, 5], [600, 10], [0.5, 0.5]] as const) expect(layer([obj(MODEL.id, { width: w, depth: d, height: 10 })])).not.toMatch(/NaN|Infinity/);
  });

  it('uses the data URLs of an export, without placeholder, and the box for a missing one', () => {
    const m = layer([obj(MODEL.id), obj(OTHER.id)], { [MODEL.id]: 'data:image/png;base64,AAAA' });
    expect(m).toContain('href="data:image/png;base64,AAAA"');
    expect(m).not.toContain('/models/top/');
    expect(m.match(/<rect/g)).toHaveLength(1);
  });

  it('unknown model id falls back to a rectangle', () => {
    const m = layer([obj('kn-does-not-exist')]);
    expect(m).toContain('<rect');
    expect(m).not.toContain('<image');
  });

  it('keeps the parametric symbols', () => {
    expect(layer([obj('bed-140')])).not.toContain('<image');
  });
});

describe('modelTopDataUrls', () => {
  const level = (objects: PlacedObject[]): Level => ({ ...levelFromWalls([]), objects: Object.fromEntries(objects.map((o) => [o.id, o])) });

  it('fetches each model once and reports the missing ones', async () => {
    const fetchBlob = vi.fn(async (url: string) => {
      if (url.includes(OTHER.id)) throw new Error('404');
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    });
    // the PNG re-encoding is the browser's (e2e export-models.spec.ts); identity here
    const r = await modelTopDataUrls(level([obj(MODEL.id), obj(MODEL.id), obj(OTHER.id), obj('bed-140')]), fetchBlob, async (b) => b);
    expect(fetchBlob).toHaveBeenCalledTimes(2);
    expect(r.urls[MODEL.id]).toBe('data:image/png;base64,AQID');
    expect(r.missing).toEqual([OTHER.id]);
  });
});
