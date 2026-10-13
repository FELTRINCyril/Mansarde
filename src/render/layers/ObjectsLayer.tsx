import { useEffect, useState, type JSX } from 'react';
import { getCatalogEntry, modelTopUrl } from '@/catalog/catalog';
import { GenericSymbol, SYMBOLS } from '@/catalog/symbols';
import { objectsInDrawOrder } from '@/core/geometry/objects';
import type { CustomObjectDef, Id, PlacedObject } from '@/core/model/types';
import { num, STYLE } from '../style';

/**
 * Top view of a downloaded model: the image rendered from the model seen from above (front at
 * the bottom, like the plan), stretched to the object's w x d like the model itself. On screen the
 * box shows while the image loads (the object is never invisible) and replaces it when it cannot
 * load, until the network comes back. `placeholder` false: the export, whose data URL is there.
 */
function ModelTop({ href, w, d, box, placeholder }: { href: string | undefined; w: number; d: number; box: JSX.Element; placeholder: boolean }): JSX.Element {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  useEffect(() => {
    if (state !== 'failed') return;
    const retry = () => setState('loading');
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [state]);
  if (!href || state === 'failed') return box;
  return (
    <>
      {placeholder && state === 'loading' && box}
      <image
        data-kind="model-top"
        href={href}
        x={num(-w / 2)}
        y={num(-d / 2)}
        width={num(w)}
        height={num(d)}
        preserveAspectRatio="none"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </>
  );
}

/**
 * The symbol of an object in its local frame (centered, back side -y). `modelImageUrls`: the
 * top views as data URLs (export); on screen they load from their URL.
 */
function ObjectSymbol({
  o,
  customObjects,
  lineUnit,
  modelImageUrls,
}: {
  o: PlacedObject;
  customObjects: Record<Id, CustomObjectDef>;
  lineUnit: number;
  modelImageUrls: Record<string, string> | undefined;
}): JSX.Element {
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
    const href = modelImageUrls ? modelImageUrls[entry.id] : modelTopUrl(entry.id, import.meta.env.BASE_URL);
    return <ModelTop href={href} w={o.width} d={o.depth} placeholder={!modelImageUrls} box={<GenericSymbol {...common} shape="rect" lshape={null} />} />;
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
  modelImageUrls,
}: {
  objects: Record<Id, PlacedObject>;
  customObjects: Record<Id, CustomObjectDef>;
  lineUnit: number;
  /** Export: the top views of the downloaded models as data URLs (a missing one draws the box). */
  modelImageUrls?: Record<string, string>;
}): JSX.Element {
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
          <ObjectSymbol o={o} customObjects={customObjects} lineUnit={lineUnit} modelImageUrls={modelImageUrls} />
        </g>
      ))}
    </g>
  );
}
