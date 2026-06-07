# Enhanced Cutting List — Full BOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the cutting list into a full Bill of Materials: boards tab with per-material cost rates and per-row cost columns, plus a hardware tab for manually-entered items (screws, hinges, etc.) with supplier, part number, unit cost, and notes.

**Architecture:** Thin `BomModal` tab wrapper (new) contains the existing `CuttingList` as the Boards tab and a new `HardwareTab`. `Scene` gains `materials: Record<string, MaterialDef>` and `hardware: HardwareItem[]`. All existing `setScene` calls in `useScene.ts` currently construct `{ parts: ... }` without spreading `...prev`, which will silently drop the new fields — those calls must all be fixed to `{ ...prev, parts: ... }`. `BomModal` replaces `CuttingList` at the `App.tsx` call site.

**Tech Stack:** React 19, TypeScript strict (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn/Radix primitives.

---

## File Map

### Create
| File | Responsibility |
|------|---------------|
| `src/ui/HardwareEditPanel.tsx` | 7-field form + Save / Cancel / Delete |
| `src/ui/HardwareEditPanel.test.tsx` | Field entry, save, cancel, delete confirm |
| `src/ui/HardwareTab.tsx` | Hardware table + edit panel layout |
| `src/ui/HardwareTab.test.tsx` | Add / select / delete flow |
| `src/ui/BomModal.tsx` | Tab wrapper, grand total footer, CSV dispatch |
| `src/ui/BomModal.test.tsx` | Tab switching, grand total, CSV buttons |
| `src/ui/buildCsv.test.ts` | Cost columns, hardware CSV, subtotal rows |

### Modify
| File | Change |
|------|--------|
| `src/scene/types.ts` | Add `MaterialDef`, `HardwareItem`; extend `Scene` |
| `src/scene/useScene.ts` | Fix all `setScene` calls to spread `...prev`; fix initial state; add `onUpdateMaterial` + `onUpdateHardware` |
| `src/scene/useFile.ts` | Bump `FILE_FORMAT_VERSION` to 2; export `parseFile`; migration defaults |
| `src/ui/buildCsv.ts` | Extend `GroupedRow`; cost params on `groupParts`/`buildCsv`; add `buildHardwareCsv` |
| `src/ui/CuttingList.tsx` | Three new props; cost columns; material popover; subtotal row |
| `src/App.tsx` | Swap `CuttingList` → `BomModal`; wire `onUpdateMaterial`, `onUpdateHardware` |

---

## Task 1: Data types

**Files:**
- Modify: `src/scene/types.ts`

- [ ] **Step 1: Add `MaterialDef` and `HardwareItem` types and extend `Scene`**

Replace the `Scene` interface and append the two new interfaces. The complete new content of `src/scene/types.ts` below — only the last 10 lines change:

```ts
export type PartId = string
export type CutId = string

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CutDef {
  id: CutId
  label: string
  face: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
  position: Vec3
  size: Vec3
  pairedCutId?: string // "{partId}:{cutId}"
}

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  material: string // "" means unspecified
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]
  visible: boolean
}

export type Part = BoardPart

export interface MaterialDef {
  costPerM2: number // cost per square metre in user's currency
}

export interface HardwareItem {
  id: string // UUID — stable across edits
  name: string
  qty: number
  unit: string // "pcs", "m", "kg", "box", etc.
  supplier: string
  partNumber: string
  unitCost: number // cost per single unit
  notes: string
  linkedPartIds: string[] // reserved for future 3D linkage
}

export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef> // keyed by material name string
  hardware: HardwareItem[]
}

export interface FaceHit {
  partId: PartId
  faceNormal: Vec3
  faceCenter: Vec3
  localFaceNormal: Vec3
  localHitPoint: Vec3
}

export interface CameraState {
  position: Vec3
  target: Vec3
}

export interface ZimmuFile {
  version: number
  name: string
  appVersion: string
  units: 'mm'
  createdAt: string
  updatedAt: string
  camera: CameraState
  scene: Scene
}
```

- [ ] **Step 2: Run typecheck to confirm the type change compiles (other files will need fixing in later tasks)**

```bash
cd /home/user/zimmu-web && pnpm typecheck 2>&1 | head -40
```

Expected: TypeScript errors in `useScene.ts`, `useFile.ts`, etc. because `Scene` now requires `materials` and `hardware`. This is correct — those files are fixed in Tasks 2 and 3.

- [ ] **Step 3: Commit**

```bash
cd /home/user/zimmu-web && git config user.email noreply@anthropic.com && git config user.name Claude
git add src/scene/types.ts
git commit -m "feat(types): add MaterialDef, HardwareItem; extend Scene with materials and hardware"
```

---

## Task 2: Scene state management

**Files:**
- Modify: `src/scene/useScene.ts`
- Modify: `src/scene/useScene.test.ts`

This task has two phases:
1. **Fix all existing `setScene` calls** to spread `...prev` (so `materials` and `hardware` are preserved).
2. **Add `onUpdateMaterial` and `onUpdateHardware`** handlers with undo/redo.

### Phase A — Fix setScene calls

- [ ] **Step 1: Write regression tests first**

Append these tests to `src/scene/useScene.test.ts` (inside the existing `describe('useScene', ...)` block, after the last `it(...)` in the file):

```ts
  it('starts with materials: {} and hardware: []', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.scene.materials).toEqual({})
    expect(result.current.scene.hardware).toEqual([])
  })

  it('onAdd preserves existing materials and hardware', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 50 })
    })
    act(() => {
      result.current.onUpdateHardware([
        {
          id: '1',
          name: 'Screw',
          qty: 10,
          unit: 'pcs',
          supplier: '',
          partNumber: '',
          unitCost: 0.5,
          notes: '',
          linkedPartIds: [],
        },
      ])
    })
    act(() => {
      result.current.onAdd()
    })
    expect(result.current.scene.materials).toEqual({ Plywood: { costPerM2: 50 } })
    expect(result.current.scene.hardware).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/scene/useScene.test.ts 2>&1 | tail -20
```

Expected: FAIL — `onUpdateMaterial is not a function` (or similar). The new tests cannot pass yet.

- [ ] **Step 3: Fix initial state**

In `src/scene/useScene.ts`, line 87, change:

```ts
  const [scene, setScene] = useState<Scene>(() => ({ parts: [makeDefaultBoard()] }))
```

to:

```ts
  const [scene, setScene] = useState<Scene>(() => ({ parts: [makeDefaultBoard()], materials: {}, hardware: [] }))
```

- [ ] **Step 4: Fix all arrow-expression-form setScene calls**

Every `setScene((prev) => ({ parts:` call must become `setScene((prev) => ({ ...prev, parts:`. Run this targeted replacement — it is safe because no other setScene calls use this exact arrow+brace pattern:

```bash
cd /home/user/zimmu-web && sed -i 's/setScene((prev) => ({ parts:/setScene((prev) => ({ ...prev, parts:/g' src/scene/useScene.ts
```

Verify the change count — there should be approximately 24 replacements:

```bash
grep -c '\.\.\.prev, parts:' src/scene/useScene.ts
```

Expected: 24 (or close — the exact count includes all the undo/redo closures).

- [ ] **Step 5: Fix block-form setScene calls**

There are three block-form setScene callbacks that `return { parts }` without spreading `...prev`. Find them:

```bash
grep -n 'return { parts' src/scene/useScene.ts
```

Expected output (approximately):
```
296:            return { parts }
334:        return { parts }
348:          return { parts }
```

For each of these, change `return { parts }` to `return { ...prev, parts }`. The three locations are in:
- `onRemove` undo handler (splice back removed part)
- `onDuplicate` body (insert clone after original)
- `onDuplicate` redo handler (same pattern)

Make the edits. Use the Edit tool with enough surrounding context to be unique. Example for the `onRemove` undo block:

```ts
// Before (onRemove undo):
          setScene((prev) => {
            const parts = [...prev.parts]
            parts.splice(index, 0, part)
            return { parts }
          })

// After:
          setScene((prev) => {
            const parts = [...prev.parts]
            parts.splice(index, 0, part)
            return { ...prev, parts }
          })
```

```ts
// Before (onDuplicate body, first block):
      setScene((prev) => {
        const idx = prev.parts.findIndex((p) => p.id === id)
        if (idx === -1) return prev
        const parts = [...prev.parts]
        parts.splice(idx + 1, 0, clone)
        return { parts }
      })

// After:
      setScene((prev) => {
        const idx = prev.parts.findIndex((p) => p.id === id)
        if (idx === -1) return prev
        const parts = [...prev.parts]
        parts.splice(idx + 1, 0, clone)
        return { ...prev, parts }
      })
```

```ts
// Before (onDuplicate redo block):
          setScene((prev) => {
            const idx = prev.parts.findIndex((p) => p.id === id)
            if (idx === -1) return prev
            const parts = [...prev.parts]
            parts.splice(idx + 1, 0, clone)
            return { parts }
          })

// After:
          setScene((prev) => {
            const idx = prev.parts.findIndex((p) => p.id === id)
            if (idx === -1) return prev
            const parts = [...prev.parts]
            parts.splice(idx + 1, 0, clone)
            return { ...prev, parts }
          })
```

Verify no remaining bare `return { parts }`:

```bash
grep -n 'return { parts }' src/scene/useScene.ts
```

Expected: no output (zero matches).

### Phase B — Add new handlers

- [ ] **Step 6: Write tests for onUpdateMaterial and onUpdateHardware**

Append to `src/scene/useScene.test.ts` (inside the `describe` block):

```ts
  it('onUpdateMaterial sets a material rate on the scene', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 40 })
    })
    expect(result.current.scene.materials).toEqual({ Plywood: { costPerM2: 40 } })
  })

  it('onUpdateMaterial undo restores previous materials', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 40 })
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.materials).toEqual({})
  })

  it('onUpdateMaterial redo reapplies rate after undo', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 40 })
    })
    act(() => {
      result.current.undo()
    })
    act(() => {
      result.current.redo()
    })
    expect(result.current.scene.materials).toEqual({ Plywood: { costPerM2: 40 } })
  })

  it('onUpdateMaterial coalesces rapid calls into one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 10 })
    })
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 20 })
    })
    act(() => {
      result.current.onUpdateMaterial('Plywood', { costPerM2: 30 })
    })
    // Three calls coalesce into one undo entry
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.materials).toEqual({})
  })

  it('onUpdateHardware sets hardware items', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const items = [
      {
        id: 'h1',
        name: 'Hinge',
        qty: 4,
        unit: 'pcs',
        supplier: 'Ace',
        partNumber: 'H-100',
        unitCost: 2.5,
        notes: '',
        linkedPartIds: [],
      },
    ]
    act(() => {
      result.current.onUpdateHardware(items)
    })
    expect(result.current.scene.hardware).toEqual(items)
  })

  it('onUpdateHardware undo restores previous hardware', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const items = [
      {
        id: 'h1',
        name: 'Hinge',
        qty: 4,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: 2.5,
        notes: '',
        linkedPartIds: [],
      },
    ]
    act(() => {
      result.current.onUpdateHardware(items)
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.hardware).toEqual([])
  })
```

- [ ] **Step 7: Run tests to verify new tests fail (old tests should pass now)**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/scene/useScene.test.ts 2>&1 | tail -20
```

Expected: the new `onUpdateMaterial`/`onUpdateHardware` tests FAIL (function undefined), the regression and initial-state tests PASS.

- [ ] **Step 8: Add `onUpdateMaterial` and `onUpdateHardware` to `UseSceneResult`**

In `src/scene/useScene.ts`, locate the `UseSceneResult` interface (around line 58). Add two new function signatures after `onUpdate`:

```ts
  onUpdateMaterial: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
```

Also add `MaterialDef` and `HardwareItem` to the import at the top of the file. Change:

```ts
import type { BoardPart, Part, PartId, Scene, CutDef, CutId } from './types'
```

to:

```ts
import type { BoardPart, HardwareItem, MaterialDef, Part, PartId, Scene, CutDef, CutId } from './types'
```

- [ ] **Step 9: Implement `onUpdateMaterial` and `onUpdateHardware`**

In `src/scene/useScene.ts`, add these two handlers after the `onSelect` callback (around line 683, before `replaceScene`):

```ts
  const onUpdateMaterial = useCallback(
    (name: string, def: MaterialDef) => {
      const beforeMaterials = sceneRef.current.materials
      setScene((prev) => ({ ...prev, materials: { ...prev.materials, [name]: def } }))
      push({
        label: `Set ${name} cost`,
        coalesceKey: `material:${name}`,
        undo: () => setScene((prev) => ({ ...prev, materials: beforeMaterials })),
        redo: () =>
          setScene((prev) => ({ ...prev, materials: { ...prev.materials, [name]: def } })),
      })
    },
    [push],
  )

  const onUpdateHardware = useCallback(
    (items: HardwareItem[]) => {
      const beforeHardware = sceneRef.current.hardware
      setScene((prev) => ({ ...prev, hardware: items }))
      push({
        label: 'Edit hardware',
        undo: () => setScene((prev) => ({ ...prev, hardware: beforeHardware })),
        redo: () => setScene((prev) => ({ ...prev, hardware: items })),
      })
    },
    [push],
  )
```

- [ ] **Step 10: Add to the return object**

In the `return { ... }` block at the end of `useScene`, add:

```ts
    onUpdateMaterial,
    onUpdateHardware,
```

- [ ] **Step 11: Run tests — all should pass**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/scene/useScene.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 12: Run typecheck**

```bash
cd /home/user/zimmu-web && pnpm typecheck 2>&1 | grep -v 'node_modules' | head -30
```

Expected: errors only in `useFile.ts` and `App.tsx` (fixed in later tasks).

- [ ] **Step 13: Commit**

```bash
cd /home/user/zimmu-web && git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(scene): spread ...prev in all setScene calls; add onUpdateMaterial and onUpdateHardware"
```

---

## Task 3: File format migration

**Files:**
- Modify: `src/scene/useFile.ts`

- [ ] **Step 1: Bump `FILE_FORMAT_VERSION` and export `parseFile`**

In `src/scene/useFile.ts`:

1. Change line 5:
```ts
export const FILE_FORMAT_VERSION = 1
```
to:
```ts
export const FILE_FORMAT_VERSION = 2
```

2. Add `export` keyword to `parseFile` (line 36):
```ts
function parseFile(text: string): ZimmuFile {
```
becomes:
```ts
export function parseFile(text: string): ZimmuFile {
```

3. In `parseFile`, replace the return statement so it fills in migration defaults:

```ts
  // Before:
  return {
    ...raw,
    scene: {
      parts: parts.map((p) => ({
        ...p,
        cuts: p.cuts ?? [],
        visible: p.visible ?? true,
        material: p.material ?? '',
      })),
    },
  }
```

```ts
  // After:
  return {
    ...raw,
    scene: {
      parts: parts.map((p) => ({
        ...p,
        cuts: p.cuts ?? [],
        visible: p.visible ?? true,
        material: p.material ?? '',
      })),
      materials: (raw.scene as { materials?: Record<string, { costPerM2: number }> }).materials ?? {},
      hardware: (raw.scene as { hardware?: unknown[] }).hardware ?? [],
    },
  }
```

Note: The casts are needed because `raw` is typed as `ZimmuFile` (version 2 type) but old v1 files won't have those fields. The `as` casts narrow to optional at the parse boundary only.

4. Fix the `newFile` function — it hardcodes `scene: { parts: [] }`. Change:

```ts
    const envelope: ZimmuFile = {
      version: FILE_FORMAT_VERSION,
      name: 'Untitled',
      appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0',
      units: 'mm',
      createdAt: now,
      updatedAt: now,
      camera: getCameraStateRef.current(),
      scene: { parts: [] },
    }
```

to:

```ts
    const envelope: ZimmuFile = {
      version: FILE_FORMAT_VERSION,
      name: 'Untitled',
      appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0',
      units: 'mm',
      createdAt: now,
      updatedAt: now,
      camera: getCameraStateRef.current(),
      scene: { parts: [], materials: {}, hardware: [] },
    }
```

5. Fix the `lastSavedSceneRef` initialization in `newFile`:

```ts
    lastSavedSceneRef.current = JSON.stringify({ parts: [] })
```

becomes:

```ts
    lastSavedSceneRef.current = JSON.stringify({ parts: [], materials: {}, hardware: [] })
```

- [ ] **Step 2: Run typecheck**

```bash
cd /home/user/zimmu-web && pnpm typecheck 2>&1 | grep -v 'node_modules' | head -30
```

Expected: errors only in `App.tsx` (fixed in Task 9). `useFile.ts` and `useScene.ts` should be clean.

- [ ] **Step 3: Run tests**

```bash
cd /home/user/zimmu-web && pnpm test 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/user/zimmu-web && git add src/scene/useFile.ts
git commit -m "feat(file): bump format version to 2; migrate v1 files with materials/hardware defaults"
```

---

## Task 4: CSV export — cost columns and hardware CSV

**Files:**
- Modify: `src/ui/buildCsv.ts`
- Create: `src/ui/buildCsv.test.ts`

- [ ] **Step 1: Write failing tests in `src/ui/buildCsv.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/buildCsv.test.ts 2>&1 | tail -20
```

Expected: FAIL — `buildHardwareCsv is not exported`, `groupParts` missing `materials` param, etc.

- [ ] **Step 3: Rewrite `src/ui/buildCsv.ts`**

```ts
import type { HardwareItem, MaterialDef, Part } from '../scene/types'

export interface GroupedRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string
  length: number
  width: number
  thickness: number
  cuts: number
  costPerUnit: number | null // null = no rate set for this material
  totalCost: number | null   // null = no rate set; equals costPerUnit * qty
}

export function groupParts(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): GroupedRow[] {
  const order: string[] = []
  const map = new Map<string, GroupedRow>()

  for (const p of parts) {
    if (p.kind !== 'board') continue
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}|${p.color}`
    const rate = materials[p.material]
    const costPerUnit =
      rate !== undefined ? (p.length * p.width) / 1_000_000 * rate.costPerM2 : null
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.cuts += p.cuts.length
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
        length: p.length,
        width: p.width,
        thickness: p.thickness,
        cuts: p.cuts.length,
        costPerUnit,
        totalCost: costPerUnit,
      })
    }
  }

  return order.map((k) => map.get(k)!)
}

function quoteField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCsv(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): string {
  const header = 'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts,Cost/unit,Total'
  const rows = groupParts(parts, materials)
  const dataRows = rows.map((row) => {
    const costStr = row.costPerUnit !== null ? row.costPerUnit.toFixed(2) : ''
    const totalStr = row.totalCost !== null ? row.totalCost.toFixed(2) : ''
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.cuts},${costStr},${totalStr}`
  })

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  if (!anyHasCost) return [header, ...dataRows].join('\n')

  const boardTotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const subtotalRow = `,,,,,,,,Board total,${boardTotal.toFixed(2)}`
  return [header, ...dataRows, subtotalRow].join('\n')
}

