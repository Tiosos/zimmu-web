import { describe, it, expect } from 'vitest'
import { groupHardware } from './groupHardware'
import type { HardwareLine } from '../scene/carcaseHardware'

const lines: HardwareLine[] = [
  { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
  { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'screw-8x40', qty: 32 },
]

describe('groupHardware', () => {
  it('names and prices a line from the catalogue and the library', () => {
    const rows = groupHardware(lines, {
      'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
    })
    expect(rows[0]).toEqual({
      key: 'hinge-overlay',
      cabinetLabel: 'Base A',
      name: '110° hinge c/w plate',
      qty: 2,
      unit: 'pcs',
      supplier: 'Blum',
      partNumber: '71B3550',
      unitCost: 3.4,
      totalCost: 6.8,
    })
  })

  // An unpriced job must never read as a free one: no entry means no cost, not a cost of zero.
  it('leaves an unpriced key blank rather than free', () => {
    const rows = groupHardware(lines, {})
    expect(rows.every((r) => r.unitCost === null && r.totalCost === null)).toBe(true)
  })

  it('keeps a deliberate zero as a price', () => {
    const rows = groupHardware(lines.slice(0, 1), {
      'hinge-overlay': { supplier: '', partNumber: '', unitCost: 0 },
    })
    expect(rows[0].unitCost).toBe(0)
    expect(rows[0].totalCost).toBe(0)
  })

  it('preserves the order the lines arrived in', () => {
    expect(groupHardware(lines, {}).map((r) => r.key)).toEqual(['hinge-overlay', 'screw-8x40'])
  })
})
