# Production release gate

Assess a final ZIP in the verification dialog and export a separate release record bound to its SHA-256. A self-contained ZIP cannot contain its own final hash. Leave packet exports available for diagnosis; release assessment is a separate step.

Use bounded integrity inspection before reading readiness evidence. Combine its findings with manufacturing/production/machining/shelf findings in the verified production-review summary. Correction findings block release; advisory/unassessed findings require review. Preserve source IDs, targets and all output locations. Unsupported or malformed evidence fails closed. Empty packets cannot become technically ready.

Default to revision release: require earlier ZIP and saved review JSON, recompute comparison from both ZIPs, then validate the saved record against that comparison. Unacknowledged changes, outputs and limitations require review. Partial comparisons remain unassessed. Explicit initial-release mode records that declaration instead of requiring a predecessor. Never interpret acknowledgments as geometry corrections or formal approval.

Export schema-versioned JSON containing current packet hash, timestamp, integrity scope/limitations, release findings, revision evidence hashes and independent formal-approval status `not-recorded`. Any packet change requires fresh assessment. UI explains status and exposes traceable findings and complete download, including blocked assessments. Input changes invalidate displayed assessment; pending asynchronous results cannot survive input replacement/unmount.

Test correction/advisory/unassessed priorities, valid through-hole packets, missing/malformed evidence, real hash changes, bound/stale/incomplete revision reviews, initial mode and UI generation safety. Run repository-required checks, browser packet workflow, and meaningful guard mutations.
