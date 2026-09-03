# Cutting List & BOM Plan

> **Consolidated plan.** This file merges the six cutting-list / bill-of-materials plans, previously separate files, in date order. Each section below is the original plan verbatim, its headings demoted one level to nest under this document.

**Sections:**
- **Cutting List (base)** — spec _none (plan-only)_, notes `docs/superpowers/notes/2026-06-01-cutting-list-notes.md`
- **Material Field + Quantity Grouping** — spec `docs/superpowers/specs/2026-06-03-cutting-list-material-grouping-design.md`, notes `docs/superpowers/notes/2026-06-03-cutting-list-material-grouping-notes.md`
- **Color Column** — spec `docs/superpowers/specs/2026-06-04-cutting-list-color-design.md`
- **Enhanced Cutting List — Full BOM** — spec `docs/superpowers/specs/2026-06-07-enhanced-cutting-list-bom-design.md`, notes `docs/superpowers/notes/2026-06-07-enhanced-cutting-list-bom-notes.md`
- **Persistent Material Library** — spec `docs/superpowers/specs/2026-06-08-material-library-design.md`, notes `docs/superpowers/notes/2026-06-08-material-library-notes.md`
- **Linked Hardware** — spec _none (plan-only)_


---

## Cutting List Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete — the feature is shipped and carries a **Done** badge in `project-structure.html`'s roadmap. Step checkboxes in this file were never ticked as the work went; the record of what landed and why is the Notes file named above.**

**Goal:** Add a Cutting List modal accessible from the File menu that shows each board's label, dimensions, and cut count as a table, with Copy CSV and Download .csv export actions.

**Architecture:** A pure `buildCsv(parts)` function transforms scene data to CSV text; a `CuttingList` modal component renders the table and action buttons; `FileMenu` gains an `onCuttingList` prop that triggers the modal; `App.tsx` holds the `cuttingListOpen` boolean and wires the four pieces together. No new scene state — the cutting list is a read-only projection of existing `Part[]` data.

**Tech Stack:** React 19, TypeScript strict, Vitest + @testing-library/react, `navigator.clipboard.writeText` for copy, `Blob` + `URL.createObjectURL` for download.

**Spec:** none — plan-only; no design spec was written for this feature.

---

### File Map

| File | Change |
|------|--------|
| `src/ui/CuttingList.tsx` | **Create** — `buildCsv` pure function + `CuttingList` modal component |
| `src/ui/CuttingList.test.tsx` | **Create** — `buildCsv` unit tests + `CuttingList` component tests |
| `src/ui/FileMenu.tsx` | **Modify** — add `onCuttingList: () => void` prop + "Cutting List…" menu item |
| `src/ui/FileMenu.test.tsx` | **Modify** — add `onCuttingList` to `baseProps`, add 2 new tests |
| `src/App.tsx` | **Modify** — add `cuttingListOpen` state, wire to `FileMenu` + `CuttingList`, add `Ctrl+Shift+E` shortcut |
| `docs/superpowers/notes/2026-06-01-cutting-list-notes.md` | **Create** — implementation notes |

---

#### Task 1: `buildCsv` pure function

**Files:**
- Create: `src/ui/CuttingList.tsx`
- Create: `src/ui/CuttingList.test.tsx`
- Create: `docs/superpowers/notes/2026-06-01-cutting-list-notes.md`

**Context — `Part` type (from `src/scene/types.ts`):**

```ts
interface BoardPart {
  kind: 'board'
  id: string       // PartId
  label: string
  length: number
  width: number
  thickness: number
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]   // CutDef has id, label, face, position, size, pairedCutId?
}
type Part = BoardPart
```

- [ ] **Step 1: Create implementation notes file**

```bash
cat > docs/superpowers/notes/2026-06-01-cutting-list-notes.md << 'EOF'
# Cutting List Export — Implementation Notes

## Decisions

- `buildCsv` lives in `CuttingList.tsx` (not `utils.ts`) — only used by this component
- CSV uses `\n` line endings — acceptable for modern editors and Google Sheets
- Only labels containing commas are quoted; labels cannot contain newlines via the sidebar input
- Numbers are emitted as-is (no rounding) — user-entered values are already clean
EOF
```

- [ ] **Step 2: Write failing tests for `buildCsv`**

Create `src/ui/CuttingList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { buildCsv } from './CuttingList'
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}

describe('buildCsv', () => {
  it('returns only the header when parts array is empty', () => {
    expect(buildCsv([])).toBe('Label,Length (mm),Width (mm),Thickness (mm),Cuts')
  })

  it('returns header + one data row per part', () => {
    const csv = buildCsv([makePart(), makePart({ id: 'p2', label: 'Right Side' })])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('formats a data row with correct field values', () => {
    const csv = buildCsv([makePart({ length: 600, width: 300, thickness: 18 })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,0')
  })

  it('includes the cut count', () => {
    const cuts = [
      { id: 'c1', label: 'C1', face: '+X' as const, position: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 20, z: 20 } },
      { id: 'c2', label: 'C2', face: '-Y' as const, position: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 10, z: 20 } },
    ]
    const csv = buildCsv([makePart({ cuts })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,2')
  })

  it('wraps label in double quotes when it contains a comma', () => {
    const csv = buildCsv([makePart({ label: 'Left, Side' })])
    expect(csv.split('\n')[1]).toMatch(/^"Left, Side",/)
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: FAIL — `buildCsv` not found (module does not exist yet).

- [ ] **Step 4: Implement `buildCsv`**

Create `src/ui/CuttingList.tsx`:

```tsx
import type { Part } from '../scene/types'

export function buildCsv(parts: Part[]): string {
  const header = 'Label,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = parts.map((p) => {
    const label = p.label.includes(',') ? `"${p.label}"` : p.label
    return `${label},${p.length},${p.width},${p.thickness},${p.cuts.length}`
  })
  return [header, ...rows].join('\n')
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx docs/superpowers/notes/2026-06-01-cutting-list-notes.md
git commit -m "feat: add buildCsv function for cutting list export"
```

---

#### Task 2: `CuttingList` modal component

**Files:**
- Modify: `src/ui/CuttingList.tsx` (add `CuttingList` component)
- Modify: `src/ui/CuttingList.test.tsx` (add component tests)

**Context — existing `CuttingList.tsx` after Task 1:**
Contains only `buildCsv`. You will add the `CuttingList` component to it.

**Design notes:**
- The overlay `div` has `data-testid="cl-overlay"` and `onClick={onClose}`.
- The inner panel `div` has `data-testid="cl-panel"` and `onClick={(e) => e.stopPropagation()}` to prevent overlay closure when clicking inside.
- Escape is handled via `window.addEventListener('keydown', ...)` in a `useEffect` — the modal registers/deregisters its own listener.
- Download uses `URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))`, creates an `<a>`, sets `a.download = \`${projectName}.csv\``, calls `a.click()`, then `URL.revokeObjectURL(url)`.
- Copy calls `void navigator.clipboard.writeText(csv)`.

- [ ] **Step 1: Write failing component tests**

