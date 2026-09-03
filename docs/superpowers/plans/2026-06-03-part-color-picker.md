# Per-Part Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete — the feature is shipped and carries a **Done** badge in `project-structure.html`'s roadmap. Step checkboxes in this file were never ticked as the work went; the record of what landed and why is the Notes file named above.**

**Goal:** Add a color picker to the EditPanel that lets users change a board's color via 8 preset swatches and a native custom picker, with immediate 3D viewport feedback.

**Architecture:** Three coordinated changes: (1) extract `PART_COLORS` to a shared `palette.ts` module so the sidebar and scene hook share one source of truth; (2) add a `ColorControl` sub-component to the sidebar's `EditPanel`; (3) one-line fix in the viewport's mesh-update branch so color changes on existing meshes appear on the next RAF frame.

**Tech Stack:** React 19, TypeScript strict mode, Vitest + @testing-library/react, Three.js (`MeshStandardMaterial.color.set`), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-06-03-part-color-picker-design.md`

---

## File map

| File | Change |
|------|--------|
| `src/scene/palette.ts` | **Create** — exports `PART_COLORS` |
| `src/scene/useScene.ts` | **Modify** — remove local `PART_COLORS`, import from `./palette` |
| `src/ui/sidebar.tsx` | **Modify** — add `ColorControl` component, render it in `EditPanel` |
| `src/ui/sidebar.test.tsx` | **Modify** — add 6 new tests for `ColorControl` |
| `src/render/viewport.tsx` | **Modify** — one line: update `material.color` in the existing-mesh branch |

---

## Task 1: Extract PART_COLORS to shared palette module

**Files:**
- Create: `src/scene/palette.ts`
- Modify: `src/scene/useScene.ts` lines 1–27

This is a pure refactor. No new behaviour; the existing test suite acts as the
regression guard.

- [ ] **Step 1: Create `src/scene/palette.ts`**

```ts
export const PART_COLORS = [
  '#d4a373',
  '#8ecae6',
  '#95d5b2',
  '#ffb703',
  '#cdb4db',
  '#a8dadc',
  '#f4a261',
  '#b7b7a4',
]
```

- [ ] **Step 2: Update `src/scene/useScene.ts`**

Add the import after the existing `snapMath` import (currently line 7):

```ts
import { faceAxes } from './snapMath'
import { PART_COLORS } from './palette'
```

Then delete the now-redundant local constant (currently lines 18–27):

```ts
// DELETE these 10 lines:
const PART_COLORS = [
  '#d4a373',
  '#8ecae6',
  '#95d5b2',
  '#ffb703',
  '#cdb4db',
  '#a8dadc',
  '#f4a261',
  '#b7b7a4',
]
```

All three usages of `PART_COLORS` inside `useScene.ts` (at lines `:58`, `:267`,
`:328`) are unchanged — they now resolve to the imported value.

- [ ] **Step 3: Run typecheck and tests to confirm no regressions**

```bash
pnpm typecheck && pnpm test
```

Expected: 0 type errors, all tests pass (223 passed | 5 skipped).

- [ ] **Step 4: Commit**

```bash
git add src/scene/palette.ts src/scene/useScene.ts
git commit -m "refactor: extract PART_COLORS to shared palette module"
```

---

## Task 2: Add ColorControl to the EditPanel (TDD)

**Files:**
- Modify: `src/ui/sidebar.test.tsx` (write tests first)
- Modify: `src/ui/sidebar.tsx` (implement to make tests pass)

### Step 1: Add PART_COLORS import to the test file

- [ ] **Open `src/ui/sidebar.test.tsx`. Add one import after the existing imports:**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import type { CutDef, CutId, Part, PartId, Scene } from '../scene/types'
import { PART_COLORS } from '../scene/palette'  // ← add this line
```

### Step 2: Write the 6 failing tests

- [ ] **Append a new `describe('ColorControl', ...)` block at the end of `sidebar.test.tsx`,
  inside the outer `describe('Sidebar', ...)` block, right before the final `})`:**

```tsx
  describe('ColorControl', () => {
    it('renders the custom color input when a part is selected', () => {
      render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
      expect(screen.getByLabelText('Custom color')).toBeTruthy()
    })

    it('does not render the color control when nothing is selected', () => {
      render(<Sidebar {...props({ selectedId: null })} />)
      expect(screen.queryByLabelText('Custom color')).toBeNull()
    })

    it('clicking a preset swatch calls onUpdate with that color', () => {
      const onUpdate = vi.fn()
      render(<Sidebar {...props({ selectedId: 'board_t1', onUpdate })} />)
      fireEvent.click(screen.getByLabelText('Color #8ecae6'))
      expect(onUpdate).toHaveBeenCalledOnce()
      const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
      expect(updater(makeBoard()).color).toBe('#8ecae6')
    })

    it('changing the native color input calls onUpdate with the new color', () => {
      const onUpdate = vi.fn()
      render(<Sidebar {...props({ selectedId: 'board_t1', onUpdate })} />)
      fireEvent.change(screen.getByLabelText('Custom color'), {
        target: { value: '#123456' },
      })
      expect(onUpdate).toHaveBeenCalledOnce()
      const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
      expect(updater(makeBoard()).color).toBe('#123456')
    })

    it('the swatch matching part.color shows a selected ring', () => {
      // makeBoard() uses color: '#d4a373' = PART_COLORS[0]
      render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
      expect(screen.getByLabelText('Color #d4a373').className).toContain('ring-2')
    })

    it('no swatch shows a selected ring when the color is custom', () => {
      const scene = { parts: [makeBoard({ color: '#ff0000' })] }
      render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
      for (const c of PART_COLORS) {
        expect(screen.getByLabelText(`Color ${c}`).className).not.toContain('ring-2')
      }
    })
  })
```

