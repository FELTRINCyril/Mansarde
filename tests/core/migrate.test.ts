import { describe, expect, it } from 'vitest';
import { validateProject } from '@/core/commands/validate';
import { FORMAT_VERSION } from '@/core/model/types';
import type { Project } from '@/core/model/types';
import { parseImport } from '@/core/persistence/exchange';
import { canMigrateFrom, migrate, migrateStoredProject, migrations } from '@/core/persistence/migrate';
import { v1Export, v1Project } from './v1Fixture';

type AnyRec = Record<string, any>;
const objectsOf = (file: AnyRec): AnyRec => file.project.levels[0].objects;

describe('migration 1 -> 2', () => {
  it('is registered and targets the current version', () => {
    expect(FORMAT_VERSION).toBe(2);
    expect(Object.keys(migrations)).toEqual(['1']);
  });

  it('derives the pose of every object and custom definition', () => {
    const out = migrate(v1Export()) as AnyRec;
    const objects = objectsOf(out);
    expect(objects.chair.pose).toBe('tuckable'); // catalog entry pose
    expect(objects.rug.pose).toBe('covering'); // generic named "Tapis salon"
    expect(objects.table.pose).toBe('floor'); // generic named "Table"
    expect(objects.berber.pose).toBe('covering'); // custom object named "Tapis berbère"
    expect(objects.ghost.pose).toBe('floor'); // unknown catalog id
    expect(out.project.customObjects.c1.pose).toBe('covering');
    expect(out.project.customObjects.c2.pose).toBe('floor');
  });

  it('detects "tapis" regardless of case and accents', () => {
    for (const name of ['TAPIS', 'Grand tàpis', 'petit TÂPÏS rond', 'Tapisserie']) {
      const f = v1Export();
      objectsOf(f).table.name = name;
      expect((objectsOf(migrate(f) as AnyRec).table as AnyRec).pose, name).toBe('covering');
    }
    const f = v1Export();
    objectsOf(f).table.name = 'Tapi s';
    expect(objectsOf(migrate(f) as AnyRec).table.pose).toBe('floor');
  });

  it('keeps the catalog pose of symbol entries even when named "tapis"', () => {
    const f = v1Export();
    objectsOf(f).chair.name = 'Chaise tapis';
    expect(objectsOf(migrate(f) as AnyRec).chair.pose).toBe('tuckable');
  });

  it('adds empty slopes, beams and cupboards to every level and sets both versions to 2', () => {
    const f = v1Export();
    f.project.levels.push({ ...structuredClone(f.project.levels[0]), id: 'l2', name: 'Etage', objects: {} });
    const out = migrate(f) as AnyRec;
    expect(out.formatVersion).toBe(2);
    expect(out.project.formatVersion).toBe(2);
    for (const level of out.project.levels) {
      expect(level.slopes).toEqual({});
      expect(level.beams).toEqual({});
      expect(level.cupboards).toEqual({});
    }
  });

  it('does not mutate its input', () => {
    const f = v1Export();
    const before = JSON.stringify(f);
    migrate(f);
    expect(JSON.stringify(f)).toBe(before);
  });

  it('leaves malformed parts for the schema to report instead of throwing', () => {
    for (const project of [null, 'x', { levels: 'x' }, { levels: [null, { objects: null }] }, { customObjects: [1] }]) {
      expect(() => migrate({ formatVersion: 1, project } as AnyRec as { formatVersion: number })).not.toThrow();
    }
  });

  it('produces a valid V2 project from a stored V1 project', () => {
    const p = migrateStoredProject(v1Project() as { formatVersion: number }) as Project;
    expect(p.formatVersion).toBe(2);
    expect(p.levels[0]!.slopes).toEqual({});
    expect(validateProject(p)).toEqual([]);
  });

  it('returns a current stored project unchanged', () => {
    const p = migrateStoredProject(v1Project() as { formatVersion: number }) as Project;
    expect(migrateStoredProject(p)).toBe(p);
  });
});

describe('canMigrateFrom', () => {
  it('accepts the integer versions from 1 to FORMAT_VERSION only', () => {
    expect([1, 2].map(canMigrateFrom)).toEqual([true, true]);
    expect([0, -1, 1.5, 3, NaN, Infinity, '1', undefined, null].map(canMigrateFrom)).toEqual(Array(9).fill(false));
  });
  it('refuses a version whose migration chain has a gap', () => {
    const step = migrations[1]!;
    delete migrations[1];
    try {
      expect(canMigrateFrom(1)).toBe(false);
      expect(canMigrateFrom(2)).toBe(true);
    } finally {
      migrations[1] = step;
    }
  });
});

describe('parseImport of older and newer files', () => {
  it('imports a V1 file as a valid V2 project', () => {
    const r = parseImport(JSON.stringify(v1Export()));
    if (!r.ok) throw new Error(r.error);
    expect(r.project.formatVersion).toBe(2);
    const objects = r.project.levels[0]!.objects;
    expect([objects.chair!.pose, objects.rug!.pose, objects.table!.pose]).toEqual(['tuckable', 'covering', 'floor']);
    expect(validateProject(r.project)).toEqual([]);
  });

  it('refuses a version 3 file as coming from a newer version', () => {
    const f = v1Export();
    f.formatVersion = 3;
    const r = parseImport(JSON.stringify(f));
    expect(r).toEqual({ ok: false, error: 'Ce fichier a été créé par une version plus récente de Plan Maison.' });
  });

  it('still refuses a malformed V1 file after migrating it', () => {
    // the migration runs, then the schema rejects the missing V1 field
    const f = v1Export();
    delete f.project.levels[0].nodes;
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : /);
  });
});
