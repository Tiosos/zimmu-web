# Reset source-review view

- Added one action to clear the source-review query and disable pending-only, preserving the current finding cursor and all review data. Clear finding search still preserves pending-only.
- Reset focuses the persistent search input and is disabled at defaults or while review operations are busy. It does not create review edits or alter download/autosave checkpoints.
- Validation: 153 focused/integration tests across eight files passed; Chromium's real-project workflow passed with reset restoring both filters, retaining the reviewed shelf and its note, and focusing search. Lint and production build/typecheck passed (existing bundle-size warning). Removing pending-only reset produced the two expected assertion failures; the source was restored and all 30 component tests passed again.
