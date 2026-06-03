# Cutting List Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cutting List modal accessible from the File menu that shows each board's label, dimensions, and cut count as a table, with Copy CSV and Download .csv export actions.

**Architecture:** A pure `buildCsv(parts)` function transforms scene data to CSV text; a `CuttingList` modal component renders the table and action buttons; `FileMenu` gains an `onCuttingList` prop that triggers the modal; `App.tsx` holds the `cuttingListOpen` boolean and wires the four pieces together. No new scene state — the cutting list is a read-only projection of existing `Part[]` data.

**Tech Stack:** React 19, TypeScript strict, Vitest + @testing-library/react, `navigator.clipboard.writeText` for copy, `Blob` + `URL.createObjectURL` for download.

---

## File Map

| File | Change |
|------|--------|
| `src/ui/CuttingList.tsx` | **Create** — `buildCsv` pure function + `CuttingList` modal component |
| `src/ui/CuttingList.test.tsx` | **Create** — `buildCsv` unit tests + `CuttingList` component tests |
| `src/ui/FileMenu.tsx` | **Modify** — add `onCuttingList: () => void` prop + "Cutting List…" menu item |
| `src/ui/FileMenu.test.tsx` | **Modify** — add `onCuttingList` to `baseProps`, add 2 new tests |
| `src/App.tsx` | **Modify** — add `cuttingListOpen` state, wire to `FileMenu` + `CuttingList`, add `Ctrl+Shift+E` shortcut |
| `docs/superpowers/notes/2026-06-01-cutting-list-notes.md` | **Create** — implementation notes |

---

### Task 1: `buildCsv` pure function

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

### Task 2: `CuttingList` modal component

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

### Task 3: Wire `FileMenu`

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

### Task 4: Wire `App.tsx`

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

## Self-Review

### Spec Coverage

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

### Placeholder Scan

No TBDs, TODOs, or placeholder prose. Every step has executable code. ✓

### Type Consistency

- `buildCsv(parts: Part[]): string` — defined Task 1, used in Task 2 component and tests. ✓
- `CuttingListProps { parts: Part[]; projectName: string; onClose: () => void }` — defined Task 2, used in Task 4. ✓
- `FileMenuProps.onCuttingList: () => void` — added Task 3, used in Task 4. ✓
- `baseProps.onCuttingList: vi.fn()` — added to test file in Task 3 Step 1, satisfies required prop. ✓
