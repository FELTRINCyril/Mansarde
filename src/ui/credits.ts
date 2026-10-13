import { getCatalogEntry } from '@/catalog/catalog';

/** A library of downloaded models, as tools/models/publish.ts writes it in generated/credits.json. */
export interface LibraryCredit {
  source: string;
  license: string;
  licenseUrl: string;
  /** Attribution the license of the library requires (from its notice). */
  attribution?: string;
  /** File of public/models/LICENSES: the notice shipped by the library. */
  notice?: string;
  page: string;
}

export interface ModelCredit {
  source: string;
  library: string;
  author: string;
  license: string;
  url?: string;
}

export interface Credits {
  libraries: Record<string, LibraryCredit>;
  models: Record<string, ModelCredit>;
}

/** Official text of each license; the double license links both. */
export const LICENSE_URLS: Record<string, string[]> = {
  CC0: ['https://creativecommons.org/publicdomain/zero/1.0/deed.fr'],
  'CC-BY 3.0': ['https://creativecommons.org/licenses/by/3.0/deed.fr'],
  'CC-BY 3.0 US': ['https://creativecommons.org/licenses/by/3.0/us/'],
  'Free Art License 1.3': ['https://artlibre.org/licence/lal/'],
  'Free Art License 1.3 / CC-BY 3.0': ['https://artlibre.org/licence/lal/', 'https://creativecommons.org/licenses/by/3.0/deed.fr'],
};

export interface CreditGroup {
  key: string;
  library: string;
  info: LibraryCredit | undefined;
  license: string;
  rows: Array<{ id: string; name: string; author: string; url?: string }>;
}

/** Credits grouped by library and license (largest first), models sorted by name. */
export function groupCredits(credits: Credits): CreditGroup[] {
  const groups = new Map<string, CreditGroup>();
  for (const [id, c] of Object.entries(credits.models)) {
    const key = `${c.library}|${c.license}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, library: c.library, info: credits.libraries[c.library], license: c.license, rows: [] };
      groups.set(key, g);
    }
    g.rows.push({ id, name: getCatalogEntry(id)?.name ?? id, author: c.author, ...(c.url ? { url: c.url } : {}) });
  }
  const out = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || a.library.localeCompare(b.library));
  for (const g of out) g.rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return out;
}
