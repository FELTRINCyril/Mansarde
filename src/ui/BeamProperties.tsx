import type { JSX } from 'react';
import { updateBeam } from '@/core/commands/beams';
import { dist } from '@/core/geometry/vec';
import { formatLength } from '@/core/model/format';
import type { Beam, Level } from '@/core/model/types';
import { Choice, ReadOnly, Section } from './fields';
import { NumericInput } from './NumericInput';
import { run } from './run';

const MODES: Array<[Beam['mode'], string]> = [
  ['ceiling', 'Sous le plafond'],
  ['fixed', 'Hauteur fixe'],
];

/** Beam (spec 7.2): width, drop, height mode, underside height (fixed mode), length (read only). */
export function BeamProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const b = level.beams[id];
  if (!b) return null;
  const update = (patch: Partial<Omit<Beam, 'id'>>) => run('Modifier la poutre', updateBeam(level.id, id, patch));
  return (
    <Section title="Poutre">
      <NumericInput label="Largeur" valueCm={b.width} testId="beam-width" onCommit={(width) => update({ width })} />
      <NumericInput label="Retombée" valueCm={b.drop} testId="beam-drop" onCommit={(drop) => update({ drop })} />
      <Choice label="Hauteur" wide value={b.mode} options={MODES} testId="beam-mode" onChange={(mode) => update({ mode })} />
      {b.mode === 'fixed' && (
        <NumericInput label="Hauteur du dessous" valueCm={b.bottom} testId="beam-bottom" onCommit={(bottom) => update({ bottom })} />
      )}
      <ReadOnly label="Longueur" value={formatLength(dist(b.a, b.b))} testId="beam-length" />
    </Section>
  );
}
