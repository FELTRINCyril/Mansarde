const pad = (n: number): string => String(n).padStart(2, '0');

/** "modifié le 07/10/2026 14:30" in local time. */
export function formatModified(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'modifié le ?';
  return `modifié le ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
