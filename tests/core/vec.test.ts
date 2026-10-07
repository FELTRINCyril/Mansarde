import { describe, expect, it } from 'vitest'
import {
  add,
  angleOf,
  cross,
  deg2rad,
  dist,
  dot,
  equals,
  lerp,
  len,
  lineIntersection,
  normalize,
  perp,
  projectOnSegment,
  rad2deg,
  rotate,
  scale,
  segmentIntersection,
  sub,
  v,
} from '@/core/geometry/vec'

describe('vec basics', () => {
  it('v builds a vector', () => {
    expect(v(1, 2)).toEqual({ x: 1, y: 2 })
  })
  it('add, sub, scale', () => {
    expect(add(v(1, 2), v(3, 4))).toEqual({ x: 4, y: 6 })
    expect(sub(v(3, 4), v(1, 2))).toEqual({ x: 2, y: 2 })
    expect(scale(v(1, -2), 3)).toEqual({ x: 3, y: -6 })
  })
  it('dot and cross', () => {
    expect(dot(v(1, 2), v(3, 4))).toBe(11)
    expect(cross(v(1, 0), v(0, 1))).toBe(1)
    expect(cross(v(0, 1), v(1, 0))).toBe(-1)
  })
  it('len and dist', () => {
    expect(len(v(3, 4))).toBe(5)
    expect(dist(v(1, 1), v(4, 5))).toBe(5)
  })
  it('normalize handles the zero vector', () => {
    expect(normalize(v(0, 0))).toEqual({ x: 0, y: 0 })
    const n = normalize(v(0, 5))
    expect(n.x).toBeCloseTo(0)
    expect(n.y).toBeCloseTo(1)
  })
  it('perp rotates a quarter turn in screen space', () => {
    expect(perp(v(1, 0)).x).toBeCloseTo(0)
    expect(perp(v(1, 0)).y).toBe(1)
    expect(perp(v(0, 1)).x).toBe(-1)
  })
  it('rotate', () => {
    const r = rotate(v(1, 0), Math.PI / 2)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(1)
  })
  it('angleOf', () => {
    expect(angleOf(v(0, 1))).toBeCloseTo(Math.PI / 2)
    expect(angleOf(v(-1, 0))).toBeCloseTo(Math.PI)
  })
  it('lerp', () => {
    expect(lerp(v(0, 0), v(10, 20), 0.5)).toEqual({ x: 5, y: 10 })
  })
  it('equals uses an epsilon', () => {
    expect(equals(v(1, 1), v(1 + 1e-9, 1))).toBe(true)
    expect(equals(v(1, 1), v(1.1, 1))).toBe(false)
    expect(equals(v(1, 1), v(1.1, 1), 0.5)).toBe(true)
  })
  it('deg2rad and rad2deg', () => {
    expect(deg2rad(180)).toBeCloseTo(Math.PI)
    expect(rad2deg(Math.PI / 2)).toBeCloseTo(90)
  })
})

describe('lineIntersection', () => {
  it('intersects two perpendicular lines', () => {
    const p = lineIntersection(v(0, 5), v(1, 0), v(3, 0), v(0, 1))
    expect(p).not.toBeNull()
    expect(p?.x).toBeCloseTo(3)
    expect(p?.y).toBeCloseTo(5)
  })
  it('returns null for parallel lines', () => {
    expect(lineIntersection(v(0, 0), v(1, 0), v(0, 1), v(2, 0))).toBeNull()
  })
})

describe('projectOnSegment', () => {
  const a = v(0, 0)
  const b = v(10, 0)
  it('projects inside the segment', () => {
    const r = projectOnSegment(v(4, 3), a, b)
    expect(r.point).toEqual({ x: 4, y: 0 })
    expect(r.t).toBeCloseTo(0.4)
    expect(r.distance).toBeCloseTo(3)
  })
  it('clamps before the segment', () => {
    const r = projectOnSegment(v(-5, 0), a, b)
    expect(r.t).toBe(0)
    expect(r.point).toEqual({ x: 0, y: 0 })
    expect(r.distance).toBeCloseTo(5)
  })
  it('clamps after the segment', () => {
    const r = projectOnSegment(v(15, 0), a, b)
    expect(r.t).toBe(1)
    expect(r.point).toEqual({ x: 10, y: 0 })
    expect(r.distance).toBeCloseTo(5)
  })
  it('handles a degenerate segment', () => {
    const r = projectOnSegment(v(3, 4), v(1, 1), v(1, 1))
    expect(r.t).toBe(0)
    expect(r.distance).toBeCloseTo(Math.hypot(2, 3))
  })
})

describe('segmentIntersection', () => {
  it('finds an X crossing', () => {
    const r = segmentIntersection(v(0, 0), v(10, 10), v(0, 10), v(10, 0))
    expect(r).not.toBeNull()
    expect(r?.point.x).toBeCloseTo(5)
    expect(r?.point.y).toBeCloseTo(5)
    expect(r?.t).toBeCloseTo(0.5)
    expect(r?.u).toBeCloseTo(0.5)
  })
  it('returns null for disjoint segments', () => {
    expect(segmentIntersection(v(0, 0), v(1, 0), v(5, -1), v(5, 1))).toBeNull()
  })
  it('returns null for parallel segments', () => {
    expect(segmentIntersection(v(0, 0), v(10, 0), v(0, 1), v(10, 1))).toBeNull()
  })
})
