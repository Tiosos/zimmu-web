# Production release gate — notes

- Final-hash release evidence is a sidecar download, avoiding circular ZIP hashing.
- Default revision mode recomputes comparisons from exact packets; initial release is an explicit declaration.
- Existing export paths remain available for correcting blocked packets.
- Focused suite: 33 tests across assessment, release UI, verifier UI and packet builder passed. Nine deliberate regressions produced assertion failures (status priorities, revision binding/requirements, unsupported/duplicate evidence, review limits, late output downloads and empty packets); source restored from backups.
- Typecheck, lint, full suite (175 files; 2,998 passed, 10 existing skips), catalogue/app builds and both Chromium integrity/release and comparison/review workflows passed.
- Output downloads copy verified bytes into an ArrayBuffer-backed view required by the download API. Earlier/current output locations are explicitly distinguished.
