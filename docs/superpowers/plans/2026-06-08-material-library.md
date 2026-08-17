# Persistent Material Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-material cost rates in IndexedDB so they seed the BOM modal across projects automatically.

**Architecture:** A new `'library'` IDB store is added to the existing `'zimmu'` database (version bump 1→2). A `useMaterialLibrary` hook loads the library on app start and exposes `saveRate`/`deleteEntry`. `BomModal` merges `{ ...library, ...materials }` into `effectiveMaterials` (project rates always win) and passes it to `CuttingList`. Every committed rate change auto-saves to the library. A third "Library" tab lets users view and delete stored entries.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom + @testing-library/react, fake-indexeddb (already polyfilled in vitest.setup.ts)

**Spec:** `docs/superpowers/specs/2026-06-08-material-library-design.md`

---

## File Structure

| File | Change |
|------|--------|
| `src/scene/idb.ts` | Bump to DB v2; add `'library'` store; export `openDb`; add `readLibrary`, `writeLibraryEntry`, `deleteLibraryEntry` |
| `src/scene/idb.test.ts` | Extend with library function tests + v1→v2 upgrade test |
| `src/scene/useMaterialLibrary.ts` | **New** — hook: load on mount, `saveRate`, `deleteEntry` |
| `src/scene/useMaterialLibrary.test.ts` | **New** — hook unit tests |
| `src/ui/CuttingList.tsx` | Fix `MaterialPopover.commit()` to skip `onSave` when value unchanged |
| `src/ui/CuttingList.test.tsx` | Add no-change-dismiss test |
| `src/ui/BomModal.tsx` | Add `library`/`onSaveRate`/`onDeleteLibraryEntry` props; `effectiveMaterials`; `handleMaterialCostChange` wrapper; `LibraryTab`; updated `handleCopy`/`handleDownload` |
| `src/ui/BomModal.test.tsx` | Update `baseProps`; add 7 new tests |
| `src/App.tsx` | Call `useMaterialLibrary`; pass 3 new props to `BomModal` |

---

### Task 1: IDB data layer

**Files:**
- Modify: `src/scene/idb.ts`
- Modify: `src/scene/idb.test.ts`

The current `idb.ts` opens DB at version 1 with a single `'handles'` store. We bump to version 2 and add a `'library'` store. We also export `openDb` so the upgrade test can inspect `objectStoreNames` directly.

- [ ] **Step 1: Write the failing tests for library functions**

Two changes to `src/scene/idb.test.ts`:

**a) Update the import on line 2** to include the new exports:

```ts
import { readHandle, writeHandle, clearHandle, readLibrary, writeLibraryEntry, deleteLibraryEntry, openDb } from './idb'
import type { MaterialDef } from './types'
```

**b) Append these two new describe blocks at the bottom of the file** (after the closing `}` of the existing `describe('idb')` block):

```ts
describe('library store', () => {
  beforeEach(async () => {
    // Clear library between tests using a direct IDB transaction
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction('library', 'readwrite').objectStore('library').clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    db.close()
  })

  it('readLibrary returns {} on empty store', async () => {
    const result = await readLibrary()
    expect(result).toEqual({})
  })

  it('writeLibraryEntry + readLibrary round-trips', async () => {
    const def: MaterialDef = { costPerM2: 45 }
    await writeLibraryEntry('birch ply', def)
    const result = await readLibrary()
    expect(result['birch ply']).toEqual(def)
  })

  it('writeLibraryEntry overwrites existing entry', async () => {
    await writeLibraryEntry('oak', { costPerM2: 80 })
    await writeLibraryEntry('oak', { costPerM2: 95 })
    const result = await readLibrary()
    expect(result['oak']).toEqual({ costPerM2: 95 })
  })

  it('deleteLibraryEntry removes the entry', async () => {
    await writeLibraryEntry('pine', { costPerM2: 30 })
    await deleteLibraryEntry('pine')
    const result = await readLibrary()
    expect(result['pine']).toBeUndefined()
  })

  it('deleteLibraryEntry is a no-op for non-existent key', async () => {
    await expect(deleteLibraryEntry('nope')).resolves.toBeUndefined()
  })

  it('readLibrary returns all entries', async () => {
    await writeLibraryEntry('A', { costPerM2: 10 })
    await writeLibraryEntry('B', { costPerM2: 20 })
    const result = await readLibrary()
    expect(result).toEqual({ A: { costPerM2: 10 }, B: { costPerM2: 20 } })
  })
})

describe('db v1 → v2 upgrade', () => {
  it('adds library store while preserving handles store', async () => {
    // Reset to a clean state, then recreate as v1
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('zimmu')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('zimmu', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('handles')
      req.onsuccess = () => { req.result.close(); resolve() }
      req.onerror = () => reject(req.error)
    })

    // openDb() triggers the v2 upgrade
    const db = await openDb()
    expect(db.objectStoreNames.contains('handles')).toBe(true)
    expect(db.objectStoreNames.contains('library')).toBe(true)
    db.close()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/scene/idb.test.ts
```

