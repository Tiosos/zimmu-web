# Cutting List: Material Field + Quantity Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `material: string` field to `BoardPart` and upgrade the cutting list table + CSV export to group identical pieces into single rows with a quantity count.

**Architecture:** The `material` field is additive to the data model; old files gain `material: ''` on load. A new `groupParts()` utility in `buildCsv.ts` is shared by both the table UI and CSV export. Four tasks proceed in dependency order: data model first, then grouping logic, then cutting list UI, then sidebar input.

**Tech Stack:** TypeScript 6 strict mode, React 19, Vitest + happy-dom + @testing-library/react, shadcn/ui `Input` component.

**Spec:** `docs/superpowers/specs/2026-06-03-cutting-list-material-grouping-design.md`

---

### Task 1: Add `material` field to the data model

**Files:**
- Modify: `src/scene/types.ts`
- Modify: `src/scene/useScene.ts:49-64` (`makeDefaultBoard`) and `src/scene/useScene.ts:258-271` (`onAdd`)
- Modify: `src/scene/useFile.ts:52` (`parseFile` parts map)
- Modify: `src/ui/CuttingList.test.tsx` (`makePart` helper)
- Modify: `src/ui/sidebar.test.tsx` (`makeBoard` helper)

- [ ] **Step 1: Add `material: string` to `BoardPart` in `src/scene/types.ts`**

```ts
export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  material: string      // "" means unspecified
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]
  visible: boolean
}
```

- [ ] **Step 2: Run typecheck to see exactly what breaks**

```bash
pnpm typecheck 2>&1 | head -60
```

Expected: TypeScript errors in `useScene.ts` (two `BoardPart` literal constructions) plus type errors in the two test helper functions that build `BoardPart` objects without `material`. No errors should appear anywhere else.

- [ ] **Step 3: Fix `makeDefaultBoard()` in `src/scene/useScene.ts`**

Find this block (around line 49):
```ts
function makeDefaultBoard(): BoardPart {
  return {
    kind: 'board',
    id: `board_${crypto.randomUUID()}`,
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }
}
```

Add `material: '',` after `thickness: 25,`:
```ts
function makeDefaultBoard(): BoardPart {
  return {
    kind: 'board',
    id: `board_${crypto.randomUUID()}`,
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    material: '',
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }
}
```

- [ ] **Step 4: Fix the inline `BoardPart` construction in `onAdd()` in `src/scene/useScene.ts`**

Find this block (around line 258):
```ts
const part: BoardPart = {
  kind: 'board',
  id,
  label,
  length: 200,
  width: 100,
  thickness: 25,
  color: PART_COLORS[colorIndex.current % PART_COLORS.length],
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
```

Add `material: '',` after `thickness: 25,`:
```ts
const part: BoardPart = {
  kind: 'board',
  id,
  label,
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: PART_COLORS[colorIndex.current % PART_COLORS.length],
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
```

- [ ] **Step 5: Add `material` normalisation in `parseFile()` in `src/scene/useFile.ts`**

Find this line (line 52):
```ts
    scene: { parts: parts.map((p) => ({ ...p, cuts: p.cuts ?? [], visible: p.visible ?? true })) },
```

Change it to:
```ts
    scene: { parts: parts.map((p) => ({ ...p, cuts: p.cuts ?? [], visible: p.visible ?? true, material: p.material ?? '' })) },
```

- [ ] **Step 6: Update `makePart()` helper in `src/ui/CuttingList.test.tsx`**

Find the `makePart` function and add `material: ''` after `thickness: 18,`:
```ts
function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    material: '',
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}
```

- [ ] **Step 7: Update `makeBoard()` helper in `src/ui/sidebar.test.tsx`**

Find the `makeBoard` function and add `material: ''` after `thickness: 25,`:
```ts
function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'board_t1',
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    material: '',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}
```

- [ ] **Step 8: Verify typecheck and tests pass**

```bash
pnpm typecheck && pnpm test
```

