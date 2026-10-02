# Edge Banding and Finished vs Cut Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model edge banding per board edge (derived from the cabinet by role, overridable per edge), and make the cutlist, BOM, nesting and part drawings report finished size, cut size and edge code consistently.

**Architecture:** Banding never changes finished geometry, so it is derived on read by a pure module `src/scene/edgeBanding.ts` and stored only as explicit per-edge decisions on a board (`BoardPart.edgeBanding`) plus one cabinet slot (`CarcaseParams.edgeMaterial`). Edge stock is a `MaterialDef` with `use: 'edge'`. The cutlist, BOM, nest and part sheet each call the same functions in that module.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom. File format 23 -> 24.

**Spec:** `docs/superpowers/specs/2026-09-30-edge-banding-design.md`. **Notes:** `docs/superpowers/notes/2026-09-30-edge-banding-notes.md`.

**Spec refinements decided while planning** (record in the notes file in Task 8):

- **Direction -> edge is found by rotating the four board edge normals by the part's own rotation**, then matching the carcase direction. That needs no thickness-axis table at all. `orientedPanel` maps every board axis onto a carcase axis **positively**, so there is no sign flip to get wrong, but the test still checks it geometrically against `orientedPanel`.
- **There is no material form to put an "Edge band" flag on.** Materials come from presets and migrations and are edited through rate popovers and the Sheets tab. So the edge-stock UI is a small "Add edge band" form (name and thickness) in the cabinet panel, calling the existing `onUpdateMaterial`. Edge stock rates are set in a new "Edge banding" table in the BOM Boards tab, through the same rate popover.
- **New CSV columns are appended after `Total`**, so every existing column keeps its position and the subtotal row is unchanged.
- **Mitre guard lives in `edgesOf`**: a board with a mitre cut reports no edges at all, so every consumer is covered by one check.
- **A dangling cabinet `edgeMaterial` is not a file error** (only explicit per-board edges are validated at load), following the face-frame rule.
- **`buildDrawingSheets` gains a seventh optional parameter** `edgeContext` for the part-sheet note.
- **`useNest` gains the components**, because resolving a board's edges needs its cabinet.

**Commands used throughout:** `pnpm vitest run <file>`; before each commit `pnpm typecheck` (the pre-commit hook enforces it) and the touched test files; Task 8 runs `pnpm typecheck && pnpm lint && pnpm test`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/scene/types.ts` (modify) | `MaterialDef.use`, `EdgeKey`, `EdgeDecisions`, `BoardPart.edgeBanding`, `CarcaseParams.edgeMaterial` |
| `src/scene/useFile.ts`, `src/scene/fileValidation.ts` (modify) | v24, validate `use` and explicit edges |
| `src/scene/edgeBanding.ts` (create) | Rule, `edgesOf`, `cutSizeOf`, `edgeCode`, `bandedEdgeLengths`, `cutPartOf` |
| `src/scene/edgeBanding.test.ts` (create) | Pure tests incl. axis map vs `orientedPanel` |
| `src/scene/grain.ts` (modify) | `isSwapped`: the cutlist orientation rule, stated once |
| `src/ui/buildCsv.ts` (modify) | `finishedDimensions` rename, cut size, grouping, columns, edge-band lines |
| `src/ui/CuttingList.tsx`, `src/ui/BomModal.tsx` (modify) | New columns; Edge banding table; grand total |
| `src/scene/useNest.ts`, `src/App.tsx` (modify) | Nest on cut size |
| `src/geom/drawing.ts` (modify) | Edge line in `manufacturingNotes` |
| `src/ui/CarcasePanel.tsx`, `src/ui/EditPanel.tsx` (modify) | Edge selector, add-edge-band form, per-edge control, material pickers exclude edge stock |
| `CLAUDE.md`, notes, spec (modify) | Invariants and decisions |

---

### Task 1: Data model and file format v24

**Files:**
- Modify: `src/scene/types.ts` (`MaterialDef` ~line 177, `BoardPart` ~line 132, `CarcaseParams` ~line 220)
- Modify: `src/scene/useFile.ts:29`
- Modify: `src/scene/fileValidation.ts` (`validateMaterial` line 71; new `validateEdgeFacts`; `validateCurrentFile` line 435)
- Test: `src/scene/edgeBandingFile.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Model the file envelope on `src/scene/roomAssessment.test.ts:83-90` (it builds a valid `ZimmuFile` with a `project`); read that test first and copy its envelope shape, adding one board part that the project's item owns via `rootPartIds`. Create `src/scene/edgeBandingFile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { PRESET_MATERIALS } from './carcasePresets'
import type { BoardPart, Scene } from './types'

const board = (edgeBanding?: BoardPart['edgeBanding']): BoardPart => ({
  kind: 'board',
  id: 'p1',
  label: 'Shelf',
  length: 600,
  width: 300,
  thickness: 18,
  grain: 'free',
  material: '',
  color: '#888',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
  ...(edgeBanding ? { edgeBanding } : {}),
})

