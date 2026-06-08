# Enhanced Cutting List / Full BOM — Implementation Notes

## Key Decisions and Surprises

### `...prev` spread invariant (discovered during Task 2)

The existing `useScene.ts` had 24+ `setScene((prev) => ({ parts: ... }))` calls that only set `parts`, discarding the new `materials` and `hardware` fields. Fixed systematically with `sed` for arrow-form calls and manual edits for 3 block-form `return { parts }` cases. Regression tests added for `onAdd preserves existing materials and hardware`.

### `MaterialPopover` double-fire on Enter (undocumented bug)

When the user presses Enter in the rate input, `onKeyDown` fires `commit()` and then the blur event also fires `commit()` immediately after. Without a guard, `onSave` would be called twice (and the second call would capture a stale `value`). Fixed with a `committedRef` that short-circuits the second call. The plan did not anticipate this; it was discovered during implementation.

### `coalesceKey: 'hardware'` — added then removed

A code quality reviewer flagged that `onUpdateHardware` lacked `coalesceKey`, creating a risk of undo-stack flooding during rapid edits. `coalesceKey: 'hardware'` was added. A subsequent final code review then correctly noted this was a mistake: unlike material rates (where rapid edits to the same material are the same logical operation), each hardware item save/delete/edit is a discrete user action. Using a static key means adding item A then item B coalesces into one undo entry, losing item A on undo. Removed.

### `key={editingItem.id}` on HardwareEditPanel

React `useState(item)` only initializes once per component instance. When switching between hardware items in the list, the same `HardwareEditPanel` instance would be reused, showing stale draft state from the previous item. Fix: `key={editingItem.id}` forces a remount on item switch, resetting draft state. No `useEffect` needed.

### `hideExportButtons` embedded mode in CuttingList

`BomModal` embeds `CuttingList` inside its own full-screen overlay. Without a way to suppress CuttingList's own overlay, the ESC handler, and the export buttons, the result would be nested overlays and a broken ESC interaction. Solution: `hideExportButtons=true` causes CuttingList to skip the overlay wrapper, ESC listener, and export buttons, returning just the table div. The test for embedded mode verifies `bom-overlay` is not rendered.

### Hardware CSV column alignment

Initial implementation put the "Hardware total" label in col5 (Part #) with 4 leading commas. Should be in col6 (Unit cost) with the value in col7 (Total), matching the visual position of "Subtotal" in the board CSV. Fixed to 5 leading commas.

### `downloadBlob` usage

`BomModal` correctly used `downloadBlob(csvString, ...)`. The standalone `CuttingList` was still using the old inline `URL.createObjectURL` + anchor-click pattern. Unified to use `downloadBlob` consistently.

### File format migration

`FILE_FORMAT_VERSION` bumped from 1 to 2. Migration in `parseFile` uses `?? {}` / `?? []` to default `materials` and `hardware` for v1 files. The migration is transparent — v1 files open and save correctly as v2. A `parseFile` export was added specifically to enable this to be tested directly, without going through the full `useFile` hook.

## Deferred Ideas

- Per-hardware-item linking to specific parts (`linkedPartIds` is in the type but the UI doesn't use it yet)
- Printing / PDF export for the full BOM
- Supplier link fields (URL to supplier product page)
- Cost history / version tracking
