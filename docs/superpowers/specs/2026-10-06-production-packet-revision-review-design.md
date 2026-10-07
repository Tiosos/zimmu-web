# Local revision review design

Goal: save review progress for detected production-packet changes without implying authenticated approval.

- Reuse verified comparisons. Blocked comparisons or absent hashes cannot initialize reviews.
- Store schema version, record kind, save time, optional self-reported reviewer, overall notes, per-change stable reference/acknowledgment/note and the complete comparison. The comparison retains both exact archive hashes, earlier/later definitions, provenance, output locations, other changed outputs and coverage limits.
- Validate imported records against the ordered hashes, complete current comparison and exact unique change-reference set. Validate strings, booleans, version and timestamp. Reject stale or malformed records without replacing current progress.
- Provide a selector for every change, including changes outside the bounded comparison preview, plus selected-change details and both locations. Download drafts freely; acknowledge each change explicitly.
- Display acknowledgment counts without approval or completion claims. Keep partial coverage and unassessed outputs explicit. Zero changes does not establish readiness.
- Keep records local and unsigned. Replacing packets, rerunning comparison or closing discards unsaved progress. Users download and resume explicitly. Limit imported JSON to 16 MiB before reading.

Validation: round-trip notes/acknowledgments, swapped or changed hashes, altered comparison details, duplicate/missing/unknown references, malformed fields, partial/zero/blocked states; UI download/resume/rejection; browser flow with real exported archives. Run typecheck, lint, full unit suite and build.
