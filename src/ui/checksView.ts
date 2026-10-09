import type { Check } from '@/core/checks/types';

/** Text of the header counter: "1 alerte", "3 alertes". */
export const alertCountLabel = (n: number): string => `${n} ${n === 1 ? 'alerte' : 'alertes'}`;

/** Rows of the checks panel: errors first, then warnings, each in rule order (a new array). */
export const orderChecks = (checks: readonly Check[]): Check[] => [
  ...checks.filter((c) => c.severity === 'error'),
  ...checks.filter((c) => c.severity !== 'error'),
];