export function buildHardwareCsv(items: HardwareItem[]): string {
  const header = 'Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes'
  if (items.length === 0) return header

  const dataRows = items.map((item) => {
    const total = item.qty * item.unitCost
    return `${quoteField(item.name)},${item.qty},${quoteField(item.unit)},${quoteField(item.supplier)},${quoteField(item.partNumber)},${item.unitCost.toFixed(2)},${total.toFixed(2)},${quoteField(item.notes)}`
  })

  const hardwareTotal = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const totalRow = `,,,,Hardware total,${hardwareTotal.toFixed(2)},`
  return [header, ...dataRows, totalRow].join('\n')
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/buildCsv.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd /home/user/zimmu-web && pnpm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/user/zimmu-web && git add src/ui/buildCsv.ts src/ui/buildCsv.test.ts
git commit -m "feat(csv): add cost columns to board CSV; add buildHardwareCsv"
```

---

## Task 5: CuttingList — cost columns and material rate popover

**Files:**
- Modify: `src/ui/CuttingList.tsx`

This task adds cost columns to the board table, a clickable popover on material cells to enter `$/m²`, and a subtotal row. The full file is replaced — surgical changes would be too fragmented across 117 lines.

- [ ] **Step 1: Replace `src/ui/CuttingList.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { MaterialDef, Part } from '../scene/types'
import { buildCsv, groupParts } from './buildCsv'
import { Button } from '@/components/ui/button'

interface MaterialPopoverProps {
  name: string
  current: number | undefined
  onSave: (def: MaterialDef) => void
  onClose: () => void
}

function MaterialPopover({ name, current, onSave, onClose }: MaterialPopoverProps) {
  const [value, setValue] = useState(current !== undefined ? String(current) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) onSave({ costPerM2: num })
    else onClose()
  }

  return (
    <div
      className="absolute z-10 top-full left-0 mt-1 bg-card border border-border rounded shadow-lg p-2 flex items-center gap-1.5 text-xs"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground whitespace-nowrap">$/m²</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onClose()
        }}
        className="w-20 bg-background border border-border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

