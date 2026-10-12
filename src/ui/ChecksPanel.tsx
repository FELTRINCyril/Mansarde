import { memo, useContext, useMemo, type JSX } from 'react';
import { computeChecks } from '@/core/checks/computeChecks';
import type { Check } from '@/core/checks/types';
import { deriveLevel } from '@/core/geometry/derived';
import { focusCheck } from '@/editor/checkTargets';
import { activeLevel, useEditor } from '@/editor/store';
import { alertCountLabel, MAX_CHECK_ROWS, moreChecksLabel, orderChecks } from './checksView';
import { PlanViewportContext } from './planViewport';

const NO_CHECKS: Check[] = [];

/**
 * The checks of the active level (spec 5.4), recomputed when the level changes. computeChecks is
 * memoized on the identity of the level and of customObjects: the project's own record is passed
 * as is (never a fresh `{}`), so the cache hits on every render.
 */
export function useLevelChecks(): Check[] {
  const level = useEditor(activeLevel);
  const customObjects = useEditor((s) => s.project?.customObjects);
  if (!level || !customObjects) return NO_CHECKS;
  return computeChecks(level, deriveLevel(level), customObjects);
}

const severityClass = (checks: readonly Check[]): string => (checks.some((c) => c.severity === 'error') ? 'error' : 'warning');

/** Header counter "N alertes" (nothing without alert); a click opens the checks panel. */
export function AlertCounter(): JSX.Element | null {
  const checks = useLevelChecks();
  const setDisplay = useEditor((s) => s.setDisplay);
  if (checks.length === 0) return null;
  return (
    <button
      type="button"
      className={`btn alert-counter alert-counter-${severityClass(checks)}`}
      data-testid="alert-counter"
      title="Afficher les vérifications"
      onClick={() => setDisplay({ checksOpen: true })}
    >
      {alertCountLabel(checks.length)}
    </button>
  );
}

/** Same rule, same targets (stable id), same text: the row would render the same. */
const sameRow = (a: { check: Check }, b: { check: Check }): boolean =>
  a.check.id === b.check.id && a.check.message === b.check.message && a.check.severity === b.check.severity;

/**
 * One alert. Memoized on what it shows: during a gesture computeChecks returns new Check objects
 * every frame, but the rows whose alert did not change are not rendered again. A click uses the
 * row's check, whose targets are the same as the current one's (same id).
 */
const CheckRow = memo(function CheckRow({ check, onFocus }: { check: Check; onFocus(c: Check): void }): JSX.Element {
  const label = check.severity === 'error' ? 'Erreur' : 'Avertissement';
  return (
    <li>
      <button type="button" className="check-row" data-testid="check-row" data-severity={check.severity} onClick={() => onFocus(check)}>
        <span className={`check-mark check-mark-${check.severity}`} role="img" aria-label={label} title={label}>
          !
        </span>
        <span className="check-message">{check.message}</span>
      </button>
    </li>
  );
}, sameRow);

/**
 * Checks panel (spec 7.4), collapsible: one row per alert (red mark for an error, orange for a
 * warning), errors first, at most MAX_CHECK_ROWS rows then "N autres alertes", in a list of
 * bounded height that scrolls (the properties stay in view); a click selects the elements of the
 * alert and centers the plan on them; "Masquer les alertes" removes the outlines from the plan
 * (the list and the counter stay).
 */
export function ChecksPanel(): JSX.Element {
  const checks = useLevelChecks();
  const open = useEditor((s) => s.display.checksOpen);
  const hide = useEditor((s) => s.display.hideAlerts);
  const setDisplay = useEditor((s) => s.setDisplay);
  const viewport = useContext(PlanViewportContext);
  const onFocus = useMemo(() => (c: Check) => focusCheck(useEditor, c, viewport()), [viewport]);
  const ordered = useMemo(() => (open ? orderChecks(checks) : NO_CHECKS), [open, checks]);
  const shown = ordered.length > MAX_CHECK_ROWS ? ordered.slice(0, MAX_CHECK_ROWS) : ordered;
  return (
    <section className="panel-section checks-panel" data-testid="checks-panel">
      <button
        type="button"
        className="checks-toggle"
        aria-expanded={open}
        data-testid="checks-toggle"
        onClick={() => setDisplay({ checksOpen: !open })}
      >
        <span className="panel-title">Vérifications</span>
        {checks.length > 0 && <span className={`checks-badge checks-badge-${severityClass(checks)}`}>{checks.length}</span>}
        <span className="checks-caret" aria-hidden="true">
          {open ? '-' : '+'}
        </span>
      </button>
      {open && (
        <>
          {checks.length === 0 ? (
            <p className="panel-hint" data-testid="checks-empty">
              Aucune alerte.
            </p>
          ) : (
            <ul className="checks-list" data-testid="checks-list">
              {shown.map((c) => (
                <CheckRow key={c.id} check={c} onFocus={onFocus} />
              ))}
              {ordered.length > shown.length && (
                <li className="checks-more" data-testid="checks-more">
                  {moreChecksLabel(ordered.length - shown.length)}
                </li>
              )}
            </ul>
          )}
          <label className="field-check checks-hide">
            <input type="checkbox" checked={hide} data-testid="hide-alerts" onChange={(e) => setDisplay({ hideAlerts: e.target.checked })} />
            <span>Masquer les alertes</span>
          </label>
        </>
      )}
    </section>
  );
}
