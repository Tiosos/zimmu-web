# Cabinet Placement tab

Select a cabinet and open **Placement** to stage a free position using X/Y/Z, turn left or right by 90°, or reset rotation. Existing X/Y tilt is retained by quarter turns; Reset rotation clears all three axes. Draft positions use the shared parent's coordinate frame, not global room coordinates. Leaving the tab discards its draft.

Choose a **Reference cabinet** to align left/right/front/back/bottom/top edges or centre along width/depth/height. Each alignment changes only one position axis and uses the proposed rotation. Reference cabinets must share the parent; self and transitive anchored followers are excluded. These are one-time alignments, not new anchors.

An anchored cabinet requires **Detach existing anchor when applying** before free placement is enabled. This removes only its anchor when applied. Its anchored followers remain attached and are resolved in the preview and committed scene.

**Preview cabinet placement** draws sibling occupied envelopes in plan and lists positive-volume overlaps in three dimensions. Touching faces and vertically separated cabinets are not overlaps. Envelopes include front/frame and applied-back thickness from material slots, matching existing placement rules; per-board overrides do not move neighbours. For rotated cabinets these boxes are conservative. Warnings allow an intentional Apply and do not replace room or production clearance assessment.

**Apply cabinet placement** commits one separate undo step. Unfinished/non-finite values, missing targets, stale previews and unchanged proposals cannot create placement edits. Reset or Cancel loads the current position without changing scene data. Model geometry, positions, anchors or materials changing while a draft is open retain the draft for inspection but require Reset before previewing. Mesh-only updates do not expire previews.
