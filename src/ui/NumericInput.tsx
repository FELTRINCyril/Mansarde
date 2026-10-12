import { useId, useState, type JSX, type KeyboardEvent } from 'react';
import { commitNumericAs, formatNumber, type NumericKind } from './numeric';

/** Short hint under a numeric field whose text cannot be read (empty, 0 for a size, negative, letters). */
export const INVALID_VALUE = 'Valeur invalide';

/**
 * Numeric field of the properties panel. Commits on Enter or blur through commitNumericAs (lengths
 * via parseCmInput, R5 bound); an invalid text gets a red border and the hint "Valeur invalide",
 * and is never committed; Escape reverts to the current value (and calls onRevert). The displayed
 * value follows valueCm unless the user is typing. `mixed` (multiple selection with different
 * values) shows an empty field; any valid value is committed.
 * `keepRefused`: when onCommit returns false (the command was refused), the typed text stays in the
 * field with the red border, to correct it or revert it with Escape; it is submitted only once (the
 * blur that follows an Enter does not run the command again), until `resetKey` changes (e.g. the
 * level: an undo or another edit makes the refusal stale). `describedBy`: id of a message about the
 * field shown elsewhere (aria-describedby; the "Valeur invalide" hint takes its place while shown).
 */
export function NumericInput(p: {
  label: string;
  valueCm: number;
  onCommit(v: number): void | boolean;
  onRevert?(): void;
  testId?: string;
  kind?: NumericKind;
  unit?: string;
  mixed?: boolean;
  keepRefused?: boolean;
  resetKey?: unknown;
  describedBy?: string;
}): JSX.Element {
  const kind = p.kind ?? 'positive';
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<'ok' | 'invalid' | 'refused'>('ok');
  const errorId = useId();
  // a refused text is dropped when resetKey changes (state adjusted during render)
  const [seenKey, setSeenKey] = useState(p.resetKey);
  if (seenKey !== p.resetKey) {
    setSeenKey(p.resetKey);
    if (status === 'refused') {
      setDraft(null);
      setStatus('ok');
    }
  }

  const commit = () => {
    if (draft === null || status === 'refused') return;
    const r = commitNumericAs(draft, kind);
    if (!r.ok) {
      setStatus('invalid');
      return;
    }
    const accepted = p.mixed || r.value !== p.valueCm ? p.onCommit(r.value) : true;
    if (p.keepRefused && accepted === false) {
      setStatus('refused');
      return;
    }
    setDraft(null);
    setStatus('ok');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape' && draft !== null) {
      // handled: a dialog around the field stays open; a second Escape (nothing to revert) closes it
      e.preventDefault();
      setDraft(null);
      setStatus('ok');
      p.onRevert?.();
    }
  };
  const red = status !== 'ok';
  return (
    <label className="field">
      <span className="field-label">{p.label}</span>
      <span className="field-control">
        <input
          className={red ? 'input input-num input-invalid' : 'input input-num'}
          inputMode="decimal"
          aria-invalid={red}
          aria-describedby={status === 'invalid' ? errorId : p.describedBy}
          data-testid={p.testId}
          placeholder={p.mixed ? 'Différentes' : undefined}
          value={draft ?? (p.mixed ? '' : formatNumber(p.valueCm))}
          onChange={(e) => {
            setDraft(e.target.value);
            setStatus('ok');
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className="field-unit">{p.unit ?? (kind === 'angle' ? '°' : 'cm')}</span>
      </span>
      {status === 'invalid' && (
        <span className="field-error" id={errorId} data-testid={p.testId ? `${p.testId}-error` : undefined}>
          {INVALID_VALUE}
        </span>
      )}
    </label>
  );
}

/** Text field committed on Enter or blur (trimmed); Escape reverts. A blank text is refused unless allowBlank. */
export function TextField(p: {
  label: string;
  value: string;
  onCommit(v: string): void;
  testId?: string;
  allowBlank?: boolean;
  placeholder?: string;
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim();
    setDraft(null);
    if (v === p.value || (v === '' && !p.allowBlank)) return;
    p.onCommit(v);
  };
  return (
    <label className="field field-wide">
      <span className="field-label">{p.label}</span>
      <input
        className="input"
        data-testid={p.testId}
        placeholder={p.placeholder}
        value={draft ?? p.value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && draft !== null) {
            e.preventDefault();
            setDraft(null);
          }
        }}
      />
    </label>
  );
}
