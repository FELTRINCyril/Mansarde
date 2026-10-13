import { getCatalogEntry, modelTopUrl } from '@/catalog/catalog';
import type { Level } from '@/core/model/types';

/**
 * The top views of the downloaded models of a level, as data URLs, for the exports (the static
 * rendering cannot load URLs). `missing`: the models whose image could not be fetched; the export
 * draws their box and says so.
 */
export async function modelTopDataUrls(
  level: Level,
  fetchBlob: (url: string) => Promise<Blob> = defaultFetch,
): Promise<{ urls: Record<string, string>; missing: string[] }> {
  const ids = new Set<string>();
  for (const o of Object.values(level.objects)) {
    if (o.source.kind === 'catalog' && getCatalogEntry(o.source.catalogId)?.model) ids.add(o.source.catalogId);
  }
  const urls: Record<string, string> = {};
  const missing: string[] = [];
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const blob = await fetchBlob(modelTopUrl(id, import.meta.env.BASE_URL));
        urls[id] = `data:${blob.type || 'image/webp'};base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`;
      } catch {
        missing.push(id);
      }
    }),
  );
  return { urls, missing };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function defaultFetch(url: string): Promise<Blob> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}
