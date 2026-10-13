import { useEffect, useMemo, useState, type JSX } from 'react';
import { Modal } from './ConfirmDialog';
import { groupCredits, LICENSE_URLS, type CreditGroup, type Credits } from './credits';

const loadCredits = async (): Promise<Credits> => (await import('@/catalog/generated/credits.json')).default as Credits;

const External = (p: { href: string; children: string }): JSX.Element => (
  <a href={p.href} target="_blank" rel="noreferrer">
    {p.children}
  </a>
);

/** Library, count and license; a double license links both texts. */
function GroupHead({ g }: { g: CreditGroup }): JSX.Element {
  const [first, second] = LICENSE_URLS[g.license] ?? (g.info ? [g.info.licenseUrl] : []);
  return (
    <summary>
      <strong>{g.library}</strong> : {g.rows.length} objets, licence {first ? <External href={first}>{g.license}</External> : g.license}
      {second && (
        <>
          {' '}
          (<External href={second}>texte de la CC-BY 3.0</External>)
        </>
      )}
    </summary>
  );
}

/** The credits, one collapsible group per library and license. */
export function CreditsList({ credits }: { credits: Credits }): JSX.Element {
  const groups = useMemo(() => groupCredits(credits), [credits]);
  return (
    <>
      {groups.map((g) => (
        <details key={g.key} className="credits-group" data-testid="credits-group">
          <GroupHead g={g} />
          {g.info && (
            <p className="credits-library" data-testid="credits-library">
              {g.info.attribution && (
                <>
                  Attribution : {g.info.attribution}.{' '}
                </>
              )}
              <External href={g.info.page}>Page de la bibliothèque</External>
              {g.info.notice && (
                <>
                  {' - '}
                  <External href={`${import.meta.env.BASE_URL}models/LICENSES/${g.info.notice}`}>notice de licence</External>
                </>
              )}
            </p>
          )}
          <ul className="credits-list">
            {g.rows.map((r) => (
              <li key={r.id}>
                {r.name}
                {r.author && <span className="credits-author"> par {r.author}</span>}
                {r.url && (
                  <>
                    {' '}
                    (<External href={r.url}>source</External>)
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}

/**
 * "Crédits des modèles 3D" (spec 2026-10-13, section 9): for each library its license, the
 * attribution that license requires, its notice and its page; then each model with its author.
 * Loaded when the dialog opens (the list stays out of the app bundle).
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
  return (
    <Modal title="Crédits des modèles 3D" onClose={p.onClose} testId="credits-dialog" wide>
      <div className="modal-body credits">
        <p>
          Les objets du catalogue marqués d'une icône viennent de bibliothèques libres. Merci à leurs auteurs. Pour Mansarde, chaque modèle a
          été converti au format glTF, simplifié et ses textures réduites ; il reste sous la licence de sa bibliothèque, et l'original se
          trouve sur la page de celle-ci.
        </p>
        {failed && <p className="hint">Les crédits n'ont pas pu être chargés.</p>}
        {!credits && !failed && <p className="hint">Chargement...</p>}
        {credits && <CreditsList credits={credits} />}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={p.onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
