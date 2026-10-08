// Manual formatting on purpose: Intl output depends on the runtime locale data and may use nbsp.

function toFrench(fixed: string): string {
  const s = fixed.replace('.', ',');
  // never print "-0,00" or "-0"
  return /^-0(,0+)?$/.test(s) ? s.slice(1) : s;
}

/** 350 -> "3,50 m". Always 2 decimals, comma separator. */
export function formatLength(cm: number): string {
  return `${toFrench((cm / 100).toFixed(2))} m`;
}

/** 124000 -> "12,40 m2" (with the superscript two). */
export function formatArea(cm2: number): string {
  return `${toFrench((cm2 / 10000).toFixed(2))} m²`;
}

/** 83 -> "83 cm", 82.5 -> "82,5 cm" (max 1 decimal). */
export function formatCm(cm: number): string {
  const fixed = cm.toFixed(1).replace(/\.0$/, '');
  return `${toFrench(fixed)} cm`;
}

const INPUT_RE = /^(-?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(cm|m)?$/;

/**
 * Parses a keyboard length input into centimeters.
 * Accepts "350", "350,5", "350.5", " 350 cm ", "3,5 m". Returns null for anything
 * empty, malformed, non-finite, zero or negative.
 */
export function parseCmInput(text: string): number | null {
  const m = INPUT_RE.exec(text.trim().toLowerCase());
  if (!m) return null;
  const n = Number((m[1] as string).replace(',', '.'));
  const cm = m[2] === 'm' ? n * 100 : n;
  return Number.isFinite(cm) && cm > 0 ? cm : null;
}
