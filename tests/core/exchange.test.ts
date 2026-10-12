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
    color: '#aabbcc', lshape: { notchWidth: 40, notchDepth: 30 }, pose: 'floor',
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
    expect(f.formatVersion).toBe(2);
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
      expect(parseImport(text)).toEqual({ ok: false, error: 'Ce fichier ne provient pas de Mansarde.' });
    }
  });

  it('rejects another app', () => {
    const f = exported(richProject());
    f.app = 'autre';
    expect(parseImport(JSON.stringify(f))).toEqual({ ok: false, error: 'Ce fichier ne provient pas de Mansarde.' });
  });

  it('rejects a newer format version', () => {
    const f = exported(richProject());
    f.formatVersion = 99;
    expect(parseImport(JSON.stringify(f))).toEqual({
      ok: false,
      error: 'Ce fichier a été créé par une version plus récente de Mansarde.',
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

  it('rejects a schema-valid file that breaks a document invariant (openings without walls)', () => {
    // walls removed while openings still reference them: the schema passes, validateProject refuses
    const f = exported(richProject());
    f.project.levels[0].walls = {};
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
  });
});

describe('import error messages are French (final review item 4)', () => {
  const errorOf = (mutate: (f: any) => void): string => {
    const f = exported(richProject());
    mutate(f);
    const r = parseImport(JSON.stringify(f));
    if (r.ok) throw new Error('expected a refusal');
    return r.error;
  };

  it('names the path and the kind of schema problem in French', () => {
    expect(errorOf((f) => { f.project.settings.gridStep = 'dix'; })).toBe('Fichier invalide : project.settings.gridStep type inattendu');
    expect(errorOf((f) => { f.project.settings.gridStep = 0; })).toBe('Fichier invalide : project.settings.gridStep valeur hors limites');
    expect(errorOf((f) => { delete f.project.name; })).toBe('Fichier invalide : project.name champ manquant');
    const opening = (f: any) => Object.values<any>(f.project.levels[0].openings)[0];
    expect(errorOf((f) => { opening(f).kind = 'gate'; })).toMatch(/^Fichier invalide : project\.levels\.0\.openings\.[^ ]+\.kind valeur non reconnue$/);
    expect(errorOf((f) => { f.project.extra = 1; })).toBe('Fichier invalide : project champ inconnu (extra)');
  });

  it('keeps the French messages written in the schema', () => {
    expect(errorOf((f) => { f.images[Object.keys(f.images)[0]!].mime = 'image/svg+xml'; })).toMatch(/type d'image non pris en charge$/);
  });

  it('wraps a broken document invariant in a French sentence', () => {
    const error = errorOf((f) => { f.project.levels[0].walls = {}; });
    expect(error).toMatch(/^Fichier invalide : plan incohérent \(.+\)$/);
  });

  it('never shows an English schema message', () => {
    const mutations: Array<(f: any) => void> = [
      (f) => { Object.values<any>(f.project.levels[0].nodes)[0].x = null; },
      (f) => { Object.values<any>(f.project.levels[0].dimensions)[0].a = { kind: 'weird' }; },
      (f) => { Object.values<any>(f.project.levels[0].objects)[0].source = { kind: 'catalog' }; },
      (f) => { f.project.levels[0].background.opacity = 1.5; },
      (f) => { f.project.levels = 'none'; },
    ];
    for (const m of mutations) {
      const error = errorOf(m);
      expect(error).toMatch(/^Fichier invalide : /);
      expect(error.replace(/^Fichier invalide : /, '')).not.toMatch(/invalid input|expected|received|too (big|small)|unrecognized/i);
    }
  });
});

describe('migrate', () => {
  it('is the identity at the current version', () => {
    expect(Object.keys(migrations)).toEqual(['1']); // details in migrate.test.ts
    const raw = { formatVersion: 2, project: {} };
    expect(migrate(raw)).toBe(raw);
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

describe('hostile imports', () => {
  const failsWith = (f: unknown, pattern: RegExp): void => {
    const r = parseImport(JSON.stringify(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(pattern);
  };
  const level0 = (f: any): any => f.project.levels[0];

  describe('record key must equal element id', () => {
    const kinds: Array<[string, (f: any) => any]> = [
      ['nodes', (f) => Object.values<any>(level0(f).nodes)[0]],
      ['walls', (f) => Object.values<any>(level0(f).walls)[0]],
      ['openings', (f) => Object.values<any>(level0(f).openings)[0]],
      ['objects', (f) => Object.values<any>(level0(f).objects)[0]],
      ['dimensions', (f) => Object.values<any>(level0(f).dimensions)[0]],
      ['customObjects', (f) => Object.values<any>(f.project.customObjects)[0]],
    ];
    for (const [name, pick] of kinds) {
      it(`refuses a mismatching id in ${name} without throwing`, () => {
        const f = exported(richProject());
        pick(f).id = 'other';
        const r = parseImport(JSON.stringify(f));
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error).toMatch(/^Fichier invalide : project\..*identifiant incohérent$/);
          expect(r.error).toContain(name);
        }
      });
    }

    it('refuses a missing id', () => {
      const f = exported(richProject());
      delete Object.values<any>(level0(f).objects)[0].id;
      expect(parseImport(JSON.stringify(f)).ok).toBe(false);
    });
  });

  it('refuses a __proto__ record key', () => {
    // both records are non-empty in the rich project, so the injected entry keeps the JSON valid
    const inCustom = serializeExport(richProject().project, {}).replace('"customObjects": {', '"customObjects": {"__proto__": {"id": "__proto__"},');
    expect(inCustom).toContain('"__proto__"');
    const r1 = parseImport(inCustom);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toMatch(/^Fichier invalide : project\.customObjects\.__proto__ identifiant interdit/);

    const inImages = JSON.stringify(exported(richProject())).replace('"images":{', '"images":{"__proto__":{"mime":"image/png","data":"AA=="},');
    expect(inImages).toContain('"__proto__"');
    const r2 = parseImport(inImages);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/^Fichier invalide : images\.__proto__ identifiant interdit/);
  });

  it('does not accept prototype property names as ids', () => {
    for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      const bg = exported(richProject());
      level0(bg).background.imageId = name;
      expect(parseImport(JSON.stringify(bg))).toEqual({ ok: false, error: 'Fichier invalide : image de fond manquante' });

      const op = exported(richProject());
      Object.values<any>(level0(op).openings)[0].wallId = name;
      failsWith(op, /^Fichier invalide : /);

      const wall = exported(richProject());
      Object.values<any>(level0(wall).walls)[0].startNodeId = name;
      failsWith(wall, /^Fichier invalide : /);

      const dim = exported(richProject());
      Object.values<any>(level0(dim).dimensions)[0].a = { kind: 'node', nodeId: name };
      failsWith(dim, /^Fichier invalide : /);

      const obj = exported(richProject());
      Object.values<any>(level0(obj).objects)[1].source.customObjectId = name;
      failsWith(obj, /^Fichier invalide : /);
    }
  });

  it('never throws on arbitrary garbage', () => {
    const inputs = ['', ' ', '{', 'null', 'true', '{"app":"plan-maison"}', '{"app":"plan-maison","formatVersion":1}',
      '{"app":"plan-maison","formatVersion":1,"project":null,"images":null}',
      '{"app":"plan-maison","formatVersion":1,"project":{"levels":"x"},"images":{}}'];
    for (const t of inputs) expect(() => parseImport(t)).not.toThrow();
  });

  describe('numeric bounds', () => {
    const cases: Array<[string, (f: any) => void]> = [
      ['gridStep 0', (f) => { f.project.settings.gridStep = 0; }],
      ['negative wall thickness setting', (f) => { f.project.settings.defaultWallThickness = -5; }],
      ['node x 1e308', (f) => { Object.values<any>(level0(f).nodes)[0].x = 1e308; }],
      ['node x beyond 1e6', (f) => { Object.values<any>(level0(f).nodes)[0].x = 1e6 + 1; }],
      ['negative level height', (f) => { level0(f).height = -3; }],
      ['huge level elevation', (f) => { level0(f).elevation = 1e300; }],
      ['zero wall thickness', (f) => { Object.values<any>(level0(f).walls)[0].thickness = 0; }],
      ['negative wall height', (f) => { Object.values<any>(level0(f).walls)[0].height = -1; }],
      ['zero background scale', (f) => { level0(f).background.scale = 0; }],
      ['zero background widthPx', (f) => { level0(f).background.widthPx = 0; }],
      ['negative background heightPx', (f) => { level0(f).background.heightPx = -2; }],
      ['opacity above 1', (f) => { level0(f).background.opacity = 1.5; }],
      ['opacity below 0', (f) => { level0(f).background.opacity = -0.1; }],
      ['zero opening width', (f) => { Object.values<any>(level0(f).openings)[0].width = 0; }],
      ['negative sill height', (f) => { Object.values<any>(level0(f).openings)[0].sillHeight = -1; }],
      ['zero object depth', (f) => { Object.values<any>(level0(f).objects)[0].depth = 0; }],
      ['huge object x', (f) => { Object.values<any>(level0(f).objects)[0].x = 1e9; }],
      ['negative custom object width', (f) => { Object.values<any>(f.project.customObjects)[0].width = -1; }],
      ['zero notch', (f) => { Object.values<any>(f.project.customObjects)[0].lshape.notchWidth = 0; }],
      ['huge anchor point', (f) => { Object.values<any>(level0(f).dimensions)[0].b.x = 1e7; }],
      ['huge label anchor', (f) => { level0(f).roomLabels[0].anchor.y = -1e7; }],
    ];
    for (const [label, mutate] of cases) {
      it(`refuses ${label}`, () => {
        const f = exported(richProject());
        mutate(f);
        failsWith(f, /^Fichier invalide : /);
      });
    }

    it('accepts values at the bounds', () => {
      const f = exported(richProject());
      f.project.settings.gridStep = 1e6;
      level0(f).background.opacity = 0;
      level0(f).background.opacity = 1;
      level0(f).elevation = -1e6;
      expect(parseImport(JSON.stringify(f)).ok).toBe(true);
    });
  });

  describe('image payloads', () => {
    const withImage = (img: unknown): any => {
      const f = exported(richProject());
      f.images[Object.keys(f.images)[0]!] = img;
      return f;
    };

    it('refuses a non base64 payload', () => {
      failsWith(withImage({ mime: 'image/png', data: '!!!not base64***' }), /^Fichier invalide : images\.[^ ]+\.data image corrompue/);
    });

    it('refuses a payload with a data: prefix, bad padding or wrong length', () => {
      for (const data of ['data:image/png;base64,iVBORw0KGgo=', 'iVBORw0KGgo', 'iVBO=Rw0K', 'a', '']) {
        failsWith(withImage({ mime: 'image/png', data }), /^Fichier invalide : images\./);
      }
    });

    it('refuses non raster mime types', () => {
      for (const mime of ['text/html', 'image/svg+xml', 'application/pdf', 'png', 'image/png ']) {
        failsWith(withImage({ mime, data: 'iVBORw0KGgo=' }), /^Fichier invalide : images\.[^ ]+\.mime type d'image non pris en charge/);
      }
    });

    it('accepts png, jpeg, webp and gif with valid base64', () => {
      for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
        for (const data of ['AA==', 'AAA=', 'AAAA', 'iVBORw0KGgo=', 'a+/9']) {
          expect(parseImport(JSON.stringify(withImage({ mime, data }))).ok).toBe(true);
        }
      }
    });
  });
});
