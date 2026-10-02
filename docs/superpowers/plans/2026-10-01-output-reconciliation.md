# Drawing-to-Cutlist Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check that the drawing deck's part sheets and the grouped cutlist rows agree on identity, quantity, size, material, colour, cut count and edges, and report the result in the Readiness panel and the production packet without blocking any export.

**Architecture:** Part sheets gain typed fields that record what they print (`partId`, `board`/`dowel`, `cutCount`, `edge`); cutlist rows gain `members` and `edgeMaterialList`. A pure `outputReconciliation.ts` reads only those built outputs, matches by part id and returns a capped, totally ordered result. The packet groups rows once, serialises its CSVs from those rows and reconciles the same rows against the same sheets; the panel builds the same inputs from the live scene.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom, fflate/pdf-lib (existing). No scene-data, file-format or IndexedDB change.

**Spec:** `docs/superpowers/specs/2026-10-01-output-reconciliation-design.md`. **Notes:** `docs/superpowers/notes/2026-10-01-output-reconciliation-notes.md`.

**Refinements decided while planning** (record in the notes file in Task 7):

- A sheet's `cutCount` is `boxCuts.length + mitres.length + holeArrays.length`, counted from the builder's own exhaustive partition (a dowel sheet uses `p.cuts.length`). It equals `p.cuts.length` today; its value is that a new cut kind added to the partition wrongly would differ from the cutlist's `p.cuts.length`. This is low discrimination and is stated as such.
- Finding sides are `left` (the drawings side, or for a row-level check the row's printed figure) and `right` (the cutlist side, or what the row's members imply), each `{ source, value }`.
- A drawing location in the **packet** is the PDF page (sheet index + 1 in the real deck). In the **panel** the deck is the check's own part-sheet list, so the location reads "sheet N of the checked drawing set" and is not a page of any exported file. So packet and panel equivalence is tested on status, `compared`, `totalFindings` and each finding's `kind`/`field`/`partId`, not on locations.
- The panel's default `materialLibrary = {}` is a fresh object every render and would defeat `useMemo`; it becomes a module constant.

**Commands used throughout:** `pnpm vitest run <file>`; before each commit `pnpm typecheck` (the pre-commit hook enforces it) and the touched test files; Task 7 runs `pnpm typecheck && pnpm lint && pnpm test`. Adding required fields to the part-sheet type makes every hand-built part sheet in existing tests fail typecheck: add the new fields there, change nothing else, and report each.

---

## File structure

| File | Responsibility |
|---|---|
| `src/geom/drawing.ts` (modify) | `SheetEdge`; `partId`, `board`/`dowel`, `cutCount`, `edge` on part sheets; edge note formatted from `edge` |
| `src/ui/buildCsv.ts` (modify) | `members`, `edgeMaterialList` on rows; `buildCsvFromRows`, `buildDowelCsvFromRows` |
| `src/ui/effectiveMaterials.ts` (create) | `effectiveMaterialsOf(library, scene)`: the one library merge used by the packet and `reconcileScene` |
| `src/ui/outputReconciliation.ts` (create) | `reconcileOutputs`, `reconcileScene`, result types, the unassessed list |
| `src/ui/ReconciliationSection.tsx` (create) | Read-only panel section for a result |
| `src/ui/ManufacturingReadiness.tsx` (modify) | Compute and show the section |
| `src/ui/buildProductionPacket.ts` (modify) | Group once, serialise from rows, reconcile, write `reconciliation.json`, manifest summary |
| `CLAUDE.md`, notes, spec (modify) | Invariants, decisions, tree entries |

---

### Task 1: Part sheets record what they print

