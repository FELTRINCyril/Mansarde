import type { Draft } from 'immer';
import { MIN_WALL_LENGTH } from '../model/defaults';
import { newId } from '../model/ids';
import type { Id, Level, Vec2, Wall } from '../model/types';
import { openingFitsWall } from '../geometry/openings';
import { dist, lerp, projectOnSegment } from '../geometry/vec';
import { wallFrame, wallLength } from '../geometry/walls';
import { CommandError, getLevel, touch, type Recipe } from './apply';
import { reconcileOpenings } from './reconcile';

export type WallPoint =
  | { kind: 'node'; nodeId: Id }
  | { kind: 'onWall'; wallId: Id; t: number } // 0 < t < 1 along start->end
  | { kind: 'free'; x: number; y: number };

/** A free point (or a split point) closer than this to an existing node reuses that node. */
const NODE_REUSE_DISTANCE = 0.5; // cm
const ON_SEGMENT_EPS = 1e-6;

const ERR_WALL_NOT_FOUND = 'Mur introuvable';
const ERR_NODE_NOT_FOUND = 'Nœud introuvable';
const ERR_TOO_SHORT = 'Mur trop court';
const ERR_POSITION = 'Position invalide';
const ERR_THICKNESS = 'Épaisseur invalide';
const ERR_HEIGHT = 'Hauteur invalide';
const ERR_LENGTH = 'Longueur invalide';
const ERR_STRADDLE = 'Une ouverture est à cheval sur la jonction';
const ERR_MIN_POINTS = 'Il faut au moins deux points';
const ERR_ROOM_TOO_SMALL = 'Pièce trop petite';
const ERR_SELF_MERGE = 'Impossible de fusionner un nœud avec lui-même';

type DLevel = Draft<Level>;

// ---------------------------------------------------------------- helpers

function requireWall(level: DLevel, wallId: Id): Draft<Wall> {
  const wall = level.walls[wallId];
  if (!wall) throw new CommandError(ERR_WALL_NOT_FOUND);
  return wall;
}

function requireNode(level: DLevel, nodeId: Id): void {
  if (!level.nodes[nodeId]) throw new CommandError(ERR_NODE_NOT_FOUND);
}

function requireFinitePoint(p: Vec2): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new CommandError(ERR_POSITION);
}

function requirePositive(value: number, message: string): void {
  if (!Number.isFinite(value) || !(value > 0)) throw new CommandError(message);
}

/** Closest node strictly closer than NODE_REUSE_DISTANCE, or null. */
function nodeNear(level: DLevel, p: Vec2): Id | null {
  let best: Id | null = null;
  let bestDist = NODE_REUSE_DISTANCE;
  for (const n of Object.values(level.nodes)) {
    const d = dist(n, p);
    if (d < bestDist) {
      best = n.id;
      bestDist = d;
    }
  }
  return best;
}

function createNode(level: DLevel, p: Vec2): Id {
  const id = newId();
  level.nodes[id] = { id, x: p.x, y: p.y };
  return id;
}

function createWall(level: DLevel, startNodeId: Id, endNodeId: Id, thickness: number, height: number): Id {
  const id = newId();
  level.walls[id] = { id, startNodeId, endNodeId, thickness, height };
  return id;
}

const samePair = (w: Wall, a: Id, b: Id): boolean =>
  (w.startNodeId === a && w.endNodeId === b) || (w.startNodeId === b && w.endNodeId === a);

function wallBetween(level: DLevel, a: Id, b: Id, exceptWallId?: Id): Id | null {
  for (const w of Object.values(level.walls)) {
    if (w.id !== exceptWallId && samePair(w, a, b)) return w.id;
  }
  return null;
}

function wallsAt(level: DLevel, nodeIds: Set<Id>): Id[] {
  return Object.values(level.walls)
    .filter((w) => nodeIds.has(w.startNodeId) || nodeIds.has(w.endNodeId))
    .map((w) => w.id);
}

function requireMinLength(level: DLevel, wallIds: Iterable<Id>): void {
  for (const id of wallIds) {
    if (!(wallLength(level, id) >= MIN_WALL_LENGTH)) throw new CommandError(ERR_TOO_SHORT);
  }
}

