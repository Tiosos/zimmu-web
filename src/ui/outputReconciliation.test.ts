import { describe, expect, it } from 'vitest'
import { buildDrawingSheets, type DrawingSheet } from '../geom/drawing'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type {
  BoardPart,
  Component,
  ComponentId,
  CylinderPart,
  MaterialDef,
  Part,
} from '../scene/types'
import { groupDowels, groupParts, type GroupedRow } from './buildCsv'
import {
  ALWAYS_UNASSESSED,
  compareFindings,
  reconcileOutputs,
  reconcileScene,
  type ReconFinding,
} from './outputReconciliation'

const mats: Record<string, MaterialDef> = {
  ...PRESET_MATERIALS,
  'ABS 1mm': { thickness: 1, use: 'edge' },
}
const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
const byId = new Map<ComponentId, Component>([[banded.id, banded]])
const dowel: CylinderPart = {
  kind: 'cylinder',
  id: 'dowel_1',
  label: 'Dowel 1',
  diameter: 8,
  length: 40,
  material: '',
  color: '#ca8',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: banded.id,
  driven: false,
}
const boards = partsOfCarcase(banded.params).filter((p): p is BoardPart => p.kind === 'board')
const bottom = boards.find((p) => p.role === 'bottom')!

function outputs(parts: Part[], withEdgeContext = true) {
  return {
    sheets: structuredClone(
      buildDrawingSheets(
        parts,
        'Job',
        [],
        '2026-10-01',
        undefined,
        [],
        withEdgeContext ? { materials: mats, byId } : undefined,
      ),
    ),
    boardRows: structuredClone(groupParts(parts, mats, [banded])),
    dowelRows: structuredClone(groupDowels(parts, mats)),
  }
}
const run = (o: ReturnType<typeof outputs>) => reconcileOutputs(o.sheets, o.boardRows, o.dowelRows)
const partSheet = (o: ReturnType<typeof outputs>, id: string) =>
  o.sheets.find((s) => s.kind === 'part' && s.partId === id) as Extract<
    DrawingSheet,
    { kind: 'part' }
  >
const rowOf = (o: ReturnType<typeof outputs>, id: string): GroupedRow =>
  o.boardRows.find((r) => r.members.some((m) => m.id === id))!
const all: Part[] = [...boards, dowel]

