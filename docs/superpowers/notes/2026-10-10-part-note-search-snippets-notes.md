# Part note search snippets — notes

- Excerpts include finding references and use NFC text with lowercase-offset mapping to preserve the displayed case even when lowercase expands a character.
- Focused suite: 58 tests passed. Showing snippets for empty queries, showing nonmatching notes and truncating away deep matches each produced assertion failures; source restored byte-for-byte.
- Removing the part-association guard also produced an assertion failure when multiple part rows matched the same label query.
- Typecheck, lint, full suite (173 files; 2,980 passed, 10 existing skips), catalogue/app builds and Chromium note-snippet verification passed.
