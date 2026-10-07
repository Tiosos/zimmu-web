# Revision review coverage notes

- Extended the local revision review record rather than adding semantic guesses for PDF/readiness/stock-list changes.
- Schema version 2 keeps three distinct progress arrays. Namespaced references encode the exact output path (`PO:`) or limitation statement (`PL:`); full comparison and ordered archive hashes remain mandatory on resume.
- Version-1 drafts preserve change progress but cannot introduce output/limitation acknowledgments. New coverage starts unchecked and subsequent downloads use version 2.
- Acknowledging every item does not change partial coverage or approve production. Output paths may exist in only one archive; the UI instructs users to inspect the archive contents directly.
- Existing integrity, comparison and local-review work remains uncommitted on the same feature branch.
- Verification: 170 unit-test files passed (2,895 tests, 10 existing skips); all four packet/readiness browser checks passed. Typecheck, lint, build and whitespace checks passed. Build retains the existing large-bundle warning.
- Mutation evidence: bypassing import guard throws produced five assertion failures, including legacy coverage and invalid-reference cases. Restored the backed-up source byte-for-byte before the final full suite.
