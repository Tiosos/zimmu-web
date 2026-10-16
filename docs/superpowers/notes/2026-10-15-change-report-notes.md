# Exported working-design change reports

- Adds standalone printable HTML and schema-versioned JSON to the existing release source comparison. This is a source-comparison export, distinct from the packet revision review workflow.
- The builder captures baseline metadata, source strings and comparison before its first await, then hashes both strings and rechecks the baseline digest. It never retains references to live scene/library data. Source hashes, release/packet references and all comparison fields remain together in both formats.
- HTML has static print CSS and an explicit restrictive CSP; every user-controlled text value is escaped, and no external assets or scripts are included. Browser Print supplies printing and PDF conversion. Both serialisers include every returned item and field; collapsed UI details do not limit exports.
- Uses the existing download helper. Buttons serialize requests, show failures for retry and cancel delivery on unmount. Reports are explicitly captured when requested; no saved-file changes or approval state are added.
- Other source section changes retain the comparator's names, not full source definitions. The report states this scope in user documentation and retains all comparison limitations.
- Tests cover exact hashes and dimensions, additions/removals, metadata/hardware, zero-change exports, detached snapshots during asynchronous hashing, HTML escaping/complete field coverage, failed export recovery and closing during preparation. The browser workflow downloads both formats, inspects print mode, and verifies the saved JSON remains unchanged after undo.

- Validation: 24 focused tests across report generation, comparison UI, source comparison and release list passed; the extended Chromium workflow passed; type checking, lint and production build passed. Export completeness is checked with 205 added items.
- Mutation checks: reversing the baseline integrity guard made the corrupted-source rejection test fail; removing HTML escaping made the DOM injection test fail. Both changes were restored before the passing checks.
