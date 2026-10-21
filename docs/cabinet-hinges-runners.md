# Hinges and drawer runners

Open **Hardware → Hinges & Runners**. Handles & Pulls remains the default Hardware workspace. Door leaves and drawer openings have separate selections, so you can stage changes to both and apply them together.

For frameless doors, select individual leaves or **Select all door leaves**. Use **Load hinge settings** to edit a saved layout. Automatic count follows the existing door-height table. Manual count accepts 2–8 hinges. Automatic inset keeps the adaptive 100 mm model; manual end inset places the first and last cup symmetrically and spaces the rest evenly. **Stage hinge layout** records the local draft; **Restore default hinges** stages removal of the custom recipe.

Cups retain the existing 35 mm diameter, depth/application and lateral edge distance. The preview lists count, first position and pitch in door-board X, which runs the door height. Mounting plates follow these positions through cabinet space. Cup outlines and spacing must fit, with the existing minimum material behind each cup. Saved pull drilling is checked against the proposed cups. Other machining intersections and screw-length choices are not assessed.

Face-frame hinge applications remain on their existing modeled layout and explain why custom positioning is read-only. Converting a cabinet to face-frame construction or changing a door to a non-door front drops its custom hinge recipe. Detached fronts are locked in this workspace; duplicating a custom-layout front makes fixed geometry without the recipe.

For drawers, select openings and stage side-mount or undermount runners, automatic/custom box height, side-mount screw-line offset, box material and automatic/explicit nominal length. Explicit lengths come from the supported generic catalogue and must fit usable depth. They shorten the box, bound its cabinet fixing row to the chosen span and change the quoted runner together. Leaving the nominal automatic preserves the existing longest-fitting selection and fixing grid. Side-mount offset is unavailable for undermount drawers. Box material follows the existing thickness/clearance model.

**Preview hinges and runners** shows actual cups/plates/box geometry in complete Front, Top and End projections, box-side dimensions and hardware quantity changes. **Apply hinges and runners** creates one undo step. **Reset hardware draft** and **Cancel hardware changes** discard staged edits. Changes elsewhere in the scene require resetting/reloading before applying.

Settings save in version33 project files and follow later regeneration. Invalid custom hinge layouts retain their settings but omit cups and matching plates until repaired; invalid drawer/nominal fits generate neither a box nor runner drilling/quote. Drawings, machining schedules, cutting lists and hardware pricing consume the emitted geometry and quantities. These generic controls add no load rating, opening angle or supplier compatibility certification.
