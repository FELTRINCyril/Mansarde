import type { Plugin } from 'vite';

/**
 * polygon-clipping stops an endless sweep (floating point round-off) only after 1e6 sweep-line
 * segments or queued events: seconds of computation, a frozen editor, before the error that the
 * retries of src/core/geometry/boolean.ts recover from (ruling R37). A plan has a few thousand
 * segments at most, so much lower limits only make such a failure fast. The library reads them
 * from process.env, which a browser does not have: polygonClippingLimits writes them into its
 * code (app and pre-bundled dependencies); Node (Vitest) gets them as environment variables.
 */
export const POLYGON_CLIPPING_LIMITS = {
  POLYGON_CLIPPING_MAX_QUEUE_SIZE: 200000,
  POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS: 20000,
} as const;

/** The limits as strings, as process.env holds them (Vitest `test.env`). */
export const polygonClippingEnv = (): Record<string, string> =>
  Object.fromEntries(Object.entries(POLYGON_CLIPPING_LIMITS).map(([k, v]) => [k, String(v)]));

/**
 * Replaces each `typeof process !== "undefined" && process.env.NAME || 1000000` of the library
 * source by its limit. Throws when one is not found: a new library version must be checked.
 */
export function applyPolygonClippingLimits(code: string): string {
  let out = code;
  for (const [name, limit] of Object.entries(POLYGON_CLIPPING_LIMITS)) {
    const guard = new RegExp(`typeof process !== "undefined" && process\\.env\\.${name} \\|\\| 1000000`, 'g');
    if (!guard.test(out)) throw new Error(`polygon-clipping: ${name} guard not found, check vite.polygonClipping.ts`);
    out = out.replace(guard, String(limit));
  }
  return out;
}

const isLibrary = (id: string): boolean => /[\\/]polygon-clipping[\\/]dist[\\/]polygon-clipping\.[a-z]+\.js$/.test(id);

const transform = (code: string, id: string) => (isLibrary(id) ? { code: applyPolygonClippingLimits(code), map: null } : null);

/** Vite plugin (app build and dev server); polygonClippingLimitsDeps is the same for the dependency pre-bundling. */
export function polygonClippingLimits(): Plugin {
  return { name: 'polygon-clipping-limits', enforce: 'pre', transform };
}

export function polygonClippingLimitsDeps(): { name: string; transform: typeof transform } {
  return { name: 'polygon-clipping-limits-deps', transform };
}
