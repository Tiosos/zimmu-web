# Personal cabinet layout library

Build fifteen user-visible capabilities: save selected opening, save whole cabinet section tree, rename, duplicate, delete, search, sort, summaries, preview, apply to opening, apply to cabinet, export selected, export all, import append, and restore local library.

Store a versioned browser-local library of named section snapshots with IDs, creation/update timestamps and source cabinet dimensions. Snapshot structure, fronts, shelves and pin settings only; do not capture materials, per-board overrides, drawer parameters, company catalogue authority or project content. Whole-cabinet apply means replace the cabinet's root opening design while retaining its envelope and materials.

Reuse pasteOpening for destination identity and fresh descendant IDs; use real opening/drawer geometry validation and SectionElevation for preview. Preview cannot write the scene; Apply is a separate history command and rejects a changed cabinet. Design/material/override changes expire it. Entry changes or deletion also invalidate previews. Disclose replacement of independent frame layouts.

Validate imported and stored JSON as unknown, with a version marker, bounded file/library size, tree depth/node budget, unique section IDs and explicit enums/numbers. Parse into whitelisted fields. Invalid documents leave existing entries untouched. Import always appends new library IDs/names, never overwrites existing IDs. Local storage writes must succeed before the visible library claims a change; unavailable/corrupt storage is reported, not silently replaced. A storage event refreshes external changes; mutations compare the last loaded raw snapshot so another tab's change is not overwritten. Export remains available for intact loaded entries if persistence fails.

Confirm deletions inline. Preserve search, selection and naming fields where reasonable. File import results use a request generation to ignore late completion after another import or unmount. No new project format or dependencies.

Verify pure validation/identity/merge behavior, UI persistence and stale-preview flows, and browser save/reload/reuse/export/import with actual generated drawer boxes. Mutation-test newly introduced guards from backups before final typecheck/lint/full unit/browser/build checks.
