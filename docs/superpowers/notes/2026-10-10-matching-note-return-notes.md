# Return from matching note — notes

- Return uses the exact finding reference; removed search matches fall back to the summary search input.
- Removing return focus and retaining the return control after use produced assertion failures; source restored byte-for-byte.
- Typecheck, lint, 2,981 unit tests (10 existing skips), catalogue/app builds and Chromium focus/viewport round trip passed.
