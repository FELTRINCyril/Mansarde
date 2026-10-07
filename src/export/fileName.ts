const MAX_LENGTH = 80;
// Forbidden file name characters and ASCII control characters (0x00-0x1f, 0x7f).
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;

/**
 * Makes a string safe to use as a file name: each forbidden character (/ \ : * ? " < > | and control
 * characters) becomes "-", runs of spaces are compacted, the result is trimmed and cut to 80
 * characters. Accents and apostrophes are kept. Returns "plan" when nothing is left.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(FORBIDDEN, '-').replace(/ {2,}/g, ' ').trim().slice(0, MAX_LENGTH).trim();
  return cleaned === '' ? 'plan' : cleaned;
}

/**
 * "<project> - <level>.<ext>", sanitized. An empty level name (json export of the whole project)
 * gives "<project>.<ext>".
 */
export function exportFileName(projectName: string, levelName: string, ext: 'pdf' | 'png' | 'json'): string {
  const base = levelName.trim() === '' ? projectName : `${projectName} - ${levelName}`;
  return `${sanitizeFileName(base)}.${ext}`;
}
