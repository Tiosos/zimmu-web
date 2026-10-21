# Worktop machining — 25 tasks

1. Worktop machining mode under Finishing.
2. Select linked or fixed role-free manual boards in the cabinet/shared container.
3. List saved features.
4. Rectangular through-openings.
5. Circular through-openings.
6. Rectangular blind pockets.
7. Circular blind bores.
8. Editable sink starter.
9. Editable hob starter.
10. Feature names.
11. Rectangular length/width.
12. Circle diameter.
13. Blind depth.
14. Left/centre/right references.
15. Front/centre/rear references.
16. Position offsets.
17. Minimum edge clearance.
18. Feature overlap detection.
19. Three complete orthographic previews.
20. Dimensions/resolved positions.
21. One-step apply/undo.
22. Stable-ID feature editing.
23. Duplicate/remove/reset/cancel.
24. Persistence and resize revalidation.
25. Drawings/manufacturing exports.

Optional BoardPart.worktopMachining version1 stores an explicit feature list. Each feature has a stable ID/name, rectangle/circle shape, through/blind depth mode, rectangular length/width or circle diameter, blind depth, X/Y references and offsets, and minimum edge clearance, all dimensions finite numeric millimetres. Position refers to feature centre: edge offsets measure edge to feature centre; centre offsets are signed. Require dimensions/depth >0.1mm to match the kernel's minimum box subtraction. Through depth follows thickness; blind depth must leave material. Board axes X=length, Y=width, +Z=top; front means local Y0. At most100 features perboard. Simple rectangular features, no radii/appliance compatibility guarantees.

Only visible or hidden, non-driven role-free manual boards without frontPull are eligible. Linked single-cabinet finishing must be kindworktop. Fixed manual boards are selected explicitly; their orientation/name is not inferred. Workspace lists boards belonging to the current cabinet or its container. Unknown missing targets fail acceptance. Core API validates ownership independently of UI scope.

Resolve references against current board dimensions. Validate finite positive board geometry and finite feature extents, minimum edge clearance and XY overlaps. Rectangle/rectangle, circle/circle and rectangle/circle use actual shapes. Tangency is allowed. Valid emitted features must collectively leave finite positive board volume, including when zero-clearance rectangles tile the entire board. Collision checks concern only this workspace's features; unrelated machining/supports are not clearance-checked. Invalid features omit their owned derived cuts and show diagnostics, retaining recipes for repair. Pairwise overlapping features are both invalid. Normal board dimension edits revalidate rather than deleting machining recipes; normal finishing ownership release still applies separately.

Emit normal +Z BoxCut / single HoleArrayCut with deterministic IDs wm_<featureID>. Keep all unrelated cuts, edges, operations and scene metadata. Cuts are identified from the saved feature IDs, not a new geometry kind. No sourceComponentId/sourceJointId impersonation. Existing joint/component-owned IDs cannot be captured; acceptance rejects collisions with unrelated IDs. Generic cut editor/remove/pair actions are blocked for these derived cuts; editing/removal occurs in this workspace. Board duplication drops machining recipe and preserves copied geometry with fresh cut IDs.

Regenerate after finishing/run worktops, before joints. Metadata validation at both file boundaries; format31→32. Add metadata to finishingSignature so other previews stale. Preview stages the whole target feature list, preserves identity, rebuilds geometry without pipeline import, shows actual cuts and diagnostics; acceptance checks current signature, target ownership, recipe validity, collisions and no-op, then rebuilds rather than trusting candidate parts. Hook reconciles and records one undo step. UI resets/reloads on scene changes; successful apply captures new signature. Users may remove invalid features without being forced to repair them.

Notes: ../notes/2026-10-21-worktop-machining-notes.md