/** Deletes the given nodes that no wall uses anymore, with the manual dimensions anchored to them. */
function removeOrphanNodes(level: DLevel, candidates: Iterable<Id>): void {
  const used = new Set<Id>();
  for (const w of Object.values(level.walls)) {
    used.add(w.startNodeId);
    used.add(w.endNodeId);
  }
  const removed = new Set<Id>();
  for (const id of candidates) {
    if (!used.has(id) && level.nodes[id]) {
      delete level.nodes[id];
      removed.add(id);
    }
  }
  if (removed.size === 0) return;
  for (const dim of Object.values(level.dimensions)) {
    const hit = [dim.a, dim.b].some((a) => a.kind === 'node' && removed.has(a.nodeId));
    if (hit) delete level.dimensions[dim.id];
  }
}

/** Deletes walls and their openings, then the nodes left orphan (and dimensions anchored to them). */
function removeWalls(level: DLevel, wallIds: Iterable<Id>): void {
  const ids = new Set(wallIds);
  const endpoints = new Set<Id>();
  for (const id of ids) {
    const wall = level.walls[id];
    if (!wall) continue;
    endpoints.add(wall.startNodeId);
    endpoints.add(wall.endNodeId);
    delete level.walls[id];
  }
  for (const o of Object.values(level.openings)) {
    if (ids.has(o.wallId)) delete level.openings[o.id];
  }
  removeOrphanNodes(level, endpoints);
}

/**
 * Splits a wall at t: the wall keeps its id and becomes the start piece, a new wall carries the
 * end piece. Openings go to the piece containing their center, offsets are recomputed.
 */
function splitWallAt(level: DLevel, wallId: Id, t: number): { nodeId: Id; newWallId: Id } {
  const wall = requireWall(level, wallId);
  if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new CommandError(ERR_POSITION);
  const f = wallFrame(level, wallId);
  const splitAt = f.length * t;
  if (!(splitAt >= MIN_WALL_LENGTH) || !(f.length - splitAt >= MIN_WALL_LENGTH)) {
    throw new CommandError(ERR_TOO_SHORT);
  }
  const nodeId = createNode(level, lerp(f.start, f.end, t));
  const newWallId = createWall(level, nodeId, wall.endNodeId, wall.thickness, wall.height);
  wall.endNodeId = nodeId;

  const startLen = wallLength(level, wallId);
  const endLen = wallLength(level, newWallId);
  for (const o of Object.values(level.openings)) {
    if (o.wallId !== wallId) continue;
    if (o.offset > splitAt) {
      o.wallId = newWallId;
      o.offset -= splitAt;
    }
    if (!openingFitsWall(o, o.wallId === wallId ? startLen : endLen)) throw new CommandError(ERR_STRADDLE);
  }
  return { nodeId, newWallId };
}

/** Moves nodes, checks the length of every affected wall, then reconciles openings. */
function moveNodesIn(level: DLevel, moves: Array<{ nodeId: Id; to: Vec2 }>): void {
  for (const m of moves) {
    requireNode(level, m.nodeId);
    requireFinitePoint(m.to);
  }
  for (const m of moves) {
    const node = level.nodes[m.nodeId]!;
    node.x = m.to.x;
    node.y = m.to.y;
  }
  requireMinLength(level, wallsAt(level, new Set(moves.map((m) => m.nodeId))));
  reconcileOpenings(level);
}

// ---------------------------------------------------------------- commands

/**
 * Draws a chain of walls through the points (spec 5, ruling R11). A free or onWall point reuses a
 * node closer than 0.5 cm; otherwise, if it lies on the axis interior of a wall (pre-existing or
 * drawn earlier in this chain), that wall is split there (T junction); otherwise a node is created.
 * onWall positions are taken on the walls as they are before any split. Segments duplicating an
 * existing wall are skipped. out.wallIds receives the created chain walls.
 */
