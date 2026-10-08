# Pending comparison-limitation navigation notes

- 2026-10-09: #108 merged with user approval after all four checks passed. Extend its tested pending-checklist navigation to limitations, sharing the implementation while preserving independent pending counts and scope warnings.
- Shared pending-checklist actions retain independent disablement and exact group targets. Tests cover acknowledged-first/multiple limitations, group/focus, scope warning, unrelated settings and notes/checkpoints, full exports, empty group and pending resume. Existing output tests remain green.
- Six mutations failed by assertions: independent disablement, pending-only, exact group, opening, first unfinished item and action labels. Confirmed mutations and restored byte-identical source backups.
- Typecheck/lint passed. Full units: 172 files, 2,950 passed, 10 existing skips. Catalogue build passed.
- Application build passed with its existing chunk-size warning. Chromium comparison/export flow passed (11.5s), including limitation focus/viewport and retained subsequent downloads. Structure trees regenerated without release version/date changes.
