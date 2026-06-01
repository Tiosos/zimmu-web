import { describe, it, expect } from 'vitest'
import { buildCsv } from './CuttingList'
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}

describe('buildCsv', () => {
  it('returns only the header when parts array is empty', () => {
    expect(buildCsv([])).toBe('Label,Length (mm),Width (mm),Thickness (mm),Cuts')
  })

  it('returns header + one data row per part', () => {
    const csv = buildCsv([makePart(), makePart({ id: 'p2', label: 'Right Side' })])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('formats a data row with correct field values', () => {
    const csv = buildCsv([makePart({ length: 600, width: 300, thickness: 18 })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,0')
  })

  it('includes the cut count', () => {
    const cuts = [
      {
        id: 'c1',
        label: 'C1',
        face: '+X' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 10, y: 20, z: 20 },
      },
      {
        id: 'c2',
        label: 'C2',
        face: '-Y' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 20, y: 10, z: 20 },
      },
    ]
    const csv = buildCsv([makePart({ cuts })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,2')
  })

  it('wraps label in double quotes when it contains a comma', () => {
    const csv = buildCsv([makePart({ label: 'Left, Side' })])
    expect(csv.split('\n')[1]).toMatch(/^"Left, Side",/)
  })
})
