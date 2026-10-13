import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '@/catalog/catalog';
import credits from '@/catalog/generated/credits.json';
import { CreditsDialog, groupCredits, type Credits } from '@/ui/CreditsDialog';

const all = credits as Credits;

describe('groupCredits', () => {
  it('lists every model once, grouped by library and license, sorted by name', () => {
    const groups = groupCredits(all);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids.sort()).toEqual(Object.keys(all).sort());
    for (const g of groups) {
      for (const r of g.rows) expect(all[r.id]).toMatchObject({ library: g.library, license: g.license });
      const names = g.rows.map((r) => r.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    }
  });

  it('names a model by its catalog name', () => {
    const model = CATALOG.find((e) => e.model)!;
    const row = groupCredits(all).flatMap((g) => g.rows).find((r) => r.id === model.id)!;
    expect(row.name).toBe(model.name);
  });

  it('credits the attribution licenses with an author', () => {
    for (const g of groupCredits(all)) {
      if (g.license === 'CC0') continue;
      for (const r of g.rows) expect(r.author.trim(), r.id).not.toBe('');
    }
  });
});

describe('CreditsDialog', () => {
  it('shows a loading state before the credits arrive', () => {
    const html = renderToStaticMarkup(<CreditsDialog onClose={() => {}} load={() => new Promise(() => {})} />);
    expect(html).toContain('Crédits des modèles 3D');
    expect(html).toContain('Chargement...');
  });
});
