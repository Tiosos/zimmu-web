# Persisted release record - notes

**Spec:** `../specs/2026-10-14-persisted-release-record-design.md`

- 2026-10-14: `CLAUDE.md` said format version 26; `useFile.ts` was already 27. This slice makes it 28.
- Decided with the user: snapshot plus metadata (not metadata-only, not an embedded ZIP); self-declared releaser labelled unverified; only `technically-ready` can be recorded.
- Rejected: freezing whatever is live at click time (snapshot could differ from the ZIP); recording at export time (changes the workflow, too large for a slice).
- `source` is stored as a string because 6 dp float rounding on save would otherwise break `sourceSha256`.
- `releases` sits outside `Scene` and `ProjectStructure` so neither self-containment nor project undo can touch it.
- Deferred: registration/acknowledgement, withdrawal, open-snapshot-as-copy, verified identity.
- Max-level review (same day) found nine issues, all verified against the code and folded into the spec: sync `parseFile` vs async hash (verification moved out of parse); integrity wording limited to accidental corruption; malformed entries kept as unreadable instead of failing the file; older-build data loss (future builds save newer files as copy only); dirty tracking by reference and a 16 MiB source cap; file-local revision numbers; explicit refusal cases and A -> B -> A; `source` authoritative over the rounded saved scene; CLAUDE.md needs v27 and v28 history, tree entry and invariants.
- Deferred: compressing or delta-storing release sources; the size budget is a simple cap for now.
