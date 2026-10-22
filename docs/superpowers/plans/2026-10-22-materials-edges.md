# Materials & Edgebanding implementation

Spec: ../specs/2026-10-22-materials-edges-design.md
Notes: ../notes/2026-10-22-materials-edges-notes.md

1. Extend PartOverrides grain ownership across carcase and shared generated-board reconciliation. Validate both file boundaries and bump save version. Preserve default grain without override and material geometry rules.
2. Add cabinet board targets, role/opening grouping and shared run-panel membership. Lock detached ownership. Resolve edge labels from world transforms relative to cabinet.
3. Implement typed staged patch operations and pure preview/acceptance, expanding drawer materials through drawer params and updating finishing recipes. Regenerate and verify openings, drawer fit, board identity and linked geometry; return before/after board and tape quantities.
4. Add two accessible editor tabs with search/material/role/opening selection, copying, inheritance controls, explicit-edge protection, presets, local SVG edge highlighting, draft discard and reset. Connect a single preview callback to reconciled scene history.
5. Cover all approved tasks with model/UI/history/file/browser tests. Run baseline then targeted guard mutations with exact backups and restore. Run full required validation sequentially, update guide and living notes, regenerate structure reference and commit to feature branch.

Approved task checklist: the first 25 cover workspace, role/opening list, multi/role selection, material/name filtering, inheritance display, assign/restore, fixed/adjustable/front/box/finishing assignments, length/width/free grain, copying, thickness display, actual geometry preview, fit guards, detached/stale guards and atomic apply. The second 25 cover workspace, four edges/orientation/highlight/matching selection, stock/clear/inherit, shelf/front/side/worktop/finishing presets, compatible copy, explicit protection, missing stock/compatibility diagnostics, lengths/totals, before-after, manufacturing integration, regeneration/persistence, atomic apply and tests/docs.
