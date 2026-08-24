import { describe, it, expect } from 'vitest'
import {
  cutDimensions,
  groupParts,
  buildCsv,
  buildHardwareCsv,
  groupDowels,
  buildDowelCsv,
} from './buildCsv'
import type { BoardPart, CarcaseComponent, Part, CylinderPart, Scene } from '../scene/types'
import type { MaterialDef, HardwareItem } from '../scene/types'
import { regenerateComponents } from '../scene/regenerateComponents'
import { CARCASE_PRESETS } from '../scene/carcasePresets'

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
    parentId: null,
    driven: false,
    ...over,
  }
}

const plywoodPart: BoardPart = {
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
  parentId: null,
  driven: false,
}

const materials: Record<string, MaterialDef> = {
  Plywood: { costPerM2: 100 },
}

// Generated rather than hand-written: a hand-written fixture is how a wrong cut length survived
// four phases of this project unnoticed.
function generatedBase600(): BoardPart[] {
  const cabinet: CarcaseComponent = {
    kind: 'carcase',
    id: 'cmp_1',
    label: 'Base 600',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: CARCASE_PRESETS[0].params,
  }
  const scene: Scene = {
    parts: [],
    materials: {},
    hardware: [],
    joints: [],
    components: [cabinet],
  }
  return regenerateComponents(scene).parts.filter((p): p is BoardPart => p.kind === 'board')
}

function csvRow(csv: string, label: string): string[] {
  const line = csv.split('\n').find((l) => l.includes(label))!
  return line.split(',')
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
        parentId: null,
        driven: false,
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
      linkedComponentIds: [],
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

describe('cutDimensions', () => {
  it('reports the longer in-plane dimension as the length', () => {
    expect(cutDimensions({ ...plywoodPart, length: 600, width: 100, thickness: 18 })).toEqual({
      length: 600,
      width: 100,
      thickness: 18,
    })
  })

  it('swaps a width-longer board so the length is the long edge', () => {
    expect(cutDimensions({ ...plywoodPart, length: 100, width: 600, thickness: 18 })).toEqual({
      length: 600,
      width: 100,
      thickness: 18,
    })
  })

  it('never moves the thickness, even when it is the largest dimension', () => {
    expect(cutDimensions({ ...plywoodPart, length: 40, width: 60, thickness: 100 }).thickness).toBe(
      100,
    )
  })
})

describe('cut dimensions in the cutting list', () => {
  it('collapses a board and its transposed twin into one row of qty 2', () => {
    const a: Part = { ...plywoodPart, id: 'a', label: 'A', length: 600, width: 100 }
    const b: Part = { ...plywoodPart, id: 'b', label: 'B', length: 100, width: 600 }
    const rows = groupParts([a, b])

    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(2)
    expect(rows[0].length).toBe(600)
    expect(rows[0].width).toBe(100)
  })

  it('leaves a hand-placed board that is already length-first alone', () => {
    const rows = groupParts([{ ...plywoodPart, length: 200, width: 100, thickness: 25 }])

    expect(rows[0].length).toBe(200)
    expect(rows[0].width).toBe(100)
    expect(rows[0].thickness).toBe(25)
  })

  it("carries the cut length in the CSV's Length column for a generated cabinet side", () => {
    const parts = generatedBase600()
    const side = parts.find((p) => p.role === 'left-side')!
    expect([side.length, side.width]).toEqual([560, 720]) // stored, unchanged

    const row = csvRow(buildCsv(parts), 'Left Side')
    expect(row[5]).toBe('720') // Length (mm)
    expect(row[6]).toBe('560') // Width (mm)
  })

  it('prices a generated cabinet at its stored areas, so normalising moves no cost', () => {
    const parts = generatedBase600()
    const rate = 100
    const expected = parts.reduce((sum, p) => sum + ((p.length * p.width) / 1_000_000) * rate, 0)

    const rows = groupParts(parts, { '18mm Ply': { costPerM2: rate } })
    const total = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)

    expect(total).toBeCloseTo(expected, 6)
  })
})

describe('grouping by component', () => {
  function makeCarcase(id: string, label: string, x: number): CarcaseComponent {
    return {
      id,
      kind: 'carcase',
      label,
      parentId: null,
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: CARCASE_PRESETS[0].params,
    }
  }

  const one = regenerateComponents({
    parts: [],
    materials: {},
    hardware: [],
    joints: [],
    components: [makeCarcase('cmp_1', 'Base Cabinet 600', 0)],
  })
  const parts = one.parts
  const components = one.components
  const cabinet = components[0]

  const two = regenerateComponents({
    parts: [],
    materials: {},
    hardware: [],
    joints: [],
    components: [makeCarcase('cmp_1', 'Cab A', 0), makeCarcase('cmp_2', 'Cab B', 700)],
  })
  const twoIdenticalSidesInDifferentCabinets = two.parts.filter((p) => p.role === 'left-side')
  // The generator gives each part a distinct palette color (PART_COLORS[i % len]), so a cabinet's
  // left- and right-side are not identical rows. Duplicate one part to test within-cabinet merging.
  const oneSide = parts.find((p) => p.role === 'left-side')!
  const twoIdenticalSidesInOneCabinet = [oneSide, { ...oneSide, id: `${oneSide.id}-copy` }]
  const looseBoard = { ...parts[0], id: 'loose', parentId: null, driven: false, role: undefined }

  it('labels each row with its owning cabinet', () => {
    expect(groupParts(parts, {}, components)[0].component).toBe('Base Cabinet 600')
  })

  it('labels a top-level part with an empty component', () => {
    expect(groupParts([looseBoard], {}, [])[0].component).toBe('')
  })

  it('does not merge identical parts from different cabinets into one row', () => {
    expect(groupParts(twoIdenticalSidesInDifferentCabinets, {}, two.components)).toHaveLength(2)
  })

  it('still merges identical parts within one cabinet', () => {
    const rows = groupParts(twoIdenticalSidesInOneCabinet, {}, [cabinet])
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(2)
  })

  it('does not move any cost when the component list is added', () => {
    const withCost = { '18mm Ply': { costPerM2: 100 } }
    const before = groupParts(parts, withCost).reduce((n, r) => n + (r.totalCost ?? 0), 0)
    const after = groupParts(parts, withCost, components).reduce(
      (n, r) => n + (r.totalCost ?? 0),
      0,
    )
    expect(after).toBeCloseTo(before, 6)
  })

  it('puts the Cabinet column first in the CSV header', () => {
    expect(buildCsv(parts, {}, components).split('\n')[0]).toMatch(/^Cabinet,/)
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
      parentId: null,
      driven: false,
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
