# Edited revision review discard warning notes

- Track edits since JSON download/resume, rather than claiming downloads are durably saved. Printable HTML is intentionally not a resumable checkpoint.
- Native dialog cancel must prevent the browser's default dismissal before asking whether to discard progress.
- Packet file inputs cannot restore a previous FileList after rejection. Clear the input and display the retained active filename separately.
- Both preceding PRs merged before this branch was created from main at bf10952. Integration checks passed for #91's updated commit.
- Happy DOM does not expose native confirm; tests stub that browser capability and restore it after each case. The real browser workflow separately exercises native cancellation.
- Validation passed: 171 unit-test files (2,911 passed; 10 existing skips), typecheck, lint, catalogue/production builds and the real-packet browser workflow. Typecheck caught an unused test variable; after removing it the affected tests and remaining checks passed.
- Bypassing parent discard confirmation, bypassing resume confirmation and removing Escape's preventDefault each caused the predicted AssertionError. Backups restored before final validation.
