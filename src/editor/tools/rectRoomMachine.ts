import { snapPoint, type SnapKind, type SnapResult } from '@/core/geometry/snap';
import { dist, len, normalize, sub } from '@/core/geometry/vec';
import { MIN_WALL_LENGTH } from '@/core/model/defaults';
import type { Id, Vec2 } from '@/core/model/types';
import { formatNumber } from '@/ui/numeric';
import { DYN_DIM_GAP_PX, EMPTY_DRAW_OVERLAY, fieldScreen, thicknessLabel, type DrawOverlay, type Mods, type WallToolEnv } from './drawing';

export type RectToolEnv = WallToolEnv;

export type RectField = 'width' | 'height';

export type RectToolEvent =
  | { type: 'down'; world: Vec2; screen: Vec2; mods: Mods }
  | { type: 'move'; world: Vec2; screen: Vec2; mods: Mods }
  | { type: 'up'; world: Vec2; screen: Vec2; mods: Mods }
  | { type: 'escape' } // Escape key, Mod+Z (R32), pointer cancel / window blur
  | { type: 'digit'; key: string; meta?: boolean }
  // Tab (Shift+Tab: backward) in the field; value null = empty field, the side follows the cursor again
  | { type: 'numericTab'; value: number | null; backward?: boolean }
  | { type: 'numericSubmit'; value: number }
  | { type: 'numericCancel' };

export type RectToolEffect =
  // interior: a and b are interior corners (addRectRoomInterior); false: wall axes (addRectRoom, V2-R25)
  | { type: 'commit'; levelId: Id; a: Vec2; b: Vec2; thickness: number; height: number; interior: boolean }
  | { type: 'openNumeric'; initial: string; screen: Vec2; label: string }
  | { type: 'closeNumeric' };

export type RectToolState =
  | { phase: 'idle'; hover: SnapResult | null }
  | {
      phase: 'drag';
      levelId: Id;
      a: Vec2; // snapped corner at the press
      aOnWall: boolean; // the press snapped to an existing node or wall axis (V2-R25)
      b: SnapResult; // snapped cursor
      screen: Vec2;
      released: boolean; // pointer already up, typed values still pending
      partition: boolean; // Ctrl / Cmd held at any event of the drag (frozen once seen)
      width: number | null; // typed width (cm), along the side of the cursor
      height: number | null;
      typing: RectField | null; // field open in the numeric overlay
    };

export interface RectToolResult { state: RectToolState; effects: RectToolEffect[] }

export const RECT_IDLE: RectToolState = { phase: 'idle', hover: null };

export const RECT_FIELD_LABELS: Record<RectField, string> = { width: 'Largeur', height: 'Hauteur' };

/** Preview label when a corner is on an existing wall: the rectangle is drawn at the wall axes. */
export const HOOKED_LABEL = "Accroché à un mur : cotes à l'axe";

type Drag = Extract<RectToolState, { phase: 'drag' }>;

function snap(world: Vec2, mods: Mods, env: RectToolEnv): SnapResult {
  return snapPoint(world, { level: env.level, pxPerCm: env.pxPerCm, gridStep: env.gridStep, enabled: !mods.alt, ortho: false });
}

/** Opposite corner: the cursor, except along a typed size (kept on the cursor's side of a). */
export function rectCorner(s: Drag): Vec2 {
  const along = (typed: number | null, a: number, cursor: number) => (typed === null ? cursor : a + (cursor < a ? -typed : typed));
  return { x: along(s.width, s.a.x, s.b.point.x), y: along(s.height, s.a.y, s.b.point.y) };
}

const onWall = (kind: SnapKind): boolean => kind === 'node' || kind === 'wallAxis' || kind === 'wallMid';

/**
 * Ruling V2-R25: a corner on an existing wall (the press, or the cursor when it gives the opposite
 * corner) makes this drawing an axis one, V1 addRectRoom: the corners are wall axes, so that the
 * sides shared with the existing walls merge with them (T junctions) instead of doubling them.
 */
export function rectHooked(s: Drag): boolean {
  return s.aOnWall || (onWall(s.b.kind) && dist(rectCorner(s), s.b.point) <= 1e-9);
}

function commit(s: Drag, env: RectToolEnv): RectToolResult {
  const thickness = s.partition ? env.partitionThickness : env.thickness;
  return {
    state: RECT_IDLE,
    effects: [{ type: 'commit', levelId: s.levelId, a: s.a, b: rectCorner(s), thickness, height: env.height, interior: !rectHooked(s) }],
  };
}

/** Opens the field of a side; `initial` defaults to the value already typed for that side. */
const open = (s: Drag, field: RectField, initial?: string): RectToolResult => {
  const typed = s[field];
  const text = initial ?? (typed === null ? '' : formatNumber(typed));
  return {
    state: { ...s, typing: field },
    effects: [{ type: 'openNumeric', initial: text, screen: fieldScreen(s.screen, diagonal(s.a, rectCorner(s))), label: RECT_FIELD_LABELS[field] }],
  };
};

/**
 * The rectangular room tool as a pure state machine (spec 7.3, 7.4; V2 spec 6): press = snapped
 * corner A, drag = snapped corner B (preview with width / height dimensions), release = commit of
 * the rectangle A-B as the INSIDE of the room (the tool runs addRectRoomInterior: walls outside),
 * or as wall axes when a corner is on an existing wall (rectHooked, ruling V2-R25); a release
 * without a real rectangle does nothing. While dragging, a digit opens the width field,
 * Tab / Shift+Tab fix the typed value and switch to the other side (prefilled with its value when
 * already typed; an emptied field lets that side follow the cursor again), Enter fixes it and
 * creates the room (a typed size follows the side of the cursor; the other one follows the
 * cursor). Once a field is open the release waits for Enter. Escape, Mod+Z, a pointer cancel (or
 * dismissing the field after the release) cancel without creating anything.
 */
