import { parseCmInput } from '@/core/model/format';

/** Upper bound of a typed length: 1 km (Ruling R5). */
export const MAX_NUMERIC_CM = 100000;

export type NumericResult = { ok: true; value: number } | { ok: false };

/** Interprets the text of a numeric field in cm; refuses empty, non-positive, malformed and absurdly large values. */
export function commitNumeric(text: string): NumericResult {
  const value = parseCmInput(text);
  if (value === null || value > MAX_NUMERIC_CM) return { ok: false };
  return { ok: true, value };
}

/**
 * What a numeric field accepts: positive lengths (sizes), lengths >= 0 (sill, laying height),
 * signed lengths (altitude, offset) and angles in degrees. Lengths use parseCmInput ("cm" / "m"),
 * every value is bounded by MAX_NUMERIC_CM in absolute value.
 */
export type NumericKind = 'positive' | 'nonNegative' | 'signed' | 'angle';

const ZERO_RE = /^(?:0+(?:[.,]0*)?|[.,]0+)\s*(?:cm|m)?$/i;
const ANGLE_RE = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)\s*°?$/;

export function commitNumericAs(text: string, kind: NumericKind): NumericResult {
  const t = text.trim();
  if (kind === 'positive') return commitNumeric(t);
  if (kind === 'angle') {
    if (!ANGLE_RE.test(t)) return { ok: false };
    const value = Number(t.replace('°', '').replace(',', '.').trim());
    return Number.isFinite(value) && Math.abs(value) <= MAX_NUMERIC_CM ? { ok: true, value: value + 0 } : { ok: false };
  }
  const negative = t.startsWith('-');
  const body = negative ? t.slice(1).trim() : t;
  if (ZERO_RE.test(body)) return { ok: true, value: 0 };
  if (negative && kind !== 'signed') return { ok: false };
  const r = commitNumeric(body);
  if (!r.ok) return r;
  return { ok: true, value: negative ? -r.value : r.value };
}

/** 350 -> "350", 82.46 -> "82,5": at most one decimal, comma separator (value shown in a numeric field). */
export function formatNumber(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r).replace('.', ',');
}