Expected: FAIL — `readLibrary`, `writeLibraryEntry`, `deleteLibraryEntry`, `openDb` are not exported.

- [ ] **Step 3: Implement the updated idb.ts**

Replace `src/scene/idb.ts` entirely:

```ts
import type { MaterialDef } from './types'

const DB_NAME = 'zimmu'
const DB_VERSION = 2
const HANDLES_STORE = 'handles'
const LIBRARY_STORE = 'library'
const KEY = 'last-file'

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(HANDLES_STORE)) db.createObjectStore(HANDLES_STORE)
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) db.createObjectStore(LIBRARY_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function readHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES_STORE, 'readonly').objectStore(HANDLES_STORE).get(KEY)
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function writeHandle(h: FileSystemFileHandle): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES_STORE, 'readwrite').objectStore(HANDLES_STORE).put(h, KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function clearHandle(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES_STORE, 'readwrite').objectStore(HANDLES_STORE).delete(KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function readLibrary(): Promise<Record<string, MaterialDef>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const result: Record<string, MaterialDef> = {}
    const req = db.transaction(LIBRARY_STORE, 'readonly').objectStore(LIBRARY_STORE).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        result[cursor.key as string] = cursor.value as MaterialDef
        cursor.continue()
      } else {
        resolve(result)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

export async function writeLibraryEntry(name: string, def: MaterialDef): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(LIBRARY_STORE, 'readwrite').objectStore(LIBRARY_STORE).put(def, name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function deleteLibraryEntry(name: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(LIBRARY_STORE, 'readwrite').objectStore(LIBRARY_STORE).delete(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/scene/idb.test.ts
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/scene/idb.ts src/scene/idb.test.ts
git commit -m "feat(idb): bump DB to v2; add library store with read/write/delete"
```

---

### Task 2: useMaterialLibrary hook

**Files:**
- Create: `src/scene/useMaterialLibrary.ts`
- Create: `src/scene/useMaterialLibrary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/useMaterialLibrary.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMaterialLibrary } from './useMaterialLibrary'
import { readLibrary, writeLibraryEntry, openDb } from './idb'
import type { MaterialDef } from './types'

async function clearLibrary() {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction('library', 'readwrite').objectStore('library').clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  db.close()
}

describe('useMaterialLibrary', () => {
  beforeEach(async () => {
    await clearLibrary()
  })

  it('initial state is {}', () => {
    const { result } = renderHook(() => useMaterialLibrary())
    expect(result.current.library).toEqual({})
  })

  it('loads library from IDB on mount', async () => {
    await writeLibraryEntry('oak', { costPerM2: 80 })
    const { result } = renderHook(() => useMaterialLibrary())
    await waitFor(() => {
      expect(result.current.library['oak']).toEqual({ costPerM2: 80 })
    })
  })

  it('saveRate updates state optimistically', async () => {
    const { result } = renderHook(() => useMaterialLibrary())
    const def: MaterialDef = { costPerM2: 45 }
    act(() => {
      result.current.saveRate('birch ply', def)
    })
    expect(result.current.library['birch ply']).toEqual(def)
  })

  it('saveRate persists to IDB', async () => {
    const { result } = renderHook(() => useMaterialLibrary())
    act(() => {
      result.current.saveRate('birch ply', { costPerM2: 45 })
    })
    await waitFor(async () => {
      const stored = await readLibrary()
      expect(stored['birch ply']).toEqual({ costPerM2: 45 })
    })
  })

  it('deleteEntry removes from state', async () => {
    const { result } = renderHook(() => useMaterialLibrary())
    act(() => {
      result.current.saveRate('pine', { costPerM2: 30 })
    })
    act(() => {
      result.current.deleteEntry('pine')
    })
    expect(result.current.library['pine']).toBeUndefined()
  })

  it('deleteEntry removes from IDB', async () => {
    await writeLibraryEntry('pine', { costPerM2: 30 })
    const { result } = renderHook(() => useMaterialLibrary())
    await waitFor(() => {
      expect(result.current.library['pine']).toBeDefined()
    })
    act(() => {
      result.current.deleteEntry('pine')
    })
    await waitFor(async () => {
      const stored = await readLibrary()
      expect(stored['pine']).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/scene/useMaterialLibrary.test.ts
```

