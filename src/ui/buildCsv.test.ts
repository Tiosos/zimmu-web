import { describe, it, expect } from 'vitest'
import {
  finishedDimensions,
  groupParts,
  buildCsv,
  buildHardwareCsv,
  groupDowels,
  buildDowelCsv,
  buildCsvFromRows,
  buildDowelCsvFromRows,
  isNestable,
  groupEdgeBand,
} from './buildCsv'
import type {
  BoardPart,
  CarcaseComponent,
  Component,
  Part,
  CylinderPart,
  Scene,
} from '../scene/types'
import type { MaterialDef, HardwareItem } from '../scene/types'
import { regenerateComponents } from '../scene/regenerateComponents'
import { CARCASE_PRESETS, DEFAULT_FRAME_MATERIAL, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { HardwareRow } from './groupHardware'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { isSwapped } from '../scene/grain'

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
  grain: 'free' as const,
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
    materials: { ...PRESET_MATERIALS },
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
        grain: 'free' as const,
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
    expect(csv.split('\n')[0]).toBe('Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes')
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

  const derived: HardwareRow[] = [
    {
      componentId: 'cmp_1',
      key: 'hinge-overlay',
      cabinetLabel: 'Base A',
      name: '110° hinge c/w plate',
      qty: 2,
      unit: 'pcs',
      supplier: 'Blum',
      partNumber: '71B3550',
      unitCost: 3.4,
      totalCost: 6.8,
    },
  ]

  const manual = [
    {
      id: 'h1',
      name: 'Handle',
      qty: 4,
      unit: 'pcs',
      supplier: 'Ironmongery',
      partNumber: 'H-12',
      unitCost: 5,
      notes: '',
      linkedPartIds: [],
      linkedComponentIds: [],
    },
  ]

  it('names the cabinet on a derived row and leaves it blank on a typed one', () => {
    const rows = buildHardwareCsv(manual, derived).split('\n')
    expect(rows[0]).toBe('Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes')
    expect(rows[1]).toBe('Base A,110° hinge c/w plate,2,pcs,Blum,71B3550,3.40,6.80,')
    expect(rows[2]).toBe(',Handle,4,pcs,Ironmongery,H-12,5.00,20.00,')
  })

  it('carries three totals, so a user can see which half is generated', () => {
    const rows = buildHardwareCsv(manual, derived).split('\n')
    expect(rows.slice(-3)).toEqual([
      ',,,,,,Generated total,6.80,',
      ',,,,,,Hand-entered total,20.00,',
      ',,,,,,Hardware total,26.80,',
    ])
  })

  it('leaves an unpriced derived row blank and out of the total', () => {
    const unpriced = [{ ...derived[0], unitCost: null, totalCost: null }]
    const rows = buildHardwareCsv([], unpriced).split('\n')
    expect(rows[1]).toBe('Base A,110° hinge c/w plate,2,pcs,Blum,71B3550,,,')
    expect(rows.at(-1)).toBe(',,,,,,Hardware total,0.00,')
  })

  it('still builds a header for an empty job', () => {
    expect(buildHardwareCsv([], [])).toBe(
      'Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes',
    )
  })
})

describe('finishedDimensions', () => {
  it('reports the longer in-plane dimension as the length', () => {
    expect(finishedDimensions({ ...plywoodPart, length: 600, width: 100, thickness: 18 })).toEqual({
      length: 600,
      width: 100,
      thickness: 18,
    })
  })

  it('swaps a width-longer board so the length is the long edge', () => {
    expect(finishedDimensions({ ...plywoodPart, length: 100, width: 600, thickness: 18 })).toEqual({
      length: 600,
      width: 100,
      thickness: 18,
    })
  })

  it('never moves the thickness, even when it is the largest dimension', () => {
    expect(finishedDimensions({ ...plywoodPart, length: 40, width: 60, thickness: 100 }).thickness).toBe(
      100,
    )
  })

  // A three-bay 900's shelf is stored 285 x 548 and runs its grain along the 285 mm span. Grain
  // decides the length because that is what the length *means* on a sheet good; size only decides
  // it when grain is unconstrained.
  it('grain decides the length, even when it is the shorter dimension', () => {
    expect(
      finishedDimensions({ ...plywoodPart, length: 285, width: 548, thickness: 18, grain: 'length' }),
    ).toEqual({ length: 285, width: 548, thickness: 18 })
  })

  it('grain on width swaps the pair', () => {
    expect(
      finishedDimensions({ ...plywoodPart, length: 560, width: 720, thickness: 18, grain: 'width' }),
    ).toEqual({ length: 720, width: 560, thickness: 18 })
  })

  it('free grain keeps the longest-first rule', () => {
    expect(
      finishedDimensions({ ...plywoodPart, length: 560, width: 720, thickness: 18, grain: 'free' }),
    ).toEqual({ length: 720, width: 560, thickness: 18 })
  })
})

