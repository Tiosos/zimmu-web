# Printable finding return links notes

- 2026-10-08: #104 merged after all four checks passed, with user approval. Add return navigation from every detected finding to its exact part-summary row, with fixed local IDs and existing print-hidden navigation styling.
- Added fixed part-summary-N row IDs and one return link per part/operation finding. Existing navigation styling hides links in print. Tests cover overlapping/hostile IDs, mixed/reordered progress, repeated and operation-only findings, exact unique targets and empty reports. Browser coverage checks the forward/return round trip and print hiding.
- Three deliberate mutations failed by assertions: wrong return target, duplicate row IDs and removal of the print-hidden navigation class. Source restored from a byte-preserving backup after each mutation.
- Typecheck/lint passed. Full unit suite: 172 files, 2,941 passed, 10 existing skips. Catalogue build passed.
- Application build passed with the existing chunk-size warning. Chromium production-packet comparison/export flow passed (10.6s), including offline return navigation and print hiding. Regenerated structure trees; release version/date unchanged.