Replace the full contents of `src/ui/CuttingList.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { buildCsv, CuttingList } from './CuttingList'
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}

describe('buildCsv', () => {
  it('returns only the header when parts array is empty', () => {
    expect(buildCsv([])).toBe('Label,Length (mm),Width (mm),Thickness (mm),Cuts')
  })

  it('returns header + one data row per part', () => {
    const csv = buildCsv([makePart(), makePart({ id: 'p2', label: 'Right Side' })])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('formats a data row with correct field values', () => {
    const csv = buildCsv([makePart({ length: 600, width: 300, thickness: 18 })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,0')
  })

  it('includes the cut count', () => {
    const cuts = [
      { id: 'c1', label: 'C1', face: '+X' as const, position: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 20, z: 20 } },
      { id: 'c2', label: 'C2', face: '-Y' as const, position: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 10, z: 20 } },
    ]
    const csv = buildCsv([makePart({ cuts })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,2')
  })

  it('wraps label in double quotes when it contains a comma', () => {
    const csv = buildCsv([makePart({ label: 'Left, Side' })])
    expect(csv.split('\n')[1]).toMatch(/^"Left, Side",/)
  })
})

describe('CuttingList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a row for each part', () => {
    const parts = [makePart(), makePart({ id: 'p2', label: 'Right Side' })]
    render(<CuttingList parts={parts} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Left Side')).toBeTruthy()
    expect(screen.getByText('Right Side')).toBeTruthy()
  })

  it('renders table column headers', () => {
    render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Label')).toBeTruthy()
    expect(screen.getByText('Length (mm)')).toBeTruthy()
    expect(screen.getByText('Width (mm)')).toBeTruthy()
    expect(screen.getByText('Thickness (mm)')).toBeTruthy()
    expect(screen.getByText('Cuts')).toBeTruthy()
  })

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
    expect(rows[1].textContent).toContain('Left Side')
    expect(rows[1].textContent).toContain('600')
    expect(rows[1].textContent).toContain('300')
    expect(rows[1].textContent).toContain('18')
    expect(rows[1].textContent).toContain('1')
  })

  it('shows "No parts" when parts array is empty', () => {
    render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('No parts')).toBeTruthy()
  })

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('cl-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when the panel itself is clicked', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('cl-panel'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Download .csv button triggers file download with projectName as filename', () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    render(<CuttingList parts={[makePart()]} projectName="My Project" onClose={vi.fn()} />)

    // Mock AFTER render so React's own createElement calls during render don't consume it
    const clickSpy = vi.fn()
    const mockAnchor = { href: '', download: '', click: clickSpy }
    vi.spyOn(document, 'createElement').mockReturnValueOnce(
      mockAnchor as unknown as HTMLAnchorElement,
    )

    fireEvent.click(screen.getByRole('button', { name: /Download \.csv/ }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(mockAnchor.download).toBe('My Project.csv')
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('Copy CSV button writes CSV content to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(<CuttingList parts={[makePart()]} projectName="Test" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Copy CSV/ }))

    expect(writeText).toHaveBeenCalledOnce()
    const csvArg = writeText.mock.calls[0][0] as string
    expect(csvArg.split('\n')[0]).toBe('Label,Length (mm),Width (mm),Thickness (mm),Cuts')
    expect(csvArg).toContain('Left Side,600,300,18,0')
  })
})
```

- [ ] **Step 2: Run tests — verify new component tests fail**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: 5 `buildCsv` tests pass; ~10 `CuttingList` tests fail — `CuttingList` is not exported.

- [ ] **Step 3: Implement the `CuttingList` component**

Replace the full contents of `src/ui/CuttingList.tsx` with:

```tsx
import { useEffect } from 'react'
import type { Part } from '../scene/types'

export function buildCsv(parts: Part[]): string {
  const header = 'Label,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = parts.map((p) => {
    const label = p.label.includes(',') ? `"${p.label}"` : p.label
    return `${label},${p.length},${p.width},${p.thickness},${p.cuts.length}`
  })
  return [header, ...rows].join('\n')
}

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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e1e21',
          border: '1px solid #2a2a2d',
          borderRadius: 8,
          padding: 24,
          minWidth: 480,
          maxWidth: 640,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          color: '#ccc',
          fontSize: 13,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e5e5e7' }}>
            Cutting List
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2d', color: '#888', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>Label</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Length (mm)</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Width (mm)</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Thickness (mm)</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Cuts</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: '12px 0', color: '#555', textAlign: 'center' }}
                >
                  No parts
                </td>
              </tr>
            ) : (
              parts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #1a1a1d' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>{p.label}</td>
                  <td style={{ padding: '6px 8px' }}>{p.length}</td>
                  <td style={{ padding: '6px 8px' }}>{p.width}</td>
                  <td style={{ padding: '6px 8px' }}>{p.thickness}</td>
                  <td style={{ padding: '6px 8px' }}>{p.cuts.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCopy}
            style={{
              background: '#2a2a2d',
              border: '1px solid #3a3a3d',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 13,
              padding: '6px 12px',
            }}
          >
            Copy CSV
          </button>
          <button
            onClick={handleDownload}
            style={{
              background: '#2a2a2d',
              border: '1px solid #3a3a3d',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 13,
              padding: '6px 12px',
            }}
          >
            Download .csv
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify all 15 pass**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: 15 passed (5 `buildCsv` + 10 `CuttingList`).

- [ ] **Step 5: Commit**

```bash
git add src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx
git commit -m "feat: add CuttingList modal component"
```

---

#### Task 3: Wire `FileMenu`

**Files:**
- Modify: `src/ui/FileMenu.tsx`
- Modify: `src/ui/FileMenu.test.tsx`

**Context — current `FileMenuProps` (from `src/ui/FileMenu.tsx`):**

```ts
export interface FileMenuProps {
  fileName: string | null
  projectName: string
  isDirty: boolean
  fileError: string | null
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onProjectNameChange: (name: string) => void
  partsCount: number
  supported: boolean
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  onUndo: () => void
  onRedo: () => void
}
```

You will add `onCuttingList: () => void` to this interface, destructure it in the function, and add a menu item after "Save As…".

**Context — `menuItem` helper already in `FileMenu.tsx`:**

```tsx
const menuItem = (label: string, shortcut: string, onClick: () => void, disabled: boolean) => (
  <button onClick={disabled ? undefined : () => { onClick(); setIsOpen(false) }} disabled={disabled} ...>
    <span>{label}</span>
    <span>{shortcut}</span>
  </button>
)
```

Use `menuItem('Cutting List…', '⌘⇧E', onCuttingList, false)` — always enabled (no file needed to generate a list).

- [ ] **Step 1: Write failing tests**

Replace the full contents of `src/ui/FileMenu.test.tsx` with (adds `onCuttingList: vi.fn()` to `baseProps` and appends 2 new tests):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { FileMenuProps } from './FileMenu'
import { FileMenu } from './FileMenu'

const baseProps: FileMenuProps = {
  fileName: null,
  projectName: 'Test Project',
  isDirty: false,
  fileError: null,
  partsCount: 2,
  supported: true,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onProjectNameChange: vi.fn(),
  onCuttingList: vi.fn(),
}

function openMenu() {
  fireEvent.click(screen.getByText('File ▾'))
}

describe('FileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders an Undo button in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeTruthy()
  })

  it('Undo button is disabled when canUndo=false', () => {
    render(<FileMenu {...baseProps} canUndo={false} />)
    openMenu()
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Undo button shows label in quotes: Undo "Add Board 2"', () => {
    render(<FileMenu {...baseProps} canUndo={true} undoLabel="Add Board 2" />)
    openMenu()
    expect(screen.getByRole('button', { name: /Undo "Add Board 2"/ })).toBeTruthy()
  })

  it('clicking Undo when enabled calls onUndo', () => {
    const onUndo = vi.fn()
    render(<FileMenu {...baseProps} canUndo={true} undoLabel="Add Board 2" onUndo={onUndo} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('clicking Undo when disabled does NOT call onUndo', () => {
    const onUndo = vi.fn()
    render(<FileMenu {...baseProps} canUndo={false} onUndo={onUndo} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }))
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('Redo button is disabled when canRedo=false', () => {
    render(<FileMenu {...baseProps} canRedo={false} />)
    openMenu()
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Redo button shows label in quotes: Redo "Add Board 2"', () => {
    render(<FileMenu {...baseProps} canRedo={true} redoLabel="Add Board 2" />)
    openMenu()
    expect(screen.getByRole('button', { name: /Redo "Add Board 2"/ })).toBeTruthy()
  })

  it('clicking Redo when enabled calls onRedo', () => {
    const onRedo = vi.fn()
    render(<FileMenu {...baseProps} canRedo={true} redoLabel="Add Board 2" onRedo={onRedo} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Redo/ }))
    expect(onRedo).toHaveBeenCalledOnce()
  })

  it('Undo button appears above New button in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    const buttons = screen.getAllByRole('button')
    const undoIdx = buttons.findIndex((b) => /^Undo/.test(b.textContent ?? ''))
    const newIdx = buttons.findIndex((b) => /^New/.test(b.textContent ?? ''))
    expect(undoIdx).toBeGreaterThanOrEqual(0)
    expect(newIdx).toBeGreaterThanOrEqual(0)
    expect(undoIdx).toBeLessThan(newIdx)
  })

  it('renders Cutting List menu item in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    expect(screen.getByRole('button', { name: /Cutting List/ })).toBeTruthy()
  })

  it('clicking Cutting List calls onCuttingList and closes the menu', () => {
    const onCuttingList = vi.fn()
    render(<FileMenu {...baseProps} onCuttingList={onCuttingList} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Cutting List/ }))
    expect(onCuttingList).toHaveBeenCalledOnce()
    // menu closes — New button is no longer visible
    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
pnpm vitest run src/ui/FileMenu.test.tsx
```

