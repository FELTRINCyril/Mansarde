import type { JSX, ReactNode } from 'react';

/** Full-width message strip. Error banners stay until closed (or until their cause disappears). */
export function Banner(p: {
  kind: 'error' | 'info';
  children: ReactNode;
  action?: { label: string; onClick(): void };
  onClose?(): void;
  testId?: string;
}): JSX.Element {
  return (
    <div className={`banner banner-${p.kind}`} role={p.kind === 'error' ? 'alert' : 'status'} data-testid={p.testId}>
      <div className="banner-text">{p.children}</div>
      {p.action && (
        <button type="button" className="btn btn-small" onClick={p.action.onClick}>
          {p.action.label}
        </button>
      )}
      {p.onClose && (
        <button type="button" className="btn btn-small btn-ghost" onClick={p.onClose}>
          Fermer
        </button>
      )}
    </div>
  );
}
