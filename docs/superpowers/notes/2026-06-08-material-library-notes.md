# Material Library — Implementation Notes

**Date:** 2026-06-08 (notes backfilled 2026-06-15 from a plan/code cross-check)
**Spec:** `docs/superpowers/specs/2026-06-08-material-library-design.md`
**Plan:** `docs/superpowers/plans/2026-06-08-material-library.md`

Living record of decisions/deviations. This file was missing and is reconstructed from the shipped code.

## Status

Fully implemented. Tests green.

## Decisions / deviations

- **IndexedDB v2 with a second store.** `idb.ts` bumped `DB_VERSION` to 2 and added a `library` object store alongside `handles`. `onupgradeneeded` guards both stores with `contains()` checks so the upgrade is safe for users on v1. New helpers: `readLibrary`, `writeLibraryEntry`, `deleteLibraryEntry`, `openDb`.
- **Library vs. project materials are kept separate (CLAUDE.md invariant).** The global library (IndexedDB) is never read inside `useScene` and is never serialized into `.zimmu`. The merge happens only at the BOM layer: `BomModal` computes `effectiveMaterials = { ...library, ...materials }` (project materials win), and writes go to both stores via a dual-write wrapper. `useMaterialLibrary` is an independent hook.
- **Optimistic, error-swallowing writes.** `useMaterialLibrary` updates local state immediately and swallows IndexedDB errors — a failed persist must not break the BOM UI. Acceptable for v0.1 cost rates.
- **No-confirm delete + alphabetical sort** in the Library tab; CSV export buttons are disabled/guarded while the Library tab is active (there is no per-project list to export there).
- **`commit()` skips `onSave` when the value is unchanged** (`CuttingList.tsx`) to avoid spurious history/persist churn.
