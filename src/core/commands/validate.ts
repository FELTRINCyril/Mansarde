import { MIN_WALL_LENGTH } from '../model/defaults';
import type { Level, Project } from '../model/types';
import { openingFitsWall, openingsOverlap } from '../geometry/openings';
import { wallLength } from '../geometry/walls';

/** Checks every document invariant; returns human-readable problems (empty = valid). */
export function validateProject(p: Project): string[] {
  const problems: string[] = [];
  collectNonFinite(p, 'project', problems);

  if (p.levels.length === 0) problems.push('Project has no level');
  const seenLevels = new Set<string>();
  for (const level of p.levels) {
    if (seenLevels.has(level.id)) problems.push(`Duplicate level id ${level.id}`);
    seenLevels.add(level.id);
    validateLevel(p, level, problems);
  }
  return problems;
}

function collectNonFinite(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`Non-finite number at ${path}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectNonFinite(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectNonFinite(v, `${path}.${k}`, out);
  }
}

function validateLevel(p: Project, level: Level, out: string[]): void {
  const where = `Level "${level.name}"`;

  // 1. walls
  const usedNodes = new Set<string>();
  const pairs = new Set<string>();
  const validWalls = new Set<string>();
  for (const wall of Object.values(level.walls)) {
    const tag = `${where} wall ${wall.id}`;
    const hasStart = level.nodes[wall.startNodeId] !== undefined;
    const hasEnd = level.nodes[wall.endNodeId] !== undefined;
    if (!hasStart || !hasEnd) {
      out.push(`${tag}: missing node`);
      continue;
    }
    usedNodes.add(wall.startNodeId);
    usedNodes.add(wall.endNodeId);
    let ok = true;
    if (wall.startNodeId === wall.endNodeId) {
      out.push(`${tag}: start and end node are identical`);
      ok = false;
    } else {
      const key = [wall.startNodeId, wall.endNodeId].sort().join('|');
      if (pairs.has(key)) out.push(`${tag}: duplicate wall on the same pair of nodes`);
      pairs.add(key);
      if (!(wallLength(level, wall.id) >= MIN_WALL_LENGTH)) {
        out.push(`${tag}: length below ${MIN_WALL_LENGTH} cm`);
        ok = false;
      }
    }
    if (!(wall.thickness > 0)) out.push(`${tag}: thickness must be positive`);
    if (!(wall.height > 0)) out.push(`${tag}: height must be positive`);
    if (ok) validWalls.add(wall.id);
  }

  // 2. orphan nodes
  for (const node of Object.values(level.nodes)) {
    if (!usedNodes.has(node.id)) out.push(`${where}: orphan node ${node.id}`);
  }

  // 4. openings
  const byWall = new Map<string, Level['openings'][string][]>();
  for (const o of Object.values(level.openings)) {
    const tag = `${where} opening ${o.id}`;
    if (level.walls[o.wallId] === undefined) {
      out.push(`${tag}: wall not found`);
      continue;
    }
    if (!(o.width > 0)) out.push(`${tag}: width must be positive`);
    if (validWalls.has(o.wallId) && !openingFitsWall(o, wallLength(level, o.wallId))) {
      out.push(`${tag}: does not fit in its wall`);
    }
    const list = byWall.get(o.wallId) ?? [];
    list.push(o);
    byWall.set(o.wallId, list);
  }
  for (const list of byWall.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (openingsOverlap(list[i]!, list[j]!)) {
          out.push(`${where}: openings ${list[i]!.id} and ${list[j]!.id} overlap`);
        }
      }
    }
  }

  // 5. objects
  for (const obj of Object.values(level.objects)) {
    const tag = `${where} object ${obj.id}`;
    if (!(obj.width > 0) || !(obj.depth > 0) || !(obj.height > 0)) out.push(`${tag}: size must be positive`);
    if (!Number.isFinite(obj.x) || !Number.isFinite(obj.y)) out.push(`${tag}: coordinates must be finite`);
    if (obj.source.kind === 'custom' && p.customObjects[obj.source.customObjectId] === undefined) {
      out.push(`${tag}: custom object definition not found`);
    }
  }

  // 6. dimensions (existence only: resolution is the job of resolveAnchor)
  for (const dim of Object.values(level.dimensions)) {
    for (const [side, anchor] of [['a', dim.a], ['b', dim.b]] as const) {
      const tag = `${where} dimension ${dim.id} anchor ${side}`;
      if (anchor.kind === 'node' && level.nodes[anchor.nodeId] === undefined) out.push(`${tag}: node not found`);
      if (anchor.kind === 'objectCorner' && level.objects[anchor.objectId] === undefined) {
        out.push(`${tag}: object not found`);
      }
    }
  }
}
