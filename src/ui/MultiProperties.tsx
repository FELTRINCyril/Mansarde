import type { JSX } from 'react';
import { setWallHeight, setWallThickness } from '@/core/commands/walls';
import type { Level, PlacedObject } from '@/core/model/types';
import type { SelectionItem } from '@/editor/selection';
import { Section } from './fields';
import { updateObjectsRecipe, type ObjectPatch } from './multiEdit';
import { NumericInput } from './NumericInput';
import { ColorField } from './ObjectProperties';
import { run } from './run';

/** The shared value of a property, or null when the items differ. */
function common<T, V>(items: T[], get: (t: T) => V): V | null {
  const first = get(items[0]!);
  return items.every((t) => get(t) === first) ? first : null;
}

/**
 * Count of a multiple selection, plus the properties shared by its items (spec 7.2): thickness and
 * height when only walls are selected, height, laying height and color when only objects are.
 */
export function MultiProperties({ level, selection }: { level: Level; selection: SelectionItem[] }): JSX.Element {
  const ids = selection.map((i) => i.id);
  const walls = selection.every((i) => i.kind === 'wall') ? ids.flatMap((id) => level.walls[id] ?? []) : [];
  const objects = selection.every((i) => i.kind === 'object') ? ids.flatMap((id) => level.objects[id] ?? []) : [];
  return (
    <Section title="Sélection">
      <p className="panel-text" data-testid="selection-count">
        {selection.length} éléments sélectionnés
      </p>
      {walls.length > 1 && <WallsFields level={level} walls={walls} />}
      {objects.length > 1 && <ObjectsFields level={level} objects={objects} />}
    </Section>
  );
}

function WallsFields({ level, walls }: { level: Level; walls: Level['walls'][string][] }): JSX.Element {
  const ids = walls.map((w) => w.id);
  const thickness = common(walls, (w) => w.thickness);
  const height = common(walls, (w) => w.height);
  return (
    <>
      <NumericInput
        label="Épaisseur"
        valueCm={thickness ?? 0}
        mixed={thickness === null}
        testId="walls-thickness"
        onCommit={(v) => run('Épaisseur des murs', setWallThickness(level.id, ids, v))}
      />
      <NumericInput
        label="Hauteur"
        valueCm={height ?? 0}
        mixed={height === null}
        testId="walls-height"
        onCommit={(v) => run('Hauteur des murs', setWallHeight(level.id, ids, v))}
      />
    </>
  );
}

function ObjectsFields({ level, objects }: { level: Level; objects: PlacedObject[] }): JSX.Element {
  const ids = objects.map((o) => o.id);
  const update = (label: string, patch: ObjectPatch) => run(label, updateObjectsRecipe(level.id, ids, patch));
  const height = common(objects, (o) => o.height);
  const elevation = common(objects, (o) => o.elevation);
  const color = common(objects, (o) => o.color);
  return (
    <>
      <NumericInput
        label="Hauteur"
        valueCm={height ?? 0}
        mixed={height === null}
        testId="objects-height"
        onCommit={(v) => update('Hauteur des objets', { height: v })}
      />
      <NumericInput
        label="Hauteur de pose"
        kind="nonNegative"
        valueCm={elevation ?? 0}
        mixed={elevation === null}
        testId="objects-elevation"
        onCommit={(v) => update('Hauteur de pose des objets', { elevation: v })}
      />
      <ColorField
        label="Couleur"
        value={color ?? objects[0]!.color}
        testId="objects-color"
        onCommit={(v) => update('Couleur des objets', { color: v })}
      />
    </>
  );
}