describe('reconcileOutputs', () => {
  it('passes when the two builders agree, boards and dowels', () => {
    const r = run(outputs(all))
    expect(r.findings).toEqual([])
    expect(r.status).toBe('passed')
    expect(r.compared).toBe(all.length)
  })

  it('always lists what it did not compare', () => {
    expect(run(outputs(all)).unassessed).toEqual(expect.arrayContaining(ALWAYS_UNASSESSED))
  })

  it('is unassessed when there is nothing to compare', () => {
    const r = reconcileOutputs([], [], [])
    expect(r.status).toBe('unassessed')
    expect(r.compared).toBe(0)
  })

  it('reports a part with no sheet', () => {
    const o = outputs(all)
    o.sheets = o.sheets.filter((s) => !(s.kind === 'part' && s.partId === bottom.id))
    expect(run(o)).toMatchObject({
      status: 'failed',
      findings: [expect.objectContaining({ kind: 'missing-from-drawings', partId: bottom.id })],
    })
    expect(run(o).compared).toBe(all.length - 1)
  })

  it('reports a part with no cutlist member', () => {
    const o = outputs(all)
    const row = rowOf(o, bottom.id)
    row.members = row.members.filter((m) => m.id !== bottom.id)
    row.qty = row.members.length
    const r = run(o)
    expect(r.findings).toContainEqual(
      expect.objectContaining({ kind: 'missing-from-cutlist', partId: bottom.id }),
    )
    expect(r.compared).toBe(all.length - 1)
  })

  it('reports an id that appears twice, in either output', () => {
    const o = outputs(all)
    o.sheets.push(structuredClone(partSheet(o, bottom.id)))
    expect(run(o).findings).toContainEqual(
      expect.objectContaining({ kind: 'duplicate', output: 'drawings', partId: bottom.id }),
    )
    const p = outputs(all)
    const row = rowOf(p, bottom.id)
    row.members.push({ ...row.members.find((m) => m.id === bottom.id)! })
    row.qty = row.members.length
    expect(run(p).findings).toContainEqual(
      expect.objectContaining({ kind: 'duplicate', output: 'cutlist', partId: bottom.id }),
    )
  })

  it('compares the first occurrence of a repeated id, not the last', () => {
    const o = outputs(all)
    const repeat = structuredClone(partSheet(o, bottom.id))
    repeat.material = 'Elsewhere'
    o.sheets.push(repeat)
    const r = run(o).findings.filter((f) => f.partId === bottom.id)
    expect(r.map((f) => f.kind)).toEqual(['duplicate'])

    const p = outputs(all)
    const twin = structuredClone(rowOf(p, bottom.id))
    twin.material = 'Elsewhere'
    p.boardRows.push(twin)
    const q = run(p).findings.filter((f) => f.partId === bottom.id && f.kind === 'mismatch')
    expect(q).toEqual([])
  })

  it.each([
    [
      'label',
      (o: ReturnType<typeof outputs>) => {
        partSheet(o, bottom.id).partLabel = 'Other'
      },
    ],
    [
      'material',
      (o) => {
        partSheet(o, bottom.id).material = 'Oak'
      },
    ],
    [
      'color',
      (o) => {
        partSheet(o, bottom.id).color = '#000'
      },
    ],
    [
      'size',
      (o) => {
        const s = partSheet(o, bottom.id)
        if (s.shape === 'board') s.board.length += 1
      },
    ],
    [
      'cutCount',
      (o) => {
        partSheet(o, bottom.id).cutCount += 1
      },
    ],
    [
      'edgeCode',
      (o) => {
        const s = partSheet(o, bottom.id)
        if (s.shape === 'board' && s.edge) s.edge.code = '2L2S'
      },
    ],
    [
      'edgeMaterials',
      (o) => {
        const s = partSheet(o, bottom.id)
        if (s.shape === 'board' && s.edge) s.edge.materials = ['ABS 9mm']
      },
    ],
  ])('catches a difference in %s', (field, corrupt) => {
    const o = outputs(all)
    corrupt(o)
    const r = run(o)
    expect(r.status).toBe('failed')
    expect(r.findings).toContainEqual(
      expect.objectContaining({ kind: 'mismatch', field, partId: bottom.id }),
    )
    const own = r.findings.filter((f) => f.partId === bottom.id && f.kind === 'mismatch')
    expect(own.filter((f) => f.field === field)).toHaveLength(1)
    // A wrong sheet cut count also makes the row's printed Cuts disagree with its sheets, by design.
    expect(own.filter((f) => f.field !== field && f.field !== 'cuts')).toEqual([])
  })

  it('catches a size difference on a dowel', () => {
    const o = outputs(all)
    const s = partSheet(o, dowel.id)
    if (s.shape === 'dowel') s.dowel.diameter = 9
    expect(run(o).findings).toContainEqual(
      expect.objectContaining({ kind: 'mismatch', field: 'size', partId: dowel.id }),
    )
  })

  describe('row level', () => {
    it('catches a printed Qty that differs from its members', () => {
      const o = outputs(all)
      rowOf(o, bottom.id).qty += 1
      expect(run(o).findings).toContainEqual(expect.objectContaining({ field: 'qty' }))
    })
    it('names the first member, not the joined row labels, on a row-level finding', () => {
      const o = outputs(all)
      const row = rowOf(o, bottom.id)
      row.labels = 'Shelf, Shelf, Shelf'
      row.qty += 1
      row.cuts += 3
      const findings = run(o).findings
      for (const field of ['qty', 'labels', 'cuts'] as const) {
        const finding = findings.find((f) => f.field === field)
        expect(finding?.partId, field).toBe(row.members[0].id)
        expect(finding?.label, field).toBe(row.members[0].label)
      }
    })
    it('catches printed Labels that differ from its members', () => {
      const o = outputs(all)
      rowOf(o, bottom.id).labels = 'Wrong'
      expect(run(o).findings).toContainEqual(expect.objectContaining({ field: 'labels' }))
    })
    it('catches a printed summed Cuts that differs from the sheets', () => {
      const o = outputs(all)
      rowOf(o, bottom.id).cuts += 3
      expect(run(o).findings).toContainEqual(expect.objectContaining({ field: 'cuts' }))
    })
    it('still agrees when identical boards merge into one row', () => {
      const trio = [0, 1, 2].map(
        (i): BoardPart => ({ ...bottom, id: `t${i}`, label: `Shelf ${i}` }),
      )
      const o = outputs(trio)
      expect(o.boardRows).toHaveLength(1)
      expect(o.boardRows[0].qty).toBe(3)
      expect(run(o).status).toBe('passed')
    })
  })

  describe('grouping key', () => {
    it('keeps boards of one cut size and edge code in different stock as separate rows that each agree', () => {
      const stock: Record<string, MaterialDef> = {
        ...mats,
        'ABS white 1mm': { thickness: 1, use: 'edge' },
        'ABS oak 1mm': { thickness: 1, use: 'edge' },
      }
      const twin = (id: string, edge: string): BoardPart => ({
        ...bottom,
        id,
        label: 'Shelf',
        role: undefined,
        edgeBanding: { x0: edge },
      })
      const pair = [twin('w', 'ABS white 1mm'), twin('o', 'ABS oak 1mm')]
      const rows = groupParts(pair, stock, [banded])
      expect(rows).toHaveLength(2)
      expect(rows[0].edgeCode).toBe(rows[1].edgeCode)
      const r = reconcileOutputs(
        buildDrawingSheets(pair, 'Job', [], '2026-10-01', undefined, [], {
          materials: stock,
          byId,
        }),
        rows,
        [],
      )
      expect(r.findings).toEqual([])
      expect(r.status).toBe('passed')
    })
  })

  describe('orientation', () => {
    it('agrees for a grain-width board and still catches a real size change on it', () => {
      const g: BoardPart = { ...bottom, id: 'g', grain: 'width' }
      const o = outputs([g])
      expect(run(o).status).toBe('passed')
      const s = partSheet(o, 'g')
      if (s.shape === 'board') s.board.width += 1
      expect(run(o).findings).toContainEqual(
        expect.objectContaining({ kind: 'mismatch', field: 'size', partId: 'g' }),
      )
    })
  })

  it('treats a sheet built without an edge context as not carrying edges', () => {
    const r = run(outputs(all, false))
    expect(r.findings).toEqual([])
    expect(r.status).toBe('passed')
    expect(r.unassessed.some((u) => /without an edge context/i.test(u))).toBe(true)
    expect(run(outputs(all)).unassessed.some((u) => /without an edge context/i.test(u))).toBe(false)
  })

  it('orders findings totally: id, then kind, then field, then output', () => {
    const o = outputs(all)
    o.sheets.push(structuredClone(partSheet(o, bottom.id)))
    const row = rowOf(o, bottom.id)
    row.members.push({ ...row.members.find((m) => m.id === bottom.id)! })
    row.qty = row.members.length
    const dup = run(o).findings.filter((f) => f.kind === 'duplicate' && f.partId === bottom.id)
    expect(dup.map((f) => f.output)).toEqual(['drawings', 'cutlist'])
    expect(run(o)).toEqual(run(o))
  })

  describe('compareFindings', () => {
    // Insertion order inside reconcileOutputs already follows the rank on one id, so the
    // tie-breaks are pinned by sorting findings handed over in reverse rank order.
    const f = (
      partId: string,
      kind: ReconFinding['kind'],
      extra: Partial<ReconFinding> = {},
    ): ReconFinding => ({
      kind,
      partId,
      label: partId,
      ...extra,
    })
    const key = (x: ReconFinding) => [x.partId, x.kind, x.field ?? '', x.output ?? ''].join('/')

    it('orders one id by kind, then output', () => {
      const shuffled = [
        f('a', 'duplicate', { output: 'cutlist' }),
        f('a', 'mismatch', { field: 'label' }),
        f('a', 'duplicate', { output: 'drawings' }),
      ]
      expect(shuffled.sort(compareFindings).map(key)).toEqual([
        'a/duplicate//drawings',
        'a/duplicate//cutlist',
        'a/mismatch/label/',
      ])
    })

    it('orders one id and kind by field', () => {
      const shuffled = [
        f('a', 'mismatch', { field: 'edgeMaterials' }),
        f('a', 'mismatch', { field: 'label' }),
      ]
      expect(shuffled.sort(compareFindings).map((x) => x.field)).toEqual(['label', 'edgeMaterials'])
    })

    it('orders missing-from-drawings before missing-from-cutlist, and ids first of all', () => {
      const shuffled = [
        f('b', 'missing-from-drawings'),
        f('a', 'mismatch', { field: 'size' }),
        f('a', 'missing-from-cutlist'),
        f('a', 'missing-from-drawings'),
      ]
      expect(shuffled.sort(compareFindings).map(key)).toEqual([
        'a/missing-from-drawings//',
        'a/missing-from-cutlist//',
        'a/mismatch/size/',
        'b/missing-from-drawings//',
      ])
    })
  })

  it('does not echo a missing sheet as a row-level cuts finding', () => {
    const o = outputs(all)
    const row = rowOf(o, bottom.id)
    partSheet(o, bottom.id).cutCount = 2
    row.members.find((m) => m.id === bottom.id)!.cuts = 2
    row.cuts += 2
    expect(run(o).findings).toEqual([])
    o.sheets = o.sheets.filter((s) => !(s.kind === 'part' && s.partId === bottom.id))
    const r = run(o)
    expect(r.findings).toContainEqual(
      expect.objectContaining({ kind: 'missing-from-drawings', partId: bottom.id }),
    )
    expect(
      r.findings.filter((x) => x.field === 'cuts' && row.members.some((m) => m.id === x.partId)),
    ).toEqual([])
  })

  it('caps findings at 200 and says how many there were', () => {
    const many = Array.from(
      { length: 250 },
      (_, i): BoardPart => ({ ...bottom, id: `m${i}`, label: `B${i}` }),
    )
    const o = outputs(many)
    for (const s of o.sheets) if (s.kind === 'part') s.partLabel = 'X'
    const r = run(o)
    expect(r.totalFindings).toBe(250)
    expect(r.findings).toHaveLength(200)
    expect(r.truncated).toBe(true)
    expect(run(outputs(all)).truncated).toBe(false)
  })
})

describe('reconcileScene', () => {
  const scene = {
    parts: all,
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components: [banded],
  }

  it('builds the packet inputs from the live scene and agrees with itself', () => {
    const r = reconcileScene(scene, { 'ABS 1mm': { thickness: 1, use: 'edge' } })
    expect(r.status).toBe('passed')
    expect(r.compared).toBe(all.length)
  })

  it('checks all parts, hidden ones included', () => {
    const hidden = { ...scene, parts: all.map((p) => ({ ...p, visible: false })) }
    expect(reconcileScene(hidden, { 'ABS 1mm': { thickness: 1, use: 'edge' } }).compared).toBe(
      all.length,
    )
  })
})
