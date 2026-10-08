# Searchable part summaries notes

- 2026-10-09: Continue after publishing #106; build searchable summary rows on its shared ordering feature. Keep finding navigation and full exports independent from this table view.
- Added literal NFC/case-insensitive summary search across recorded labels and stable part IDs, scoped feedback/counts and independent clear action. Tests cover duplicated labels, Unicode/punctuation, operation-only groups, empty source, pending-first combinations, retained finding selection/notes/checkpoints, pending resume and complete exports.
- Eight mutations failed by assertions: trimming, query normalization, ID search, label search, visible-row rendering, clear action, clear disabled state and empty-query feedback. Backed up, confirmed replacements and restored source bytes after each mutation.
- Typecheck/lint passed. Combined full units: 172 files, 2,946 passed, 10 existing skips. Catalogue build passed.
- Application build passed with its existing chunk-size warning. Chromium packet comparison/export flow passed (12.6s), including no-match search and clearing while preserving subsequent review/export/navigation behavior. Regenerated structure trees; no release version/date changes. All four #106 checks passed.
