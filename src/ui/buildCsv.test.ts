import { describe, it, expect } from 'vitest'
import { groupParts, buildCsv, buildHardwareCsv, groupDowels, buildDowelCsv } from './buildCsv'
import type { Part, CylinderPart } from '../scene/types'
import type { MaterialDef, HardwareItem } from '../scene/types'

function makeDowel(over: Partial<CylinderPart> & { id: string }): Part {
  return {
    kind: 'cylinder',
    label: over.id,
    diameter: 8,
    length: 100,
    material: '',
    color: '#888888',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...over,
  }
}

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

  it('groupParts yields null cost when material has costPerM but no costPerM2', () => {
    const parts: Part[] = [
      {
        kind: 'board',
        id: 'b1',
        label: 'B1',
        length: 1000,
        width: 500,
        thickness: 18,
        material: 'Beech dowel',
        color: '#888888',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        cuts: [],
        visible: true,
      },
    ]
    const rows = groupParts(parts, { 'Beech dowel': { costPerM: 5 } })
    expect(rows[0].costPerUnit).toBeNull()
    expect(rows[0].totalCost).toBeNull()
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

describe('groupDowels', () => {
  it('groupDowels groups by Ø×length×material and costs by costPerM', () => {
    const dowels: Part[] = [
      makeDowel({ id: 'd1', diameter: 8, length: 100, material: 'Beech' }),
      makeDowel({ id: 'd2', diameter: 8, length: 100, material: 'Beech' }),
      makeDowel({ id: 'd3', diameter: 10, length: 100, material: 'Beech' }),
    ]
    const rows = groupDowels(dowels, { Beech: { costPerM: 5 } })
    expect(rows).toHaveLength(2)
    expect(rows[0].qty).toBe(2)
    expect(rows[0].diameter).toBe(8)
    expect(rows[0].costPerUnit).toBeCloseTo(0.5)
    expect(rows[0].totalCost).toBeCloseTo(1.0)
  })

  it('groupDowels yields null cost when no costPerM rate', () => {
    const rows = groupDowels([makeDowel({ id: 'd1', material: 'Beech' })], {})
    expect(rows[0].costPerUnit).toBeNull()
    expect(rows[0].totalCost).toBeNull()
  })

  it('groupDowels ignores board parts', () => {
    const board: Part = {
      kind: 'board',
      id: 'b1',
      label: 'B1',
      length: 200,
      width: 100,
      thickness: 25,
      material: 'Oak',
      color: '#888888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
    }
    expect(groupDowels([board], {})).toHaveLength(0)
  })
})

describe('buildDowelCsv', () => {
  it('buildDowelCsv emits header, rows, and a Dowel total', () => {
    const csv = buildDowelCsv(
      [makeDowel({ id: 'd1', diameter: 8, length: 100, material: 'Beech' })],
      { Beech: { costPerM: 5 } },
    )
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Qty,Labels,Material,Color,Diameter (mm),Length (mm),Cost/unit,Total')
    expect(lines[lines.length - 1]).toContain('Dowel total')
  })
})
