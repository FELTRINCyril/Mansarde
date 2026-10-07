import { describe, expect, it } from 'vitest'
import {
  area,
  bbox,
  distanceToRing,
  mergeCollinear,
  pointInPolygon,
  pointInRing,
  rectRing,
  ringEdges,
  signedArea,
} from '@/core/geometry/polygon'
import type { Ring } from '@/core/model/types'

const square: Ring = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('area', () => {
  it('computes the area of a 10x10 square', () => {
    expect(area(square)).toBe(100)
    expect(signedArea(square)).toBe(100)
  })
  it('gives the same area for a reversed ring', () => {
    const rev = [...square].reverse()
    expect(area(rev)).toBe(100)
    expect(signedArea(rev)).toBe(-100)
  })
  it('is 0 for degenerate rings', () => {
    expect(area([])).toBe(0)
    expect(area([{ x: 1, y: 1 }])).toBe(0)
  })
})

describe('pointInRing / pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInRing({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInRing({ x: 15, y: 5 }, square)).toBe(false)
  })
  it('excludes points in a hole', () => {
    const hole: Ring = [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 },
    ]
    const poly = { outer: square, holes: [hole] }
    expect(pointInPolygon({ x: 1, y: 1 }, poly)).toBe(true)
    expect(pointInPolygon({ x: 5, y: 5 }, poly)).toBe(false)
    expect(pointInPolygon({ x: 20, y: 5 }, poly)).toBe(false)
  })
})

describe('bbox', () => {
  it('returns null for no points', () => {
    expect(bbox([])).toBeNull()
  })
  it('returns the bounds', () => {
    expect(
      bbox([
        { x: 2, y: -3 },
        { x: -1, y: 4 },
        { x: 5, y: 0 },
      ]),
    ).toEqual({ minX: -1, minY: -3, maxX: 5, maxY: 4 })
  })
})

describe('ringEdges', () => {
  it('returns closing edge too', () => {
    const edges = ringEdges(square)
    expect(edges).toHaveLength(4)
    expect(edges[3]).toEqual([
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ])
  })
})

describe('distanceToRing', () => {
  it('measures the distance to the nearest edge', () => {
    expect(distanceToRing({ x: 5, y: 5 }, square)).toBeCloseTo(5)
    expect(distanceToRing({ x: 13, y: 5 }, square)).toBeCloseTo(3)
    expect(distanceToRing({ x: 13, y: 14 }, square)).toBeCloseTo(5)
  })
})

describe('rectRing', () => {
  it('unrotated corners are TL, TR, BR, BL', () => {
    expect(rectRing(10, 20, 4, 2, 0)).toEqual([
      { x: 8, y: 19 },
      { x: 12, y: 19 },
      { x: 12, y: 21 },
      { x: 8, y: 21 },
    ])
  })
  it('rotated by 90 degrees has the right corners', () => {
    // local corners (-2,-1),(2,-1),(2,1),(-2,1) rotated by 90: (x,y)->(-y,x)
    const r = rectRing(10, 20, 4, 2, 90)
    const expected = [
      { x: 11, y: 18 },
      { x: 11, y: 22 },
      { x: 9, y: 22 },
      { x: 9, y: 18 },
    ]
    expect(r).toHaveLength(4)
    r.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i]?.x ?? NaN)
      expect(p.y).toBeCloseTo(expected[i]?.y ?? NaN)
    })
  })
})

describe('mergeCollinear', () => {
  it('drops repeated points and vertices in the middle of a straight side', () => {
    const ring: Ring = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 10 + 1e-9 },
      { x: 0, y: 10 },
      { x: 0, y: 3 },
    ]
    expect(mergeCollinear(ring)).toEqual(square)
  })
  it('keeps real corners and spikes going back on themselves', () => {
    const spike: Ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]
    expect(mergeCollinear(square)).toEqual(square)
    expect(mergeCollinear(spike)).toHaveLength(4)
  })
})
