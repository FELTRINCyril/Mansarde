import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '@/catalog/catalog';
import data from '@/catalog/generated/credits.json';
import { CreditsDialog, CreditsList } from '@/ui/CreditsDialog';
import { groupCredits, LICENSE_URLS, type Credits } from '@/ui/credits';

const credits = data as Credits;

describe('groupCredits', () => {
  it('lists every model once, grouped by library and license, sorted by name', () => {
    const groups = groupCredits(credits);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids.sort()).toEqual(Object.keys(credits.models).sort());
    for (const g of groups) {
      for (const r of g.rows) expect(credits.models[r.id]).toMatchObject({ library: g.library, license: g.license });
      const names = g.rows.map((r) => r.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    }
  });

  it('names a model by its catalog name', () => {
    const model = CATALOG.find((e) => e.model)!;
    const row = groupCredits(credits).flatMap((g) => g.rows).find((r) => r.id === model.id)!;
    expect(row.name).toBe(model.name);
  });

  it('describes every library: license text, page, notice shipped with the app', () => {
    for (const g of groupCredits(credits)) {
      expect(g.info, g.library).toBeDefined();
      expect(LICENSE_URLS[g.license], g.license).toBeDefined();
      if (g.info!.notice) expect(readFileSync(`public/models/LICENSES/${g.info!.notice}`, 'utf8').length, g.info!.notice).toBeGreaterThan(100);
    }
  });

  it('gives the attribution each CC-BY notice requires', () => {
    const lib = (name: string) => credits.libraries[name]!;
    // Scopia's notice: attribute to Space Mushrooms and Scopia Visual Interfaces Systems
    expect(readFileSync('public/models/LICENSES/sweethome3d-scopia.txt', 'utf8')).toContain('Scopia Visual Interfaces Systems');
    expect(lib('Scopia').attribution).toContain('Space Mushrooms');
    expect(lib('Scopia').attribution).toContain('Scopia Visual Interfaces Systems');
    // KatorLegaz: CC-BY 3.0 United States, copyright Andrew Kator & Jennifer Legaz
    expect(readFileSync('public/models/LICENSES/sweethome3d-katorlegaz.txt', 'utf8')).toContain('3.0 United States');
    expect(lib('KatorLegaz')).toMatchObject({ license: 'CC-BY 3.0 US' });
    expect(lib('KatorLegaz').attribution).toContain('Andrew Kator & Jennifer Legaz');
    for (const [id, c] of Object.entries(credits.models)) if (c.library === 'KatorLegaz') expect(c.license, id).toBe('CC-BY 3.0 US');
    // attribution licenses without a library attribution credit each model's author
    for (const g of groupCredits(credits)) {
      if (g.license === 'CC0' || g.info?.attribution) continue;
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

  it('renders each library with its license link, attribution and notice', () => {
    const html = renderToStaticMarkup(<CreditsList credits={credits} />);
    expect(html.match(/data-testid="credits-group"/g)).toHaveLength(groupCredits(credits).length);
    expect(html).toContain('href="https://creativecommons.org/licenses/by/3.0/us/"');
    expect(html).toContain('Attribution : Space Mushrooms &lt;info@sweethome3d.com&gt; et Scopia Visual Interfaces Systems');
    expect(html).toContain('href="/models/LICENSES/sweethome3d-scopia.txt"');
    expect(html).toContain('texte de la CC-BY 3.0');
  });
});
