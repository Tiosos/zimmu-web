# Local review notes for working-design change reports

- Adds reviewer name, overall notes and per-finding notes/check-offs for changed items, other changed source sections and comparison limitations. Findings have stable category-prefixed references. Partial reviews remain exportable; no release gate or approval status changes.
- New report downloads use schema version 2. Review records include complete coverage, labels/categories, reviewed/pending progress, a self-declared identity and formalApproval: not-recorded. Previously saved version-1 JSON/HTML stays untouched; no import or project-format migration is introduced.
- Draft context includes baseline release ID/revision/packet hash and exact before/after source strings. Both the UI and builder use the same context matcher. Content-equivalent rerenders preserve a draft; a different source pair uses an unchecked draft. The one retained in-memory draft may be reused when its exact source pair returns, provided it has not been replaced by edits for another pair.
- The exporter clones/validates review data before its first await, including exact context, complete/unique known references, booleans and text limits. It captures the review together with the same source pair whose hashes it exports. HTML escapes reviewer input through the existing text encoder.
- Closing, Escape and showing a part share a discard guard. A successful download request marks that exact draft copied; edits made later remain unsaved. Fields are disabled during preparation. Drafts are dialog-local and do not persist or resume from JSON; both the UI and user documentation say so.

- Validation: 82 tests across report/review UI, comparator, release list/status, verifier and App integration passed. The real Chromium workflow passed with notes/check-offs checked in JSON and printable HTML. Type checking, lint and the production build passed.
- Mutation validation: disabling the current-source context check caused both stale-draft export and source-change UI tests to fail with assertions; the original check was restored before final verification.

- Follow-on: version-2 JSON can now resume a local draft after complete source/comparison/coverage validation; see 2026-10-15-resume-change-review-notes.md. Drafts remain dialog-local rather than part of the project file.
