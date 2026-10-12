import type { JSX } from 'react';
import { updateSlope } from '@/core/commands/slopes';
import type { Level, Slope } from '@/core/model/types';
import { Section } from './fields';
import { NumericInput } from './NumericInput';
import { run } from './run';

/** Roof slope (spec 7.2): heights at the start and end lines, depth, direction flipped across the start line. */
export function SlopeProperties({ level, id }: { level: Level; id: string }): JSX.Element | null {
  const s = level.slopes[id];
  if (!s) return null;
  const update = (patch: Partial<Omit<Slope, 'id'>>) => run('Modifier la pente', updateSlope(level.id, id, patch));
  return (
    <Section title="Pente">
      <NumericInput label="Hauteur au départ" valueCm={s.heightStart} testId="slope-height-start" onCommit={(heightStart) => update({ heightStart })} />
      <NumericInput label="Hauteur à l'arrivée" valueCm={s.heightEnd} testId="slope-height-end" onCommit={(heightEnd) => update({ heightEnd })} />
      <NumericInput label="Profondeur" valueCm={s.depth} testId="slope-depth" onCommit={(depth) => update({ depth })} />
      <button
        type="button"
        className="btn btn-block"
        data-testid="slope-flip"
        onClick={() => run('Inverser le sens de la pente', updateSlope(level.id, id, { side: s.side === 'left' ? 'right' : 'left' }))}
      >
        Inverser le sens
      </button>
    </Section>
  );
}
