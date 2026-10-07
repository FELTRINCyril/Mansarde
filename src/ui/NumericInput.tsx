import { useState, type JSX, type KeyboardEvent } from 'react';
import { commitNumericAs, formatNumber, type NumericKind } from './numeric';

/**
 * Numeric field of the properties panel. Commits on Enter or blur through commitNumericAs (lengths
 * via parseCmInput, R5 bound); an invalid text gets a red border and is never committed; Escape
 * reverts to the current value. The displayed value follows valueCm unless the user is typing.
 */
export function NumericInput(p: {
  label: string;
  valueCm: number;
  onCommit(v: number): void;
  testId?: string;
  kind?: NumericKind;
  unit?: string;
}): JSX.Element {
  const kind = p.kind ?? 'positive';
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (draft === null) return;
    const r = commitNumericAs(draft, kind);
    if (!r.ok) {
      setInvalid(true);
      return;
    }
    setDraft(null);
    setInvalid(false);
    if (r.value !== p.valueCm) p.onCommit(r.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
      setInvalid(false);
    }
  };
  return (
    <label className="field">
      <span className="field-label">{p.label}</span>
      <span className="field-control">
        <input
          className={invalid ? 'input input-num input-invalid' : 'input input-num'}
          inputMode="decimal"
          aria-invalid={invalid}
          data-testid={p.testId}
          value={draft ?? formatNumber(p.valueCm)}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className="field-unit">{p.unit ?? (kind === 'angle' ? '°' : 'cm')}</span>
      </span>
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
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
    </label>
  );
}
