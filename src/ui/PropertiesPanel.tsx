import { useState, type JSX } from 'react';
import { setDimensionOffset } from '@/core/commands/dimensions';
import { renameLevel, setLevelProps } from '@/core/commands/levels';
import { updateOpening } from '@/core/commands/openings';
import { setWallHeight, setWallLength, setWallThickness } from '@/core/commands/walls';
import { manualDimLine } from '@/core/geometry/autoDimensions';
import { deriveLevel } from '@/core/geometry/derived';
import { OPENING_DEFAULTS } from '@/core/model/defaults';
import { formatArea, formatLength } from '@/core/model/format';
import type { Level, OpeningKind, OpeningVariant } from '@/core/model/types';
import { deletableCount } from '@/editor/deleteSelection';
import { deleteSelection } from '@/editor/keyboard';
import { renameRoomAt } from '@/editor/renameRoom';
import type { SelectionItem } from '@/editor/selection';
import { activeLevel, useEditor } from '@/editor/store';
import { NumericInput, TextField } from './NumericInput';
import { Choice, ReadOnly, Section } from './fields';
import { run } from './run';
import { MultiProperties } from './MultiProperties';
import { ObjectProperties } from './ObjectProperties';

function DeleteButton({ selection }: { selection: SelectionItem[] }): JSX.Element | null {
  if (deletableCount(selection) === 0) return null;
  return (
    <button
      type="button"
      className="btn btn-danger-outline btn-block"
      data-testid="delete-selection"
      onClick={() => deleteSelection(useEditor)}
    >
      Supprimer
    </button>
  );
}

function LevelProperties({ level }: { level: Level }): JSX.Element {
  return (
    <Section title="Niveau">
      <TextField label="Nom" value={level.name} testId="level-name" onCommit={(v) => run('Renommer le niveau', renameLevel(level.id, v))} />
      <NumericInput
        label="Altitude"
        kind="signed"
        valueCm={level.elevation}
        testId="level-elevation"
        onCommit={(v) => run('Altitude du niveau', setLevelProps(level.id, { elevation: v }))}
      />
      <NumericInput
        label="Hauteur sous plafond"
        valueCm={level.height}
        testId="level-height"
        onCommit={(v) => run('Hauteur sous plafond', setLevelProps(level.id, { height: v }))}
      />
    </Section>
  );
}

function WallProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const [keep, setKeep] = useState<'start' | 'end'>('start');
  const wall = level.walls[id];
  const a = wall && level.nodes[wall.startNodeId];
  const b = wall && level.nodes[wall.endNodeId];
  if (!wall || !a || !b) return null;
  return (
    <Section title="Mur">
      <NumericInput
        label="Longueur"
        valueCm={Math.hypot(b.x - a.x, b.y - a.y)}
        testId="wall-length"
        onCommit={(v) => run('Longueur du mur', setWallLength(level.id, id, v, keep))}
      />
      <Choice<'start' | 'end'>
        label="Point fixe"
        value={keep}
        options={[
          ['start', 'Début'],
          ['end', 'Fin'],
        ]}
        onChange={setKeep}
      />
      <NumericInput
        label="Épaisseur"
        valueCm={wall.thickness}
        testId="wall-thickness"
        onCommit={(v) => run('Épaisseur du mur', setWallThickness(level.id, [id], v))}
      />
      <NumericInput
        label="Hauteur"
        valueCm={wall.height}
        testId="wall-height"
        onCommit={(v) => run('Hauteur du mur', setWallHeight(level.id, [id], v))}
      />
    </Section>
  );
}

const KIND_OPTIONS: Array<[OpeningKind, string]> = [
  ['door', 'Porte'],
  ['window', 'Fenêtre'],
  ['passage', 'Passage'],
];
const VARIANTS: Record<OpeningKind, Array<[OpeningVariant, string]>> = {
  door: [
    ['single', 'Battante simple'],
    ['double', 'Battante double'],
    ['sliding', 'Coulissante'],
    ['pocket', 'Galandage'],
  ],
  window: [
    ['single', 'Battant simple'],
    ['double', 'Battant double'],
    ['sliding', 'Coulissante'],
    ['fixed', 'Fixe'],
  ],
  passage: [['none', 'Sans menuiserie']],
};

function OpeningProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const o = level.openings[id];
  if (!o) return null;
  const update = (patch: Parameters<typeof updateOpening>[2]) => run("Modifier l'ouverture", updateOpening(level.id, id, patch));
  const leaves = o.kind !== 'passage';
  return (
    <Section title="Ouverture">
      <Choice
        label="Type"
        value={o.kind}
        options={KIND_OPTIONS}
        testId="opening-kind"
        onChange={(kind) =>
          update({ kind, variant: OPENING_DEFAULTS[kind].variant, sillHeight: OPENING_DEFAULTS[kind].sillHeight })
        }
      />
      {leaves && <Choice label="Variante" value={o.variant} options={VARIANTS[o.kind]} testId="opening-variant" onChange={(variant) => update({ variant })} />}
      <NumericInput label="Largeur" valueCm={o.width} testId="opening-width" onCommit={(width) => update({ width })} />
      <NumericInput label="Hauteur" valueCm={o.height} testId="opening-height" onCommit={(height) => update({ height })} />
      {o.kind === 'window' && (
        <NumericInput
          label="Allège"
          kind="nonNegative"
          valueCm={o.sillHeight}
          testId="opening-sill"
          onCommit={(sillHeight) => update({ sillHeight })}
        />
      )}
      {leaves && (
        <>
          <Choice
            label="Côté des gonds"
            value={o.hinge}
            options={[
              ['start', 'Début du mur'],
              ['end', 'Fin du mur'],
            ]}
            onChange={(hinge) => update({ hinge })}
          />
          <Choice
            label="Sens d'ouverture"
            value={o.swing}
            options={[
              ['left', 'Côté gauche'],
              ['right', 'Côté droit'],
            ]}
            onChange={(swing) => update({ swing })}
          />
        </>
      )}
    </Section>
  );
}

function RoomProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const room = deriveLevel(level).rooms.find((r) => r.key === id);
  if (!room) return null;
  const rename = (name: string) => renameRoomAt(useEditor, level.id, room, name);
  return (
    <Section title="Pièce">
      <TextField label="Nom" value={room.label?.name ?? ''} placeholder={room.name} allowBlank testId="room-name" onCommit={rename} />
      <ReadOnly label="Surface" value={formatArea(room.area)} testId="room-area" />
    </Section>
  );
}

function DimensionProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const dim = level.dimensions[id];
  if (!dim) return null;
  const line = manualDimLine(level, dim);
  return (
    <Section title="Cote">
      <ReadOnly label="Valeur" value={line ? formatLength(line.value) : '-'} testId="dimension-value" />
      <NumericInput
        label="Décalage"
        kind="signed"
        valueCm={dim.offset}
        testId="dimension-offset"
        onCommit={(v) => run('Décaler la cote', setDimensionOffset(level.id, id, v))}
      />
    </Section>
  );
}

function NodeProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const n = level.nodes[id];
  if (!n) return null;
  return (
    <Section title="Jonction de murs">
      <ReadOnly label="X" value={formatLength(n.x)} />
      <ReadOnly label="Y" value={formatLength(n.y)} />
    </Section>
  );
}

function SingleItem({ level, item }: { level: Level; item: SelectionItem }): JSX.Element | null {
  switch (item.kind) {
    case 'wall':
      return <WallProperties level={level} id={item.id} />;
    case 'opening':
      return <OpeningProperties level={level} id={item.id} />;
    case 'object':
      return <ObjectProperties level={level} id={item.id} />;
    case 'room':
      return <RoomProperties level={level} id={item.id} />;
    case 'dimension':
      return <DimensionProperties level={level} id={item.id} />;
    case 'node':
      return <NodeProperties level={level} id={item.id} />;
  }
}

/** Right panel: properties of the selection, or of the active level when nothing is selected. */
export function PropertiesPanel(): JSX.Element | null {
  const level = useEditor(activeLevel);
  const selection = useEditor((s) => s.selection);
  if (!level) return null;
  const single = selection.length === 1 ? selection[0]! : null;
  return (
    <aside className="properties" aria-label="Propriétés" data-testid="properties-panel">
      {selection.length === 0 && <LevelProperties key={level.id} level={level} />}
      {single && <SingleItem key={`${single.kind}:${single.id}`} level={level} item={single} />}
      {selection.length > 1 && <MultiProperties key={selection.map((i) => i.id).join(',')} level={level} selection={selection} />}
      {selection.length > 0 && (
        <div className="panel-section">
          <DeleteButton selection={selection} />
        </div>
      )}
    </aside>
  );
}
