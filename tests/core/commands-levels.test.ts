import { describe, expect, it } from 'vitest';
import { addDimension } from '@/core/commands/dimensions';
import { addLevel, deleteLevel, duplicateLevel, moveLevel, renameLevel, setLevelProps } from '@/core/commands/levels';
import { addObject } from '@/core/commands/objects';
import { createObjectFromSize } from '@/core/model/factory';
import type { Id, Project } from '@/core/model/types';
import { rectRoom } from './fixtures';
import { emptyProject, levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const names = (p: Project): string[] => p.levels.map((l) => l.name);

describe('addLevel', () => {
  it('inserts above with elevation ref.elevation + ref.height + slab (0 + 250 + 20 = 270)', () => {
    const p = emptyProject();
    const out = { levelId: '' };
    const next = run(p, addLevel(levelId(p), 'above', 'Étage 1', out));
    expect(names(next)).toEqual(['RDC', 'Étage 1']);
    expect(next.levels[1]).toMatchObject({ id: out.levelId, elevation: 270, height: 250 });
    expect(Object.keys(next.levels[1]!.walls)).toHaveLength(0);
  });

  it('inserts below with elevation ref.elevation - (default height + slab)', () => {
    const p = emptyProject();
    const next = run(p, addLevel(levelId(p), 'below', 'Sous-sol'));
    expect(names(next)).toEqual(['Sous-sol', 'RDC']);
    expect(next.levels[0]).toMatchObject({ elevation: -270, height: 250 });
  });

  it('inserts right after the reference level, not at the end', () => {
    let p = emptyProject();
    p = run(p, addLevel(levelId(p), 'above', 'E1'));
    p = run(p, addLevel(p.levels[0]!.id, 'above', 'Mezzanine'));
    expect(names(p)).toEqual(['RDC', 'Mezzanine', 'E1']);
  });

  it('uses the project default ceiling height for the new level', () => {
    const p = emptyProject();
    p.settings.defaultCeilingHeight = 280;
    expect(run(p, addLevel(levelId(p), 'above', 'E1')).levels[1]!.height).toBe(280);
  });

  it('refuses a blank name and an unknown level', () => {
    const p = emptyProject();
    expect(refuse(p, addLevel(levelId(p), 'above', '  '))).toBe('Nom invalide');
    expect(refuse(p, addLevel('nope', 'above', 'X'))).toBe('Niveau introuvable');
  });
});

describe('renameLevel', () => {
  it('trims the name; no-op when unchanged; refuses blank', () => {
    const p = emptyProject();
    expect(run(p, renameLevel(levelId(p), '  Rez  ')).levels[0]!.name).toBe('Rez');
    noop(p, renameLevel(levelId(p), 'RDC'));
    expect(refuse(p, renameLevel(levelId(p), '   '))).toBe('Nom invalide');
  });
});

describe('setLevelProps', () => {
  it('sets elevation and height', () => {
    const p = emptyProject();
    const next = run(p, setLevelProps(levelId(p), { elevation: -50, height: 300 }));
    expect(lvl(next)).toMatchObject({ elevation: -50, height: 300 });
  });

  it('refuses invalid values without partial change; no-op when unchanged', () => {
    const p = emptyProject();
    const lv = levelId(p);
    expect(refuse(p, setLevelProps(lv, { height: 0 }))).toBe('Hauteur invalide');
    expect(refuse(p, setLevelProps(lv, { height: NaN }))).toBe('Hauteur invalide');
    expect(refuse(p, setLevelProps(lv, { elevation: 10, height: -1 }))).toBe('Hauteur invalide');
    expect(refuse(p, setLevelProps(lv, { elevation: Infinity }))).toBe('Altitude invalide');
    noop(p, setLevelProps(lv, { elevation: 0, height: 250 }));
    noop(p, setLevelProps(lv, {}));
  });
});

describe('duplicateLevel', () => {
  function rich(): Project {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const lv = levelId(p);
    const nodeId = Object.keys(lvl(p).nodes)[0]!;
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, 100, 100, { width: 50, depth: 50, height: 50 }, 'B', '#ccc');
    let q = run(p, addObject(lv, o));
    q = run(q, addDimension(lv, { kind: 'node', nodeId }, { kind: 'objectCorner', objectId: o.id, corner: 0 }, 20));
    return q;
  }

  it('inserts the copy just above the source, with new ids everywhere', () => {
    let p = rich();
    p = run(p, addLevel(levelId(p), 'above', 'Étage 1')); // [RDC, Étage 1]
    const out = { levelId: '' };
    const next = run(p, duplicateLevel(levelId(p), 'Copie RDC', out));
    expect(names(next)).toEqual(['Test', 'Copie RDC', 'Étage 1']);
    const src = next.levels[0]!;
    const copy = next.levels[1]!;
    expect(copy.id).toBe(out.levelId);
    expect(copy.id).not.toBe(src.id);
    const ids = (l: typeof src): Id[] => [
      ...Object.keys(l.nodes),
      ...Object.keys(l.walls),
      ...Object.keys(l.objects),
      ...Object.keys(l.dimensions),
    ];
    expect(ids(copy)).toHaveLength(ids(src).length);
    expect(ids(copy).filter((id) => ids(src).includes(id))).toEqual([]);
    // the copied dimension is anchored to the copied node and object
    const dim = Object.values(copy.dimensions)[0]!;
    expect(dim.a.kind === 'node' && copy.nodes[dim.a.nodeId]).toBeTruthy();
    expect(dim.b.kind === 'objectCorner' && copy.objects[dim.b.objectId]).toBeTruthy();
  });

  it('refuses a blank name and an unknown level', () => {
    const p = emptyProject();
    expect(refuse(p, duplicateLevel(levelId(p), ' '))).toBe('Nom invalide');
    expect(refuse(p, duplicateLevel('nope', 'X'))).toBe('Niveau introuvable');
  });
});

describe('deleteLevel', () => {
  it('deletes a level when others remain', () => {
    let p = emptyProject();
    p = run(p, addLevel(levelId(p), 'above', 'E1'));
    const next = run(p, deleteLevel(p.levels[1]!.id));
    expect(names(next)).toEqual(['RDC']);
  });

  it('refuses to delete the last level', () => {
    const p = emptyProject();
    expect(refuse(p, deleteLevel(levelId(p)))).toBe('Un projet doit garder au moins un niveau');
    expect(refuse(p, deleteLevel('nope'))).toBe('Niveau introuvable');
  });
});

describe('moveLevel', () => {
  function three(): Project {
    let p = emptyProject();
    p = run(p, addLevel(levelId(p), 'above', 'E1'));
    return run(p, addLevel(p.levels[1]!.id, 'above', 'E2'));
  }

  it('moves a level to the given index', () => {
    const p = three();
    expect(names(run(p, moveLevel(p.levels[0]!.id, 2)))).toEqual(['E1', 'E2', 'RDC']);
    expect(names(run(p, moveLevel(p.levels[2]!.id, 0)))).toEqual(['E2', 'RDC', 'E1']);
  });

  it('refuses an out-of-range or fractional index; no-op on the same index', () => {
    const p = three();
    const id = p.levels[1]!.id;
    expect(refuse(p, moveLevel(id, 3))).toBe('Position invalide');
    expect(refuse(p, moveLevel(id, -1))).toBe('Position invalide');
    expect(refuse(p, moveLevel(id, 0.5))).toBe('Position invalide');
    noop(p, moveLevel(id, 1));
  });
});
