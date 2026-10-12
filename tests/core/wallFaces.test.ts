import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { wallFaceLengths } from '@/core/geometry/wallFaces';
import type { Level } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const faces = (level: Level, id: string) => wallFaceLengths(level, deriveLevel(level), id);

describe('wallFaceLengths (spec 6: the length of each face of a wall)', () => {
  it('a lone room: the inner face is the interior dimension, the outer face the facade one', () => {
    // 20 cm walls on the axes -10 / 410: interior 400, facade 440
    const level = levelFromWalls(rectRoom(-10, -10, 410, 410));
    // top wall, dir +x: its left face (+perp = +y) is the room side
    expect(faces(level, findWall(level, -10, -10, 410, -10))).toEqual({ left: 400, right: 440 });
    // the same wall drawn the other way round swaps the faces
    const reversed = levelFromWalls([[410, -10, -10, -10], ...rectRoom(-10, -10, 410, 410).slice(1)]);
    const r = faces(reversed, findWall(reversed, -10, -10, 410, -10))!;
    expect(r.left).toBeCloseTo(440, 9);
    expect(r.right).toBeCloseTo(400, 9);
  });

  it('a partition splitting the top wall: each piece measures its own part of each face', () => {
    const level = levelFromWalls([
      [-10, -10, 200, -10],
      [200, -10, 410, -10],
      [410, -10, 410, 410],
      [410, 410, 200, 410],
      [200, 410, -10, 410],
      [-10, 410, -10, -10],
      [200, -10, 200, 410, 10],
    ]);
    const left = faces(level, findWall(level, -10, -10, 200, -10))!;
    // room side: x 0..195 (the partition face at 195); facade side: x -20..200 (up to the collinear piece)
    expect(left.left).toBeCloseTo(195, 9);
    expect(left.right).toBeCloseTo(220, 9);
    // the partition: 400 between the two walls on each face
    const partition = faces(level, findWall(level, 200, -10, 200, 410))!;
    expect(partition.left).toBeCloseTo(400, 9);
    expect(partition.right).toBeCloseTo(400, 9);
  });

  it('a wall whose end only touches a face (no shared node) hides that part of the face', () => {
    // partition x 195..205 from the inner face of the top wall (y = 0) to the bottom one (y = 400)
    const level = levelFromWalls([...rectRoom(-10, -10, 410, 410), [200, 0, 200, 400, 10]]);
    const top = faces(level, findWall(level, -10, -10, 410, -10))!;
    expect(top.left).toBeCloseTo(390, 9);
    expect(top.right).toBeCloseTo(440, 9);
  });

  it('a free-standing wall: both faces are its full length plus nothing (square ends)', () => {
    const level = levelFromWalls([[0, 0, 300, 0]]);
    expect(faces(level, findWall(level, 0, 0, 300, 0))).toEqual({ left: 300, right: 300 });
  });

  it('an unknown wall: null', () => {
    const level = levelFromWalls([[0, 0, 300, 0]]);
    expect(faces(level, 'ghost')).toBeNull();
  });
});