Expected: 9 existing tests pass (TypeScript error suppressed at runtime); 2 new tests fail — `onCuttingList` not in props, "Cutting List" not rendered. (If TypeScript compile errors prevent running, that is also acceptable — proceed to Step 3.)

- [ ] **Step 3: Update `FileMenu`**

Replace the full contents of `src/ui/FileMenu.tsx` with:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'

export interface FileMenuProps {
  fileName: string | null
  projectName: string
  isDirty: boolean
  fileError: string | null
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onProjectNameChange: (name: string) => void
  onCuttingList: () => void
  partsCount: number
  supported: boolean
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  onUndo: () => void
  onRedo: () => void
}

export function FileMenu({
  fileName,
  projectName,
  isDirty,
  fileError,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onProjectNameChange,
  onCuttingList,
  partsCount,
  supported,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}: FileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    document.title = `${isDirty ? '● ' : ''}${projectName} — Zimmu`
  }, [isDirty, projectName])

  useEffect(() => {
    if (isEditing) inputRef.current?.select()
  }, [isEditing])

  const commitName = useCallback(() => {
    const value = inputRef.current?.value.trim() || 'Untitled'
    onProjectNameChange(value)
    setIsEditing(false)
  }, [onProjectNameChange])

  const isSaveDisabled = !supported || (!isDirty && fileName !== null)

  const menuItem = (label: string, shortcut: string, onClick: () => void, disabled: boolean) => (
    <button
      onClick={
        disabled
          ? undefined
          : () => {
              onClick()
              setIsOpen(false)
            }
      }
      disabled={disabled}
      aria-disabled={disabled}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: '6px 12px',
        background: 'none',
        border: 'none',
        color: disabled ? '#555' : '#ccc',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13,
        gap: 32,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      <span style={{ opacity: 0.55, fontSize: 11 }}>{shortcut}</span>
    </button>
  )

  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        background: '#18181b',
        borderBottom: '1px solid #2a2a2d',
        fontSize: 13,
        color: '#ccc',
        userSelect: 'none',
        gap: 4,
        padding: '0 8px',
      }}
    >
      {/* Left: wordmark + File menu */}
      <span style={{ fontWeight: 600, letterSpacing: 1, marginRight: 4, opacity: 0.9 }}>Zimmu</span>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen((o) => !o)}
          style={{
            background: isOpen ? '#2a2a2d' : 'none',
            border: 'none',
            color: '#ccc',
            padding: '4px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          File ▾
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 2,
              background: '#1e1e21',
              border: '1px solid #2a2a2d',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 100,
              minWidth: 180,
              padding: '4px 0',
            }}
          >
            {menuItem(undoLabel ? `Undo "${undoLabel}"` : 'Undo', '⌘Z', onUndo, !canUndo)}
            {menuItem(redoLabel ? `Redo "${redoLabel}"` : 'Redo', '⌘⇧Z', onRedo, !canRedo)}
            <div style={{ height: 1, background: '#2a2a2d', margin: '4px 0' }} />
            {menuItem('New', '⌘N', onNew, !supported)}
            {menuItem('Open…', '⌘O', onOpen, !supported)}
            <div style={{ height: 1, background: '#2a2a2d', margin: '4px 0' }} />
            {menuItem('Save', '⌘S', onSave, isSaveDisabled)}
            {menuItem('Save As…', '⌘⇧S', onSaveAs, !supported)}
            <div style={{ height: 1, background: '#2a2a2d', margin: '4px 0' }} />
            {menuItem('Cutting List…', '⌘⇧E', onCuttingList, false)}
          </div>
        )}
      </div>

      {/* Center: dirty indicator + project name + filename */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        {isDirty && <span style={{ color: '#888', fontSize: 10 }}>●</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={projectName}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            style={{
              background: '#2a2a2d',
              border: '1px solid #444',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
              padding: '2px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            title="Click to rename"
            style={{
              cursor: 'text',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {projectName}
          </span>
        )}
        {fileError ? (
          <span style={{ color: '#f87171', fontSize: 12 }}>{fileError}</span>
        ) : fileName ? (
          <span style={{ color: '#555', fontSize: 12 }}>· {fileName}</span>
        ) : !supported ? (
          <span style={{ color: '#555', fontSize: 12 }}>· Save/Load requires Chrome or Edge</span>
        ) : null}
      </div>

      {/* Right: parts count */}
      <span style={{ opacity: 0.5, fontSize: 12, flexShrink: 0 }}>
        {partsCount} {partsCount === 1 ? 'part' : 'parts'}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify all 11 pass**

```bash
pnpm vitest run src/ui/FileMenu.test.tsx
```

Expected: 11 passed (9 original + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/ui/FileMenu.tsx src/ui/FileMenu.test.tsx
git commit -m "feat: add Cutting List menu item to FileMenu"
```

---

#### Task 4: Wire `App.tsx`

**Files:**
- Modify: `src/App.tsx`

No new tests are written for this task — `CuttingList` and `FileMenu` are fully covered by their component tests. This task is integration wiring only.

**Changes required (relative to the current `src/App.tsx`):**

1. Add import: `import { CuttingList } from './ui/CuttingList'`
2. Add state inside `App()`: `const [cuttingListOpen, setCuttingListOpen] = useState(false)`
3. In the keyboard handler's modifier block, add after the redo shortcut:
   ```ts
   if (e.shiftKey && k === 'e') {
     e.preventDefault()
     setCuttingListOpen(true)
   }
   ```
4. Pass `onCuttingList={() => setCuttingListOpen(true)}` to `<FileMenu>`.
5. After the closing `</div>` of the flex row (viewport + sidebar), render:
   ```tsx
   {cuttingListOpen && (
     <CuttingList
       parts={scene.parts}
       projectName={projectName}
       onClose={() => setCuttingListOpen(false)}
     />
   )}
   ```

- [ ] **Step 1: Apply all five changes to `src/App.tsx`**

The full updated `src/App.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useScene } from './scene/useScene'
import { useFile } from './scene/useFile'
import { useSnap } from './scene/useSnap'
import { useAddCut } from './scene/useAddCut'
import { Viewport } from './render/viewport'
import { Sidebar } from './ui/sidebar'
import { FileMenu } from './ui/FileMenu'
import { CuttingList } from './ui/CuttingList'
import type { CameraState } from './scene/types'

const supported = 'showOpenFilePicker' in window

function App() {
  const {
    scene,
    replaceScene,
    geometries,
    errors,
    pendingIds,
    selectedId,
    occtReady,
    nextLabel,
    onAdd,
    onRemove,
    onDuplicate,
    onUpdate,
    onUpdateCut,
    onRemoveCut,
    onLinkCuts,
    onUnlinkCuts,
    onSelect,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo,
    redo,
  } = useScene()

  const {
    snapActive,
    snapPhase,
    sourceFace,
    hoveredFace,
    activateSnap,
    cancelSnap,
    onFaceClick,
    onFaceHover,
  } = useSnap({ parts: scene.parts, onUpdate })

  const {
    cutActive,
    lastPlacedCutId,
    activateCut,
    cancelCut,
    onFaceClick: onFaceClickCut,
    onFaceHover: onFaceHoverCut,
  } = useAddCut({ parts: scene.parts, onUpdate, onSelect })

  const cameraStateRef = useRef<CameraState>({
    position: { x: 250, y: -200, z: 150 },
    target: { x: 0, y: 0, z: 0 },
  })
  const [loadedCamera, setLoadedCamera] = useState<CameraState | null>(null)
  const [cuttingListOpen, setCuttingListOpen] = useState(false)

  const {
    fileReady,
    fileName,
    projectName,
    isDirty,
    fileError,
    newFile,
    openFile,
    saveFile,
    saveAsFile,
    setProjectName,
  } = useFile({
    scene,
    getCameraState: () => cameraStateRef.current,
    onFileLoaded: (envelope) => {
      replaceScene(envelope.scene)
      cameraStateRef.current = envelope.camera
      setLoadedCamera(envelope.camera)
    },
  })

  const handleActivateCut = useCallback(() => {
    cancelSnap()
    activateCut()
  }, [cancelSnap, activateCut])
  const handleActivateSnap = useCallback(() => {
    cancelCut()
    activateSnap()
  }, [cancelCut, activateSnap])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const mod = e.metaKey || e.ctrlKey

      // Non-modifier shortcuts
      if (!mod) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault()
          handleActivateSnap()
          return
        }
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault()
          handleActivateCut()
          return
        }
        if (e.key === 'Escape') {
          if (cutActive) cancelCut()
          if (snapActive) cancelSnap()
          return
        }
        return
      }

      // Modifier shortcuts
      const k = e.key.toLowerCase()
      if (!e.shiftKey && k === 's') {
        e.preventDefault()
        void saveFile()
      }
      if (e.shiftKey && k === 's') {
        e.preventDefault()
        void saveAsFile()
      }
      if (!e.shiftKey && k === 'o') {
        e.preventDefault()
        void openFile()
      }
      if (!e.shiftKey && k === 'n') {
        e.preventDefault()
        void newFile()
      }
      if (!e.shiftKey && k === 'z') {
        e.preventDefault()
        undo()
      }
      if ((e.shiftKey && k === 'z') || (k === 'y' && !e.shiftKey)) {
        e.preventDefault()
        redo()
      }
      if (e.shiftKey && k === 'e') {
        e.preventDefault()
        setCuttingListOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    saveFile,
    saveAsFile,
    openFile,
    newFile,
    undo,
    redo,
    handleActivateCut,
    handleActivateSnap,
    cancelCut,
    cutActive,
    cancelSnap,
    snapActive,
  ])

  if (!fileReady) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <FileMenu
        fileName={fileName}
        projectName={projectName}
        isDirty={isDirty}
        fileError={fileError}
        partsCount={scene.parts.length}
        supported={supported}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onUndo={undo}
        onRedo={redo}
        onNew={() => {
          void newFile()
        }}
        onOpen={() => {
          void openFile()
        }}
        onSave={() => {
          void saveFile()
        }}
        onSaveAs={() => {
          void saveAsFile()
        }}
        onProjectNameChange={setProjectName}
        onCuttingList={() => setCuttingListOpen(true)}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Viewport
          parts={scene.parts}
          geometries={geometries}
          selectedId={selectedId}
          onPartClick={onSelect}
          cameraStateRef={cameraStateRef}
          loadedCamera={loadedCamera}
          snapActive={snapActive}
          snapPhase={snapPhase}
          sourceFace={sourceFace}
          hoveredFace={hoveredFace}
          onFaceClick={onFaceClick}
          onFaceHover={onFaceHover}
          cutActive={cutActive}
          onFaceClickCut={onFaceClickCut}
          onFaceHoverCut={onFaceHoverCut}
        />
        <Sidebar
          scene={scene}
          occtReady={occtReady}
          errors={errors}
          pendingIds={pendingIds}
          nextLabel={nextLabel}
          onAdd={onAdd}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onUpdate={onUpdate}
          onUpdateCut={onUpdateCut}
          onRemoveCut={onRemoveCut}
          onLinkCuts={onLinkCuts}
          onUnlinkCuts={onUnlinkCuts}
          lastPlacedCutId={lastPlacedCutId}
          selectedId={selectedId}
          onSelect={onSelect}
          snapActive={snapActive}
          snapPhase={snapPhase}
          onSnapToggle={handleActivateSnap}
          cutActive={cutActive}
          onCutToggle={handleActivateCut}
        />
      </div>
      {cuttingListOpen && (
        <CuttingList
          parts={scene.parts}
          projectName={projectName}
          onClose={() => setCuttingListOpen(false)}
        />
      )}
    </div>
  )
}

