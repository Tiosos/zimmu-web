# Linked Hardware to Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users associate hardware items with specific boards. A "Linked parts" section in `HardwareEditPanel` shows checkboxes for each board in the project; the part's `EditPanel` in the sidebar shows which hardware items are attached to it.

**Architecture:** `linkedPartIds: string[]` already exists on `HardwareItem` (currently always `[]`). No type changes. Three changes needed: (1) `HardwareEditPanel` gains a `parts` prop and renders checkboxes; (2) `HardwareTab` and `BomModal` thread `parts` down; (3) the sidebar `EditPanel` reads `scene.hardware` (already available via `scene` prop) and renders a read-only "Hardware" section for any linked items.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom + @testing-library/react

**Spec:** none — plan-only; no design spec was written for this feature.

---

## File Structure

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

### Task 1: HardwareEditPanel — linked parts checkboxes

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

### Task 2: HardwareTab and BomModal — thread parts down

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

### Task 3: Sidebar EditPanel — hardware section

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

## Done criteria

- [ ] All tests pass: `pnpm test` — no failures
- [ ] No type errors: `pnpm typecheck`
- [ ] No lint errors: `pnpm lint`
- [ ] Opening a hardware item's edit form shows part checkboxes; checking and saving persists `linkedPartIds`
- [ ] The sidebar EditPanel shows a "Hardware" section with linked items when any hardware references the selected part
- [ ] The hardware section is absent when no hardware is linked to the selected part
- [ ] Deleting a part does not crash — stale `linkedPartIds` entries silently produce no entries in the hardware section

## Deferred

- Filtering the BOM cutting list by selected part
- Supplier URL fields
- Showing linked part count in the hardware table row
