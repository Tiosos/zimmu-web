# Review download identity notes

- Started from main after #92 merged at 31b634e.
- Retain international letters/numbers while excluding separators, punctuation, controls and bidi formatting characters. Limit to 40 Unicode code points to keep the complete basename below common 255-byte filename limits even with four-byte characters.
- Hash prefixes identify the ordered archive pair; full hashes in the record remain authoritative. Repeated downloads for the same pair can still be renamed by the browser.
- Validation passed: 172 unit-test files (2,914 passed; 10 existing skips), typecheck, lint, catalogue/production builds and the real-packet browser workflow verifying both suggested filenames.
- Removing sanitization and substituting the later hash for the earlier hash produced the expected filename AssertionErrors. The original helper was restored from a backup before final validation.
