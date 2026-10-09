# Revision checklist pending counts — notes

- Pending counts derive directly from each complete acknowledgment list, matching the independent progress table rather than the filtered checklist.
- Validation: typecheck, lint, 172 unit files / 2,960 passed tests with 10 existing skips, catalogue/application builds and Chromium packet comparison passed.
- Three deliberate regressions produced assertion failures: acknowledged counts substituted, output counts reused for limitations, and filtered counts substituted. Source restored byte-for-byte from `/tmp/pending-counts-ui.bak`.
- Updated exact resumed-review browser heading expectations to include pending totals; the first run found these stale expectations, and the corrected run passed.
