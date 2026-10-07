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
