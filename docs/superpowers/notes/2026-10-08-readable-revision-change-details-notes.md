# Readable revision change details notes

- This branch starts from main at 31b634e and is independent of #93's filename change.
- Preserve the exact recorded values and field names; inventing units or treating null as unchanged would misrepresent comparisons. React text nodes escape report content.
- Validation passed: 171 unit-test files (2,913 passed; 10 existing skips), typecheck, lint, catalogue/production builds and real-packet browser comparison. The browser fixture's earlier board length is 200 mm, unlike the unit fixture's 600 mm; corrected the browser assertion after inspecting its recorded value.
- Substituting later values in the earlier column and hiding present definitions caused the expected assertions to fail. Sources restored from backups before final checks.
