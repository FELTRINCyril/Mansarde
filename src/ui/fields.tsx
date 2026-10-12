import type { JSX, ReactNode } from 'react';

export function Section(p: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="panel-section">
      <h3 className="panel-title">{p.title}</h3>
      {p.children}
    </section>
  );
}

export function ReadOnly(p: { label: string; value: string; testId?: string }): JSX.Element {
  return (
    <div className="field field-wide">
      <span className="field-label">{p.label}</span>
      <span className="field-value" data-testid={p.testId}>
        {p.value}
      </span>
    </div>
  );
}

export function Choice<T extends string>(p: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange(v: T): void;
  testId?: string;
  /** Short label, wide list (option texts such as "Jusqu'au plafond"). */
  wide?: boolean;
  /** Label above a list of the full panel width (longest option texts, "Posé sur un meuble"). */
  block?: boolean;
}): JSX.Element {
  return (
    <label className={p.block ? 'field field-block' : p.wide ? 'field field-wide' : 'field'}>
      <span className="field-label">{p.label}</span>
      <select className="input" value={p.value} data-testid={p.testId} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

