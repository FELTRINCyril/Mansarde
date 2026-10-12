import type { JSX } from 'react';
import type { CheckSeverity } from '@/core/checks/types';
import type { DerivedVolumes } from '@/core/geometry/derived';
import { objectFootprint, objectShape } from '@/core/geometry/objects';
import { openingCutRing } from '@/core/geometry/openings';
import type { CustomObjectDef, Id, Level, Ring } from '@/core/model/types';
import { ringsPath } from '../path';
import { STYLE } from '../style';

/**
 * Outline of the element of an alert key (`${kind}:${id}`, as checkSeverityByTarget makes them),
 * or null when the element is gone (stale alerts) or of an unknown kind.
 */
function alertRing(key: string, level: Level, volumes: DerivedVolumes, customObjects: Record<Id, CustomObjectDef>): Ring | null {
  const sep = key.indexOf(':');
  if (sep < 0) return null;
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  switch (kind) {
    case 'object': {
      const o = Object.hasOwn(level.objects, id) ? level.objects[id]! : null;
      return o && objectFootprint(o, objectShape(o, customObjects));
    }
    case 'cupboard':
      return volumes.cupboardFootprints.get(id) ?? null;
    case 'opening': {
      const o = Object.hasOwn(level.openings, id) ? level.openings[id]! : null;
      return o && level.walls[o.wallId] ? openingCutRing(level, o) : null;
    }
    default:
      return null;
  }
}

/**
 * Check alerts (spec 7.3, screen only): a red (error) or orange (warning) outline around the
 * footprint of every element in alert. Errors are drawn last, over the warnings. The selection is
 * drawn over this layer on the same outline: for a selected element (`selected`, keys like the
 * alerts) the alert line is widened by the selection line plus its own width, so that it still
 * shows on both sides of the selection line.
 */
export function AlertsLayer({
  alerts,
  selected,
  level,
  volumes,
  customObjects,
  lineUnit,
}: {
  alerts: ReadonlyMap<string, CheckSeverity>;
  selected: ReadonlySet<string>;
  level: Level;
  volumes: DerivedVolumes;
  customObjects: Record<Id, CustomObjectDef>;
  lineUnit: number;
}): JSX.Element | null {
  if (alerts.size === 0) return null;
  const entries = [...alerts].sort(([, a], [, b]) => (a === b ? 0 : a === 'warning' ? -1 : 1));
  return (
    <g data-kind="alerts" fill="none" strokeLinejoin="round">
      {entries.map(([key, severity]) => {
        const ring = alertRing(key, level, volumes, customObjects);
        return (
          ring && (
            <path
              key={key}
              data-kind="alert"
              data-id={key}
              data-severity={severity}
              d={ringsPath([ring])}
              stroke={severity === 'error' ? STYLE.alertError : STYLE.alertWarning}
              strokeWidth={(selected.has(key) ? 2 * STYLE.alertWidth + STYLE.selectionWidth : STYLE.alertWidth) * lineUnit}
            />
          )
        );
      })}
    </g>
  );
}
