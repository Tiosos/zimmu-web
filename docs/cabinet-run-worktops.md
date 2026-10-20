# Run-spanning worktops

Open a cabinet's **Finishing** tab, then choose **Run-spanning worktops**. Select two or more cabinets in the same container, or use **Select anchored run** for the current cabinet's left/right anchored neighbours. Membership stays explicit: a cabinet added later is included only after selecting it.

Cabinets must share their orientation, occupied front line and top plane. Cabinet depths may differ; the rectangular worktop reaches the deepest rear edge. Cabinet heights may differ when their tops align. Corner runs require separate worktops. Fronts, frames and applied backs contribute to the material-slot envelope; individual board thickness overrides do not enlarge it.

Set left, right, front and rear overhangs, the vertical gap above the cabinets, and the allowed gap between adjacent cabinets. Gap allowance permits the geometry; it does not verify structural support. Choose a panel material, stock or custom thickness, grain and board name. Preview the dimensions, area, individual cabinet widths and gaps, and the complete Front, Top and End views. **Add run worktop** creates one ordinary board in one undo step.

**Follow cabinet run** is enabled initially. Linked worktops follow valid cabinet resizing and movement, including common-container transforms. Their recipe is saved with the project. The board belongs to the shared container rather than one cabinet. It participates in normal drawings, cutting lists, nesting and manufacturing exports as one full-size board.

The linked-worktop list provides **Edit**, **Detach** and **Delete**. Editing retains the board ID and preserves visibility, color, edge treatments and machining. Preview before saving. Detach keeps the current geometry as a fixed board. Delete removes the board and its joint references. All three actions support undo and redo.

If a source cabinet disappears or becomes misaligned, the last valid geometry stays visible and the list explains the problem. Edit the selection or correct cabinet placement, then preview again. Removing every source releases the link. Editing owned dimensions, placement, name, material or grain with normal part tools also releases it; cosmetic and machining changes retain it. Duplicating a worktop creates a fixed copy.

Changing the scene invalidates an open preview. Reset the draft or reload the linked worktop before continuing. Leaving the workspace discards unsaved draft settings. Version 31 project files preserve run recipes; older projects continue to load.
