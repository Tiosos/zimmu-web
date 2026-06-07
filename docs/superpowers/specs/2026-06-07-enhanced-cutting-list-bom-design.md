# Enhanced Cutting List — Full BOM Design

**Date:** 2026-06-07
**Feature:** Enhanced Cutting List with Hardware Items, Cost Tracking, and Full BOM

---

## 1. Goal

Extend the existing cutting list into a full Bill of Materials (BOM): boards tab with per-row
cost calculation based on material rates, plus a hardware tab for manually-entered items
(screws, hinges, slides, etc.) with supplier, part number, unit cost, and notes. Hardware
items are entered manually now and will link to 3D model elements in a future cycle.

---

## 2. Architecture

Approach: **tabbed wrapper + isolated new pieces** (Approach C). The existing `CuttingList.tsx`
boards logic is preserved untouched as the Boards tab. A thin `BomModal.tsx` wraps it alongside
a new `HardwareTab.tsx`. Each piece has one clear purpose and is independently testable.

`BomModal` replaces `CuttingList` at the `App.tsx` call site. `CuttingList` receives two new
props but its internals change only to add cost columns.

---

## 3. Data Model

### New types in `src/scene/types.ts`

```ts
export interface MaterialDef {
  costPerM2: number  // cost per square metre in user's currency
}

export interface HardwareItem {
  id: string               // UUID — stable across edits
  name: string
  qty: number
  unit: string             // "pcs", "m", "kg", "box", etc.
  supplier: string
  partNumber: string
  unitCost: number         // cost per single unit
  notes: string
  linkedPartIds: string[]  // reserved for future 3D linkage
}
```

### Scene extensions

```ts
export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef>  // keyed by material name string
  hardware: HardwareItem[]
}
```

Both fields default to `{}` / `[]` when loading old files. The file format version bumps from
`1` to `2` in `useFile.ts`; old v1 files are migrated on load by filling in the defaults.

### Cost calculations

- **Board cost per piece:** `(part.length × part.width / 1_000_000) × materials[part.material]?.costPerM2 ?? 0`  
  (length and width in mm → divide by 1 000 000 to get m²)
- **Board row total:** cost per piece × qty
- **Hardware row total:** `item.qty × item.unitCost`
- **Board subtotal:** sum of all board row totals
- **Hardware subtotal:** sum of all hardware row totals
- **Grand total:** board subtotal + hardware subtotal

If a material has no cost rate set, cost columns show `—` (not `$0.00`) to distinguish
"zero cost" from "cost not entered".

---

## 4. State management

`useScene` gains two new update functions alongside `onUpdate`:

```ts
onUpdateMaterial(name: string, def: MaterialDef): void
onUpdateHardware(items: HardwareItem[]): void
```

Both participate in the existing 50-entry undo/redo history (same pattern as `onUpdate`).
`coalesceKey` is used for `onUpdateMaterial` calls so rapid rate changes coalesce into one
undo entry (e.g. dragging a cost slider, if added later).

`useFile` dirty tracking already stringifies `scene`, so material and hardware changes
automatically mark the file dirty — no extra work needed.

---

## 5. UI Structure

### BomModal.tsx

Full-screen modal (same style as `CuttingList`). Owns tab state (`'boards' | 'hardware'`).

```
┌──────────────────────────────────────────────────────────────────────┐
│  Bill of Materials                                        [✕ Close]  │
├────────────────────────────────────────────────────────────────────  │
│  [ Boards ]  [ Hardware ]                                            │
├──────────────────────────────────────────────────────────────────────┤
│  <CuttingList .../>   (Boards tab)                                   │
│  <HardwareTab .../>   (Hardware tab)                                 │
├──────────────────────────────────────────────────────────────────────┤
│  Boards: $240.00  |  Hardware: $85.50  |  Grand total: $325.50       │
│                                      [Copy CSV]  [Download CSV]      │
└──────────────────────────────────────────────────────────────────────┘
```

- CSV export targets the **current tab only**.
- Grand total footer is always visible regardless of active tab.
- File menu item remains "Cutting List…" (keyboard shortcut ⌘⇧E unchanged).

### CuttingList.tsx changes (surgical)

Two new props:
```ts
materials: Record<string, MaterialDef>
onMaterialCostChange: (name: string, def: MaterialDef) => void
```

Two new columns added to the right of the existing columns:
- **Cost/unit** — shows `$X.XX` or `—` if no rate set
- **Total** — `Cost/unit × qty` or `—`

Material name cells in the table become clickable. Clicking opens a small inline popover
with a single `$/m²` number input. On blur / Enter, calls `onMaterialCostChange`. The
popover is a simple `<input>` in a `<div>` with a `useClickOutside`-style close — no new
Radix dependency needed.

