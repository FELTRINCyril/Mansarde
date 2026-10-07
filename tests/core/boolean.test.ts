import { describe, expect, it } from 'vitest'
import { difference, fromPc, ringToPc, toPc, unionRings, unionShapes } from '@/core/geometry/boolean'
import { area } from '@/core/geometry/polygon'
import type { Ring, Shape } from '@/core/model/types'

const rect = (x: number, y: number, w: number, h: number): Ring => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const shapeArea = (s: Shape): number =>
  s.reduce((acc, p) => acc + area(p.outer) - p.holes.reduce((a, h) => a + area(h), 0), 0)

describe('pc conversion', () => {
  it('ringToPc closes the ring', () => {
    const pcRing = ringToPc(rect(0, 0, 10, 10))
    expect(pcRing).toHaveLength(5)
    expect(pcRing[0]).toEqual(pcRing[4])
  })
  it('toPc / fromPc round-trip drops the closing point', () => {
    const shape: Shape = [{ outer: rect(0, 0, 10, 10), holes: [rect(3, 3, 4, 4)] }]
    const back = fromPc(toPc(shape))
    expect(back).toHaveLength(1)
    expect(back[0]?.outer).toHaveLength(4)
    expect(back[0]?.holes).toHaveLength(1)
    expect(back[0]?.holes[0]).toHaveLength(4)
    expect(shapeArea(back)).toBeCloseTo(100 - 16)
  })
})

describe('unionRings', () => {
  it('returns [] for no rings', () => {
    expect(unionRings([])).toEqual([])
  })
  it('unions two overlapping squares offset by 5 in x and y', () => {
    const s = unionRings([rect(0, 0, 10, 10), rect(5, 5, 10, 10)])
    expect(s).toHaveLength(1)
    expect(shapeArea(s)).toBeCloseTo(175)
  })
  it('unions four rectangles forming a frame into one polygon with one hole', () => {
    // outer 30x30, border 5: hole is 20x20 -> area 900 - 400 = 500
    const s = unionRings([
      rect(0, 0, 30, 5),
      rect(0, 25, 30, 5),
      rect(0, 5, 5, 20),
      rect(25, 5, 5, 20),
    ])
    expect(s).toHaveLength(1)
    expect(s[0]?.holes).toHaveLength(1)
    expect(shapeArea(s)).toBeCloseTo(500)
  })
})

describe('unionShapes', () => {
  it('unions several shapes', () => {
    const a: Shape = [{ outer: rect(0, 0, 10, 10), holes: [] }]
    const b: Shape = [{ outer: rect(5, 5, 10, 10), holes: [] }]
    expect(shapeArea(unionShapes([a, b]))).toBeCloseTo(175)
  })
  it('returns [] for no shapes', () => {
    expect(unionShapes([])).toEqual([])
  })
})

describe('difference', () => {
  it('subtracting a central square leaves a polygon with one hole', () => {
    const subject: Shape = [{ outer: rect(0, 0, 10, 10), holes: [] }]
    const s = difference(subject, [rect(3, 3, 4, 4)])
    expect(s).toHaveLength(1)
    expect(s[0]?.holes).toHaveLength(1)
    expect(shapeArea(s)).toBeCloseTo(84)
  })
  it('returns the subject unchanged when there is nothing to subtract', () => {
    const subject: Shape = [{ outer: rect(0, 0, 10, 10), holes: [] }]
    expect(shapeArea(difference(subject, []))).toBeCloseTo(100)
  })
})
