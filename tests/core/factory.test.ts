import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/core/model/defaults'
import { createLevel, createObjectFromSize, createOpening, createProject } from '@/core/model/factory'
import { newId } from '@/core/model/ids'
import { FORMAT_VERSION } from '@/core/model/types'

describe('newId', () => {
  it('returns distinct non-empty strings', () => {
    const a = newId()
    const b = newId()
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })
})

describe('createProject', () => {
  it('has one level named RDC, version 1 and default settings', () => {
    const now = new Date('2026-10-07T10:00:00.000Z')
    const p = createProject('Maison', now)
    expect(p.name).toBe('Maison')
    expect(p.formatVersion).toBe(1)
    expect(p.formatVersion).toBe(FORMAT_VERSION)
    expect(p.settings).toEqual(DEFAULT_SETTINGS)
    expect(p.levels).toHaveLength(1)
    expect(p.levels[0]?.name).toBe('RDC')
    expect(p.levels[0]?.elevation).toBe(0)
    expect(p.levels[0]?.height).toBe(250)
    expect(p.createdAt).toBe('2026-10-07T10:00:00.000Z')
    expect(p.updatedAt).toBe('2026-10-07T10:00:00.000Z')
    expect(p.customObjects).toEqual({})
  })
  it('does not share the settings object with the defaults', () => {
    const p = createProject('A')
    p.settings.gridStep = 99
    expect(DEFAULT_SETTINGS.gridStep).toBe(10)
  })
})

describe('createLevel', () => {
  it('creates an empty level', () => {
    const l = createLevel('Etage', 270, 250)
    expect(l.name).toBe('Etage')
    expect(l.elevation).toBe(270)
    expect(l.height).toBe(250)
    expect(l.background).toBeNull()
    expect(l.nodes).toEqual({})
    expect(l.walls).toEqual({})
    expect(l.openings).toEqual({})
    expect(l.objects).toEqual({})
    expect(l.dimensions).toEqual({})
    expect(l.roomLabels).toEqual([])
    expect(l.id.length).toBeGreaterThan(0)
  })
})

describe('createOpening', () => {
  it('uses window defaults', () => {
    const o = createOpening('w1', 'window', 100)
    expect(o.wallId).toBe('w1')
    expect(o.kind).toBe('window')
    expect(o.variant).toBe('single')
    expect(o.offset).toBe(100)
    expect(o.width).toBe(120)
    expect(o.height).toBe(135)
    expect(o.sillHeight).toBe(90)
    expect(o.hinge).toBe('start')
    expect(o.swing).toBe('left')
  })
  it('uses door and passage defaults', () => {
    const d = createOpening('w1', 'door', 50)
    expect([d.width, d.height, d.sillHeight, d.variant]).toEqual([83, 204, 0, 'single'])
    const p = createOpening('w1', 'passage', 50)
    expect([p.width, p.height, p.sillHeight, p.variant]).toEqual([90, 204, 0, 'none'])
  })
  it('applies overrides', () => {
    const o = createOpening('w1', 'door', 50, { width: 100, hinge: 'end' })
    expect(o.width).toBe(100)
    expect(o.hinge).toBe('end')
    expect(o.height).toBe(204)
  })
})

describe('createObjectFromSize', () => {
  it('creates an object with neutral placement', () => {
    const o = createObjectFromSize(
      { kind: 'catalog', catalogId: 'bed' },
      10,
      20,
      { width: 160, depth: 200, height: 50 },
      'Lit',
      '#ccc',
    )
    expect(o.source).toEqual({ kind: 'catalog', catalogId: 'bed' })
    expect([o.x, o.y, o.rotation, o.elevation]).toEqual([10, 20, 0, 0])
    expect([o.width, o.depth, o.height]).toEqual([160, 200, 50])
    expect(o.name).toBe('Lit')
    expect(o.color).toBe('#ccc')
    expect(o.mirrored).toBe(false)
    expect(o.lshape).toBeNull()
  })
  it('applies overrides', () => {
    const o = createObjectFromSize(
      { kind: 'custom', customObjectId: 'c1' },
      0,
      0,
      { width: 1, depth: 1, height: 1 },
      'X',
      '#000',
      { rotation: 90, elevation: 30 },
    )
    expect(o.rotation).toBe(90)
    expect(o.elevation).toBe(30)
  })
})
