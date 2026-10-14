# Persisted release record - notes

**Spec:** `../specs/2026-10-14-persisted-release-record-design.md`

- 2026-10-14: `CLAUDE.md` said format version 26; `useFile.ts` was already 27. This slice makes it 28.
- Decided with the user: snapshot plus metadata (not metadata-only, not an embedded ZIP); self-declared releaser labelled unverified; only `technically-ready` can be recorded.
- Rejected: freezing whatever is live at click time (snapshot could differ from the ZIP); recording at export time (changes the workflow, too large for a slice).
- `source` is stored as a string because 6 dp float rounding on save would otherwise break `sourceSha256`.
- `releases` sits outside `Scene` and `ProjectStructure` so neither self-containment nor project undo can touch it.
- Deferred: registration/acknowledgement, withdrawal, open-snapshot-as-copy, verified identity.