**Files:**
- Modify: `src/geom/drawing.ts` (`PartSheetCommon` ~line 111; `DrawingSheet` part members ~line 137; `edgeNoteOf` ~line 401; `buildBoardSheet` ~line 412; `buildDowelSheet` ~line 475)
- Test: `src/geom/drawing.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (append to `src/geom/drawing.test.ts`; reuse the file's existing board and cut helpers for the cut-count case and its existing `cabinet`, `partsOfCarcase`, `PRESET_MATERIALS` imports)

```ts
describe('part sheets record what they print', () => {
  const mats = { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' as const } }
  const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
  const parts = partsOfCarcase(banded.params)
  const byId = new Map<ComponentId, Component>([[banded.id, banded]])
  const deck = (ctx?: EdgeContext) =>
    buildDrawingSheets(parts, 'Job', [], '2026-10-01', undefined, [], ctx)
  const boardSheet = (sheets: DrawingSheet[], id: string) => {
    const s = sheets.find((x) => x.kind === 'part' && x.shape === 'board' && x.partId === id)
    if (!s || s.kind !== 'part' || s.shape !== 'board') throw new Error(`no board sheet for ${id}`)
    return s
  }

  it('carries the part id and the dimensions its views are drawn from', () => {
    const sheets = deck()
    for (const p of parts) {
      if (p.kind !== 'board') continue
      expect(boardSheet(sheets, p.id).board).toEqual({
        length: p.length,
        width: p.width,
        thickness: p.thickness,
      })
    }
  })

  it('counts the cuts it draws', () => {
    const withCuts = makeBoard({
      cuts: [
        { kind: 'box', id: 'c1', label: 'Dado', face: '+Z', position: { x: 10, y: 0, z: 0 }, size: { x: 5, y: 20, z: 6 } },
        { kind: 'hole-array', id: 'h1', label: 'Pins', face: '+Z', axis: 'U', start: { x: 20, y: 20, z: 0 }, pitch: 32, count: 3, diameter: 5, depth: 10 },
      ],
    })
    const sheet = buildDrawingSheets([withCuts], 'Job').find((s) => s.kind === 'part')!
    if (sheet.kind !== 'part') throw new Error('expected a part sheet')
    expect(sheet.cutCount).toBe(2)
  })

  it('carries a structured edge only when it was built with an edge context', () => {
    const ctx: EdgeContext = { materials: mats, byId }
    const bottom = parts.find((p) => p.kind === 'board' && p.role === 'bottom')!
    const edge = boardSheet(deck(ctx), bottom.id).edge
    expect(edge?.materials).toEqual(['ABS 1mm'])
    expect(edge?.code).toMatch(/^1[LS]$/)
    expect(boardSheet(deck(), bottom.id).edge).toBeUndefined()
  })

  it('carries an empty edge, not an absent one, for an unbanded board built with a context', () => {
    const back = parts.find((p) => p.kind === 'board' && p.role === 'back')!
    expect(boardSheet(deck({ materials: mats, byId }), back.id).edge).toEqual({
      code: '',
      materials: [],
    })
  })

  it('prints the edge note from the same structured value', () => {
    const bottom = parts.find((p) => p.kind === 'board' && p.role === 'bottom')!
    const sheet = boardSheet(deck({ materials: mats, byId }), bottom.id)
    expect(sheet.manufacturingNotes).toContain(`Edge ${sheet.edge!.code} — ABS 1mm 1 mm`)
  })

  it('identifies a dowel sheet and its drawn dimensions', () => {
    const dowel = makeDowel({ id: 'd1', diameter: 8, length: 40 })
    const sheet = buildDrawingSheets([dowel], 'Job').find((s) => s.kind === 'part')!
    if (sheet.kind !== 'part' || sheet.shape !== 'dowel') throw new Error('expected a dowel sheet')
    expect(sheet.partId).toBe('d1')
    expect(sheet.dowel).toEqual({ diameter: 8, length: 40 })
  })
})
```

`makeBoard` (line ~28) and `makeDowel` (line ~286) already exist in this file. Add `EdgeContext`, `DrawingSheet` to its imports from `'./drawing'` if absent, and `ComponentId`, `Component` from `'../scene/types'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/geom/drawing.test.ts`
Expected: FAIL (`partId`, `board`, `cutCount`, `edge` are `undefined`; TypeScript errors do not stop vitest).

- [ ] **Step 3: Implement**

In `src/geom/drawing.ts`, add the type and extend the sheet types:

```ts
// What a board sheet's edge note is formatted from. Present only when the sheet was built with an
// edge context: absent means "not carried", never "unbanded".
export interface SheetEdge {
  code: string
  materials: string[]
}

interface PartSheetCommon {
  partId: string
  partLabel: string
  material: string
  color: string
  date: string
  scaleLabel: string
  // The number of cuts the sheet draws, counted from the entries its builder emits rather than read
  // from the part, so a builder that mishandles a cut kind disagrees with the cutlist.
  cutCount: number
}
```

In the `DrawingSheet` union, the board member gains `board` and `edge`, the dowel member gains `dowel`:

```ts
  | (PartSheetCommon & {
      kind: 'part'
      shape: 'board'
      // The dimensions the views were drawn from.
      board: { length: number; width: number; thickness: number }
      edge?: SheetEdge
      // Shop/template instructions that are deliberately not projected as geometry.
      manufacturingNotes: string[]
      views: [DrawingView, DrawingView, DrawingView]
    })
  | (PartSheetCommon & {
      kind: 'part'
      shape: 'dowel'
      dowel: { diameter: number; length: number }
      views: [DowelView, DowelView]
    })
```

Replace `edgeNoteOf` with the pair:

```ts
function sheetEdgeOf(p: BoardPart, ctx: EdgeContext): SheetEdge {
  const edges = edgesOf(p, ctx.byId, ctx.materials)
  return {
    code: edgeCode(edges, isSwapped(p)),
    materials: [
      ...new Set(EDGE_KEYS.map((k) => edges[k]).filter((m): m is string => m !== null)),
    ].sort(),
  }
}

// Not geometry, so it rides the notes the title block already prints. Formatted from the structured
// edge the sheet carries, so the printed line and the reconciled fact are one value.
function edgeNoteOf(edge: SheetEdge, ctx: EdgeContext): string[] {
  if (edge.code === '') return []
  const label = edge.materials.map((n) => `${n} ${ctx.materials[n]?.thickness ?? '?'} mm`).join(', ')
  return [`Edge ${edge.code} — ${label}`]
}
```

In `buildBoardSheet(p, date, edgeCtx?: EdgeContext)` rename the third parameter, compute the edge before the return and return the new fields:

```ts
  const edge = edgeCtx ? sheetEdgeOf(p, edgeCtx) : undefined
  return {
    kind: 'part',
    shape: 'board',
    partId: p.id,
    partLabel: p.label,
    material: p.material,
    color: p.color,
    date,
    board,
    cutCount: boxCuts.length + mitres.length + holeArrays.length,
    ...(edge ? { edge } : {}),
    manufacturingNotes: [...manufacturingNotesOf(p), ...(edge && edgeCtx ? edgeNoteOf(edge, edgeCtx) : [])],
    views: [faceView, edgeView, endView],
    scaleLabel: toScaleLabel(scale),
  }
```

In `buildDowelSheet` add `partId: p.id`, `dowel: { diameter: p.diameter, length: p.length }`, `cutCount: p.cuts.length`.

- [ ] **Step 4: Run, then fix hand-built sheets**

Run: `pnpm vitest run src/geom/drawing.test.ts && pnpm typecheck`
Expected: the new tests PASS. Typecheck fails wherever a test hand-builds a part sheet: add `partId`, `board`/`dowel` and `cutCount` there (and nothing else) and re-run `pnpm typecheck && pnpm vitest run src/geom src/ui`.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Record partId, drawn size, cut count and structured edge on part sheets

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 2: Cutlist rows keep their members; serialisers take rows

**Files:**
- Modify: `src/ui/buildCsv.ts` (`GroupedRow`, `groupParts`, `buildCsv`, `DowelRow`, `groupDowels`, `buildDowelCsv`)
- Test: `src/ui/buildCsv.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (append to `src/ui/buildCsv.test.ts`, inside or beside the file's existing edge-banding fixtures: `mats`, `banded`, `components`, `parts`, `bottom`)

```ts
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
    const dowelRows = groupDowels([dowelA, dowelB], mats)
    expect(buildDowelCsvFromRows(dowelRows)).toBe(buildDowelCsv([dowelA, dowelB], mats))
  })
})
```

`dowelA` and `dowelB` are two identical cylinder parts with different ids: copy the dowel literal this file already uses in its `groupDowels` tests and give each its own `id`/`label`. Add `buildCsvFromRows`, `buildDowelCsvFromRows` to the file's import from `'./buildCsv'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: FAIL (`members` undefined; `buildCsvFromRows is not a function`).

- [ ] **Step 3: Implement**

`GroupedRow` gains:

```ts
  members: { id: string; label: string; cuts: number }[]
  edgeMaterialList: string[]
```

In `groupParts` compute the list once and print it from it:

```ts
    const edgeMaterialList = [
      ...new Set(EDGE_KEYS.map((k) => edges[k]).filter((m): m is string => m !== null)),
    ].sort()
    const edgeMaterials = edgeMaterialList.join(', ')
```

On merge: `existing.members.push({ id: p.id, label: p.label, cuts: p.cuts.length })`. On create add `members: [{ id: p.id, label: p.label, cuts: p.cuts.length }]` and `edgeMaterialList`.

Split `buildCsv`: move its body into `buildCsvFromRows(rows, edge)` and keep the old function as a wrapper:

```ts
export function buildCsvFromRows(rows: GroupedRow[], edge: EdgeBandLine[]): string {
  // ...the existing body, with `rows` and `edge` as parameters instead of the two calls...
}

export function buildCsv(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): string {
  return buildCsvFromRows(
    groupParts(parts, materials, components),
    groupEdgeBand(parts, materials, components),
  )
}
```

`DowelRow` gains `members: { id: string; label: string }[]`, set the same way in `groupDowels`. Split `buildDowelCsv` into `buildDowelCsvFromRows(rows: DowelRow[])` and a wrapper `buildDowelCsv(parts, materials) { return buildDowelCsvFromRows(groupDowels(parts, materials)) }`. Move `EdgeBandLine`'s declaration above its first use only if the compiler requires it; otherwise leave it where it is.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui && pnpm typecheck && pnpm lint`
Expected: PASS. Existing `buildCsv` and `buildDowelCsv` tests passing unchanged is the byte-identical proof; do not edit them. Any test that builds a `GroupedRow`/`DowelRow` literal by hand needs the two new fields.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Keep each cutlist row's members and serialise CSVs from rows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 3: One library merge

**Files:**
- Create: `src/ui/effectiveMaterials.ts`
- Modify: `src/ui/buildProductionPacket.ts` (the inline merge block)
- Test: `src/ui/effectiveMaterials.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { effectiveMaterialsOf } from './effectiveMaterials'

describe('effectiveMaterialsOf', () => {
  it('lets scene fields override library fields and keeps library-only fields', () => {
    const merged = effectiveMaterialsOf(
      { Ply: { costPerM2: 50, thickness: 18 }, Dowel: { costPerM: 2 } },
      { Ply: { thickness: 19 }, Only: { thickness: 3 } },
    )
    expect(merged.Ply).toEqual({ costPerM2: 50, thickness: 19 })
    expect(merged.Dowel).toEqual({ costPerM: 2 })
    expect(merged.Only).toEqual({ thickness: 3 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/effectiveMaterials.test.ts`
Expected: FAIL: `Failed to resolve import "./effectiveMaterials"`.

- [ ] **Step 3: Implement**

```ts
import type { MaterialDef } from '../scene/types'

// Scene rates override library rates field by field, while rates only the library has (such as a
// dowel's costPerM) stay available. BomModal carries its own inline copy of this merge; it is left
// alone, so this is the packet's and the reconciliation's one statement of it.
export function effectiveMaterialsOf(
  library: Record<string, MaterialDef>,
  scene: Record<string, MaterialDef>,
): Record<string, MaterialDef> {
  const merged: Record<string, MaterialDef> = {}
  for (const name of new Set([...Object.keys(library), ...Object.keys(scene)])) {
    merged[name] = { ...library[name], ...scene[name] }
  }
  return merged
}
```

In `buildProductionPacket.ts` replace the inline block (the `const effectiveMaterials ... for (const name of new Set(...)) effectiveMaterials[name] = {...}`, with its two-line comment kept above the call) by:

```ts
  const effectiveMaterials = effectiveMaterialsOf(captured.materialLibrary, captured.scene.materials)
```

and import it.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui/effectiveMaterials.test.ts src/ui/buildProductionPacket.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS (the packet tests unchanged and green).

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Extract the library merge the packet and the reconciliation share

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 4: The comparison

**Files:**
- Create: `src/ui/outputReconciliation.ts`
- Test: `src/ui/outputReconciliation.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildDrawingSheets, type DrawingSheet } from '../geom/drawing'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type { BoardPart, Component, ComponentId, CylinderPart, MaterialDef, Part } from '../scene/types'
import { groupDowels, groupParts, type DowelRow, type GroupedRow } from './buildCsv'
import { ALWAYS_UNASSESSED, reconcileOutputs } from './outputReconciliation'

const mats: Record<string, MaterialDef> = {
  ...PRESET_MATERIALS,
  'ABS 1mm': { thickness: 1, use: 'edge' },
}
const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
const byId = new Map<ComponentId, Component>([[banded.id, banded]])
const dowel: CylinderPart = {
  kind: 'cylinder', id: 'dowel_1', label: 'Dowel 1', diameter: 8, length: 40, material: '',
  color: '#ca8', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ', cuts: [], visible: true, parentId: banded.id, driven: false,
}
const boards = partsOfCarcase(banded.params).filter((p): p is BoardPart => p.kind === 'board')
const bottom = boards.find((p) => p.role === 'bottom')!

function outputs(parts: Part[], withEdgeContext = true) {
  return {
    sheets: structuredClone(
      buildDrawingSheets(parts, 'Job', [], '2026-10-01', undefined, [],
        withEdgeContext ? { materials: mats, byId } : undefined),
    ),
    boardRows: structuredClone(groupParts(parts, mats, [banded])),
    dowelRows: structuredClone(groupDowels(parts, mats)),
  }
}
const run = (o: ReturnType<typeof outputs>) => reconcileOutputs(o.sheets, o.boardRows, o.dowelRows)
const partSheet = (o: ReturnType<typeof outputs>, id: string) =>
  o.sheets.find((s) => s.kind === 'part' && s.partId === id) as Extract<DrawingSheet, { kind: 'part' }>
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

  it.each([
    ['label', (o: ReturnType<typeof outputs>) => { partSheet(o, bottom.id).partLabel = 'Other' }],
    ['material', (o) => { partSheet(o, bottom.id).material = 'Oak' }],
    ['color', (o) => { partSheet(o, bottom.id).color = '#000' }],
    ['size', (o) => {
      const s = partSheet(o, bottom.id)
      if (s.shape === 'board') s.board.length += 1
    }],
    ['cutCount', (o) => { partSheet(o, bottom.id).cutCount += 1 }],
    ['edgeCode', (o) => {
      const s = partSheet(o, bottom.id)
      if (s.shape === 'board' && s.edge) s.edge.code = '2L2S'
    }],
    ['edgeMaterials', (o) => {
      const s = partSheet(o, bottom.id)
      if (s.shape === 'board' && s.edge) s.edge.materials = ['ABS 9mm']
    }],
  ])('catches a difference in %s', (field, corrupt) => {
    const o = outputs(all)
    corrupt(o)
    const r = run(o)
    expect(r.status).toBe('failed')
    expect(r.findings).toContainEqual(
      expect.objectContaining({ kind: 'mismatch', field, partId: bottom.id }),
    )
    expect(r.findings.filter((f) => f.partId === bottom.id && f.kind === 'mismatch')).toHaveLength(1)
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
      const trio = [0, 1, 2].map((i): BoardPart => ({ ...bottom, id: `t${i}`, label: `Shelf ${i}` }))
      const o = outputs(trio)
      expect(o.boardRows).toHaveLength(1)
      expect(o.boardRows[0].qty).toBe(3)
      expect(run(o).status).toBe('passed')
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

  it('caps findings at 200 and says how many there were', () => {
    const many = Array.from({ length: 250 }, (_, i): BoardPart => ({ ...bottom, id: `m${i}`, label: `B${i}` }))
    const o = outputs(many)
    for (const s of o.sheets) if (s.kind === 'part') s.partLabel = 'X'
    const r = run(o)
    expect(r.totalFindings).toBe(250)
    expect(r.findings).toHaveLength(200)
    expect(r.truncated).toBe(true)
    expect(run(outputs(all)).truncated).toBe(false)
  })
})
```

The `(o) =>` parameters in the `it.each` table inherit the first row's annotation in TypeScript's inference; if the compiler asks, annotate each as `(o: ReturnType<typeof outputs>)`. Remove any import the test ends up not using before committing (`noUnusedLocals`, for example `DowelRow`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/outputReconciliation.test.ts`
Expected: FAIL: `Failed to resolve import "./outputReconciliation"`.

- [ ] **Step 3: Write the module**

```ts
import type { DrawingSheet, SheetEdge } from '../geom/drawing'
import type { DowelRow, GroupedRow } from './buildCsv'

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

const byOrder = (a: ReconFinding, b: ReconFinding): number =>
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
    if (left.value !== right.value) findings.push({ kind: 'mismatch', partId, label, field, left, right })
  }

  for (const [id, d] of drawings) {
    const c = cutlist.get(id)
    if (!c) {
      findings.push({ kind: 'missing-from-cutlist', partId: id, label: d.label })
      continue
    }
    compared++
    const at = `drawings, sheet ${d.sheet}`
    const text = (v: string | number) => String(v)
    mismatch(id, d.label, 'label', { source: at, value: d.label }, { source: c.source, value: c.label })
    mismatch(id, d.label, 'material', { source: at, value: d.material }, { source: c.source, value: c.row.material })
    mismatch(id, d.label, 'color', { source: at, value: d.color }, { source: c.source, value: c.row.color })
    const cutSize = c.isBoard
      ? canonical((c.row as GroupedRow).finishedLength, (c.row as GroupedRow).finishedWidth, (c.row as GroupedRow).thickness)
      : [(c.row as DowelRow).diameter, (c.row as DowelRow).length]
    mismatch(id, d.label, 'size', { source: at, value: d.size.join('×') }, { source: c.source, value: cutSize.join('×') })
    if (d.isBoard && c.isBoard) {
      mismatch(id, d.label, 'cutCount', { source: at, value: text(d.cutCount) }, { source: c.source, value: text(c.cuts ?? 0) })
      if (d.edge === undefined) edgeNotCarried = true
      else {
        const row = c.row as GroupedRow
        mismatch(id, d.label, 'edgeCode', { source: at, value: d.edge.code || 'none' }, { source: c.source, value: row.edgeCode || 'none' })
        mismatch(
          id, d.label, 'edgeMaterials',
          { source: at, value: [...d.edge.materials].sort().join(', ') || 'none' },
          { source: c.source, value: [...row.edgeMaterialList].sort().join(', ') || 'none' },
        )
      }
    }
  }
  for (const [id, c] of cutlist) {
    if (!drawings.has(id)) findings.push({ kind: 'missing-from-drawings', partId: id, label: c.label })
  }

  const rowChecks = (row: GroupedRow | DowelRow, source: string, isBoard: boolean) => {
    const first = row.members[0]
    if (!first) return
    mismatch(first.id, row.labels, 'qty', { source: `${source}, printed Qty`, value: String(row.qty) }, { source: `${source}, its members`, value: String(row.members.length) })
    mismatch(first.id, row.labels, 'labels', { source: `${source}, printed Labels`, value: row.labels }, { source: `${source}, its members`, value: row.members.map((m) => m.label).join(', ') })
    if (isBoard) {
      const printed = (row as GroupedRow).cuts
      const drawn = row.members.reduce((sum, m) => sum + (drawings.get(m.id)?.cutCount ?? 0), 0)
      mismatch(first.id, row.labels, 'cuts', { source: `${source}, printed Cuts`, value: String(printed) }, { source: `${source}, its members' sheets`, value: String(drawn) })
    }
  }
  boardRows.forEach((row, i) => rowChecks(row, `cutlist row ${i + 1} (${row.component || 'no cabinet'})`, true))
  dowelRows.forEach((row, i) => rowChecks(row, `dowel list row ${i + 1}`, false))

  findings.sort(byOrder)
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
```

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui/outputReconciliation.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. If the `edgeCode` corruption test reports two mismatches for the bottom, the sheet's edge and the row's edge disagree before any corruption: print both for that part and fix the real cause (a Task 1 or Task 2 bug), not the test.

- [ ] **Step 5: Commit**

```bash
git add src/ui/outputReconciliation.ts src/ui/outputReconciliation.test.ts
git commit -m "Add the pure drawing-to-cutlist comparison

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 5: The Readiness panel section

**Files:**
- Modify: `src/ui/outputReconciliation.ts` (add `reconcileScene`)
- Create: `src/ui/ReconciliationSection.tsx`
- Modify: `src/ui/ManufacturingReadiness.tsx`
- Test: `src/ui/outputReconciliation.test.ts` (extend), `src/ui/ReconciliationSection.test.tsx` (create), `src/ui/ManufacturingReadiness.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `outputReconciliation.test.ts`:

```ts
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
    expect(reconcileScene(hidden, { 'ABS 1mm': { thickness: 1, use: 'edge' } }).compared).toBe(all.length)
  })
})
```

import `reconcileScene` in that file.

`src/ui/ReconciliationSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReconciliationSection } from './ReconciliationSection'
import { ALWAYS_UNASSESSED, type ReconResult } from './outputReconciliation'

