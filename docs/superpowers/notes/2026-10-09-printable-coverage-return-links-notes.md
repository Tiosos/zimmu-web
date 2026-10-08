# Printable coverage return links — implementation notes

- Uses fixed `progress-changes`, `progress-outputs` and `progress-limitations` row IDs; user labels and references never form fragment IDs.
- Return links use the existing `.navigation` print rule, keeping printed counts and findings visible.
- Validation: typecheck, lint, 172 unit files / 2,954 tests passed with 10 existing skips; catalogue and application builds passed. Chromium packet comparison passed, including forward/return links and print-hidden navigation.
- Three deliberate regressions (wrong return group, duplicate row IDs, missing print-hidden class) produced assertion failures; source restored byte-for-byte from `/tmp/coverage-return-html.bak`.
