# Revision checkpoint status notes

- 2026-10-08: Continue review usability after the approved #95–#98 integration. Reuse markEdited to keep UI status aligned with existing ref-based discard and race guards. A JSON download initiation is a local checkpoint indicator, not proof that a file was saved to disk.
- Focused tests: 24 passed. All eight persisted edit controls update the indicator; HTML and filters preserve it. Invalid resumes retain pending edits and valid resumes clear them. Mutated state propagation, JSON clearing, HTML preservation and resume clearing each produced expected AssertionErrors; restored from a byte-verified backup.
- Full validation: 172 unit files passed; 2,927 tests passed, 10 existing skips. Typecheck, lint, catalogue build, CAD build and real Chromium comparison/export test passed. Browser checks confirm pending status after edits and cleared status after JSON download and exact-pair resume.
