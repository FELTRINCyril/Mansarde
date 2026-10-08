import { current } from 'immer';
import type { Id, Level, Vec2 } from '../model/types';
import { deriveLevel } from '../geometry/derived';
import { rectangularRoom } from '../geometry/roomRect';
import { dot, normalize, scale, sub } from '../geometry/vec';
import { wallFrame } from '../geometry/walls';
import { CommandError, getLevel, type Recipe } from './apply';
import { moveNodes } from './walls';

const ERR_SIZE = 'Dimension invalide';
const ERR_ROOM_NOT_FOUND = 'Pièce introuvable';
const ERR_NOT_RECTANGULAR = 'Pièce non rectangulaire';
const ERR_NEIGHBOUR = 'Un mur voisin deviendrait trop court';

/** Smallest interior dimension accepted (cm). */
const MIN_ROOM_DIMENSION = 10;
/** Below this difference (cm) the requested size is the current one: nothing to do. */
const SIZE_EPS = 1e-6;

/**
 * Sets the interior width (along axisU) or depth (along axisV) of a rectangular room (spec 6,
 * see rectangularRoom): the wall carrying the 'min' or 'max' face along that axis moves along its
 * normal by (value - current size), away from the room to enlarge it. The walls sharing its nodes
 * follow (they get longer or shorter), so a room on the other side of a shared wall changes too.
 * Openings and cupboards are reconciled as for any node move. Refused: value not finite or under
 * 10 cm, unknown or non-rectangular room, a wall shorter than the minimum, or a neighbouring wall
 * turned inside out (the move went past its other end). No-op without touch for the current size.
 * The room key is the one of deriveLevel on the level as it is before the command.
 */
export function setRoomInteriorSize(levelId: Id, roomKey: string, axis: 'width' | 'depth', value: number, moveSide: 'min' | 'max'): Recipe {
  return (draft) => {
    const draftLevel = getLevel(draft, levelId);
    if (!Number.isFinite(value) || !(value >= MIN_ROOM_DIMENSION)) throw new CommandError(ERR_SIZE);
    const level = current(draftLevel) as Level;
    const derived = deriveLevel(level);
    if (!derived.rooms.some((r) => r.key === roomKey)) throw new CommandError(ERR_ROOM_NOT_FOUND);
    const rect = rectangularRoom(level, derived, roomKey);
    if (!rect) throw new CommandError(ERR_NOT_RECTANGULAR);

    const delta = value - (axis === 'width' ? rect.width : rect.depth);
    if (Math.abs(delta) <= SIZE_EPS) return;

    // the two faces across the axis, and the one at its min or max end
    const u = axis === 'width' ? rect.axisU : rect.axisV;
    const across = rect.faces.filter((f) => Math.abs(dot(normalize(sub(f.b, f.a)), u)) < 0.5);
    const at = (f: (typeof across)[number]): number => dot(f.a, u) + dot(f.b, u);
    const [first, second] = across.sort((p, q) => at(p) - at(q));
    const face = moveSide === 'min' ? first! : second!;
    const outward = moveSide === 'min' ? scale(u, -1) : u;

    const frame = wallFrame(level, face.wallId);
    const normal = dot(frame.normal, outward) >= 0 ? frame.normal : scale(frame.normal, -1);
    const shift = scale(normal, delta);
    const wall = level.walls[face.wallId]!;
    const moved = [wall.startNodeId, wall.endNodeId];
    const before = directionsAround(level, moved, face.wallId);

    moveNodes(
      levelId,
      moved.map((nodeId) => ({ nodeId, to: { x: level.nodes[nodeId]!.x + shift.x, y: level.nodes[nodeId]!.y + shift.y } })),
    )(draft);

    const after = getLevel(draft, levelId);
    for (const [wallId, dir] of before) {
      if (dot(wallFrame(after, wallId).dir, dir) <= 0) throw new CommandError(ERR_NEIGHBOUR);
    }
  };
}

/** Direction of every wall other than `except` that touches one of the nodes. */
function directionsAround(level: Level, nodeIds: Id[], except: Id): Map<Id, Vec2> {
  const out = new Map<Id, Vec2>();
  for (const w of Object.values(level.walls)) {
    if (w.id === except || !(nodeIds.includes(w.startNodeId) || nodeIds.includes(w.endNodeId))) continue;
    out.set(w.id, wallFrame(level, w.id).dir);
  }
  return out;
}
