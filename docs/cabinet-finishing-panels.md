# Cabinet finishing panels

Open a cabinet's **Finishing** tab and choose Worktop, Left/Right end panel, Left/Right filler, Front plinth or Rear splashback. **Fit to cabinet defaults** resets the draft to the selected panel type's starting dimensions. Changing panel type also resets the draft.

Choose an existing panel material and use its stock thickness, or choose Custom thickness explicitly. Name the board and select length, width or free grain in the board's own axes. The summary shows a custom thickness that differs from stock. Edge-band and non-panel materials are excluded.

Worktops have independent left/right/front/rear overhangs and a vertical gap above the cabinet. End panels sit outside the cabinet's occupied left/right envelope and cover its occupied depth. Fillers have a custom width and sit flush with the occupied front, with their thickness extending behind it. Set height and bottom clearance for vertical panels. Front plinths span the cabinet width with a custom setback; setback plus thickness must fit within occupied depth. Rear splashbacks sit immediately behind the occupied rear, starting above the cabinet top with a configurable clearance.

**Preview finishing board** displays Front/Top/End projections with the new board highlighted, its local extents, length × width × thickness, material, grain and area. Check these values before **Add finishing board**, which creates one real board and one undo step. Reset and Cancel never modify the project.

Created boards are ordinary, editable, non-driven parts attached to the cabinet. They move and rotate with it, appear in the normal part tools, cutting lists, nesting and exports, and are saved with the project. Their dimensions remain fixed when the cabinet is resized. Use the normal part editor to change/delete them; adding another panel creates another board and does not replace an existing one.

Fit defaults use material-slot occupied bounds, including fronts, frames and applied backs. Per-board overrides do not change that envelope. Finishing panels do not change placement envelopes or add joints, machining, collision or clearance assessments. Preview against the actual cabinet and review fit before manufacture. Geometry, part or material changes require a draft reset; mesh updates do not. Drafts are discarded when leaving the tab.
