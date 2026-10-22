# Cabinet materials and edgebanding

Select a cabinet and open **Materials** or **Edgebanding**. Both workspaces stage changes without writing to the project until Preview and Apply. Leaving the tab discards its draft. Save the project normally after applying.

## Materials

Search board names and filter current material, role and opening. **Select matching boards** selects the editable boards visible through those filters; it replaces the previous selection. Individual checkboxes and Clear selection are also available. The list shows actual dimensions, stock thickness, grain, inheritance and independent thickness ownership. Detached role boards and boards belonging to detached drawers/frames are locked. Shared run panels are identified and edits affect the one board shared by all its cabinets.

Choose a project panel material and **Stage material**, or restore inherited material on driven boards. Existing independent thickness overrides remain in effect. Materials with no finite positive panel thickness and edge stock cannot be assigned. Manual boards adopt stock thickness; linked finishing/run boards keep their stock/custom thickness recipe mode. Manual and linked panels have no inherited material or grain to restore.

Choose length, width or no direction and **Stage grain**. Restore inherited grain returns a driven board to its generator convention. Copy treatments copies the source's proposed material and grain, including staged settings, into the selection; it does not copy dimensions or identities. Select the Drawer boxes role or any box member to assign box material: the material change expands to all five boards through the drawer's own parameters, because a common wall thickness owns the box joinery. Incomplete/detached boxes cannot receive that change. The bottom retains its existing drawer bottom-thickness parameter; compare actual board thickness against the chosen stock. Grain can still be assigned per board. Restoring drawer material uses its conventional default.

Individual face-frame board replacements must keep the current thickness. Use Construction to change frame stock thickness coherently with the openings and hinge application.

Preview regenerates the cabinet, checks opening/drawer fit, frameless hinge fit, retained face-frame hinge cup machining, shelf generation and retained board identities, and validates linked recipes. A declined linked rebuild blocks Apply rather than silently accepting frozen geometry. The comparison lists before/after material, dimensions, grain, effective edges and cut sizes for the cabinet boards and shared run panels; hardware and tape totals are also shown. Boards restored by regeneration are included in the proposed quantity and marked **Not generated** in the before column. **Apply materials** creates one undo step.

## Edgebanding

Select boards using the same controls. The four board-local edges are x0/x1 (length start/end, running along width) and y0/y1 (width start/end, running along length). Labels also identify the corresponding cabinet direction using the resolved cabinet and board transforms. The selected board diagram highlights the selected edges; its rectangle is schematic rather than dimensioned.

Choose existing project edge stock with finite positive thickness. **Stage selected edges** uses the checked local edge keys on every selected board. **Stage cabinet-front edges** finds each board's edge facing the cabinet front. **Stage matching cabinet edges** supports front/rear/left/right/top/bottom. **Stage perimeter edges** treats all four edges, useful for doors, drawer fronts, worktops and finishing panels. Filter Cabinet sides or shelves for front-edge treatment. If any selected board has no edge facing the chosen direction, staging is rejected as a whole; refine the selection.

**Preserve explicit edge decisions** is on by default. It protects saved string assignments and explicit bare decisions, including when copying. Uncheck it deliberately to replace them. Your own draft can be restaged. **Stage bare edges** records an explicit no-band decision; **Restore inherited edges** removes the explicit assignment so a driven board follows its cabinet rule. A manual board without an assignment is bare. Edge copying uses the source's effective proposed treatments and requires matching board dimensions and cabinet-facing orientation; it cannot silently swap edge keys across unlike boards.

Preview shows individual treated edge lengths, total tape length by stock, and finished versus reduced cut sizes through the same `edgesOf` and `cutSizeOf` functions used by manufacturing outputs. Missing inherited/explicit stock, nonpositive thickness, mitred boards and nonpositive cut sizes block treatment. Band thickness is subtracted from the corresponding board dimension; finished board thickness is retained. Existing material records have no tape width or adhesive metadata, so suitability for the board thickness and substrate remains unassessed. Lengths exclude waste, joints and allowances.

**Apply edgebanding** creates one undo step. Accepted decisions feed ordinary drawings, cutting lists and manufacturing data; there is no separate export-only treatment model.

## Drafts and persistence

Every stage/copy action invalidates the previous preview. Discard removes one board's staged patch; expanded drawer material changes must still form a complete box at preview. Reset or Cancel discards the complete draft without modifying the model. External scene changes require reset. Unchanged and stale proposals cannot apply, and acceptance rebuilds the proposal instead of trusting cached geometry. Worker meshes live outside the scene and do not invalidate drafts.

Project format **35** saves optional grain ownership alongside existing material overrides and explicit edge decisions. Legacy projects without grain ownership retain their generator convention. Older builds do not maintain the new grain overrides. Linked panel material and grain changes stay in their recipes and remain linked after regeneration/save/reopen.

## Delivered task checklist

1. Materials cabinet workspace.
2. Generated boards grouped/filterable by role.
3. Opening grouping/filtering.
4. Multiple board selection.
5. Select all boards matching a role.
6. Current-material filter.
7. Board-name search.
8. Inheritance and override display.
9. Bulk material assignment.
10. Restore inherited material.
11. Fixed-shelf material assignment.
12. Adjustable-shelf material assignment.
13. Door material assignment through front selection.
14. Drawer-front material assignment through front selection.
15. Whole drawer-box material assignment.
16. Manual and linked finishing-panel material assignment.
17. Length grain override.
18. Width grain override.
19. No-direction grain override.
20. Copy proposed material and grain.
21. Stock and actual thickness display.
22. Generated dimension and quantity comparison.
23. Opening/drawer/hinge checks after thickness changes.
24. Detached ownership and stale-proposal protection.
25. Atomic material apply with undo/redo.
26. Edgebanding cabinet workspace.
27. Four board-local edges.
28. Cabinet-direction edge labels.
29. Selected-edge diagram.
30. Matching local/cabinet-direction edge treatment.
31. Existing edge-stock assignment.
32. Explicit bare-edge decisions.
33. Restore inherited edges.
34. Shelf front-edge preset.
35. Door perimeter preset.
36. Drawer-front perimeter preset.
37. Cabinet-side front/exposed-direction treatment.
38. Worktop edge treatment.
39. Finishing-panel edge treatment.
40. Compatible effective-edge copying.
41. Saved explicit-decision protection.
42. Missing-stock diagnostics.
43. Positive stock and cut-size compatibility checks; tape width/substrate suitability remains unassessed because existing stock records lack these fields.
44. Individual treated-edge lengths.
45. Totals by edge stock.
46. Before/after edge and cut-size comparison.
47. Existing manufacturing-output integration.
48. Regeneration and save/reopen preservation.
49. Atomic edge apply with undo/redo.
50. Model, file, UI, history and browser coverage plus this guide.
