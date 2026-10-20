# Parametric finishing implementation

1. Add a browser-safe recipe schema and validator, optional BoardPart metadata and v29 format. Validate both legacy boundary and current files. Keep role/driven semantics unchanged: reusing carcase roles would cause deletion by regenerateComponents; a separate component would duplicate board ownership.
2. Extract the existing geometry builder so preview and regeneration share calculations without computing whole-scene signatures for every board. Resolve explicit height/setback modes against current cabinet inputs. Add post-carcase reconciliation preserving manufacturing metadata and freezing invalid output.
3. Extend preview acceptance with optional target ID and explicit update/detach/delete actions. Revalidate current target ownership, reject stale signatures and forged geometry; keep stable IDs. Wire existing scene callback with accurate history labels; detach on direct owned-field edits and on parent loss.
4. Extend the Finishing tab with linked list, edit/detach/delete, follow checkbox and conditional height/setback modes. Keep fixed-board workflow and labels compatible. Stale forms require reset/reload; successful operations absorb the reconciled signature. Render candidate in place of edited board. Report invalid links without mutating drafts.
5. Add focused geometry/lifecycle, malformed-file, UI, hook history and browser tests. Exercise every kind, dimension/material changes, rotated parent, missing parent, metadata, forged/stale acceptance, fixed regression, save/reopen/export. Mutation-test new guards with backups and inspect assertion failures before restoring.
6. Run typecheck, lint and full units sequentially with network permission for local HTTP fixtures; build both apps then focused Chromium workflows. Update guide/notes and structure index, inspect diff, commit locally. Do not publish or merge without a new user request.

Notes: ../notes/2026-10-20-parametric-finishing-notes.md
