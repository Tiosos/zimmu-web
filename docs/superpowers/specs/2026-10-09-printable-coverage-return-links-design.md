# Printable coverage return links

Every changed-output and comparison-limitation finding in a printable review snapshot should return to its own review-progress row. Add fixed progress row IDs and article-local “Back to review progress” links, including acknowledged findings. Keep pending forward links, complete counts, recorded order, escaped labels and notes, and the unsigned-review disclaimer. Empty groups keep their zero-count rows without finding links. Use existing print-hidden navigation styling and script-free fragment navigation; no review schema changes.

Validation: test unique exact group targets and counts with reversed acknowledgments and hostile text, completed and empty groups; exercise forward/return navigation in Chromium and ensure links disappear in print media. Deliberately break target selection, row uniqueness and navigation styling to confirm the assertions detect regressions.
