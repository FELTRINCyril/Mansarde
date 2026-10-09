import type { JSX } from 'react';
import { updateCupboard } from '@/core/commands/cupboards';
import { deriveVolumes } from '@/core/geometry/derived';
import { MAX_CUPBOARD_DOORS } from '@/core/model/defaults';
import type { Cupboard, Level } from '@/core/model/types';
import { Choice, ReadOnly, Section } from './fields';
import { NumericInput } from './NumericInput';
import { ColorField } from './ObjectProperties';
import { run } from './run';
import { resultingHeightText } from './volumeText';

const HEIGHT_MODES: Array<[Cupboard['heightMode'], string]> = [
  ['fixed', 'Hauteur fixe'],
  ['ceiling', "Jusqu'au plafond"],
];
const DOOR_TYPES: Array<[Cupboard['doorType'], string]> = [
  ['hinged', 'Battantes'],
  ['sliding', 'Coulissantes'],
];
const DOOR_COUNTS: Array<[string, string]> = Array.from({ length: MAX_CUPBOARD_DOORS }, (_, i) => [String(i + 1), String(i + 1)]);

/**
 * Built-in cupboard (spec 7.2): sizes, plinth, height mode with the height (fixed) or the gap under
 * the ceiling, doors (count from a list bounded by MAX_CUPBOARD_DOORS, type), color, and the
 * resulting height read from the top profile ("de 1,48 m à 2,38 m" under a slope).
 */
export function CupboardProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const c = level.cupboards[id];
  if (!c) return null;
  const update = (patch: Partial<Omit<Cupboard, 'id' | 'wallId'>>) => run('Modifier le placard', updateCupboard(level.id, id, patch));
  const profile = deriveVolumes(level).cupboardProfiles.get(id);
  return (
    <Section title="Placard">
      <NumericInput label="Largeur" valueCm={c.width} testId="cupboard-width" onCommit={(width) => update({ width })} />
      <NumericInput label="Profondeur" valueCm={c.depth} testId="cupboard-depth" onCommit={(depth) => update({ depth })} />
      <NumericInput label="Socle" kind="nonNegative" valueCm={c.plinth} testId="cupboard-plinth" onCommit={(plinth) => update({ plinth })} />
      <Choice label="Hauteur" wide value={c.heightMode} options={HEIGHT_MODES} testId="cupboard-height-mode" onChange={(heightMode) => update({ heightMode })} />
      {c.heightMode === 'fixed' ? (
        <NumericInput label="Hauteur totale" valueCm={c.height} testId="cupboard-height" onCommit={(height) => update({ height })} />
      ) : (
        <NumericInput label="Jeu sous le plafond" kind="nonNegative" valueCm={c.gap} testId="cupboard-gap" onCommit={(gap) => update({ gap })} />
      )}
      {profile && <ReadOnly label="Hauteur résultante" value={resultingHeightText(profile)} testId="cupboard-resulting-height" />}
      <Choice
        label="Nombre de portes"
        value={String(c.doorCount)}
        options={DOOR_COUNTS}
        testId="cupboard-door-count"
        onChange={(v) => update({ doorCount: Number(v) })}
      />
      <Choice label="Portes" value={c.doorType} options={DOOR_TYPES} testId="cupboard-door-type" onChange={(doorType) => update({ doorType })} />
      <ColorField label="Couleur" value={c.color} testId="cupboard-color" onCommit={(color) => update({ color })} />
    </Section>
  );
}
