import { deriveVolumes, type DerivedLevel } from '../geometry/derived';
import type { CustomObjectDef, Id, Level } from '../model/types';
import { buildContext } from './context';
import { collisionChecks } from './rules/collisions';
import { cupboardClearanceChecks, cupboardHeightChecks, cupboardOpeningChecks } from './rules/cupboards';
import { doorSwingChecks } from './rules/doorSwing';
import { heightChecks } from './rules/height';
import { floatingChecks } from './rules/support';
import { wallOverlapChecks } from './rules/walls';
import type { Check, CheckSeverity } from './types';

interface Memo { derived: DerivedLevel; customObjects: Record<Id, CustomObjectDef>; checks: Check[] }
const memo = new WeakMap<Level, Memo>();

/**
 * The non-blocking checks of a level (spec 5.4), in rule order: height, cupboard top under its
 * plinth (ruling V2-R36), collisions, wall overlap,
 * door swing, cupboard in front of an opening, floating objects, cupboard clearance. Memoized by
 * the identity of the level and of customObjects (levels are immutable; `d` must be
 * deriveLevel(level), it is part of the key only as a safeguard). The returned array is shared:
 * do not mutate it.
 */
export function computeChecks(level: Level, d: DerivedLevel, customObjects: Record<Id, CustomObjectDef>): Check[] {
  const hit = memo.get(level);
  if (hit && hit.derived === d && hit.customObjects === customObjects) return hit.checks;
  const ctx = buildContext(level, d, deriveVolumes(level), customObjects);
  const checks = [
    ...heightChecks(ctx),
    ...cupboardHeightChecks(ctx),
    ...collisionChecks(ctx),
    ...wallOverlapChecks(ctx),
    ...doorSwingChecks(ctx),
    ...cupboardOpeningChecks(ctx),
    ...floatingChecks(ctx),
    ...cupboardClearanceChecks(ctx),
  ];
  memo.set(level, { derived: d, customObjects, checks });
  return checks;
}

/** Worst severity of the checks on each target, keyed `${kind}:${id}` (e.g. "object:<id>"). */
export function checkSeverityByTarget(checks: Check[]): Map<string, CheckSeverity> {
  const out = new Map<string, CheckSeverity>();
  for (const c of checks) {
    for (const t of c.targets) {
      const key = `${t.kind}:${t.id}`;
      if (c.severity === 'error' || !out.has(key)) out.set(key, c.severity);
    }
  }
  return out;
}
