# Fronts & Drawers

Open a cabinet's **Fronts & Drawers** tab. Select individual openings or use the filters for all editable openings, doors, drawer fronts or uncovered openings. Filters read staged choices, so you can stage drawer fronts and then select those drawers. Independent frame-layout openings are listed separately; a structural pair of doors with a pair stile stays one logical selection.

Choose Left-hinged door, Right-hinged door, Double doors, Drawer front, False front, Cover panel or Remove front. These commands stage changes only. Selection changes and Clear selection retain all staged edits. Reset and Cancel discard them. Existing structural divisions, frame layouts, shelves and unrelated openings are retained.

For drawer settings, every selected opening must have a current or staged drawer front. Stage side-mount or undermount runners, automatic or custom box height, a side-mount runner screw-line offset, and a drawer-box material. Blank material explicitly uses the existing conventional drawer default. Values apply only when a Stage button is pressed. Choosing undermount discards a staged side-mount offset; the underlying model's unused default offset remains unchanged.

**Preview fronts and drawers** builds the proposed scene with the normal generators. It checks complete boxes and runner fit, excessive custom height, modeled shelf interference and generated front/board geometry. A box below a shelf may fit when a full-height box would not. Reduce box height or adjust shelving in Section rather than silently removing shelves. Openings with detached front/drawer/box parts are locked. These checks do not assess arbitrary manual obstacles or certify installation: the existing hinge/runner models retain their documented limitations.

The preview shows a front elevation, generated hardware quantity changes, and before/after board quantity, size, material and label rows. Machining-only changes need not change these quantities or dimensions. UUIDs for preview-created boxes are temporary; comparisons use their opening/role identities. Review the staged settings together with the preview.

**Apply fronts and drawers** commits the whole proposal as one undo step, separate from earlier sizing. Stale, invalid and unchanged previews cannot apply. Geometry, material, ownership or drawer-parameter changes require Reset; mesh updates do not. Applied drawer components and boards use normal persistence, hardware, manufacturing and editing paths. Drafts are discarded when leaving the tab.
