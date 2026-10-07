# Printable review navigation notes

- Started from main after PR #89 merged at fb57424.
- Fixed section fragments avoid turning archive locations or untrusted review text into active links. Navigation is for the saved HTML; print CSS hides it to preserve the report's printed content.
- Validation passed: 171 unit-test files (2,907 passed; 10 existing skips), typecheck, lint, catalogue and production builds, and the real-packet comparison browser workflow including navigation and print/PDF checks.
- Mutating coverage section IDs produced two expected link-target AssertionErrors; source restored from a backup before final validation.
