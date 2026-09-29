# Manufacturing Readiness Stage 4 — production handoff packet

## Scope

One ZIP export from Manufacturing readiness contains the advisory report PDF, the existing full
shop-drawing PDF (cover, cabinet assemblies, available shelf installation sheets, and all part
sheets), board/dowel/hardware CSVs, and a machine-readable manifest. Include hidden items, as the
readiness report does. Keep the existing individual exports available.

## Snapshot and traceability

Copy the scene, project name, and material and hardware pricing libraries synchronously at click time. Derive all
outputs from that copy. Give the drawing deck the same UTC date as the readiness report. The
manifest identifies the snapshot time, counts, source SHA-256, and each file's byte length and
SHA-256. The source hash is not a saved project revision. A recipient needs the source data to
verify that particular hash; individual file hashes can be checked against the ZIP contents. Merge
material rates field by field as the existing BOM does, with scene values taking precedence.

Never silently omit a referenced shelf sheet. If the readiness engine skipped shelf assessment,
include the warning in the report and do not run an unbounded installation-sheet generator for
that cabinet. If any required output fails, surface an error and offer no partial packet.

## Verification

Unzip the result in tests, compare manifest hashes and drawing page count, check the cabinet and
installation references, hidden boards and CSV contents, and mutate the source after export starts
to prove snapshot isolation. Exercise skipped checks, Unicode labels and filename safety. Test UI
error recovery and inspect a real browser download in E2E; run typecheck, lint, all unit tests,
build, and CI before review.
