# Arrange several cabinets

Open any cabinet and choose **Layout**. Choose siblings from the same parent; **Select all sibling cabinets** and **Clear layout selection** manage the set. Changing the selection starts fresh. The order list identifies the first cabinet as the reference. Move items Earlier/Later, reverse the order or sort it by a chosen axis. Reordering retains staged positions.

- **Move selection:** enter X/Y/Z offsets in millimetres and stage the move. Repeating the action accumulates the offsets.
- **Arrange along X/Y/Z:** keep the first cabinet fixed and place the remaining cabinets in selection order, using the specified nonnegative gap between occupied envelopes. Other coordinates stay unchanged.
- **Align left/right/front/back/bottom/top** and **Centre width/depth/height:** match each selected cabinet's envelope to the first cabinet on that axis; other coordinates stay unchanged.
- **Distribute gaps along X/Y/Z:** select at least three cabinets. Geometric order determines the two outer cabinets, which stay fixed. The interior cabinets get equal free gaps, accounting for each cabinet's occupied size. If the span is too short, move the outer cabinets farther apart first.

Selected anchored cabinets require **Detach selected anchors when applying**. Staging begins at their resolved visible positions, so detaching does not jump them back to old coordinates. Unselected followers stay linked and move when their targets move.

The positions table shows staged coordinates. **Preview cabinet layout** checks sibling geometry, shows a plan and reports positive-volume overlaps in all three dimensions. Touching faces are allowed. Overlap warnings permit intentional placement because rotated bounding boxes are conservative. **Apply cabinet layout** records all selected placements as one undo step, separate from earlier sizing edits. Reset and Cancel discard staged edits without writing to the project.

All coordinates use the shared parent frame. Envelopes include front/frame/applied-back extents from material slots; individual board overrides do not alter them. This is cabinet layout, not room clearance or door-swing assessment. Drafts are discarded when leaving the tab. Geometry, material or placement changes require a reset; mesh updates do not invalidate previews. Save the project normally after applying to retain the layout.
