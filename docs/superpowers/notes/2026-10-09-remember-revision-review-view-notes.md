# Locally remembered revision review views — notes

- Preferences are optional local browser data, scoped to ordered archive hashes; storage failure must not affect review content.
- Last-ten-pair retention bounds browser data and stores only explicitly selected view fields.
- Validation: typecheck, lint, 173 unit files / 2,972 passed tests with 10 existing skips, catalogue/application builds and Chromium packet comparison passed.
- Eighteen storage and three UI mutations produced assertion failures; restored byte-for-byte from `/tmp/remember-view-storage.bak` and `/tmp/remember-view-ui.bak`.
- Saves the visible finding rather than an underlying selection hidden by pending-only. The parent keys review instances by ordered packet hashes to prevent preference state crossing pairs.
- Tests clear optional local preference storage between cases; explicit remount cases verify restoration within each test.
