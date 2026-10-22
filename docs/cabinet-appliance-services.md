# Appliance bays and service openings

Select a cabinet and open **Appliance Bays** or **Service Openings**. Both workspaces stage changes, preview against the current scene and apply through one undo step. Save the project normally afterward. Leaving a workspace discards its draft.

## Appliance bays

Choose a physical opening, name/category and the appliance’s body width, height and depth. Enter the left/right/top/bottom/rear installation clearances from the appliance specification. Horizontal position uses left/centre/right reference and an offset. Mounting elevation starts at the bottom of the physical opening’s reserved space. Front recess is positive into the cabinet; negative values project the body forward. Clearances and elevation cannot be negative; body sizes must be positive and all dimensions finite.

The reserved envelope includes all five clearances. Body height begins above bottom clearance; horizontal body position includes left clearance. The opening intersects the structural section with face-frame access openings, including independent frame zones and pair stiles. Usable rear depth follows the cabinet’s captured/applied/no-back rules; inset fronts reduce usable front depth. Required/available width, height and depth and Front/Top/End stock/body/clearance views are shown together.

Preview reports width/height/depth problems, actual stock-envelope interference (shelves, divisions, drawers, fronts, backs and finishing boards), and overlap with other bays in this cabinet. Touching faces are allowed. Rotated boards use conservative bounds, and holes are not subtracted from fit envelopes. These checks describe planning space, not an appliance installation certification. A structurally valid bay can be saved with **Needs fit review** issues so construction can be changed afterward; saving never moves or deletes panels and never adds appliance bodies to the BOM, nest or STEP stock.

Saved bays retain their IDs when edited. **New appliance bay** starts a separate bay. Choose a saved source and **Copy appliance specifications** to reuse its dimensions and position settings in the current target opening; incompatible opening dimensions block copying. Remove stages an explicit removal preview. Removal does not silently remove associated service machining; reassign or clear those associations afterward.

Bays follow opening and cabinet dimension/material changes by resolving their saved references again. Lost cabinets, structural leaves or frame zones remain visible as broken references rather than moving a bay into a different opening. Restore the source or choose a new opening in the bay editor. Maximum: 500 saved bays per project.

## Service openings

Choose a cabinet panel. Shared run boards are identified; editing one affects that shared board. Add a circular cable/pipe hole or rectangular service cut-out/slot. Choose +Z or −Z broad face, through mode or a blind recess depth that leaves material below it. Rectangular slots have square corners. X is board length and Y is board width, regardless of where the panel sits in the cabinet. Position references measure from board length/width starts, centres or ends to the feature centre. Edge-reference offsets are nonnegative; centre offsets may be signed.

Repeat a feature along positive board X or Y with count and centre-to-centre pitch. Use 1–32 repeats per feature and at most 100 resolved openings per panel. Set minimum clearance to panel edges and minimum material between cuts. Minimum web checks include other service features and existing component, joint, worktop and manual machining. Circles and existing bores use conservative rectangular cut envelopes, including their real depth and entry face; a reported clash may therefore require closer assessment. Mitred panels and unsupported or excessive existing drilling are rejected for new service machining. Clearing all service features remains available for repair.

An optional appliance-bay association records which bay the service opening serves. The bay must exist, resolve an opening and belong to this panel’s cabinet or shared run. Association is a reference, not automatic service routing or movement with the appliance body; panel edge/centre references control cut positions. A bay with planning fit issues can still be associated; those issues remain visible in the bay editor.

**Stage service feature** adds or updates the draft. Edit loads a staged feature; Duplicate prepares a separately named/identified copy that must be staged explicitly and repositioned if it overlaps. Remove and Clear affect only this draft until Preview and Apply. The preview lists actual resolved centres, sizes, faces and depths, shows the panel machining diagram (white through openings, amber blind recesses) and complete cabinet projections. **Apply service openings** writes real box cuts or bores that ordinary drawings, geometry, cutting/manufacturing schedules and exports consume. Existing unrelated cuts, joints, board identity, materials and edge decisions are retained.

Accepted recipes follow panel dimensions on regeneration. Service machining runs after joints so it checks actual final component/joint cuts. Normal part updates on service panels also rebuild their recipes. A source/bay reference, dimension or machining conflict retains the last valid service cuts and reports the cause in Service Openings. Source changes can leave those retained cuts unsuitable for the new stock: resolve diagnostics before manufacturing/export. Restoring valid inputs rebuilds the cuts. Normal cut editing/removal/pairing controls cannot edit recipe-owned cuts; use this workspace. Duplicating a board retains fixed copies of its cuts and releases live service ownership.

## Drafts and files

Field, feature and panel changes invalidate the previous preview. Reset/Cancel reload the current source without writing. External scene changes require reset or explicit source reload. Stale, unchanged or invalid machining proposals cannot apply; acceptance recomputes instead of trusting cached preview geometry. Appliance fit issues remain visible planning diagnostics and are distinct from malformed/missing-reference errors.

Project format **36** adds optional appliance-bay and service recipes. Old files without recipes retain their existing behavior. Broken saved references remain repairable on reopen. Older builds cannot maintain these new links. These tools do not assess supplier installation requirements, airflow performance, utility routing, structural strength, attachment hardware or tooling access.

## Task checklist

1. Appliance Bays workspace.
2. Resolved physical-opening selection.
3. Named bays.
4. Appliance categories.
5. Body width.
6. Body height.
7. Body depth.
8. Left clearance.
9. Right clearance.
10. Top clearance.
11. Bottom clearance.
12. Rear clearance.
13. Horizontal reference and offset.
14. Mounting elevation.
15. Front recess/projection.
16. Body and installation-envelope preview.
17. Available/required dimensions.
18. Shelf and division interference.
19. Drawer-box interference.
20. Back/front interference.
21. Front/Top/End fit views.
22. Linked opening/cabinet updates.
23. Compatible specification copying.
24. Editing/removal and undo/redo.
25. Project save/reopen.
26. Service Openings workspace.
27. Panel selection.
28. Named service features.
29. Circular cable/pipe holes.
30. Rectangular service cut-outs.
31. Hole diameter.
32. Rectangle dimensions.
33. Edge/centre position references.
34. Broad-face entry selection.
35. Through openings.
36. Blind recesses.
37. Repeated ventilation slots.
38. Count and pitch.
39. Edge clearance.
40. Minimum web between openings.
41. Service-feature clash checks.
42. Existing machining clash checks.
43. Appliance-bay association.
44. Actual machining geometry preview.
45. Panel-resize references.
46. Broken-reference/placement diagnostics and recovery.
47. Existing drawing/machining/export integration.
48. Feature edit/duplicate/remove.
49. Atomic machining apply and undo.
50. Model/file/ownership/history/UI/browser regression coverage and this guide.