export function addWallChain(
  levelId: Id,
  points: WallPoint[],
  thickness: number,
  height: number,
  out?: { wallIds: Id[] },
): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    if (points.length < 2) throw new CommandError(ERR_MIN_POINTS);
    requirePositive(thickness, ERR_THICKNESS);
    requirePositive(height, ERR_HEIGHT);

    const positions = new Map<WallPoint, Vec2>();
    for (const p of points) {
      if (p.kind === 'free') {
        const pos = { x: p.x, y: p.y };
        requireFinitePoint(pos);
        positions.set(p, pos);
      } else if (p.kind === 'onWall') {
        requireWall(level, p.wallId);
        if (!Number.isFinite(p.t) || p.t <= 0 || p.t >= 1) throw new CommandError(ERR_POSITION);
        const f = wallFrame(level, p.wallId);
        positions.set(p, lerp(f.start, f.end, p.t));
      } else {
        requireNode(level, p.nodeId);
      }
    }

    let splits = 0;
    const nodeAtPosition = (pos: Vec2): Id => {
      const near = nodeNear(level, pos);
      if (near !== null) return near;
      for (const w of Object.values(level.walls)) {
        const f = wallFrame(level, w.id);
        const proj = projectOnSegment(pos, f.start, f.end);
        // no node within 0.5 cm, so a point on the segment is strictly inside it
        if (proj.distance > ON_SEGMENT_EPS) continue;
        splits++;
        return splitWallAt(level, w.id, proj.t).nodeId;
      }
      return createNode(level, pos);
    };
    const resolve = (p: WallPoint): Id => (p.kind === 'node' ? p.nodeId : nodeAtPosition(positions.get(p)!));

    const created: Id[] = [];
    let prev = resolve(points[0]!);
    for (const p of points.slice(1)) {
      const cur = resolve(p);
      if (cur === prev || !(dist(level.nodes[prev]!, level.nodes[cur]!) >= MIN_WALL_LENGTH)) {
        throw new CommandError(ERR_TOO_SHORT);
      }
      if (wallBetween(level, prev, cur) === null) created.push(createWall(level, prev, cur, thickness, height));
      prev = cur;
    }
    if (out) out.wallIds = created;
    // a node is only ever created for a wall, so no wall and no split means nothing changed
    if (created.length === 0 && splits === 0) return;
    touch(draft);
  };
}

/** Four walls on the axis-aligned rectangle with opposite corners a and b, clockwise on screen. */
export function addRectRoom(levelId: Id, a: Vec2, b: Vec2, thickness: number, height: number): Recipe {
  return (draft) => {
    requireFinitePoint(a);
    requireFinitePoint(b);
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    if (!(x2 - x1 >= MIN_WALL_LENGTH) || !(y2 - y1 >= MIN_WALL_LENGTH)) throw new CommandError(ERR_ROOM_TOO_SMALL);
    const corners: WallPoint[] = [
      { kind: 'free', x: x1, y: y1 },
      { kind: 'free', x: x2, y: y1 },
      { kind: 'free', x: x2, y: y2 },
      { kind: 'free', x: x1, y: y2 },
      { kind: 'free', x: x1, y: y1 },
    ];
    addWallChain(levelId, corners, thickness, height)(draft);
  };
}

export function splitWall(levelId: Id, wallId: Id, t: number, out?: { nodeId: Id }): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const { nodeId } = splitWallAt(level, wallId, t);
    touch(draft);
    if (out) out.nodeId = nodeId;
  };
}

export function moveNodes(levelId: Id, moves: Array<{ nodeId: Id; to: Vec2 }>): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    if (moves.length === 0) return;
    moveNodesIn(level, moves);
    touch(draft);
  };
}

/** Moves the set of nodes of the walls once by delta. */
export function moveWalls(levelId: Id, wallIds: Id[], delta: Vec2): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireFinitePoint(delta);
    const nodeIds = new Set<Id>();
    for (const id of wallIds) {
      const wall = requireWall(level, id);
      nodeIds.add(wall.startNodeId);
      nodeIds.add(wall.endNodeId);
    }
    if (nodeIds.size === 0) return;
    const moves = [...nodeIds].map((nodeId) => {
      const n = level.nodes[nodeId]!;
      return { nodeId, to: { x: n.x + delta.x, y: n.y + delta.y } };
    });
    moveNodesIn(level, moves);
    touch(draft);
  };
}

