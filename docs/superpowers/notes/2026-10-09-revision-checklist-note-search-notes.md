# Revision checklist note search — notes

- Matches the review acknowledgment note bound to each recorded target; notes from other groups or overall review notes are not matched.
- Filtering remains live: changing a note so it no longer matches may hide that item; clear its search to continue editing.
- Validation: typecheck, lint, 172 unit files / 2,966 passed tests with 10 existing skips, catalogue/application builds and Chromium packet comparison passed.
- Four deliberate regressions produced assertion failures: notes omitted, notes shared across items/groups, normalization removed and wrong note reference. Source restored byte-for-byte from `/tmp/checklist-note-search-ui.bak`.
