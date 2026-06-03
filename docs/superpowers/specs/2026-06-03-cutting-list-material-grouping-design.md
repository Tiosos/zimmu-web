# Cutting List: Material Field + Quantity Grouping — Design

**Date:** 2026-06-03
**Status:** Approved
**Phase:** 0.5 — Browser Prototype Hardening

---

## Goal

Add a `material` field to boards and upgrade the cutting list to group identical pieces into single rows with a quantity count — matching what a real fabricator expects to receive.

## Decisions Made

- Material input: free text with browser datalist suggestions (Option B)
- Grouping key: L×W×T + material (Option B — material differences keep rows separate)
- Label display when grouped: all labels concatenated with `", "` (Option A)
- Architecture: shared `groupParts()` utility used by both table UI and CSV export (Option C)

---

## Data Model

### `src/scene/types.ts`

Add `material: string` to `BoardPart`:

```ts
export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  material: string      // NEW — "" means unspecified
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]
  visible: boolean
}
```

`material: ''` is the default. An empty string renders as `—` in the cutting list and is omitted from the grouping key comparison (two boards both with `material: ''` still group together).

### Backward compatibility — `src/scene/useFile.ts`

`parseFile()` already normalises optional fields in the `parts.map()` inside the returned scene. Add `material` to that same spread:

```ts
// existing line in parseFile():
scene: { parts: parts.map((p) => ({ ...p, cuts: p.cuts ?? [], visible: p.visible ?? true })) }

// after change:
scene: { parts: parts.map((p) => ({ ...p, cuts: p.cuts ?? [], visible: p.visible ?? true, material: p.material ?? '' })) }
```

No file format version bump — the change is additive and old `.zimmu` files gain a blank material field on load.

### New parts — `src/scene/useScene.ts`

Two `BoardPart` literal constructions in `useScene.ts` will be TypeScript errors once `material: string` is required. Both need `material: ''` added:

1. **`makeDefaultBoard()`** (the initial board created on app start):
```ts
function makeDefaultBoard(): BoardPart {
  return {
    kind: 'board',
    id: `board_${crypto.randomUUID()}`,
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    material: '',          // ADD THIS
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }
}
```

2. **`onAdd()` inline construction** (the board created when the user clicks "+ Add board"):
```ts
const part: BoardPart = {
  kind: 'board',
  id,
  label,
  length: 200,
  width: 100,
  thickness: 25,
  material: '',          // ADD THIS
  color: PART_COLORS[colorIndex.current % PART_COLORS.length],
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
```

The `duplicate` (`clone`) construction in `useScene.ts` is fine — it does `{ ...orig, ... }` which spreads `material` automatically.

`src/scene/useScene.test.ts` does **not** need changes — its tests access individual properties (`.label`, `.kind`, `.visible`) rather than full object equality, so adding `material: ''` to constructed parts will not break any existing test.

---

## Grouping Logic

### `src/ui/buildCsv.ts`

New exported type and function alongside `buildCsv`:

```ts
export interface GroupedRow {
  qty: number
  labels: string    // e.g. "Left Side, Right Side"
  material: string
  length: number
  width: number
  thickness: number
  cuts: number      // sum of cuts across all grouped parts
}

export function groupParts(parts: Part[]): GroupedRow[]
```

**Group key:** `` `${length}×${width}×${thickness}|${material}` ``

**Merge rules:**
- `qty` increments by 1 per part
- `labels` appends `", " + part.label`
- `cuts` adds `part.cuts.length`
- `material`, `length`, `width`, `thickness` taken from the first part in the group (they are identical by definition of the key)

**Ordering:** insertion order (first-seen group key wins), which preserves scene part order within each group and produces a stable, predictable output.

`buildCsv` is rewritten to call `groupParts()` internally.

**New CSV format:**

```
Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts
2,"Left Side, Right Side",Plywood,600,300,18,0
1,Top,,800,400,18,2
```

