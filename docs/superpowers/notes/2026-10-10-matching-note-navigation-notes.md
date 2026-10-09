# Matching note navigation — notes

- Navigation clears finding filters while retaining the summary query.
- Strengthened the exact-selection test to use two findings on the same part after fallback masked a wrong-selection mutation. Wrong selection and retained pending filtering then produced assertion failures; source restored from backup.
- Typecheck, lint, full unit suite (2,981 passed, 10 existing skips), catalogue/app builds and Chromium comparison workflow passed.
