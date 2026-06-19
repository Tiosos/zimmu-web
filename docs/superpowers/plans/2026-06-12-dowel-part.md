# Dowel Part (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `CylinderPart` (dowel) primitive that renders in the viewport, edits via diameter/length, exports to STL/STEP, and is costed in a dedicated "Dowels" BOM tab by linear ($/m) material rate.

**Architecture:** `Part` becomes a discriminated union `BoardPart | CylinderPart`. The geometry pipeline (worker `buildPart`, `ExportSpec`) becomes kind-discriminated. UI seams that assume a board (`EditPanel`, drawings, BOM) branch or filter on `kind`. `MaterialDef` gains an optional `costPerM` linear rate (and `costPerM2` becomes optional for dowel-only materials).

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Vite, Three.js, OpenCASCADE.js (WASM) via Comlink worker, Vitest + happy-dom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-12-dowel-part-design.md`

**Conventions reminder (from CLAUDE.md):**
- pnpm only. No `any`. Named exports. No "what" comments.
- Run `pnpm typecheck && pnpm lint && pnpm test` before every commit (a pre-commit hook also runs typecheck).
- Tests live next to code (`*.test.ts[x]`). The Write/Edit hook auto-runs an affected test file and auto-formats with Prettier.
- Commit on branch `claude/exciting-bell-2jysqk`. Never commit on `main`.
- Each task ends green (typecheck + lint + test all pass) and is committed.

**Two planning-time refinements from the spec (intentional, recorded here and in the notes file in Task 9):**
1. `MaterialDef.costPerM2` becomes **optional** (not just `costPerM`). A dowel-only material (e.g. "Beech dowel") carries `costPerM` but no `costPerM2`; forcing a `0` board rate would make boards of that material show `$0.00` instead of `—`. Both rates optional is the correct, symmetric model.
2. The 2D-drawings guard is implemented as a **board filter inside `buildDrawingSheets`** (not "disable the button"). Drawings already operate on all visible parts, not the selected one; filtering non-board parts there is the precise, type-safe guard.

---

## File Map

**Create:**
- `src/ui/DowelList.tsx` — Dowels BOM table (grouped rows + per-row `costPerM` popover).
- `docs/superpowers/notes/2026-06-12-dowel-part-notes.md` — implementation notes.

**Modify:**
- `src/scene/types.ts` — `CylinderPart`, `Part` union, `MaterialDef` optional rates.
- `src/scene/utils.ts` — `shapeKey` cylinder branch.
- `src/geom/occt.ts` — `makeCylinder`, `ExportSpec` union, `makeTransformedShape` branch.
- `src/geom/occt.worker.ts` — `buildPart` discriminated `BuildSpec`.
- `src/geom/drawing.ts` — filter to boards.
- `src/scene/useScene.ts` — kind-aware `buildPart` call + `exportStep`; `onAdd(kind)`; generic `onDuplicate`.
- `src/scene/useScene.test.ts` — update `buildPart` assertion shape.
- `src/ui/buildCsv.ts` — optional `costPerM2`; `groupDowels` + `buildDowelCsv`.
- `src/ui/CuttingList.tsx` — generalize/export `MaterialPopover`; merge-preserve on save.
- `src/ui/BomModal.tsx` — "Dowels" tab; `LibraryTab` `costPerM2` optional + `costPerM` column.
- `src/ui/sidebar.tsx` — `onAdd(kind)`; `+ Board` / `+ Dowel` buttons; `EditPanel`/`ColorControl` for both kinds.

**No change needed (verified):** `src/geom/mesh.ts`, `src/geom/transform.ts`, `src/geom/stl.ts`, `src/render/viewport.tsx` (already guards `kind !== 'board'`), `src/App.tsx` (forwards `onAdd` by reference).

---

## Task 1: `makeCylinder` geometry primitive

**Files:**
- Modify: `src/geom/occt.ts`
- Test: `src/geom/occt.test.ts`

- [ ] **Step 1: Write the failing export test**

In `src/geom/occt.test.ts`, add after the existing `exports makeShape` test (around line 32):

```ts
  it('exports makeCylinder', () => {
    expect(typeof makeCylinder).toBe('function')
  })

  it.skip('makeCylinder returns a TopoDS_Shape (browser-only)', async () => {
    const oc = await initOCCT()
    const shape = makeCylinder(oc, 4, 100)
    expect(shape).toBeTruthy()
    shape.delete()
  })
```

Update the import line at the top of the file:

```ts
import { initOCCT, makeBox, makeCut, makeShape, makeCylinder } from './occt'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/geom/occt.test.ts`
Expected: FAIL — `makeCylinder` is not exported (TS error / undefined).

- [ ] **Step 3: Implement `makeCylinder`**

In `src/geom/occt.ts`, add after `makeBox` (after line 22):

```ts
export function makeCylinder(
  oc: OpenCascadeInstance,
  radius: number,
  height: number,
): TopoDS_Shape {
  // BRepPrimAPI_MakeCylinder_2(R, H): default axis +Z, base circle centered at origin.
  const builder = new oc.BRepPrimAPI_MakeCylinder_2(radius, height)
  const shape = builder.Shape()
  builder.delete()
  return shape
}
```

**Overload note for the implementer:** `BRepPrimAPI_MakeCylinder_2(R, H)` is the radius+height constructor (default `gp_Ax2` at origin, +Z). If the live browser build throws a constructor-not-found error here, run the `add-geometry` skill's live-spike step to confirm the correct `_N` suffix, then update this line. The Node test suite cannot catch this (WASM is browser-only), so it is verified manually at `pnpm dev` in Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/geom/occt.test.ts`
Expected: PASS (export test passes; `it.skip` cases remain skipped).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add src/geom/occt.ts src/geom/occt.test.ts
git commit -m "feat(geom): add makeCylinder OCCT primitive"
```

---

## Task 2: `MaterialDef` optional rates + reusable `MaterialPopover`

This task makes both rates optional, adds `costPerM`, and generalizes the rate popover so dowels can reuse it — all while keeping the boards BOM green and preserving `costPerM` when a board rate is saved.

**Files:**
- Modify: `src/scene/types.ts`
- Modify: `src/ui/buildCsv.ts`
- Modify: `src/ui/CuttingList.tsx`
- Modify: `src/ui/BomModal.tsx`
- Test: `src/ui/buildCsv.test.ts`, `src/ui/CuttingList.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/ui/buildCsv.test.ts`, add (place near the other `groupParts` cost tests):

```ts
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
```

Ensure `import type { Part } from '../scene/types'` exists in that test file (add if missing).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: FAIL — currently `materials['Beech dowel'].costPerM2` is `undefined`, the code does arithmetic on it and yields `NaN`/throws, not `null` (also a TS error once the type changes in Step 3).

- [ ] **Step 3: Make both `MaterialDef` rates optional**

In `src/scene/types.ts`, replace the `MaterialDef` interface:

```ts
export interface MaterialDef {
  costPerM2?: number // areal rate ($/m²) for sheet/board stock
  costPerM?: number // linear rate ($/m) for round/linear stock (dowels)
}
```

- [ ] **Step 4: Fix `groupParts` for optional `costPerM2`**

In `src/ui/buildCsv.ts`, inside `groupParts`, replace the rate/cost lines:

```ts
    const rate = materials[p.material]?.costPerM2
    const costPerUnit =
      rate !== undefined ? ((p.length * p.width) / 1_000_000) * rate : null
