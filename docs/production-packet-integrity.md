# Production-packet integrity verification

Choose **File → Verify production packet…**, then select a downloaded ZIP. Verification runs locally without modifying the open project or uploading the packet. Download the JSON verification report to retain all findings, stable `PI:` references, part/operation IDs and both output locations. The dialog shows up to 200 findings.

The verifier checks:

- Optional declared `machining/parts.json` inventory: part identities, counts and dimensions/provenance against schedule records. New exports include it; older packets remain supported.
- ZIP file paths, duplicate entries, required inventory, manifest declarations, byte lengths and SHA-256 hashes.
- Review and reconciliation summaries against the manifest, including review category counts and status.
- Machining category/count/unit consistency and drawing-index operation identity, labels and provenance against the schedule.
- Schedule JSON entry indexes and logical CSV record numbers (including the header). Quoted multiline CSV cells remain one record; JSON definition key order is irrelevant.
- CSV content against its shared JSON serializer.
- Actual drawing PDF page counts, printed part IDs on indexed pages, and printed operation IDs at indexed page references. Grouped manual instructions retain their individual schedule entries. Cylinder drilling can appear in view labels; it remains geometric drilling.

Results are **passed**, **failed**, or **unassessed**. Missing, altered or inconsistent content fails. Unsupported schemas, unreadable/unsupported PDF content, extraction limits and declared missing/ambiguous drawing references leave checks unassessed. Errors take precedence when both occur. Known manufacturing/readiness findings do not themselves fail integrity; valid through-holes retain their classification.

Limits: 64 MiB compressed upload/per-file expansion, 128 MiB total expanded ZIP content, 512 ZIP entries, 4096 machining/index entries and part references, 64 annotations per operation / 65,536 total annotation references, 4096 PDF pages, 4 MiB decompressed content per stream and 32 MiB total PDF content. No archive paths are extracted to disk. Limits produce an unassessed result rather than claiming success.

## Trust and scope

The enclosed manifest is not a signature or proof of authorship. Someone who changes all corresponding files and hashes consistently can produce a passing packet. The original scene snapshot is absent, so its `sourceSha256` cannot be independently verified.

PDF checks support the text encoding emitted by Zimmu's renderer, including its Unicode fallback. They locate printed IDs on indexed pages; they do not establish exact annotation coordinates, view placement, annotation ordinals, geometry fidelity, or that the readiness PDF reflects every JSON finding. Board/dowel/hardware lists and the readiness PDF receive inventory/hash checks, not regenerated semantic checks.

Integrity is separate from fabrication readiness, machine compatibility and production approval. Continue to review manufacturing findings and unassessed checks before production.
