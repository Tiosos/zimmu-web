# Retry review view saving — notes

- Retry and resume share the explicit storage write, with separate state transitions.
- Focused suite: 56 tests passed. Missing retry, false success, ignored recovery and lost checkpoint each produced assertion failures. Source restored byte-for-byte.
- Typecheck, lint, full suite (173 files; 2,978 passed, 10 existing skips), catalogue/app builds and Chromium comparison workflow passed.
