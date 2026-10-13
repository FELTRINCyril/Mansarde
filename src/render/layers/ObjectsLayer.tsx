import type { JSX } from 'react';
import { getCatalogEntry } from '@/catalog/catalog';
import { GenericSymbol, ModelSymbol, SYMBOLS } from '@/catalog/symbols';
import { objectsInDrawOrder } from '@/core/geometry/objects';
import type { CustomObjectDef, Id, PlacedObject } from '@/core/model/types';
import { modelOutline, showsModels, useModelOutlines } from '../modelOutlines';
import { num, STYLE } from '../style';

/** The symbol of an object in its local frame (centered, back side -y). */
function ObjectSymbol({ o, customObjects, lineUnit }: { o: PlacedObject; customObjects: Record<Id, CustomObjectDef>; lineUnit: number }): JSX.Element {
  const common = {
    w: o.width,
    d: o.depth,
    lineUnit: STYLE.objectLine * lineUnit,
    stroke: STYLE.objectStroke,
    fill: o.color,
    rotation: o.rotation,
    mirrored: o.mirrored,
  };
  if (o.source.kind === 'custom') {
    const def = customObjects[o.source.customObjectId];
    // ruling R22: the placed object's lshape is the only source of the notch (copied from the
    // definition at placement), exactly like objectFootprint (hit test, selection)
    return <GenericSymbol {...common} shape={def?.shape ?? 'rect'} lshape={o.lshape} />;
  }
  const Sym = SYMBOLS[o.source.catalogId];
  if (Sym) return <Sym {...common} />;
  const entry = getCatalogEntry(o.source.catalogId);
  if (entry?.model) {
    // a downloaded model: its top view once loaded (modelOutlines.ts), its box until then
    const top = modelOutline(entry.id);
    if (top) return <ModelSymbol {...common} top={top} />;
    return <GenericSymbol {...common} shape="rect" lshape={null} />;
  }
  const shape = entry && entry.shape !== 'symbol' ? entry.shape : 'rect'; // unknown id: plain rectangle
  return <GenericSymbol {...common} shape={shape} lshape={o.lshape} />;
}

/**
 * Furniture in drawing order (objectsInDrawOrder: rugs first, then record order; last = on top,
 * like hitTest). Fill = object color at 35 % opacity.
 */
export function ObjectsLayer({
  objects,
  customObjects,
  lineUnit,
}: {
  objects: Record<Id, PlacedObject>;
  customObjects: Record<Id, CustomObjectDef>;
  lineUnit: number;
}): JSX.Element {
  // re-render when the top views of the downloaded models arrive
  useModelOutlines(showsModels(Object.values(objects)));
  return (
    <g data-kind="objects">
      {objectsInDrawOrder(objects).map((o) => (
        <g
          key={o.id}
          data-kind="object"
          data-id={o.id}
          transform={`translate(${num(o.x)} ${num(o.y)}) rotate(${num(o.rotation)}) scale(${o.mirrored ? -1 : 1} 1)`}
          fillOpacity={STYLE.objectFillOpacity}
        >
          <ObjectSymbol o={o} customObjects={customObjects} lineUnit={lineUnit} />
        </g>
      ))}
    </g>
  );
}
