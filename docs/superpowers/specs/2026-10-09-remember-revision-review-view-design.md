# Locally remembered revision review views

Remember change selection/search/classification/part filter, pending-only, part-summary search/order and checklist searches/orders in browser localStorage, scoped to the ordered earlier/later SHA-256 pair. Restore on remount or reload for the same pair; other/reversed pairs start with defaults. Retain at most ten recently used pairs in one versioned storage record. Never store review notes, acknowledgments, reviewer or checkpoint data.

Validate stored shape, enums, string lengths and hash identity. Corrupt, unsupported, oversized or unavailable storage falls back to defaults without breaking review/edit/export. Ignore stale selected/part references absent from the current report. Reset review view persists default preferences, retaining the active finding as already specified. Existing parent comparison lifecycle unmounts review when starting/replacing packets; ensure preference binding cannot cross pairs.

Tests: same-pair restore, different/reversed-pair isolation, bounded retention, corrupt/unavailable storage, stale references, reset persistence, no progress persistence and unchanged checkpoints/slow resumes. Chromium recomparison should restore view settings while starting a new review record. Mutate identity, validation, retention and persistence boundaries; restore source backups.
