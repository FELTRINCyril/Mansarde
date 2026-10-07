import { describe, expect, it } from 'vitest';
import { validateProject } from '@/core/commands/validate';
import { createObjectFromSize, createOpening, createProject } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Id, Project } from '@/core/model/types';
import { migrate, migrations } from '@/core/persistence/migrate';
import {
  parseImport,
  prepareImportedProject,
  serializeExport,
  type ImageData64,
} from '@/core/persistence/exchange';
import { levelFromWalls, rectRoom } from './fixtures';

const IMG: ImageData64 = { mime: 'image/png', data: 'iVBORw0KGgo=' };

/** A project exercising every optional/union branch of the schema. */
function richProject(name = 'Maison'): { project: Project; images: Record<Id, ImageData64> } {
  const p = createProject(name);
  const level = levelFromWalls(rectRoom(0, 0, 400, 300));
  const wallId = Object.keys(level.walls)[0]!;
  const nodeIds = Object.keys(level.nodes);
  const door = createOpening(wallId, 'door', 200);
  level.openings[door.id] = door;
  const win = createOpening(Object.keys(level.walls)[1]!, 'window', 150);
  level.openings[win.id] = win;

  const custom = newId();
  p.customObjects[custom] = {
    id: custom, name: 'Meuble L', shape: 'lshape', width: 120, depth: 80, height: 90,
    color: '#aabbcc', lshape: { notchWidth: 40, notchDepth: 30 },
  };
  const catalogObj = createObjectFromSize({ kind: 'catalog', catalogId: 'sofa' }, 100, 100, { width: 80, depth: 80, height: 80 }, 'Canapé', '#ffffff');
  const customObj = createObjectFromSize({ kind: 'custom', customObjectId: custom }, 250, 150, { width: 120, depth: 80, height: 90 }, 'Meuble L', '#aabbcc', {
    lshape: { notchWidth: 40, notchDepth: 30 }, rotation: 45, mirrored: true,
  });
  level.objects[catalogObj.id] = catalogObj;
  level.objects[customObj.id] = customObj;

  const d1 = newId();
  const d2 = newId();
  level.dimensions[d1] = { id: d1, a: { kind: 'node', nodeId: nodeIds[0]! }, b: { kind: 'point', x: 10, y: 20 }, offset: 30 };
  level.dimensions[d2] = { id: d2, a: { kind: 'objectCorner', objectId: catalogObj.id, corner: 2 }, b: { kind: 'node', nodeId: nodeIds[1]! }, offset: -15 };
  level.roomLabels.push({ id: newId(), name: 'Séjour', anchor: { x: 200, y: 150 } });

  const imageId = newId();
  level.background = {
    imageId, widthPx: 800, heightPx: 600, scale: 0.5, x: -10, y: 5, rotation: 3,
    opacity: 0.4, locked: false, visible: true,
  };
  p.levels = [level];
  expect(validateProject(p)).toEqual([]);
  return { project: p, images: { [imageId]: IMG } };
}

function exported(r: { project: Project; images: Record<Id, ImageData64> }): Record<string, any> {
  return JSON.parse(serializeExport(r.project, r.images));
}

