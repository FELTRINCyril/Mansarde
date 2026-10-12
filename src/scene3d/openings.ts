import { BoxGeometry, CylinderGeometry, Group, Mesh, PlaneGeometry, type BufferGeometry, type Material } from 'three';
import { openingFrame } from '@/core/geometry/openings';
import { pointInRing } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import { add, scale } from '@/core/geometry/vec';
import type { Level, Opening } from '@/core/model/types';
import type { Materials } from './materials';

/** Opening angle of the door leaves (spec 8.1). */
export const DOOR_OPEN_DEG = 70;

/** Sizes in cm, after plan-chambre (frame bars 6 cm, 7 cm deep; leaf 4 cm thick; handle at 102 cm). */
const FRAME_BAR = 6;
const FRAME_DEPTH = 7;
const CASING_WIDTH = 6;
const CASING_DEPTH = 2;
const LEAF_THICKNESS = 4;
const LEAF_GAP = 1;
const HANDLE_HEIGHT = 102;
const SILL_BOARD = { thickness: 3, overhang: 6, extra: 4 } as const;

/**
 * Builds meshes in the local frame of an opening (cm): a along the wall axis from the opening
 * center, b along the wall normal (left of the wall = +b), h up from the floor. The group of the
 * opening carries the conversion to meters and the orientation of the wall.
 */
class Local {
  readonly group = new Group();

  /** Box centered at (a, h, b) of size da x dh x db (cm). */
  box(a: number, h: number, b: number, da: number, dh: number, db: number, material: Material, parent: Group = this.group): Mesh {
    const m = mesh(new BoxGeometry(da / 100, dh / 100, db / 100), material);
    m.position.set(a / 100, h / 100, b / 100);
    parent.add(m);
    return m;
  }
}