const failed: ReconResult = {
  status: 'failed',
  compared: 3,
  totalFindings: 1,
  truncated: false,
  unassessed: ALWAYS_UNASSESSED,
  findings: [
    {
      kind: 'mismatch',
      partId: 'p1',
      label: 'Bottom',
      field: 'size',
      left: { source: 'drawings, sheet 4', value: '564×520×18' },
      right: { source: 'cutlist row 2 (Base 600)', value: '564×521×18' },
    },
  ],
}

describe('ReconciliationSection', () => {
  afterEach(cleanup)

  it('says what it checked and shows a failing finding with both values and sources', () => {
    render(<ReconciliationSection result={failed} />)
    expect(screen.getByText('Production packet drawings and lists agree?')).toBeTruthy()
    expect(screen.getByText(/Failed/i)).toBeTruthy()
    expect(screen.getByText(/564×520×18/)).toBeTruthy()
    expect(screen.getByText(/564×521×18/)).toBeTruthy()
    expect(screen.getByText(/drawings, sheet 4/)).toBeTruthy()
    expect(screen.getByText(/cutlist row 2/)).toBeTruthy()
  })

  it('always lists what was not compared', () => {
    render(<ReconciliationSection result={{ ...failed, status: 'passed', findings: [], totalFindings: 0 }} />)
    for (const line of ALWAYS_UNASSESSED) expect(screen.getByText(line)).toBeTruthy()
  })

  it('lets a finding be inspected', () => {
    const onInspect = vi.fn()
    render(<ReconciliationSection result={failed} onInspect={onInspect} />)
    fireEvent.click(screen.getByRole('button', { name: /Inspect Bottom/ }))
    expect(onInspect).toHaveBeenCalledWith({ kind: 'part', id: 'p1' })
  })

  it('says when findings were truncated', () => {
    render(<ReconciliationSection result={{ ...failed, truncated: true, totalFindings: 250 }} />)
    expect(screen.getByText(/first 200 of 250/i)).toBeTruthy()
  })
})
```

Check the `Selection` type in `src/scene/types.ts` for the part variant's exact shape (`{ kind: 'part', id }`) and adapt the assertion if it differs.

In `ManufacturingReadiness.test.tsx` add (following how that file renders the dialog and builds a scene): a test that the section heading `Production packet drawings and lists agree?` is present and shows `Passed` for a scene with one carcase and its parts.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/ui/outputReconciliation.test.ts src/ui/ReconciliationSection.test.tsx src/ui/ManufacturingReadiness.test.tsx`
Expected: FAIL (`reconcileScene` and `ReconciliationSection` do not exist).

