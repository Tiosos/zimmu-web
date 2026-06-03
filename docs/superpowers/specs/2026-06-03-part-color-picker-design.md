# Per-Part Color Picker Design

**Date:** 2026-06-03
**Status:** Approved (design, revised), pending implementation plan

## Goal

Let users change a board's color from the EditPanel in the sidebar, using both a
set of preset palette swatches and a native custom-color picker. Color edits must
appear immediately in the 3D viewport.

## Background

- `BoardPart.color` is a hex string (`src/scene/types.ts`).
- New boards cycle through an 8-entry palette, `PART_COLORS`, currently private to
  `src/scene/useScene.ts` (lines 18–27). Used at `useScene.ts:58`, `:267`, `:328`.
- The parts-list row already renders a color swatch
  (`src/ui/sidebar.tsx:595–598`, `style={{ background: part.color }}`).
- The EditPanel (`src/ui/sidebar.tsx`) has Label, Material, Shape, Position, and
  Rotation controls — but **no** color control.
- **Viewport gotcha:** `src/render/viewport.tsx` applies `color: part.color` only
  when a mesh is first created (the `if (!existing)` branch, ~line 367). The
  update branch for existing meshes never refreshes material color. Making color
  editable therefore requires adding one line at the **end** of the else block, or
  color changes will not appear in the 3D view. The viewport runs a continuous
  `requestAnimationFrame` render loop (`viewport.tsx:200–212`), so mutating
  `material.color` is picked up on the next frame — no manual re-render needed.

## Components

### 1. Shared palette module — `src/scene/palette.ts` (new)

Extract `PART_COLORS` from `useScene.ts` into a tiny shared module so both
`useScene` (new-part color cycling) and the sidebar (preset swatches) import one
source of truth.

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

`useScene.ts` removes its local `const PART_COLORS = [...]` (lines 18–27) and adds
`import { PART_COLORS } from './palette'`. No behavior change in `useScene`.

**No test file** is needed for `palette.ts` — it is a single constant export with
no logic.

### 2. `ColorControl` sub-component — `src/ui/sidebar.tsx`

Add an **extracted function component** `function ColorControl({ part, onUpdate })`
(parallel to the existing extracted `CutRow`). It is rendered inside `EditPanel`,
placed immediately after the Material input `<div className="mb-2">` block and
before the Shape `<Collapsible>`.

Add the import: `import { PART_COLORS } from '../scene/palette'`.

**Props:**
```ts
function ColorControl({
  part,
  onUpdate,
}: {
  part: BoardPart
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
})
```
(`BoardPart` is already importable from `../scene/types`; add it to the existing
type import if not present.)

**Markup & layout.** The sidebar is `w-60` (240 px), so swatches must wrap. Render
a flex-wrap row containing the 8 preset swatch buttons followed by the native
color input on the same wrapping row:

```tsx
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
```

**Active-swatch highlight.** The swatch whose color equals `part.color` gets
`ring-2 ring-foreground`. Comparison is plain `===`: both `PART_COLORS` and
`<input type="color">` always produce lowercase `#rrggbb`, and files written by
this app only ever store those values, so no case normalization is required.

**Native picker handler.** Use React's `onChange` (not `onBlur`/`onInput`).
React's synthetic `onChange` on `<input type="color">` fires continuously during
drag, which is required for both live 3D update and undo coalescing.

**History coalescing.** Both the swatch buttons and the native input call:
```ts
onUpdate(part.id, (p) => ({ ...p, color }))
```
with **no** `historyLabel`. This reuses the existing `coalesceKey: update-${id}`
behavior (`useScene.ts:399`), so:
- Dragging the native picker coalesces rapid `onChange` events into a single undo
  entry.
- Color edits coalesce with other same-part edits (label, material, dimensions),
  matching current behavior for those controls.

The control reads directly from `part.color` (controlled, no local state) — the
same pattern the material input uses. Safe because no external path mutates the
selected part's color while the user is interacting with it.

**Dirty tracking is automatic.** A color change flows through `onUpdate` → scene
state → `useFile`'s `isDirty` `useEffect`, which sets the file dirty. No extra
wiring needed.

### 3. Viewport live-update fix — `src/render/viewport.tsx`

In the "update existing mesh" `else` branch, add the color line at the **end** of
the block, after `el.visible = part.visible` (currently line 399):

```ts
        existing.visible = part.visible
        el.visible = part.visible
        ;(existing.material as THREE.MeshStandardMaterial).color.set(part.color) // ← add
      }
```

The mesh-creation branch is unchanged. The RAF loop renders the new color on the
next frame.

## Data Flow

```
ColorControl (swatch click / native input onChange)
  → onUpdate(part.id, p => ({ ...p, color }))   [no historyLabel → coalesces]
    → useScene history + scene state update
      → Viewport effect re-runs
        → existing-mesh else branch sets material.color  [new line]
          → RAF loop renders → 3D view reflects new color
```

`shapeKey()` is **not** affected — color is not a geometry dimension, so no OCCT
rebuild is triggered. (Verified: `src/scene/utils.ts` encodes only L/W/T.)

## Error Handling

None required. `<input type="color">` always yields a valid lowercase hex string;
preset swatches are constants. No invalid-input path exists.

## Testing — `src/ui/sidebar.test.tsx`

The existing `makeBoard()` helper already sets `color: '#d4a373'` (= `PART_COLORS[0]`).
Use it for tests that need a known palette color.

1. **Control renders when a part is selected.**
   Render with `selectedId: 'board_t1'`; assert the custom-color input is present:
   `expect(screen.getByLabelText('Custom color')).toBeTruthy()`.

2. **Control not rendered when nothing is selected.**
   Render with `selectedId: null`; assert
   `expect(screen.queryByLabelText('Custom color')).toBeNull()`.
   (Mirrors the existing "hides edit panel when nothing is selected" test.)

3. **Clicking a preset swatch calls `onUpdate` with that color.**
   Render with a spy `onUpdate`; click the swatch for `PART_COLORS[1]`
   (`screen.getByLabelText('Color #8ecae6')`); assert `onUpdate` was called, then
   apply the captured updater to a board and assert the result color:
   ```ts
   const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part]
   expect(updater(makeBoard()).color).toBe('#8ecae6')
   ```

4. **Changing the native color input calls `onUpdate` with the new color.**
   `fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } })`;
   assert `onUpdate` called; apply the updater and assert `.color === '#123456'`.

5. **Active swatch shows the selected ring for the current color.**
   Render a board with `color: PART_COLORS[0]`; assert the swatch button
   `screen.getByLabelText('Color #d4a373')` has class `ring-2`
   (`.className` contains `ring-2`).

6. **No swatch shows the selected ring when the color is custom.**
   Render a board with `color: '#ff0000'` (not in `PART_COLORS`); assert none of
   the swatch buttons carry `ring-2`:
   ```ts
   for (const c of PART_COLORS) {
     expect(screen.getByLabelText(`Color ${c}`).className).not.toContain('ring-2')
   }
   ```

Per project convention (avoid testing Three.js internals; prefer the geom seam),
the viewport one-line material mutation is not unit-tested — it is guarded by the
type system and verified by manual check.

## Out of Scope

- Color in the CSV / cutting list output.
- Managing or editing the preset palette.
- Opacity / transparency / material finish controls.
