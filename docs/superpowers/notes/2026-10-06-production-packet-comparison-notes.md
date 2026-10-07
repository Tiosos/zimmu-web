# Production-packet comparison notes

- The preceding integrity feature remains an uncommitted prerequisite in this workspace. Its verifier now exposes bounded files only after successful checks, avoiding a second unbounded ZIP extraction in comparison.
- New `machining/parts.json` covers hidden and operation-free parts. Existing schemas remain version 1; the new optional manifest inventory declaration distinguishes new coverage from legacy packets. Missing a declared inventory fails verification.
- Comparison ignores physical record/page order and uses compound part/operation identities. Label and ownership edits remain visible metadata, not manufacturing geometry.
- Legacy comparisons use only shared recorded fields. Missing stock/edge details are an explicit coverage limitation, not fabricated changes.
- Packet dates, project names and source digests are separate. Other changed files remain unclassified: a changed PDF may contain assembly-placement changes, so it must not automatically be dismissed as formatting.
- JSON reports retain complete before/after definitions, provenance, source locations and archive digests. UI lists are bounded to 200 changes without truncating the download.