- [ ] **Run the new tests to confirm they all fail**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: 6 new failures — `Unable to find an accessible element with the label
text: Custom color`. All pre-existing tests still pass.

### Step 3: Implement ColorControl in sidebar.tsx

- [ ] **Add `BoardPart` to the type import at the top of `src/ui/sidebar.tsx`
  (line 2):**

```ts
import type { BoardPart, CutDef, CutId, Part, PartId, Scene } from '../scene/types'
```

- [ ] **Add the palette import after the existing local-file imports (after line 4,
  `import { faceAxes } from '../scene/snapMath'`):**

```ts
import { PART_COLORS } from '../scene/palette'
```

- [ ] **Add the `ColorControl` function component in `src/ui/sidebar.tsx`, directly
  above the existing `function EditPanel(` declaration:**

```tsx
function ColorControl({
  part,
  onUpdate,
}: {
  part: BoardPart
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {PART_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`Color ${c}`}
          onClick={() => onUpdate(part.id, (p) => ({ ...p, color: c }))}
          className={`h-5 w-5 rounded-sm border border-border ${
            part.color === c ? 'ring-2 ring-foreground' : ''
          }`}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        aria-label="Custom color"
        title="Custom color"
        value={part.color}
        onChange={(e) => onUpdate(part.id, (p) => ({ ...p, color: e.target.value }))}
        className="h-5 w-8 rounded-sm border border-border bg-transparent p-0"
      />
    </div>
  )
}
```

- [ ] **Insert `<ColorControl>` inside `EditPanel`, immediately after the closing
  `</div>` of the Material input block and before the Shape `<Collapsible>`.
  In `EditPanel`'s return, after the `{/* Material input */}` block (which ends
  with `</div>`) and before `{/* Shape section */}`, add:**

```tsx
      {/* Color picker */}
      <ColorControl part={part} onUpdate={onUpdate} />
```

The resulting order inside `EditPanel`'s return is:

```
Label input <div>
Material input <div>
<ColorControl part={part} onUpdate={onUpdate} />   ← new
Shape <Collapsible>
Position <Collapsible>
Rotation <Collapsible>
Cuts section
```

### Step 4: Verify

- [ ] **Run the sidebar tests:**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: all 35 tests pass (29 pre-existing + 6 new).

- [ ] **Run typecheck:**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Commit:**

```bash
git add src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -m "feat: add ColorControl to EditPanel with preset swatches and custom picker"
```

---

## Task 3: Fix viewport live-update for color

**Files:**
- Modify: `src/render/viewport.tsx` lines 398–400

Color changes on existing meshes are currently invisible in the 3D view because
the mesh-update branch never refreshes `material.color`. This one-line fix
resolves it; the continuous RAF loop renders the new color on the next frame.

- [ ] **Open `src/render/viewport.tsx`. Find the `else` block that handles existing
  meshes. It currently ends (around line 399) with:**

```ts
        existing.visible = part.visible
        el.visible = part.visible
      }
```

**Change it to:**

```ts
        existing.visible = part.visible
        el.visible = part.visible
        ;(existing.material as THREE.MeshStandardMaterial).color.set(part.color)
      }
```

The semicolon prefix is required because the line starts with `(` — without it,
JavaScript would treat it as a function call continuation of the previous line.
This pattern is already used elsewhere in this file (e.g., at lines 405 and 410).

- [ ] **Run typecheck and full test suite:**

```bash
pnpm typecheck && pnpm test
```

Expected: 0 type errors, all 235 tests pass (223 pre-existing + 6 from Task 2 +
5 skipped OCCT WASM).

- [ ] **Commit:**

```bash
git add src/render/viewport.tsx
git commit -m "fix: update mesh material color on part color change in viewport"
```

---

## Self-review checklist

**Spec coverage:**
- ✅ `palette.ts` created and `useScene.ts` updated (Task 1)
- ✅ `ColorControl` extracted function, placed after Material, before Shape (Task 2)
- ✅ 8 swatches from `PART_COLORS`, `ring-2 ring-foreground` for active, `===` comparison (Task 2)
- ✅ Native `<input type="color">` with `aria-label="Custom color"`, `onChange` handler (Task 2)
- ✅ Both paths call `onUpdate` with no `historyLabel` → coalesces (Task 2)
- ✅ Viewport else-branch fix at end of block (Task 3)
- ✅ All 6 spec tests implemented (Task 2)
- ✅ No test file for `palette.ts` (correct — constant only)
- ✅ `isDirty` tracking automatic via `onUpdate` (no extra wiring)
- ✅ `shapeKey()` unaffected — color not a geometry dimension

**Placeholder scan:** None found.

**Type consistency:** `BoardPart` imported and used in `ColorControl` props; `Part` used in updater lambda type; `PartId` used in `onUpdate` call — all consistent with `useScene.ts:79` signature.
