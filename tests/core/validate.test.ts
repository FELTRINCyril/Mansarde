import { describe, expect, it } from 'vitest';
import { validateProject } from '@/core/commands/validate';
import { createObjectFromSize, createOpening, createProject } from '@/core/model/factory';
import type { Level, Project } from '@/core/model/types';
import { levelFromWalls, rectRoom } from './fixtures';

function projectWith(level: Level): Project {
  const p = createProject('T');
  p.levels = [level];
  return p;
}

const firstWallId = (l: Level): string => Object.keys(l.walls)[0]!;

describe('validateProject', () => {
  it('accepts the default project', () => {
    expect(validateProject(createProject('T'))).toEqual([]);
  });

  it('accepts a closed room with an opening and an object', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const w = firstWallId(level);
    const o = createOpening(w, 'door', 200);
    level.openings[o.id] = o;
    const obj = createObjectFromSize({ kind: 'catalog', catalogId: 'sofa' }, 100, 100, { width: 80, depth: 80, height: 80 }, 'S', '#fff');
    level.objects[obj.id] = obj;
    expect(validateProject(projectWith(level))).toEqual([]);
  });

  it('flags an orphan node', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    level.nodes['orphan'] = { id: 'orphan', x: 9, y: 9 };
    expect(validateProject(projectWith(level)).join('\n')).toMatch(/orphan/i);
  });

  it('flags a wall with a missing node, identical nodes, too short, bad thickness or height', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const [w1, w2, w3, w4] = Object.values(level.walls);
    w1!.endNodeId = 'ghost';
    w2!.endNodeId = w2!.startNodeId;
    w3!.thickness = 0;
    w4!.height = -5;
    const problems = validateProject(projectWith(level));
    expect(problems.length).toBeGreaterThanOrEqual(4);
    expect(problems.join('\n')).toMatch(/ghost|missing|introuvable|node/i);
  });

  it('flags a wall shorter than MIN_WALL_LENGTH', () => {
    const level = levelFromWalls([[0, 0, 0.5, 0]]);
    expect(validateProject(projectWith(level)).join('\n')).toMatch(/short|length/i);
  });

  it('flags two walls between the same pair of nodes', () => {
    const level = levelFromWalls([
      [0, 0, 100, 0],
      [100, 0, 0, 0],
    ]);
    expect(validateProject(projectWith(level)).join('\n')).toMatch(/duplicate|same pair/i);
  });

  it('flags an opening on a missing wall', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const o = createOpening('ghost', 'door', 100);
    level.openings[o.id] = o;
    expect(validateProject(projectWith(level)).length).toBeGreaterThan(0);
  });

  it('flags an opening that overflows its wall', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const o = createOpening(firstWallId(level), 'door', 390);
    level.openings[o.id] = o;
    expect(validateProject(projectWith(level)).join('\n')).toMatch(/fit|overflow|exceed/i);
  });

  it('flags an opening with non-positive width', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const o = createOpening(firstWallId(level), 'door', 200, { width: 0 });
    level.openings[o.id] = o;
    expect(validateProject(projectWith(level)).length).toBeGreaterThan(0);
  });

  it('flags two overlapping openings on the same wall but not on different walls', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const [w1, w2] = Object.keys(level.walls);
    const a = createOpening(w1!, 'door', 100);
    const b = createOpening(w1!, 'window', 150);
    level.openings[a.id] = a;
    level.openings[b.id] = b;
    expect(validateProject(projectWith(level)).join('\n')).toMatch(/overlap/i);
    delete level.openings[b.id];
    const c = createOpening(w2!, 'window', 100);
    level.openings[c.id] = c;
    expect(validateProject(projectWith(level))).toEqual([]);
  });

  it('flags NaN in an object', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const obj = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, Number.NaN, 0, { width: 50, depth: 50, height: 50 }, 'N', '#000');
    level.objects[obj.id] = obj;
    expect(validateProject(projectWith(level)).length).toBeGreaterThan(0);
  });

  it('flags non-positive object size and Infinity', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const a = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 0, 0, { width: 0, depth: 50, height: 50 }, 'A', '#000');
    const b = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, Infinity, 0, { width: 5, depth: 50, height: 50 }, 'B', '#000');
    level.objects[a.id] = a;
    level.objects[b.id] = b;
    expect(validateProject(projectWith(level)).length).toBeGreaterThanOrEqual(2);
  });

  it('flags a custom object whose definition is missing', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const obj = createObjectFromSize({ kind: 'custom', customObjectId: 'nope' }, 0, 0, { width: 50, depth: 50, height: 50 }, 'C', '#000');
    level.objects[obj.id] = obj;
    expect(validateProject(projectWith(level)).join('\n')).toMatch(/custom/i);
  });

  it('flags dimension anchors pointing to missing elements', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const nodeId = Object.keys(level.nodes)[0]!;
    level.dimensions['d1'] = { id: 'd1', a: { kind: 'node', nodeId }, b: { kind: 'point', x: 5, y: 5 }, offset: 20 };
    expect(validateProject(projectWith(level))).toEqual([]);
    level.dimensions['d2'] = { id: 'd2', a: { kind: 'node', nodeId: 'ghost' }, b: { kind: 'objectCorner', objectId: 'ghost', corner: 0 }, offset: 20 };
    expect(validateProject(projectWith(level)).length).toBeGreaterThanOrEqual(2);
  });

  it('flags a non finite value anywhere (level elevation)', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    level.elevation = Number.NaN;
    expect(validateProject(projectWith(level)).length).toBeGreaterThan(0);
  });

  it('flags no level and duplicate level ids', () => {
    const p = createProject('T');
    p.levels = [];
    expect(validateProject(p).length).toBeGreaterThan(0);
    const q = createProject('T');
    q.levels = [q.levels[0]!, { ...q.levels[0]! }];
    expect(validateProject(q).join('\n')).toMatch(/level/i);
  });

  it('flags non-positive or non-finite project settings', () => {
    for (const key of ['gridStep', 'defaultWallThickness', 'partitionThickness', 'defaultCeilingHeight'] as const) {
      for (const v of [0, -5, Number.POSITIVE_INFINITY]) {
        const p = createProject('T');
        p.settings[key] = v;
        expect(validateProject(p).some((m) => m.includes(`Setting ${key}`))).toBe(true);
      }
    }
  });

  it('looks ids up by own keys: prototype property names are dangling references', () => {
    const names = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];
    for (const name of names) {
      const level = levelFromWalls(rectRoom(0, 0, 400, 300));
      const wallId = firstWallId(level);
      level.openings.x = { ...createOpening(wallId, 'door', 200), id: 'x', wallId: name };
      expect(validateProject(projectWith(level))).toContain('Level "Test" opening x: wall not found');

      const l2 = levelFromWalls(rectRoom(0, 0, 400, 300));
      l2.walls[firstWallId(l2)]!.startNodeId = name;
      expect(validateProject(projectWith(l2)).some((m) => m.endsWith('missing node'))).toBe(true);

      const l3 = levelFromWalls(rectRoom(0, 0, 400, 300));
      const obj = createObjectFromSize({ kind: 'custom', customObjectId: name }, 1, 1, { width: 1, depth: 1, height: 1 }, 'S', '#fff');
      l3.objects[obj.id] = obj;
      expect(validateProject(projectWith(l3)).some((m) => m.endsWith('custom object definition not found'))).toBe(true);

      const l4 = levelFromWalls(rectRoom(0, 0, 400, 300));
      l4.dimensions.d = { id: 'd', a: { kind: 'node', nodeId: name }, b: { kind: 'objectCorner', objectId: name, corner: 0 }, offset: 0 };
      const problems = validateProject(projectWith(l4));
      expect(problems.some((m) => m.endsWith('node not found'))).toBe(true);
      expect(problems.some((m) => m.endsWith('object not found'))).toBe(true);
    }
  });
});
