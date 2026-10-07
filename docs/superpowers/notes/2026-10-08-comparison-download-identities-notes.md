# Comparison download identity notes

- Prepare this change locally while #94's integrated commit is in CI; its tested commit remains unchanged.
- Share only the identity suffix. Dedicated filename exports fix the correct report prefix and extension for each caller; existing review filenames remain stable.
- Validation passed: 172 unit-test files (2,917 passed; 10 existing skips), typecheck, lint, catalogue/production builds and the real-packet browser workflow checking comparison and both review filenames.
- Replacing the comparison download binding with its former generic filename caused the expected filename AssertionError. Restored the original component from a backup before final checks.
- Created the feature branch from main at 4c10a11 after #94's integrated commit passed all four checks and merged. Its tree matches the baseline used for local validation.
