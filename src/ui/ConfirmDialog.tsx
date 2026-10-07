import { useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react';

/**
 * Modal frame: Escape or a click on the backdrop closes it. The Escape listener runs in the bubble
 * phase and skips events already handled (preventDefault) by a field, e.g. a NumericInput revert.
 */
export function Modal(p: { title: string; onClose(): void; children: ReactNode; testId?: string; wide?: boolean }): JSX.Element {
  const titleId = useId();
  const { onClose } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={p.wide ? 'modal modal-wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={p.testId}
      >
        <h2 id={titleId} className="modal-title">
          {p.title}
        </h2>
        {p.children}
      </div>
    </div>
  );
}

export function ConfirmDialog(p: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return (
    <Modal title={p.title} onClose={p.onCancel} testId="confirm-dialog">
      <div className="modal-body">{p.message}</div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={p.onCancel}>
          Annuler
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={p.danger ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={p.onConfirm}
        >
          {p.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Asks for a text (a name); confirm is disabled while the text is blank. */
export function PromptDialog(p: {
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onConfirm(value: string): void;
  onCancel(): void;
}): JSX.Element {
  const [value, setValue] = useState(p.initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);
  const blank = value.trim() === '';
  return (
    <Modal title={p.title} onClose={p.onCancel} testId="prompt-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!blank) p.onConfirm(value.trim());
        }}
      >
        <label className="field field-block">
          <span className="field-label">{p.label}</span>
          <input ref={inputRef} className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={p.onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={blank}>
            {p.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
