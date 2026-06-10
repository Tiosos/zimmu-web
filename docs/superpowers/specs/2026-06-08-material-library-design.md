# Persistent Material Library — Design Spec

**Date:** 2026-06-08
**Status:** Approved, pending implementation plan

---

## Goal

Persist per-material cost rates across projects using IndexedDB. When the BOM modal opens, any material present in the current project that has no project rate is silently seeded from the library. When the user commits a rate in the Boards tab popover, it is auto-saved to the library. A third "Library" tab in the BOM modal allows viewing and deleting library entries.

---

## Section 1: Architecture

Five files changed, two created.

```
src/scene/idb.ts              Bump DB to v2; add 'library' store; add
                              readLibrary / writeLibraryEntry / deleteLibraryEntry

src/scene/useMaterialLibrary.ts   New hook — loads library from IDB on mount,
                                  exposes saveRate / deleteEntry

src/ui/CuttingList.tsx        Fix MaterialPopover.commit() to skip onSave when
                              value is unchanged from current

src/ui/BomModal.tsx           Add effectiveMaterials merge; handleMaterialCostChange
                              wrapper (dual-write); Library tab with inline LibraryTab;
                              guard handleCopy/handleDownload against 'library' tab

src/App.tsx                   Call useMaterialLibrary; pass 3 new props to BomModal
```

No changes to `types.ts`, `useScene.ts`, `useFile.ts`, or the file format. The library lives entirely outside `Scene` — it is not saved to `.zimmu` files and does not participate in undo/redo.

**Data flow:**

```
App
  useMaterialLibrary() → { library, saveRate, deleteEntry }

  BomModal(parts, materials, library, onMaterialCostChange, onSaveRate, onDeleteLibraryEntry)
    effectiveMaterials = { ...library, ...materials }   // project rates win
    groupParts(parts, effectiveMaterials)               // seeded rates in footer total
    handleMaterialCostChange(name, def)
      → onMaterialCostChange(name, def)                 // scene + undo stack
      → onSaveRate(name, def)                           // library (IDB)
    CuttingList(materials=effectiveMaterials, onMaterialCostChange=handleMaterialCostChange)
    LibraryTab(library, onDelete=onDeleteLibraryEntry)
```

---

## Section 2: Data Layer

### `src/scene/idb.ts`

Bump `DB_VERSION` from `1` to `2`. Rename the constant `STORE_NAME` to `HANDLES_STORE`. Add `LIBRARY_STORE = 'library'`.

Update `openDb` to handle the version upgrade safely for existing users:

```ts
const DB_NAME = 'zimmu'
const DB_VERSION = 2
const HANDLES_STORE = 'handles'
const LIBRARY_STORE = 'library'

function openDb(): Promise<IDBDatabase> {
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
```

Existing `readHandle / writeHandle / clearHandle` use `HANDLES_STORE` — no functional change.

Three new exports:

```ts
// Returns all library entries as Record<material name, MaterialDef>
export async function readLibrary(): Promise<Record<string, MaterialDef>>

// Upserts one entry; key = material name
export async function writeLibraryEntry(name: string, def: MaterialDef): Promise<void>

// Removes one entry by name
export async function deleteLibraryEntry(name: string): Promise<void>
```

`readLibrary` uses `openCursor` to collect all key-value pairs into a plain object.

IDB errors propagate as rejections — callers are responsible for handling (the hook swallows them with `console.error`).

### `src/scene/useMaterialLibrary.ts`

```ts
export interface UseMaterialLibraryResult {
  library: Record<string, MaterialDef>
  saveRate: (name: string, def: MaterialDef) => void
  deleteEntry: (name: string) => void
}

export function useMaterialLibrary(): UseMaterialLibraryResult
```

- Calls `readLibrary()` in a `useEffect([], [])` on mount; sets state when it resolves. Initial state is `{}`.
- `saveRate(name, def)`: calls `writeLibraryEntry(name, def)` (fire-and-forget, errors swallowed), then updates local state optimistically with `setLibrary(prev => ({ ...prev, [name]: def }))`.
- `deleteEntry(name)`: calls `deleteLibraryEntry(name)` (fire-and-forget), then removes the key from local state.
- IDB failures log to `console.error` and do not throw — a library failure must never crash the BOM.

---

## Section 3: BomModal

### New props

```ts
interface BomModalProps {
  // existing:
  parts: Part[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  projectName: string
  onClose: () => void
  onMaterialCostChange: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
  // new:
  library: Record<string, MaterialDef>
  onSaveRate: (name: string, def: MaterialDef) => void
  onDeleteLibraryEntry: (name: string) => void
}
```

### effectiveMaterials

```ts
const effectiveMaterials = { ...library, ...materials }
```

Passed to `CuttingList` (replacing `materials`) and to `groupParts` for the grand total footer. Library-seeded rates contribute to the displayed total even before the user explicitly sets a project rate.

### Dual-write wrapper

```ts
const handleMaterialCostChange = (name: string, def: MaterialDef) => {
  onMaterialCostChange(name, def)   // → scene.materials + undo entry
  onSaveRate(name, def)             // → library (IDB, optimistic)
}
```

Passed to `CuttingList` as `onMaterialCostChange`.

### Library tab

Tab list becomes `'boards' | 'hardware' | 'library'`. The Library tab renders an inline `LibraryTab` component (defined in the same file):

```ts
function LibraryTab({
  library,
  onDelete,
}: {
  library: Record<string, MaterialDef>
  onDelete: (name: string) => void
})
```

