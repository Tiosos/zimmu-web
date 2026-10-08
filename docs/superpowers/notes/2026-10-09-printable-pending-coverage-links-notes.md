# Printable pending coverage links notes

- 2026-10-09: Continue with portable pending links after publishing #109. Progress counts retain separate output/limitation scope, with fixed item IDs and complete sections. Build as a reviewable follow-up on the limitation-navigation branch.
- Added fixed coverage-item anchors and independent pending-count links from the progress table. Validated progress selects first unfinished recorded items; completed/empty counts remain plain and detected-change counts remain separate. Tests cover reversed progress, multiple/acknowledged-first items, hostile paths/statements, unique exact targets, full sections and zero/empty groups. Chromium now exercises both offline targets in a downloaded pending snapshot.
- Five mutations failed by assertions: pending guard, both-group rendering, exact target group, unique item anchors and detected-change scope. Confirmed mutations and restored byte-identical backups.
- Typecheck/lint passed. Combined full units: 172 files, 2,952 passed, 10 existing skips. Catalogue build passed.
- Application build passed with its existing chunk-size warning. Chromium packet flow passed (11.9s), following both new offline coverage targets in the downloaded snapshot. Structure trees regenerated; release version/date untouched. #108 post-merge CI and E2E passed on fc4421d69f6c3726342b006f13b6a8e0c46a19a0.