Expected: FAIL — module `useMaterialLibrary` not found.

- [ ] **Step 3: Implement useMaterialLibrary.ts**

Create `src/scene/useMaterialLibrary.ts`:

```ts
import { useState, useEffect, useCallback } from 'react'
import type { MaterialDef } from './types'
import { readLibrary, writeLibraryEntry, deleteLibraryEntry } from './idb'

export interface UseMaterialLibraryResult {
  library: Record<string, MaterialDef>
  saveRate: (name: string, def: MaterialDef) => void
  deleteEntry: (name: string) => void
}

export function useMaterialLibrary(): UseMaterialLibraryResult {
  const [library, setLibrary] = useState<Record<string, MaterialDef>>({})

  useEffect(() => {
    readLibrary()
      .then(setLibrary)
      .catch((err: unknown) => console.error('Failed to load material library:', err))
  }, [])

  const saveRate = useCallback((name: string, def: MaterialDef) => {
    setLibrary((prev) => ({ ...prev, [name]: def }))
    void writeLibraryEntry(name, def).catch((err: unknown) =>
      console.error('Failed to save material library entry:', err)
    )
  }, [])

  const deleteEntry = useCallback((name: string) => {
    setLibrary((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    void deleteLibraryEntry(name).catch((err: unknown) =>
      console.error('Failed to delete material library entry:', err)
    )
  }, [])

  return { library, saveRate, deleteEntry }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/scene/useMaterialLibrary.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/useMaterialLibrary.ts src/scene/useMaterialLibrary.test.ts
git commit -m "feat(scene): add useMaterialLibrary hook"
```

---

### Task 3: Fix MaterialPopover.commit() — no-op when value unchanged

**Files:**
- Modify: `src/ui/CuttingList.tsx` (lines 23–28 — the `commit` function body)
- Modify: `src/ui/CuttingList.test.tsx` (add one test inside `describe('CuttingList')`)

