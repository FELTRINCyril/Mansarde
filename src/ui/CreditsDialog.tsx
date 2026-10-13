import { useEffect, useMemo, useState, type JSX } from 'react';
import { getCatalogEntry } from '@/catalog/catalog';
import { Modal } from './ConfirmDialog';

export interface ModelCredit {
  source: string;
  library: string;
  author: string;
  license: string;
  url?: string;
}
export type Credits = Record<string, ModelCredit>;

/** Official text of each license the catalog accepts (a copy ships in public/models/LICENSES). */
const LICENSE_URLS: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr',
  'CC-BY 3.0': 'https://creativecommons.org/licenses/by/3.0/deed.fr',
  'Free Art License 1.3': 'https://artlibre.org/licence/lal/',
  'Free Art License 1.3 / CC-BY 3.0': 'https://artlibre.org/licence/lal/',
};

const loadCredits = async (): Promise<Credits> => (await import('@/catalog/generated/credits.json')).default as Credits;

interface Group {
  key: string;
  library: string;
  license: string;
  rows: Array<{ id: string; name: string; author: string; url?: string }>;
}

/** Credits grouped by library and license, models sorted by name. */
export function groupCredits(credits: Credits): Group[] {
  const groups = new Map<string, Group>();
  for (const [id, c] of Object.entries(credits)) {
    const key = `${c.library}|${c.license}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, library: c.library, license: c.license, rows: [] };
      groups.set(key, g);
    }
    g.rows.push({ id, name: getCatalogEntry(id)?.name ?? id, author: c.author, ...(c.url ? { url: c.url } : {}) });
  }
  const out = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || a.library.localeCompare(b.library));
  for (const g of out) g.rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return out;
}

/**
 * "Crédits des modèles 3D" (spec 2026-10-13, section 9): the authors and licenses of the
 * downloaded models, loaded when the dialog opens (the list stays out of the app bundle).
 */
export function CreditsDialog(p: { onClose(): void; load?: () => Promise<Credits> }): JSX.Element {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [failed, setFailed] = useState(false);
  const load = p.load ?? loadCredits;
  useEffect(() => {
    let live = true;
    load().then(
      (c) => live && setCredits(c),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [load]);
  const groups = useMemo(() => (credits ? groupCredits(credits) : []), [credits]);
  return (
    <Modal title="Crédits des modèles 3D" onClose={p.onClose} testId="credits-dialog" wide>
      <div className="modal-body credits">
        <p>
          Les objets du catalogue marqués d'une icône viennent de bibliothèques libres. Merci à leurs auteurs. Chaque modèle reste sous sa
          licence d'origine ; les textes des licences sont dans le dossier <code>models/LICENSES</code> de l'application.
        </p>
        {failed && <p className="hint">Les crédits n'ont pas pu être chargés.</p>}
        {!credits && !failed && <p className="hint">Chargement...</p>}
        {groups.map((g) => (
          <details key={g.key} className="credits-group" data-testid="credits-group">
            <summary>
              <strong>{g.library}</strong> : {g.rows.length} objets, licence{' '}
              {LICENSE_URLS[g.license] ? (
                <a href={LICENSE_URLS[g.license]} target="_blank" rel="noreferrer">
                  {g.license}
                </a>
              ) : (
                g.license
              )}
            </summary>
            <ul className="credits-list">
              {g.rows.map((r) => (
                <li key={r.id}>
                  {r.name}
                  {r.author && <span className="credits-author"> par {r.author}</span>}
                  {r.url && (
                    <>
                      {' '}
                      (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        source
                      </a>
                      )
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={p.onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
