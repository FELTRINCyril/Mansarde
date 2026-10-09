import type { JSX } from 'react';
import { manualDimLine } from '@/core/geometry/autoDimensions';
import { deriveVolumes, type DerivedLevel } from '@/core/geometry/derived';
import { objectFootprint, objectShape } from '@/core/geometry/objects';
import { openingCutRing } from '@/core/geometry/openings';
import type { CustomObjectDef, Id, Level, Ring } from '@/core/model/types';
import type { SelectionItem } from '@/editor/selection';
import { DimLineView } from '../DimLineView';
import { ringsPath } from '../path';
import { num, STYLE } from '../style';

/** Rings outlining a selected element; null when it does not exist (stale selection). */
function outline(item: SelectionItem, level: Level, derived: DerivedLevel, customObjects: Record<Id, CustomObjectDef>): Ring[] | null {
  switch (item.kind) {
    case 'wall': {
      const ring = derived.outlines.get(item.id);
      return ring ? [ring] : null;
    }
    case 'opening': {
      const o = level.openings[item.id];
      return o && level.walls[o.wallId] ? [openingCutRing(level, o)] : null;
    }
    case 'object': {
      const o = level.objects[item.id];
      return o ? [objectFootprint(o, objectShape(o, customObjects))] : null;
    }
    case 'room': {
      const room = derived.rooms.find((r) => r.key === item.id);
      return room ? [room.ring, ...room.islands] : null;
    }
    case 'slope': {
      const band = deriveVolumes(level).slopeBands.get(item.id);
      return band ? [band] : null;
    }
    case 'beam': {
      const ring = deriveVolumes(level).beamFootprints.get(item.id);
      return ring ? [ring] : null;
    }
    case 'cupboard': {
      const ring = deriveVolumes(level).cupboardFootprints.get(item.id);
      return ring ? [ring] : null;
    }
    default:
      return null;
  }
}

/** Highlight of the selected elements (screen only). */
export function SelectionLayer({
  selection,
  level,
  derived,
  customObjects,
  lineUnit,
}: {
  selection: SelectionItem[];
  level: Level;
  derived: DerivedLevel;
  customObjects: Record<Id, CustomObjectDef>;
  lineUnit: number;
}): JSX.Element | null {
  if (selection.length === 0) return null;
  const width = STYLE.selectionWidth * lineUnit;
  return (
    <g data-kind="selection" fill="none" stroke={STYLE.selection} strokeWidth={width} strokeLinejoin="round">
      {selection.map((item) => {
        const key = `${item.kind}-${item.id}`;
        if (item.kind === 'node') {
          const n = level.nodes[item.id];
          return n && <circle key={key} data-kind="selected-node" data-id={item.id} cx={num(n.x)} cy={num(n.y)} r={STYLE.selectionNodeRadius * lineUnit} fill={STYLE.paper} />;
        }
        if (item.kind === 'dimension') {
          const m = level.dimensions[item.id];
          const dim = m && manualDimLine(level, m);
          return dim && <DimLineView key={key} dim={dim} lineUnit={lineUnit} color={STYLE.selection} kind="selected-dimension" id={item.id} />;
        }
        const rings = outline(item, level, derived, customObjects);
        return rings && <path key={key} data-kind={`selected-${item.kind}`} data-id={item.id} d={ringsPath(rings)} fillRule="evenodd" />;
      })}
    </g>
  );
}
