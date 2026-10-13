import { getCatalogEntry, modelTopUrl } from '@/catalog/catalog';
import type { Level } from '@/core/model/types';

/**
 * The top views of the downloaded models of a level, as data URLs, for the exports (the static
 * rendering cannot load URLs). They are re-encoded in PNG: jsPDF turns a WebP into an opaque JPEG
 * (each chair on a black square), while it keeps the alpha of a PNG as a soft mask. `missing`:
 * the models whose image could not be fetched; the export draws their box and says so.
 */
export async function modelTopDataUrls(
  level: Level,
  fetchBlob: (url: string) => Promise<Blob> = defaultFetch,
  toPng: (blob: Blob) => Promise<Blob> = pngOf,
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
        const png = await toPng(await fetchBlob(modelTopUrl(id, import.meta.env.BASE_URL)));
        urls[id] = `data:image/png;base64,${toBase64(new Uint8Array(await png.arrayBuffer()))}`;
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

/**
 * The image re-encoded in PNG, transparency kept (browser: decoded, drawn on a canvas; a page
 * canvas where OffscreenCanvas is missing, Safari before 16.4).
 */
async function pngOf(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    bitmap.close();
  }
}

async function defaultFetch(url: string): Promise<Blob> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}