- [ ] **Step 3: Implement**

Add to `src/ui/outputReconciliation.ts` (imports `buildDrawingSheets` from `'../geom/drawing'`, `componentsById` from `'../scene/componentTree'`, `groupParts, groupDowels` from `'./buildCsv'`, `effectiveMaterialsOf` from `'./effectiveMaterials'`, and the `Scene`, `MaterialDef` types):

```ts
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
```

`src/ui/ReconciliationSection.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import type { Selection } from '../scene/types'
import { FINDING_CAP, type ReconFinding, type ReconResult } from './outputReconciliation'

const statusText: Record<ReconResult['status'], string> = {
  passed: 'Passed: every compared fact agrees',
  failed: 'Failed: the drawings and the cutlist disagree',
  unassessed: 'Not assessed: nothing was comparable',
}

const describeFinding = (f: ReconFinding): string => {
  switch (f.kind) {
    case 'missing-from-drawings':
      return `${f.label}: in the cutlist but has no drawing sheet`
    case 'missing-from-cutlist':
      return `${f.label}: has a drawing sheet but is not in the cutlist`
    case 'duplicate':
      return `${f.label}: appears more than once in the ${f.output}`
    case 'mismatch':
      return `${f.label}: ${f.field} differs`
  }
}

export function ReconciliationSection({
  result,
  onInspect,
}: {
  result: ReconResult
  onInspect?: (selection: NonNullable<Selection>) => void
}) {
  return (
    <section aria-label="Drawings and cutlist agreement" className="border rounded p-3 mb-4">
      <h3 className="font-medium">Production packet drawings and lists agree?</h3>
      <p className="text-sm mb-1">
        {statusText[result.status]} · {result.compared} parts compared · {result.totalFindings}{' '}
        findings
      </p>
      <p className="text-xs text-muted-foreground mb-2">
        Compares the built part sheets with the grouped cutlist rows for all parts, hidden ones
        included, as the production packet writes them. A failure means the two builders disagree; it
        does not check the PDF or CSV files themselves. Exports are never blocked.
      </p>
      {result.findings.map((f, i) => (
        <div key={i} className="border-t py-2 text-sm">
          <p>
            <strong>{f.kind === 'mismatch' ? 'Mismatch' : 'Finding'}:</strong> {describeFinding(f)}
          </p>
          {f.left && (
            <p className="text-xs">
              {f.left.source}: {f.left.value}
            </p>
          )}
          {f.right && (
            <p className="text-xs">
              {f.right.source}: {f.right.value}
            </p>
          )}
          {onInspect && f.partId !== '' && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => onInspect({ kind: 'part', id: f.partId })}
            >
              Inspect {f.label}
            </Button>
          )}
        </div>
      ))}
      {result.truncated && (
        <p className="text-amber-300">
          Showing the first {FINDING_CAP} of {result.totalFindings} findings.
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-2">Not compared (never counted as agreement):</p>
      <ul className="text-xs list-disc pl-5">
        {result.unassessed.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
```

