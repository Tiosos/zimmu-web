# Printable per-part pending links notes

- 2026-10-08: #103 passed all four checks and merged with user approval. Extend printable pending counts with fixed internal anchors to the first unacknowledged finding per exact part ID; zero counts remain plain text.
- Added pending targets based on validated acknowledgments in recorded comparison order, with escaped accessible labels. Existing part-name targets and numeric table layout remain intact. Unit coverage includes overlapping/hostile IDs, multiple pending findings, reversed progress order, operation-only completed parts, complete findings and zero-count plain text. Browser flow now downloads a pending snapshot, follows its link, then checks that completed snapshots have no pending links.
- Four deliberate mutations failed by assertions: removing first-target guard, removing acknowledgment guard, linking zero counts and suppressing nonzero links. Source restored from a byte-preserving backup after each mutation.
- Typecheck and lint passed. Full unit suite: 172 files, 2,940 passed, 10 existing skips. Catalogue build passed.
- Application build passed with the existing chunk-size warning. Chromium production-packet comparison/export test passed (9.9s), including pending-link navigation and completed-snapshot plain counts. Regenerated structure trees without changing release version/date.