Expected: zero TypeScript errors, all tests green (the existing tests don't break because `material` is spread via `...overrides` in test helpers and spread via `{ ...orig, ... }` in the duplicate/clone path).

- [ ] **Step 9: Commit**

```bash
git add src/scene/types.ts src/scene/useScene.ts src/scene/useFile.ts src/ui/CuttingList.test.tsx src/ui/sidebar.test.tsx
git commit -m "feat: add material field to BoardPart data model"
```

---

### Task 2: `groupParts()` utility and `buildCsv` rewrite

**Files:**
- Modify: `src/ui/CuttingList.test.tsx` (update existing buildCsv tests + add groupParts tests)
- Modify: `src/ui/buildCsv.ts` (add `GroupedRow` type, `groupParts()`, rewrite `buildCsv`)

- [ ] **Step 1: Update existing `buildCsv` tests and add `groupParts` tests in `src/ui/CuttingList.test.tsx`**

Replace the entire `describe('buildCsv', ...)` block and add a new `describe('groupParts', ...)` block after it:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { buildCsv, groupParts } from './buildCsv'
import { CuttingList } from './CuttingList'
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    material: '',
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

describe('groupParts', () => {
  it('returns empty array for empty input', () => {
    expect(groupParts([])).toEqual([])
  })

  it('returns one row for a single part', () => {
    const rows = groupParts([makePart()])
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(1)
    expect(rows[0].labels).toBe('Left Side')
    expect(rows[0].material).toBe('')
    expect(rows[0].length).toBe(600)
    expect(rows[0].width).toBe(300)
    expect(rows[0].thickness).toBe(18)
    expect(rows[0].cuts).toBe(0)
  })

  it('merges two parts with identical L×W×T and material into one row', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A' }),
      makePart({ id: 'p2', label: 'B' }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(2)
    expect(rows[0].labels).toBe('A, B')
    expect(rows[0].cuts).toBe(0)
  })

  it('keeps two rows when same L×W×T but different material', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A', material: 'Plywood' }),
      makePart({ id: 'p2', label: 'B', material: 'MDF' }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(2)
    expect(rows[0].qty).toBe(1)
    expect(rows[1].qty).toBe(1)
  })

  it('keeps two rows when same material but different dimensions', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A', length: 600 }),
      makePart({ id: 'p2', label: 'B', length: 800 }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(2)
  })

  it('sums cuts across grouped parts', () => {
    const cut = {
      id: 'c1',
      label: 'C1',
      face: '+X' as const,
      position: { x: 0, y: 0, z: 0 },
      size: { x: 10, y: 20, z: 20 },
    }
    const parts = [
      makePart({ id: 'p1', label: 'A', cuts: [cut] }),
      makePart({ id: 'p2', label: 'B', cuts: [cut] }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(1)
    expect(rows[0].cuts).toBe(2)
  })

  it('preserves insertion order (first-seen group key wins)', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A', length: 800 }),
      makePart({ id: 'p2', label: 'B', length: 600 }),
      makePart({ id: 'p3', label: 'C', length: 800 }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(2)
    expect(rows[0].length).toBe(800)
    expect(rows[0].labels).toBe('A, C')
    expect(rows[1].length).toBe(600)
  })
})

describe('buildCsv', () => {
  it('returns only the header when parts array is empty', () => {
    expect(buildCsv([])).toBe('Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts')
  })

  it('groups two identical parts into one data row', () => {
    const csv = buildCsv([makePart({ id: 'p1', label: 'Left Side' }), makePart({ id: 'p2', label: 'Right Side' })])
    expect(csv.split('\n')).toHaveLength(2)
  })

  it('formats a data row with correct field values', () => {
    const csv = buildCsv([makePart({ length: 600, width: 300, thickness: 18 })])
    expect(csv.split('\n')[1]).toBe('1,Left Side,,600,300,18,0')
  })

  it('includes the cut count', () => {
    const cuts = [
      {
        id: 'c1',
        label: 'C1',
        face: '+X' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 10, y: 20, z: 20 },
      },
      {
        id: 'c2',
        label: 'C2',
        face: '-Y' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 20, y: 10, z: 20 },
      },
    ]
    const csv = buildCsv([makePart({ cuts })])
    expect(csv.split('\n')[1]).toBe('1,Left Side,,600,300,18,2')
  })

  it('wraps labels in double quotes when they contain a comma', () => {
    const csv = buildCsv([makePart({ label: 'Left, Side' })])
    expect(csv.split('\n')[1]).toMatch(/^1,"Left, Side",,/)
  })

  it('escapes embedded double-quotes in labels as "" per RFC 4180', () => {
    const csv = buildCsv([makePart({ label: '5" shelf' })])
    expect(csv.split('\n')[1]).toMatch(/^1,"5"" shelf",,/)
  })
})
```

- [ ] **Step 2: Run the test file to confirm the new tests fail**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected failures:
- `groupParts` is not exported from `./buildCsv` (import error / all groupParts tests fail)
- `buildCsv` tests that check the new header and row format fail
- `buildCsv` test "groups two identical parts into one data row" fails (currently returns 3 lines not 2)

- [ ] **Step 3: Rewrite `src/ui/buildCsv.ts`**

Replace the entire file content:

```ts
import type { Part } from '../scene/types'

export interface GroupedRow {
  qty: number
  labels: string
  material: string
  length: number
  width: number
  thickness: number
  cuts: number
}

export function groupParts(parts: Part[]): GroupedRow[] {
  const order: string[] = []
  const map = new Map<string, GroupedRow>()

  for (const p of parts) {
    if (p.kind !== 'board') continue
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}`
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.cuts += p.cuts.length
    } else {
      order.push(key)
      map.set(key, {
        qty: 1,
        labels: p.label,
        material: p.material,
        length: p.length,
        width: p.width,
        thickness: p.thickness,
        cuts: p.cuts.length,
      })
    }
  }

  return order.map((k) => map.get(k)!)
}

function quoteField(value: string): string {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCsv(parts: Part[]): string {
  const header = 'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = groupParts(parts).map((row) => {
    return `${row.qty},${quoteField(row.labels)},${row.material},${row.length},${row.width},${row.thickness},${row.cuts}`
  })
  return [header, ...rows].join('\n')
}
```

- [ ] **Step 4: Run the test file to confirm all tests pass**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: all `groupParts` and `buildCsv` tests pass. The `CuttingList` render tests will still pass because `buildCsv` is called internally and the Copy CSV test will fail because it still asserts the old header. We'll fix those in Task 3 when we also update the render tests.

Wait — the Copy CSV test in the `CuttingList` describe block asserts the old header string. Check if it fails now:

```bash
pnpm vitest run src/ui/CuttingList.test.tsx 2>&1 | grep -A 5 "Copy CSV"
```

If it fails, update those two assertions inside `'Copy CSV button writes CSV content to clipboard'` in the `CuttingList` describe block (not the `buildCsv` describe block):

```ts
expect(csvArg.split('\n')[0]).toBe('Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts')
expect(csvArg).toContain('1,Left Side,,600,300,18,0')
```

- [ ] **Step 5: Run the full test suite to confirm nothing regressed**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/buildCsv.ts src/ui/CuttingList.test.tsx
git commit -m "feat: add groupParts() and rewrite buildCsv to use grouped rows"
```

---

### Task 3: CuttingList UI — 7-column grouped table

**Files:**
- Modify: `src/ui/CuttingList.test.tsx` (update render tests for new columns)
- Modify: `src/ui/CuttingList.tsx` (use `groupParts`, 7 columns, colSpan 5→7)

- [ ] **Step 1: Update CuttingList render tests in `src/ui/CuttingList.test.tsx`**

In the `describe('CuttingList', ...)` block, update these two tests:

**Update `'renders table column headers'`:**
```ts
it('renders table column headers', () => {
  render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} />)
  expect(screen.getByText('Qty')).toBeTruthy()
  expect(screen.getByText('Labels')).toBeTruthy()
  expect(screen.getByText('Material')).toBeTruthy()
  expect(screen.getByText('Length (mm)')).toBeTruthy()
  expect(screen.getByText('Width (mm)')).toBeTruthy()
  expect(screen.getByText('Thickness (mm)')).toBeTruthy()
  expect(screen.getByText('Cuts')).toBeTruthy()
  expect(screen.queryByText('Label')).toBeNull()
})
```

**Update `'renders correct field values in data row'`:**
```ts
it('renders correct field values in data row', () => {
  const cuts = [
    {
      id: 'c1',
      label: 'C1',
      face: '+X' as const,
      position: { x: 0, y: 0, z: 0 },
      size: { x: 10, y: 20, z: 20 },
    },
  ]
  render(
    <CuttingList
      parts={[makePart({ length: 600, width: 300, thickness: 18, cuts })]}
      projectName="Test"
      onClose={vi.fn()}
    />,
  )
  const rows = screen.getAllByRole('row')
  // rows[0] = header, rows[1] = first data row
  expect(rows[1].textContent).toContain('1')        // qty
  expect(rows[1].textContent).toContain('Left Side') // labels
  expect(rows[1].textContent).toContain('—')         // material blank → dash
  expect(rows[1].textContent).toContain('600')
  expect(rows[1].textContent).toContain('300')
  expect(rows[1].textContent).toContain('18')
  expect(rows[1].textContent).toContain('1')         // cuts
})
```

**Update `'renders a row for each part'`:**

The current test renders 2 parts with different labels but identical dimensions and checks for both text values. After grouping, they merge into one row. Update to give the parts different dimensions so they remain as separate rows:

```ts
it('renders a row for each distinct dimension group', () => {
  const parts = [
    makePart({ id: 'p1', label: 'Left Side', length: 600 }),
    makePart({ id: 'p2', label: 'Right Side', length: 800 }),
  ]
  render(<CuttingList parts={parts} projectName="Test" onClose={vi.fn()} />)
  expect(screen.getByText('Left Side')).toBeTruthy()
  expect(screen.getByText('Right Side')).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to confirm the updated render tests fail**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected failures:
- `'renders table column headers'` — no `Qty`, `Labels`, `Material` elements found; `Label` still present
- `'renders correct field values in data row'` — row shows `Left Side` but not `—` for material; no `1` qty cell
- `'renders a row for each distinct dimension group'` — test may pass or fail depending on whether `Left Side` / `Right Side` appear

- [ ] **Step 3: Rewrite `src/ui/CuttingList.tsx`**

Replace the file with the updated version that uses `groupParts()` and 7 columns:

```tsx
import { useEffect } from 'react'
import type { Part } from '../scene/types'
import { buildCsv, groupParts } from './buildCsv'
import { Button } from '@/components/ui/button'

interface CuttingListProps {
  parts: Part[]
  projectName: string
  onClose: () => void
}

export function CuttingList({ parts, projectName, onClose }: CuttingListProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const csv = buildCsv(parts)
  const rows = groupParts(parts)

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

  return (
    <div
      data-testid="cl-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 min-w-[560px] max-w-[720px] max-h-[80vh] overflow-auto shadow-2xl text-foreground text-sm"
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
              <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
              <th className="pb-2 px-2 font-medium text-xs">Width (mm)</th>
              <th className="pb-2 px-2 font-medium text-xs">Thickness (mm)</th>
              <th className="pb-2 px-2 font-medium text-xs">Cuts</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3 text-muted-foreground text-center text-xs">
                  No parts
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5 pr-2 text-xs">{row.qty}</td>
                  <td className="py-1.5 px-2 text-xs">{row.labels}</td>
                  <td className="py-1.5 px-2 text-xs">{row.material || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{row.length}</td>
                  <td className="py-1.5 px-2 text-xs">{row.width}</td>
                  <td className="py-1.5 px-2 text-xs">{row.thickness}</td>
                  <td className="py-1.5 px-2 text-xs">{row.cuts}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

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

- [ ] **Step 4: Run the full test suite**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx
git commit -m "feat: upgrade CuttingList to 7-column grouped table"
```

---

### Task 4: Sidebar material input

**Files:**
- Modify: `src/ui/sidebar.test.tsx` (add material input test)
- Modify: `src/ui/sidebar.tsx` (add material `Input` + `datalist` in `EditPanel`)

- [ ] **Step 1: Add a failing test for the material input in `src/ui/sidebar.test.tsx`**

Add this test inside `describe('Sidebar', ...)`, after the existing `'shows edit panel when a part is selected'` test:

```ts
it('renders material input when a part is selected', () => {
  render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
  expect(screen.getByPlaceholderText('Material (optional)')).toBeTruthy()
})

it('material input change calls onUpdate with updated material', () => {
  const onUpdate = vi.fn()
  render(<Sidebar {...props({ selectedId: 'board_t1', onUpdate })} />)
  const input = screen.getByPlaceholderText('Material (optional)')
  fireEvent.change(input, { target: { value: 'Plywood' } })
  expect(onUpdate).toHaveBeenCalledOnce()
  const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
  const result = updater(makeBoard())
  expect(result.material).toBe('Plywood')
})
```

- [ ] **Step 2: Run sidebar tests to confirm the new tests fail**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: both new tests fail with "Unable to find an element with the placeholder text: Material (optional)".

- [ ] **Step 3: Add the material input to `EditPanel` in `src/ui/sidebar.tsx`**

At module level, add the datalist ID constant after the imports:

```ts
const MATERIAL_DATALIST_ID = 'zimmu-material-suggestions'
```

Inside `EditPanel`, after the label input `<div className="mb-2">...</div>` block and before the `{/* Shape section */}` comment, add:

```tsx
{/* Material input */}
<div className="mb-2">
  <Input
    list={MATERIAL_DATALIST_ID}
    placeholder="Material (optional)"
    value={part.material}
    onChange={(e) =>
      onUpdate(part.id, (p) => ({ ...p, material: e.target.value }))
    }
  />
</div>
<datalist id={MATERIAL_DATALIST_ID}>
  <option value="Solid timber" />
  <option value="Plywood" />
  <option value="MDF" />
  <option value="OSB" />
  <option value="LVL" />
  <option value="Hardboard" />
</datalist>
```

- [ ] **Step 4: Run the full test suite**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass including the two new sidebar tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -m "feat: add material input to EditPanel in sidebar"
```

---

## Notes file

Create `docs/superpowers/notes/2026-06-03-cutting-list-material-grouping-notes.md` and record any implementation decisions that deviate from the spec, or unexpected constraints found during implementation.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| `material: string` on `BoardPart` | Task 1 |
| `material: p.material ?? ''` in `parseFile()` | Task 1 |
| `material: ''` in `makeDefaultBoard()` | Task 1 |
| `material: ''` in `onAdd()` | Task 1 |
| `GroupedRow` type exported from `buildCsv.ts` | Task 2 |
| `groupParts()` exported from `buildCsv.ts` | Task 2 |
| Group key `L×W×T|material` | Task 2 |
| Labels concatenated with `", "` | Task 2 |
| Cuts summed | Task 2 |
| Insertion order preserved | Task 2 |
| `buildCsv` rewritten using `groupParts` | Task 2 |
| New CSV header format | Task 2 |
| Empty material = blank field in CSV (not `—`) | Task 2 |
| CuttingList uses `groupParts()` | Task 3 |
| 7 columns (was 5) | Task 3 |
| `colSpan` 5 → 7 | Task 3 |
| Empty material renders as `—` in table | Task 3 |
| Sidebar material input with datalist | Task 4 |
| `MATERIAL_DATALIST_ID` at module level | Task 4 |
| 6 datalist suggestions | Task 4 |
| Test: `makePart()` updated with `material: ''` | Task 1 |
| Test: `makeBoard()` updated with `material: ''` | Task 1 |
| Test: `groupParts` 4 new tests | Task 2 |
| Test: `buildCsv` tests updated (header, row format) | Task 2 |
| Test: CuttingList column header assertions updated | Task 3 |
| Test: CuttingList data row checks qty + labels + `—` | Task 3 |
| Test: sidebar material input presence + change | Task 4 |

All spec requirements accounted for. No gaps identified.