export function reduceRectTool(state: RectToolState, event: RectToolEvent, env: RectToolEnv): RectToolResult {
  const s: RectToolState = state.phase === 'drag' && state.levelId !== env.level.id ? RECT_IDLE : state;
  const same = { state: s, effects: [] };

  if (s.phase === 'idle') {
    switch (event.type) {
      case 'move':
        return { state: { phase: 'idle', hover: snap(event.world, event.mods, env) }, effects: [] };
      case 'down': {
        const b = snap(event.world, event.mods, env);
        const drag: Drag = {
          phase: 'drag', levelId: env.level.id, a: { ...b.point }, aOnWall: onWall(b.kind), b, screen: event.screen, released: false,
          partition: event.mods.meta, width: null, height: null, typing: null,
        };
        return { state: drag, effects: [] };
      }
      default:
        return same;
    }
  }

  switch (event.type) {
    case 'down':
      return same;
    case 'move':
      return {
        state: { ...s, b: snap(event.world, event.mods, env), screen: event.screen, partition: s.partition || event.mods.meta },
        effects: [],
      };
    case 'up': {
      const cur: Drag = {
        ...s, b: snap(event.world, event.mods, env), screen: event.screen, partition: s.partition || event.mods.meta, released: true,
      };
      if (cur.typing) return { state: cur, effects: [] };
      const c = rectCorner(cur);
      const big = Math.abs(c.x - cur.a.x) >= MIN_WALL_LENGTH && Math.abs(c.y - cur.a.y) >= MIN_WALL_LENGTH;
      return big ? commit(cur, env) : { state: RECT_IDLE, effects: [] };
    }
    case 'escape':
      return { state: RECT_IDLE, effects: s.typing ? [{ type: 'closeNumeric' }] : [] };
    case 'digit': {
      if (s.typing) return same;
      const cur: Drag = { ...s, partition: s.partition || !!event.meta };
      return open(cur, s.width === null || s.height !== null ? 'width' : 'height', event.key);
    }
    case 'numericTab': {
      if (!s.typing) return same;
      // two sides: forward and backward both lead to the other one
      return open({ ...s, [s.typing]: event.value }, s.typing === 'width' ? 'height' : 'width');
    }
    case 'numericSubmit':
      if (!s.typing) return same;
      return commit({ ...s, [s.typing]: event.value, typing: null }, env);
    case 'numericCancel':
      return { state: s.released ? RECT_IDLE : { ...s, typing: null }, effects: [] };
  }
}

function diagonal(a: Vec2, c: Vec2): Vec2 | undefined {
  const v = sub(c, a);
  return len(v) > 1e-9 ? normalize({ x: Math.sign(v.x), y: Math.sign(v.y) }) : undefined;
}

/**
 * Overlay of the rectangle tool: the snapped cursor marker and its guides; while dragging, the
 * walls around the rectangle (their axes thickness / 2 outside it, stroked with the thickness),
 * the rectangle itself dashed, its interior width (top side) and height (left side) as dynamic
 * dimensions beyond the walls (the one being typed highlighted), and the thickness. Hooked on an
 * existing wall (V2-R25): the V1 preview (axes on the rectangle, axis dimensions) and HOOKED_LABEL.
 */
export function rectToolOverlay(s: RectToolState, env: RectToolEnv): DrawOverlay {
  if (s.phase === 'idle') {
    const h = s.hover;
    if (!h) return EMPTY_DRAW_OVERLAY;
    return { ...EMPTY_DRAW_OVERLAY, guides: h.guides, ghost: { kind: 'draw', paths: [], marker: { at: h.point, snap: h.kind }, label: null } };
  }
  const thickness = s.partition ? env.partitionThickness : env.thickness;
  const c = rectCorner(s);
  const x1 = Math.min(s.a.x, c.x);
  const x2 = Math.max(s.a.x, c.x);
  const y1 = Math.min(s.a.y, c.y);
  const y2 = Math.max(s.a.y, c.y);
  const hooked = rectHooked(s);
  // offsets are positive towards perp(b - a): outside means negative for both sides below
  const offset = -((hooked ? thickness / 2 : thickness) + DYN_DIM_GAP_PX / env.pxPerCm);
  const h = thickness / 2;
  const rect = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
  const lines = [thicknessLabel(thickness, s.partition), ...(hooked ? [HOOKED_LABEL] : [])];
  return {
    guides: s.b.guides,
    dynamicDims: [
      { a: { x: x1, y: y1 }, b: { x: x2, y: y1 }, offset, value: x2 - x1, kind: 'dynamic' },
      { a: { x: x1, y: y2 }, b: { x: x1, y: y1 }, offset, value: y2 - y1, kind: 'dynamic' },
    ],
    activeDimIndex: s.typing === 'width' ? 0 : s.typing === 'height' ? 1 : null,
    ghost: {
      kind: 'draw',
      paths: hooked
        ? [{ points: rect, closed: true, thickness }]
        : [
            { points: [{ x: x1 - h, y: y1 - h }, { x: x2 + h, y: y1 - h }, { x: x2 + h, y: y2 + h }, { x: x1 - h, y: y2 + h }], closed: true, thickness, axis: false },
            { points: rect, closed: true, thickness: 0 },
          ],
      marker: { at: c, snap: s.b.kind },
      // outside the rectangle, beyond the dragged corner
      label: { at: c, lines, toward: diagonal(s.a, c) },
    },
  };
}
