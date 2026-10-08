import { describe, expect, it } from 'vitest'
import { formatArea, formatCm, formatLength, parseCmInput } from '@/core/model/format'

describe('formatLength', () => {
  it('formats meters with a comma and 2 decimals', () => {
    expect(formatLength(350)).toBe('3,50 m')
    expect(formatLength(7)).toBe('0,07 m')
    expect(formatLength(12345)).toBe('123,45 m')
  })
  it('prints negative zero as 0,00 m', () => {
    expect(formatLength(-0)).toBe('0,00 m')
    expect(formatLength(0)).toBe('0,00 m')
  })
  it('does not print -0,00 for tiny negatives', () => {
    expect(formatLength(-0.1)).toBe('0,00 m')
  })
  it('keeps the sign of real negatives', () => {
    expect(formatLength(-350)).toBe('-3,50 m')
  })
})

describe('formatArea', () => {
  it('formats square meters', () => {
    expect(formatArea(124000)).toBe('12,40 m²')
    expect(formatArea(0)).toBe('0,00 m²')
  })
})

describe('formatCm', () => {
  it('formats integers without decimals', () => {
    expect(formatCm(83)).toBe('83 cm')
  })
  it('formats at most one decimal with a comma', () => {
    expect(formatCm(82.5)).toBe('82,5 cm')
    expect(formatCm(82.54)).toBe('82,5 cm')
    expect(formatCm(82.04)).toBe('82 cm')
  })
  it('prints negative zero as 0 cm', () => {
    expect(formatCm(-0)).toBe('0 cm')
  })
})

describe('parseCmInput', () => {
  it('parses plain centimeters', () => {
    expect(parseCmInput('350')).toBe(350)
    expect(parseCmInput('350,5')).toBe(350.5)
    expect(parseCmInput('350.5')).toBe(350.5)
    expect(parseCmInput(' 350 cm ')).toBe(350)
    expect(parseCmInput('350cm')).toBe(350)
  })
  it('parses meters', () => {
    expect(parseCmInput('3,5 m')).toBe(350)
    expect(parseCmInput('3.5m')).toBe(350)
  })
  it('rejects invalid input', () => {
    expect(parseCmInput('')).toBeNull()
    expect(parseCmInput('   ')).toBeNull()
    expect(parseCmInput('abc')).toBeNull()
    expect(parseCmInput('NaN')).toBeNull()
    expect(parseCmInput('1e999')).toBeNull()
    expect(parseCmInput('Infinity')).toBeNull()
    expect(parseCmInput('12abc')).toBeNull()
    expect(parseCmInput('1,2,3')).toBeNull()
  })
  it('rejects zero and negative values', () => {
    expect(parseCmInput('0')).toBeNull()
    expect(parseCmInput('-5')).toBeNull()
    expect(parseCmInput('0 m')).toBeNull()
    expect(parseCmInput('-1,5 m')).toBeNull()
  })
})