const scene = (part: BoardPart): Scene => ({
  parts: [part],
  materials: { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' } },
  hardware: [],
  joints: [],
  components: [],
})

// Copy the envelope shape (name, appVersion, units, createdAt, updatedAt, camera, project with one
// area/room/item owning part 'p1' in rootPartIds) from roomAssessment.test.ts:83-90.
const fileText = (s: Scene): string => JSON.stringify(envelopeFor(s))

describe('edge banding in the file', () => {
  it('is format version 24', () => {
    expect(FILE_FORMAT_VERSION).toBe(24)
  })

  it('round-trips explicit edges, an explicit none, and an edge material', () => {
    const loaded = parseFile(fileText(scene(board({ y0: 'ABS 1mm', x1: null }))))
    const part = loaded.scene.parts[0]
    expect(part.kind === 'board' && part.edgeBanding).toEqual({ y0: 'ABS 1mm', x1: null })
    expect(loaded.scene.materials['ABS 1mm']).toEqual({ thickness: 1, use: 'edge' })
  })

  it('rejects an unknown edge key', () => {
    const bad = board({ top: 'ABS 1mm' } as unknown as BoardPart['edgeBanding'])
    expect(() => parseFile(fileText(scene(bad)))).toThrow(/edge/)
  })

  it('rejects an edge naming a missing material or a panel material', () => {
    expect(() => parseFile(fileText(scene(board({ y0: 'Nope' }))))).toThrow(/edge-band material/)
    const panel = Object.keys(PRESET_MATERIALS)[0]
    expect(() => parseFile(fileText(scene(board({ y0: panel }))))).toThrow(/edge-band material/)
  })

  it('rejects a material use other than edge', () => {
    const s = scene(board())
    s.materials['ABS 1mm'] = { thickness: 1, use: 'trim' } as never
    expect(() => parseFile(fileText(s))).toThrow(/edge/)
  })
})
```

Define `envelopeFor(s: Scene)` in the test file from the copied envelope.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/scene/edgeBandingFile.test.ts`
Expected: FAIL (version is 23; `use`, `edgeBanding` unknown to the validator or types).

- [ ] **Step 3: Types**

In `src/scene/types.ts` add to `MaterialDef` (after `thickness?`):

```ts
  // Marks edge-band stock. Its `thickness` is the band's and its `costPerM` the tape rate. Such a
  // material is never a panel slot and never nested: it has no `sheet`.
  use?: 'edge'
```

Add near `ThicknessAxis`:

```ts
// The four edges of a board in its own axes: x runs the length, y the width. `x0` is the edge at
// x = 0 (it runs along the width), `y1` the edge at y = width (it runs along the length).
export type EdgeKey = 'x0' | 'x1' | 'y0' | 'y1'

// Explicit decisions only. A string names an edge material, `null` is an explicit "no band", an
// absent key follows the cabinet's rule on a generated board and means no band on a manual one.
export type EdgeDecisions = Partial<Record<EdgeKey, string | null>>
```

Add to `BoardPart` after `operations?`:

```ts
  edgeBanding?: EdgeDecisions
```

Add to `CarcaseParams` after `frameMaterial: string`:

```ts
  // Absent (or empty) means no automatic banding — the same rule `frame === undefined` follows. A
  // named material is an edge material; `edgesOf` applies the role rule with it.
  edgeMaterial?: string
```

- [ ] **Step 4: Version and validation**

`src/scene/useFile.ts:29`: `export const FILE_FORMAT_VERSION = 24`.

In `src/scene/fileValidation.ts`, in `validateMaterial` after the `hasGrain` check:

```ts
  if (material.use !== undefined && material.use !== 'edge') {
    throw new ZimmuFileValidationError(`${path}.use`, 'must be "edge"')
  }
```

Add above `validateCurrentFile` (import `Scene` from `./types` if not already imported):

```ts
const EDGE_KEYS = ['x0', 'x1', 'y0', 'y1']

function validateEdgeFacts(scene: Scene): void {
  const isEdge = (name: string): boolean => scene.materials[name]?.use === 'edge'
  scene.parts.forEach((part, index) => {
    if (part.kind !== 'board' || part.edgeBanding === undefined) return
    const path = `file.scene.parts[${index}].edgeBanding`
    for (const [key, value] of Object.entries(recordAt(part.edgeBanding, path))) {
      if (!EDGE_KEYS.includes(key)) {
        throw new ZimmuFileValidationError(`${path}.${key}`, 'is not an edge (x0, x1, y0 or y1)')
      }
      if (value !== null && (typeof value !== 'string' || !isEdge(value))) {
        throw new ZimmuFileValidationError(
          `${path}.${key}`,
          'must be null or the name of an edge-band material',
        )
      }
    }
  })
}
```

Call it in `validateCurrentFile` right after `assertUniqueIds(file.scene.parts, 'file.scene.parts')`:

```ts
  validateEdgeFacts(file.scene)
```

- [ ] **Step 5: Run, then the whole suite for version fallout**

Run: `pnpm vitest run src/scene/edgeBandingFile.test.ts && pnpm typecheck && pnpm vitest run src/scene`
Expected: PASS. Any existing test that hard-codes `23` fails; change it to `FILE_FORMAT_VERSION` or `24`.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "Add edge banding data model and file format v24

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 2: The pure edge banding module

**Files:**
- Create: `src/scene/edgeBanding.ts`
- Test: `src/scene/edgeBanding.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  bandedEdgeLengths,
  cutPartOf,
  cutSizeOf,
  edgeCode,
  edgesOf,
  edgeRuleOf,
} from './edgeBanding'
import { orientedPanel } from './carcaseLayout'
import { applyMatrixToPoint, composeWorldMatrix } from '../geom/transform'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from './carcasePresets'
import type { BoardPart, Component, ComponentId, MaterialDef, Part } from './types'

const ABS: MaterialDef = { thickness: 1, use: 'edge' }
const materials = { ...PRESET_MATERIALS, 'ABS 1mm': ABS, 'ABS 2mm': { thickness: 2, use: 'edge' as const } }
const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
const byId = new Map<ComponentId, Component>([[banded.id, banded]])
const boards = partsOfCarcase(banded.params).filter((p): p is BoardPart => p.kind === 'board')
const role = (name: string): BoardPart => boards.find((p) => p.role === name)!

describe('the role rule', () => {
  it.each([
    ['left-side', 1],
    ['right-side', 1],
    ['top', 1],
    ['bottom', 1],
    ['division-x-0', 1],
    ['adj-shelf-a-0', 1],
    ['fixed-shelf-a-0', 1],
    ['back', 0],
    ['toe-kick', 0],
    ['stile-left', 0],
    ['rail-top', 0],
    ['box-front', 0],
  ])('%s bands %i direction(s)', (name, count) => {
    const rule = edgeRuleOf(name)
    expect(rule === 'all' ? 4 : rule.length).toBe(count)
  })

  it('bands every edge of a front', () => {
    expect(edgeRuleOf('front-a-0')).toBe('all')
  })
})

describe('direction to board edge', () => {
  // Independent of the implementation's normal rotation: build the real panel for each thickness
  // axis, take the midpoint of the edge the rule picked, carry it through the panel's own
  // placement, and require it to land on the box's front (min y) face.
  const box = { x0: 100, x1: 700, y0: 40, y1: 560, z0: 10, z1: 730 }
  it.each([
    ['z', 'bottom'],
    ['x', 'left-side'],
  ] as const)('puts the front edge of a thickness-%s panel on the min-y face (%s)', (axis, name) => {
    const panel = orientedPanel(box, axis)
    const part = { ...role(name), rotation: panel.rotation, position: panel.position,
      length: panel.length, width: panel.width, thickness: panel.thickness }
    const edges = edgesOf(part, byId)
    const key = (['x0', 'x1', 'y0', 'y1'] as const).find((k) => edges[k] !== null)!
    const mid = {
      x0: [0, panel.width / 2, 0],
      x1: [panel.length, panel.width / 2, 0],
      y0: [panel.length / 2, 0, 0],
      y1: [panel.length / 2, panel.width, 0],
    }[key]
    const m = composeWorldMatrix({ position: panel.position, rotation: panel.rotation })
    expect(applyMatrixToPoint(m, mid[0], mid[1], mid[2])[1]).toBeCloseTo(box.y0, 6)
  })

  it('finds no front edge on a panel whose thickness runs front to back', () => {
    const part = { ...role('top'), rotation: orientedPanel(box, 'y').rotation }
    expect(edgesOf(part, byId)).toEqual({ x0: null, x1: null, y0: null, y1: null })
  })

  it('flips a side and a bottom differently: side front is x0, bottom front is y0', () => {
    expect(edgesOf(role('left-side'), byId)).toEqual({ x0: 'ABS 1mm', x1: null, y0: null, y1: null })
    expect(edgesOf(role('bottom'), byId)).toEqual({ x0: null, x1: null, y0: 'ABS 1mm', y1: null })
  })
})

describe('effective edges', () => {
  it('bands all four edges of a door', () => {
    const door: BoardPart = { ...role('left-side'), role: 'front-a-0' }
    expect(Object.values(edgesOf(door, byId))).toEqual(['ABS 1mm', 'ABS 1mm', 'ABS 1mm', 'ABS 1mm'])
  })

  it('bands nothing without a cabinet edge material', () => {
    const plain = new Map<ComponentId, Component>([[cabinet.id, cabinet]])
    expect(edgesOf(role('left-side'), plain)).toEqual({ x0: null, x1: null, y0: null, y1: null })
  })

  it('lets an explicit null beat the rule and an explicit material beat the default', () => {
    const side = { ...role('left-side'), edgeBanding: { x0: null, y1: 'ABS 2mm' } }
    expect(edgesOf(side, byId)).toEqual({ x0: null, x1: null, y0: null, y1: 'ABS 2mm' })
  })

  it('follows only explicit edges on a detached board', () => {
    const detached = { ...role('left-side'), driven: false, edgeBanding: { y0: 'ABS 1mm' } }
    expect(edgesOf(detached, byId)).toEqual({ x0: null, x1: null, y0: 'ABS 1mm', y1: null })
  })

  it('reports no edges at all on a mitred board', () => {
    const mitred = { ...role('left-side'), cuts: [{ id: 'm', kind: 'mitre', label: 'Mitre' }] } as unknown as BoardPart
    expect(edgesOf(mitred, byId)).toEqual({ x0: null, x1: null, y0: null, y1: null })
  })
})

describe('cut size', () => {
  const part = (over: Partial<BoardPart> = {}): BoardPart => ({ ...role('bottom'), length: 564, width: 520, ...over })
  const e = (x0: string | null, x1: string | null, y0: string | null, y1: string | null) => ({ x0, x1, y0, y1 })

  it('subtracts each banded edge from the dimension it runs across', () => {
    expect(cutSizeOf(part(), e(null, null, 'ABS 1mm', null), materials)).toMatchObject({ length: 564, width: 519 })
    expect(cutSizeOf(part(), e('ABS 1mm', 'ABS 1mm', null, null), materials)).toMatchObject({ length: 562, width: 520 })
    expect(cutSizeOf(part(), e('ABS 1mm', 'ABS 1mm', 'ABS 1mm', 'ABS 1mm'), materials)).toMatchObject({ length: 562, width: 518 })
  })

  it('uses each edge its own thickness', () => {
    expect(cutSizeOf(part(), e('ABS 1mm', 'ABS 2mm', null, null), materials).length).toBe(561)
  })

  it('reports a problem rather than a clamped size when nothing is left', () => {
    const r = cutSizeOf(part({ width: 2 }), e(null, null, 'ABS 1mm', 'ABS 1mm'), materials)
    expect(r.width).toBe(0)
    expect(r.problem).toMatch(/zero or negative/)
  })

  it('reports a problem for an edge material with no thickness', () => {
    const r = cutSizeOf(part(), e(null, null, 'Ghost', null), materials)
    expect(r.problem).toMatch(/Ghost/)
  })
})

describe('shop code and run lengths', () => {
  const all = { x0: 'ABS 1mm', x1: 'ABS 1mm', y0: 'ABS 1mm', y1: null }
  it('counts long and short edges in cutlist orientation', () => {
    expect(edgeCode(all, false)).toBe('1L2S')
    expect(edgeCode(all, true)).toBe('2L1S')
    expect(edgeCode({ x0: null, x1: null, y0: null, y1: null }, false)).toBe('')
  })

  it('sums run lengths per edge material in finished dimensions', () => {
    const part = { ...role('bottom'), length: 564, width: 520 }
    expect(bandedEdgeLengths(part, { x0: 'ABS 1mm', x1: null, y0: 'ABS 2mm', y1: null })).toEqual([
      { material: 'ABS 1mm', mm: 520 },
      { material: 'ABS 2mm', mm: 564 },
    ])
  })
})

describe('cutPartOf', () => {
  it('shrinks the part and shifts through-cuts by the banded x0 and y0 thickness', () => {
    const cut = { id: 'c', kind: 'box', label: 'N', position: { x: 10, y: 20, z: -1 }, size: { x: 5, y: 5, z: 40 } }
    const part = { ...role('bottom'), length: 564, width: 520, cuts: [cut] } as unknown as BoardPart
    const banded2 = { ...part, edgeBanding: { x0: 'ABS 2mm', y0: 'ABS 1mm' } }
    const out = cutPartOf(banded2, byId, materials)
    expect(out.length).toBe(562)
    expect(out.width).toBe(519)
    const moved = out.cuts[0] as unknown as { position: { x: number; y: number } }
    expect([moved.position.x, moved.position.y]).toEqual([8, 19])
  })

  it('returns the finished part unchanged when there is a problem', () => {
    const part = { ...role('bottom'), width: 2, edgeBanding: { y0: 'ABS 1mm', y1: 'ABS 1mm' } }
    expect(cutPartOf(part, byId, materials)).toBe(part)
  })
})
```

The bottom's default rule already bands `y0` with `ABS 1mm`, and the explicit entries add `x0` with `ABS 2mm`, so the cut is `564 - 2 = 562` long and `520 - 1 = 519` wide, with through-cuts moved by `2` in x and `1` in y.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/scene/edgeBanding.test.ts`
Expected: FAIL: `Failed to resolve import "./edgeBanding"`.

- [ ] **Step 3: Write the module**

```ts
import { applyMatrixToPoint, composeWorldMatrix } from '../geom/transform'
import { nearestCarcase } from './nearestCarcase'
import type {
  BoardPart,
  Component,
  ComponentId,
  EdgeKey,
  MaterialDef,
  Vec3,
} from './types'

export const EDGE_KEYS: readonly EdgeKey[] = ['x0', 'x1', 'y0', 'y1']

// What a board's four edges actually carry: an edge material's name, or null for bare.
export type BoardEdges = Record<EdgeKey, string | null>

const NONE: BoardEdges = { x0: null, x1: null, y0: null, y1: null }

interface Direction {
  axis: 'x' | 'y' | 'z'
  sign: 1 | -1
}

// A cabinet's front faces -y: an overlay front sits in y ∈ [−FT, 0].
const FRONT: Direction = { axis: 'y', sign: -1 }

// Stated figures, like the hardware table: a woodworker's rule, not derivable from geometry. A role
// this function does not know is unbanded — visible in the part editor, unlike a wrong grain.
export function edgeRuleOf(role: string): 'all' | Direction[] {
  if (role.startsWith('front-')) return 'all'
  if (
    role === 'left-side' ||
    role === 'right-side' ||
    role === 'top' ||
    role === 'bottom' ||
    role.startsWith('division-') ||
    role.startsWith('adj-shelf-') ||
    role.startsWith('fixed-shelf-')
  ) {
    return [FRONT]
  }
  return []
}

const EDGE_NORMAL: Record<EdgeKey, Vec3> = {
  x0: { x: -1, y: 0, z: 0 },
  x1: { x: 1, y: 0, z: 0 },
  y0: { x: 0, y: -1, z: 0 },
  y1: { x: 0, y: 1, z: 0 },
}

// Which board edge faces a carcase direction: rotate each edge's outward normal by the part's own
// rotation and see which one lands on it. A panel whose thickness runs along that direction has no
// such edge and answers null.
function edgeFacing(rotation: Vec3, direction: Direction): EdgeKey | null {
  const m = composeWorldMatrix({ position: { x: 0, y: 0, z: 0 }, rotation })
  const component = { x: 0, y: 1, z: 2 }[direction.axis]
  for (const key of EDGE_KEYS) {
    const n = EDGE_NORMAL[key]
    const out = applyMatrixToPoint(m, n.x, n.y, n.z)
    if (Math.abs(out[component] - direction.sign) < 1e-6) return key
  }
  return null
}

// The effective edges of a board: the cabinet's rule for a generated one, then the board's own
// explicit entries on top. A detached or manual board follows only its explicit entries. A mitred
// board carries none, like a shaped edge — its outline is not the rectangle these rules measure.
export function edgesOf(part: BoardPart, byId: Map<ComponentId, Component>): BoardEdges {
  if (part.cuts.some((c) => c.kind === 'mitre')) return { ...NONE }
  const edges: BoardEdges = { ...NONE }
  const material = part.driven && part.role !== undefined ? nearestCarcase(part, byId)?.params.edgeMaterial : undefined
  if (material && part.role !== undefined) {
    const rule = edgeRuleOf(part.role)
    const keys = rule === 'all' ? EDGE_KEYS : rule.map((d) => edgeFacing(part.rotation, d))
    for (const key of keys) if (key !== null) edges[key] = material
  }
  for (const key of EDGE_KEYS) {
    const own = part.edgeBanding?.[key]
    if (own !== undefined) edges[key] = own
  }
  return edges
}

export interface CutSize {
  length: number
  width: number
  thickness: number
  // Set when the figures cannot be trusted; the figures are still returned, never clamped.
  problem?: string
}

function thicknessOfEdge(name: string | null, materials: Record<string, MaterialDef>): number | null {
  if (name === null) return 0
  return materials[name]?.thickness ?? null
}

// The one statement of the subtraction: a banded x-edge removes its thickness from the LENGTH, a
// banded y-edge from the WIDTH. Board axes; the cutlist reorders by grain afterwards.
export function cutSizeOf(
  part: BoardPart,
  edges: BoardEdges,
  materials: Record<string, MaterialDef>,
): CutSize {
  let length = part.length
  let width = part.width
  let problem: string | undefined
  for (const key of EDGE_KEYS) {
    const t = thicknessOfEdge(edges[key], materials)
    if (t === null) {
      problem = `edge material "${edges[key]}" has no thickness`
      continue
    }
    if (key === 'x0' || key === 'x1') length -= t
    else width -= t
  }
  if (problem === undefined && (length <= 0 || width <= 0)) {
    problem = 'cut size is zero or negative'
  }
  return { length, width, thickness: part.thickness, ...(problem ? { problem } : {}) }
}

// `swapped` is whether the cutlist reports the board's width as its length, decided by the caller
// from the same rule `finishedDimensions` uses. A long edge is one that runs along the reported length.
export function edgeCode(edges: BoardEdges, swapped: boolean): string {
  const long: EdgeKey[] = swapped ? ['x0', 'x1'] : ['y0', 'y1']
  const short: EdgeKey[] = swapped ? ['y0', 'y1'] : ['x0', 'x1']
  const count = (keys: EdgeKey[]): number => keys.filter((k) => edges[k] !== null).length
  const l = count(long)
  const s = count(short)
  return `${l > 0 ? `${l}L` : ''}${s > 0 ? `${s}S` : ''}`
}

// Run lengths are finished dimensions: an x-edge runs along the width, a y-edge along the length.
export function bandedEdgeLengths(
  part: BoardPart,
  edges: BoardEdges,
): { material: string; mm: number }[] {
  const totals = new Map<string, number>()
  for (const key of EDGE_KEYS) {
    const name = edges[key]
    if (name === null) continue
    const run = key === 'x0' || key === 'x1' ? part.width : part.length
    totals.set(name, (totals.get(name) ?? 0) + run)
  }
  return [...totals].map(([material, mm]) => ({ material, mm }))
}

// The part as the saw cuts it: smaller by the banded edges, with through-cuts moved to the new
// origin. The nest masks this, so sheet yield matches what is cut. A problem leaves the part alone.
export function cutPartOf(
  part: BoardPart,
  byId: Map<ComponentId, Component>,
  materials: Record<string, MaterialDef>,
): BoardPart {
  const edges = edgesOf(part, byId)
  const size = cutSizeOf(part, edges, materials)
  if (size.problem !== undefined) return part
  if (size.length === part.length && size.width === part.width) return part
  const dx = thicknessOfEdge(edges.x0, materials) ?? 0
  const dy = thicknessOfEdge(edges.y0, materials) ?? 0
  return {
    ...part,
    length: size.length,
    width: size.width,
    cuts: part.cuts.map((cut) =>
      cut.kind === 'box'
        ? { ...cut, position: { ...cut.position, x: cut.position.x - dx, y: cut.position.y - dy } }
        : cut,
    ),
  }
}
```

Two signatures matter for later tasks: the tests call `cutSizeOf(part, edges, materials)` and `cutPartOf(part, byId, materials)`.

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm vitest run src/scene/edgeBanding.test.ts && pnpm typecheck`
Expected: PASS. If the direction test fails for `left-side`, print `orientedPanel(box, 'x').rotation` and `edgeFacing` results before changing the rule: `orientedPanel` maps board x to carcase y for a thickness-x panel, so the front edge must come out as `x0`.

- [ ] **Step 5: Commit**

```bash
git add src/scene/edgeBanding.ts src/scene/edgeBanding.test.ts
git commit -m "Add the pure edge banding module

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 3: Cutlist and CSV

**Files:**
- Modify: `src/scene/grain.ts` (add `isSwapped`)
- Modify: `src/ui/buildCsv.ts` (`cutDimensions` line 22 and callers; `GroupedRow` line 39; `groupParts` line 55; `buildCsv` line 112)
- Modify: `src/ui/EditPanel.tsx:556-562` (caller of `cutDimensions`)
- Modify: `src/ui/CuttingList.tsx` (table)
- Test: `src/ui/buildCsv.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (append to `src/ui/buildCsv.test.ts`; reuse that file's existing board helper if present, else the local one below)

```ts
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { isSwapped } from '../scene/grain'
import type { BoardPart, Component, MaterialDef } from '../scene/types'

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
    expect(rows[0].edgeCode).not.toBe(rows[1].edgeCode)
  })

  it('appends the new columns after Total so existing columns keep their places', () => {
    const csv = buildCsv([bottom], mats, components)
    const [header, row] = csv.split('\n')
    expect(header.startsWith('Cabinet,Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Grain,Cuts,Cost/unit,Total')).toBe(true)
    expect(header.endsWith(',Finished length (mm),Finished width (mm),Edges,Edge material')).toBe(true)
    expect(row.endsWith(',ABS 1mm') || row.includes(',ABS 1mm')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: FAIL (`finishedLength` is `undefined`).

- [ ] **Step 3: Implement**

In `src/scene/grain.ts` and `src/ui/buildCsv.ts`:

1. Put the orientation decision in `src/scene/grain.ts` (the grain convention's home, and importable from `geom/` without reaching into `ui/`); add `BoardPart` to its existing `import type { Grain, ThicknessAxis } from './types'`:

```ts
// Whether the cutlist reports a board's width as its length. The one rule `finishedDimensions`,
// the cut size, the edge code and the part sheet all read, so they cannot disagree about which
// edge is long. A free-grain board reports its longer side as the length.
export function isSwapped({ length, width, grain }: BoardPart): boolean {
  if (grain === 'length') return false
  if (grain === 'width') return true
  return width > length
}
```

   Then in `buildCsv.ts` (`import { isSwapped } from '../scene/grain'`) rename `cutDimensions` to `finishedDimensions`, update its doc comment's first line to say it reports the **finished** size in cutlist orientation, and rewrite it as:

```ts
export function finishedDimensions(p: BoardPart): CutDims {
  return isSwapped(p)
    ? { length: p.width, width: p.length, thickness: p.thickness }
    : { length: p.length, width: p.width, thickness: p.thickness }
}
```

(`isSwapped` for free grain returns `width > length`, which matches the old `length >= width ? as-is : swapped`.)

2. Add, below it:

```ts
// What the saw cuts, in the same orientation: the finished size less the banded edges.
export function cutDimensions(
  p: BoardPart,
  edges: BoardEdges,
  materials: Record<string, MaterialDef>,
): CutDims & { problem?: string } {
  const c = cutSizeOf(p, edges, materials)
  const dims = isSwapped(p)
    ? { length: c.width, width: c.length, thickness: c.thickness }
    : { length: c.length, width: c.width, thickness: c.thickness }
  return c.problem ? { ...dims, problem: c.problem } : dims
}
```

with imports `import { edgesOf, cutSizeOf, edgeCode, type BoardEdges } from '../scene/edgeBanding'`. Keeping the name `cutDimensions` with a new signature is deliberate: it now really is the cut size. Every pre-existing caller of the one-argument `cutDimensions(p)` (search `src`, including tests) meant the grain-ordered finished size: change those to `finishedDimensions(p)`.

3. `GroupedRow` gains:

```ts
  finishedLength: number
  finishedWidth: number
  edgeCode: string
  edgeMaterials: string // distinct edge materials, comma-separated; '' when unbanded
  problem?: string
```

4. `groupParts`: replace `const dims = cutDimensions(p)` with:

```ts
    const finished = finishedDimensions(p)
    const edges = edgesOf(p, byId)
    const dims = cutDimensions(p, edges, materials)
    const code = edgeCode(edges, isSwapped(p))
    const edgeMaterials = [...new Set(EDGE_KEYS.map((k) => edges[k]).filter((m): m is string => m !== null))].sort().join(', ')
```

(import `EDGE_KEYS` too). Extend the key with the edge facts so differing patterns never merge:

```ts
    const key = `${component}|${dims.length}×${dims.width}×${dims.thickness}|${cutGrain(p)}|${p.material}|${p.color}|${EDGE_KEYS.map((k) => edges[k] ?? '-').join('/')}`
```

Add the new fields when a row is created (`finishedLength: finished.length`, `finishedWidth: finished.width`, `edgeCode: code`, `edgeMaterials`, and `...(dims.problem ? { problem: dims.problem } : {})`). Cost per unit keeps using the cut dims (board area bought), as now.

5. `buildCsv`: header becomes the old header plus `,Finished length (mm),Finished width (mm),Edges,Edge material`; each data row appends `,${row.finishedLength},${row.finishedWidth},${row.edgeCode},${quoteField(row.edgeMaterials)}`; the subtotal row is unchanged.

6. `src/ui/EditPanel.tsx:556`: replace `cutDimensions(part)` with the finished orientation plus the edge-aware cut size, and show the note whenever they differ:

```tsx
  const byId = componentsById(scene.components)
  const finished = part.kind === 'board' ? finishedDimensions(part) : null
  const cut = part.kind === 'board' ? cutDimensions(part, edgesOf(part, byId), scene.materials) : null
  const cutSizeNote =
    part.kind === 'board' && finished !== null && cut !== null &&
    (cut.length !== part.length || cut.width !== part.width || finished.length !== part.length)
      ? `Cut size ${cut.length} × ${cut.width} × ${cut.thickness} mm`
      : null
```

with imports `finishedDimensions, cutDimensions` from `./buildCsv`, `edgesOf` from `../scene/edgeBanding`, and `componentsById` from `../scene/componentTree` if not present. Keep the existing grain-order meaning: the note is hidden when the cut size equals the stored size.

7. `src/ui/CuttingList.tsx`: add four header cells after "Total" (`Finished length (mm)`, `Finished width (mm)`, `Edges`, `Edge material`), matching cells in each row (`row.finishedLength`, `row.finishedWidth`, `row.edgeCode || '—'`, `row.edgeMaterials || '—'`), `colSpan` 12 -> 16 on the empty row and 11 -> 11 (unchanged: the subtotal label still spans up to the Total cell; leave it) — and show `row.problem` as a red cell note under the Length cell: `{row.problem && <div className="text-destructive text-[10px]">{row.problem}</div>}`.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui && pnpm typecheck && pnpm lint`
Expected: PASS. Existing CSV/cutlist tests that assert the exact header now see the four extra columns: update those expected strings (append the new header suffix / row suffix) and nothing else.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Report cut size, finished size and edge code in the cutlist

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 4: BOM edge banding rows

**Files:**
- Modify: `src/ui/buildCsv.ts` (new `groupEdgeBand`, CSV rows)
- Modify: `src/ui/BomModal.tsx` (Boards tab table, `grandTotal`)
- Test: `src/ui/buildCsv.test.ts` (extend), `src/ui/BomModal.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

In `buildCsv.test.ts` (reusing `mats`, `banded`, `components`, `parts` from Task 3's describe by lifting them to file scope if needed):

```ts
describe('edge band totals', () => {
  it('totals banded run lengths per edge material, priced per metre', () => {
    const lines = groupEdgeBand(parts, mats, components)
    const abs = lines.find((l) => l.material === 'ABS 1mm')!
    expect(abs.metres).toBeGreaterThan(0)
    expect(abs.cost).toBeCloseTo(abs.metres * 2, 6)
  })

  it('prices nothing when the material has no rate', () => {
    const lines = groupEdgeBand(parts, { ...mats, 'ABS 1mm': { thickness: 1, use: 'edge' } }, components)
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
})
```

In `BomModal.test.tsx` add (following how that file renders `BomModal` in an existing test): render with banded parts and assert `screen.getByText('Edge banding')` and a row showing `ABS 1mm`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/buildCsv.test.ts src/ui/BomModal.test.tsx`
Expected: FAIL (`groupEdgeBand` not defined).

- [ ] **Step 3: Implement**

In `buildCsv.ts` add:

```ts
export interface EdgeBandLine {
  material: string
  metres: number
  costPerM: number | null
  cost: number | null
}

export function groupEdgeBand(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): EdgeBandLine[] {
  const byId = componentsById(components)
  const totals = new Map<string, number>()
  for (const p of parts) {
    if (p.kind !== 'board') continue
    for (const { material, mm } of bandedEdgeLengths(p, edgesOf(p, byId, materials))) {
      totals.set(material, (totals.get(material) ?? 0) + mm)
    }
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([material, mm]) => {
      const rate = materials[material]?.costPerM
      const metres = mm / 1000
      return {
        material,
        metres,
        costPerM: rate ?? null,
        cost: rate !== undefined ? metres * rate : null,
      }
    })
}
```

(import `bandedEdgeLengths`). In `buildCsv`, after computing the board lines (both the with- and without-cost return paths), append the edge section when there are lines:

```ts
  const edge = groupEdgeBand(parts, materials, components)
  const edgeSection =
    edge.length === 0
      ? []
      : [
          '',
          'Edge material,Metres,Cost/m,Total',
          ...edge.map((l) => `${quoteField(l.material)},${l.metres.toFixed(3)},${l.costPerM !== null ? l.costPerM.toFixed(2) : ''},${l.cost !== null ? l.cost.toFixed(2) : ''}`),
        ]
```

and return `[...the existing lines, ...edgeSection].join('\n')` on both return paths (the blank `''` entry produces the `\n\n` the test expects).

In `BomModal.tsx`: compute `const edgeLines = groupEdgeBand(parts, effectiveMaterials, components)`, add `const edgeSubtotal = edgeLines.reduce((s, l) => s + (l.cost ?? 0), 0)`, and include it: `const grandTotal = boardSubtotal + dowelSubtotal + hardwareSubtotal + edgeSubtotal`. In the Boards tab, render below `<CuttingList …/>` (a fragment around both) a table:

```tsx
{edgeLines.length > 0 && (
  <div className="mt-4">
    <h3 className="text-xs font-semibold mb-1">Edge banding</h3>
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="pb-1 pr-2 font-medium">Edge material</th>
          <th className="pb-1 px-2 font-medium">Metres</th>
          <th className="pb-1 px-2 font-medium">Cost/m</th>
          <th className="pb-1 px-2 font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {edgeLines.map((l) => (
          <tr key={l.material} className="border-b border-border/30">
            <td className="py-1 pr-2">{l.material}</td>
            <td className="py-1 px-2">{l.metres.toFixed(2)}</td>
            <td className="py-1 px-2">{l.costPerM !== null ? `$${l.costPerM.toFixed(2)}` : '—'}</td>
            <td className="py-1 px-2">{l.cost !== null ? `$${l.cost.toFixed(2)}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

Setting the `$/m` rate: reuse `MaterialPopover` (exported from `CuttingList.tsx`) exactly as `DowelList` does for its `costPerM` rate (read `DowelList` in `BomModal.tsx` first and copy that mechanism onto the Cost/m cell, with `unitLabel="$/m"` and `onSave={(num) => handleMaterialCostChange(l.material, { ...effectiveMaterials[l.material], costPerM: num })}`).

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Total edge banding metres and cost in the BOM

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 5: Nest on the cut size

**Files:**
- Modify: `src/scene/useNest.ts` (`groupByNestableMaterial`, `jobSignature`, `useNest` signature)
- Modify: `src/App.tsx:288` (call site)
- Test: `src/scene/useNest.test.ts` (extend; create if absent following `src/nest/*.test.ts` patterns), `src/nest/mask.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

In `src/nest/mask.test.ts`:

```ts
it('masks a banded part at its cut size, smaller than the finished one', () => {
  const part = { ...role('bottom'), length: 564, width: 520, edgeBanding: { y0: 'ABS 1mm' } } as BoardPart
  const cut = cutPartOf(part, byId, materials)
  expect(maskArea(occupancyMask(cut, 0))).toBeLessThan(maskArea(occupancyMask(part, 0)))
  expect(occupancyMask(cut, 0).h).toBe(519)
})
```

using the same fixtures as `edgeBanding.test.ts` (import or lift them).

In `useNest.test.ts` (find how the existing test stubs `Worker`/`comlink` per CLAUDE.md "Mocking the OCCT worker"; follow the same mocks for the nest worker): a test that with a banded cabinet and `enabled = true` the job posted to `nestJob` carries parts whose `width` is the cut width. If the file does not exist, test the pure function instead: export `groupByNestableMaterial` and assert its group parts are cut parts:

```ts
it('groups cut parts, not finished ones', () => {
  const groups = groupByNestableMaterial([part], mats, components)
  expect(groups[0].parts[0].width).toBe(519)
})
```

(Exporting it is the smaller change; do that.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/nest/mask.test.ts src/scene/useNest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `useNest.ts`:

1. Signature becomes `useNest(parts, materials, components, clearance, enabled)`.
2. `export function groupByNestableMaterial(parts, materials, components)` builds `const byId = componentsById(components)` and pushes `cutPartOf(p, byId, materials)` instead of `p` into each group's `parts` (the nestable-material check still reads `p.material`). Import `cutPartOf` from `./edgeBanding` and `componentsById` from `./componentTree`.
3. `jobSignature` already encodes `shapeKey(p)` of each group part: because the group parts are now the cut parts, the signature changes whenever the cut size or shifted cuts change. Also add `p.role`-independent nothing else. Verify by test, not by reasoning: change an edge and assert the signature differs.
4. The two call sites of `groupByNestableMaterial` inside `useNest` pass `components`.

In `App.tsx:288` pass `scene.components` as the third argument:

```tsx
  const { reports: nestReports, pending: nestPending } = useNest(
    scene.parts,
    nestMaterials,
    scene.components,
    clearance,
    sheetsTabOpen,
  )
```

`nestMaterials` (line ~280) is built from `scene.materials` and the library: confirm it keeps `use` and `thickness` of edge materials (it spreads the scene definition); if it only copies rates, add `thickness` and `use`.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/nest src/scene src/App.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Nest parts at their cut size

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 6: Edge line on the part drawing

**Files:**
- Modify: `src/geom/drawing.ts` (`buildBoardSheet` ~line 366; `buildDrawingSheets` signature)
- Modify: `src/App.tsx` (`handleOpenDrawings`)
- Test: `src/geom/drawing.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

```ts
describe('part sheet edge note', () => {
  const mats = { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' as const } }
  const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
  const parts = partsOfCarcase(banded.params)
  const byId = new Map<ComponentId, Component>([[banded.id, banded]])

  it('adds one edge line to a banded board sheet', () => {
    const sheets = buildDrawingSheets(parts, 'Job', [], '2026-09-30', undefined, [], { materials: mats, byId })
    const sheet = sheets.find((s) => s.kind === 'part' && s.partLabel === 'Bottom')!
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected a board sheet')
    expect(sheet.manufacturingNotes.some((n) => /^Edge 1[LS] — ABS 1mm 1 mm$/.test(n))).toBe(true)
  })

  it('adds nothing when the cabinet has no edge material', () => {
    const sheets = buildDrawingSheets(partsOfCarcase(cabinet.params), 'Job', [], '2026-09-30', undefined, [],
      { materials: mats, byId: new Map([[cabinet.id, cabinet]]) })
    for (const s of sheets) {
      if (s.kind === 'part' && s.shape === 'board') expect(s.manufacturingNotes.some((n) => n.startsWith('Edge'))).toBe(false)
    }
  })

  it('leaves sheets alone when no edge context is given', () => {
    const sheets = buildDrawingSheets(parts, 'Job')
    for (const s of sheets) {
      if (s.kind === 'part' && s.shape === 'board') expect(s.manufacturingNotes.some((n) => n.startsWith('Edge'))).toBe(false)
    }
  })
})
```

(The label `Bottom`: use whatever `partsOfCarcase` labels the `bottom` role; read the fixture's `r.label` for it and adjust.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/geom/drawing.test.ts`
Expected: FAIL (seventh argument not accepted; no note).

- [ ] **Step 3: Implement**

In `drawing.ts`:

```ts
export interface EdgeContext {
  materials: Record<string, MaterialDef>
  byId: Map<ComponentId, Component>
}

// One shop line per board: the code in cutlist orientation and the material with its thickness.
// Not geometry, so it rides the notes the title block already prints.
function edgeNoteOf(p: BoardPart, ctx: EdgeContext): string[] {
  const edges = edgesOf(p, ctx.byId, ctx.materials)
  const code = edgeCode(edges, isSwapped(p))
  if (code === '') return []
  const names = [...new Set(EDGE_KEYS.map((k) => edges[k]).filter((m): m is string => m !== null))].sort()
  const label = names.map((n) => `${n} ${ctx.materials[n]?.thickness ?? '?'} mm`).join(', ')
  return [`Edge ${code} — ${label}`]
}
```

Wait: the test regex is `Edge 1[LS] — ABS 1mm 1 mm`. The material is named `ABS 1mm` and its thickness is 1, so the label reads `ABS 1mm 1 mm`. Use exactly that formatting.

`buildBoardSheet(p, date, edge?)` appends `...(edge ? edgeNoteOf(p, edge) : [])` to `manufacturingNotes: [...manufacturingNotesOf(p), ...]`. `buildDrawingSheets` gets the seventh parameter `edgeContext?: EdgeContext` and passes it to `buildBoardSheet`. Import `edgesOf, edgeCode, EDGE_KEYS` from `../scene/edgeBanding`, `isSwapped` from `../scene/grain`, and `MaterialDef, Component, ComponentId` types if not imported.

In `App.tsx` `handleOpenDrawings`, pass `{ materials: scene.materials, byId: componentMap }` as the seventh argument:

```tsx
    setDrawingSheets(buildDrawingSheets(visibleParts, projectName, cabinets, undefined, undefined, rooms,
      { materials: scene.materials, byId: componentMap }))
```

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/geom src/ui src/App.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Print each board's edge code and material on its part sheet

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 7: Editing

**Files:**
- Modify: `src/ui/CarcasePanel.tsx` (`materialOptions` line 207; a new "Edge band" block in the Materials section; an add-edge-band form)
- Modify: `src/ui/EditPanel.tsx` (`usableMaterials` ~line 541; a per-edge control)
- Modify: `src/App.tsx` (thread `onUpdateMaterial` into `CarcasePanel`, the way `materials` already reaches it)
- Test: `src/ui/CarcasePanel.test.tsx`, `src/ui/EditPanel.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

`CarcasePanel.test.tsx` (follow that file's existing render helper and props):

```tsx
it('does not offer edge stock as a panel material', () => {
  renderPanel({ materials: { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' } } })
  fireEvent.click(screen.getByLabelText('Carcase material'))
  expect(screen.queryByRole('option', { name: 'ABS 1mm' })).toBeNull()
})

it('sets the cabinet edge material from the Edge band selector, and back to none', () => {
  const { onChange } = renderPanel({ materials: { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' } } })
  pick('Edge band', 'ABS 1mm')
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ edgeMaterial: 'ABS 1mm' }))
  pick('Edge band', 'None')
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ edgeMaterial: undefined }))
})

it('adds edge stock from a name and thickness', () => {
  const { onAddMaterial } = renderPanel({})
  fireEvent.change(screen.getByLabelText('Edge band name'), { target: { value: 'ABS white' } })
  fireEvent.change(screen.getByLabelText('Edge band thickness (mm)'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add edge band' }))
  expect(onAddMaterial).toHaveBeenCalledWith('ABS white', { thickness: 2, use: 'edge' })
})

it('refuses an empty name, a duplicate name and a non-positive thickness', () => {
  renderPanel({ materials: { ...PRESET_MATERIALS, 'ABS 1mm': { thickness: 1, use: 'edge' } } })
  fireEvent.change(screen.getByLabelText('Edge band name'), { target: { value: 'ABS 1mm' } })
  fireEvent.change(screen.getByLabelText('Edge band thickness (mm)'), { target: { value: '2' } })
  expect((screen.getByRole('button', { name: 'Add edge band' }) as HTMLButtonElement).disabled).toBe(true)
})
```

`renderPanel`, `pick` and the `onChange`/`onAddMaterial` spies: read the existing tests in that file and reuse/extend their helper; add `onAddMaterial` to it. Adapt the labels `Carcase material` / `Edge band` to the selector labelling convention already used by the file (for Radix Select use the trigger's accessible name the same way the existing material-slot tests do).

`EditPanel.test.tsx`:

```tsx
it('offers Follow cabinet, None and each edge material for an edge, and writes explicit decisions', () => {
  const { onUpdate } = renderEdit({ part: generatedBottom, scene: bandedScene })
  choose('Edge y0', 'None')
  expect(apply(onUpdate)).toMatchObject({ edgeBanding: { y0: null } })
  choose('Edge y1', 'ABS 1mm')
  expect(apply(onUpdate)).toMatchObject({ edgeBanding: { y1: 'ABS 1mm' } })
  choose('Edge y0', 'Follow cabinet')
  expect(apply(onUpdate).edgeBanding?.y0).toBeUndefined()
})

it('does not offer edge stock as the part material override', () => { /* as in CarcasePanel */ })

it('disables the edge control on a mitred board and says why', () => { /* a board with a mitre cut */ })

it('shows a manual board only None and materials, with no Follow cabinet', () => { /* driven:false */ })
```

`renderEdit`, `choose`, `apply` follow the file's existing conventions: `onUpdate(id, (p) => ...)` is called with an updater, so `apply(onUpdate)` runs the last updater on the part and returns the result.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx src/ui/EditPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`CarcasePanel.tsx`:

1. `materialOptions` excludes edge stock:

```ts
    const usable = Object.keys(materials).filter(
      (name) => materials[name].thickness !== undefined && materials[name].use !== 'edge',
    )
```

2. Below the existing material slot selectors add an "Edge band" `Select` (same component, same classes as the `frameMaterial` one at line ~847): value `p.edgeMaterial ?? ''` mapped to the sentinel item `none` labelled "None"; options are `Object.keys(materials).filter((n) => materials[n].use === 'edge')`; `onValueChange={(v) => setParams({ edgeMaterial: v === 'none' ? undefined : v })}`. Radix `Select.Item` cannot have an empty string value, which is why the sentinel is `'none'`. A cabinet whose `edgeMaterial` names something absent shows it as an extra first option (like `materialOptions` does) and a one-line note: `<p className="text-xs text-amber-600">Edge material “{p.edgeMaterial}” is not in this project; no automatic banding.</p>`.

3. Under it, the add form (local state `edgeName`, `edgeThickness`):

```tsx
<div className="flex items-end gap-1 mt-1">
  <Input aria-label="Edge band name" placeholder="e.g. ABS white" value={edgeName} onChange={(e) => setEdgeName(e.target.value)} />
  <Input aria-label="Edge band thickness (mm)" type="number" min="0" step="any" className="w-20" value={edgeThickness} onChange={(e) => setEdgeThickness(e.target.value)} />
  <Button size="sm" variant="outline" disabled={!canAddEdge}
    onClick={() => { onAddMaterial(edgeName.trim(), { thickness: Number(edgeThickness), use: 'edge' }); setEdgeName(''); setEdgeThickness('') }}>
    Add edge band
  </Button>
</div>
```

with `const canAddEdge = edgeName.trim() !== '' && materials[edgeName.trim()] === undefined && Number(edgeThickness) > 0`. Add `onAddMaterial: (name: string, def: MaterialDef) => void` to the component's props and thread it from `App.tsx` where `CarcasePanel` is rendered (pass `useScene`'s `onUpdateMaterial`, the same way `materials` is already passed; `sidebar.tsx` may sit between them: add the prop there too).

`EditPanel.tsx`:

1. `usableMaterials` excludes edge stock (`&& scene.materials[name].use !== 'edge'`).
2. Add the per-edge control after the dimensions block for boards only:

```tsx
{part.kind === 'board' && (() => {
  const mitred = part.cuts.some((c) => c.kind === 'mitre')
  const edgeMats = Object.keys(scene.materials).filter((n) => scene.materials[n].use === 'edge')
  const effective = edgesOf(part, componentsById(scene.components), scene.materials)
  const canFollow = part.driven && part.role !== undefined
  const labels: Record<EdgeKey, string> = { x0: 'x0', x1: 'x1', y0: 'y0', y1: 'y1' }
  return (
    <fieldset className="mt-2 text-xs">
      <legend className="text-muted-foreground">Edge banding</legend>
      {mitred && <p className="text-muted-foreground">Mitred boards are not banded here.</p>}
      {EDGE_KEYS.map((key) => {
        const own = part.edgeBanding?.[key]
        const value = own === undefined ? 'follow' : own === null ? 'none' : own
        return (
          <label key={key} className="flex items-center gap-2">
            <span className="w-8">{labels[key]}</span>
            <select aria-label={`Edge ${key}`} disabled={mitred} value={value}
              className="bg-background border border-border rounded px-1"
              onChange={(e) => {
                const v = e.target.value
                onUpdate(part.id, (p) => {
                  if (p.kind !== 'board') return p
                  const next = { ...p.edgeBanding }
                  if (v === 'follow') delete next[key]
                  else next[key] = v === 'none' ? null : v
                  return { ...p, edgeBanding: Object.keys(next).length > 0 ? next : undefined }
                })
              }}>
              {canFollow && <option value="follow">Follow cabinet{effective[key] ? ` (${effective[key]})` : ' (none)'}</option>}
              <option value="none">None</option>
              {edgeMats.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )
      })}
    </fieldset>
  )
})()}
```

A manual board with no explicit entry reads as `none` (its `value` is `'follow'` but `Follow cabinet` is not offered): handle that by computing `value = own === undefined ? (canFollow ? 'follow' : 'none') : …`. Import `EDGE_KEYS`, `edgesOf` from `../scene/edgeBanding`, `EdgeKey` from `../scene/types`, and `componentsById` if not already imported. Native `<select>` is used here on purpose: `EditPanel` already uses native inputs, and the tests drive it with `fireEvent.change`.

- [ ] **Step 4: Run and verify**

Run: `pnpm vitest run src/ui src/App.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Edit edge banding on the cabinet and on each board

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 8: Mutation-test the guards, docs, full checks, push

**Files:**
- Modify: `docs/superpowers/notes/2026-09-30-edge-banding-notes.md`, `docs/superpowers/specs/2026-09-30-edge-banding-design.md`
- Modify: `CLAUDE.md` (architecture tree + invariants + format version line)
- Modify: `project-structure.html` via `node scripts/update-structure-html.mjs`

Follow CLAUDE.md "Mutation testing": back up to the scratchpad and restore from it, never `git checkout`; grep after applying and after restoring; predict first; confirm green first; expect an `AssertionError` naming the rule.

- [ ] **Step 1: Back up and confirm green**

```bash
S=/tmp/claude-0/-home-user-zimmu-web/d892a957-ab28-595a-9015-059ca8990e98/scratchpad
cp src/scene/edgeBanding.ts $S/edgeBanding.bak && cp src/ui/buildCsv.ts $S/buildCsv.bak && cp src/scene/fileValidation.ts $S/fileValidation.bak
pnpm vitest run src/scene/edgeBanding.test.ts src/ui/buildCsv.test.ts src/scene/edgeBandingFile.test.ts src/nest
```
Expected: all PASS before mutating.

- [ ] **Step 2: Run the mutations** (find the real line in the current code for each)

| # | Mutation | Predicted failing test |
|---|---|---|
| 1 | `edgeFacing`: compare `out[component] + direction.sign` (wrong sign) | "puts the front edge ... on the min-y face", "side front is x0, bottom front is y0" |
| 2 | `edgesOf`: apply the rule to a detached board (drop `part.driven &&`) | "follows only explicit edges on a detached board" |
| 3 | `edgesOf`: explicit `null` ignored (`if (own)` instead of `!== undefined`) | "lets an explicit null beat the rule" |
| 4 | `edgesOf`: drop the mitre guard | "reports no edges at all on a mitred board" |
| 5 | `cutSizeOf`: a banded x-edge reduces width instead of length | "subtracts each banded edge from the dimension it runs across" |
| 6 | `cutSizeOf`: use one thickness for both edges (`t(x0)` twice) | "uses each edge its own thickness" |
| 7 | `cutSizeOf`: clamp to 0 and drop the `problem` | "reports a problem rather than a clamped size" |
| 8 | `edgeCode`: ignore `swapped` | "counts long and short edges in cutlist orientation" |
| 9 | `groupParts`: drop the edge pattern from the grouping key | "does not merge identical boards whose edges differ" |
| 10 | `cutPartOf`: do not shift through-cuts | "shrinks the part and shifts through-cuts" |
| 11 | `validateEdgeFacts`: accept any string edge material | "rejects an edge naming a missing material or a panel material" |
| 12 | `buildCsv`: put the new columns before `Total` | "appends the new columns after Total" |

A surviving mutation means a missing test: add it, re-run the mutation until it is killed, then restore. Record predicted / observed / killed or survived / test added for each.

- [ ] **Step 3: Restore and confirm no mutation remains**

```bash
cmp src/scene/edgeBanding.ts $S/edgeBanding.bak && cmp src/ui/buildCsv.ts $S/buildCsv.bak && cmp src/scene/fileValidation.ts $S/fileValidation.bak
```
Expected: no output (identical).

- [ ] **Step 4: Docs**

- Spec: add a "Refinements made while planning" section listing the planning refinements at the top of this plan (rotation-based direction lookup, add-edge-band form instead of a material form, appended CSV columns, mitre guard in `edgesOf`, dangling cabinet material not a file error, seventh `buildDrawingSheets` parameter, `useNest` takes components); correct the "Editing" section's "Material form" bullet accordingly.
- Notes: the same refinements with reasons, the mutation table, and known limitations: no band waste allowance; `SHAPED` stays a manual note; an edge material is added by name and thickness only (no rate in the form: set it in the BOM); the default role rule is a stated figure awaiting a woodworker's review; edge-band rows appear only in the Boards tab and its CSV.
- `CLAUDE.md`: architecture tree entry for `edgeBanding.ts` (and a one-line mention in the `buildCsv.ts` entry that it now reports finished and cut size); update the `FILE_FORMAT_VERSION` line to 24 and append entries for v22, v23 and v24 (read `docs/superpowers/notes/2026-09-29-stage-2-room-geometry-notes.md` and the Stage 2 commits for what 22 and 23 added; v24 is edge banding: `edgeMaterial`, `BoardPart.edgeBanding` and `use: 'edge'` materials). The line currently stops at v21 while the code was already at 23; say so in the notes; add three invariants: banding never changes finished geometry and stays out of `shapeKey`/regeneration/viewport; direction-to-edge is found by rotating the edge normals, never hand-tabulated; the cut-size subtraction is stated once in `cutSizeOf`.

- [ ] **Step 5: Regenerate the structure page and run every check**

```bash
node scripts/update-structure-html.mjs
pnpm typecheck && pnpm lint && pnpm test
```
Expected: all green. Report the real test count.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "Document edge banding and record mutation results

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
git push -u origin claude/festive-brown-tdhoa9
```

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| `MaterialDef.use`, `CarcaseParams.edgeMaterial`, `BoardPart.edgeBanding`, `EdgeKey` | 1 |
| File format v24; reject unknown key, missing/non-edge material | 1 |
| Rule by role table; direction to board edge checked against `orientedPanel` | 2 |
| `edgesOf`: rule then explicit, manual/detached explicit-only, mitre none, `nearestCarcase` | 2 |
| Cut size subtraction once; problem not clamped | 2 |
| Shop code in cutlist orientation | 2, 3 |
| `finishedDimensions` rename, Length/Width = cut, new columns, grouping, error row | 3 |
| BOM metres per edge material, priced by `costPerM`, no allowance | 4 |
| Nest at cut size, through-cuts shifted, signature carries the edge state | 5 |
| Part drawing note in `manufacturingNotes` | 6 |
| Cabinet Edge band selector, add-edge-band, per-edge control, mitre disabled, pickers exclude edge stock | 7 |
| Dangling cabinet edge material: note, not an error | 7 (note), 1 (not validated) |
| Invariants in CLAUDE.md, mutation testing, notes | 8 |
| Shaped edges, trim allowance, graphical marks, waste allowance | out of scope (spec) |

Type consistency: `EdgeKey`/`EdgeDecisions` (Task 1) are read by Tasks 2, 7. `edgesOf(part, byId, materials)` (signature changed after Task 2's review: a dangling cabinet `edgeMaterial` must mean no banding, so `edgesOf` applies the rule only when the material exists and is edge stock), `cutSizeOf(part, edges, materials)`, `cutPartOf(part, byId, materials)`, `edgeCode(edges, swapped)`, `bandedEdgeLengths(part, edges)` (Task 2) are called with exactly those signatures in Tasks 3 to 6. `isSwapped` (Task 3, in `grain.ts`) is read by Tasks 3 and 6; `finishedDimensions` (Task 3) by Task 3's callers. `groupParts` keeps its three parameters; `useNest`'s new `components` parameter is threaded in Task 5.