export default App
```

- [ ] **Step 2: Run full suite — verify all tests pass and typecheck is clean**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected:
```
Tests: 185 passed | 5 skipped (190)
```
(168 existing + 5 buildCsv + 10 CuttingList + 2 FileMenu = 185)

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire CuttingList modal into App with Ctrl+Shift+E shortcut"
```

---

### Self-Review

#### Spec Coverage

| Requirement | Task |
|-------------|------|
| Cutting list modal | Task 2 (`CuttingList` component) |
| Accessible from File menu | Task 3 (menu item) + Task 4 (wire) |
| Table: label, length, width, thickness, cuts | Task 2 (table columns + rows) |
| Copy CSV action | Task 2 (`handleCopy`) |
| Download .csv action | Task 2 (`handleDownload`) |
| Download filename = `projectName.csv` | Task 2 (`a.download = \`${projectName}.csv\``) |
| Ctrl+Shift+E keyboard shortcut | Task 4 |
| Escape / overlay / close button to dismiss | Task 2 (three dismiss paths) |
| "No parts" empty state | Task 2 |
| Comma in label escaped in CSV | Task 1 (`buildCsv`) |

All requirements covered. ✓

#### Placeholder Scan

No TBDs, TODOs, or placeholder prose. Every step has executable code. ✓

#### Type Consistency

- `buildCsv(parts: Part[]): string` — defined Task 1, used in Task 2 component and tests. ✓
- `CuttingListProps { parts: Part[]; projectName: string; onClose: () => void }` — defined Task 2, used in Task 4. ✓
- `FileMenuProps.onCuttingList: () => void` — added Task 3, used in Task 4. ✓
- `baseProps.onCuttingList: vi.fn()` — added to test file in Task 3 Step 1, satisfies required prop. ✓


---

## Cutting List: Material Field + Quantity Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `material: string` field to `BoardPart` and upgrade the cutting list table + CSV export to group identical pieces into single rows with a quantity count.

**Architecture:** The `material` field is additive to the data model; old files gain `material: ''` on load. A new `groupParts()` utility in `buildCsv.ts` is shared by both the table UI and CSV export. Four tasks proceed in dependency order: data model first, then grouping logic, then cutting list UI, then sidebar input.

**Tech Stack:** TypeScript 6 strict mode, React 19, Vitest + happy-dom + @testing-library/react, shadcn/ui `Input` component.

**Spec:** `docs/superpowers/specs/2026-06-03-cutting-list-material-grouping-design.md`

---

#### Task 1: Add `material` field to the data model

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

#### Task 2: `groupParts()` utility and `buildCsv` rewrite

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

#### Task 3: CuttingList UI — 7-column grouped table

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

#### Task 4: Sidebar material input

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

### Notes file

Create `docs/superpowers/notes/2026-06-03-cutting-list-material-grouping-notes.md` and record any implementation decisions that deviate from the spec, or unexpected constraints found during implementation.

---

### Self-Review

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


---

## Cutting List Color Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Color column (swatch + hex) to the cutting list table and CSV export, with color folded into the grouping key so parts differing only in color appear as separate rows.

