import { describe, expect, it } from 'vitest';
import { autoDimensionsOf, computeAutoDimensions, type DimLine } from '@/core/geometry/autoDimensions';
import { deriveLevel } from '@/core/geometry/derived';
import { createOpening } from '@/core/model/factory';
import type { Level, Vec2 } from '@/core/model/types';
import { add, normalize, perp, scale, sub } from '@/core/geometry/vec';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const dims = (level: Level) => computeAutoDimensions(level, deriveLevel(level));
const values = (ds: DimLine[], kind: DimLine['kind']) =>
  ds
    .filter((d) => d.kind === kind)
    .map((d) => Math.round(d.value * 1e6) / 1e6)
    .sort((a, b) => a - b);
/** Middle of the dimension line itself (anchors moved by the signed offset along perp(b - a)). */
const lineMid = (d: DimLine): Vec2 =>
  add(scale(add(d.a, d.b), 0.5), scale(normalize(perp(sub(d.b, d.a))), d.offset));

describe('computeAutoDimensions', () => {
  it('a lone 400 x 300 room: interior faces 380/280, facade faces 420/320', () => {
    const ds = dims(levelFromWalls(rectRoom(0, 0, 400, 300)));
    expect(values(ds, 'room')).toEqual([280, 280, 380, 380]);
    expect(values(ds, 'facade')).toEqual([320, 320, 420, 420]);
    expect(ds.filter((d) => d.kind === 'opening')).toEqual([]);
  });

  it('room dimensions sit 25 cm inside the room, facade dimensions 50 cm outside', () => {
    const ds = dims(levelFromWalls(rectRoom(0, 0, 400, 300)));
    for (const d of ds) {
      const m = lineMid(d);
      if (d.kind === 'room') {
        expect(Math.abs(d.offset)).toBe(25);
        expect(m.x > 10 && m.x < 390 && m.y > 10 && m.y < 290).toBe(true);
      } else {
        expect(Math.abs(d.offset)).toBe(50);
        expect(m.x < -10 || m.x > 410 || m.y < -10 || m.y > 310).toBe(true);
      }
    }
  });

  it('merges collinear pieces of a face into one dimension', () => {
    // triangle whose diagonal side is drawn as two walls: the union keeps extra vertices on that side
    const level = levelFromWalls([[0, 0, 150, 100], [150, 100, 300, 200], [300, 200, 0, 300], [0, 300, 0, 0]]);
    const d = deriveLevel(level);
    expect(d.facadeRings[0]!.length).toBeGreaterThan(3);
    const ds = computeAutoDimensions(level, d);
    expect(ds.filter((x) => x.kind === 'room')).toHaveLength(3);
    expect(ds.filter((x) => x.kind === 'facade')).toHaveLength(3);
  });

  it('one opening dimension per opening, on the side opposite to the swing', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const top = findWall(level, 0, 0, 400, 0);
    const door = createOpening(top, 'door', 200, { swing: 'right' });
    level.openings[door.id] = door;
    const ds = dims(level);
    const op = ds.filter((d) => d.kind === 'opening');
    expect(op).toHaveLength(1);
    expect(op[0]!.value).toBeCloseTo(83, 6);
    expect(op[0]!.a.x).toBeCloseTo(200 - 41.5, 6);
    expect(op[0]!.b.x).toBeCloseTo(200 + 41.5, 6);
    // swing right = -perp(dir) = -y (outside); the dimension goes to +y (inside the room), 10 + 20 cm from the axis
    expect(op[0]!.offset).toBe(30);
    expect(lineMid(op[0]!).y).toBeCloseTo(30, 6);
    // openings do not cut the room or facade faces
    expect(values(ds, 'room')).toEqual([280, 280, 380, 380]);
  });

  it('skips faces of 10 cm or less', () => {
    // a 10 cm thick stub on the right wall: its end face is exactly 10 cm long
    const ds = dims(levelFromWalls([...rectRoom(0, 0, 400, 300), [400, 150, 440, 150, 10]]));
    expect(ds.every((d) => d.value > 10)).toBe(true);
  });

  it('a free-standing wall box inside a room is not a facade', () => {
    const ds = dims(levelFromWalls([...rectRoom(0, 0, 400, 300), ...rectRoom(250, 100, 350, 200, 10)]));
    expect(values(ds, 'facade')).toEqual([320, 320, 420, 420]);
    // its outer faces (110 x 110) are measured as room faces, from the room side
    expect(values(ds, 'room')).toEqual([90, 90, 90, 90, 110, 110, 110, 110, 280, 280, 380, 380]);
  });
});

describe('autoDimensionsOf', () => {
  it('is computed once per derived level: moving furniture reuses it, a wall change does not', () => {
    const level = levelFromWalls(rectRoom(0, 0, 400, 300));
    const first = autoDimensionsOf(level, deriveLevel(level));
    expect(first).toEqual(computeAutoDimensions(level, deriveLevel(level)));
    // a new Level object with the same walls (furniture edit): same derived, same array
    const furnished: Level = { ...level, objects: { ...level.objects } };
    expect(autoDimensionsOf(furnished, deriveLevel(furnished))).toBe(first);
    // geometry changed: recomputed
    const n = Object.values(level.nodes)[0]!;
    const moved: Level = { ...level, nodes: { ...level.nodes, [n.id]: { ...n, x: n.x - 50 } } };
    expect(autoDimensionsOf(moved, deriveLevel(moved))).not.toBe(first);
  });
});