In `ManufacturingReadiness.tsx`: add a module constant `const NO_LIBRARY: Record<string, MaterialDef> = {}` and use `materialLibrary = NO_LIBRARY` as the prop default; add

```tsx
  const reconciliation = useMemo(() => reconcileScene(scene, materialLibrary), [scene, materialLibrary])
```

next to the other `useMemo`s, and render `<ReconciliationSection result={reconciliation} onInspect={onInspect} />` immediately after the Production checks `</section>`.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Show whether the drawings and the cutlist agree in the readiness panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 6: The production packet

**Files:**
- Modify: `src/ui/buildProductionPacket.ts`
- Test: `src/ui/buildProductionPacket.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (follow how that file already builds a packet, unzips it and reads `manifest.json` and the CSVs; reuse its scene fixture and unzip helper)

```ts
describe('reconciliation in the packet', () => {
  it('records the result in the manifest and writes it as a hashed file', async () => {
    const files = await unpack(await buildProductionPacket(input()))
    const manifest = JSON.parse(text(files['manifest.json']))
    expect(manifest.reconciliation).toMatchObject({ status: 'passed' })
    expect(manifest.reconciliation.compared).toBeGreaterThan(0)
    expect(manifest.reconciliation.unassessed.length).toBeGreaterThan(0)
    expect(manifest.files.map((f: { path: string }) => f.path)).toContain('readiness/reconciliation.json')
    const full = JSON.parse(text(files['readiness/reconciliation.json']))
    expect(full.status).toBe(manifest.reconciliation.status)
  })

  it('writes the same CSV text the part-based serialisers produce', async () => {
    const files = await unpack(await buildProductionPacket(input()))
    const scene = input().scene
    const merged = effectiveMaterialsOf(input().materialLibrary, scene.materials)
    expect(text(files['lists/boards.csv'])).toBe(buildCsv(scene.parts, merged, scene.components))
    expect(text(files['lists/dowels.csv'])).toBe(buildDowelCsv(scene.parts, merged))
  })

  it('still builds every export when the check fails', async () => {
    const base = input()
    const dup = { ...base, scene: { ...base.scene, parts: [...base.scene.parts, structuredClone(base.scene.parts[0])] } }
    const files = await unpack(await buildProductionPacket(dup))
    expect(JSON.parse(text(files['manifest.json'])).reconciliation.status).toBe('failed')
    for (const path of ['readiness/report.pdf', 'drawings/shop-drawings.pdf', 'lists/boards.csv']) {
      expect(files[path].byteLength).toBeGreaterThan(0)
    }
  })

  it('gives the packet and the panel helper the same verdict for one scene', async () => {
    const files = await unpack(await buildProductionPacket(input()))
    const packet = JSON.parse(text(files['readiness/reconciliation.json']))
    const panel = reconcileScene(input().scene, input().materialLibrary)
    const shape = (r: { status: string; compared: number; totalFindings: number; findings: { kind: string; field?: string; partId: string }[] }) => ({
      status: r.status, compared: r.compared, totalFindings: r.totalFindings,
      findings: r.findings.map((f) => [f.kind, f.field, f.partId]),
    })
    expect(shape(packet)).toEqual(shape(panel))
  })
})
```

`unpack`, `text` and `input()` stand for the helpers/fixtures this test file already has: read it first and use its real names; add the small helper only if it has none.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/buildProductionPacket.test.ts`
Expected: FAIL (`manifest.reconciliation` and `readiness/reconciliation.json` are absent).

