# Cutting List Color Column Design

**Date:** 2026-06-04
**Status:** Approved, pending implementation plan

## Goal

Surface `BoardPart.color` in the cutting list table (swatch + hex) and CSV export (raw hex), with color included in the grouping key so parts that differ only in color appear as separate rows.

## Background

- `BoardPart.color` is a required hex string (`#rrggbb`) on every board part; introduced with the per-part color picker.
- `groupParts()` in `src/ui/buildCsv.ts` currently groups by `${length}×${width}×${thickness}|${material}`. Color is not included, so same-dimension boards of different colors collapse into one row.
- The table has 7 columns: Qty · Labels · Material · Length · Width · Thickness · Cuts. Color is inserted between Material and Length.
- Scope is entirely within `src/ui/`. No `types.ts`, `useScene`, or file-format change is needed — `color` is already a field on `BoardPart`.

## Design

### 1. Grouping key — `buildCsv.ts`

Append `|${p.color}` to the key:

```ts
const key = `${p.length}×${p.width}×${p.thickness}|${p.material}|${p.color}`
```

Effect: two parts identical in dimensions and material but with different colors produce two separate rows. Two parts with identical dimensions, material, **and** color continue to collapse into one row (qty increments).

The hex string `#rrggbb` never contains `|`, so no delimiter collision with color. A material containing `|` is a pre-existing concern unrelated to this change — do not address it here.

### 2. `GroupedRow` interface — `buildCsv.ts`

Add one field, populated from `p.color` in the new-group branch:

```ts
export interface GroupedRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string        // ← new
  length: number
  width: number
  thickness: number
  cuts: number
}
```

In `groupParts()`, the `else` (new-group) branch:
```ts
map.set(key, {
  key,
  qty: 1,
  labels: p.label,
  material: p.material,
  color: p.color,      // ← new
  length: p.length,
  width: p.width,
  thickness: p.thickness,
  cuts: p.cuts.length,
})
```

The accumulation branch (existing group found) does **not** touch `color` — every row has a single color by construction, because color is now part of the key.

### 3. CSV output — `buildCsv.ts`

Color column is inserted after Material. Output `row.color` raw — no `quoteField()` wrapping. Hex strings never contain commas, quotes, or newlines, so quoting is unnecessary dead code (YAGNI). This matches the unquoted treatment of the numeric columns.

New header:
```
Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts
```

New row builder:
```ts
`${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.cuts}`
```

### 4. Table column — `CuttingList.tsx`

#### Header
Add `<th>` between Material and Length (mm):
```tsx
<th className="pb-2 px-2 font-medium text-xs">Color</th>
```

#### Data cell
Add `<td>` between material and length in each row:
```tsx
<td className="py-1.5 px-2 text-xs">
  <span className="flex items-center gap-1.5">
    <span
      className="w-3 h-3 rounded-sm border border-border flex-shrink-0"
      style={{ background: row.color }}
    />
    {row.color}
  </span>
</td>
```

Swatch style (`w-3 h-3 rounded-sm`) matches the parts-list swatch (`sidebar.tsx:637`). The `border border-border` ensures visibility when the swatch color is close to the background.

#### Empty-state colspan
The "No parts" cell's `colSpan` changes from `7` to `8`. This is a silent visual regression if missed (cell under-spans). It is not covered by the existing empty-state text assertion, so flag it explicitly — the implementer must update it.

### 5. No color normalization

`<input type="color">` and `PART_COLORS` always emit lowercase `#rrggbb`. Files written by this app only store lowercase hex. The grouping-key comparison is plain `===` — consistent with the color-picker spec's decision. Do not add `.toLowerCase()`.

## Breaking assertion inventory

Five existing test assertions break because the column layout changes. All are in `CuttingList.test.tsx`. The implementer updates these directly — no workarounds.

| Test | Location | Old assertion | New assertion |
|------|----------|---------------|---------------|
| `returns only the header when parts array is empty` | `buildCsv` | `'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'` | `'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts'` |
| `formats a data row with correct field values` | `buildCsv` | `'1,Left Side,,600,300,18,0'` | `'1,Left Side,,#8b6914,600,300,18,0'` |
| `includes the cut count` | `buildCsv` | `'1,Left Side,,600,300,18,2'` | `'1,Left Side,,#8b6914,600,300,18,2'` |
| `Copy CSV button` header | `CuttingList` | `'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'` | `'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts'` |
| `Copy CSV button` row | `CuttingList` | `.toContain('1,Left Side,,600,300,18,0')` | `.toContain('1,Left Side,,#8b6914,600,300,18,0')` |

Regex assertions that match only through the material field (`/^1,"Left, Side",,/`, `/^1,"5"" shelf",,/`, `/^1,Left Side,"Pine, Ply",/`, `/^2,"A, B",,/`) **survive unchanged** — color is appended after material, so these patterns still pass.

## New tests

Seven new tests, all in `CuttingList.test.tsx`:

1. **`buildCsv` — header includes Color column.** Assert `buildCsv([])` equals the new 8-column header string. (Replaces the updated empty-header test above — they are the same test, updated in place.)

2. **`buildCsv` — row includes the hex value after material.** `buildCsv([makePart()])` → row 1 equals `'1,Left Side,,#8b6914,600,300,18,0'`.

3. **`buildCsv` — different colors produce separate rows.** Two parts identical except `color: '#8b6914'` vs `color: '#ff0000'` → `buildCsv(...)` has 3 lines (header + 2 data).

4. **`buildCsv` — same color still groups.** Two identical parts (same default color) → `buildCsv(...)` has 2 lines (header + 1 data row with qty 2).

5. **`groupParts` — color carried onto the row.** `groupParts([makePart()])[0].color === '#8b6914'`.

6. **`groupParts` — different colors split into separate rows.** Same as test 3 at the `groupParts` layer: assert `toHaveLength(2)`.

7. **`CuttingList` table — renders Color header and hex value.** Render with one part; assert `screen.getByText('Color')` is present and `screen.getByText('#8b6914')` is present. Use a **single-part render only** — `getByText` throws if 2+ rows share a color and produce 2+ matching DOM nodes.

The existing `renders table column headers` test gains `expect(screen.getByText('Color')).toBeTruthy()` (inline update, not a separate test).

## Data flow

```
BoardPart.color
  └─ groupParts() key: …|${p.color}
       └─ GroupedRow.color
            ├─ CuttingList <td>: swatch (style background) + hex text
            └─ buildCsv row: raw hex string, no quoting
```

## Error handling

None. `color` is a required non-empty `#rrggbb` string on every `BoardPart`. No missing-or-invalid path exists.

## Out of scope

- Color swatch rendering inside the downloaded CSV file (text/hex only in CSV).
- Sorting rows by color.
- Managing or editing the preset palette.
- Normalizing material `|` delimiter collisions (pre-existing).
