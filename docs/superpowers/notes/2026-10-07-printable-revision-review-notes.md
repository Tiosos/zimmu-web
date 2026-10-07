# Printable review and reliable resume notes

- Continued the review workflow with a portable HTML snapshot, then fixed a real asynchronous resume race before publishing both improvements to PR #88.
- The summary validates review coverage, keeps independent counts, orders pending items first, and includes all items and exact hashes. Field differences and provenance retain readable context; added/removed entities include their recorded definitions.
- No scripts, remote assets or user-controlled links are generated. All variable text is escaped and a restrictive CSP accompanies print styles. JSON remains the resumable format.
- Resume generation advances on imports, review edits and unmount. Late success and failure handlers check the generation; the latest user action wins without disabling editing.
- Validation: 171 unit-test files passed (2,904 tests, 10 existing skips), plus all four packet/readiness browser checks including HTML download, print layout and PDF generation. Final typecheck, lint, catalogue build and production build passed. The only typecheck correction was an explicit type on an empty-array test fixture.
- Mutation evidence: removing escaping/record validation and bypassing resume generation checks produced six expected assertion failures. Both source files were restored byte-for-byte before final checks.
