import { useEffect, useRef, type JSX } from 'react';
import { setObjectTransform, updateObject } from '@/core/commands/objects';
import { addCustomObject } from '@/core/commands/project';
import { objectShape } from '@/core/geometry/objects';
import { newId } from '@/core/model/ids';
import type { CustomObjectDef, Level, PlacedObject } from '@/core/model/types';
import { useEditor } from '@/editor/store';
import { getCatalogEntry } from '@/catalog/catalog';
import { ReadOnly, Section } from './fields';
import { run } from './run';
import { NumericInput, TextField } from './NumericInput';

/** Color input committed on the native "change" event (picker closed), not on every "input" while dragging. */
export function ColorField(p: { label: string; value: string; onCommit(v: string): void; testId?: string }): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const { onCommit } = p;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => onCommit(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [onCommit]);
  return (
    <label className="field">
      <span className="field-label">{p.label}</span>
      {/* uncontrolled: React would otherwise reset the value on every input event */}
      <input ref={ref} type="color" className="input input-color" key={p.value} defaultValue={p.value} data-testid={p.testId ?? 'object-color'} />
    </label>
  );
}

const NO_CUSTOM: Record<string, CustomObjectDef> = {};
const SHAPE_NAMES = { rect: 'Rectangle', circle: 'Cercle', lshape: 'Forme en L' } as const;

export function ObjectProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const customObjects = useEditor((s) => s.project?.customObjects ?? NO_CUSTOM);
  const o = level.objects[id];
  if (!o) return null;
  const update = (patch: Partial<Omit<PlacedObject, 'id' | 'source'>>) => run("Modifier l'objet", updateObject(level.id, id, patch));
  const shape = objectShape(o, customObjects);
  const kindName =
    o.source.kind === 'catalog'
      ? (getCatalogEntry(o.source.catalogId)?.name ?? 'Objet')
      : (customObjects[o.source.customObjectId]?.name ?? 'Mes objets');
  const savable = shape !== 'symbol' && o.source.kind === 'catalog';

  const saveAsCustom = () => {
    if (shape === 'symbol') return;
    const ok = run(
      'Enregistrer dans mes objets',
      addCustomObject({
        id: newId(),
        name: o.name,
        shape,
        width: o.width,
        depth: o.depth,
        height: o.height,
        color: o.color,
        lshape: shape === 'lshape' && o.lshape ? { ...o.lshape } : null,
        pose: o.pose,
      }),
    );
    if (ok) useEditor.getState().showToast(`"${o.name}" est enregistré dans Mes objets.`);
  };

  return (
    <Section title="Objet">
      <ReadOnly
        label="Modèle"
        // the shape is named only when it says something more ("Piano (Rectangle)", not "Rectangle (Rectangle)")
        value={shape === 'symbol' || kindName === SHAPE_NAMES[shape] ? kindName : `${kindName} (${SHAPE_NAMES[shape]})`}
        testId="object-model"
      />
      <TextField label="Nom" value={o.name} testId="object-name" onCommit={(name) => update({ name })} />
      <NumericInput label="Largeur" valueCm={o.width} testId="object-width" onCommit={(width) => update({ width })} />
      <NumericInput label="Profondeur" valueCm={o.depth} testId="object-depth" onCommit={(depth) => update({ depth })} />
      <NumericInput label="Hauteur" valueCm={o.height} testId="object-height" onCommit={(height) => update({ height })} />
      <NumericInput
        label="Hauteur de pose"
        kind="nonNegative"
        valueCm={o.elevation}
        testId="object-elevation"
        onCommit={(elevation) => update({ elevation })}
      />
      <NumericInput
        label="Rotation"
        kind="angle"
        valueCm={o.rotation}
        testId="object-rotation"
        onCommit={(rotation) => run("Tourner l'objet", setObjectTransform(level.id, id, { rotation }))}
      />
      <ColorField label="Couleur" value={o.color} onCommit={(color) => update({ color })} />
      <label className="field field-check">
        <input type="checkbox" checked={o.mirrored} data-testid="object-mirrored" onChange={(e) => update({ mirrored: e.target.checked })} />
        <span>Miroir</span>
      </label>
      {shape === 'lshape' && o.lshape && (
        <>
          <NumericInput
            label="Encoche : largeur"
            valueCm={o.lshape.notchWidth}
            testId="object-notch-width"
            onCommit={(notchWidth) => update({ lshape: { ...o.lshape!, notchWidth } })}
          />
          <NumericInput
            label="Encoche : profondeur"
            valueCm={o.lshape.notchDepth}
            testId="object-notch-depth"
            onCommit={(notchDepth) => update({ lshape: { ...o.lshape!, notchDepth } })}
          />
        </>
      )}
      {savable && (
        <button type="button" className="btn btn-block" data-testid="save-custom-object" onClick={saveAsCustom}>
          Enregistrer dans mes objets
        </button>
      )}
    </Section>
  );
}
