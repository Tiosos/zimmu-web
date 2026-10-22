# Sheet stock and offcut optimisation

Implementation checklist:

1. Stock Optimisation workspace.
2. Cabinet selection.
3. Room filtering.
4. Required panels by material.
5. Multiple sheet sizes per material.
6. Stock option names.
7. Sheet dimensions.
8. Stock thickness validation.
9. Sheet grain direction.
10. Available sheet quantities.
11. Unlimited purchased stock.
12. Prices per sheet.
13. Enable/disable stock.
14. Sheet edge trimming.
15. Usable boundary previews.
16. Reusable offcut library.
17. Stable offcut IDs.
18. Offcut dimensions.
19. Offcut material/thickness.
20. Offcut grain direction.
21. Offcut quantities.
22. Storage locations.
23. Edit/remove offcuts.
24. Offcut compatibility checks.
25. Offcut priority control.
26. Mixed-size nesting.
27. Quantity-aware allocation.
28. Panel grain preservation.
29. Atomic matched-front groups.
30. Tool clearance and trim.
31. Cannot-fit diagnostics.
32. Insufficient quantity diagnostics.
33. Fewer-sheets strategy.
34. Lower-cost strategy.
35. Offcut-first strategy.
36. Strategy/baseline comparison.
37. Purchased sheet counts.
38. Offcut consumption.
39. Purchase-cost estimates.
40. Utilisation and waste.
41. Stock-labelled layout previews.
42. Rectangular reusable remnants.
43. Minimum remnant dimensions.
44. Remnant preview before saving.
45. Explicit stock consumption/remnant creation.
46. Undo/redo stock changes.
47. Stale-result rejection.
48. Save/reload inventory and settings.
49. Allocation/layout/purchase-list exports.
50. Regression, browser and documentation coverage.

## Use

Open **File → Stock Optimisation…**. The inventory belongs to the current project; it does not reserve stock in other files or update a shared warehouse. Existing library sheet definitions seed the initial options. Choose all boards or selected cabinets; room filtering narrows the cabinet list without discarding an existing selection. The demand summary counts actual manufacturing panels by material.

Add sheet stock or reusable offcuts. Expand an option to edit its name, dimensions in millimetres, actual thickness, material, grain direction, quantity, price, edge trim, location and enabled state. A blank sheet quantity means unlimited purchased stock. Offcuts require finite whole quantities. Blank prices mean unknown; unknown purchase costs are reported separately rather than counted as free. Offcuts have zero **new purchase cost**, regardless of their historical value.

Choose a strategy and preview. **Fewer sheets** prefers the candidate sheet that packs the most remaining demand area. **Lower purchase cost** prefers the lowest known immediate cost per packed area. **Offcuts first** prefers eligible offcuts before purchased sheets. Each strategy fills open stock once and uses deterministic rectangular free-space partitioning. These are heuristics, not global optima; compare sheet counts, unplaced parts and price coverage before choosing. The single-size baseline uses current material-library stock definitions with the same conservative solver. An incomplete baseline is reported separately and does not block valid custom stock.

## Layouts and remnants

The planner reserves each panel's complete cut rectangle, after canonical edgebanding deductions. Shaped parts reserve their enclosing rectangle; holes and notches are not reused. Panel grain follows the selected stock grain axis. Matched fronts reserve their complete common blank and rotate together, retaining real part identities and sequence labels. Partial, broken or incompatible groups stay unplaced.

Tool clearance is isotropic, rounded up to an even millimetre separation; edge trim reduces usable boundaries. Coordinates use sheet-local X right and Y up. Green dashed outlines show usable stock, green shaded rectangles show proposed remnants, and purple outlines show matched blanks. Remnants are disjoint free rectangles outside reserved panel/blank footprints, clearance and trim. Minimum remnant length/width follow the displayed sheet axes. These layouts do not certify saw sequences, grain appearance, material condition or CNC feasibility.

**Save stock settings** persists the inventory and job settings without consuming anything. **Consume stock and save selected remnants** requires a fully placed job, decrements finite quantities and adds only checked remnants as finite offcut stock. Unlimited purchased stock stays unlimited. The entire change has one undo/redo step. Consuming is a project inventory update: it does not mark boards as manufactured. Re-previewing the same design creates another potential job, so consume only when intentionally allocating stock.

Scene, project or effective-material changes invalidate an open draft and hide its layouts and exports. Reload stock settings to continue. File format 41 preserves inventory and job settings; older projects continue to open.

## Exports

Download individual sheet SVGs or the allocation/purchase CSV. SVGs include stock identity, material and thickness, usable boundaries, matched groups and proposed remnants. CSV rows include panel coordinates/rotation, stock counts, remaining quantities, known or unknown cost, material/thickness/grain/location, group identities/sequences, proposed remnants and unplaced reasons. Exports never consume stock. Remnants listed in exports are proposals until explicitly selected and applied.

## Verification

Typecheck, lint, CAD build and catalogue build pass. The local suite passes 4,305 tests with 10 existing skips. Thirty-five guard mutations fail on the intended assertions. Four new browser workflows are discoverable; execution and six catalogue HTTP tests await CI because this environment blocks local listeners.