describe('serializeExport / parseImport', () => {
  it('round-trips deeply', () => {
    const { project, images } = richProject();
    const text = serializeExport(project, images);
    expect(text).toBe(JSON.stringify(JSON.parse(text), null, 2));
    const r = parseImport(text);
    expect(r).toEqual({ ok: true, project, images });
  });

  it('round-trips the default project', () => {
    const project = createProject('Vide');
    expect(parseImport(serializeExport(project, {}))).toEqual({ ok: true, project, images: {} });
  });

  it('tags the file with app and formatVersion', () => {
    const f = exported(richProject());
    expect(f.app).toBe('plan-maison');
    expect(f.formatVersion).toBe(1);
  });

  it('accepts unknown keys at the export root', () => {
    const f = exported(richProject());
    f.generator = 'something';
    expect(parseImport(JSON.stringify(f)).ok).toBe(true);
  });

  it('rejects truncated JSON', () => {
    const text = serializeExport(createProject('A'), {});
    expect(parseImport(text.slice(0, text.length - 20))).toEqual({
      ok: false,
      error: "Fichier illisible : ce n'est pas un fichier JSON valide.",
    });
  });

  it('rejects JSON that is not an object', () => {
    for (const text of ['42', 'null', '[]', '"x"']) {
      expect(parseImport(text)).toEqual({ ok: false, error: 'Ce fichier ne provient pas de Plan Maison.' });
    }
  });

  it('rejects another app', () => {
    const f = exported(richProject());
    f.app = 'autre';
    expect(parseImport(JSON.stringify(f))).toEqual({ ok: false, error: 'Ce fichier ne provient pas de Plan Maison.' });
  });

  it('rejects a newer format version', () => {
    const f = exported(richProject());
    f.formatVersion = 99;
    expect(parseImport(JSON.stringify(f))).toEqual({
      ok: false,
      error: 'Ce fichier a été créé par une version plus récente de Plan Maison.',
    });
  });

  it('rejects a missing or invalid format version', () => {
    for (const v of [undefined, 'x', 0, 1.5]) {
      const f = exported(richProject());
      f.formatVersion = v;
      const r = parseImport(JSON.stringify(f));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : /);
    }
  });

  it('rejects an opening that overflows its wall', () => {
    const f = exported(richProject());
    const level = f.project.levels[0];
    const opening = Object.values<any>(level.openings)[0];
    opening.width = 100000;
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : /);
  });

  it('rejects a missing background image', () => {
    const f = exported(richProject());
    f.images = {};
    expect(parseImport(JSON.stringify(f))).toEqual({ ok: false, error: 'Fichier invalide : image de fond manquante' });
  });

  it('reports the path of the first schema issue', () => {
    const f = exported(richProject());
    f.project.settings.gridStep = 'dix';
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : project\.settings\.gridStep /);
  });

  it('rejects unknown keys inside the project', () => {
    const f = exported(richProject());
    f.project.extra = 1;
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : /);
  });

  it('rejects unknown keys in nested objects', () => {
    const f = exported(richProject());
    Object.values<any>(f.project.levels[0].nodes)[0].z = 3;
    expect(parseImport(JSON.stringify(f)).ok).toBe(false);
  });

  it('rejects bad enum values, bad anchors and non-null lshape on wrong type', () => {
    const mutations: Array<(f: any) => void> = [
      (f) => { Object.values<any>(f.project.levels[0].openings)[0].kind = 'gate'; },
      (f) => { Object.values<any>(f.project.levels[0].openings)[0].variant = 'wide'; },
      (f) => { Object.values<any>(f.project.levels[0].openings)[0].swing = 'up'; },
      (f) => { Object.values<any>(f.project.levels[0].dimensions)[0].a = { kind: 'weird' }; },
      (f) => { Object.values<any>(f.project.levels[0].dimensions)[1].a.corner = 4; },
      (f) => { Object.values<any>(f.project.levels[0].objects)[0].source = { kind: 'catalog' }; },
      (f) => { Object.values<any>(f.project.customObjects)[0].shape = 'star'; },
      (f) => { delete f.project.levels[0].roomLabels[0].anchor.y; },
      (f) => { f.project.levels[0].background.opacity = 'half'; },
      (f) => { f.images[Object.keys(f.images)[0]!] = { mime: 'image/png' }; },
    ];
    for (const mutate of mutations) {
      const f = exported(richProject());
      mutate(f);
      const r = parseImport(JSON.stringify(f));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : /);
    }
  });

  it('rejects non-finite-looking numbers (null for NaN)', () => {
    const f = exported(richProject());
    Object.values<any>(f.project.levels[0].nodes)[0].x = null;
    expect(parseImport(JSON.stringify(f)).ok).toBe(false);
  });

  it('rejects a structurally valid file that breaks a document invariant', () => {
    // walls removed while openings still reference them: the schema passes, validateProject refuses
    const f = exported(richProject());
    f.project.levels[0].walls = {};
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
  });
});

describe('migrate', () => {
  it('has no migration yet and is the identity at the current version', () => {
    expect(Object.keys(migrations)).toEqual([]);
    const raw = { formatVersion: 1, project: {} };
    expect(migrate(raw)).toEqual(raw);
  });
});

describe('prepareImportedProject', () => {
  it('assigns new ids and remaps background images', () => {
    const r = richProject();
    const out = prepareImportedProject(r, []);
    expect(out.project.id).not.toBe(r.project.id);
    expect(out.project.name).toBe('Maison');
    const oldImageId = r.project.levels[0]!.background!.imageId;
    const newImageId = out.project.levels[0]!.background!.imageId;
    expect(newImageId).not.toBe(oldImageId);
    expect(Object.keys(out.images)).toEqual([newImageId]);
    expect(out.images[newImageId]).toEqual(IMG);
    expect(out.project.levels[0]!.id).not.toBe(r.project.levels[0]!.id);
    expect(validateProject(out.project)).toEqual([]);
  });

  it('keeps images not referenced by a background out of the result only if unreferenced', () => {
    const r = richProject();
    r.images[newId()] = IMG; // unreferenced extra image
    const out = prepareImportedProject(r, []);
    expect(Object.keys(out.images).length).toBe(2);
  });

  it('does not mutate its input', () => {
    const r = richProject();
    const before = JSON.stringify(r);
    prepareImportedProject(r, ['Maison']);
    expect(JSON.stringify(r)).toBe(before);
  });

  it('suffixes the name when it already exists', () => {
    const r = richProject('Maison');
    expect(prepareImportedProject(r, ['Maison']).project.name).toBe('Maison (import)');
    expect(prepareImportedProject(r, ['Maison', 'Maison (import)']).project.name).toBe('Maison (import 2)');
    expect(prepareImportedProject(r, ['Maison', 'Maison (import)', 'Maison (import 2)']).project.name).toBe('Maison (import 3)');
    expect(prepareImportedProject(r, ['Autre']).project.name).toBe('Maison');
  });
});