```

- [ ] **Step 5: Generalize `MaterialPopover` and merge-preserve in `CuttingList`**

In `src/ui/CuttingList.tsx`, replace the `MaterialPopover` props + component so it edits a single number and labels its unit, and **export** it:

```ts
interface MaterialPopoverProps {
  current: number | undefined
  unitLabel: string
  onSave: (value: number) => void
  onClose: () => void
}

export function MaterialPopover({ current, unitLabel, onSave, onClose }: MaterialPopoverProps) {
  const [value, setValue] = useState(current !== undefined ? String(current) : '')
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) {
      if (current === undefined || num !== current) onSave(num)
      else onClose()
    } else {
      onClose()
    }
  }

  return (
    <div
      className="absolute z-10 top-full left-0 mt-1 bg-card border border-border rounded shadow-lg p-2 flex items-center gap-1.5 text-xs"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground whitespace-nowrap">{unitLabel}</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') onClose()
        }}
        className="w-20 bg-background border border-border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}
```

Then update the `MaterialPopover` usage inside the board table (the JSX around line 155) to pass `unitLabel` and build a **merged** `MaterialDef` so a saved board rate preserves any existing `costPerM`:

```tsx
                    {openPopover === row.material && onMaterialCostChange && (
                      <MaterialPopover
                        current={materials[row.material]?.costPerM2}
                        unitLabel="$/m²"
                        onSave={(num) => {
                          onMaterialCostChange(row.material, {
                            ...materials[row.material],
                            costPerM2: num,
                          })
                          setOpenPopover(null)
                        }}
                        onClose={() => setOpenPopover(null)}
                      />
                    )}
```

- [ ] **Step 6: Fix `LibraryTab` for optional `costPerM2`**

In `src/ui/BomModal.tsx`, in `LibraryTab`, replace the cost cell:

```tsx
            <td className="py-1.5 px-2 text-xs">
              {def.costPerM2 !== undefined ? `$${def.costPerM2.toFixed(2)}` : '—'}
            </td>
```

- [ ] **Step 7: Run the full affected suite**

Run: `pnpm vitest run src/ui/buildCsv.test.ts src/ui/CuttingList.test.tsx src/ui/BomModal.test.tsx`
Expected: PASS. If `CuttingList.test.tsx` asserted the old `onSave({ costPerM2 })` shape, update those assertions to the merged-object shape (`expect(onMaterialCostChange).toHaveBeenCalledWith('Oak', { costPerM2: <n> })` — note a brand-new material spreads `...undefined` to `{}`, so the object is exactly `{ costPerM2: <n> }`).

- [ ] **Step 8: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/types.ts src/ui/buildCsv.ts src/ui/CuttingList.tsx src/ui/BomModal.tsx src/ui/buildCsv.test.ts src/ui/CuttingList.test.tsx
git commit -m "feat(bom): optional MaterialDef rates; reusable MaterialPopover"
```

---

## Task 3: Kind-aware geometry pipeline (`Part` union)

Introduces `CylinderPart` and the `Part` union, then threads `kind` through `shapeKey`, the worker `buildPart`, `ExportSpec`, and drawings so the whole pipeline compiles and routes by kind. No cylinders are created yet (that is Task 5), so runtime behavior for existing boards is unchanged.

**Files:**
- Modify: `src/scene/types.ts`, `src/scene/utils.ts`, `src/geom/occt.ts`, `src/geom/occt.worker.ts`, `src/geom/drawing.ts`, `src/scene/useScene.ts`
- Test: `src/scene/utils.test.ts`, `src/scene/useScene.test.ts`, `src/geom/occt.test.ts`

- [ ] **Step 1: Write failing `shapeKey` test**

In `src/scene/utils.test.ts`, add:

```ts
  it('shapeKey for a cylinder encodes diameter and length only', () => {
    const dowel: Part = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel 1',
      diameter: 8,
      length: 100,
      material: '',
      color: '#888888',
      position: { x: 5, y: 6, z: 7 },
      rotation: { x: 10, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    expect(shapeKey(dowel)).toBe('cylinder|8|100')
  })
```

Ensure `import type { Part } from './types'` is present in that test file.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/scene/utils.test.ts`
Expected: FAIL — TS error (`'cylinder'` not assignable to `Part`) / `shapeKey` throws "unknown part kind".

- [ ] **Step 3: Add `CylinderPart` + `Part` union**

In `src/scene/types.ts`, add after the `BoardPart` interface and update `Part`:

```ts
export interface CylinderPart {
  kind: 'cylinder'
  id: PartId
  label: string
  diameter: number // mm
  length: number // mm — extent along local +Z
  material: string // "" means unspecified
  color: string
  position: Vec3 // base-circle center; local origin lies on the axis
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
}

