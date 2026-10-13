import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILTIN_CATALOG, CATALOG, CATEGORY_ORDER } from '@/catalog/catalog';
import { CatalogPanel } from '@/ui/CatalogPanel';
import { filterCatalog, orderCatalog, SEARCH_LIMIT, styleOf } from '@/ui/catalogFilter';

const ordered = orderCatalog(CATALOG);

describe('orderCatalog', () => {
  it('follows the category order, parametric entries first, then models by name', () => {
    const rank = (c: string) => CATEGORY_ORDER.indexOf(c as never);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1]!;
      const b = ordered[i]!;
      expect(rank(a.category), `${a.id} / ${b.id}`).toBeLessThanOrEqual(rank(b.category));
      if (a.category !== b.category) continue;
      expect(!!a.model && !b.model, `${a.id} before ${b.id}`).toBe(false);
      if (a.model && b.model) expect(a.name.localeCompare(b.name, 'fr'), `${a.id} / ${b.id}`).toBeLessThanOrEqual(0);
    }
    // the parametric entries keep their catalog order inside a category
    const bedroom = ordered.filter((e) => e.category === 'Chambre' && !e.model).map((e) => e.id);
    expect(bedroom).toEqual(BUILTIN_CATALOG.filter((e) => e.category === 'Chambre').map((e) => e.id));
  });
});

describe('filterCatalog', () => {
  it('searches names without accents', () => {
    const { items } = filterCatalog(ordered, 'refrigerateur', 'all');
    expect(items.some((e) => e.id === 'fridge')).toBe(true);
    expect(items.some((e) => e.model)).toBe(true);
    expect(items.every((e) => e.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('refrigerateur'))).toBe(true);
  });

  it('search shows at most 80 results', () => {
    const r = filterCatalog(ordered, 'a', 'all', SEARCH_LIMIT);
    expect(SEARCH_LIMIT).toBe(80);
    expect(r.items).toHaveLength(80);
    expect(r.total).toBeGreaterThan(80);
    expect(r.truncated).toBe(true);
    expect(filterCatalog(ordered, 'lit 140', 'all', SEARCH_LIMIT).truncated).toBe(false);
  });

  it('filters by style; the parametric entries count as simple', () => {
    const realistic = filterCatalog(ordered, '', 'realiste').items;
    expect(realistic.length).toBeGreaterThan(100);
    expect(realistic.every((e) => e.model?.style === 'realiste')).toBe(true);
    const simple = filterCatalog(ordered, '', 'simple').items;
    expect(simple.filter((e) => !e.model)).toHaveLength(BUILTIN_CATALOG.length);
    expect(simple.every((e) => styleOf(e) === 'simple')).toBe(true);
    expect(realistic.length + simple.length).toBe(CATALOG.length);
  });
});

describe('CatalogPanel', () => {
  const markup = renderToStaticMarkup(<CatalogPanel onPlace={() => {}} />);

  it('shows the icon of a downloaded model and the symbol of a parametric entry', () => {
    const model = ordered.find((e) => e.category === 'Chambre' && e.model)!;
    expect(markup).toMatch(new RegExp(`<img[^>]*src="/models/icons/${model.id}\\.webp"[^>]*loading="lazy"`));
    expect(markup).toContain('data-testid="catalog-item-catalog-bed-140"');
    expect(markup).toMatch(/<svg class="catalog-preview"/);
  });

  it('counts the objects of each category and offers the style filter', () => {
    const n = CATALOG.filter((e) => e.category === 'Chambre').length;
    expect(markup).toContain(`Chambre<span class="catalog-count">${n}</span>`);
    for (const s of ['all', 'simple', 'realiste']) expect(markup).toContain(`data-testid="catalog-style-${s}"`);
  });

  it('renders only the open categories', () => {
    const closed = ordered.find((e) => e.category === 'Extérieur')!;
    expect(markup).not.toContain(`catalog-item-catalog-${closed.id}"`);
  });
});
