# Reset revision review view — notes

- Resets only existing React view state; no review updater or resume-generation changes.
- Keeps the active finding or, when none is visible, the previously selected reference.
- Validation: typecheck, lint, 172 unit files / 2,964 passed tests with 10 existing skips, catalogue/application builds and Chromium packet comparison passed.
- Eleven deliberate regressions produced assertion failures, covering each reset, hidden selection, checkpoint preservation and pending-resume preservation. Source restored byte-for-byte from `/tmp/reset-view-ui.bak`.
