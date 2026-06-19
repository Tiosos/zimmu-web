# Cutting List — Material Grouping — Implementation Notes

**Date:** 2026-06-03 (notes backfilled 2026-06-15 from a plan/code cross-check)
**Spec:** `docs/superpowers/specs/2026-06-03-cutting-list-material-grouping-design.md`
**Plan:** `docs/superpowers/plans/2026-06-03-cutting-list-material-grouping.md`

Living record of decisions/deviations. This file was missing and is reconstructed from the shipped code.

## Status

Fully implemented. `material: string` lives on `BoardPart` (`types.ts`); `groupParts()` + `GroupedRow` live in `src/ui/buildCsv.ts`; the sidebar exposes a material datalist input. Older `.zimmu` files are migrated with `material: p.material ?? ''` in `useFile.ts`. Tests green.

## Decisions / deviations

- **Group key.** Rows are grouped by `L×W×T|material`. The `|` delimiter is a deliberate simplification — a material name containing a literal `|` could theoretically collide. Declared out of scope (a real material name with a pipe is not expected for v0.1). The subsequent color feature (2026-06-04) extended this key to `L×W×T|material|color`.
- **Insertion order preserved.** `groupParts()` keeps a first-seen `order[]` array so the grouped table/CSV lists groups in the order parts were first encountered, not sorted.
- **Empty material.** Parts with no material group under an empty-string key and render with an em-dash placeholder in the UI/CSV.
