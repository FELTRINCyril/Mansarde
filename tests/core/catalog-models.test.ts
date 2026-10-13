import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_CATALOG, CATALOG, CATEGORY_ORDER, getCatalogEntry, modelIconUrl, modelUrl } from '../../src/catalog/catalog';
import credits from '../../src/catalog/generated/credits.json';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const MODEL_CREDITS = (credits as { models: Record<string, { source: string; library: string; author: string; license: string; url?: string }> }).models;
const LICENSES = ['CC0', 'CC-BY 3.0', 'CC-BY 3.0 US', 'Free Art License 1.3', 'Free Art License 1.3 / CC-BY 3.0'];
const models = CATALOG.filter((e) => e.model);
const lock = readFileSync(path.join(ROOT, 'tools', 'models', 'ids.lock'), 'utf8').split('\n').filter(Boolean);

describe('downloaded models in the catalog', () => {
  it('has at least 500 of them, after the parametric entries', () => {
    expect(models.length).toBeGreaterThanOrEqual(500);
    expect(CATALOG.slice(0, BUILTIN_CATALOG.length)).toEqual(BUILTIN_CATALOG);
    expect(BUILTIN_CATALOG.some((e) => e.model)).toBe(false);
  });

  it('uses source prefixes and never reuses a parametric id', () => {
    const builtin = new Set(BUILTIN_CATALOG.map((e) => e.id));
    for (const e of models) {
      expect(e.id).toMatch(/^(kn|qt|ph|sh-[a-z0-9]+)-[a-z0-9-]+$/);
      expect(builtin.has(e.id), e.id).toBe(false);
    }
  });

  it('ships the GLB and the icon of every model', () => {
    const missing = models.filter((e) => !existsSync(path.join(PUBLIC, 'models', `${e.id}.glb`)) || !existsSync(path.join(PUBLIC, 'models', 'icons', `${e.id}.webp`)));
    expect(missing.map((e) => e.id)).toEqual([]);
  });

  it('ships the top view of every model for the plan, an image no larger than 384 px', () => {
    const top = path.join(PUBLIC, 'models', 'top');
    const files = readdirSync(top).filter((f) => f.endsWith('.webp'));
    expect(files.map((f) => f.slice(0, -5)).sort()).toEqual(models.map((e) => e.id).sort());
    for (const f of files) {
      const b = readFileSync(path.join(top, f));
      // RIFF....WEBP header, and a size a plan can afford
      expect(b.subarray(0, 4).toString('ascii') + b.subarray(8, 12).toString('ascii'), f).toBe('RIFFWEBP');
      expect(b.length, f).toBeLessThan(80 * 1024);
    }
    // the former outlines are gone
    expect(existsSync(path.join(PUBLIC, 'models', 'outlines.json'))).toBe(false);
  });

  it('keeps every model a known style', () => {
    for (const e of models) expect(['simple', 'realiste']).toContain(e.model!.style);
  });

  it('places every model in a known category with a sensible pose', () => {
    for (const e of models) {
      expect(CATEGORY_ORDER, e.id).toContain(e.category);
      expect(e.category, e.id).not.toBe('Génériques');
      if (e.pose === 'covering') expect(e.height, e.id).toBeLessThanOrEqual(5);
      if (e.carriesOnTop) expect(e.pose, e.id).toBe('wall');
      if (e.elevation !== undefined) expect(e.elevation, e.id).toBeGreaterThan(0);
    }
  });

  it('credits every model under an accepted license', () => {
    for (const e of models) {
      const c = MODEL_CREDITS[e.id];
      expect(c, e.id).toBeDefined();
      expect(LICENSES, e.id).toContain(c!.license);
      // attribution licenses need a named author (credits.test.tsx checks the library attributions)
      if (c!.license !== 'CC0') expect(c!.author.trim(), e.id).not.toBe('');
    }
    expect(Object.keys(MODEL_CREDITS).sort()).toEqual(models.map((e) => e.id).sort());
  });

  it('keeps every published id (tools/models/ids.lock)', () => {
    const ids = new Set(models.map((e) => e.id));
    expect(lock.filter((id) => !ids.has(id))).toEqual([]);
    expect([...ids].filter((id) => !lock.includes(id))).toEqual([]);
  });

  it('keeps the catalog data light (spec section 10: <= 120 KB gzip)', async () => {
    const { gzipSync } = await import('node:zlib');
    const raw = readFileSync(path.join(ROOT, 'src', 'catalog', 'generated', 'models.json'));
    expect(gzipSync(raw).length).toBeLessThanOrEqual(120 * 1024);
  });

  it('finds a model by id and builds its URLs under the base path', () => {
    const first = models[0]!;
    expect(getCatalogEntry(first.id)).toBe(first);
    expect(modelUrl(first.id, '/Mansarde/')).toBe(`/Mansarde/models/${first.id}.glb`);
    expect(modelIconUrl(first.id, '/')).toBe(`/models/icons/${first.id}.webp`);
  });
});