function mesh(geometry: BufferGeometry, material: Material): Mesh {
  const m = new Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A swinging leaf hinged at a = hingeA on the wall face of the swing side (b = s * ht), closing
 * towards `toward` along a, open by DOOR_OPEN_DEG towards the swing side, with its handle near the
 * free edge, from the sill up to `height` minus a 1 cm joint at the top and at the bottom.
 */
function leaf(l: Local, mats: Materials, o: Opening, hingeA: number, len: number, toward: 1 | -1, s: 1 | -1, ht: number): void {
  const pivot = new Group();
  pivot.position.set(hingeA / 100, 0, (s * ht) / 100);
  const t = (DOOR_OPEN_DEG * Math.PI) / 180;
  // rotation.y = phi maps local x to (cos phi, -sin phi) in (a, b): the leaf direction
  pivot.rotation.y = Math.atan2(-s * Math.sin(t), toward * Math.cos(t));
  const w = Math.max(1, len - LEAF_GAP);
  const h = Math.max(1, o.height - 2 * LEAF_GAP);
  l.box(w / 2, o.sillHeight + LEAF_GAP + h / 2, 0, w, h, LEAF_THICKNESS, mats.door, pivot);
  // handle 7 cm from the free edge at 102 cm above the floor (plan-chambre), lowered to 10 cm under
  // the top of a leaf lower than that; a cylinder across the leaf, sticking out of both faces
  const handle = mesh(new CylinderGeometry(0.012, 0.012, 0.12, 16), mats.handle);
  handle.rotation.x = Math.PI / 2;
  handle.position.set((w - 7) / 100, Math.min(HANDLE_HEIGHT, o.sillHeight + h - 10) / 100, 0);
  pivot.add(handle);
  l.group.add(pivot);
}

/** Casing around the door on both faces of the wall: two jambs and a head. */
function casings(l: Local, mats: Materials, o: Opening, hw: number, ht: number): void {
  const h = o.sillHeight + o.height;
  for (const s of [1, -1] as const) {
    const b = s * (ht + CASING_DEPTH / 2);
    for (const side of [1, -1] as const) {
      l.box(side * (hw + CASING_WIDTH / 2), h / 2 + CASING_WIDTH / 4, b, CASING_WIDTH, h + CASING_WIDTH / 2, CASING_DEPTH, mats.frame);
    }
    l.box(0, h + CASING_WIDTH / 2, b, o.width + 2 * CASING_WIDTH, CASING_WIDTH, CASING_DEPTH, mats.frame);
  }
}

function door(l: Local, mats: Materials, o: Opening, hw: number, ht: number): void {
  const s: 1 | -1 = o.swing === 'left' ? 1 : -1;
  casings(l, mats, o, hw, ht);
  const h = Math.max(1, o.height - 2 * LEAF_GAP);
  const y = o.sillHeight + LEAF_GAP + h / 2;
  switch (o.variant) {
    case 'double':
      leaf(l, mats, o, -hw, hw, 1, s, ht);
      leaf(l, mats, o, hw, hw, -1, s, ht);
      return;
    case 'sliding': {
      // two panels across the thickness, overlapping a little in the middle (as the plan symbol)
      const overlap = Math.min(hw * 0.2, 10);
      const b = ht * 0.35;
      l.box((-hw + overlap) / 2, y, -b, hw + overlap, h, 3, mats.door);
      l.box((hw - overlap) / 2, y, b, hw + overlap, h, 3, mats.door);
      return;
    }
    case 'pocket': {
      // interpretation: the leaf is drawn half open, as a visible cue of the kind of door. As in the
      // plan symbol, `hinge` names the side of the pocket: the half of the leaf still out of the
      // wall stands on that side, in the middle of the wall thickness, the other half is in the wall
      const atStart = o.hinge === 'start';
      l.box(atStart ? -hw / 2 : hw / 2, y, 0, hw, h, 3, mats.door);
      return;
    }
    default: {
      const atStart = o.hinge === 'start';
      leaf(l, mats, o, atStart ? -hw : hw, 2 * hw, atStart ? 1 : -1, s, ht);
    }
  }
}

/**
 * Window of plan-chambre: frame bars in the middle of the wall, a mullion (except single and fixed
 * windows), a glass pane and a sill board on the sides of the wall facing a room (both sides when
 * no room touches the wall).
 */
function windowParts(l: Local, mats: Materials, o: Opening, hw: number, ht: number, roomSides: Array<1 | -1>): void {
  const sill = o.sillHeight;
  const top = sill + o.height;
  const mid = (sill + top) / 2;
  l.box(0, top - FRAME_BAR / 2, 0, o.width, FRAME_BAR, FRAME_DEPTH, mats.frame);
  l.box(0, sill + FRAME_BAR / 2, 0, o.width, FRAME_BAR, FRAME_DEPTH, mats.frame);
  l.box(-hw + FRAME_BAR / 2, mid, 0, FRAME_BAR, o.height, FRAME_DEPTH, mats.frame);
  l.box(hw - FRAME_BAR / 2, mid, 0, FRAME_BAR, o.height, FRAME_DEPTH, mats.frame);
  if (o.variant === 'double' || o.variant === 'sliding') l.box(0, mid, 0, FRAME_BAR, o.height, FRAME_DEPTH, mats.frame);
  const pane = new Mesh(new PlaneGeometry(o.width / 100, o.height / 100), mats.glass);
  pane.position.set(0, mid / 100, 0);
  l.group.add(pane);
  if (sill > 0) {
    for (const s of roomSides) {
      const depth = ht + SILL_BOARD.overhang;
      l.box(0, sill - SILL_BOARD.thickness / 2, (s * depth) / 2, o.width + 2 * SILL_BOARD.extra, SILL_BOARD.thickness, depth, mats.windowSill);
    }
  }
}

/** Sides of the wall (+1 = normal side) where a room lies just beyond the face, at the opening center. */
function roomSidesOf(center: { x: number; y: number }, normal: { x: number; y: number }, ht: number, rooms: Room[]): Array<1 | -1> {
  const sides = ([1, -1] as const).filter((s) => {
    const p = add(center, scale(normal, s * (ht + 5)));
    return rooms.some((r) => pointInRing(p, r.ring));
  });
  return sides.length > 0 ? sides : [1, -1];
}

/**
 * The door or window of an opening (a passage has nothing but its gap in the wall), in level
 * coordinates (meters, y up, z = plan y). Null when its wall is missing (broken file).
 */
export function buildOpening(level: Level, o: Opening, rooms: Room[], mats: Materials): Group | null {
  const wall = level.walls[o.wallId];
  if (!wall || !level.nodes[wall.startNodeId] || !level.nodes[wall.endNodeId]) return null;
  if (o.kind === 'passage' || !(o.width > 0) || !(o.height > 0)) return null;
  const f = openingFrame(level, o);
  const l = new Local();
  const hw = o.width / 2;
  const ht = f.thickness / 2;
  if (o.kind === 'door') door(l, mats, o, hw, ht);
  else windowParts(l, mats, o, hw, ht, roomSidesOf(f.center, f.normal, ht, rooms));
  const g = l.group;
  g.position.set(f.center.x / 100, 0, f.center.y / 100);
  // local x -> wall direction, local z -> wall normal (left side)
  g.rotation.y = Math.atan2(-f.dir.y, f.dir.x);
  g.name = `opening:${o.id}`;
  g.userData = { openingId: o.id };
  return g;
}