Label quoting follows RFC 4180 (existing logic, applied to the `labels` field). Material field is left blank (not `—`) when empty, because `—` is a display-only convention.

---

## Sidebar Material Input

### `src/ui/sidebar.tsx` — `EditPanel`

Add a material input directly below the label input. Uses the shadcn `Input` component with an HTML `<datalist>` for browser-native autocomplete suggestions.

```tsx
const MATERIAL_DATALIST_ID = 'zimmu-material-suggestions'

// Inside EditPanel, after the label <Input>:
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

No debounce needed — material is not a geometry-affecting field and triggers no OCCT rebuild. Updates fire on every keystroke via `onUpdate`. The `MATERIAL_DATALIST_ID` constant is defined at module level to avoid recreating the string on every render.

---

## CuttingList Display

### `src/ui/CuttingList.tsx`

The table calls `groupParts(parts)` and renders `GroupedRow[]`. Column changes:

| Old | New |
|-----|-----|
| Label | Qty |
| Length (mm) | Labels |
| Width (mm) | Material |
| Thickness (mm) | Length (mm) |
| Cuts | Width (mm) |
| — | Thickness (mm) |
| — | Cuts |

Total columns: 7 (up from 5). The "No parts" empty state `colSpan` updates from 5 → 7.

Material renders as the stored value, or `—` when blank:
```tsx
<td>{row.material || '—'}</td>
```

The `buildCsv(parts)` call, `Copy CSV`, and `Download .csv` buttons are unchanged.

---

## Tests

### `src/ui/CuttingList.test.tsx`

**Update existing `buildCsv` tests:**
- Header assertion → `'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'`
- Row format assertion → `'1,Left Side,,600,300,18,0'` (material blank — the two consecutive commas `,,` are correct RFC 4180 for an empty field, not a typo)
- Cut count test → `'1,Left Side,,600,300,18,2'`
- Comma-in-label test → `'1,"Left, Side",,600,300,18,0'`
- Quote-in-label test → `'1,"5"" shelf",,600,300,18,0'`

**New `groupParts` tests:**
- Two parts with identical L×W×T+material → 1 row, qty=2, labels="A, B", cuts summed
- Two parts with same L×W×T but different material → 2 rows, qty=1 each
- Two parts with same material but different dimensions → 2 rows
- Empty array → empty array

**Update `makePart()` helper:** add `material: ''` to the default object so it satisfies the updated `BoardPart` type. All existing tests that call `makePart()` continue to work without changes.

**Update existing `CuttingList` render tests:**
- Column header assertions → check for Qty, Labels, Material, Length (mm), Width (mm), Thickness (mm), Cuts; remove check for Label
- Data row content test → check for qty `1`, labels `Left Side`, material `—`

**No new `buildCsv` tests needed** — groupParts tests cover the logic; buildCsv tests verify the CSV format.

### `src/ui/sidebar.test.tsx`

**New test:** When a part is selected, a material input is present. Typing a value calls `onUpdate` with the updated `material` field.

Query the input by placeholder: `screen.getByPlaceholderText('Material (optional)')`. Fire a change event and assert that the `onUpdate` mock was called with an updater that sets `material` to the new value.

---

## Files Changed

| File | Change |
|------|--------|
| `src/scene/types.ts` | Add `material: string` to `BoardPart` |
| `src/scene/useFile.ts` | Add `material: p.material ?? ''` in `parseFile()` parts map |
| `src/scene/useScene.ts` | Add `material: ''` to `makeDefaultBoard()` and `onAdd()` constructions |
| `src/ui/buildCsv.ts` | Add `GroupedRow`, `groupParts()`; rewrite `buildCsv` to use it |
| `src/ui/CuttingList.tsx` | Use `groupParts()`; update table columns (5 → 7) |
| `src/ui/sidebar.tsx` | Add material input in `EditPanel` |
| `src/ui/CuttingList.test.tsx` | Update existing tests; add grouping tests |
| `src/ui/sidebar.test.tsx` | Add material input test |

No new files created.
