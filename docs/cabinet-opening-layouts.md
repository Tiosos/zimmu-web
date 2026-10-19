# Cabinet opening layouts

Select a cabinet, open its Section tab, and pick an opening in the elevation. The opening tools show its clear carcase width and height using the cabinet’s actual material and panel-thickness overrides. Face-frame apertures and front dimensions remain visible in the elevation.

Choose 2–8 **Split openings** and a **Division construction**, then **Split across** for vertically stacked openings or **Split down** for side-by-side openings. Panels create structural shelves/partitions; rails are horizontal only; front-only divisions add no panel. The existing front/interior inheritance rules apply. Choose construction appropriate to the intended front and shelf support.

For a child opening, **Size** supports Equal, Fixed and Percent. Fixed starts at the resolved width or height instead of a guessed dimension. Percent starts at the opening’s share of the clear parent span after division thicknesses. Equal siblings share remaining space after fixed and percentage claims. Invalid edits report why they do not fit and restore the retained model value. Fixed children are checked against their containing opening even when no equal-sized sibling remains. **Equalize openings** returns a group’s children to equal shares and remains available to repair a group after the cabinet is narrowed.

**Move opening left/right** or **Move opening down/up** swaps the selected opening with its neighbour. **Reverse opening order** reverses the selected split, or the siblings of a selected leaf. Sizes, contents, identities and hinge sides travel with openings; this is reordering, not a geometric mirror. **Edit parent opening** selects a containing group for sizing, splitting, merging or replacing its layout.

The **Opening layout** menu provides:

- **Open shelving:** three adjustable shelves, no front.
- **Single door:** one left-hinged door and one adjustable shelf.
- **Double doors:** a pair of doors and one adjustable shelf.
- **Three drawers:** three equal-height fronts and their generated drawer boxes.
- **Drawer above door:** a 140 mm top drawer above a left-hinged door and one shelf.

**Preview opening layout** shows the proposed cabinet elevation and validates the current cabinet, material geometry and generated new drawer boxes. New drawer layouts start with the existing side-mount defaults; box height or supported runner-depth failures block application. Applying replaces the selected opening subtree’s divisions, fronts, shelving and independent face-frame layouts. It preserves the selected root ID and size, other openings, cabinet dimensions, placement and material slots. Drawer children get fresh opening IDs so previous drawer or board overrides cannot attach to a different new opening accidentally. Adjust drawer parameters through the existing Front controls after applying.

Cancel leaves the design untouched. Changes to cabinet parameters, selection, materials or panel overrides expire the preview; asynchronous mesh updates alone do not. Invalid previews cannot be applied. Each application is a separate **Apply opening layout** undo/redo step, preserving earlier cabinet-size edits. The preview checks model geometry; the existing production assessment remains the place to review manufacturing limitations.
