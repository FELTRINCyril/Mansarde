import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILTIN_CATALOG, getCatalogEntry } from '@/catalog/catalog';
import { validateProject } from '@/core/commands/validate';
import { cloneLevelWithNewIds, cloneProjectWithNewIds } from '@/core/model/clone';
import { BEAM_DEFAULTS, CUPBOARD_DEFAULTS, DEFAULT_SETTINGS, MAX_CUPBOARD_DOORS, SLOPE_DEFAULT_END, doorCountFor } from '@/core/model/defaults';
import { createBeam, createCupboard, createLevel, createObjectFromSize, createProject, createSlope } from '@/core/model/factory';
import type { Level, ObjectPose, Project } from '@/core/model/types';
import { parseImport, serializeExport } from '@/core/persistence/exchange';
import { projectSchema } from '@/core/persistence/schema';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

/** Room 400 x 300 with one slope, one beam and one cupboard on the top wall (0,0)-(400,0). */
function v2Level(): Level {
  const level = levelFromWalls(rectRoom(0, 0, 400, 300));
  const top = findWall(level, 0, 0, 400, 0);
  const slope = createSlope({ x: 0, y: 150 }, { x: 400, y: 150 }, 'left', 100, 250);
  const beam = createBeam({ x: 200, y: 0 }, { x: 200, y: 300 });
  const cupboard = createCupboard(top, 100, 'left');
  level.slopes[slope.id] = slope;
  level.beams[beam.id] = beam;
  level.cupboards[cupboard.id] = cupboard;
  return level;
}

function projectWith(level: Level): Project {
  const p = createProject('V2', new Date('2026-10-08T00:00:00.000Z'));
  p.levels = [level];
  return p;
}

const only = <T>(rec: Record<string, T>): T => Object.values(rec)[0]!;

/**
 * Statements of a module source that load another module at run time: static imports and
 * re-exports that are not `type`-only, dynamic import() and require(). String literals and
 * comments are blanked first so that their content is never mistaken for code.
 */
