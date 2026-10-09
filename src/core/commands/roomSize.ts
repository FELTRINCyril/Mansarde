import { current, type Draft } from 'immer';
import polylabel from 'polylabel';
import type { Id, Level, Project, Ring, Vec2 } from '../model/types';
import { deriveLevel, type DerivedLevel } from '../geometry/derived';
import { pointInRing, ringEdges, signedArea } from '../geometry/polygon';
import type { Room } from '../geometry/rooms';
import { rectangularRoom, type RectRoom } from '../geometry/roomRect';
import { add, deg2rad, dot, normalize, perp, projectOnSegment, scale, segmentIntersection, sub } from '../geometry/vec';
import { wallFrame } from '../geometry/walls';
import { CommandError, getLevel, type Recipe } from './apply';
import { moveNodes } from './walls';

const ERR_SIZE = 'Dimension invalide';
const ERR_MIN_SIZE = 'Dimension minimale : 10 cm.';
const ERR_ROOM_NOT_FOUND = 'Pièce introuvable';
const ERR_NOT_RECTANGULAR = 'Pièce non rectangulaire';
const ERR_IMPOSSIBLE = 'Impossible de redimensionner cette pièce ainsi.';

/** Smallest interior dimension accepted (cm). */
const MIN_ROOM_DIMENSION = 10;
/** Below this difference (cm) the room has the requested size. */
const SIZE_EPS = 1e-6;
/** A neighbour wall may turn by at most this much (ruling V2-R11). */
const NEIGHBOUR_COS = Math.cos(deg2rad(1));
/** Moves of the side; the first one is exact for a true rectangle, the next ones absorb the skew of a room rectangular within 1 deg. */
const MAX_PASSES = 3;
/** A room edge this close (cm) to a wall face touches the wall; a ring vertex this close lies on it. */
const TOUCH_TOLERANCE = 0.05;
/** Below this area (cm2) a room is gone (same threshold as the room derivation). */
const MIN_ROOM_AREA = 1;

const snapshot = (draft: Draft<Project>, levelId: Id): Level => current(getLevel(draft, levelId)) as Level;

/** The walls of the 'min' or 'max' side across the axis, and its unit normal pointing away from the room. */
function sideToMove(rect: RectRoom, u: Vec2, moveSide: 'min' | 'max'): { wallIds: Id[]; normal: Vec2 } {
  const edges = [0, 1, 2, 3].map((edge) => rect.faces.filter((f) => f.edge === edge));
  const across = edges.filter((faces) => Math.abs(dot(normalize(sub(faces[0]!.b, faces[0]!.a)), u)) < 0.5);
  across.sort((p, q) => dot(p[0]!.a, u) - dot(q[0]!.a, u));
  const faces = moveSide === 'min' ? across[0]! : across[across.length - 1]!;
  const outward = moveSide === 'min' ? scale(u, -1) : u;
  const n = perp(normalize(sub(faces[0]!.b, faces[0]!.a)));
  return { wallIds: faces.map((f) => f.wallId), normal: dot(n, outward) >= 0 ? n : scale(n, -1) };
}

/**
 * Sets the interior width (along axisU) or depth (along axisV) of a rectangular room (spec 6,
 * see rectangularRoom): all the walls of the 'min' or 'max' side across that axis (several
 * collinear walls, ruling V2-R7) move along the side normal by (value - current size), away from
 * the room to enlarge it. The walls sharing their nodes follow, so a room on the other side of a
 * moved wall changes too. Openings and cupboards are handled as for any node move. Postcondition
 * (ruling V2-R11): a rectangular room around the expected center has the requested size (1e-6)
 * and no neighbour wall of the moved walls turned by more than 1 deg, else 'Impossible de
 * redimensionner cette pièce ainsi.'. Other refusals: value not finite or under 10 cm, unknown or
 * non-rectangular room, the refusals of moveNodes (wall too short, openings or cupboards that no
 * longer fit). No-op without touch for the current size. The room key is the one of deriveLevel
 * on the level as it is before the command. Ruling V2-R26: every other room touching the moved
 * walls before must still exist afterwards (see requireNeighbourRoomsKept). Values under 10 cm
 * are refused with 'Dimension minimale : 10 cm.'.
 */
