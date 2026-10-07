# Revision classification progress

Show acknowledged, pending and total detected findings separately for Manufacturing and Metadata in the local review dialog and printable report. Derive counts from whole-finding classification and stable-reference acknowledgments, not field classifications, report headline counts, array positions or navigation filters. A manufacturing finding can contain metadata fields without being counted twice.

Use one browser-safe helper in packetRevisionReview.ts, shared by both presentations. Keep both zero rows visible. Preserve schema version 2 and all existing independent change/output/limitation coverage, ordered packet hashes and unsigned/partial-coverage notices. Packet-level metadata changes are outside this finding breakdown.

Implement from main independently of the pending classification-filter and comparison-filename PRs. No dependencies on either feature are required. Prefer a small derived helper over serialized counts that could drift; prefer an accessible table over charts for this small static breakdown.

Validation: mixed and reordered acknowledgments, zero findings, misleading headline counts, mixed fields; dialog acknowledgment/search/pending behavior and exports; printable rows and partial scope; a real browser export. Mutate classification matching and reference association, predict and inspect assertion failures, restore backups. Run required unit suite, typecheck, lint, catalogue build, CAD build and focused Playwright test before publishing. Monitor the exact PR head's CI checks.
