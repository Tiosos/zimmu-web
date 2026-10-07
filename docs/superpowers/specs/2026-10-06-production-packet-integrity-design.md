# Production-packet integrity verification

Recipients need to know whether a downloaded packet is complete and whether its machining references still agree with its printed drawings. Provide a local ZIP upload from File, returning passed/failed/unassessed results and a downloadable JSON report with stable finding IDs and paired output locations.

Verify required inventory, byte lengths, SHA-256 hashes, manifest/summary consistency, shared CSV/JSON content, schedule/index identity and provenance, logical CSV record numbers, actual PDF page counts and printed part/operation IDs. Preserve geometric drilling, valid through-hole depth modes and grouped manual instructions. Retain manufacturing problems independently of integrity status.

Bound archive expansion, entry counts and PDF decompression. Reject unsafe and duplicate archive paths without filesystem extraction. Unsupported schemas/encodings and unresolved references must not report success.

Trust limits: an unsigned enclosed manifest proves neither authorship nor fabrication readiness. Source snapshot digest, annotation layout/coordinates, regenerated geometry, readiness PDF semantic fidelity and board/dowel/hardware list semantics remain outside scope; disclose them in every report.

Validation: real packet fixtures, rehashed semantic alterations, malformed/oversized archives, Unicode IDs, multiline CSV, manual grouping, through-holes and browser download-upload-report recovery.

Implementation notes: [production-packet integrity notes](../notes/2026-10-06-production-packet-integrity-notes.md).