**Architecture:** Two coordinated changes inside `src/ui/`: (1) `buildCsv.ts` — add color to the grouping key, add `color` to `GroupedRow`, add a `Color` CSV column; (2) `CuttingList.tsx` — add a `Color` table column with a swatch + hex cell and bump the empty-state `colSpan`. No `types.ts`, `useScene`, or file-format change — `color` already exists on `BoardPart`.

**Tech Stack:** TypeScript strict mode, Vitest + @testing-library/react, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-06-04-cutting-list-color-design.md`

---

### File map

| File | Change |
|------|--------|
| `src/ui/buildCsv.ts` | **Modify** — grouping key (line 20), `GroupedRow` (line 3), `map.set` (line 28), CSV header (line 52) + row (line 54) |
| `src/ui/CuttingList.tsx` | **Modify** — add `Color` `<th>` (after line 66), `<td>` (after line 85), bump `colSpan` 7→8 (line 76) |
| `src/ui/CuttingList.test.tsx` | **Modify** — update 5 breaking assertions, add 4 new tests, add `Color` header check |

Both source files are consumed only by each other and the one test file (verified by grep). No other consumers exist.

---

### Task 1: Color in grouping + CSV (`buildCsv.ts`)

**Files:**
- Modify: `src/ui/buildCsv.ts` (lines 3, 20, 28, 52, 54)
- Test: `src/ui/CuttingList.test.tsx`

This task is TDD. Write/update the data-layer tests first (they fail), then make
the minimal code changes to pass. The table (DOM) changes are Task 2.

#### Step 1: Update the breaking data-layer assertions and add the new data-layer tests

- [ ] **Open `src/ui/CuttingList.test.tsx`. Make these 3 edits inside the
  `describe('buildCsv', …)` block.**

Edit 1 — the empty-header test (currently line 28). Replace:

```ts
    expect(buildCsv([])).toBe('Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts')
```

with:

```ts
    expect(buildCsv([])).toBe(
      'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts',
    )
```

Edit 2 — `formats a data row with correct field values` (currently line 41).
Replace:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,600,300,18,0')
```

with:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,#8b6914,600,300,18,0')
```

Edit 3 — `includes the cut count` (currently line 62). Replace:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,600,300,18,2')
```

with:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,#8b6914,600,300,18,2')
```

- [ ] **Make a fourth edit inside the `describe('CuttingList', …)` block, in the
  `Copy CSV button writes CSV content to clipboard` test (currently lines
  287–291). This asserts `buildCsv` string output, so it must change in lockstep
  with the CSV change in this task — otherwise the suite goes red the moment this
  task's implementation lands. Replace:**

```ts
    expect(csvArg.split('\n')[0]).toBe(
      'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts',
    )
    expect(csvArg).toContain('1,Left Side,,600,300,18,0')
```

**with:**

```ts
    expect(csvArg.split('\n')[0]).toBe(
      'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts',
    )
    expect(csvArg).toContain('1,Left Side,,#8b6914,600,300,18,0')
```

- [ ] **Add one new test at the end of the `describe('buildCsv', …)` block, right
  before its closing `})` (currently line 86):**

```ts
  it('puts different colors on separate rows', () => {
    const csv = buildCsv([
      makePart({ id: 'p1', color: '#8b6914' }),
      makePart({ id: 'p2', color: '#ff0000' }),
    ])
    expect(csv.split('\n')).toHaveLength(3)
  })
```

- [ ] **Add two new tests at the end of the `describe('groupParts', …)` block,
  right before its closing `})` (currently line 163):**

```ts
  it('carries color onto the grouped row', () => {
    expect(groupParts([makePart()])[0].color).toBe('#8b6914')
  })

  it('splits parts that differ only by color into separate rows', () => {
    const rows = groupParts([
      makePart({ id: 'p1', color: '#8b6914' }),
      makePart({ id: 'p2', color: '#ff0000' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].color).toBe('#8b6914')
    expect(rows[1].color).toBe('#ff0000')
  })
```

#### Step 2: Run the test file to confirm the data-layer tests fail

- [ ] **Run the whole file (not a filtered subset — the Copy CSV assertion lives
  in the `CuttingList` describe and must be checked here too):**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected — these fail (CSV/grouping not yet color-aware):
- `buildCsv > returns only the header…` (header lacks `Color`)
- `buildCsv > formats a data row…` and `> includes the cut count` (row lacks hex)
- `buildCsv > puts different colors on separate rows` (1 row, not 2 → 2 lines, not 3)
- `groupParts > carries color onto the grouped row` (`row.color` is `undefined`)
- `groupParts > splits parts that differ only by color…` (groups into 1 row)
- `CuttingList > Copy CSV button…` (header + row lack the color column)

All other tests pass — the DOM `Color` column does not exist yet, but no test
asserts it until Task 2.

#### Step 3: Add `color` to the `GroupedRow` interface

- [ ] **In `src/ui/buildCsv.ts`, add a `color` field to `GroupedRow` (currently
  lines 3–13), placed after `material`:**

```ts
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
}
```

#### Step 4: Add color to the grouping key

- [ ] **In `groupParts()`, change the key (currently line 20) from:**

```ts
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}`
```

**to:**

```ts
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}|${p.color}`
```

#### Step 5: Populate `color` in the new-group branch

- [ ] **In the `map.set(key, { … })` call (currently starting line 28), add
  `color: p.color` after `material: p.material`:**

```ts
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
      })
```

The accumulation branch (existing group found) is unchanged — every row has a
single color by construction.

#### Step 6: Add the Color column to the CSV output

- [ ] **Change the CSV header (currently line 52) from:**

```ts
  const header = 'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'
```

**to:**

```ts
  const header = 'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts'
```

- [ ] **Change the row builder (currently line 54) from:**

```ts
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.length},${row.width},${row.thickness},${row.cuts}`
```

**to:**

```ts
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.cuts}`
```

`row.color` is output raw — hex strings never contain a comma, quote, or newline,
so `quoteField` is unnecessary (matches the unquoted numeric columns).

#### Step 7: Run the whole test file to confirm it is fully green

- [ ] **Run:**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: **all** tests in the file pass — the updated CSV/grouping assertions,
the 3 new data-layer tests, and the updated Copy CSV test. The DOM `Color`
column is not yet present, but no test asserts it until Task 2, so the suite is
green. This task therefore commits a green suite.

#### Step 8: Typecheck and commit

- [ ] **Run:**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Commit:**

```bash
git add src/ui/buildCsv.ts src/ui/CuttingList.test.tsx
git commit -m "feat: add color to cutting list grouping and CSV export"
```

---

### Task 2: Color column in the table (`CuttingList.tsx`)

**Files:**
- Modify: `src/ui/CuttingList.tsx` (lines 66, 76, 85)
- Test: `src/ui/CuttingList.test.tsx`

#### Step 1: Add the DOM `Color` assertions

(The Copy CSV string assertion was already updated in Task 1, since it tests
`buildCsv` output. This task only adds DOM-level assertions for the table column.)

- [ ] **In the `renders table column headers` test (currently lines 184–194), add a
  `Color` assertion after the `Material` line (currently line 188):**

```ts
    expect(screen.getByText('Material')).toBeTruthy()
    expect(screen.getByText('Color')).toBeTruthy()
