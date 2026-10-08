# Revision coverage checklist search — notes

- Search uses the existing NFC/lowercase normalization and recorded labels/references; notes are not search targets.
- Pending shortcuts flush their view-state updates before querying the rendered checkbox so a no-match query cannot leave focus without a target.
- Validation: typecheck, lint, 172 unit files / 2,959 passed tests with 10 existing skips, catalogue/application builds and Chromium packet comparison passed.
- Five deliberate regressions produced assertion failures: search bypass, coupled queries, pending bypass, clearing both queries and normalization removal. Source restored byte-for-byte from `/tmp/coverage-search-ui.bak`.
- Browser selectors for “Find a change” now use exact matching because the new output-search label shares that prefix. Mutation assertions use query-based counts/presence to report the violated behavior directly.
