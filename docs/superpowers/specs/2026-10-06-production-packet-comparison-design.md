# Production-packet revision comparison

Compare two locally selected archives after independent integrity verification. Match parts by stable part ID and operations by part/operation ID; report added, removed and modified entities with stable references, before/after definitions, provenance and both output locations. Separate physical manufacturing edits from labels/provenance and export metadata; do not confuse page/record shifts with semantic edits.

New exports need a hashed complete part inventory because schedules omit parts without operations. Retain compatibility with older packets and label missing inventory coverage partial, comparing only fields present on both sides. Failed or incomplete verification blocks comparison rather than returning a misleading zero-change result.

Other outputs such as assembly drawings and hardware lists are listed when changed but are not assumed to be formatting-only. This workflow neither authenticates authorship nor approves production.

Validation covers actual packet exports, stock-only changes, geometric drilling versus manual instructions, additions/removals, renames/provenance, ordering/page shifts, legacy packets, malformed content, input capture, local upload/report download and unchanged live-project state.

Notes: [implementation notes](../notes/2026-10-06-production-packet-comparison-notes.md).