export type Part = BoardPart | CylinderPart
```

- [ ] **Step 4: Add the `shapeKey` cylinder branch**

In `src/scene/utils.ts`, add a branch before the final `throw`:

```ts
  if (part.kind === 'cylinder') {
    return `cylinder|${part.diameter}|${part.length}`
  }
```

- [ ] **Step 5: Run the `shapeKey` test**

Run: `pnpm vitest run src/scene/utils.test.ts`
Expected: PASS.

- [ ] **Step 6: Make `ExportSpec` a discriminated union + branch `makeTransformedShape`**

In `src/geom/occt.ts`, replace the `ExportSpec` interface with a union:

```ts
export type ExportSpec =
  | {
      kind: 'board'
      label: string
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
      matrix: number[]
    }
  | {
      kind: 'cylinder'
      label: string
      diameter: number
      length: number
      matrix: number[]
    }
```

In `makeTransformedShape`, replace `const shape = makeShape(oc, spec)` with a kind branch:

```ts
  const shape =
    spec.kind === 'board'
      ? makeShape(oc, spec)
      : makeCylinder(oc, spec.diameter / 2, spec.length)
```

- [ ] **Step 7: Update the `writeStep` smoke test literal**

In `src/geom/occt.test.ts`, the skipped `writeStep` test builds an `ExportSpec` literal — add `kind: 'board',` as its first field so it matches the union:

```ts
      {
        kind: 'board',
        label: 'Rail',
        length: 200,
        width: 100,
        thickness: 25,
        cuts: [],
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
```

- [ ] **Step 8: Make the worker `buildPart` take a discriminated `BuildSpec`**

Replace the body of `src/geom/occt.worker.ts` with:

```ts
import { expose, transfer } from 'comlink'
import { initOCCT, makeShape, makeCylinder, writeStep } from './occt'
import type { ExportSpec } from './occt'
import { shapeToMeshData } from './mesh'
import type { Vec3 } from '../scene/types'

export type BuildSpec =
  | {
      kind: 'board'
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
    }
  | { kind: 'cylinder'; diameter: number; length: number }

const MESH_OPTS = { linearDeflection: 0.1, angularDeflection: 0.5 }

const api = {
  async buildPart(spec: BuildSpec) {
    const oc = await initOCCT()
    const shape =
      spec.kind === 'board'
        ? makeShape(oc, spec)
        : makeCylinder(oc, spec.diameter / 2, spec.length)
    const data = shapeToMeshData(oc, shape, MESH_OPTS)
    shape.delete()
    return transfer(data, [data.positions.buffer, data.normals.buffer])
  },
  async exportStep(specs: ExportSpec[]): Promise<string> {
    const oc = await initOCCT()
    return writeStep(oc, specs)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
```

- [ ] **Step 9: Build kind-aware specs in `useScene`**

In `src/geom/...` we now need helpers in `useScene.ts`. Add this import at the top of `src/scene/useScene.ts` (alongside the existing geom import):

```ts
import type { BuildSpec } from '../geom/occt.worker'
```

Add a module-scope helper near the top of `src/scene/useScene.ts` (after imports, before the hook):

```ts
function buildSpecForPart(part: Part): BuildSpec {
  if (part.kind === 'board') {
    return {
      kind: 'board',
      length: part.length,
      width: part.width,
      thickness: part.thickness,
      cuts: part.cuts.map(({ id, position, size }) => ({ id, position, size })),
    }
  }
  return { kind: 'cylinder', diameter: part.diameter, length: part.length }
}
```

Replace the `getOcct().buildPart(part.kind, { ... })` call in the geometry effect with:

```ts
      getOcct()
        .buildPart(buildSpecForPart(part))
```

(Leave the `.then(...)`/`.catch(...)` chain unchanged.)

Replace the `exportStep` body's `specs` mapping with a kind branch:

```ts
  const exportStep = useCallback(async (parts: Part[]): Promise<string> => {
    const specs: ExportSpec[] = parts.map((p) =>
      p.kind === 'board'
        ? {
            kind: 'board',
            label: p.label,
            length: p.length,
            width: p.width,
            thickness: p.thickness,
            cuts: p.cuts.map(({ id, position, size }) => ({ id, position, size })),
            matrix: Array.from(composeWorldMatrix(p)),
          }
        : {
            kind: 'cylinder',
            label: p.label,
            diameter: p.diameter,
            length: p.length,
            matrix: Array.from(composeWorldMatrix(p)),
          },
    )
    return getOcct().exportStep(specs)
  }, [])
```

Add `ExportSpec` to the existing `../geom/occt` import if it is imported there; otherwise add:

```ts
import type { ExportSpec } from '../geom/occt'
```

(Confirm whether `useScene.ts` already imports from `../geom/occt`; if not, add the import line above.)

- [ ] **Step 10: Filter drawings to boards**

In `src/geom/drawing.ts`, at the top of `buildDrawingSheets`, narrow to boards and use the narrowed array everywhere `parts` is iterated:

```ts
export function buildDrawingSheets(parts: Part[], projectName: string): DrawingSheet[] {
  const date = new Date().toISOString().slice(0, 10)
  const boards = parts.filter((p): p is BoardPart => p.kind === 'board')

  const coverRows: CoverRow[] = boards.map((p, i) => ({
```

Replace the `const partSheets: DrawingSheet[] = parts.map((p) => {` line with `boards.map`:

```ts
  const partSheets: DrawingSheet[] = boards.map((p) => {
```

Add `BoardPart` to the type import at the top of `drawing.ts`:

```ts
import type { Part, BoardPart } from '../scene/types'
```

(Adjust to match the existing import form in that file.)

- [ ] **Step 11: Update the `buildPart` assertion in `useScene.test.ts`**

In `src/scene/useScene.test.ts`, the test `passes cuts array to buildPart when geometry is triggered` asserts the old positional shape. Replace its `expect(...).toHaveBeenCalledWith(...)` with the new single-spec shape:

```ts
    await waitFor(() =>
      expect(mockBuildPart).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'board',
          cuts: [{ id: 'cut_1', position: { x: 90, y: 40, z: 15 }, size: { x: 20, y: 20, z: 10 } }],
        }),
      ),
    )
```

- [ ] **Step 12: Run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. Typecheck must be clean — this is the task where the union ripples through every board-assuming call site.

- [ ] **Step 13: Lint + commit**

```bash
pnpm lint
git add src/scene/types.ts src/scene/utils.ts src/scene/utils.test.ts src/geom/occt.ts src/geom/occt.test.ts src/geom/occt.worker.ts src/geom/drawing.ts src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(geom): kind-aware Part union and geometry pipeline"
```

---

## Task 4: Scene operations — `onAdd(kind)` + generic `onDuplicate`

**Files:**
- Modify: `src/scene/useScene.ts`, `src/ui/sidebar.tsx` (signature plumbing only)
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/scene/useScene.test.ts`, add:

```ts
  it('onAdd("cylinder") adds a dowel with default Ø8 × 100', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const before = result.current.scene.parts.length
    act(() => result.current.onAdd('cylinder'))
    const added = result.current.scene.parts[result.current.scene.parts.length - 1]
    expect(result.current.scene.parts.length).toBe(before + 1)
    expect(added.kind).toBe('cylinder')
    if (added.kind === 'cylinder') {
      expect(added.diameter).toBe(8)
      expect(added.length).toBe(100)
      expect(added.label).toBe('Dowel 1')
    }
  })

  it('onDuplicate of a dowel clones it with a new id', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => result.current.onAdd('cylinder'))
    const orig = result.current.scene.parts[result.current.scene.parts.length - 1]
    act(() => result.current.onDuplicate(orig.id))
    const clone = result.current.scene.parts[result.current.scene.parts.length - 1]
    expect(clone.id).not.toBe(orig.id)
    expect(clone.kind).toBe('cylinder')
  })
```

Also update any existing test that calls `result.current.onAdd()` with no argument to `onAdd('board')`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: FAIL — `onAdd` currently takes no args (TS error) and always makes a board.

- [ ] **Step 3: Rewrite `onAdd` to take a kind**

In `src/scene/useScene.ts`, replace the whole `onAdd` callback:

```ts
  const onAdd = useCallback(
    (kind: 'board' | 'cylinder') => {
      if (!occtReady) return
      colorIndex.current += 1
      const color = PART_COLORS[colorIndex.current % PART_COLORS.length]
      let part: Part
      if (kind === 'board') {
        part = {
          kind: 'board',
          id: `board_${crypto.randomUUID()}`,
          label: `Board ${labelCounter + 1}`,
          length: 200,
          width: 100,
          thickness: 25,
          material: '',
          color,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          cuts: [],
          visible: true,
        }
      } else {
        const dowelCount = sceneRef.current.parts.filter((p) => p.kind === 'cylinder').length
        part = {
          kind: 'cylinder',
          id: `dowel_${crypto.randomUUID()}`,
          label: `Dowel ${dowelCount + 1}`,
          diameter: 8,
          length: 100,
          material: '',
          color,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
        }
      }
      setScene((prev) => ({ ...prev, parts: [...prev.parts, part] }))
      setSelectedId(part.id)
      push({
        label: `Add ${part.label}`,
        undo: () => {
          setScene((prev) => ({ ...prev, parts: prev.parts.filter((p) => p.id !== part.id) }))
          setSelectedId((prev) => (prev === part.id ? null : prev))
        },
        redo: () => {
          setScene((prev) => ({ ...prev, parts: [...prev.parts, part] }))
          setSelectedId(part.id)
        },
      })
    },
    [occtReady, labelCounter, push],
  )
```

Update the `onAdd` type in the `UseSceneResult` interface (around line 75):

```ts
  onAdd: (kind: 'board' | 'cylinder') => void
```

- [ ] **Step 4: Make `onDuplicate` kind-generic**

In `src/scene/useScene.ts`, replace the `orig`/`clone` construction at the top of `onDuplicate` (the `as BoardPart` cast and the board-only clone) with:

```ts
      const orig = sceneRef.current.parts.find((p) => p.id === id)
      if (!orig) return
      colorIndex.current += 1
      const color = PART_COLORS[colorIndex.current % PART_COLORS.length]
      let clone: Part
      if (orig.kind === 'board') {
        clone = {
          ...orig,
          id: `board_${crypto.randomUUID()}` as PartId,
          color,
          position: { ...orig.position, x: orig.position.x + orig.length + 10 },
          rotation: { x: 0, y: 0, z: 0 },
          visible: true,
          cuts: orig.cuts.map((c) => ({
            ...c,
            id: `cut_${crypto.randomUUID()}` as CutId,
            pairedCutId: undefined,
          })),
        }
      } else {
        clone = {
          ...orig,
          id: `dowel_${crypto.randomUUID()}` as PartId,
          color,
          position: { ...orig.position, x: orig.position.x + orig.diameter + 10 },
          rotation: { x: 0, y: 0, z: 0 },
          visible: true,
        }
      }
```

(Leave the rest of `onDuplicate` — the `setScene` splice and `push(...)` — unchanged.)

- [ ] **Step 5: Keep `sidebar.tsx` compiling (board-only button for now)**

In `src/ui/sidebar.tsx`, update the `SidebarProps.onAdd` type (line 28):

```ts
  onAdd: (kind: 'board' | 'cylinder') => void
```

And the existing footer button's `onClick` (around line 755) — temporary until Task 5:

```tsx
          <Button
            onClick={() => onAdd('board')}
```

- [ ] **Step 6: Run the suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (new `onAdd`/`onDuplicate` tests pass; existing board tests pass).

- [ ] **Step 7: Lint + commit**

```bash
pnpm lint
git add src/scene/useScene.ts src/scene/useScene.test.ts src/ui/sidebar.tsx
git commit -m "feat(scene): onAdd(kind) and kind-generic duplicate for dowels"
```

---

## Task 5: Sidebar — `+ Dowel` button + dowel dimension editor

**Files:**
- Modify: `src/ui/sidebar.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/ui/sidebar.test.tsx`, add (reuse the file's existing render helper / props factory; the snippet below assumes a `renderSidebar(props)` style — adapt to the file's actual pattern, and build a `CylinderPart` selected part):

```tsx
  it('renders diameter and length inputs for a selected dowel', () => {
    const dowel: Part = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel 1',
      diameter: 8,
      length: 100,
      material: '',
      color: '#888888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    renderSidebar({ scene: makeScene([dowel]), selectedId: 'd1' })
    expect(screen.getByText('Ø')).toBeInTheDocument()
    // length input present; board-only L/W/T labels absent
    expect(screen.queryByText('T')).not.toBeInTheDocument()
  })

  it('shows + Dowel and + Board add buttons', () => {
    renderSidebar({ scene: makeScene([]), selectedId: null })
    expect(screen.getByText('+ Board')).toBeInTheDocument()
    expect(screen.getByText('+ Dowel')).toBeInTheDocument()
  })
```

(`makeScene`/`renderSidebar` stand in for the file's existing helpers — match them. If the file builds props inline, mirror that.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: FAIL — `EditPanel` returns `null` for a cylinder; only one add button exists.

- [ ] **Step 3: Generalize `ColorControl` to `Part`**

In `src/ui/sidebar.tsx`, change `ColorControl`'s prop type from `part: BoardPart` to `part: Part` (line ~329). It only reads `part.id`/`part.color`, so no body change.

- [ ] **Step 4: Restructure `EditPanel` to support both kinds**

In `src/ui/sidebar.tsx`, remove the early `if (part.kind !== 'board') return null` (line 396). Replace the **Shape section** `Collapsible` (lines 460–483) with a kind-specific dimensions block:

```tsx
      {/* Shape section */}
      <Collapsible open={shapeOpen} onOpenChange={setShapeOpen}>
        <SectionHeader open={shapeOpen} label="Shape" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          {part.kind === 'board' ? (
            <>
              <DimInput
                label="L"
                value={part.length}
                suffix="mm"
                onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, length: v }))}
              />
              <DimInput
                label="W"
                value={part.width}
                suffix="mm"
                onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, width: v }))}
              />
              <DimInput
                label="T"
                value={part.thickness}
                suffix="mm"
                onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, thickness: v }))}
              />
            </>
          ) : (
            <>
              <DimInput
                label="Ø"
                value={part.diameter}
                suffix="mm"
                onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, diameter: v }))}
              />
              <DimInput
                label="L"
                value={part.length}
                suffix="mm"
                onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, length: v }))}
              />
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
```

Wrap the **Cuts section** (lines 547–565) so it renders only for boards:

```tsx
      {/* Cuts section — board only */}
      {part.kind === 'board' && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">
            ▾ Cuts
          </p>
          {part.cuts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-0.5">No cuts</p>
          ) : (
            part.cuts.map((cut) => (
              <CutRow
                key={cut.id}
                cut={cut}
                partId={part.id}
                scene={scene}
                onUpdateCut={onUpdateCut}
                onRemoveCut={onRemoveCut}
                onLinkCuts={onLinkCuts}
                onUnlinkCuts={onUnlinkCuts}
                defaultOpen={cut.id === lastPlacedCutId}
              />
            ))
          )}
        </>
      )}
```

The Label, Material, Color, Position, Rotation, and linked-Hardware sections already use only shared fields and need no change.

- [ ] **Step 5: Replace the single add button with two**

In `src/ui/sidebar.tsx`, replace the "Add board footer" block (lines 752–764):

```tsx
        {/* Add part footer */}
        <div className="p-2 border-t border-border flex gap-1">
          <Button
            onClick={() => onAdd('board')}
            disabled={!occtReady}
            title={!occtReady ? 'Loading geometry engine…' : undefined}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            + Board
          </Button>
          <Button
            onClick={() => onAdd('cylinder')}
            disabled={!occtReady}
            title={!occtReady ? 'Loading geometry engine…' : undefined}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            + Dowel
          </Button>
        </div>
```

Also update the empty-state hint (line 643) from `add a board to start` to `add a part to start`.

- [ ] **Step 6: Run the suite**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 7: Manual browser verification (the WASM seam)**

Run: `pnpm dev`, open the app, click **+ Dowel**. Confirm a cylinder renders in the viewport (axis +Z, base at origin), the EditPanel shows **Ø** + **L**, and editing them rebuilds the mesh. This is the one place the `makeCylinder` overload (Task 1) is exercised; if it throws, fix the constructor suffix per the Task 1 note.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -m "feat(ui): + Dowel button and dowel dimension editor"
```

---

## Task 6: BOM data — `groupDowels` + `buildDowelCsv`

**Files:**
- Modify: `src/ui/buildCsv.ts`
- Test: `src/ui/buildCsv.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/ui/buildCsv.test.ts`, add:

```ts
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
    // 100 mm = 0.1 m × $5/m = $0.50 per unit
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

  it('buildDowelCsv emits header, rows, and a Dowel total', () => {
    const csv = buildDowelCsv(
      [makeDowel({ id: 'd1', diameter: 8, length: 100, material: 'Beech' })],
      { Beech: { costPerM: 5 } },
    )
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Qty,Labels,Material,Color,Diameter (mm),Length (mm),Cost/unit,Total')
    expect(lines[lines.length - 1]).toContain('Dowel total')
  })
```

Add a `makeDowel` helper at the top of the test file:

```ts
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
    visible: true,
    ...over,
  }
}
```

Ensure imports: `import type { Part, CylinderPart } from '../scene/types'` and `import { groupDowels, buildDowelCsv } from './buildCsv'`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: FAIL — `groupDowels`/`buildDowelCsv` are not exported.

- [ ] **Step 3: Implement `groupDowels` + `buildDowelCsv`**

In `src/ui/buildCsv.ts`, add (after `groupParts` / `buildCsv`):

```ts
export interface DowelRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string
  diameter: number
  length: number
  costPerUnit: number | null // null = no costPerM rate for this material
  totalCost: number | null
}

export function groupDowels(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): DowelRow[] {
  const order: string[] = []
  const map = new Map<string, DowelRow>()

  for (const p of parts) {
    if (p.kind !== 'cylinder') continue
    const key = `${p.diameter}×${p.length}|${p.material}|${p.color}`
    const rate = materials[p.material]?.costPerM
    const costPerUnit = rate !== undefined ? (p.length / 1000) * rate : null
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.totalCost =
        existing.costPerUnit !== null ? existing.costPerUnit * existing.qty : null
    } else {
      order.push(key)
      map.set(key, {
        key,
        qty: 1,
        labels: p.label,
        material: p.material,
        color: p.color,
        diameter: p.diameter,
        length: p.length,
        costPerUnit,
        totalCost: costPerUnit,
      })
    }
  }

  return order.map((k) => map.get(k)!)
}

export function buildDowelCsv(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): string {
  const header = 'Qty,Labels,Material,Color,Diameter (mm),Length (mm),Cost/unit,Total'
  const rows = groupDowels(parts, materials)
  const dataRows = rows.map((row) => {
    const costStr = row.costPerUnit !== null ? row.costPerUnit.toFixed(2) : ''
    const totalStr = row.totalCost !== null ? row.totalCost.toFixed(2) : ''
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.diameter},${row.length},${costStr},${totalStr}`
  })

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  if (!anyHasCost) return [header, ...dataRows].join('\n')

  const dowelTotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const subtotalRow = `,,,,,,Dowel total,${dowelTotal.toFixed(2)}`
  return [header, ...dataRows, subtotalRow].join('\n')
}
```

(The `Dowel total` row has 6 leading commas so the label sits in the `Cost/unit` column and the value in `Total`, matching the 8-column header.)

- [ ] **Step 4: Run the suite**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add src/ui/buildCsv.ts src/ui/buildCsv.test.ts
git commit -m "feat(bom): groupDowels and dowel CSV with per-length cost"
```

---

## Task 7: Dowels BOM tab — `DowelList` + `BomModal` + Library column

**Files:**
- Create: `src/ui/DowelList.tsx`
- Modify: `src/ui/BomModal.tsx`
- Test: `src/ui/DowelList.test.tsx` (new), `src/ui/BomModal.test.tsx`

- [ ] **Step 1: Write the failing `DowelList` test**

Create `src/ui/DowelList.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DowelList } from './DowelList'
import type { Part } from '../scene/types'

function dowel(id: string, material: string): Part {
  return {
    kind: 'cylinder',
    id,
    label: id,
    diameter: 8,
    length: 100,
    material,
    color: '#888888',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
  }
}

describe('DowelList', () => {
  it('renders a row per dowel group', () => {
    render(
      <DowelList parts={[dowel('d1', 'Beech'), dowel('d2', 'Beech')]} materials={{}} />,
    )
    expect(screen.getByText('Beech')).toBeInTheDocument()
    // qty 2 in the first data cell
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('opens the $/m popover and saves costPerM merged with existing def', () => {
    const onMaterialCostChange = vi.fn()
    render(
      <DowelList
        parts={[dowel('d1', 'Beech')]}
        materials={{ Beech: { costPerM2: 12 } }}
        onMaterialCostChange={onMaterialCostChange}
      />,
    )
    fireEvent.click(screen.getByText('Beech'))
    const input = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onMaterialCostChange).toHaveBeenCalledWith('Beech', { costPerM2: 12, costPerM: 5 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/ui/DowelList.test.tsx`
Expected: FAIL — `DowelList` does not exist.

- [ ] **Step 3: Implement `DowelList`**

Create `src/ui/DowelList.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { MaterialDef, Part } from '../scene/types'
import { groupDowels } from './buildCsv'
import { MaterialPopover } from './CuttingList'

interface DowelListProps {
  parts: Part[]
  materials?: Record<string, MaterialDef>
  onMaterialCostChange?: (name: string, def: MaterialDef) => void
}

export function DowelList({ parts, materials = {}, onMaterialCostChange }: DowelListProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null)

  useEffect(() => {
    if (openPopover === null) return
    const handler = () => setOpenPopover(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [openPopover])

  const rows = groupDowels(parts, materials)
  const anyHasCost = rows.some((r) => r.totalCost !== null)
  const subtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)

  return (
    <table className="w-full border-collapse mb-4">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="pb-2 pr-2 font-medium text-xs">Qty</th>
          <th className="pb-2 px-2 font-medium text-xs">Labels</th>
          <th className="pb-2 px-2 font-medium text-xs">Material</th>
          <th className="pb-2 px-2 font-medium text-xs">Color</th>
          <th className="pb-2 px-2 font-medium text-xs">Diameter (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Cost/unit</th>
          <th className="pb-2 px-2 font-medium text-xs">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
              No dowels
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.key} className="border-b border-border/30">
              <td className="py-1.5 pr-2 text-xs">{row.qty}</td>
              <td className="py-1.5 px-2 text-xs">{row.labels}</td>
              <td className="py-1.5 px-2 text-xs">
                {row.material ? (
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onMaterialCostChange) {
                          setOpenPopover(openPopover === row.material ? null : row.material)
                        }
                      }}
                      className="underline decoration-dotted cursor-pointer hover:text-foreground text-xs"
                      title="Click to set $/m rate"
                    >
                      {row.material}
                    </button>
                    {openPopover === row.material && onMaterialCostChange && (
                      <MaterialPopover
                        current={materials[row.material]?.costPerM}
                        unitLabel="$/m"
                        onSave={(num) => {
                          onMaterialCostChange(row.material, {
                            ...materials[row.material],
                            costPerM: num,
                          })
                          setOpenPopover(null)
                        }}
                        onClose={() => setOpenPopover(null)}
                      />
                    )}
                  </div>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-1.5 px-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: row.color }}
                  />
                  {row.color}
                </span>
              </td>
              <td className="py-1.5 px-2 text-xs">{row.diameter}</td>
              <td className="py-1.5 px-2 text-xs">{row.length}</td>
              <td className="py-1.5 px-2 text-xs">
                {row.costPerUnit !== null ? `$${row.costPerUnit.toFixed(2)}` : '—'}
              </td>
              <td className="py-1.5 px-2 text-xs">
                {row.totalCost !== null ? `$${row.totalCost.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))
        )}
        {anyHasCost && (
          <tr className="border-t border-border font-medium">
            <td colSpan={7} className="pt-2 pr-2 text-xs text-right text-muted-foreground">
              Dowel total
            </td>
            <td className="pt-2 px-2 text-xs">${subtotal.toFixed(2)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run the `DowelList` test**

Run: `pnpm vitest run src/ui/DowelList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing `BomModal` test**

In `src/ui/BomModal.test.tsx`, add (adapt prop construction to the file's existing helper):

```tsx
  it('shows a Dowels tab that lists dowel groups', () => {
    const dowel: Part = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel 1',
      diameter: 8,
      length: 100,
      material: 'Beech',
      color: '#888888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    renderBom({ parts: [dowel] }) // adapt to the file's render helper
    fireEvent.click(screen.getByRole('tab', { name: 'Dowels' }))
    expect(screen.getByText('Beech')).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm vitest run src/ui/BomModal.test.tsx`
Expected: FAIL — there is no "Dowels" tab.

- [ ] **Step 7: Add the Dowels tab to `BomModal`**

In `src/ui/BomModal.tsx`:

Imports:

```ts
import { DowelList } from './DowelList'
import { groupParts, groupDowels, buildCsv, buildHardwareCsv, buildDowelCsv } from './buildCsv'
```

Tab type:

```ts
type Tab = 'boards' | 'dowels' | 'hardware' | 'library'
```

After `boardSubtotal`/`hardwareSubtotal`, add the dowel subtotal and fold it into the grand total:

```ts
  const dowelRows = groupDowels(parts, effectiveMaterials)
  const dowelSubtotal = dowelRows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const grandTotal = boardSubtotal + dowelSubtotal + hardwareSubtotal
```

Copy/download — extend both `handleCopy` and `handleDownload`:

```ts
  const handleCopy = () => {
    if (tab === 'library') return
    const csv =
      tab === 'boards'
        ? buildCsv(parts, effectiveMaterials)
        : tab === 'dowels'
          ? buildDowelCsv(parts, effectiveMaterials)
          : buildHardwareCsv(hardware)
    void navigator.clipboard.writeText(csv)
  }

  const handleDownload = () => {
    if (tab === 'library') return
    if (tab === 'boards') {
      downloadBlob(buildCsv(parts, effectiveMaterials), `${projectName}-boards.csv`, 'text/csv')
    } else if (tab === 'dowels') {
      downloadBlob(buildDowelCsv(parts, effectiveMaterials), `${projectName}-dowels.csv`, 'text/csv')
    } else {
      downloadBlob(buildHardwareCsv(hardware), `${projectName}-hardware.csv`, 'text/csv')
    }
  }
```

Tab bar — add `'dowels'` to the list and its label:

```tsx
          {(['boards', 'dowels', 'hardware', 'library'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'boards'
                ? 'Boards'
                : t === 'dowels'
                  ? 'Dowels'
                  : t === 'hardware'
                    ? 'Hardware'
                    : 'Library'}
            </button>
          ))}
```

Tab content — add the dowels branch:

```tsx
          {tab === 'boards' ? (
            <CuttingList
              parts={parts}
              projectName={projectName}
              onClose={onClose}
              materials={effectiveMaterials}
              onMaterialCostChange={handleMaterialCostChange}
              hideExportButtons
            />
          ) : tab === 'dowels' ? (
            <DowelList
              parts={parts}
              materials={effectiveMaterials}
              onMaterialCostChange={handleMaterialCostChange}
            />
          ) : tab === 'hardware' ? (
            <HardwareTab hardware={hardware} parts={parts} onUpdateHardware={onUpdateHardware} />
          ) : (
            <LibraryTab library={library} onDelete={onDeleteLibraryEntry} />
          )}
```

Footer — add a Dowels subtotal between Boards and Hardware:

```tsx
            <span className="text-border">|</span>
            <span>
              Dowels:{' '}
              <span className="text-foreground">
                {dowelSubtotal === 0 && !dowelRows.some((r) => r.totalCost !== null)
                  ? '—'
                  : `$${dowelSubtotal.toFixed(2)}`}
              </span>
            </span>
```

- [ ] **Step 8: Add a `costPerM` column to `LibraryTab`**

In `src/ui/BomModal.tsx`, `LibraryTab`: add a header cell after `Cost/m²` and a data cell after the `costPerM2` cell:

Header:

```tsx
          <th className="pb-2 px-2 font-medium text-xs">Cost/m²</th>
          <th className="pb-2 px-2 font-medium text-xs">Cost/m</th>
```

Data cell (after the `costPerM2` cell from Task 2 Step 6):

```tsx
            <td className="py-1.5 px-2 text-xs">
              {def.costPerM !== undefined ? `$${def.costPerM.toFixed(2)}` : '—'}
            </td>
```

(The Library tab is display-only — rates are edited via the Boards/Dowels popovers — so this is a read-only column, matching the existing pattern.)

- [ ] **Step 9: Run the affected suite**

Run: `pnpm vitest run src/ui/DowelList.test.tsx src/ui/BomModal.test.tsx`
Expected: PASS. Adapt the new `BomModal` test's render call to the file's existing helper if needed.

- [ ] **Step 10: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/ui/DowelList.tsx src/ui/DowelList.test.tsx src/ui/BomModal.tsx src/ui/BomModal.test.tsx
git commit -m "feat(bom): Dowels tab, DowelList, and library $/m column"
```

---

## Task 8: App-level integration test

`App.tsx` needs no code change (it forwards `onAdd` by reference and drawings filter boards internally). This task locks in the end-to-end path with a test.

**Files:**
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the integration test**

In `src/App.test.tsx`, add a test that adds a dowel and confirms it appears in the Dowels BOM tab. Match the file's existing setup (it already mocks the OCCT worker — reuse that mock; the worker mock's `buildPart` should resolve mesh data regardless of spec kind). Sketch:

```tsx
  it('adds a dowel and lists it in the Dowels BOM tab', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('+ Dowel')).toBeEnabled())
    fireEvent.click(screen.getByText('+ Dowel'))
    // open BOM (Shift+E or the FileMenu entry — match how other App tests open it)
    fireEvent.keyDown(window, { key: 'E', shiftKey: true, ctrlKey: true })
    fireEvent.click(await screen.findByRole('tab', { name: 'Dowels' }))
    expect(screen.getByText('Dowel 1')).toBeInTheDocument()
  })
```

(If `App.test.tsx` opens the BOM differently, mirror that. If the worker mock is keyed on `buildPart(kind, dims)` positional args, update it to the single-spec shape.)

- [ ] **Step 2: Run to verify failure, then confirm it passes**

Run: `pnpm vitest run src/App.test.tsx`
Expected: FAIL first if the mock/asserts need updating; iterate until PASS.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/App.test.tsx
git commit -m "test(app): add-dowel end-to-end through the Dowels BOM tab"
```

---

## Task 9: Implementation notes + final verification

**Files:**
- Create: `docs/superpowers/notes/2026-06-12-dowel-part-notes.md`

- [ ] **Step 1: Write the notes file**

Create `docs/superpowers/notes/2026-06-12-dowel-part-notes.md` recording the decisions that deviated from or refined the spec:

```markdown
# Dowel Part (SP1) — Implementation Notes

Living record of decisions and surprises. Audience: a future developer who needs to know *why*.

## Refinements beyond the spec

- **`MaterialDef.costPerM2` made optional** (spec had it required). A dowel-only
  material carries `costPerM` but no `costPerM2`; a forced `0` board rate would
  make boards show `$0.00` instead of `—`. Both rates optional is the correct,
  symmetric model. Fallout fixed in `groupParts` and `LibraryTab`.
- **2D-drawings guard implemented as a board filter inside `buildDrawingSheets`**,
  not a disabled button. Drawings operate on all visible parts, so filtering
  non-board parts there is the precise, type-safe guard.
- **No file-format version bump.** `costPerM`/optional `costPerM2` are
  backward-compatible; v2 files load unchanged.

## Decisions

- **`MaterialPopover` generalized** to edit a single number + `unitLabel`, and
  exported from `CuttingList.tsx` for reuse by `DowelList`. The board popover now
  *merges* the saved rate into the existing `MaterialDef` so `costPerM` survives
  a `costPerM2` edit and vice versa.
- **`makeCylinder` uses `BRepPrimAPI_MakeCylinder_2(R, H)`** (default +Z axis,
  base at origin). Verified in the browser at `pnpm dev` (Node tests skip WASM).
- **Dowel defaults:** Ø8 × 100 mm, label `Dowel N` (per-kind counter).
- **Flat-shaded facets** on the curved surface (angularDeflection 0.5),
  consistent with existing rendering. Smooth normals deferred.

## Out of scope (queued)

- SP2 dowel cuts, SP3 dowel snap-align, SP4 dowel 2D drawings.
- Curved-surface smooth shading.
```

- [ ] **Step 2: Full verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: ALL pass, zero type/lint errors.

- [ ] **Step 3: Manual smoke (browser)**

Run `pnpm dev` and confirm the full path: add a dowel → it renders → edit Ø/length rebuilds it → set a material → open BOM → Dowels tab → set a `$/m` rate → cost appears → Library tab shows the `$/m` column → export STL and STEP include the dowel → save and reopen the `.zimmu` file preserves the dowel.

- [ ] **Step 4: Commit + push**

```bash
git add docs/superpowers/notes/2026-06-12-dowel-part-notes.md
git commit -m "docs: dowel part (SP1) implementation notes"
git push -u origin claude/exciting-bell-2jysqk
```

---

## Self-Review

**Spec coverage:**
- Data model (`CylinderPart`, `Part` union, `MaterialDef.costPerM`) → Tasks 2, 3. ✓
- `makeCylinder` (+Z, base at origin) → Task 1. ✓
- Kind-discriminated worker `buildPart` → Task 3. ✓
- Discriminated `ExportSpec` + `makeTransformedShape` branch → Task 3. ✓
- `mesh.ts`/`stl.ts`/`transform.ts` unchanged → verified, no task needed. ✓
- `onAdd(kind)` + Ø8×100 defaults + generic `onDuplicate` → Task 4. ✓
- `+ Board`/`+ Dowel` buttons → Task 5. ✓
- `EditPanel` kind-specific dims, cuts board-only → Task 5. ✓
- 2D drawings guard (board filter) → Task 3 Step 10. ✓
- `groupDowels` + per-length cost + dowel CSV → Task 6. ✓
- Dowels BOM tab + `DowelList` + per-row `$/m` popover → Task 7. ✓
- Library `costPerM` column → Task 7 Step 8. ✓
- All tests enumerated in the spec → Tasks 1,3,4,5,6,7,8. ✓
- Out-of-scope recorded → Task 9 notes. ✓

**Placeholder scan:** No TBD/TODO. Test helper names (`renderSidebar`, `makeScene`, `renderBom`) are explicitly flagged as "adapt to the file's existing pattern" — the implementer reads the test file first. All production code is shown in full.

**Type consistency:** `BuildSpec` (worker) and `ExportSpec` (occt) are distinct, intentional types — `BuildSpec` has no `matrix`/`label`; `ExportSpec` does. `buildSpecForPart` returns `BuildSpec`. `groupDowels`/`DowelRow`/`buildDowelCsv` names match across Tasks 6–7. `MaterialPopover` signature (`current`, `unitLabel`, `onSave: (value:number)=>void`, `onClose`) is consistent between its definition (Task 2) and both call sites (Task 2 board, Task 7 dowel). `onAdd: (kind: 'board' | 'cylinder') => void` matches across `useScene`, `UseSceneResult`, `SidebarProps`, and both buttons.
