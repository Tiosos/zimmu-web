import { describe, it, expect } from 'vitest'
import { groupParts, buildCsv, buildHardwareCsv } from './buildCsv'
import type { Part } from '../scene/types'
import type { MaterialDef, HardwareItem } from '../scene/types'

const plywoodPart: Part = {
  kind: 'board',
  id: 'p1',
  label: 'Shelf',
  length: 600,
  width: 300,
  thickness: 18,
  material: 'Plywood',
  color: '#aabbcc',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

const materials: Record<string, MaterialDef> = {
  Plywood: { costPerM2: 100 },
}

describe('groupParts', () => {
  it('returns costPerUnit null when no materials provided', () => {
    const rows = groupParts([plywoodPart])
    expect(rows[0].costPerUnit).toBeNull()
    expect(rows[0].totalCost).toBeNull()
  })

  it('computes costPerUnit from material rate', () => {
    const rows = groupParts([plywoodPart], materials)
    // 600mm × 300mm = 0.18 m² × $100/m² = $18.00
    expect(rows[0].costPerUnit).toBeCloseTo(18, 5)
  })

  it('computes totalCost as costPerUnit × qty', () => {
    const clone: Part = { ...plywoodPart, id: 'p2', label: 'Shelf 2' }
    const rows = groupParts([plywoodPart, clone], materials)
    // qty = 2, costPerUnit = 18, totalCost = 36
    expect(rows[0].qty).toBe(2)
    expect(rows[0].totalCost).toBeCloseTo(36, 5)
  })

  it('returns costPerUnit null when material not in materials dict', () => {
    const rows = groupParts([plywoodPart], { MDF: { costPerM2: 50 } })
    expect(rows[0].costPerUnit).toBeNull()
  })
})

describe('buildCsv', () => {
  it('includes Cost/unit and Total headers', () => {
    const csv = buildCsv([plywoodPart], materials)
    expect(csv).toContain('Cost/unit')
    expect(csv).toContain('Total')
  })

  it('shows cost value when rate is set', () => {
    const csv = buildCsv([plywoodPart], materials)
    // 18.00
    expect(csv).toContain('18.00')
  })

  it('leaves cost columns empty when no rate', () => {
    const csv = buildCsv([plywoodPart])
    const lines = csv.split('\n')
    // data row: last two comma-separated fields are empty
    const dataRow = lines[1]
    expect(dataRow).toMatch(/,,$/)
  })

  it('appends board subtotal row when any rate is set', () => {
    const csv = buildCsv([plywoodPart], materials)
    expect(csv).toContain('Board total')
    expect(csv).toContain('18.00')
  })

  it('does not append subtotal row when no rates are set', () => {
    const csv = buildCsv([plywoodPart])
    expect(csv).not.toContain('Board total')
  })
})

describe('buildHardwareCsv', () => {
  const items: HardwareItem[] = [
    {
      id: 'h1',
      name: 'Hinge',
      qty: 4,
      unit: 'pcs',
      supplier: 'Ace Hardware',
      partNumber: 'H-100',
      unitCost: 2.5,
      notes: 'soft-close',
      linkedPartIds: [],
    },
  ]

  it('includes correct header', () => {
    const csv = buildHardwareCsv(items)
    expect(csv.split('\n')[0]).toBe('Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes')
  })

  it('includes item row with correct values', () => {
    const csv = buildHardwareCsv(items)
    const lines = csv.split('\n')
    expect(lines[1]).toContain('Hinge')
    expect(lines[1]).toContain('4')
    expect(lines[1]).toContain('2.50')
    expect(lines[1]).toContain('10.00') // 4 × 2.50
  })

  it('appends hardware total row', () => {
    const csv = buildHardwareCsv(items)
    expect(csv).toContain('Hardware total')
    expect(csv).toContain('10.00')
  })

  it('returns header-only with empty list', () => {
    const csv = buildHardwareCsv([])
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1) // header only, no total row
  })
})
