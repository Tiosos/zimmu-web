# Cabinet handle and pull layout

Open a cabinet's **Hardware** tab after adding doors or drawer fronts. Each paired-door leaf is a separate front. Select individual checkboxes or use **Select all**, **Select doors**, **Select drawer fronts**, **Select configured pulls**, and **Clear front selection**. Fronts with detached front/drawer parts are locked. Cover panels and false fronts are excluded.

Choose a single-hole knob or a two-hole bar pull. Bars can run horizontally or vertically with a custom fixing pitch. Set drilling diameter and placement references:

- **Auto** horizontal reference uses a door's free edge, mirrored by hinge side, or the centre of a drawer front. The horizontal offset still applies; use zero to centre a drawer pull exactly.
- **Left/Right** measure the horizontal offset inward from that edge.
- **Top/Bottom** measure the vertical offset inward from that edge.
- **Centre** offsets are signed: positive moves right or up, negative moves left or down.

Defaults are editable examples: a vertical bar with 96 mm pitch, 5 mm drilling, 50 mm horizontal offset and 100 mm below the top. Confirm actual fixing dimensions and screw length against your hardware. The app models fixing holes, not a solid handle or a vendor-specific fit. Knobs use one hole; stored bar pitch and orientation are ignored for knob geometry and product identity.

**Stage pull settings** captures the form for selected fronts. Changing selection or the form does not rewrite staged settings. **Load selected pull** loads an existing single front's settings into the form. **Stage pull removal** schedules removal of the selected fronts' generated drilling and pull settings. Stage changes, then **Preview hardware changes** to inspect the actual hole centres, quantity changes and Front/Top/End views. Centres are shown as (horizontal from left, vertical from bottom), in mm. Each hole drills through the actual front thickness from its back face.

Holes must lie completely inside the front, must not overlap one another and must not overlap modelled hinge cups. Other machining, handle-body clearance, drawer-box interference and screw length remain a fit review responsibility. **Apply hardware changes** writes all staged changes as one undo step. Reset/Cancel discard local drafts; leaving the tab also discards them. Geometry, ownership and setting changes invalidate previews and require a reset; mesh and price updates do not.

Saved version 30 projects retain settings per front board. Front IDs remain stable while drilling updates after cabinet resizing. If new dimensions make a pattern invalid, the settings remain for repair but its drilling is omitted and Hardware reports the problem. Correct settings or remove the pull; review these messages before manufacturing. Changing a front into a cover/false front removes its pull settings. Detached boards keep their current manual geometry and are not edited through this workspace. A moved single-board duplicate keeps fixed geometry and drops automatic pull metadata; review its manual hardware quantities separately. Saved structural opening layouts do not include per-board pull settings.

The normal hardware BOM and CSV count one knob/pull per emitted fixing pattern, including two-hole bars as one item. Generic identities distinguish bar pitch and drilling diameter, or knob drilling diameter; orientation and placement do not change the identity. Set supplier, part number and price in the usual hardware library. No supplier or price is invented. Drawings, nesting and solid exports consume the generated hole arrays through their existing manufacturing paths.