A **board subtotal row** is appended at the bottom of the table when any material has a
cost rate set.

### HardwareTab.tsx

Left side: table of hardware items. Right side: `HardwareEditPanel` (conditionally shown).

Table columns: Name | Qty | Unit | Supplier | Part # | Unit cost | Total | Notes

- Clicking any row selects it and opens `HardwareEditPanel` on the right.
- "Add item" button (bottom-left of table) creates a new blank item and opens the panel.
- No inline editing — all edits happen in the panel.
- Empty state: "No hardware items yet. Click 'Add item' to begin."

### HardwareEditPanel.tsx

Right-side panel, ~280px wide. Always visible when an item is selected.

Fields (top to bottom):
1. Name (text input, required)
2. Qty (number input, min 1)
3. Unit (text input with datalist suggestions: pcs, m, kg, box, set, pair)
4. Supplier (text input)
5. Part # (text input)
6. Unit cost (number input, min 0, 2 decimal places)
7. Notes (textarea, 3 rows)

Buttons at bottom:
- **Save** — commits changes to `onUpdateHardware`
- **Cancel** — reverts to last saved state
- **Delete** (destructive, right-aligned) — removes item after inline confirmation ("Delete?")

Changes are not live-applied — only on Save. This prevents partial-edit undo entries.

---

## 6. CSV export

### Boards CSV (extended)

Existing 8 columns + 2 new:
```
Qty, Labels, Material, Color, Length (mm), Width (mm), Thickness (mm), Cuts, Cost/unit, Total
```
Rows with no material cost rate: Cost/unit and Total cells are empty strings.
Final row: `,,,,,,,,Board total,$X.XX`

### Hardware CSV (new `buildHardwareCsv`)

```
Name, Qty, Unit, Supplier, Part #, Unit cost, Total, Notes
```
Final row: label `Hardware total` in the Unit cost column, value `$X.XX` in the Total column,
Notes empty: `,,,,,Hardware total,$X.XX,`

---

## 7. File Map

### Create

| File | Responsibility |
|------|---------------|
| `src/ui/BomModal.tsx` | Tab wrapper, grand total footer, CSV dispatch |
| `src/ui/BomModal.test.tsx` | Tab switching, grand total, CSV buttons |
| `src/ui/HardwareTab.tsx` | Hardware table + edit panel layout |
| `src/ui/HardwareTab.test.tsx` | Add / select / delete flow |
| `src/ui/HardwareEditPanel.tsx` | 7-field form + Save / Cancel / Delete |
| `src/ui/HardwareEditPanel.test.tsx` | Form fields, save, cancel, delete confirm |

### Modify

| File | Change |
|------|--------|
| `src/scene/types.ts` | Add `MaterialDef`, `HardwareItem`; extend `Scene` |
| `src/scene/useScene.ts` | Add `onUpdateMaterial` + `onUpdateHardware` + defaults on load |
| `src/scene/useFile.ts` | Bump `FILE_FORMAT_VERSION` to `2`; migrate v1 files on open: set `materials: {}`, `hardware: []` |
| `src/ui/CuttingList.tsx` | Add 2 props + Cost/unit + Total columns + material cost popover + subtotal row |
| `src/ui/buildCsv.ts` | Add cost columns to board CSV; add `buildHardwareCsv` |
| `src/App.tsx` | Swap `CuttingList` → `BomModal`; wire `onUpdateMaterial`, `onUpdateHardware` |

### Extend (tests)

| File | New tests |
|------|-----------|
| `src/ui/buildCsv.test.ts` | Hardware CSV; board CSV with cost columns |
| `src/scene/useScene.test.ts` | `onUpdateMaterial` + `onUpdateHardware` + undo/redo |

---

## 8. Testing strategy

- All new components tested with Vitest + happy-dom + @testing-library/react.
- `HardwareEditPanel`: test field entry, Save commits, Cancel reverts, Delete fires callback.
- `HardwareTab`: test Add creates blank item, clicking row selects it, panel shows correct data.
- `BomModal`: test tab switching, grand total updates when costs change, CSV dispatches correctly.
- `buildCsv`: test cost column values, `—` when rate not set, subtotal rows.
- `useScene`: test `onUpdateMaterial` and `onUpdateHardware` undo/redo with the existing mock setup.

No browser-only paths in pure functions — all cost math is testable directly.

---

## 9. Out of scope

- Per-item undo in the hardware panel (Save/Cancel handles this at the panel level)
- Currency symbol selection (plain numbers, user decides currency)
- Board-feet / linear-metre calculation for dimensional lumber
- Hardware item reordering (drag-and-drop)
- Linking hardware to 3D parts (future cycle)
- Cost export to PDF