/**
 * Rewires the walls of source to target and deletes source. Walls that become degenerate (both
 * ends on target) or duplicate an existing wall are deleted with their openings. Manual dimensions
 * anchored to source follow it to target (those left with both anchors on target are deleted).
 */
export function mergeNode(levelId: Id, sourceNodeId: Id, targetNodeId: Id): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireNode(level, sourceNodeId);
    requireNode(level, targetNodeId);
    if (sourceNodeId === targetNodeId) throw new CommandError(ERR_SELF_MERGE);

    const rewired: Id[] = [];
    for (const w of Object.values(level.walls)) {
      if (w.startNodeId === sourceNodeId) w.startNodeId = targetNodeId;
      else if (w.endNodeId === sourceNodeId) w.endNodeId = targetNodeId;
      else continue;
      rewired.push(w.id);
    }
    const doomed = new Set<Id>();
    for (const id of rewired) {
      const w = level.walls[id]!;
      if (w.startNodeId === w.endNodeId) doomed.add(id);
    }
    for (const id of rewired) {
      if (doomed.has(id)) continue;
      const w = level.walls[id]!;
      const twin = wallBetween(level, w.startNodeId, w.endNodeId, id);
      if (twin !== null && !doomed.has(twin)) doomed.add(id); // keep the wall that was already there
    }

    delete level.nodes[sourceNodeId];
    for (const dim of Object.values(level.dimensions)) {
      for (const anchor of [dim.a, dim.b]) {
        if (anchor.kind === 'node' && anchor.nodeId === sourceNodeId) anchor.nodeId = targetNodeId;
      }
      if (dim.a.kind === 'node' && dim.b.kind === 'node' && dim.a.nodeId === dim.b.nodeId) {
        delete level.dimensions[dim.id];
      }
    }

    removeWalls(level, doomed); // may leave target orphan (lone wall merged onto itself)
    requireMinLength(
      level,
      rewired.filter((id) => !doomed.has(id)),
    );
    reconcileOpenings(level);
    touch(draft);
  };
}

function setWallProperty(
  levelId: Id,
  wallIds: Id[],
  key: 'thickness' | 'height',
  value: number,
  message: string,
): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requirePositive(value, message);
    const walls = wallIds.map((id) => requireWall(level, id));
    if (walls.length === 0) return;
    for (const w of walls) w[key] = value;
    touch(draft);
  };
}

export function setWallThickness(levelId: Id, wallIds: Id[], thickness: number): Recipe {
  return setWallProperty(levelId, wallIds, 'thickness', thickness, ERR_THICKNESS);
}

export function setWallHeight(levelId: Id, wallIds: Id[], height: number): Recipe {
  return setWallProperty(levelId, wallIds, 'height', height, ERR_HEIGHT);
}

/** Moves the non-kept node along the current direction of the wall. */
export function setWallLength(levelId: Id, wallId: Id, length: number, keep: 'start' | 'end'): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const wall = requireWall(level, wallId);
    if (!Number.isFinite(length) || !(length >= MIN_WALL_LENGTH)) throw new CommandError(ERR_LENGTH);
    const f = wallFrame(level, wallId);
    const move =
      keep === 'start'
        ? { nodeId: wall.endNodeId, to: { x: f.start.x + f.dir.x * length, y: f.start.y + f.dir.y * length } }
        : { nodeId: wall.startNodeId, to: { x: f.end.x - f.dir.x * length, y: f.end.y - f.dir.y * length } };
    moveNodesIn(level, [move]);
    touch(draft);
  };
}

/** Removes the walls, their openings, orphan nodes and manual dimensions anchored to removed nodes. */
export function deleteWalls(levelId: Id, wallIds: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of wallIds) requireWall(level, id);
    if (wallIds.length === 0) return;
    removeWalls(level, wallIds);
    touch(draft);
  };
}