interface CuttingListProps {
  parts: Part[]
  projectName: string
  onClose: () => void
  materials?: Record<string, MaterialDef>
  onMaterialCostChange?: (name: string, def: MaterialDef) => void
  hideExportButtons?: boolean
}

export function CuttingList({
  parts,
  projectName,
  onClose,
  materials = {},
  onMaterialCostChange,
  hideExportButtons = false,
}: CuttingListProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (openPopover === null) return
    const handler = () => setOpenPopover(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [openPopover])

  const csv = buildCsv(parts, materials)
  const rows = groupParts(parts, materials)

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(csv)
  }

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)

  return (
    <div
      data-testid="cl-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 min-w-[680px] max-w-[900px] max-h-[80vh] overflow-auto shadow-2xl text-foreground text-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground/90 m-0">Cutting List</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground h-6 w-6"
          >
            ×
          </Button>
        </div>

        <table className="w-full border-collapse mb-4">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-2 font-medium text-xs">Qty</th>
              <th className="pb-2 px-2 font-medium text-xs">Labels</th>
              <th className="pb-2 px-2 font-medium text-xs">Material</th>
              <th className="pb-2 px-2 font-medium text-xs">Color</th>
              <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
              <th className="pb-2 px-2 font-medium text-xs">Width (mm)</th>
              <th className="pb-2 px-2 font-medium text-xs">Thickness (mm)</th>
              <th className="pb-2 px-2 font-medium text-xs">Cuts</th>
              <th className="pb-2 px-2 font-medium text-xs">Cost/unit</th>
              <th className="pb-2 px-2 font-medium text-xs">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-3 text-muted-foreground text-center text-xs">
                  No parts
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
                            setOpenPopover(openPopover === row.material ? null : row.material)
                          }}
                          className="underline decoration-dotted cursor-pointer hover:text-foreground text-xs"
                          title="Click to set $/m² rate"
                        >
                          {row.material}
                        </button>
                        {openPopover === row.material && onMaterialCostChange && (
                          <MaterialPopover
                            name={row.material}
                            current={materials[row.material]?.costPerM2}
                            onSave={(def) => {
                              onMaterialCostChange(row.material, def)
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
                  <td className="py-1.5 px-2 text-xs">{row.length}</td>
                  <td className="py-1.5 px-2 text-xs">{row.width}</td>
                  <td className="py-1.5 px-2 text-xs">{row.thickness}</td>
                  <td className="py-1.5 px-2 text-xs">{row.cuts}</td>
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
                <td colSpan={9} className="pt-2 pr-2 text-xs text-right text-muted-foreground">
                  Board total
                </td>
                <td className="pt-2 px-2 text-xs">${boardSubtotal.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {!hideExportButtons && (
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              Copy CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              Download .csv
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /home/user/zimmu-web && pnpm typecheck 2>&1 | grep -v 'node_modules' | head -20
```

Expected: only `App.tsx` errors remain (fixed in Task 9).

- [ ] **Step 3: Run tests**

```bash
cd /home/user/zimmu-web && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/user/zimmu-web && git add src/ui/CuttingList.tsx
git commit -m "feat(ui): add cost columns and material rate popover to CuttingList"
```

---

## Task 6: HardwareEditPanel

**Files:**
- Create: `src/ui/HardwareEditPanel.tsx`
- Create: `src/ui/HardwareEditPanel.test.tsx`

- [ ] **Step 1: Write failing tests in `src/ui/HardwareEditPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HardwareEditPanel } from './HardwareEditPanel'
import type { HardwareItem } from '../scene/types'

const item: HardwareItem = {
  id: 'h1',
  name: 'Hinge',
  qty: 4,
  unit: 'pcs',
  supplier: 'Ace',
  partNumber: 'H-100',
  unitCost: 2.5,
  notes: 'soft-close',
  linkedPartIds: [],
}

describe('HardwareEditPanel', () => {
  it('renders all field values from the item', () => {
    render(
      <HardwareEditPanel
        item={item}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Hinge')).toBeInTheDocument()
    expect(screen.getByDisplayValue('4')).toBeInTheDocument()
    expect(screen.getByDisplayValue('pcs')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Ace')).toBeInTheDocument()
    expect(screen.getByDisplayValue('H-100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2.5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('soft-close')).toBeInTheDocument()
  })

  it('calls onSave with updated item when Save is clicked', () => {
    const onSave = vi.fn()
    render(
      <HardwareEditPanel item={item} onSave={onSave} onCancel={vi.fn()} onDelete={vi.fn()} />,
    )
    fireEvent.change(screen.getByDisplayValue('Hinge'), { target: { value: 'Butt Hinge' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Butt Hinge' }))
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <HardwareEditPanel item={item} onSave={vi.fn()} onCancel={onCancel} onDelete={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows Delete confirmation after clicking Delete', () => {
    render(
      <HardwareEditPanel item={item} onSave={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })

  it('calls onDelete after confirming deletion', () => {
    const onDelete = vi.fn()
    render(
      <HardwareEditPanel item={item} onSave={vi.fn()} onCancel={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onDelete).toHaveBeenCalledWith('h1')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/HardwareEditPanel.test.tsx 2>&1 | tail -10
```

Expected: FAIL — cannot find module `./HardwareEditPanel`.

- [ ] **Step 3: Create `src/ui/HardwareEditPanel.tsx`**

```tsx
import { useState } from 'react'
import type { HardwareItem } from '../scene/types'
import { Button } from '@/components/ui/button'

interface HardwareEditPanelProps {
  item: HardwareItem
  onSave: (item: HardwareItem) => void
  onCancel: () => void
  onDelete: (id: string) => void
}

export function HardwareEditPanel({ item, onSave, onCancel, onDelete }: HardwareEditPanelProps) {
  const [draft, setDraft] = useState<HardwareItem>(item)
  const [confirming, setConfirming] = useState(false)

  const field = <K extends keyof HardwareItem>(key: K, value: HardwareItem[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="flex flex-col gap-3 p-4 border-l border-border bg-card min-w-[280px] text-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => field('name', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Item name"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Qty</label>
          <input
            type="number"
            min={1}
            value={draft.qty}
            onChange={(e) => field('qty', Math.max(1, parseInt(e.target.value) || 1))}
            className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Unit</label>
          <input
            type="text"
            list="hw-units"
            value={draft.unit}
            onChange={(e) => field('unit', e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <datalist id="hw-units">
            <option value="pcs" />
            <option value="m" />
            <option value="kg" />
            <option value="box" />
            <option value="set" />
            <option value="pair" />
          </datalist>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Supplier</label>
        <input
          type="text"
          value={draft.supplier}
          onChange={(e) => field('supplier', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Part #</label>
        <input
          type="text"
          value={draft.partNumber}
          onChange={(e) => field('partNumber', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Unit cost</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft.unitCost}
          onChange={(e) => field('unitCost', Math.max(0, parseFloat(e.target.value) || 0))}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Notes</label>
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => field('notes', e.target.value)}
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border mt-auto">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave(draft)}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-destructive">Delete?</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirming(false)
                onDelete(item.id)
              }}
            >
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/HardwareEditPanel.test.tsx 2>&1 | tail -10
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/user/zimmu-web && git add src/ui/HardwareEditPanel.tsx src/ui/HardwareEditPanel.test.tsx
git commit -m "feat(ui): add HardwareEditPanel with 7-field form, save/cancel/delete"
```

---

## Task 7: HardwareTab

**Files:**
- Create: `src/ui/HardwareTab.tsx`
- Create: `src/ui/HardwareTab.test.tsx`

- [ ] **Step 1: Write failing tests in `src/ui/HardwareTab.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HardwareTab } from './HardwareTab'
import type { HardwareItem } from '../scene/types'

const items: HardwareItem[] = [
  {
    id: 'h1',
    name: 'Hinge',
    qty: 4,
    unit: 'pcs',
    supplier: 'Ace',
    partNumber: 'H-100',
    unitCost: 2.5,
    notes: '',
    linkedPartIds: [],
  },
]

describe('HardwareTab', () => {
  it('shows empty state when no items', () => {
    render(<HardwareTab hardware={[]} onUpdateHardware={vi.fn()} />)
    expect(screen.getByText(/no hardware items yet/i)).toBeInTheDocument()
  })

  it('renders item rows in the table', () => {
    render(<HardwareTab hardware={items} onUpdateHardware={vi.fn()} />)
    expect(screen.getByText('Hinge')).toBeInTheDocument()
  })

  it('Add item button creates a blank item and opens the edit panel', () => {
    render(<HardwareTab hardware={[]} onUpdateHardware={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    // Panel opens — Save button visible
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('clicking a row opens the edit panel with that item', () => {
    render(<HardwareTab hardware={items} onUpdateHardware={vi.fn()} />)
    fireEvent.click(screen.getByText('Hinge'))
    expect(screen.getByDisplayValue('Hinge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('saving a new blank item calls onUpdateHardware with one item', () => {
    const onUpdateHardware = vi.fn()
    render(<HardwareTab hardware={[]} onUpdateHardware={onUpdateHardware} />)
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onUpdateHardware).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ unit: 'pcs' })]))
  })

  it('deleting an item calls onUpdateHardware with empty list', () => {
    const onUpdateHardware = vi.fn()
    render(<HardwareTab hardware={items} onUpdateHardware={onUpdateHardware} />)
    fireEvent.click(screen.getByText('Hinge'))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onUpdateHardware).toHaveBeenCalledWith([])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/HardwareTab.test.tsx 2>&1 | tail -10
```

Expected: FAIL — cannot find module `./HardwareTab`.

- [ ] **Step 3: Create `src/ui/HardwareTab.tsx`**

```tsx
import { useState } from 'react'
import type { HardwareItem } from '../scene/types'
import { HardwareEditPanel } from './HardwareEditPanel'
import { Button } from '@/components/ui/button'

interface HardwareTabProps {
  hardware: HardwareItem[]
  onUpdateHardware: (items: HardwareItem[]) => void
}

function makeBlankItem(): HardwareItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    qty: 1,
    unit: 'pcs',
    supplier: '',
    partNumber: '',
    unitCost: 0,
    notes: '',
    linkedPartIds: [],
  }
}

export function HardwareTab({ hardware, onUpdateHardware }: HardwareTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingItem, setPendingItem] = useState<HardwareItem | null>(null)

  // The item currently being edited: pending (new, unsaved) or existing
  const editingItem =
    pendingItem ?? (selectedId ? hardware.find((h) => h.id === selectedId) ?? null : null)

  const handleAddItem = () => {
    const blank = makeBlankItem()
    setPendingItem(blank)
    setSelectedId(null)
  }

  const handleSave = (saved: HardwareItem) => {
    if (pendingItem) {
      onUpdateHardware([...hardware, saved])
      setPendingItem(null)
      setSelectedId(saved.id)
    } else {
      onUpdateHardware(hardware.map((h) => (h.id === saved.id ? saved : h)))
    }
  }

  const handleCancel = () => {
    setPendingItem(null)
    setSelectedId(null)
  }

  const handleDelete = (id: string) => {
    onUpdateHardware(hardware.filter((h) => h.id !== id))
    setPendingItem(null)
    setSelectedId(null)
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-2 font-medium text-xs">Name</th>
              <th className="pb-2 px-2 font-medium text-xs">Qty</th>
              <th className="pb-2 px-2 font-medium text-xs">Unit</th>
              <th className="pb-2 px-2 font-medium text-xs">Supplier</th>
              <th className="pb-2 px-2 font-medium text-xs">Part #</th>
              <th className="pb-2 px-2 font-medium text-xs">Unit cost</th>
              <th className="pb-2 px-2 font-medium text-xs">Total</th>
              <th className="pb-2 px-2 font-medium text-xs">Notes</th>
            </tr>
          </thead>
          <tbody>
            {hardware.length === 0 && !pendingItem ? (
              <tr>
                <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
                  No hardware items yet. Click 'Add item' to begin.
                </td>
              </tr>
            ) : (
              hardware.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setPendingItem(null)
                    setSelectedId(item.id)
                  }}
                  className={`border-b border-border/30 cursor-pointer hover:bg-muted/30 ${selectedId === item.id ? 'bg-muted/50' : ''}`}
                >
                  <td className="py-1.5 pr-2 text-xs">{item.name || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{item.qty}</td>
                  <td className="py-1.5 px-2 text-xs">{item.unit}</td>
                  <td className="py-1.5 px-2 text-xs">{item.supplier || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{item.partNumber || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">${item.unitCost.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-xs">${(item.qty * item.unitCost).toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-xs">{item.notes || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={handleAddItem}>
            Add item
          </Button>
        </div>
      </div>

      {editingItem && (
        <HardwareEditPanel
          item={editingItem}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/HardwareTab.test.tsx 2>&1 | tail -10
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/user/zimmu-web && git add src/ui/HardwareTab.tsx src/ui/HardwareTab.test.tsx
git commit -m "feat(ui): add HardwareTab with item table and edit panel"
```

---

## Task 8: BomModal

**Files:**
- Create: `src/ui/BomModal.tsx`
- Create: `src/ui/BomModal.test.tsx`

- [ ] **Step 1: Write failing tests in `src/ui/BomModal.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BomModal } from './BomModal'
import type { HardwareItem, MaterialDef, Part } from '../scene/types'

const parts: Part[] = [
  {
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
  },
]

const materials: Record<string, MaterialDef> = { Plywood: { costPerM2: 100 } }

const hardware: HardwareItem[] = [
  {
    id: 'h1',
    name: 'Hinge',
    qty: 4,
    unit: 'pcs',
    supplier: '',
    partNumber: '',
    unitCost: 2.5,
    notes: '',
    linkedPartIds: [],
  },
]

const baseProps = {
  parts,
  materials,
  hardware,
  projectName: 'Test',
  onClose: vi.fn(),
  onMaterialCostChange: vi.fn(),
  onUpdateHardware: vi.fn(),
}

describe('BomModal', () => {
  it('renders with Boards tab active by default', () => {
    render(<BomModal {...baseProps} />)
    expect(screen.getByRole('tab', { name: /boards/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows CuttingList table in Boards tab', () => {
    render(<BomModal {...baseProps} />)
    expect(screen.getByTestId('cl-panel')).toBeInTheDocument()
  })

  it('switches to Hardware tab on click', () => {
    render(<BomModal {...baseProps} />)
    fireEvent.click(screen.getByRole('tab', { name: /hardware/i }))
    expect(screen.getByRole('tab', { name: /hardware/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/no hardware items yet|Hinge/)).toBeInTheDocument()
  })

  it('grand total footer is always visible', () => {
    render(<BomModal {...baseProps} />)
    expect(screen.getByTestId('bom-grand-total')).toBeInTheDocument()
  })

  it('grand total includes board and hardware costs', () => {
    render(<BomModal {...baseProps} />)
    // Board: 600×300mm × $100/m² = $18.00
    // Hardware: 4 × $2.50 = $10.00
    // Grand total: $28.00
    expect(screen.getByTestId('bom-grand-total')).toHaveTextContent('28.00')
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<BomModal {...baseProps} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/BomModal.test.tsx 2>&1 | tail -10
```

Expected: FAIL — cannot find module `./BomModal`.

- [ ] **Step 3: Create `src/ui/BomModal.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { HardwareItem, MaterialDef, Part } from '../scene/types'
import { CuttingList } from './CuttingList'
import { HardwareTab } from './HardwareTab'
import { groupParts } from './buildCsv'
import { buildCsv, buildHardwareCsv } from './buildCsv'
import { downloadBlob } from './download'
import { Button } from '@/components/ui/button'

type Tab = 'boards' | 'hardware'

interface BomModalProps {
  parts: Part[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  projectName: string
  onClose: () => void
  onMaterialCostChange: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
}

export function BomModal({
  parts,
  materials,
  hardware,
  projectName,
  onClose,
  onMaterialCostChange,
  onUpdateHardware,
}: BomModalProps) {
  const [tab, setTab] = useState<Tab>('boards')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const rows = groupParts(parts, materials)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const hardwareSubtotal = hardware.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const grandTotal = boardSubtotal + hardwareSubtotal

  const handleCopy = () => {
    const csv = tab === 'boards' ? buildCsv(parts, materials) : buildHardwareCsv(hardware)
    void navigator.clipboard.writeText(csv)
  }

  const handleDownload = () => {
    if (tab === 'boards') {
      const csv = buildCsv(parts, materials)
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `${projectName}-boards.csv`, 'text/csv')
    } else {
      const csv = buildHardwareCsv(hardware)
      downloadBlob(
        new Blob([csv], { type: 'text/csv' }),
        `${projectName}-hardware.csv`,
        'text/csv',
      )
    }
  }

  return (
    <div
      data-testid="bom-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="bom-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg flex flex-col min-w-[700px] max-w-[960px] w-[90vw] max-h-[85vh] shadow-2xl text-foreground text-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground/90">Bill of Materials</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground h-6 w-6"
          >
            ×
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border px-6">
          {(['boards', 'hardware'] as const).map((t) => (
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
              {t === 'boards' ? 'Boards' : 'Hardware'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {tab === 'boards' ? (
            // Render CuttingList in embedded mode (no outer overlay, no ESC handler, no export buttons)
            <div data-testid="cl-panel">
              <CuttingList
                parts={parts}
                projectName={projectName}
                onClose={onClose}
                materials={materials}
                onMaterialCostChange={onMaterialCostChange}
                hideExportButtons
              />
            </div>
          ) : (
            <HardwareTab hardware={hardware} onUpdateHardware={onUpdateHardware} />
          )}
        </div>

        {/* Footer */}
        <div
          data-testid="bom-grand-total"
          className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20"
        >
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Boards: <span className="text-foreground">${boardSubtotal.toFixed(2)}</span>
            </span>
            <span className="text-border">|</span>
            <span>
              Hardware: <span className="text-foreground">${hardwareSubtotal.toFixed(2)}</span>
            </span>
            <span className="text-border">|</span>
            <span className="font-medium text-foreground">
              Grand total: ${grandTotal.toFixed(2)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              Copy CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              Download .csv
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Important note on the Boards tab rendering:** The `CuttingList` component wraps content in a full-screen overlay div (`data-testid="cl-overlay"`). When embedded inside `BomModal`, that overlay is nested inside the BomModal panel, which means it renders inside the panel (not covering the screen) because the BomModal panel already has `onClick={stopPropagation}`. However, the `cl-overlay` inner `onClick={onClose}` handler would still fire when clicking in the blank area of the boards tab — meaning clicks in the padding area of the CuttingList close the entire BomModal.

A cleaner fix: wrap the CuttingList in a div that intercepts the `cl-overlay` click propagation OR render the CuttingList's table content directly in BomModal. Since the spec says "isolated new pieces" and "CuttingList logic preserved untouched", the simplest is to pass a no-op `onClose` when embedded and suppress the overlay rendering by checking if `hideExportButtons` means "embedded mode":

In `CuttingList.tsx`, when `hideExportButtons` is true, skip rendering the outer overlay div and return just the inner table directly. Update the Step 1 CuttingList implementation: when `hideExportButtons` is true, don't render the `cl-overlay` wrapper div, just return the inner table and popover directly.

Revise the CuttingList return statement to support embedded mode:

```tsx
  // When embedded (hideExportButtons=true), skip the full-screen overlay
  if (hideExportButtons) {
    return (
      <div data-testid="cl-panel">
        <table className="w-full border-collapse mb-4">
          {/* ... same thead/tbody as standalone mode ... */}
        </table>
      </div>
    )
  }

  return (
    <div data-testid="cl-overlay" onClick={onClose} ...>
      <div data-testid="cl-panel" ...>
        {/* ... */}
      </div>
    </div>
  )
```

Go back to `src/ui/CuttingList.tsx` and refactor to avoid duplicating the table — extract the table into a shared inner component or use a conditional wrapper. The cleanest approach: use a conditional wrapper element.

Revise `src/ui/CuttingList.tsx` so that when `hideExportButtons` is true, the component renders only the table (no full-screen overlay, no close button, no header). The full revised content:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { MaterialDef, Part } from '../scene/types'
import { buildCsv, groupParts } from './buildCsv'
import { Button } from '@/components/ui/button'

interface MaterialPopoverProps {
  name: string
  current: number | undefined
  onSave: (def: MaterialDef) => void
  onClose: () => void
}

function MaterialPopover({ name, current, onSave, onClose }: MaterialPopoverProps) {
  const [value, setValue] = useState(current !== undefined ? String(current) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) onSave({ costPerM2: num })
    else onClose()
  }

  return (
    <div
      className="absolute z-10 top-full left-0 mt-1 bg-card border border-border rounded shadow-lg p-2 flex items-center gap-1.5 text-xs"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground whitespace-nowrap">$/m²</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onClose()
        }}
        className="w-20 bg-background border border-border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

interface CuttingListProps {
  parts: Part[]
  projectName: string
  onClose: () => void
  materials?: Record<string, MaterialDef>
  onMaterialCostChange?: (name: string, def: MaterialDef) => void
  hideExportButtons?: boolean
}

export function CuttingList({
  parts,
  projectName,
  onClose,
  materials = {},
  onMaterialCostChange,
  hideExportButtons = false,
}: CuttingListProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null)

  useEffect(() => {
    if (hideExportButtons) return // ESC handled by BomModal when embedded
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, hideExportButtons])

  useEffect(() => {
    if (openPopover === null) return
    const handler = () => setOpenPopover(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [openPopover])

  const csv = buildCsv(parts, materials)
  const rows = groupParts(parts, materials)

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(csv)
  }

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)

  const table = (
    <table className="w-full border-collapse mb-4">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="pb-2 pr-2 font-medium text-xs">Qty</th>
          <th className="pb-2 px-2 font-medium text-xs">Labels</th>
          <th className="pb-2 px-2 font-medium text-xs">Material</th>
          <th className="pb-2 px-2 font-medium text-xs">Color</th>
          <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Width (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Thickness (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Cuts</th>
          <th className="pb-2 px-2 font-medium text-xs">Cost/unit</th>
          <th className="pb-2 px-2 font-medium text-xs">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={10} className="py-3 text-muted-foreground text-center text-xs">
              No parts
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
                        setOpenPopover(openPopover === row.material ? null : row.material)
                      }}
                      className="underline decoration-dotted cursor-pointer hover:text-foreground text-xs"
                      title="Click to set $/m² rate"
                    >
                      {row.material}
                    </button>
                    {openPopover === row.material && onMaterialCostChange && (
                      <MaterialPopover
                        name={row.material}
                        current={materials[row.material]?.costPerM2}
                        onSave={(def) => {
                          onMaterialCostChange(row.material, def)
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
              <td className="py-1.5 px-2 text-xs">{row.length}</td>
              <td className="py-1.5 px-2 text-xs">{row.width}</td>
              <td className="py-1.5 px-2 text-xs">{row.thickness}</td>
              <td className="py-1.5 px-2 text-xs">{row.cuts}</td>
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
            <td colSpan={9} className="pt-2 pr-2 text-xs text-right text-muted-foreground">
              Board total
            </td>
            <td className="pt-2 px-2 text-xs">${boardSubtotal.toFixed(2)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )

  // Embedded mode: just the table, no overlay, no header, no export buttons
  if (hideExportButtons) {
    return <div data-testid="cl-panel">{table}</div>
  }

  // Standalone mode: full-screen modal
  return (
    <div
      data-testid="cl-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 min-w-[680px] max-w-[900px] max-h-[80vh] overflow-auto shadow-2xl text-foreground text-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground/90 m-0">Cutting List</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground h-6 w-6"
          >
            ×
          </Button>
        </div>
        {table}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            Copy CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            Download .csv
          </Button>
        </div>
      </div>
    </div>
  )
}
```

**Update Task 5** to use this revised implementation — this is the definitive version. (The version in Task 5 Step 1 is superseded by this one.)

- [ ] **Step 4: Update `src/ui/CuttingList.tsx`**

Replace the file with the revised version from Step 3 above (the `if (hideExportButtons)` conditional-rendering version). This is the complete CuttingList implementation going forward.

- [ ] **Step 5: Update `src/ui/BomModal.tsx` — remove the extra `data-testid="cl-panel"` wrapper div**

In BomModal, the Boards tab section in Step 3 renders:
```tsx
<div data-testid="cl-panel">
  <CuttingList ... hideExportButtons />
</div>
```

Remove the outer `<div data-testid="cl-panel">` wrapper since CuttingList itself renders `data-testid="cl-panel"` when `hideExportButtons` is true:

```tsx
<CuttingList
  parts={parts}
  projectName={projectName}
  onClose={onClose}
  materials={materials}
  onMaterialCostChange={onMaterialCostChange}
  hideExportButtons
/>
```

- [ ] **Step 6: Run tests — all should pass**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/ui/BomModal.test.tsx 2>&1 | tail -15
```

Expected: all 6 tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
cd /home/user/zimmu-web && pnpm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/user/zimmu-web && git add src/ui/BomModal.tsx src/ui/BomModal.test.tsx src/ui/CuttingList.tsx
git commit -m "feat(ui): add BomModal with tabs, grand total footer, and CSV export"
```

---

## Task 9: App.tsx wiring

**Files:**
- Modify: `src/App.tsx`

This is the final wiring task: swap `CuttingList` for `BomModal` and pass the new scene handlers.

- [ ] **Step 1: Update imports in `src/App.tsx`**

Remove the `CuttingList` import and add `BomModal`:

```ts
// Remove:
import { CuttingList } from './ui/CuttingList'

// Add:
import { BomModal } from './ui/BomModal'
```

- [ ] **Step 2: Destructure new handlers from `useScene()`**

In the `useScene()` destructuring block (around line 19), add:

```ts
    onUpdateMaterial,
    onUpdateHardware,
```

alongside the existing destructured values.

- [ ] **Step 3: Replace `CuttingList` with `BomModal` in the JSX**

Find:

```tsx
      {cuttingListOpen && (
        <CuttingList parts={scene.parts} projectName={projectName} onClose={closeCuttingList} />
      )}
```

Replace with:

```tsx
      {cuttingListOpen && (
        <BomModal
          parts={scene.parts}
          materials={scene.materials}
          hardware={scene.hardware}
          projectName={projectName}
          onClose={closeCuttingList}
          onMaterialCostChange={onUpdateMaterial}
          onUpdateHardware={onUpdateHardware}
        />
      )}
```

- [ ] **Step 4: Run typecheck — should be clean**

```bash
cd /home/user/zimmu-web && pnpm typecheck 2>&1 | grep -v 'node_modules'
```

Expected: zero errors.

- [ ] **Step 5: Run linter**

```bash
cd /home/user/zimmu-web && pnpm lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
cd /home/user/zimmu-web && pnpm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/user/zimmu-web && git add src/App.tsx
git commit -m "feat(app): wire BomModal with materials and hardware from scene state"
```

- [ ] **Step 8: Push branch**

```bash
cd /home/user/zimmu-web && git push -u origin claude/optimistic-cori-FltT4
```

---

## Implementation Notes

Create `docs/superpowers/notes/2026-06-07-enhanced-cutting-list-bom-notes.md` after completing all tasks to record any decisions that deviated from this plan or non-obvious findings during implementation.

Key invariants to preserve:
- **`replaceScene(next: Scene)`** in `useScene.ts` takes a *complete* scene (including `materials`/`hardware`). When `onFileLoaded` fires in `App.tsx`, it calls `replaceScene(envelope.scene)` with the parsed scene that already has the migration defaults applied.
- **`groupParts`** is still called with no `materials` argument from `buildCsv.test.ts` tests for the standalone cutting list — the `= {}` default must remain.
- **`CuttingList` in standalone mode** still works identically to before this feature: no `materials`, no `onMaterialCostChange` → all cost columns show `—`, no subtotal row, CSV has empty cost cells.
- **`coalesceKey: 'material:{name}'`** ensures rapid `$/m²` edits (e.g., from arrow-key in the popover input) coalesce into a single undo entry per material.
