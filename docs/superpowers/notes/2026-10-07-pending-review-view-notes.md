# Pending review view notes

- Continued review usability work after publishing printable summaries and resume protection.
- Pending-only filtering applies to change selection and both coverage checklists. Selection falls back to the first available pending change when its current item is acknowledged.
- Counts and both exports retain complete progress. Clearing the view filter restores acknowledged items and their notes; no record schema changes or saved preferences are introduced.
- Final validation: 171 unit-test files passed (2,905 tests; 10 existing skips), all four packet/readiness browser checks, typecheck, lint, catalogue build, production build and whitespace checks passed.
- Separate mutations disabled change filtering and coverage filtering. Each produced the expected assertion failure; the backed-up component was restored byte-for-byte before the full final checks.
