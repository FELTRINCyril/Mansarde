import { useEffect, useState, type JSX } from 'react';
import { useEditor } from '@/editor/store';

const TOAST_MS = 4000;

/** Shows the store's latest toast for a few seconds; a new toast (new id) restarts the timer. */
export function Toast(): JSX.Element | null {
  const toast = useEditor((s) => s.toast);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenId(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || hiddenId === toast.id) return null;
  return (
    <div className="toast" role="status" data-testid="toast" key={toast.id}>
      {toast.message}
    </div>
  );
}
