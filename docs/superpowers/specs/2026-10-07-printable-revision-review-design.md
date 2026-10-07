# Printable revision review and reliable resume

Continue the review workflow with two concrete improvements:

1. Download a standalone printable HTML summary of the current review. Retain ordered packet hashes, project/capture metadata, snapshot timestamp, optional self-reported reviewer, overall notes, independent acknowledgment/pending counts, all detected changes and coverage items, stable IDs, changed fields, provenance and earlier/later output locations. Sort pending items first within each group; do not truncate the summary. Preserve partial coverage, manual/geometric classifications and the unsigned/local-review scope. Include packet metadata changes separately. The resumable JSON remains the canonical draft format.
2. Invalidate asynchronous resume operations whenever a newer import, local edit or component unmount occurs. Late successes and errors must not replace current progress or display stale alerts. Keep inputs editable while reading and make the most recent user action win.

The HTML contains only escaped text, fixed print styles and a restrictive content-security policy; no script, remote assets or user-controlled links. Users open the downloaded HTML and use browser printing. Acknowledgments and notes are a snapshot, not production approval. Acknowledgment of a limitation never resolves it.

Validate with DOM assertions for pending-first ordering, accurate independent counts, untruncated large reports, notes, stable IDs, provenance, both locations, partial/zero coverage and adversarial HTML text. Exercise real download/open/print-layout in Playwright. For resume reliability, test slow imports completing after a newer import, edits, stale failures and unmount/remount; mutate the generation guard to prove failures. Run the full suite and project checks, then update existing PR #88 and monitor CI.
