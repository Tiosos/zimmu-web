# Pending-first part summaries notes

- 2026-10-09: Restarted environment has dependencies, Chromium and gh available. Continued from merged #105 on origin/main. Add optional dialog ordering and shared automatic printable ordering; preserve complete progress and exact links.
- Shared optional ordering keeps comparison order within pending/completed groups. Dialog default remains comparison order; printable reports use pending-first order. Counts and records remain complete. Tests cover stable ties, reversed progress, all-completed/empty inputs, live dialog updates, checkpoint/selection retention, slow resume and reordered printable round trips.
- Five mutations failed by predicted assertions: ordering option, comparator direction, dialog default, toggle wiring and printable ordering. Backed up source, confirmed replacements, restored and compared bytes after each mutation.
- Typecheck/lint passed. Full units: 172 files, 2,944 passed, 10 existing skips. Catalogue build passed.
- Application build passed with its existing chunk-size warning. Chromium packet comparison/export flow passed (10.4s), including the ordering toggle and offline forward/return navigation. Structure trees regenerated without release version/date changes; no environment configuration changes required.