export function setRoomInteriorSize(levelId: Id, roomKey: string, axis: 'width' | 'depth', value: number, moveSide: 'min' | 'max'): Recipe {
  return (draft) => {
    const level0 = snapshot(draft, levelId);
    if (!Number.isFinite(value)) throw new CommandError(ERR_SIZE);
    if (!(value >= MIN_ROOM_DIMENSION)) throw new CommandError(ERR_MIN_SIZE);
    const derived0 = deriveLevel(level0);
    if (!derived0.rooms.some((r) => r.key === roomKey)) throw new CommandError(ERR_ROOM_NOT_FOUND);
    let rect = rectangularRoom(level0, derived0, roomKey);
    if (!rect) throw new CommandError(ERR_NOT_RECTANGULAR);
    const sizeOf = (r: RectRoom): number => (axis === 'width' ? r.width : r.depth);
    if (Math.abs(value - sizeOf(rect)) <= SIZE_EPS) return;

    const movedWalls = new Set<Id>();
    const neighbourDirs = new Map<Id, Vec2>(); // directions before any move
    for (let pass = 0; Math.abs(value - sizeOf(rect)) > SIZE_EPS; pass++) {
      if (pass === MAX_PASSES) throw new CommandError(ERR_IMPOSSIBLE);
      const level = snapshot(draft, levelId);
      const delta = value - sizeOf(rect);
      const side = sideToMove(rect, axis === 'width' ? rect.axisU : rect.axisV, moveSide);
      const nodeIds = new Set(side.wallIds.flatMap((id) => [level.walls[id]!.startNodeId, level.walls[id]!.endNodeId]));
      for (const id of side.wallIds) movedWalls.add(id);
      for (const w of Object.values(level0.walls)) {
        if ((nodeIds.has(w.startNodeId) || nodeIds.has(w.endNodeId)) && !neighbourDirs.has(w.id)) {
          neighbourDirs.set(w.id, wallFrame(level0, w.id).dir);
        }
      }
      const shift = scale(side.normal, delta);
      moveNodes(
        levelId,
        [...nodeIds].map((nodeId) => ({ nodeId, to: add(level.nodes[nodeId]!, shift) })),
      )(draft);
      requireNeighboursKeepDirection(snapshot(draft, levelId), neighbourDirs, movedWalls);

      // find the room again around where its center should now be
      const after = snapshot(draft, levelId);
      const derived = deriveLevel(after);
      const expected = add(rect.center, scale(side.normal, delta / 2));
      const room = derived.rooms.find((r) => pointInRing(expected, r.ring) && !r.islands.some((i) => pointInRing(expected, i)));
      rect = room ? rectangularRoom(after, derived, room.key) : null;
      if (!rect) throw new CommandError(ERR_IMPOSSIBLE);
    }
    requireNeighbourRoomsKept(level0, derived0, roomKey, movedWalls, snapshot(draft, levelId), rect);
  };
}

/** Distance between segments [a, b] and [c, d]. */
function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentIntersection(a, b, c, d)) return 0;
  return Math.min(
    projectOnSegment(a, c, d).distance,
    projectOnSegment(b, c, d).distance,
    projectOnSegment(c, a, b).distance,
    projectOnSegment(d, a, b).distance,
  );
}

/** Whether a ring edge of the room runs along (or touches) one of the faces of the wall. */
function roomTouchesWall(room: Room, level: Level, wallId: Id): boolean {
  const f = wallFrame(level, wallId);
  const reach = level.walls[wallId]!.thickness / 2 + TOUCH_TOLERANCE;
  return ringEdges(room.ring).some(([p, q]) => segmentDistance(p, q, f.start, f.end) <= reach);
}

/**
 * The ring a room should have after the move: its vertices lying on a face of a moved wall
 * follow that wall (the displacement of its start node), the others stay.
 */
function expectedRing(ring: Ring, before: Level, after: Level, moved: Set<Id>): Ring {
  const walls = [...moved].map((id) => {
    const w = before.walls[id]!;
    const shift = sub(after.nodes[w.startNodeId]!, before.nodes[w.startNodeId]!);
    return { f: wallFrame(before, id), h: w.thickness / 2, shift };
  });
  return ring.map((v) => {
    const on = walls.find(({ f, h }) => {
      const proj = projectOnSegment(v, f.start, f.end);
      return proj.distance <= h + TOUCH_TOLERANCE && Math.abs(Math.abs(dot(sub(v, f.start), f.normal)) - h) <= TOUCH_TOLERANCE;
    });
    return on ? add(v, on.shift) : v;
  });
}

const roomAt = (d: DerivedLevel, p: Vec2): Room | undefined =>
  d.rooms.find((r) => pointInRing(p, r.ring) && !r.islands.some((i) => pointInRing(p, i)));

/**
 * Ruling V2-R26: every other room touching the moved walls before the command still exists after
 * it, as a room of its own with an area: the room found at the pole of its expected ring (see
 * expectedRing), distinct from the resized room and from the other neighbours. Else
 * 'Impossible de redimensionner cette pièce ainsi.' (a neighbour squeezed to nothing would leave
 * wall stubs overlapping, without any room).
 */
function requireNeighbourRoomsKept(
  before: Level,
  derivedBefore: DerivedLevel,
  roomKey: string,
  moved: Set<Id>,
  after: Level,
  resized: RectRoom,
): void {
  const neighbours = derivedBefore.rooms.filter((r) => r.key !== roomKey && [...moved].some((id) => roomTouchesWall(r, before, id)));
  if (neighbours.length === 0) return;
  const derivedAfter = deriveLevel(after);
  // rings of derivedAfter (a fresh derivation: compare within it, never with resized.room)
  const self = roomAt(derivedAfter, resized.center);
  const taken = new Set<Ring>(self ? [self.ring] : []);
  for (const r of neighbours) {
    const ring = expectedRing(r.ring, before, after, moved);
    if (Math.sign(signedArea(ring)) !== Math.sign(signedArea(r.ring)) || Math.abs(signedArea(ring)) < MIN_ROOM_AREA) {
      throw new CommandError(ERR_IMPOSSIBLE);
    }
    const [x, y] = polylabel([ring.map((q) => [q.x, q.y])], 1);
    const found = roomAt(derivedAfter, { x: x!, y: y! });
    if (!found || found.area < MIN_ROOM_AREA || taken.has(found.ring)) throw new CommandError(ERR_IMPOSSIBLE);
    taken.add(found.ring);
  }
}

/** Ruling V2-R11: the walls around the moved ones may get longer or shorter, not turn. */
function requireNeighboursKeepDirection(level: Level, before: Map<Id, Vec2>, moved: Set<Id>): void {
  for (const [id, dir] of before) {
    if (moved.has(id)) continue;
    if (!Object.hasOwn(level.walls, id) || dot(wallFrame(level, id).dir, dir) < NEIGHBOUR_COS) throw new CommandError(ERR_IMPOSSIBLE);
  }
}
