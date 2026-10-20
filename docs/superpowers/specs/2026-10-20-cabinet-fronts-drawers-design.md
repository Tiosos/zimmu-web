# Fronts & Drawers

User selected the proposed 25-task Fronts & Drawers workspace after the merged Layout/Finishing batches.

## Tasks
1. Workspace in the cabinet editor.
2. Multi-opening selection.
3. Select all editable openings.
4. Select door openings.
5. Select drawer-front openings.
6. Select uncovered openings.
7. Clear selection.
8. Stage left-hinged single doors.
9. Stage right-hinged single doors.
10. Stage double doors.
11. Stage drawer fronts.
12. Stage false fronts.
13. Stage cover panels.
14. Remove selected fronts.
15. Side-mount runner settings.
16. Undermount runner settings.
17. Automatic drawer-box height.
18. Custom drawer-box height.
19. Side-mount screw-line offset.
20. Drawer-box material selection.
21. Opening/drawer fit validation before acceptance.
22. Proposed front-elevation preview.
23. Hardware quantity changes.
24. Board quantity/size changes.
25. One coordinated undoable Apply.

## Scope and behavior
Operate on physical face-frame zones when a section has an explicit independent frame layout; otherwise operate on the structural leaf's front, including two-leaf doors with pair stiles. Do not alter section divisions, frame layouts, shelving, cabinet mounting/reveals or unrelated openings. Selection filters read staged front choices. Selection changes retain staged edits; clear/reset/cancel behavior must be explicit. Drafts are local and discarded on tab exit. Front actions may be accumulated with drawer actions before Preview, allowing coordinated valid final edits.

New drawer fronts create actual driven drawer components through the existing generator. Drawer actions require every selected opening to carry a staged/current drawer front and to be editable. Reject detached drawer components, detached front boards or detached box boards for a selected opening; preserve manual finishing parts and unrelated drawers. Existing unsupported hardware dimensions are not replaced with new vendor claims. Side-mount offsets apply only to side-mount drawers; reject offset edits on undermount targets. Automatic height is null; custom height must be positive finite and no larger than the physical opening. Material must be an existing panel material with positive finite thickness, not edge stock; blank means the existing conventional drawer-side default and is explicitly labelled.

Preview builds proposed geometry through the normal pipeline, then validates complete five-board boxes, finite positive emitted boards, and front existence for each proposed front. Invalid final fit never modifies the scene. Present the front projection plus before/after generated hardware quantities and added/removed/resized board rows. These are model-derived design changes, not verified installation/manufacturing approval. Use stable role-based comparison rather than random IDs for preview-created drawers. No-op drafts disable Apply.

Signatures include geometry-bearing scene parts/components, source drawer parameters and catalogue/rule pins, excluding mesh caches and unrelated hardware/pricing metadata. Edits and selection changes clear Preview. External geometry changes require Reset while preserving draft inputs; mesh changes do not invalidate. Apply rejects stale/invalid/no-op previews and rebuilds from independent staged input against the latest scene, preserving current unrelated metadata. The scene callback commits via normal reconciliation in one separate undo step. Reset and Cancel discard staged edits without modifying the project.

## Validation
Tests cover every front action, mixed multi-selection, new/existing drawers, independent frame zones, defaults/custom heights/materials/families/offsets, manual-part locks, preserved unrelated content, actual emitted boards and machining/hardware changes, invalid fit, stale/no-op/tampered acceptance and independent snapshots. UI coverage includes filters, accumulated staging, controls, projection, summaries, invalidation/reset/cancel and rejected/successful Apply. Scene-hook and Chromium tests verify actual drawer geometry and separate sizing/edit undo/redo. Deliberately mutate guards after green baseline and restore/compare source copies. Run full units with local networking, then typecheck/lint/builds and browser checks without competing heavy jobs.