describe('grain in the cutting list', () => {
  // The reported grain is relative to the *reported* dimensions, not the stored ones: finishedDimensions
  // has already put the grain-running dimension into `length`.
  it('reports a directional board as running along the reported length', () => {
    const a: Part = { ...plywoodPart, id: 'a', label: 'A', length: 300, width: 600, grain: 'width' }
    const row = groupParts([a])[0]
    expect(row.length).toBe(600)
    expect(row.grain).toBe('length')
  })

  it('reports an unconstrained board as free', () => {
    expect(groupParts([{ ...plywoodPart, id: 'a', grain: 'free' }])[0].grain).toBe('free')
  })

  // This is the assertion that found the first attempt wrong. A 600x300 'length' board, a 300x600
  // 'width' board and a 600x300 'free' board all reduce to 600x300, so taking the row's grain from
  // whichever part arrived first reported one part's grain for another's.
  it('every part in a group agrees with the grain the row reports', () => {
    const parts: Part[] = [
      { ...plywoodPart, id: 'a', label: 'A', length: 600, width: 300, grain: 'length' },
      { ...plywoodPart, id: 'b', label: 'B', length: 300, width: 600, grain: 'width' },
      { ...plywoodPart, id: 'c', label: 'C', length: 600, width: 300, grain: 'free' },
      { ...plywoodPart, id: 'd', label: 'D', length: 600, width: 300, grain: 'width' },
    ]
    const rows = groupParts(parts)
    expect(rows.length).toBeGreaterThan(1)

    for (const row of rows) {
      const members = parts.filter((p) => row.labels.split(', ').includes(p.label))
      expect(members.length).toBe(row.qty)
      for (const m of members) {
        const expected = m.kind === 'board' && m.grain === 'free' ? 'free' : 'length'
        expect(expected, `${m.label} in row ${row.key}`).toBe(row.grain)
      }
    }
  })

  it('keeps a rotatable board out of a directional board s row', () => {
    const rows = groupParts([
      { ...plywoodPart, id: 'a', label: 'A', length: 600, width: 300, grain: 'length' },
      { ...plywoodPart, id: 'b', label: 'B', length: 600, width: 300, grain: 'free' },
    ])
    expect(rows).toHaveLength(2)
  })

  it('names the grain in the CSV header and each row', () => {
    const csv = buildCsv([{ ...plywoodPart, grain: 'width' }])
    const [header, first] = csv.split('\n')
    const col = header.split(',').indexOf('Grain')
    expect(col).toBeGreaterThan(-1)
    expect(first.split(',')[col]).toBe('length')
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
    // A carcase names a material per slot, so its back is 12 mm MDF and carries no rate here. Only
    // the panels actually made of the priced material contribute.
    const expected = parts
      .filter((p) => p.material === '18mm Ply')
      .reduce((sum, p) => sum + ((p.length * p.width) / 1_000_000) * rate, 0)

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
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [makeCarcase('cmp_1', 'Base Cabinet 600', 0)],
  })
  const parts = one.parts
  const components = one.components
  const cabinet = components[0]

  const two = regenerateComponents({
    parts: [],
    materials: { ...PRESET_MATERIALS },
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
  const wrapper: Component = {
    kind: 'group',
    id: 'cmp_wrap',
    label: 'Wrapper',
    parentId: cabinet.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
  }

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

  // groupParts read the immediate parent, so a board one level down was labelled with the
  // wrapper's name — and since the label is part of the grouping key, two cabinets' identical
  // boards merged under one meaningless row.
  it('labels a board under a nested component with its cabinet, not the wrapper', () => {
    const nested = { ...oneSide, id: 'nested', parentId: wrapper.id }
    const rows = groupParts([nested], {}, [cabinet, wrapper])
    expect(rows).toHaveLength(1)
    expect(rows[0].component).toBe('Base Cabinet 600')
  })

  // A group is not a cabinet, so the Cabinet column names none — the old immediate-parent read
  // printed the group's label under a heading it does not answer.
  it('leaves the Cabinet column empty for a board under a top-level group', () => {
    const topLevel: Component = { ...wrapper, parentId: null }
    const orphan = { ...oneSide, id: 'orphan', parentId: topLevel.id }
    expect(groupParts([orphan], {}, [topLevel])[0].component).toBe('')
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
      grain: 'free' as const,
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

describe('isNestable', () => {
  // Frame members are solid stock bought to length, not cut from a sheet. The preset frame material
  // carries no `sheet`, so the nest leaves every stile and rail out with no rule about their role.
  // A user who gives that material a sheet in the library opts it back in — the library's call.
  it('leaves the preset frame material out of the nest', () => {
    expect(PRESET_MATERIALS[DEFAULT_FRAME_MATERIAL].sheet).toBeUndefined()
    expect(isNestable(PRESET_MATERIALS[DEFAULT_FRAME_MATERIAL])).toBe(false)
  })

  it('a material with no sheet is not nested', () => {
    expect(isNestable({ costPerM2: 40 })).toBe(false)
  })

  // A sheet field created by typing one dimension into the library carries 0 for the other. Zero is
  // absent, not a zero-sized sheet — Stage 3 must not try to nest onto it.
  it('a half-filled sheet is not nested', () => {
    expect(isNestable({ sheet: { length: 2440, width: 0 } })).toBe(false)
    expect(isNestable({ sheet: { length: 0, width: 1220 } })).toBe(false)
  })

  it('a sheet with both dimensions is nested', () => {
    expect(isNestable({ sheet: { length: 2440, width: 1220 } })).toBe(true)
  })
})

describe('isSwapped', () => {
  const b = (length: number, width: number, grain: 'length' | 'width' | 'free') =>
    ({ length, width, grain }) as BoardPart
  it('follows grain, and puts a free board longer side first', () => {
    expect(isSwapped(b(300, 600, 'length'))).toBe(false)
    expect(isSwapped(b(600, 300, 'width'))).toBe(true)
    expect(isSwapped(b(300, 600, 'free'))).toBe(true)
    expect(isSwapped(b(600, 300, 'free'))).toBe(false)
    expect(isSwapped(b(400, 400, 'free'))).toBe(false)
  })
})

describe('cutlist edge banding', () => {
  const mats: Record<string, MaterialDef> = {
    ...PRESET_MATERIALS,
    'ABS 1mm': { thickness: 1, use: 'edge', costPerM: 2 },
  }
  const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
  const components: Component[] = [banded]
  const parts = partsOfCarcase(banded.params)
  const bottom = parts.find((p) => p.kind === 'board' && p.role === 'bottom') as BoardPart

  it('reports the cut size in Length/Width and the finished size beside it', () => {
    const row = groupParts([bottom], mats, components)[0]
    expect(row.finishedLength - row.length + row.finishedWidth - row.width).toBe(1)
    expect(row.edgeCode).not.toBe('')
    expect(row.edgeMaterials).toBe('ABS 1mm')
  })

  it('leaves an unbanded part exactly as before', () => {
    const plain = groupParts([bottom], mats, [cabinet])[0]
    expect(plain.length).toBe(plain.finishedLength)
    expect(plain.width).toBe(plain.finishedWidth)
    expect(plain.edgeCode).toBe('')
  })

  it('does not merge boards of one cut size and code banded in different materials', () => {
    const twoStocks: Record<string, MaterialDef> = {
      ...mats,
      'PVC 1mm': { thickness: 1, use: 'edge', costPerM: 3 },
    }
    const other: BoardPart = { ...bottom, id: 'other', edgeBanding: { y0: 'PVC 1mm' } }
    const rows = groupParts([bottom, other], twoStocks, components)
    expect(rows).toHaveLength(2)
    expect(rows[0].edgeCode).toBe(rows[1].edgeCode)
    expect(rows[0].length).toBe(rows[1].length)
    expect(rows.map((r) => r.edgeMaterials).sort()).toEqual(['ABS 1mm', 'PVC 1mm'])
  })

  it('does not merge identical boards whose edges differ', () => {
    const other: BoardPart = { ...bottom, id: 'other', edgeBanding: { y0: null } }
    expect(groupParts([bottom, other], mats, components)).toHaveLength(2)
  })

  it('flags a cut size that has run out', () => {
    const thin: BoardPart = { ...bottom, width: 1, edgeBanding: { y0: 'ABS 1mm', y1: 'ABS 1mm' } }
    const row = groupParts([thin], mats, components)[0]
    expect(row.problem).toMatch(/zero or negative/)
  })

  it('swaps L and S with the cutlist orientation', () => {
    const tall = parts.find((p) => p.kind === 'board' && p.role === 'left-side') as BoardPart
    const rows = [
      groupParts([{ ...tall, grain: 'length' }], mats, components)[0],
      groupParts([{ ...tall, grain: 'width' }], mats, components)[0],
    ]
    expect(rows[0].edgeCode).toBe('1S')
    expect(rows[1].edgeCode).toBe('1L')
  })

  it('does not merge boards with one cut size and edge pattern but different orientation', () => {
    const a: BoardPart = { ...bottom, id: 'a', length: 600, width: 300, grain: 'length', edgeBanding: { y0: 'ABS 1mm' } }
    const b: BoardPart = { ...bottom, id: 'b', length: 299, width: 601, grain: 'width', edgeBanding: { y0: 'ABS 1mm' } }
    const rows = groupParts([a, b], mats, components)
    expect(rows[0].length).toBe(rows[1].length)
    expect(rows[0].width).toBe(rows[1].width)
    expect(rows).toHaveLength(2)
  })

  it.each([['a missing material', 'Ghost'], ['a panel material', 'Plywood']])(
    'bands nothing and raises no problem when the cabinet edge material is %s',
    (_name, edgeMaterial) => {
      const c = { ...cabinet, params: { ...cabinet.params, edgeMaterial } }
      const row = groupParts([bottom], mats, [c])[0]
      expect(row.edgeCode).toBe('')
      expect(row.problem).toBeUndefined()
    },
  )

  it('appends the new columns after Total so existing columns keep their places', () => {
    const csv = buildCsv([bottom], mats, components)
    const [header, row] = csv.split('\n')
    expect(
      header.startsWith(
        'Cabinet,Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Grain,Cuts,Cost/unit,Total',
      ),
    ).toBe(true)
    expect(header.endsWith(',Finished length (mm),Finished width (mm),Edges,Edge material')).toBe(
      true,
    )
    expect(row.includes(',ABS 1mm')).toBe(true)
  })

  describe('cutlist rows keep their members', () => {
    it('lists every merged board with its label and cut count', () => {
      const a: BoardPart = { ...bottom, id: 'a', label: 'Shelf A', cuts: [] }
      const b: BoardPart = { ...bottom, id: 'b', label: 'Shelf B', cuts: [] }
      const rows = groupParts([a, b], mats, components)
      expect(rows).toHaveLength(1)
      expect(rows[0].members).toEqual([
        { id: 'a', label: 'Shelf A', cuts: 0 },
        { id: 'b', label: 'Shelf B', cuts: 0 },
      ])
      expect(rows[0].qty).toBe(rows[0].members.length)
    })

    it('carries the edge materials as a sorted list beside the printed string', () => {
      const two: BoardPart = { ...bottom, edgeBanding: { x0: 'ABS 2mm', y0: 'ABS 1mm' } }
      const row = groupParts([two], { ...mats, 'ABS 2mm': { thickness: 2, use: 'edge' } }, components)[0]
      expect(row.edgeMaterialList).toEqual(['ABS 1mm', 'ABS 2mm'])
      expect(row.edgeMaterials).toBe('ABS 1mm, ABS 2mm')
    })

    it('lists dowel members', () => {
      const dowelA = makeDowel({ id: 'dA', diameter: 8, length: 100, material: 'Beech' })
      const dowelB = makeDowel({ id: 'dB', diameter: 8, length: 100, material: 'Beech' })
      const rows = groupDowels([dowelA, dowelB], mats)
      expect(rows[0].members).toEqual([
        { id: dowelA.id, label: dowelA.label },
        { id: dowelB.id, label: dowelB.label },
      ])
    })
  })

  describe('serialising from rows', () => {
    it('produces exactly what the part-based functions produce', () => {
      const rows = groupParts(parts, mats, components)
      expect(buildCsvFromRows(rows, groupEdgeBand(parts, mats, components))).toBe(
        buildCsv(parts, mats, components),
      )
      const dowels = [
        makeDowel({ id: 'dA', diameter: 8, length: 100, material: 'Beech' }),
        makeDowel({ id: 'dB', diameter: 8, length: 100, material: 'Beech' }),
      ]
      expect(buildDowelCsvFromRows(groupDowels(dowels, mats))).toBe(buildDowelCsv(dowels, mats))
    })
  })

  describe('edge band totals', () => {
    it('totals banded run lengths per edge material, priced per metre', () => {
      const lines = groupEdgeBand(parts, mats, components)
      const abs = lines.find((l) => l.material === 'ABS 1mm')!
      expect(abs.metres).toBeGreaterThan(0)
      expect(abs.cost).toBeCloseTo(abs.metres * 2, 6)
    })

    it('prices nothing when the material has no rate', () => {
      const lines = groupEdgeBand(
        parts,
        { ...mats, 'ABS 1mm': { thickness: 1, use: 'edge' } },
        components,
      )
      expect(lines[0].cost).toBeNull()
    })

    it('counts each board once per quantity, so two identical boards double the metres', () => {
      const one = groupEdgeBand([bottom], mats, components)[0].metres
      const two = groupEdgeBand([bottom, { ...bottom, id: 'b2' }], mats, components)[0].metres
      expect(two).toBeCloseTo(one * 2, 9)
    })

    it('appends an edge band section to the board CSV', () => {
      const csv = buildCsv([bottom], mats, components)
      expect(csv).toContain('\n\nEdge material,Metres,Cost/m,Total\n')
      expect(csv).toContain('ABS 1mm,')
    })

    it('appends the section after the board total when boards carry a cost', () => {
      const priced: BoardPart = { ...bottom, material: 'Ply' }
      const csv = buildCsv([priced], { ...mats, Ply: { costPerM2: 50 } }, components)
      expect(csv.indexOf('Board total')).toBeGreaterThan(-1)
      expect(csv.indexOf('Board total')).toBeLessThan(csv.indexOf('Edge material,Metres'))
    })

    it('leaves the CSV of a scene with no banded edges unchanged', () => {
      const rows = groupParts([bottom], mats, [cabinet])
      const r = rows[0]
      const expected = [
        'Cabinet,Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Grain,Cuts,Cost/unit,Total,Finished length (mm),Finished width (mm),Edges,Edge material',
        `${r.component},${r.qty},${r.labels},${r.material},${r.color},${r.length},${r.width},${r.thickness},${r.grain},${r.cuts},${r.costPerUnit?.toFixed(2) ?? ''},${r.totalCost?.toFixed(2) ?? ''},${r.finishedLength},${r.finishedWidth},,`,
        ...(r.totalCost !== null ? [`,,,,,,,,,,Board total,${r.totalCost.toFixed(2)}`] : []),
      ].join('\n')
      expect(buildCsv([bottom], mats, [cabinet])).toBe(expected)
    })
  })
})
