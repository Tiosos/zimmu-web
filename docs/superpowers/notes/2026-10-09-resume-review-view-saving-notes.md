# Resume review view saving — notes

- Explicit resume saves the current view first; denied storage leaves saving paused.
- Focused baseline: 60 tests passed. Four deliberate regressions produced assertion failures: bypassing write-failure handling, never resuming future saves, clearing the checkpoint, and rejecting successful saves. Source restored from backups.
- Typecheck, lint, full suite (173 files; 2,976 passing tests, 10 existing skips), catalogue/app builds and Chromium comparison/resume/forget workflow passed.
