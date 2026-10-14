import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CACHE, fetchCached, fetchJson } from './fetch.ts';
import type { RawItem } from './types.ts';

const API = 'https://api.polyhaven.com';
/** Poly Haven categories that may hold furniture or interior objects (triaged by hand afterwards). */
export const PH_CATEGORIES = ['furniture', 'seating', 'table', 'shelves', 'lighting', 'appliances', 'electronics', 'decorative', 'plants', 'office'];

export interface PhAsset {
  name: string;
  categories: string[];
  tags: string[];
  polycount?: number;
  dimensions?: number[];
  authors: Record<string, string>;
  thumbnail_url: string;
}

export async function listPolyhaven(): Promise<Record<string, PhAsset>> {
  const all = await fetchJson<Record<string, PhAsset>>(`${API}/assets?t=models`);
  return Object.fromEntries(Object.entries(all).filter(([, a]) => a.categories.some((c) => PH_CATEGORIES.includes(c))));
}

interface PhFile { url: string; size: number; md5: string }
interface PhFiles { gltf?: Record<string, { gltf: PhFile & { include: Record<string, PhFile> } }> }

/** Downloads the glTF of `id` at `res` with its buffers and textures; the RawItem points at the .gltf. */
export async function fetchPolyhaven(id: string, asset: PhAsset, res: string): Promise<RawItem> {
  const files = await fetchJson<PhFiles>(`${API}/files/${id}`);
  const entry = files.gltf?.[res];
  if (!entry) throw new Error(`no ${res} glTF for ${id}`);
  const dir = path.join('polyhaven', id);
  mkdirSync(path.join(CACHE, dir), { recursive: true });
  const main = await fetchCached(entry.gltf.url, path.join(dir, path.basename(entry.gltf.url)));
  for (const [rel, f] of Object.entries(entry.gltf.include)) {
    if (rel.includes('..')) throw new Error(`unsafe include ${rel}`);
    await fetchCached(f.url, path.join(dir, rel));
  }
  return {
    source: 'polyhaven',
    library: 'polyhaven',
    key: id,
    sourceId: id,
    name: asset.name,
    tags: asset.tags,
    creator: Object.keys(asset.authors).join(', '),
    license: 'CC0',
    pageUrl: `https://polyhaven.com/a/${id}`,
    modelPath: main,
  };
}
