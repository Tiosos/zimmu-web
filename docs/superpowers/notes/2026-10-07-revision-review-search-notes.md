# Review search notes

- Started from main after PR #88 merged at afa96fb.
- Search matches labels and stable identities with NFC normalization and case-insensitive literal substrings; it composes with pending-only filtering.
- Selecting/searching is a view action. Stored acknowledgments, counts, both coverage lists and complete exports remain unchanged.
- The selector now has a stable accessible name independent of its option text. Search preserves the currently visible selection when it remains eligible and shows explicit no-match feedback.
- Validation passed: 171 unit-test files (2,906 passed; 10 existing skips), typecheck, lint, catalogue build, production build and the real-packet comparison browser workflow.
- Replacing the search predicate with an unconditional match caused the expected identity-selection assertion failure. The original source was restored before final validation.
