# Worktop cut-outs and machining

Open a cabinet's **Finishing → Worktop machining** workspace. Select a linked worktop or fixed manual board belonging to that cabinet or its shared container. Fixed boards are selected explicitly; their name and orientation are not inferred. Create a worktop in either of the other Finishing modes first if the list is empty.

Add a rectangular or circular feature, or use the editable **sink** and **hob** starters. Set its name, shape and dimensions. **Through** follows the current board thickness. **Blind** requires a depth that leaves material below the pocket or bore. Dimensions and depths must exceed 0.1 mm. These are square-corner rectangular pockets/openings or round bores; appliance-specific corner radii are not modeled. Check appliance specifications before manufacture.

Positions refer to the feature's centre in the board's own axes: X is board length, Y is board width, front is Y0, rear is Y1, and machining enters from +Z. Choose left/centre/right and front/centre/rear references. Edge offsets measure from the named edge to the centre and must be nonnegative; centre offsets may be signed. Minimum edge clearance measures from the feature outline to the board boundary.

Saved features appear in the staged list. Select one to edit it. **Duplicate feature** keeps its dimensions and initial position, so move the copy before applying to resolve overlap. **Remove feature** stages removal; **Reset machining draft** and **Cancel machining changes** reload the saved settings without changing the scene. Up to 100 features are supported per board.

**Preview worktop machining** shows resolved centres, dimensions and depths, diagnostics, and complete Front/Top/End projections. **Apply worktop machining** records one undo step and preserves board and feature IDs. Existing unrelated cuts, edge choices and manual operations are retained. Collision checks cover these saved features only, not unrelated machining, appliance bodies or cabinet supports. Touching feature boundaries are allowed; positive-area overlap is rejected. The operations must leave some board material.

Settings save with version 32 project files and revalidate after board resizing or linked-worktop regeneration. Invalid features retain their settings but omit their generated cuts until repaired. Reopen this workspace to adjust references/dimensions or remove them. Editing dimensions with normal board tools keeps machining settings; it may independently detach a finishing/worktop geometry link.

Generated feature cuts are read-only in normal part tools; edit or remove them here. Duplicating a board makes fixed copies of its current cuts without the saved machining recipe. Normal board drawings, cutting/manufacturing schedules, nesting and geometry exports consume these real box cuts and bores. No supplier certification or structural clearance assessment is implied.
