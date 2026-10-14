import { CATEGORY_ORDER, type CatalogCategory, type CatalogEntry, type ModelStyle } from '@/catalog/catalog';

/** Style filter of the catalog panel: the parametric entries count as simple. */
export type StyleFilter = 'all' | ModelStyle;

/** Most entries a search shows (spec 2026-10-13, section 6): a broad query stays fast. */
export const SEARCH_LIMIT = 80;

/** Lower case without accents, for the search. */
export const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const folded = new WeakMap<CatalogEntry, string>();
const foldedName = (e: CatalogEntry): string => {
  let f = folded.get(e);
  if (f === undefined) {
    f = fold(e.name);
    folded.set(e, f);
  }
  return f;
};

export const styleOf = (e: CatalogEntry): ModelStyle => e.model?.style ?? 'simple';

const rank = new Map<CatalogCategory, number>(CATEGORY_ORDER.map((c, i) => [c, i]));

/**
 * The entries in display order: by category (CATEGORY_ORDER), the parametric entries first in
 * their catalog order, then the downloaded models by name.
 */
export function orderCatalog(entries: CatalogEntry[]): CatalogEntry[] {
  const index = new Map(entries.map((e, i) => [e, i]));
  return [...entries].sort((a, b) => {
    const c = (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99);
    if (c !== 0) return c;
    const m = Number(!!a.model) - Number(!!b.model);
    if (m !== 0) return m;
    return a.model ? a.name.localeCompare(b.name, 'fr') : index.get(a)! - index.get(b)!;
  });
}

/**
 * The entries matching `query` (name without accents; all when empty) and `style`, in display
 * order (`entries` must already be ordered, see orderCatalog), at most `limit` of them.
 */
export function filterCatalog(entries: CatalogEntry[], query: string, style: StyleFilter, limit = Infinity): { items: CatalogEntry[]; total: number; truncated: boolean } {
  const q = fold(query.trim());
  const items: CatalogEntry[] = [];
  let total = 0;
  for (const e of entries) {
    if (style !== 'all' && styleOf(e) !== style) continue;
    if (q !== '' && !foldedName(e).includes(q)) continue;
    total++;
    if (items.length < limit) items.push(e);
  }
  return { items, total, truncated: total > items.length };
}
