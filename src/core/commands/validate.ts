import { MIN_WALL_LENGTH } from '../model/defaults';
import { OBJECT_POSES } from '../model/types';
import type { Level, ObjectPose, Project, Vec2 } from '../model/types';
import { openingFitsWall, openingsOverlap } from '../geometry/openings';
import { wallLength } from '../geometry/walls';

// Ids come from untrusted files: look records up by own keys only (never "constructor", "toString"...).
const has = (rec: object, key: string): boolean => Object.hasOwn(rec, key);
const isPose = (v: unknown): boolean => (OBJECT_POSES as readonly unknown[]).includes(v as ObjectPose);
const segmentLength = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
const FIT_EPS = 1e-6;

/** Checks every document invariant; returns human-readable problems (empty = valid). */
export function validateProject(p: Project): string[] {
  const problems: string[] = [];
  collectNonFinite(p, 'project', problems);
  for (const [name, v] of Object.entries(p.settings)) {
    if (!(v > 0) || !Number.isFinite(v)) problems.push(`Setting ${name} must be positive and finite`);
  }

  if (p.levels.length === 0) problems.push('Project has no level');
  const seenLevels = new Set<string>();
  for (const level of p.levels) {
    if (seenLevels.has(level.id)) problems.push(`Duplicate level id ${level.id}`);
    seenLevels.add(level.id);
    validateLevel(p, level, problems);
  }
  for (const def of Object.values(p.customObjects)) {
    if (!isPose(def.pose)) problems.push(`Custom object ${def.id}: unknown pose`);
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
    const hasStart = has(level.nodes, wall.startNodeId);
    const hasEnd = has(level.nodes, wall.endNodeId);
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
    if (!has(level.walls, o.wallId)) {
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
    if (obj.source.kind === 'custom' && !has(p.customObjects, obj.source.customObjectId)) {
      out.push(`${tag}: custom object definition not found`);
    }
    if (!isPose(obj.pose)) out.push(`${tag}: unknown pose`);
  }

  // 6. dimensions (existence only: resolution is the job of resolveAnchor)
  for (const dim of Object.values(level.dimensions)) {
    for (const [side, anchor] of [['a', dim.a], ['b', dim.b]] as const) {
      const tag = `${where} dimension ${dim.id} anchor ${side}`;
      if (anchor.kind === 'node' && !has(level.nodes, anchor.nodeId)) out.push(`${tag}: node not found`);
      if (anchor.kind === 'objectCorner' && !has(level.objects, anchor.objectId)) {
        out.push(`${tag}: object not found`);
      }
    }
  }

  // 7. roof slopes
  for (const s of Object.values(level.slopes)) {
    const tag = `${where} slope ${s.id}`;
    if (!(segmentLength(s.a, s.b) >= MIN_WALL_LENGTH)) out.push(`${tag}: start line length below ${MIN_WALL_LENGTH} cm`);
    if (!(s.depth > 0)) out.push(`${tag}: depth must be positive`);
    if (!(s.heightStart > 0) || !(s.heightEnd > 0)) out.push(`${tag}: heights must be positive`);
  }

  // 8. beams
  for (const b of Object.values(level.beams)) {
    const tag = `${where} beam ${b.id}`;
    if (!(segmentLength(b.a, b.b) >= MIN_WALL_LENGTH)) out.push(`${tag}: length below ${MIN_WALL_LENGTH} cm`);
    if (!(b.width > 0)) out.push(`${tag}: width must be positive`);
    if (!(b.drop > 0)) out.push(`${tag}: drop must be positive`);
    if (!(b.bottom > 0)) out.push(`${tag}: bottom must be positive`);
  }

  // 9. cupboards (they stand against a wall face and must fit in the wall length, like openings)
  for (const c of Object.values(level.cupboards)) {
    const tag = `${where} cupboard ${c.id}`;
    if (!has(level.walls, c.wallId)) {
      out.push(`${tag}: wall not found`);
      continue;
    }
    for (const [name, v] of [['width', c.width], ['depth', c.depth], ['height', c.height]] as const) {
      if (!(v > 0) || !Number.isFinite(v)) out.push(`${tag}: ${name} must be positive and finite`);
    }
    for (const [name, v] of [['plinth', c.plinth], ['gap', c.gap]] as const) {
      if (!(v >= 0) || !Number.isFinite(v)) out.push(`${tag}: ${name} must be non-negative and finite`);
    }
    if (!Number.isInteger(c.doorCount) || c.doorCount < 1) out.push(`${tag}: door count must be an integer >= 1`);
    if (validWalls.has(c.wallId)) {
      const len = wallLength(level, c.wallId);
      if (!(c.offset - c.width / 2 >= -FIT_EPS && c.offset + c.width / 2 <= len + FIT_EPS)) {
        out.push(`${tag}: does not fit in its wall`);
      }
    }
  }
}
