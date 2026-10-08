import { applyPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { CommandError, applyCommand, getLevel, touch } from '@/core/commands/apply';
import { createProject } from '@/core/model/factory';

describe('applyCommand', () => {
  it('applies a recipe, returns patches and an inverse that restores the name', () => {
    const p = createProject('Avant');
    const r = applyCommand(p, (d) => {
      d.name = 'Apres';
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.name).toBe('Apres');
    expect(r.patches.length).toBeGreaterThan(0);
    expect(p.name).toBe('Avant');
    const back = applyPatches(r.project, r.inverse);
    expect(back.name).toBe('Avant');
  });

  it('turns a CommandError into { ok: false } and leaves the original untouched', () => {
    const p = createProject('Maison');
    const snapshot = JSON.stringify(p);
    const r = applyCommand(p, (d) => {
      d.name = 'Modifie';
      throw new CommandError('x');
    });
    expect(r).toEqual({ ok: false, error: 'x' });
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('rethrows other errors', () => {
    const p = createProject('Maison');
    expect(() =>
      applyCommand(p, () => {
        throw new TypeError('boom');
      }),
    ).toThrow(TypeError);
  });

  it('throws an Invariant violation error when the result is invalid', () => {
    const p = createProject('Maison');
    expect(() =>
      applyCommand(p, (d) => {
        const level = d.levels[0]!;
        level.nodes['n1'] = { id: 'n1', x: 0, y: 0 };
        level.walls['w1'] = {
          id: 'w1',
          startNodeId: 'n1',
          endNodeId: 'ghost',
          thickness: 20,
          height: 250,
        };
      }),
    ).toThrow(/Invariant violation/);
  });

  it('does not validate when opts.validate is false', () => {
    const p = createProject('Maison');
    const r = applyCommand(
      p,
      (d) => {
        d.levels[0]!.nodes['n1'] = { id: 'n1', x: 0, y: 0 };
      },
      { validate: false },
    );
    expect(r.ok).toBe(true);
  });

  it('does not touch updatedAt by itself', () => {
    const p = createProject('Maison', new Date('2026-01-01T00:00:00.000Z'));
    const r = applyCommand(p, (d) => {
      d.name = 'B';
    });
    expect(r.ok && r.project.updatedAt).toBe(p.updatedAt);
  });
});

describe('getLevel', () => {
  it('returns the level or throws CommandError', () => {
    const p = createProject('Maison');
    const id = p.levels[0]!.id;
    expect(getLevel(p, id).id).toBe(id);
    expect(() => getLevel(p, 'nope')).toThrow(CommandError);
    expect(() => getLevel(p, 'nope')).toThrow('Niveau introuvable');
  });
});

describe('touch', () => {
  it('sets updatedAt to the given date', () => {
    const p = createProject('Maison', new Date('2026-01-01T00:00:00.000Z'));
    const r = applyCommand(p, (d) => touch(d, new Date('2026-02-03T04:05:06.000Z')));
    expect(r.ok && r.project.updatedAt).toBe('2026-02-03T04:05:06.000Z');
  });
});
