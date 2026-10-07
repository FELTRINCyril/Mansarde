import type { HitKind } from '@/core/geometry/hit';
import type { Room } from '@/core/geometry/rooms';
import type { Id, Level } from '@/core/model/types';

export interface SelectionItem { kind: HitKind; id: Id }

function exists(item: SelectionItem, level: Level, roomKeys: Set<string>): boolean {
  switch (item.kind) {
    case 'opening': return Object.hasOwn(level.openings, item.id);
    case 'object': return Object.hasOwn(level.objects, item.id);
    case 'node': return Object.hasOwn(level.nodes, item.id);
    case 'wall': return Object.hasOwn(level.walls, item.id);
    case 'dimension': return Object.hasOwn(level.dimensions, item.id);
    // 'room-<index>' keys of unlabelled rooms are unstable: such a selection may legitimately disappear
    case 'room': return roomKeys.has(item.id);
  }
}

/**
 * Drops the items whose element no longer exists in the level (or whose room is gone from rooms).
 * Returns the very same array when nothing is dropped.
 */
export function pruneSelection(sel: SelectionItem[], level: Level | undefined, rooms: Room[]): SelectionItem[] {
  if (!level) return sel.length === 0 ? sel : [];
  const roomKeys = new Set(rooms.map((r) => r.key));
  const kept = sel.filter((item) => exists(item, level, roomKeys));
  return kept.length === sel.length ? sel : kept;
}