- Table with columns: Material | Cost/m² | (delete button). Rows sorted alphabetically by material name.
- Delete button calls `onDelete(name)` immediately — no confirmation prompt. Deletion is low-risk: re-setting a rate in the Boards tab auto-saves it back to the library.
- Empty state message: *"No materials saved yet. Set a rate in the Boards tab to build your library."*
- Inline rate editing is not supported — to update a library rate, set the rate in the Boards tab (auto-save fires).

### Footer and CSV buttons

The grand total footer is unchanged in content. When the Library tab is active, the Copy CSV and Download .csv buttons are disabled (the library is not a CSV export target).

`handleCopy` and `handleDownload` in BomModal must also guard against `tab === 'library'` with an early return, in addition to the disabled attribute on the buttons:

```ts
const handleCopy = () => {
  if (tab === 'library') return
  const csv = tab === 'boards' ? buildCsv(parts, effectiveMaterials) : buildHardwareCsv(hardware)
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
```

Note: both functions now use `effectiveMaterials` (not `materials`) so the exported CSV reflects library-seeded rates.

---

## Section 4: App.tsx

```ts
const { library, saveRate, deleteEntry } = useMaterialLibrary()
```

Called unconditionally alongside `useScene` and `useFile`. The library loads asynchronously on app start; the BOM will have it ready before the user opens the modal.

```tsx
{cuttingListOpen && (
  <BomModal
    ...existingProps...
    library={library}
    onSaveRate={saveRate}
    onDeleteLibraryEntry={deleteEntry}
  />
)}
```

---

## Section 5: Seeding Behaviour

Seeding happens implicitly via `effectiveMaterials = { ...library, ...materials }` — no explicit seeding step, no `useEffect`, no IDB read at BOM-open time. The library is already loaded in memory when the BOM opens (loaded on app start).

**Project rates always win.** If `scene.materials` has `{ 'birch ply': { costPerM2: 40 } }` and the library has `{ 'birch ply': { costPerM2: 45 } }`, the BOM shows `$40`.

**Seeded rates do not dirty the file.** `effectiveMaterials` is a derived value computed in BomModal; it never writes to `scene.materials`. Only explicit user edits in the popover touch the scene. "Explicit" means the user changed the value — opening the popover and dismissing without a change must not fire `onMaterialCostChange`.

This requires a fix to `MaterialPopover.commit()` in `CuttingList.tsx`. The current implementation calls `onSave` on any valid blur/Enter, even when the value matches `current`. With library-seeded rates appearing as `current`, this would dirty the file on a simple inspect-and-close. The fix:

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

This is also an improvement for the non-library case: re-opening a popover for an already-set rate and pressing Enter without changing the value no longer creates a redundant undo entry.

**Old files with pre-existing rates.** If a project file was saved with rates that were never committed through the popover (e.g., from before this feature existed), those project rates are always used as-is. They are not automatically pushed to the library until the user edits them in the popover (which fires `handleMaterialCostChange` → auto-save).

---

## Section 6: Testing

### `src/scene/idb.test.ts` (extend or create)

- `readLibrary` returns `{}` on empty store
- `writeLibraryEntry` + `readLibrary` round-trips correctly
- `deleteLibraryEntry` removes the entry
- DB v1 → v2 upgrade preserves existing `handles` store and adds `library` store

The upgrade test requires simulating an existing v1 database. `fake-indexeddb/auto` shares one in-memory IDB per test file, so the v1 database must be torn down between sub-steps. Pattern:

```ts
it('v1→v2 upgrade preserves handles store and adds library store', async () => {
  // Step 1: create a v1 database with only 'handles'
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('zimmu', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('handles')
    req.onsuccess = () => { req.result.close(); resolve() }
    req.onerror = () => reject(req.error)
  })
  // Step 2: call openDb() (which opens at v2); verify both stores exist
  const db = await openDb()  // exported for testing
  expect(db.objectStoreNames.contains('handles')).toBe(true)
  expect(db.objectStoreNames.contains('library')).toBe(true)
  db.close()
})
```

`openDb` must be exported (or the test can call `readLibrary()` and verify it succeeds as a proxy).

### `src/scene/useMaterialLibrary.test.ts` (new)

- Initial state is `{}`
- After mount, state reflects IDB contents
- `saveRate` updates state optimistically and persists to IDB
- `deleteEntry` removes from state and IDB

### `src/ui/BomModal.test.tsx` (extend)

The existing `baseProps` fixture must be extended with the three new required props:

```ts
const baseProps = {
  // existing props...
  library: {} as Record<string, MaterialDef>,
  onSaveRate: vi.fn(),
  onDeleteLibraryEntry: vi.fn(),
}
```

New test cases:

- Library-seeded rate appears in cost column when project has no rate for that material
- Project rate overrides library rate when both exist
- Committing a rate calls both `onMaterialCostChange` and `onSaveRate`
- Opening popover and dismissing without change does NOT call `onMaterialCostChange`
- Library tab renders entries from `library` prop sorted alphabetically
- Delete button in Library tab calls `onDeleteLibraryEntry` with the correct name
- CSV buttons are disabled when Library tab is active

---

## Key Invariants

- The library never overwrites `scene.materials` — `effectiveMaterials` is display-only.
- Library reads/writes are fire-and-forget in the UI; failures are logged, never thrown.
- No new types in `types.ts` — `MaterialDef` is reused as-is.
- No file format change — `ZimmuFile` and `FILE_FORMAT_VERSION` are untouched.
