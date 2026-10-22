# Front grain matching and panel sequencing

Implementation checklist:

1. Front Grain Matching workspace.
2. Room filter.
3. Cabinet filter.
4. Individual door selection.
5. Individual drawer-front selection.
6. Multiple fronts across cabinets.
7. Dimensions/material/grain listing.
8. Detached/unsupported diagnostics.
9. Named groups.
10. Load/edit saved groups.
11. Add members.
12. Remove members.
13. Exclusive group membership.
14. Compatible materials.
15. Compatible thicknesses.
16. Parallel/same-facing validation.
17. Front-plane validation.
18. Geometry-derived arrangement.
19. Stacked drawer sequences.
20. Side-by-side door sequences.
21. Mixed arrangements.
22. Group grain direction.
23. Reference front.
24. Pattern origin.
25. Horizontal pattern offset.
26. Vertical pattern offset.
27. Schematic continuity preview.
28. Boundaries and reveals.
29. Dimensions and identities.
30. Preview before applying.
31. One-step apply.
32. Undo/redo.
33. Stale preview rejection.
34. Reset/cancel.
35. Linked geometry updates.
36. Broken-member diagnostics.
37. Detach preserving individual grain.
38. Save/reload groups.
39. Shared cutting blanks.
40. Blank margins.
41. Additional row/column cutting gaps.
42. Edgebanding deductions.
43. Panel sequence in blank.
44. Atomic group rotation/nesting.
45. Blank/stock validation.
46. Sheet-layout group outlines.
47. Unplaceable-group diagnostics.
48. Group/sequence labels.
49. Group-coordinate CSV export.
50. Geometry/nesting/persistence/history/UI/browser tests and documentation.

## Use the workspace

Open **File → Front Grain Matching…**. Filter by room or cabinet, select at least two generated door or drawer fronts, and name the group. Filters do not discard selected members. Fronts must be upright, rectangular, coplanar and face the same direction; they must share a panel material and its actual stock thickness.

Choose vertical or horizontal grain, a reference front, a pattern origin and signed offsets. **Preview grain matching** shows the installed arrangement and the common cutting blank with numbered panels. These are schematic continuity diagrams, not material textures or bookmatching. Apply saves the recipe in one undo step. Saved groups can be edited, repaired or detached. Detaching retains each front's current grain direction.

Cabinet geometry changes regenerate the linked arrangement. Missing or incompatible members produce repair diagnostics. A scene or project change invalidates an open draft: reset or reload a saved group before continuing. Save/open preserves groups in file format 40; older files remain supported.

## Cutting and sequencing

Source coordinates use X right and Y down. Numbering runs top to bottom, then left to right. A front's board-local X follows its height, so its rotation within the source blank is 270°. A whole-blank sheet rotation is added to that rotation; panels are never mirrored or flipped.

The margin reserves stock around the cut rectangles. Additional cutting gap is added at each distinct row/column origin, on top of installed reveals. Increasing it removes intervening grain when the pieces are assembled; the previews show that discontinuity. Edgebanding is deducted on the correct physical edges without changing finished front geometry. The reference origin is the reference front's **cut** top-left; offsets affect the schematic pattern phase, not machining coordinates.

Nesting reserves the entire blank as one rectangle, with tool clearance outside it and between its members. The result expands back to real part identities, with a group outline and sequence labels. Yield counts actual panels, excluding reserved gaps and margins. A group that is incomplete, inconsistent, too tightly spaced or too large for stock stays unplaced as a group; its members never fall back to independent nesting.

Stock/tool warnings do not prevent saving a valid design recipe, because stock can be changed later. They do prevent placing that group with the incompatible stock or tool settings. Sheet layouts use the effective material stock, including local stock overrides.

**Export saved sequence CSV** exports applied groups, including source coordinates, blank dimensions, panel rotation and any diagnostics. Production packets include `lists/grain-matching.csv` when matched fronts exist. The CSV and labels describe sequencing; they are not CNC programs or a verification of machining compatibility.

## Verification

Typecheck, lint, CAD build and catalogue build pass. The local unit suite passes 4,257 tests with 10 existing skips. Forty-three guard mutations produce the expected assertion failures. Four new browser workflows are discoverable; their execution and six catalogue HTTP tests await CI because the implementation environment blocks local listeners.