**Why:** When `effectiveMaterials` seeds the popover's `current` value from the library, clicking on a material name and then clicking away (without changing the value) fires `commit()`. Without this fix, `onSave` fires → `onMaterialCostChange` → `scene.materials` is written → file is marked dirty. This violates the invariant that seeded rates don't dirty the file.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('CuttingList')` block in `src/ui/CuttingList.test.tsx` (after the last `it(...)` in that block, before the closing `})`):

```ts
it('does not call onMaterialCostChange when popover closes without changing value', () => {
  const onMaterialCostChange = vi.fn()
  const part: Part = {
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
  render(
    <CuttingList
      parts={[part]}
      projectName="Test"
      onClose={vi.fn()}
      materials={{ Plywood: { costPerM2: 45 } }}
      onMaterialCostChange={onMaterialCostChange}
      hideExportButtons
    />,
  )
  // Click material name to open popover (current = 45)
  fireEvent.click(screen.getByText('Plywood'))
  // Blur without changing value — input shows "45", same as current
  fireEvent.blur(screen.getByRole('spinbutton'))
  expect(onMaterialCostChange).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: the new test FAILS — `onMaterialCostChange` is called even though value didn't change.

- [ ] **Step 3: Fix commit() in CuttingList.tsx**

In `src/ui/CuttingList.tsx`, replace the `commit` function (lines 23–28):

Old:
```ts
  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) onSave({ costPerM2: num })
    else onClose()
  }
```

New:
```ts
  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) {
      if (current === undefined || num !== current) onSave({ costPerM2: num })
      else onClose()
    } else {
      onClose()
    }
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: all tests PASS, including the new one.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx
git commit -m "fix(ui): skip onSave in MaterialPopover when value unchanged from current"
```

---

### Task 4: BomModal — library tab, effectiveMaterials, dual-write

**Files:**
- Modify: `src/ui/BomModal.tsx`
- Modify: `src/ui/BomModal.test.tsx`

This task adds three new props to BomModal, computes `effectiveMaterials`, wraps `onMaterialCostChange` to also call `onSaveRate`, adds a `LibraryTab` inline component, extends tab handling to `'boards' | 'hardware' | 'library'`, and updates `handleCopy`/`handleDownload`.

- [ ] **Step 1: Update baseProps and write all new failing tests**

In `src/ui/BomModal.test.tsx`, make these changes:

1. Add to imports: `import type { MaterialDef } from '../scene/types'` (already imported — no change needed).

2. Update `baseProps` — replace the existing definition:
```ts
const baseProps = {
  parts,
  materials,
  hardware,
  projectName: 'Test',
  onClose: vi.fn(),
  onMaterialCostChange: vi.fn(),
  onUpdateHardware: vi.fn(),
  library: {} as Record<string, MaterialDef>,
  onSaveRate: vi.fn(),
  onDeleteLibraryEntry: vi.fn(),
}
```

3. Add all new tests after the existing `describe('BomModal')` block's last `it(...)`:

```ts
  it('library-seeded rate appears in cost column when project has no rate', () => {
    // Plywood: 600×300mm = 0.18m² × $50/m² = $9.00
    render(
      <BomModal
        {...baseProps}
        materials={{}}
        library={{ Plywood: { costPerM2: 50 } }}
      />,
    )
    expect(screen.getByTestId('cl-panel').textContent).toContain('$9.00')
  })

  it('project rate overrides library rate', () => {
    // project rate $100 wins over library rate $50: 0.18m² × $100 = $18.00
    render(
      <BomModal
        {...baseProps}
        materials={{ Plywood: { costPerM2: 100 } }}
        library={{ Plywood: { costPerM2: 50 } }}
      />,
    )
    expect(screen.getByTestId('cl-panel').textContent).toContain('$18.00')
    expect(screen.getByTestId('cl-panel').textContent).not.toContain('$9.00')
  })

  it('committing a changed rate calls both onMaterialCostChange and onSaveRate', () => {
    const onMaterialCostChange = vi.fn()
    const onSaveRate = vi.fn()
    render(
      <BomModal
        {...baseProps}
        materials={{}}
        library={{}}
        onMaterialCostChange={onMaterialCostChange}
        onSaveRate={onSaveRate}
      />,
    )
    fireEvent.click(screen.getByText('Plywood'))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '60' } })
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' })
    expect(onMaterialCostChange).toHaveBeenCalledWith('Plywood', { costPerM2: 60 })
    expect(onSaveRate).toHaveBeenCalledWith('Plywood', { costPerM2: 60 })
  })

  it('does not call onMaterialCostChange when popover dismissed without changing value', () => {
    const onMaterialCostChange = vi.fn()
    const onSaveRate = vi.fn()
    // materials has a project rate (100) — popover opens with current=100
    render(
      <BomModal
        {...baseProps}
        materials={{ Plywood: { costPerM2: 100 } }}
        library={{}}
        onMaterialCostChange={onMaterialCostChange}
        onSaveRate={onSaveRate}
      />,
    )
    fireEvent.click(screen.getByText('Plywood'))
    // Blur without changing — "100" is the same as current (100)
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(onMaterialCostChange).not.toHaveBeenCalled()
    expect(onSaveRate).not.toHaveBeenCalled()
  })

  it('Library tab renders entries from library prop sorted alphabetically', () => {
    render(
      <BomModal
        {...baseProps}
        library={{ Plywood: { costPerM2: 100 }, Oak: { costPerM2: 80 }, Birch: { costPerM2: 45 } }}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /library/i }))
    const rows = screen
      .getByRole('table')
      .querySelector('tbody')!
      .querySelectorAll('tr')
    expect(rows[0].cells[0].textContent).toBe('Birch')
    expect(rows[1].cells[0].textContent).toBe('Oak')
    expect(rows[2].cells[0].textContent).toBe('Plywood')
  })

  it('delete button in Library tab calls onDeleteLibraryEntry with correct name', () => {
    const onDeleteLibraryEntry = vi.fn()
    render(
      <BomModal
        {...baseProps}
        library={{ Plywood: { costPerM2: 100 } }}
        onDeleteLibraryEntry={onDeleteLibraryEntry}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /library/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDeleteLibraryEntry).toHaveBeenCalledWith('Plywood')
  })

  it('CSV buttons are disabled when Library tab is active', () => {
    render(<BomModal {...baseProps} />)
    fireEvent.click(screen.getByRole('tab', { name: /library/i }))
    expect(
      (screen.getByRole('button', { name: /copy csv/i }) as HTMLButtonElement).disabled,
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /download/i }) as HTMLButtonElement).disabled,
    ).toBeTruthy()
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/ui/BomModal.test.tsx
```

Expected: existing tests fail (TypeScript — missing `library`/`onSaveRate`/`onDeleteLibraryEntry` props). New tests fail for the same reason.

- [ ] **Step 3: Replace BomModal.tsx**

Replace `src/ui/BomModal.tsx` entirely:

```tsx
import { useEffect, useState } from 'react'
import type { HardwareItem, MaterialDef, Part } from '../scene/types'
import { CuttingList } from './CuttingList'
import { HardwareTab } from './HardwareTab'
import { groupParts, buildCsv, buildHardwareCsv } from './buildCsv'
import { downloadBlob } from './download'
import { Button } from '@/components/ui/button'

type Tab = 'boards' | 'hardware' | 'library'

interface BomModalProps {
  parts: Part[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  projectName: string
  onClose: () => void
  onMaterialCostChange: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
  library: Record<string, MaterialDef>
  onSaveRate: (name: string, def: MaterialDef) => void
  onDeleteLibraryEntry: (name: string) => void
}

function LibraryTab({
  library,
  onDelete,
}: {
  library: Record<string, MaterialDef>
  onDelete: (name: string) => void
}) {
  const entries = Object.entries(library).sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No materials saved yet. Set a rate in the Boards tab to build your library.
      </p>
    )
  }

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="pb-2 pr-2 font-medium text-xs">Material</th>
          <th className="pb-2 px-2 font-medium text-xs">Cost/m²</th>
          <th className="pb-2 px-2 font-medium text-xs" />
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, def]) => (
          <tr key={name} className="border-b border-border/30">
            <td className="py-1.5 pr-2 text-xs">{name}</td>
            <td className="py-1.5 px-2 text-xs">${def.costPerM2.toFixed(2)}</td>
            <td className="py-1.5 px-2 text-xs text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(name)}
                className="h-5 px-1.5 text-xs text-muted-foreground hover:text-destructive"
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function BomModal({
  parts,
  materials,
  hardware,
  projectName,
  onClose,
  onMaterialCostChange,
  onUpdateHardware,
  library,
  onSaveRate,
  onDeleteLibraryEntry,
}: BomModalProps) {
  const [tab, setTab] = useState<Tab>('boards')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const effectiveMaterials = { ...library, ...materials }

  const rows = groupParts(parts, effectiveMaterials)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const hardwareSubtotal = hardware.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const grandTotal = boardSubtotal + hardwareSubtotal

  const handleMaterialCostChange = (name: string, def: MaterialDef) => {
    onMaterialCostChange(name, def)
    onSaveRate(name, def)
  }

  const handleCopy = () => {
    if (tab === 'library') return
    const csv =
      tab === 'boards' ? buildCsv(parts, effectiveMaterials) : buildHardwareCsv(hardware)
    void navigator.clipboard.writeText(csv)
  }

  const handleDownload = () => {
    if (tab === 'library') return
    if (tab === 'boards') {
      downloadBlob(buildCsv(parts, effectiveMaterials), `${projectName}-boards.csv`, 'text/csv')
    } else {
      downloadBlob(buildHardwareCsv(hardware), `${projectName}-hardware.csv`, 'text/csv')
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
        <div role="tablist" className="flex gap-0 border-b border-border px-6">
          {(['boards', 'hardware', 'library'] as const).map((t) => (
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
              {t === 'boards' ? 'Boards' : t === 'hardware' ? 'Hardware' : 'Library'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {tab === 'boards' ? (
            <CuttingList
              parts={parts}
              projectName={projectName}
              onClose={onClose}
              materials={effectiveMaterials}
              onMaterialCostChange={handleMaterialCostChange}
              hideExportButtons
            />
          ) : tab === 'hardware' ? (
            <HardwareTab hardware={hardware} onUpdateHardware={onUpdateHardware} />
          ) : (
            <LibraryTab library={library} onDelete={onDeleteLibraryEntry} />
          )}
        </div>

        {/* Footer */}
        <div
          data-testid="bom-grand-total"
          className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20"
        >
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Boards:{' '}
              <span className="text-foreground">
                {boardSubtotal === 0 && !rows.some((r) => r.totalCost !== null)
                  ? '—'
                  : `$${boardSubtotal.toFixed(2)}`}
              </span>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              disabled={tab === 'library'}
            >
              Copy CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={tab === 'library'}
            >
              Download .csv
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run BomModal tests to confirm they pass**

```bash
pnpm vitest run src/ui/BomModal.test.tsx
```

Expected: all 13 tests PASS (6 original + 7 new).

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
pnpm typecheck && pnpm test
```

Expected: all 13 tests PASS.

Note: `pnpm typecheck` will fail at this step because `App.tsx` still passes `<BomModal>` without the 3 new required props. Do not add temporary workarounds — Task 5 fixes it immediately after. Run only `pnpm test` here, not `pnpm typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/BomModal.tsx src/ui/BomModal.test.tsx
git commit -m "feat(ui): add library tab, effectiveMaterials, and dual-write to BomModal"
```

---

### Task 5: App.tsx — wire useMaterialLibrary into BomModal

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Verify the type error**

```bash
pnpm typecheck 2>&1 | grep BomModal
```

Expected: error about missing `library`, `onSaveRate`, `onDeleteLibraryEntry` props.

- [ ] **Step 2: Update App.tsx**

In `src/App.tsx`:

1. Add the import after the existing `useFile` import line:

```ts
import { useMaterialLibrary } from './scene/useMaterialLibrary'
```

2. Add the hook call inside `function App()`, after the `useScene()` destructuring block (around line 48):

```ts
  const { library, saveRate, deleteEntry } = useMaterialLibrary()
```

3. Update the `<BomModal>` JSX (currently around line 307). Replace:

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

With:

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
          library={library}
          onSaveRate={saveRate}
          onDeleteLibraryEntry={deleteEntry}
        />
      )}
```

- [ ] **Step 3: Run typecheck and full test suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire useMaterialLibrary into BomModal"
```

- [ ] **Step 5: Push**

```bash
git push -u origin claude/optimistic-cori-FltT4
```

---

## Done criteria

- [ ] All tests pass: `pnpm test` — 338+ tests, 0 failures
- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`
- [ ] Opening BOM with a library-seeded material shows the cost without dirtying the file
- [ ] Setting a rate in the Boards tab auto-saves to library (persists across sessions)
- [ ] Library tab shows entries sorted alphabetically with working Delete buttons
- [ ] CSV buttons disabled when Library tab is active
