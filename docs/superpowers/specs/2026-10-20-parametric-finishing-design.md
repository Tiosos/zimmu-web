# Parametric cabinet finishing

Extend the existing Finishing tab with opt-in linked boards. Existing and new unchecked boards remain fixed-size. A linked board carries a versioned recipe, is role-free and non-driven, and uses its immediate carcase parent as owner. It is reconciled after carcase generation and before joints. Geometry derives from the occupied material-slot envelope, including fronts and backs; overrides do not expand it.

## Tasks

1. Opt-in cabinet following.
2. Persist linked recipes.
3. Worktop width/depth following.
4. Preserve overhangs.
5. Preserve vertical gaps.
6. Left end following.
7. Right end following.
8. Cabinet/custom heights.
9. Left filler following.
10. Right filler following.
11. Preserve filler widths.
12. Plinth width following.
13. Toe-kick height following.
14. Toe-kick setback following.
15. Splashback width following.
16. Stock thickness following.
17. Custom thickness and grain.
18. Linked panel list.
19. Load linked panel.
20. Preview edits.
21. Stable-ID updates.
22. Detach to fixed board.
23. Delete linked panel.
24. Invalid-link diagnostics and last-good geometry.
25. Undo/redo, persistence and manufacturing.

## Rules and limits

Persist the complete draft with explicit follow, height and setback modes in optional BoardPart.finishing; bump the project format from 28 to 29. Reject malformed recipe data at file boundaries. Old files require no recipe migration. New linked end/filler heights can follow occupied cabinet height less bottom clearance; custom heights remain literal. Plinth height can follow positive toe-kick height less clearance, with zero toe kick invalid. Setback following uses the cabinet toe-kick setback. Splashback height remains custom. Every rebuild validates finite positive dimensions, supported material, mode and source cabinet geometry.

Link updates preserve ID, color, visibility, cuts, machining and edge decisions. Direct normal-part changes to recipe-owned dimensions, transform, label, material or grain detach the recipe atomically; cosmetic and machining changes retain it. Explicit detach preserves all last-good geometry. Deleting a board cannot resurrect it. Removing/reparenting its owner freezes/promotes the manual board and drops its recipe once its parent is no longer a carcase. Copying a whole cabinet naturally copies recipes relative to the new parent. No cross-cabinet recipe IDs.

Invalid dynamic geometry keeps last-good board geometry and reports errors in the owning Finishing list; it is not silently deleted. Restoring valid cabinet/material inputs resumes following. These are single-cabinet boards, not spanning worktops, scribing, collision guarantees, automatic cuts or manufacturing approval. Preview uses existing Front/Top/End projections; editing replaces the target in preview rather than duplicating it. Acceptance checks a geometry-and-recipe signature and rebuilds from current data; caller-supplied candidate geometry is never trusted. Each accepted edit, detach and delete is one undo transition.

Notes: ../notes/2026-10-20-parametric-finishing-notes.md
