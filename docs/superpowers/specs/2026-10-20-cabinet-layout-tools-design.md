# Multi-cabinet layout tools

Builds on the merged staged Placement tools with a Layout tab available from any cabinet. Scope is sibling carcases in the selected cabinet's parent coordinate frame. Rotated occupied envelopes use the existing slot-based bounds, including applied backs/fronts/frames; per-board overrides do not alter placement envelopes. No new file schema or persistent draft storage.

## Twenty-five tasks
1. Layout workspace in the cabinet editor.
2. Select multiple sibling cabinets by labelled checkbox.
3. Select all siblings.
4. Clear selection.
5. Display the selected order and reference cabinet (first selected).
6. Move any selected cabinet earlier/later in that order.
7. Reverse order.
8. Sort order by occupied minimum along a chosen X/Y/Z axis.
9. Translate the selection by staged X/Y/Z offsets.
10. Arrange a run along X.
11. Arrange a run along Y.
12. Arrange a run along Z.
13. Set a nonnegative occupied-envelope gap for runs.
14. Align left edges to the first selected cabinet.
15. Align right edges.
16. Align front edges.
17. Align back edges.
18. Align bottom edges.
19. Align top edges.
20. Centre widths.
21. Centre depths.
22. Centre heights.
23. Distribute equal free gaps along X.
24. Distribute equal free gaps along Y.
25. Distribute equal free gaps along Z.

## Shared behavior
Operations accumulate on a local staged scene. Runs preserve the first selected envelope minimum and all off-axis positions; reference alignments leave the first selected cabinet fixed. Distribution sorts geometrically on its axis, keeps both outer cabinets fixed, accounts for unequal extents, and requires at least three cabinets and enough span for nonnegative free gaps. Translation requires one or more cabinets, run/alignment two or more. Reject duplicates, missing/cross-parent selections, blank/nonfinite/overflow values and invalid sibling geometry/transforms. Ordering itself changes no scene.

Selected anchored cabinets require an explicit detach checkbox before any operation; their resolved position is the starting point, so detachment does not jump. Unselected anchored followers remain linked and are resolved after each operation. Preview includes a read-only sibling plan, changed positions, and conservative positive-volume 3D envelope overlap warnings. Warnings permit intentional acceptance. Show the parent-frame/envelope limitations and discard-on-tab-exit behavior.

Preview and Apply are separate. Inputs, ordering, selection and operations invalidate previews. Geometry/material/anchor changes stale the draft and require Reset; mesh updates do not. Apply reconstructs only selected placements against the current scene and revalidates rather than trusting a cached proposed scene; preserve current hardware/metadata and unselected anchors. No-op/invalid/stale acceptance returns false. Apply commits via the normal reconciliation pipeline as a discrete undo step. Reset/Cancel never mutate the project.

## Validation
Pure tests compare actual envelopes for all actions and rotations, off-axis invariance, distribution endpoints and unequal widths; cover detach/followers, overlap volume/touching, atomic rejection and preservation of unrelated metadata. UI tests exercise selection/order, accumulated staging, preview invalidation/reset, warnings and rejected Apply. Scene-hook regression covers separate undo/redo and stale/no-op rejection. Chromium workflows exercise real geometry and undo. Mutation checks deliberately break each new guard after green baseline, inspect assertion failures and restore from copies. Run full units/typecheck/lint/builds and regenerate structure reference.
