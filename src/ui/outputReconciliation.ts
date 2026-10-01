import { buildDrawingSheets, type DrawingSheet, type SheetEdge } from '../geom/drawing'
import { componentsById } from '../scene/componentTree'
import type { MaterialDef, Scene } from '../scene/types'
import { groupDowels, groupParts, type DowelRow, type GroupedRow } from './buildCsv'
import { effectiveMaterialsOf } from './effectiveMaterials'

export type FindingKind =
  | 'missing-from-drawings'
  | 'missing-from-cutlist'
  | 'duplicate'
  | 'mismatch'
export type ReconField =
  | 'label'
  | 'material'
  | 'color'
  | 'size'
  | 'cutCount'
  | 'edgeCode'
  | 'edgeMaterials'
  | 'qty'
  | 'labels'
  | 'cuts'
export type ReconOutput = 'drawings' | 'cutlist'

// `left` is the drawings side — or, for a row-level check, the figure the cutlist row prints;
// `right` is the cutlist side — or what the row's members imply.
export interface ReconSide {
  source: string
  value: string
}

export interface ReconFinding {
  kind: FindingKind
  partId: string
  label: string
  field?: ReconField
  output?: ReconOutput
  left?: ReconSide
  right?: ReconSide
}

export interface ReconResult {
  status: 'passed' | 'failed' | 'unassessed'
  compared: number
  totalFindings: number
  truncated: boolean
  findings: ReconFinding[]
  unassessed: string[]
}

export const FINDING_CAP = 200

export const ALWAYS_UNASSESSED: string[] = [
  'Cut size and grain (printed by the cutlist only)',
  'Manufacturing notes and operations (printed by the drawings only)',
  'Hardware',
  'Cabinet assembly and installation sheets',
  'Cover-sheet rows',
  'Which edge is banded, and band thickness (the cutlist prints only a count code)',
  'Dowel cut count (the dowel list prints none)',
]

const NO_EDGE_CONTEXT = 'Edge facts (the sheets were built without an edge context)'

interface SheetFact {
  partId: string
  label: string
  material: string
  color: string
  size: number[]
  cutCount: number
  edge?: SheetEdge
  isBoard: boolean
  sheet: number
}

interface CutFact {
  partId: string
  label: string
  cuts?: number
  isBoard: boolean
  row: GroupedRow | DowelRow
  source: string
}

const canonical = (a: number, b: number, thickness: number): number[] => [
  Math.max(a, b),
  Math.min(a, b),
  thickness,
]

function sheetFacts(sheets: DrawingSheet[]): SheetFact[] {
  const facts: SheetFact[] = []
  sheets.forEach((s, i) => {
    if (s.kind !== 'part') return
    const base = {
      partId: s.partId,
      label: s.partLabel,
      material: s.material,
      color: s.color,
      cutCount: s.cutCount,
      sheet: i + 1,
    }
    facts.push(
      s.shape === 'board'
        ? {
            ...base,
            size: canonical(s.board.length, s.board.width, s.board.thickness),
            isBoard: true,
            ...(s.edge ? { edge: s.edge } : {}),
          }
        : { ...base, size: [s.dowel.diameter, s.dowel.length], isBoard: false },
    )
  })
  return facts
}

function cutFacts(boardRows: GroupedRow[], dowelRows: DowelRow[]): CutFact[] {
  const facts: CutFact[] = []
  boardRows.forEach((row, i) => {
    const source = `cutlist row ${i + 1} (${row.component || 'no cabinet'})`
    for (const m of row.members) {
      facts.push({ partId: m.id, label: m.label, cuts: m.cuts, isBoard: true, row, source })
    }
  })
  dowelRows.forEach((row, i) => {
    const source = `dowel list row ${i + 1}`
    for (const m of row.members) {
      facts.push({ partId: m.id, label: m.label, isBoard: false, row, source })
    }
  })
  return facts
}

const KIND_RANK: Record<FindingKind, number> = {
  'missing-from-drawings': 0,
  'missing-from-cutlist': 1,
  duplicate: 2,
  mismatch: 3,
}
const FIELD_RANK: Record<ReconField, number> = {
  label: 0,
  material: 1,
  color: 2,
  size: 3,
  cutCount: 4,
  edgeCode: 5,
  edgeMaterials: 6,
  qty: 7,
  labels: 8,
  cuts: 9,
}
const OUTPUT_RANK: Record<ReconOutput, number> = { drawings: 0, cutlist: 1 }

export const compareFindings = (a: ReconFinding, b: ReconFinding): number =>
  a.partId.localeCompare(b.partId) ||
  KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
  (a.field ? FIELD_RANK[a.field] : -1) - (b.field ? FIELD_RANK[b.field] : -1) ||
  (a.output ? OUTPUT_RANK[a.output] : -1) - (b.output ? OUTPUT_RANK[b.output] : -1)

