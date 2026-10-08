import { describe, expect, it } from 'vitest';
import { renameRoom } from '@/core/commands/rooms';
import { computeRooms } from '@/core/geometry/rooms';
import type { Project, RoomLabel } from '@/core/model/types';
import { rectRoom } from './fixtures';
import { levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const point = { x: 200, y: 150 };

describe('renameRoom', () => {
  it('creates a label anchored at labelPoint when the room has none, and the room takes its name', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const next = run(p, renameRoom(levelId(p), { label: null, labelPoint: point }, '  Salon '));
    const labels = lvl(next).roomLabels;
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ name: 'Salon', anchor: point });
    expect(computeRooms(lvl(next))[0]!.name).toBe('Salon');
  });

  function labelled(): { p: Project; label: RoomLabel } {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const p2 = run(p, renameRoom(levelId(p), { label: null, labelPoint: point }, 'Salon'));
    return { p: p2, label: lvl(p2).roomLabels[0]! };
  }

  it('renames an existing label in place (same id, same anchor)', () => {
    const { p, label } = labelled();
    const next = run(p, renameRoom(levelId(p), { label, labelPoint: point }, ' Séjour '));
    expect(lvl(next).roomLabels).toEqual([{ ...label, name: 'Séjour' }]);
  });

  it('removes the label for a blank name', () => {
    const { p, label } = labelled();
    const next = run(p, renameRoom(levelId(p), { label, labelPoint: point }, '  '));
    expect(lvl(next).roomLabels).toHaveLength(0);
  });

  it('is a no-op for a blank name without label and for an unchanged name', () => {
    const base = projectFrom(rectRoom(0, 0, 400, 300));
    noop(base, renameRoom(levelId(base), { label: null, labelPoint: point }, '  '));
    const { p, label } = labelled();
    noop(p, renameRoom(levelId(p), { label, labelPoint: point }, 'Salon'));
  });

  it('refuses a stale label, a non-finite labelPoint and an unknown level', () => {
    const { p, label } = labelled();
    const stale = { ...label, id: 'gone' };
    expect(refuse(p, renameRoom(levelId(p), { label: stale, labelPoint: point }, 'X'))).toBe('Étiquette introuvable');
    expect(refuse(p, renameRoom(levelId(p), { label: null, labelPoint: { x: NaN, y: 0 } }, 'X'))).toBe('Position invalide');
    expect(refuse(p, renameRoom('nope', { label: null, labelPoint: point }, 'X'))).toBe('Niveau introuvable');
  });
});