- [ ] **Step 3: Implement**

In `buildProductionPacket.ts` group once and serialise from those rows, then reconcile what is actually written:

```ts
  const boardRows = groupParts(captured.scene.parts, effectiveMaterials, captured.scene.components)
  const dowelRows = groupDowels(captured.scene.parts, effectiveMaterials)
  const reconciliation = reconcileOutputs(sheets, boardRows, dowelRows)
```

(placed after `sheets` is built), and replace the two CSV entries:

```ts
    'lists/boards.csv': strToU8(
      buildCsvFromRows(
        boardRows,
        groupEdgeBand(captured.scene.parts, effectiveMaterials, captured.scene.components),
      ),
    ),
    'lists/dowels.csv': strToU8(buildDowelCsvFromRows(dowelRows)),
```

Add to `files`:

```ts
    'readiness/reconciliation.json': strToU8(JSON.stringify(reconciliation, null, 2) + '\n'),
```

and to the manifest object, after `counts`:

```ts
    reconciliation: {
      status: reconciliation.status,
      compared: reconciliation.compared,
      totalFindings: reconciliation.totalFindings,
      unassessed: reconciliation.unassessed,
    },
```

Update the manifest `scope` text by appending: ` Drawings and lists are reconciled from the same built outputs; the result is advisory and does not block any export.` Import `buildCsvFromRows`, `buildDowelCsvFromRows`, `groupParts`, `groupDowels`, `groupEdgeBand` from `'./buildCsv'` (drop `buildCsv`/`buildDowelCsv` from the import if now unused) and `reconcileOutputs` from `'./outputReconciliation'`.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui && pnpm typecheck && pnpm lint`
Expected: PASS, with the existing packet tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Reconcile the packet's own sheets and rows and record the result

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 7: Mutation-test the guards, docs, full checks, push

**Files:**
- Modify: `docs/superpowers/notes/2026-10-01-output-reconciliation-notes.md`, `docs/superpowers/specs/2026-10-01-output-reconciliation-design.md`, `CLAUDE.md`, `project-structure.html` (via `node scripts/update-structure-html.mjs`)

Follow CLAUDE.md "Mutation testing": back up to the scratchpad and restore from it, never `git checkout`; grep after applying and after restoring; predict first; confirm green first; expect an `AssertionError` naming the rule.

- [ ] **Step 1: Back up and confirm green**

```bash
S=/tmp/claude-0/-home-user-zimmu-web/d892a957-ab28-595a-9015-059ca8990e98/scratchpad
cp src/ui/outputReconciliation.ts $S/outputReconciliation.bak && cp src/ui/buildCsv.ts $S/buildCsv.bak && cp src/geom/drawing.ts $S/drawing.bak && cp src/ui/buildProductionPacket.ts $S/packet.bak
pnpm vitest run src/ui/outputReconciliation.test.ts src/ui/buildCsv.test.ts src/ui/buildProductionPacket.test.ts src/geom/drawing.test.ts
```
Expected: all PASS before mutating.

- [ ] **Step 2: Run the mutations** (find the real line for each)

| # | Mutation | Predicted failing test |
|---|---|---|
| 1 | Drop `canonical` ordering for the sheet size (use `[length, width, thickness]`) | "agrees for a grain-width board" and the size mismatch |
| 2 | Skip the edge comparison entirely | the `edgeCode` and `edgeMaterials` mismatch tests |
| 3 | Compare edges even when `d.edge` is undefined (treat as empty) | "treats a sheet built without an edge context as not carrying edges" |
| 4 | On a duplicate, overwrite with the last occurrence (`set` unconditionally) | the duplicate tests |
| 5 | Drop the `kind`/`field`/`output` tiers from `byOrder` (sort by id only) | "orders findings totally" |
| 6 | Remove the 200 cap (`slice(0, FINDING_CAP)` to `slice()`) | "caps findings at 200" |
| 7 | Drop the row-level `qty` check | "catches a printed Qty that differs" |
| 8 | Drop the row-level `cuts` check | "catches a printed summed Cuts" |
| 9 | Status: `passed` when `compared === 0` | "is unassessed when there is nothing to compare" |
| 10 | Compare cut counts only for members that have a sheet but read `0` for the sheet (`cutCount: 0`) in `sheetFacts` | the `cutCount` mismatch test |
| 11 | `groupParts`: do not push merged members | "lists every merged board" and "still agrees when identical boards merge" |
| 12 | `sheetEdgeOf`: drop `.sort()` on materials | a two-material row-agreement case (add one if none exists) |
| 13 | Packet: reconcile rebuilt rows (call `groupParts` a second time with `components: []`) | the packet CSV/verdict equivalence tests (add a case if none fails) |
| 14 | `drawing.ts`: a sheet's `cutCount` read as `p.cuts.length + 1` | "counts the cuts it draws" |

A surviving mutation means a missing test: add it, re-run the mutation until killed, then restore. Record predicted / observed / killed or survived / test added for each.

- [ ] **Step 3: Restore and confirm no mutation remains**

```bash
cmp src/ui/outputReconciliation.ts $S/outputReconciliation.bak && cmp src/ui/buildCsv.ts $S/buildCsv.bak && cmp src/geom/drawing.ts $S/drawing.bak && cmp src/ui/buildProductionPacket.ts $S/packet.bak
```
Expected: no output.

- [ ] **Step 4: Docs**

- Spec: add a "Refinements made while planning and building" section with the planning refinements at the top of this plan (cutCount counted from the partition and its low discrimination; `left`/`right` finding sides; panel shows "sheet N of the checked drawing set" and is not a page of any file; the `NO_LIBRARY` constant).
- Notes: the same with reasons, the mutation table, and known limitations: size on the sheet is the part's own dimensions, so size discrimination is low; renderer parity is not checked; a `failed` result means the builders disagree and is not clearable by editing the model (open question for the release stage); BomModal keeps its own copy of the library merge; the panel checks all parts while the toolbar deck uses visible parts.
- `CLAUDE.md`: tree entries for `outputReconciliation.ts`, `ReconciliationSection.tsx` and `effectiveMaterials.ts`, a mention under `drawing.ts` (part sheets record `partId`/`board`/`cutCount`/`edge`) and under `buildCsv.ts` (`members`, `buildCsvFromRows`); the four invariants from the spec in the file's voice; update the `2D export` paragraph with one sentence naming the reconciliation.
- Run `node scripts/update-structure-html.mjs`.

- [ ] **Step 5: Full checks, commit, push**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "Document output reconciliation and record mutation results

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
git push -u origin claude/festive-brown-tdhoa9
```
Expected: all green; report the real test count.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Sheets carry `partId`, drawn `board`/`dowel`, drawn `cutCount`, structured `edge` (absent = not carried) | 1 |
| Edge note formatted from the structured value | 1 |
| Rows carry `members` and `edgeMaterialList`; dowel rows `members` | 2 |
| Serialisers take rows; existing signatures and output unchanged | 2 |
| One library merge shared by packet and `reconcileScene` | 3 |
| Per-part comparison: label, material, color, size (canonical), cutCount, edgeCode, edgeMaterials | 4 |
| Row-level: qty, labels, summed cuts | 4 |
| Duplicates (first occurrence compared), `compared`, status, total order, 200 cap with `totalFindings`/`truncated` | 4 |
| Always-listed unassessed fields; edge-not-carried line | 4 |
| Panel section, scoped title, memoised, inspect, truncation notice | 5 |
| `reconcileScene` builds the packet's inputs from the live scene | 5 |
| Packet groups once, serialises from rows, reconciles those rows and its sheets; `reconciliation.json` hashed; manifest summary; never blocks | 6 |
| Packet and panel give the same verdict | 6 |
| Invariants in CLAUDE.md; mutation testing | 7 |
| Renderer parity, measured size, blocking, release action, assembly/installation/cover facts | out of scope (spec) |

Type consistency: `SheetEdge` (Task 1) is read by Task 4's `sheetFacts`. `GroupedRow.members`/`edgeMaterialList` and `DowelRow.members` (Task 2) are read by Task 4's `cutFacts` and `reconcileOutputs`. `buildCsvFromRows`/`buildDowelCsvFromRows` (Task 2) and `effectiveMaterialsOf` (Task 3) are called in Task 6. `reconcileOutputs(sheets, boardRows, dowelRows)` (Task 4) is called with exactly that signature in Tasks 5 and 6; `reconcileScene(scene, materialLibrary, date?)` (Task 5) is used by the panel and the equivalence test.