function runtimeImports(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
  const patterns = [
    /^\s*import\s+(?!type[\s{])[^;]*/gm, // import x / import { } / import '...'
    /^\s*export\s+(?!type[\s{])(?:\*|\{)[^;]*?\bfrom\b[^;]*/gm, // export * / export { } from
    /\bimport\s*\(/g,
    /\brequire\s*\(/g,
  ];
  return patterns.flatMap((re) => code.match(re) ?? []);
}

describe('V2 factories and defaults', () => {
  it('createLevel has empty slopes, beams and cupboards', () => {
    const level = createLevel('RDC', 0, 250);
    expect(level.slopes).toEqual({});
    expect(level.beams).toEqual({});
    expect(level.cupboards).toEqual({});
  });

  it('default values', () => {
    expect(SLOPE_DEFAULT_END).toBe(150);
    expect(BEAM_DEFAULTS).toEqual({ width: 12, drop: 15 });
    expect(CUPBOARD_DEFAULTS).toEqual({ width: 120, depth: 60, plinth: 10, height: 220, gap: 2, color: '#e8e1d4', doorType: 'hinged' });
  });

  it('doorCountFor rounds width / 55 with at least one door', () => {
    expect(doorCountFor(30)).toBe(1);
    expect(doorCountFor(0)).toBe(1);
    expect(doorCountFor(120)).toBe(2);
    expect(doorCountFor(150)).toBe(3); // 2.73
    expect(doorCountFor(220)).toBe(4);
  });

  it('doorCountFor never exceeds MAX_CUPBOARD_DOORS (ruling V2-R2)', () => {
    expect(doorCountFor(55 * 20)).toBe(20);
    expect(doorCountFor(55 * 21)).toBe(MAX_CUPBOARD_DOORS);
    expect(doorCountFor(100000)).toBe(MAX_CUPBOARD_DOORS);
  });

  it('createCupboard uses the defaults and computes the door count from the width', () => {
    const c = createCupboard('w', 100, 'left');
    expect(c).toMatchObject({
      wallId: 'w', offset: 100, side: 'left', width: 120, depth: 60, plinth: 10,
      heightMode: 'fixed', height: 220, gap: 2, doorCount: 2, doorType: 'hinged', color: '#e8e1d4',
    });
    expect(c.id).toBeTruthy();
    expect(createCupboard('w', 100, 'right', { width: 200 }).doorCount).toBe(4);
    expect(createCupboard('w', 100, 'right', { width: 200, doorCount: 1 }).doorCount).toBe(1);
    expect(createCupboard('w', 100, 'left').id).not.toBe(c.id);
  });

  it('createSlope defaults heightEnd to 150', () => {
    const s = createSlope({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 80, 240);
    expect(s).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, side: 'right', depth: 80, heightStart: 240, heightEnd: 150 });
    expect(createSlope({ x: 0, y: 0 }, { x: 100, y: 0 }, 'left', 80, 240, 120).heightEnd).toBe(120);
  });

  it('createBeam: width 12, drop 15, ceiling mode, positive bottom', () => {
    const b = createBeam({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(b).toMatchObject({ width: 12, drop: 15, mode: 'ceiling' });
    expect(b.bottom).toBe(DEFAULT_SETTINGS.defaultCeilingHeight - 15);
    expect(createBeam({ x: 0, y: 0 }, { x: 100, y: 0 }, { mode: 'fixed', bottom: 225 })).toMatchObject({ mode: 'fixed', bottom: 225 });
  });

  it('createObjectFromSize defaults the pose to floor', () => {
    const size = { width: 50, depth: 50, height: 80 };
    expect(createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 0, 0, size, 'C', '#fff').pose).toBe('floor');
    expect(createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 0, 0, size, 'C', '#fff', { pose: 'tuckable' }).pose).toBe('tuckable');
  });
});

describe('catalog pose fields', () => {
  it('chair and pouf are tuckable, tables and desk accept objects under them, V2 entries have their pose, the rest stands on the floor', () => {
    const under = ['desk', 'table-rect', 'table-round', 'coffee-table'];
    // full pose table: tests/core/catalog.test.tsx
    const v2: Record<string, string> = {
      chair: 'tuckable', pouf: 'tuckable', tv: 'onTop', 'bedside-lamp': 'onTop', microwave: 'onTop',
      'tv-wall': 'wall', 'shelf-wall': 'wall', 'rug-round': 'covering', 'rug-rect': 'covering',
    };
    for (const e of BUILTIN_CATALOG) {
      expect(e.pose, e.id).toBe(v2[e.id] ?? 'floor');
      expect(e.acceptsUnder === true, e.id).toBe(under.includes(e.id));
    }
    expect(getCatalogEntry('chair')!.pose).toBe('tuckable');
  });

  it('the runtime-import detector catches every form of module dependency', () => {
    expect(runtimeImports("import type { A } from './a';\nexport type { B } from './b';\nconst s = 'import(';")).toEqual([]);
    for (const bad of [
      "import { A } from './a';",
      "import React from 'react';",
      "import './side-effect';",
      "import {\n  A,\n} from './a';",
      "import { type A } from './a';", // keeps an `import {}` under verbatimModuleSyntax
      "export { A } from './a';",
      "export * from './a';",
      "export * as ns from './a';",
      "export {\n  A,\n} from './a';",
      "const m = await import('./a');",
      "const m = import ('./a');",
      "const r = require('react');",
    ]) {
      expect(runtimeImports(bad), bad).not.toEqual([]);
    }
  });

  it('catalog.ts stays importable from src/core: type-only imports, plus its generated JSON data', () => {
    // the migration (src/core) reads catalog poses; catalog.ts must never pull React or the DOM.
    // The one runtime import allowed is the list of downloaded models: a JSON file, data only.
    const source = readFileSync('src/catalog/catalog.ts', 'utf8');
    expect(source).toMatch(/^import type /m);
    const data = /^import \w+ from '\.\/generated\/[\w-]+\.json';$/gm;
    expect(source.match(data)).toHaveLength(1);
    expect(runtimeImports(source.replace(data, ''))).toEqual([]);
  });
});

describe('validateProject V2 invariants', () => {
  it('accepts a level with a slope, a beam and a cupboard', () => {
    expect(validateProject(projectWith(v2Level()))).toEqual([]);
  });

  const cases: Array<[string, (l: Level) => void, RegExp]> = [
    ['a cupboard wider than its wall', (l) => { only(l.cupboards).width = 500; }, /cupboard .*does not fit/],
    ['a cupboard past the wall start', (l) => { only(l.cupboards).offset = 59; }, /cupboard .*does not fit/],
    ['a cupboard past the wall end', (l) => { only(l.cupboards).offset = 341; }, /cupboard .*does not fit/],
    ['a cupboard on a missing wall', (l) => { only(l.cupboards).wallId = 'nope'; }, /cupboard .*wall not found/],
    ['a cupboard on a wall named like a prototype key', (l) => { only(l.cupboards).wallId = 'constructor'; }, /cupboard .*wall not found/],
    ['a cupboard of zero depth', (l) => { only(l.cupboards).depth = 0; }, /cupboard .*depth/],
    ['a cupboard of negative plinth', (l) => { only(l.cupboards).plinth = -1; }, /cupboard .*plinth/],
    ['a cupboard of zero height', (l) => { only(l.cupboards).height = 0; }, /cupboard .*height/],
    ['a cupboard of negative gap', (l) => { only(l.cupboards).gap = -1; }, /cupboard .*gap/],
    ['a cupboard with 0 doors', (l) => { only(l.cupboards).doorCount = 0; }, /cupboard .*door count/],
    ['a cupboard with 1.5 doors', (l) => { only(l.cupboards).doorCount = 1.5; }, /cupboard .*door count/],
    ['a cupboard with 21 doors', (l) => { only(l.cupboards).doorCount = 21; }, /cupboard .*door count/],
    ['a slope of depth 0', (l) => { only(l.slopes).depth = 0; }, /slope .*depth/],
    ['a slope of length 0', (l) => { only(l.slopes).b = { ...only(l.slopes).a }; }, /slope .*length/],
    ['a slope of zero end height', (l) => { only(l.slopes).heightEnd = 0; }, /slope .*height/],
    ['a slope of negative start height', (l) => { only(l.slopes).heightStart = -5; }, /slope .*height/],
    ['a beam of length 0', (l) => { only(l.beams).b = { ...only(l.beams).a }; }, /beam .*length/],
    ['a beam of zero width', (l) => { only(l.beams).width = 0; }, /beam .*width/],
    ['a beam of zero drop', (l) => { only(l.beams).drop = 0; }, /beam .*drop/],
    ['a beam of zero bottom', (l) => { only(l.beams).bottom = 0; }, /beam .*bottom/],
  ];
  for (const [label, mutate, message] of cases) {
    it(`refuses ${label}`, () => {
      const level = v2Level();
      mutate(level);
      const problems = validateProject(projectWith(level));
      expect(problems.some((p) => message.test(p)), problems.join(' | ')).toBe(true);
    });
  }

  it('accepts a cupboard with 20 doors (ruling V2-R2 upper bound)', () => {
    const level = v2Level();
    only(level.cupboards).doorCount = 20;
    expect(validateProject(projectWith(level))).toEqual([]);
  });

  it('accepts a cupboard exactly as wide as its wall (tolerance 1e-6)', () => {
    const level = v2Level();
    Object.assign(only(level.cupboards), { width: 400, offset: 200 + 5e-7 });
    expect(validateProject(projectWith(level))).toEqual([]);
  });

  it('refuses an unknown object pose and an unknown custom definition pose', () => {
    const level = v2Level();
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 100, 100, { width: 50, depth: 50, height: 80 }, 'C', '#fff');
    o.pose = 'flying' as ObjectPose;
    level.objects[o.id] = o;
    const p = projectWith(level);
    p.customObjects.c1 = { id: 'c1', name: 'X', shape: 'rect', width: 10, depth: 10, height: 10, color: '#fff', lshape: null, pose: 'hanging' as ObjectPose };
    const problems = validateProject(p);
    expect(problems.some((m) => /object [^:]+: unknown pose/.test(m) && m.startsWith('Level')), problems.join(' | ')).toBe(true);
    expect(problems.some((m) => /Custom object c1: unknown pose/.test(m)), problems.join(' | ')).toBe(true);
  });
});

describe('cloning V2 elements', () => {
  it('cloneLevelWithNewIds gives new ids and remaps the cupboard wall', () => {
    const orig = v2Level();
    const copy = cloneLevelWithNewIds(orig);
    const cupboard = only(copy.cupboards);
    const origCupboard = only(orig.cupboards);
    expect(cupboard.id).not.toBe(origCupboard.id);
    expect(Object.keys(copy.cupboards)).toEqual([cupboard.id]);
    expect(Object.hasOwn(copy.walls, cupboard.wallId)).toBe(true);
    expect(orig.walls[cupboard.wallId]).toBeUndefined();
    // same wall geometry: the clone of the top wall
    const w = copy.walls[cupboard.wallId]!;
    expect([copy.nodes[w.startNodeId], copy.nodes[w.endNodeId]].map((n) => [n!.x, n!.y])).toEqual([[0, 0], [400, 0]]);
    for (const kind of ['slopes', 'beams'] as const) {
      const a = only<{ id: string }>(orig[kind]);
      const b = only<{ id: string }>(copy[kind]);
      expect(b.id).not.toBe(a.id);
      expect(Object.keys(copy[kind])).toEqual([b.id]);
      expect({ ...b, id: a.id }).toEqual(a);
    }
    expect({ ...cupboard, id: origCupboard.id, wallId: origCupboard.wallId }).toEqual(origCupboard);
    const p = projectWith(orig);
    p.levels.push(copy);
    expect(validateProject(p)).toEqual([]);
  });

  it('cloneProjectWithNewIds clones V2 elements too and keeps the custom pose', () => {
    const p = projectWith(v2Level());
    p.customObjects.c1 = { id: 'c1', name: 'Tapis', shape: 'rect', width: 10, depth: 10, height: 1, color: '#fff', lshape: null, pose: 'covering' };
    const copy = cloneProjectWithNewIds(p);
    expect(only(copy.levels[0]!.cupboards).id).not.toBe(only(p.levels[0]!.cupboards).id);
    expect(only(copy.customObjects).pose).toBe('covering');
    expect(validateProject(copy)).toEqual([]);
  });
});

describe('schema of V2 elements', () => {
  it('round-trips slopes, beams, cupboards and poses through an export file', () => {
    const p = projectWith(v2Level());
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 100, 100, { width: 50, depth: 50, height: 80 }, 'C', '#fff', { pose: 'tuckable' });
    p.levels[0]!.objects[o.id] = o;
    const text = serializeExport(p, {});
    expect(JSON.parse(text).formatVersion).toBe(2);
    expect(parseImport(text)).toEqual({ ok: true, project: p, images: {} });
  });

  const cases: Array<[string, (level: Record<string, any>) => void]> = [
    ['a slope keyed by another id', (l) => { const s = Object.values<any>(l.slopes)[0]; l.slopes = { other: s }; }],
    ['a beam keyed by another id', (l) => { const s = Object.values<any>(l.beams)[0]; l.beams = { other: s }; }],
    ['a cupboard keyed by another id', (l) => { const s = Object.values<any>(l.cupboards)[0]; l.cupboards = { other: s }; }],
    ['a slope point beyond 1e6', (l) => { Object.values<any>(l.slopes)[0].a.x = 1e6 + 1; }],
    ['a beam point beyond 1e6', (l) => { Object.values<any>(l.beams)[0].b.y = -1e7; }],
    ['a negative slope depth', (l) => { Object.values<any>(l.slopes)[0].depth = -1; }],
    ['an unknown slope side', (l) => { Object.values<any>(l.slopes)[0].side = 'up'; }],
    ['an unknown beam mode', (l) => { Object.values<any>(l.beams)[0].mode = 'floating'; }],
    ['a zero cupboard width', (l) => { Object.values<any>(l.cupboards)[0].width = 0; }],
    ['a fractional door count', (l) => { Object.values<any>(l.cupboards)[0].doorCount = 2.5; }],
    ['a door count of 21', (l) => { Object.values<any>(l.cupboards)[0].doorCount = 21; }],
    ['a door count of 0', (l) => { Object.values<any>(l.cupboards)[0].doorCount = 0; }],
    ['a negative plinth', (l) => { Object.values<any>(l.cupboards)[0].plinth = -1; }],
    ['a negative gap', (l) => { Object.values<any>(l.cupboards)[0].gap = -0.5; }],
    ['a zero slope start height', (l) => { Object.values<any>(l.slopes)[0].heightStart = 0; }],
    ['a zero slope end height', (l) => { Object.values<any>(l.slopes)[0].heightEnd = 0; }],
    ['a zero beam width', (l) => { Object.values<any>(l.beams)[0].width = 0; }],
    ['an unknown door type', (l) => { Object.values<any>(l.cupboards)[0].doorType = 'folding'; }],
    ['an unknown height mode', (l) => { Object.values<any>(l.cupboards)[0].heightMode = 'auto'; }],
    ['an extra cupboard key', (l) => { Object.values<any>(l.cupboards)[0].extra = 1; }],
    ['a missing slopes record', (l) => { delete l.slopes; }],
    ['an unknown object pose', (l) => { Object.values<any>(l.objects).forEach((o) => { o.pose = 'flying'; }); }],
  ];
  for (const [label, mutate] of cases) {
    it(`refuses ${label}`, () => {
      const p = projectWith(v2Level());
      const o = createObjectFromSize({ kind: 'catalog', catalogId: 'chair' }, 100, 100, { width: 50, depth: 50, height: 80 }, 'C', '#fff');
      p.levels[0]!.objects[o.id] = o;
      const f = JSON.parse(serializeExport(p, {}));
      expect(projectSchema.safeParse(f.project).success).toBe(true); // control: valid before the mutation
      mutate(f.project.levels[0]);
      // refused by the schema itself, not only by validateProject afterwards
      expect(projectSchema.safeParse(f.project).success).toBe(false);
      const r = parseImport(JSON.stringify(f));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Fichier invalide : /);
    });
  }

  it('accepts a door count of 20 (ruling V2-R2 upper bound)', () => {
    const p = projectWith(v2Level());
    only(p.levels[0]!.cupboards).doorCount = 20;
    expect(projectSchema.safeParse(JSON.parse(JSON.stringify(p))).success).toBe(true);
    expect(parseImport(serializeExport(p, {}))).toEqual({ ok: true, project: p, images: {} });
  });
});
