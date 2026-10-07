# Revision review step navigation notes

- Started from main at fb57424. PR #90 remains separate and open; this change does not depend on its printable report navigation.
- Navigation follows the existing resolved active selection and comparison order, rather than introducing a second cursor or changing acknowledgment behavior.
- Validation passed: 171 unit-test files (2,907 passed; 10 existing skips), typecheck, lint, catalogue build, production build and the real-packet comparison browser workflow.
- Changing Next to retain the current selection caused the expected identity-selection AssertionError. Restored the original source from a backup before final checks.
