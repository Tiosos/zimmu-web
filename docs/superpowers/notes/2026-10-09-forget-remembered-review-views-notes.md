# Forget remembered review views — notes

- Clears only the versioned review-view preference key and pauses writes for the mounted review; review progress remains in memory.
- A failed storage removal leaves saving behavior unchanged and reports failure.
- Typecheck and lint passed; full unit suite: 173 files, 2,975 tests passed and 10 existing skips. Catalogue/app builds and Chromium packet-comparison workflow passed. The first browser run lost its dialog after a documentation edit; an untouched rerun passed.
- Six deliberate regressions produced assertion failures: clearing unrelated storage, retaining remembered entries, falsely reporting removal success, missing the save guard, failing to pause saves, and clearing the review checkpoint. Source files were restored byte-for-byte.
