import { describe, expect, it } from 'vitest';
import { validateProject } from '@/core/commands/validate';
import { cloneLevelWithNewIds, cloneProjectWithNewIds } from '@/core/model/clone';
import { createObjectFromSize, createOpening, createProject } from '@/core/model/factory';
import type { Id, Level, Project } from '@/core/model/types';
import { levelFromWalls, rectRoom } from './fixtures';

function allIds(level: Level): Id[] {
  return [
    level.id,
    ...Object.keys(level.nodes),
    ...Object.keys(level.walls),
    ...Object.keys(level.openings),
    ...Object.keys(level.objects),
    ...Object.keys(level.dimensions),
    ...level.roomLabels.map((l) => l.id),
  ];
}

function richLevel(): Level {
  const level = levelFromWalls(rectRoom(0, 0, 400, 300));
  const wallId = Object.keys(level.walls)[0]!;
  const door = createOpening(wallId, 'door', 200);
  level.openings[door.id] = door;
  const obj = createObjectFromSize({ kind: 'catalog', catalogId: 'sofa' }, 100, 100, { width: 80, depth: 80, height: 80 }, 'S', '#fff');
  level.objects[obj.id] = obj;
  const nodeId = Object.keys(level.nodes)[0]!;
  level.dimensions['dim'] = {
    id: 'dim',
    a: { kind: 'node', nodeId },
    b: { kind: 'objectCorner', objectId: obj.id, corner: 2 },
    offset: 30,
  };
  level.roomLabels.push({ id: 'lab', name: 'Salon', anchor: { x: 200, y: 150 } });
  return level;
}

describe('cloneLevelWithNewIds', () => {
  it('shares no id with the original, keeps counts and valid references', () => {
    const orig = richLevel();
    const copy = cloneLevelWithNewIds(orig);
    const origIds = new Set(allIds(orig));
    expect(allIds(copy).filter((i) => origIds.has(i))).toEqual([]);
    expect(Object.keys(copy.nodes)).toHaveLength(4);
    expect(Object.keys(copy.walls)).toHaveLength(4);
    expect(Object.keys(copy.openings)).toHaveLength(1);
    expect(Object.keys(copy.objects)).toHaveLength(1);
    expect(Object.keys(copy.dimensions)).toHaveLength(1);
    expect(copy.roomLabels).toHaveLength(1);
    expect(copy.roomLabels[0]!.name).toBe('Salon');
    const p = createProject('T');
    p.levels = [orig, copy];
    expect(validateProject(p)).toEqual([]);
  });

  it('keeps record keys equal to element ids and does not modify the original', () => {
    const orig = richLevel();
    const before = JSON.stringify(orig);
    const copy = cloneLevelWithNewIds(orig);
    expect(JSON.stringify(orig)).toBe(before);
    for (const rec of [copy.nodes, copy.walls, copy.openings, copy.objects, copy.dimensions]) {
      for (const [k, v] of Object.entries(rec)) expect(v.id).toBe(k);
    }
  });
});

describe('cloneProjectWithNewIds', () => {
  function richProject(): Project {
    const p = createProject('Maison');
    p.levels = [richLevel()];
    p.customObjects['c1'] = { id: 'c1', name: 'Meuble', shape: 'rect', width: 50, depth: 40, height: 100, color: '#abc', lshape: null };
    const obj = createObjectFromSize({ kind: 'custom', customObjectId: 'c1' }, 50, 50, { width: 50, depth: 40, height: 100 }, 'M', '#abc');
    p.levels[0]!.objects[obj.id] = obj;
    p.levels[0]!.background = {
      imageId: 'img1', widthPx: 100, heightPx: 100, scale: 1, x: 0, y: 0, rotation: 0, opacity: 0.5, locked: false, visible: true,
    };
    return p;
  }

  it('remaps project, level, element, custom object and image ids', () => {
    const orig = richProject();
    const map = new Map([['img1', 'img2']]);
    const copy = cloneProjectWithNewIds(orig, map);
    expect(copy.id).not.toBe(orig.id);
    expect(copy.name).toBe(orig.name);
    expect(copy.levels[0]!.id).not.toBe(orig.levels[0]!.id);
    const origIds = new Set(allIds(orig.levels[0]!));
    expect(allIds(copy.levels[0]!).filter((i) => origIds.has(i))).toEqual([]);
    expect(Object.keys(copy.customObjects)).not.toContain('c1');
    const newCustomId = Object.keys(copy.customObjects)[0]!;
    expect(copy.customObjects[newCustomId]!.id).toBe(newCustomId);
    const customObj = Object.values(copy.levels[0]!.objects).find((o) => o.source.kind === 'custom')!;
    expect(customObj.source).toEqual({ kind: 'custom', customObjectId: newCustomId });
    expect(copy.levels[0]!.background!.imageId).toBe('img2');
    expect(validateProject(copy)).toEqual([]);
  });

  it('keeps the image id when no map is provided', () => {
    const copy = cloneProjectWithNewIds(richProject());
    expect(copy.levels[0]!.background!.imageId).toBe('img1');
  });

  it('does not modify the original', () => {
    const orig = richProject();
    const before = JSON.stringify(orig);
    cloneProjectWithNewIds(orig);
    expect(JSON.stringify(orig)).toBe(before);
  });
});
