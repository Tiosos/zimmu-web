# Per-Part Color Picker Design

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan

## Goal

Let users change a board's color from the EditPanel in the sidebar, using both a
set of preset palette swatches and a native custom-color picker. Color edits must
appear immediately in the 3D viewport.

## Background

- `BoardPart.color` is a hex string (`src/scene/types.ts`).
- New boards cycle through an 8-entry palette, `PART_COLORS`, currently private to
  `src/scene/useScene.ts` (lines 18–27). Used at `useScene.ts:58`, `:267`, `:328`.
- The parts-list row already renders a color swatch
  (`src/ui/sidebar.tsx:597`, `style={{ background: part.color }}`).
- The EditPanel (`src/ui/sidebar.tsx`) has Label, Material, Shape, Position, and
  Rotation controls — but **no** color control.
- **Viewport gotcha:** `src/render/viewport.tsx` applies `color: part.color` only
  when a mesh is first created (the `if (!existing)` branch, ~line 367). The
  update branch for existing meshes (~line 393) never refreshes material color.
  Making color editable therefore requires a one-line update there, or color
  changes will not appear in the 3D view.

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

`useScene.ts` removes its local `const PART_COLORS = [...]` and imports it from
`./palette`. No behavior change in `useScene`.

### 2. `ColorControl` sub-component — `src/ui/sidebar.tsx`

A new row inside `EditPanel`, placed immediately after the Material input
(`<div className="mb-2">` block) and before the Shape `<Collapsible>`.

Renders:
- 8 preset swatch buttons sourced from `PART_COLORS`. The button whose color
  equals `part.color` (case-insensitive hex compare) receives a visible
  selected-state ring/border.
- A native `<input type="color">` seeded with `part.color` for arbitrary colors.

Both interaction paths call:

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

### 3. Viewport live-update fix — `src/render/viewport.tsx`

In the "update existing mesh" `else` branch (~line 393), add:

```ts
;(existing.material as THREE.MeshStandardMaterial).color.set(part.color)
```

so color edits reflect in 3D immediately. The mesh-creation branch is unchanged.

## Data Flow

```
ColorControl (swatch click / native input change)
  → onUpdate(part.id, p => ({ ...p, color }))   [no historyLabel → coalesces]
    → useScene history + scene state update
      → Viewport effect re-runs
        → existing-mesh branch sets material.color  [new line]
          → 3D view reflects new color
```

`shapeKey()` is **not** affected — color is not a geometry dimension, so no OCCT
rebuild is triggered. (Verified: `src/scene/utils.ts` encodes only L/W/T.)

## Error Handling

None required. `<input type="color">` always yields a valid lowercase hex string;
preset swatches are constants. No invalid-input path exists.

## Testing — `src/ui/sidebar.test.tsx`

- Color control renders when a part is selected.
- Clicking a preset swatch calls `onUpdate`; applying the returned updater to a
  board yields that preset hex color.
- Changing the native color input calls `onUpdate`; the updater yields the new
  color.

Per project convention (avoid testing Three.js internals; prefer the geom seam),
the viewport one-line material mutation is not unit-tested — it is guarded by the
type system and verified by manual check.

## Out of Scope

- Color in the CSV / cutting list output.
- Managing or editing the preset palette.
- Opacity / transparency / material finish controls.