export function reconcileOutputs(
  sheets: DrawingSheet[],
  boardRows: GroupedRow[],
  dowelRows: DowelRow[],
): ReconResult {
  const findings: ReconFinding[] = []

  // First occurrence wins; a repeat is reported once as a duplicate and not compared.
  const drawings = new Map<string, SheetFact>()
  for (const f of sheetFacts(sheets)) {
    if (drawings.has(f.partId)) {
      findings.push({ kind: 'duplicate', output: 'drawings', partId: f.partId, label: f.label })
    } else drawings.set(f.partId, f)
  }
  const cutlist = new Map<string, CutFact>()
  for (const f of cutFacts(boardRows, dowelRows)) {
    if (cutlist.has(f.partId)) {
      findings.push({ kind: 'duplicate', output: 'cutlist', partId: f.partId, label: f.label })
    } else cutlist.set(f.partId, f)
  }

  let compared = 0
  let edgeNotCarried = false
  const mismatch = (
    partId: string,
    label: string,
    field: ReconField,
    left: ReconSide,
    right: ReconSide,
  ) => {
    if (left.value !== right.value)
      findings.push({ kind: 'mismatch', partId, label, field, left, right })
  }

  for (const [id, d] of drawings) {
    const c = cutlist.get(id)
    if (!c) {
      findings.push({ kind: 'missing-from-cutlist', partId: id, label: d.label })
      continue
    }
    compared++
    const at = `drawings, sheet ${d.sheet}`
    mismatch(
      id,
      d.label,
      'label',
      { source: at, value: d.label },
      { source: c.source, value: c.label },
    )
    mismatch(
      id,
      d.label,
      'material',
      { source: at, value: d.material },
      { source: c.source, value: c.row.material },
    )
    mismatch(
      id,
      d.label,
      'color',
      { source: at, value: d.color },
      { source: c.source, value: c.row.color },
    )
    const cutSize = c.isBoard
      ? canonical(
          (c.row as GroupedRow).finishedLength,
          (c.row as GroupedRow).finishedWidth,
          (c.row as GroupedRow).thickness,
        )
      : [(c.row as DowelRow).diameter, (c.row as DowelRow).length]
    mismatch(
      id,
      d.label,
      'size',
      { source: at, value: d.size.join('×') },
      { source: c.source, value: cutSize.join('×') },
    )
    if (d.isBoard && c.isBoard) {
      mismatch(
        id,
        d.label,
        'cutCount',
        { source: at, value: String(d.cutCount) },
        { source: c.source, value: String(c.cuts ?? 0) },
      )
      if (d.edge === undefined) edgeNotCarried = true
      else {
        const row = c.row as GroupedRow
        mismatch(
          id,
          d.label,
          'edgeCode',
          { source: at, value: d.edge.code || 'none' },
          { source: c.source, value: row.edgeCode || 'none' },
        )
        mismatch(
          id,
          d.label,
          'edgeMaterials',
          { source: at, value: [...d.edge.materials].sort().join(', ') || 'none' },
          { source: c.source, value: [...row.edgeMaterialList].sort().join(', ') || 'none' },
        )
      }
    }
  }
  for (const [id, c] of cutlist) {
    if (!drawings.has(id))
      findings.push({ kind: 'missing-from-drawings', partId: id, label: c.label })
  }

  const rowChecks = (row: GroupedRow | DowelRow, source: string, isBoard: boolean) => {
    const first = row.members[0]
    if (!first) return
    mismatch(
      first.id,
      first.label,
      'qty',
      { source: `${source}, printed Qty`, value: String(row.qty) },
      { source: `${source}, its members`, value: String(row.members.length) },
    )
    mismatch(
      first.id,
      first.label,
      'labels',
      { source: `${source}, printed Labels`, value: row.labels },
      { source: `${source}, its members`, value: row.members.map((m) => m.label).join(', ') },
    )
    if (isBoard) {
      const printed = (row as GroupedRow).cuts
      const sheetsOfRow = row.members.map((m) => drawings.get(m.id))
      if (sheetsOfRow.some((d) => d === undefined)) return
      const drawn = sheetsOfRow.reduce((sum, d) => sum + (d?.cutCount ?? 0), 0)
      mismatch(
        first.id,
        first.label,
        'cuts',
        { source: `${source}, printed Cuts`, value: String(printed) },
        { source: `${source}, its members' sheets`, value: String(drawn) },
      )
    }
  }
  boardRows.forEach((row, i) =>
    rowChecks(row, `cutlist row ${i + 1} (${row.component || 'no cabinet'})`, true),
  )
  dowelRows.forEach((row, i) => rowChecks(row, `dowel list row ${i + 1}`, false))

  findings.sort(compareFindings)
  const status: ReconResult['status'] =
    findings.length > 0 ? 'failed' : compared > 0 ? 'passed' : 'unassessed'
  return {
    status,
    compared,
    totalFindings: findings.length,
    truncated: findings.length > FINDING_CAP,
    findings: findings.slice(0, FINDING_CAP),
    unassessed: [...ALWAYS_UNASSESSED, ...(edgeNotCarried ? [NO_EDGE_CONTEXT] : [])],
  }
}

// The packet's inputs, built from the live scene: every part, hidden ones included, the merged
// material library and an edge context. Cabinet and installation sheets are left out because only
// part sheets are compared. A sheet number here counts the check's own part-sheet list, not a page of
// any exported file.
export function reconcileScene(
  scene: Scene,
  materialLibrary: Record<string, MaterialDef>,
  date = new Date().toISOString().slice(0, 10),
): ReconResult {
  const materials = effectiveMaterialsOf(materialLibrary, scene.materials)
  const byId = componentsById(scene.components)
  const sheets = buildDrawingSheets(scene.parts, '', [], date, undefined, [], { materials, byId })
  return reconcileOutputs(
    sheets,
    groupParts(scene.parts, materials, scene.components),
    groupDowels(scene.parts, materials),
  )
}