```

- [ ] **Add one new test at the end of the `describe('CuttingList', …)` block, right
  before its closing `})` (currently line 293):**

```ts
  it('renders the Color column header and the hex value for a part', () => {
    render(<CuttingList parts={[makePart()]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Color')).toBeTruthy()
    expect(screen.getByText('#8b6914')).toBeTruthy()
  })
```

A single part is rendered on purpose — `getByText('#8b6914')` would throw if two
rows shared a color and produced two matching nodes.

#### Step 2: Run the test file to confirm the two DOM tests fail

- [ ] **Run:**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: exactly two failures, both because the `Color` `<th>`/`<td>` do not
exist yet:
- `CuttingList > renders table column headers` (no `Color` header)
- `CuttingList > renders the Color column header and the hex value for a part`

Every other test passes (Task 1 made all CSV/grouping assertions green).

#### Step 3: Add the Color header column

- [ ] **In `src/ui/CuttingList.tsx`, add a `Color` `<th>` between the `Material`
  header (line 66) and the `Length (mm)` header (line 67):**

```tsx
              <th className="pb-2 px-2 font-medium text-xs">Material</th>
              <th className="pb-2 px-2 font-medium text-xs">Color</th>
              <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
```

#### Step 4: Add the Color data cell

- [ ] **Add a `Color` `<td>` between the material cell (line 85) and the length
  cell (line 86):**

```tsx
                  <td className="py-1.5 px-2 text-xs">{row.material || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm border border-border flex-shrink-0"
                        style={{ background: row.color }}
                      />
                      {row.color}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-xs">{row.length}</td>
```

#### Step 5: Bump the empty-state colSpan

- [ ] **Change the empty-state cell's `colSpan` (currently line 76) from `7` to
  `8`:**

```tsx
                <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
```

#### Step 6: Run the full test file to confirm everything passes

- [ ] **Run:**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: all tests pass (updated breaking assertions + 4 new tests + Color
header check).

#### Step 7: Typecheck, lint, full suite, commit

- [ ] **Run:**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 0 type errors, 0 lint errors, all tests pass (233 passed | 5 skipped —
229 previous + 4 new).

- [ ] **Commit:**

```bash
git add src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx
git commit -m "feat: add Color column to cutting list table"
```

---

### Self-review checklist

**Spec coverage:**
- ✅ Grouping key includes color (Task 1, Step 4)
- ✅ `GroupedRow.color` field added and populated (Task 1, Steps 3, 5)
- ✅ CSV Color column, raw hex, no quoting (Task 1, Step 6)
- ✅ Table Color `<th>` between Material and Length (Task 2, Step 3)
- ✅ Table Color `<td>`: swatch (`w-3 h-3 rounded-sm border`) + hex (Task 2, Step 4)
- ✅ Empty-state `colSpan` 7→8 (Task 2, Step 5)
- ✅ No color normalization — `===`/exact-string only (no `.toLowerCase()` anywhere)
- ✅ All 5 breaking assertions updated — 3 `buildCsv` + 2 Copy CSV strings all in Task 1 Step 1 (so Task 1 commits green); only DOM assertions in Task 2
- ✅ 4 new tests: 2 `groupParts`, 1 `buildCsv` (Task 1 Step 1), 1 `CuttingList` DOM (Task 2 Step 1)
- ✅ Color header inline-added to `renders table column headers` (Task 2 Step 1)
- ✅ Single-part render for the hex-text DOM test (Task 2 Step 1)
- ✅ Regex assertions left untouched (correctly survive — not edited in any step)

**Placeholder scan:** None found. Every step has exact code, exact line numbers, exact commands.

**Type consistency:** `GroupedRow.color: string` (Task 1 Step 3) matches `p.color` (a `BoardPart` hex string) in Steps 4–5; matches `row.color` usage in CSV (Step 6) and the table cell (Task 2 Step 4). `makePart()` already sets `color: '#8b6914'`, so all assertions using that value are consistent.

**Green-suite-per-task invariant:** All CSV-string assertions (including Copy CSV) are updated in Task 1, in lockstep with the `buildCsv` change, so Task 1 commits a fully green suite. Task 2 adds only DOM assertions, which fail until the `Color` `<th>`/`<td>` exist. No task commits a red suite.


---

## Enhanced Cutting List — Full BOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the cutting list into a full Bill of Materials: boards tab with per-material cost rates and per-row cost columns, plus a hardware tab for manually-entered items (screws, hinges, etc.) with supplier, part number, unit cost, and notes.

**Architecture:** Thin `BomModal` tab wrapper (new) contains the existing `CuttingList` as the Boards tab and a new `HardwareTab`. `Scene` gains `materials: Record<string, MaterialDef>` and `hardware: HardwareItem[]`. All existing `setScene` calls in `useScene.ts` currently construct `{ parts: ... }` without spreading `...prev`, which will silently drop the new fields — those calls must all be fixed to `{ ...prev, parts: ... }`. `BomModal` replaces `CuttingList` at the `App.tsx` call site.

**Tech Stack:** React 19, TypeScript strict (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn/Radix primitives.

**Spec:** `docs/superpowers/specs/2026-06-07-enhanced-cutting-list-bom-design.md`

---

### File Map

#### Create
| File | Responsibility |
|------|---------------|
| `src/ui/HardwareEditPanel.tsx` | 7-field form + Save / Cancel / Delete |
| `src/ui/HardwareEditPanel.test.tsx` | Field entry, save, cancel, delete confirm |
| `src/ui/HardwareTab.tsx` | Hardware table + edit panel layout |
| `src/ui/HardwareTab.test.tsx` | Add / select / delete flow |
| `src/ui/BomModal.tsx` | Tab wrapper, grand total footer, CSV dispatch |
| `src/ui/BomModal.test.tsx` | Tab switching, grand total, CSV buttons |
| `src/ui/buildCsv.test.ts` | Cost columns, hardware CSV, subtotal rows |

#### Modify
| File | Change |
|------|--------|
| `src/scene/types.ts` | Add `MaterialDef`, `HardwareItem`; extend `Scene` |
| `src/scene/useScene.ts` | Fix all `setScene` calls to spread `...prev`; fix initial state; add `onUpdateMaterial` + `onUpdateHardware` |
| `src/scene/useFile.ts` | Bump `FILE_FORMAT_VERSION` to 2; export `parseFile`; migration defaults |
| `src/ui/buildCsv.ts` | Extend `GroupedRow`; cost params on `groupParts`/`buildCsv`; add `buildHardwareCsv` |
| `src/ui/CuttingList.tsx` | Three new props; cost columns; material popover; subtotal row |
| `src/App.tsx` | Swap `CuttingList` → `BomModal`; wire `onUpdateMaterial`, `onUpdateHardware` |

---

### Task 1: Data types

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

### Task 2: Scene state management

**Files:**
- Modify: `src/scene/useScene.ts`
- Modify: `src/scene/useScene.test.ts`

This task has two phases:
1. **Fix all existing `setScene` calls** to spread `...prev` (so `materials` and `hardware` are preserved).
2. **Add `onUpdateMaterial` and `onUpdateHardware`** handlers with undo/redo.

#### Phase A — Fix setScene calls

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

#### Phase B — Add new handlers

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

### Task 3: File format migration

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

### Task 4: CSV export — cost columns and hardware CSV

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

### Task 5: CuttingList — cost columns and material rate popover

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

### Task 6: HardwareEditPanel

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

### Task 7: HardwareTab

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

### Task 8: BomModal

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

### Task 9: App.tsx wiring

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

### Implementation Notes

Create `docs/superpowers/notes/2026-06-07-enhanced-cutting-list-bom-notes.md` after completing all tasks to record any decisions that deviated from this plan or non-obvious findings during implementation.

Key invariants to preserve:
- **`replaceScene(next: Scene)`** in `useScene.ts` takes a *complete* scene (including `materials`/`hardware`). When `onFileLoaded` fires in `App.tsx`, it calls `replaceScene(envelope.scene)` with the parsed scene that already has the migration defaults applied.
- **`groupParts`** is still called with no `materials` argument from `buildCsv.test.ts` tests for the standalone cutting list — the `= {}` default must remain.
- **`CuttingList` in standalone mode** still works identically to before this feature: no `materials`, no `onMaterialCostChange` → all cost columns show `—`, no subtotal row, CSV has empty cost cells.
- **`coalesceKey: 'material:{name}'`** ensures rapid `$/m²` edits (e.g., from arrow-key in the popover input) coalesce into a single undo entry per material.


---

## Persistent Material Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-material cost rates in IndexedDB so they seed the BOM modal across projects automatically.

**Architecture:** A new `'library'` IDB store is added to the existing `'zimmu'` database (version bump 1→2). A `useMaterialLibrary` hook loads the library on app start and exposes `saveRate`/`deleteEntry`. `BomModal` merges `{ ...library, ...materials }` into `effectiveMaterials` (project rates always win) and passes it to `CuttingList`. Every committed rate change auto-saves to the library. A third "Library" tab lets users view and delete stored entries.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom + @testing-library/react, fake-indexeddb (already polyfilled in vitest.setup.ts)

**Spec:** `docs/superpowers/specs/2026-06-08-material-library-design.md`

---

### File Structure

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

#### Task 1: IDB data layer

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

#### Task 2: useMaterialLibrary hook

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

#### Task 3: Fix MaterialPopover.commit() — no-op when value unchanged

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

#### Task 4: BomModal — library tab, effectiveMaterials, dual-write

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

#### Task 5: App.tsx — wire useMaterialLibrary into BomModal

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

### Done criteria

- [ ] All tests pass: `pnpm test` — 338+ tests, 0 failures
- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`
- [ ] Opening BOM with a library-seeded material shows the cost without dirtying the file
- [ ] Setting a rate in the Boards tab auto-saves to library (persists across sessions)
- [ ] Library tab shows entries sorted alphabetically with working Delete buttons
- [ ] CSV buttons disabled when Library tab is active


---

## Linked Hardware to Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users associate hardware items with specific boards. A "Linked parts" section in `HardwareEditPanel` shows checkboxes for each board in the project; the part's `EditPanel` in the sidebar shows which hardware items are attached to it.

**Architecture:** `linkedPartIds: string[]` already exists on `HardwareItem` (currently always `[]`). No type changes. Three changes needed: (1) `HardwareEditPanel` gains a `parts` prop and renders checkboxes; (2) `HardwareTab` and `BomModal` thread `parts` down; (3) the sidebar `EditPanel` reads `scene.hardware` (already available via `scene` prop) and renders a read-only "Hardware" section for any linked items.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom + @testing-library/react

**Spec:** none — plan-only; no design spec was written for this feature.

---

### File Structure

| File | Change |
|------|--------|
| `src/ui/HardwareEditPanel.tsx` | Add `parts: Part[]` prop; render "Linked parts" checkboxes |
| `src/ui/HardwareEditPanel.test.tsx` | Add tests for checkbox rendering and toggle behaviour |
| `src/ui/HardwareTab.tsx` | Add `parts: Part[]` prop; pass through to `HardwareEditPanel` |
| `src/ui/HardwareTab.test.tsx` | Update `props()` fixture; add one test for parts passthrough |
| `src/ui/BomModal.tsx` | Pass `parts={parts}` to `<HardwareTab>` |
| `src/ui/BomModal.test.tsx` | Verify no regression (parts already in baseProps) |
| `src/ui/sidebar.tsx` | Add "Hardware" section to `EditPanel` listing linked items |
| `src/ui/sidebar.test.tsx` | Add tests for hardware section in EditPanel |

---

#### Task 1: HardwareEditPanel — linked parts checkboxes

**Files:**
- Modify: `src/ui/HardwareEditPanel.tsx`
- Modify: `src/ui/HardwareEditPanel.test.tsx`

**Design decisions:**

- `parts` prop is `Part[]`. If empty, render the section header with the text "No boards in project".
- The section appears between the "Notes" field and the footer buttons row, under a label "Linked boards".
- Each part gets a `<label>` + `<input type="checkbox">` row. Checked when `draft.linkedPartIds.includes(part.id)`.
- Toggling a checkbox calls `field('linkedPartIds', ...)`:
  - Check → spread `[...prev, part.id]` (no duplicates; deduplicate with `Set`).
  - Uncheck → `prev.filter(id => id !== part.id)`.
- `linkedPartIds` is part of `draft` — toggling a checkbox does **not** immediately call `onSave`. The user still presses "Save" to commit.
- **No type changes.** `linkedPartIds` is already `string[]`.

- [ ] **Step 1: Write failing tests**

In `src/ui/HardwareEditPanel.test.tsx`, add these tests after the existing ones:

```ts
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'part_1',
    label: 'Side Panel',
    length: 400,
    width: 200,
    thickness: 18,
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

describe('Linked parts section', () => {
  it('renders a checkbox for each part', () => {
    const parts = [makePart({ id: 'p1', label: 'Side' }), makePart({ id: 'p2', label: 'Top' })]
    render(<HardwareEditPanel {...baseItem()} parts={parts} />)
    expect(screen.getByLabelText('Side')).toBeTruthy()
    expect(screen.getByLabelText('Top')).toBeTruthy()
  })

  it('checkbox is checked when part id is in linkedPartIds', () => {
    const parts = [makePart({ id: 'p1', label: 'Side' })]
    render(
      <HardwareEditPanel
        {...baseItem({ linkedPartIds: ['p1'] })}
        parts={parts}
      />,
    )
    expect((screen.getByLabelText('Side') as HTMLInputElement).checked).toBe(true)
  })

  it('checkbox is unchecked when part id is not in linkedPartIds', () => {
    const parts = [makePart({ id: 'p1', label: 'Side' })]
    render(<HardwareEditPanel {...baseItem({ linkedPartIds: [] })} parts={parts} />)
    expect((screen.getByLabelText('Side') as HTMLInputElement).checked).toBe(false)
  })

  it('checking a checkbox adds part id to draft and Save submits it', () => {
    const onSave = vi.fn()
    const parts = [makePart({ id: 'p1', label: 'Side' })]
    render(<HardwareEditPanel {...baseItem({ linkedPartIds: [] })} parts={parts} onSave={onSave} />)
    fireEvent.click(screen.getByLabelText('Side'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const saved = onSave.mock.calls[0][0] as HardwareItem
    expect(saved.linkedPartIds).toContain('p1')
  })

  it('unchecking a checkbox removes part id from draft and Save submits it', () => {
    const onSave = vi.fn()
    const parts = [makePart({ id: 'p1', label: 'Side' })]
    render(
      <HardwareEditPanel
        {...baseItem({ linkedPartIds: ['p1'] })}
        parts={parts}
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByLabelText('Side'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const saved = onSave.mock.calls[0][0] as HardwareItem
    expect(saved.linkedPartIds).not.toContain('p1')
  })

  it('renders "No boards in project" when parts is empty', () => {
    render(<HardwareEditPanel {...baseItem()} parts={[]} />)
    expect(screen.getByText('No boards in project')).toBeTruthy()
  })
})
```

**Note:** The existing `baseItem()` helper in that test file doesn't accept overrides or `parts`. Update it to accept `Partial<HardwareItem>` overrides and add `parts: Part[] = []` as a separate parameter:

```ts
function baseItem(overrides: Partial<HardwareItem> = {}) {
  return {
    item: {
      id: 'hw_1',
      name: 'Screw M4',
      qty: 10,
      unit: 'pcs',
      supplier: '',
      partNumber: '',
      unitCost: 0.05,
      notes: '',
      linkedPartIds: [],
      ...overrides,
    } as HardwareItem,
    parts: [] as Part[],
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
  }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/ui/HardwareEditPanel.test.tsx
```

Expected: FAIL — `HardwareEditPanel` does not accept a `parts` prop and has no checkboxes.

- [ ] **Step 3: Implement the changes in HardwareEditPanel.tsx**

Add `Part` to imports:
```ts
import type { HardwareItem, Part } from '../scene/types'
```

Update `HardwareEditPanelProps` to add `parts`:
```ts
interface HardwareEditPanelProps {
  item: HardwareItem
  parts: Part[]
  onSave: (item: HardwareItem) => void
  onCancel: () => void
  onDelete: (id: string) => void
}
```

Add `parts` to the destructured parameters:
```ts
export function HardwareEditPanel({ item, parts, onSave, onCancel, onDelete }: HardwareEditPanelProps) {
```

Add the "Linked boards" section in the JSX **between the Notes `</div>` and the footer `<div className="flex items-center justify-between...">`**:

```tsx
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Linked boards</label>
        {parts.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">No boards in project</span>
        ) : (
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
            {parts.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.linkedPartIds.includes(p.id)}
                  onChange={(e) => {
                    const ids = new Set(draft.linkedPartIds)
                    if (e.target.checked) ids.add(p.id)
                    else ids.delete(p.id)
                    field('linkedPartIds', [...ids])
                  }}
                  className="accent-primary"
                />
                {p.label}
              </label>
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/ui/HardwareEditPanel.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
pnpm typecheck && pnpm test
```

Expected: typecheck will fail — `HardwareTab` still calls `<HardwareEditPanel>` without `parts`. Do not add a temporary workaround. Task 2 fixes this immediately.

Run only tests here:
```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/HardwareEditPanel.tsx src/ui/HardwareEditPanel.test.tsx
git commit -m "feat(ui): add linked parts checkboxes to HardwareEditPanel"
```

---

#### Task 2: HardwareTab and BomModal — thread parts down

**Files:**
- Modify: `src/ui/HardwareTab.tsx`
- Modify: `src/ui/HardwareTab.test.tsx`
- Modify: `src/ui/BomModal.tsx`
- Modify: `src/ui/BomModal.test.tsx` (verify only — no new tests)

- [ ] **Step 1: Write the failing tests**

In `src/ui/HardwareTab.test.tsx`, update the `props()` fixture to include `parts`:

```ts
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'part_1',
    label: 'Side Panel',
    length: 400,
    width: 200,
    thickness: 18,
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

Update the `props()` helper:
```ts
function props(overrides: Partial<Parameters<typeof HardwareTab>[0]> = {}) {
  return {
    hardware: [],
    parts: [] as Part[],
    onUpdateHardware: vi.fn(),
    ...overrides,
  }
}
```

Add one new test at the end of the describe block:
```ts
it('renders part labels as checkboxes in the edit panel when a part is in the list', () => {
  const parts = [makePart({ id: 'p1', label: 'Side Panel' })]
  render(<HardwareTab {...props({ hardware: [makeItem()], parts })} />)
  fireEvent.click(screen.getByText('Corner bracket'))
  expect(screen.getByLabelText('Side Panel')).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/ui/HardwareTab.test.tsx
```

Expected: FAIL — TypeScript error (missing `parts` prop) and the new test fails.

- [ ] **Step 3: Update HardwareTab.tsx**

Add `Part` to the import:
```ts
import type { HardwareItem, Part } from '../scene/types'
```

Update `HardwareTabProps`:
```ts
interface HardwareTabProps {
  hardware: HardwareItem[]
  parts: Part[]
  onUpdateHardware: (items: HardwareItem[]) => void
}
```

Destructure `parts` in the component signature:
```ts
export function HardwareTab({ hardware, parts, onUpdateHardware }: HardwareTabProps) {
```

Pass `parts` to `HardwareEditPanel`:
```tsx
      {editingItem && (
        <HardwareEditPanel
          key={editingItem.id}
          item={editingItem}
          parts={parts}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
```

- [ ] **Step 4: Update BomModal.tsx**

Pass `parts` to `<HardwareTab>`. Find this line:
```tsx
          ) : tab === 'hardware' ? (
            <HardwareTab hardware={hardware} onUpdateHardware={onUpdateHardware} />
```

Replace with:
```tsx
          ) : tab === 'hardware' ? (
            <HardwareTab hardware={hardware} parts={parts} onUpdateHardware={onUpdateHardware} />
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm vitest run src/ui/HardwareTab.test.tsx src/ui/BomModal.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 6: Run full suite**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/HardwareTab.tsx src/ui/HardwareTab.test.tsx src/ui/BomModal.tsx
git commit -m "feat(ui): thread parts prop through HardwareTab and BomModal to enable linked parts"
```

---

#### Task 3: Sidebar EditPanel — hardware section

**Files:**
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/ui/sidebar.test.tsx`

**Design decisions:**

- `EditPanel` already receives `scene: Scene`, which has `scene.hardware`. No new props needed.
- Filter: `scene.hardware.filter(h => h.linkedPartIds.includes(part.id))`.
- If the filtered list is empty: **do not render the section at all**. Hardware association is an advanced feature; cluttering the panel with an empty "No linked hardware" message for every part is noise.
- If not empty: render a read-only "Hardware" section after the Cuts section, using the same `<p>` header style as "▾ Cuts".
- Each item renders one line: `{item.name} × {item.qty} {item.unit}`.
- The section is read-only — users edit hardware in the BOM modal.

- [ ] **Step 1: Write failing tests**

Add these tests in `src/ui/sidebar.test.tsx`, inside `describe('Sidebar')`:

```ts
  describe('EditPanel hardware section', () => {
    it('does not render a hardware section when no hardware is linked to the selected part', () => {
      const scene = {
        parts: [makeBoard()],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Screw M4',
            qty: 8,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 0,
            notes: '',
            linkedPartIds: [],  // not linked to board_t1
          },
        ],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      expect(screen.queryByText(/▾ Hardware/)).toBeNull()
    })

    it('renders linked hardware items in the EditPanel', () => {
      const scene = {
        parts: [makeBoard()],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Corner bracket',
            qty: 4,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 1.5,
            notes: '',
            linkedPartIds: ['board_t1'],
          },
        ],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      expect(screen.getByText(/▾ Hardware/)).toBeTruthy()
      expect(screen.getByText(/Corner bracket × 4 pcs/)).toBeTruthy()
    })

    it('renders only hardware linked to the selected part', () => {
      const scene = {
        parts: [makeBoard(), makeBoard({ id: 'board_t2', label: 'Board 2' })],
        materials: {},
        hardware: [
          {
            id: 'hw_1',
            name: 'Hinge',
            qty: 2,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 0,
            notes: '',
            linkedPartIds: ['board_t1'],
          },
          {
            id: 'hw_2',
            name: 'Dowel',
            qty: 6,
            unit: 'pcs',
            supplier: '',
            partNumber: '',
            unitCost: 0,
            notes: '',
            linkedPartIds: ['board_t2'],  // linked to a different part
          },
        ],
      }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      expect(screen.getByText(/Hinge/)).toBeTruthy()
      expect(screen.queryByText(/Dowel/)).toBeNull()
    })
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: the three new tests FAIL — no hardware section exists yet.

- [ ] **Step 3: Add the hardware section to EditPanel in sidebar.tsx**

In `EditPanel`, after the Cuts section (`{/* Cuts section — not collapsible; always shown */}` and its content), add:

```tsx
      {/* Hardware section — only shown when hardware is linked to this part */}
      {(() => {
        const linked = scene.hardware.filter((h) => h.linkedPartIds.includes(part.id))
        if (linked.length === 0) return null
        return (
          <>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">▾ Hardware</p>
            {linked.map((hw) => (
              <p key={hw.id} className="text-[11px] text-foreground py-0.5">
                {hw.name} × {hw.qty} {hw.unit}
              </p>
            ))}
          </>
        )
      })()}
```

**Note on `scene.hardware` access:** `EditPanel` already receives `scene: Scene`. `Scene` has `hardware: HardwareItem[]`. No prop changes needed. The `HardwareItem` type is already in scope via the import of `Scene` from `'../scene/types'`.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run full suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all tests pass, no type errors, no lint errors.

- [ ] **Step 6: Commit and push**

```bash
git add src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -m "feat(ui): show linked hardware in sidebar EditPanel"
git push -u origin <current-branch>
```

---

### Done criteria

- [ ] All tests pass: `pnpm test` — no failures
- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`
- [ ] Opening a hardware item's edit form shows part checkboxes; checking and saving persists `linkedPartIds`
- [ ] The sidebar EditPanel shows a "Hardware" section with linked items when any hardware references the selected part
- [ ] The hardware section is absent when no hardware is linked to the selected part
- [ ] Deleting a part does not crash — stale `linkedPartIds` entries silently produce no entries in the hardware section

### Deferred

- Filtering the BOM cutting list by selected part
- Supplier URL fields
- Showing linked part count in the hardware table row
