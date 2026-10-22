# Room installation and wall-fitted fillers

Open **File → Project structure… → Room installation**. Choose the room and reference wall, select and order cabinets, then preview before applying. Configure start/end/centre alignment, wall side, spacing, reserves, rear clearance and base/top elevation. Existing anchors require explicit detachment; legacy Room geometry wall placements must be detached there first. Apply is one scene undo step. Room geometry edits retain their separate project undo history.

Switch to **Wall-fitted fillers** to choose a cabinet and side wall. Width follows the measured gap minus installation clearance. Set width limits, front setback, height, thickness, material, grain and board-local edge treatments. Preview shows the actual board dimensions; saved fillers can be edited, detached into ordinary boards or deleted. Compatible service machining is retained. Fillers participate in the existing manufacturing outputs.

Saved links follow cabinet sizes and room-wall changes. Broken references retain their last valid geometry and show diagnostics. Reset/cancel discards staged settings. Changes to either the scene or project invalidate an existing preview; preview again before applying. Format 38 stores the recipes and supports older files through the existing loader.

This release supports upright cabinets in a common upright container and straight wall segments. Fillers are rectangular and require a side-parallel wall spanning the board depth. Angled scribing, curved walls and installation hardware are outside this batch. Clash findings use conservative board bounds, without subtracting machining, and remain advisory. Floor/ceiling settings are explicit installation checks; leaving the ceiling blank skips its check.

The 50 implemented tasks:

1. Add a Room Installation workspace.
2. Select the target room.
3. Select a reference wall.
4. Select cabinets for installation.
5. Select an existing cabinet run.
6. Validate room and container membership.
7. Display wall dimensions and cabinet positions.
8. Preview cabinet alignment against the wall.
9. Choose direction along the wall.
10. Set the run starting offset.
11. Set rear installation clearance.
12. Set cabinet base elevation.
13. Align tops to a chosen datum.
14. Configure spacing between cabinets.
15. Reserve clearances at both run ends.
16. Position from the wall start.
17. Position from the wall end.
18. Centre within the available span.
19. Handle existing anchors explicitly.
20. Preview base and wall cabinet rows together.
21. Show room doors and windows.
22. Integrate obstacle and clearance checks.
23. Include finishing boards in interference checks.
24. Show dimensioned plans and elevations.
25. Apply installation in one undo step.
26. Select a wall-to-cabinet filler gap.
27. Support left and right fillers.
28. Calculate width from the actual gap.
29. Configure minimum and maximum widths.
30. Reserve wall installation clearance.
31. Configure front alignment and setback.
32. Choose stock or custom thickness.
33. Choose cabinet-following or custom height.
34. Configure bottom clearance.
35. Configure top clearance.
36. Assign filler material.
37. Configure grain.
38. Configure edge treatments.
39. Detect duplicate fillers in the same gap.
40. Explain unsupported angled walls.
41. Preview filler dimensions.
42. Detect clashes with nearby boards.
43. Preserve compatible service machining.
44. Include boards in manufacturing outputs.
45. Link dimensions to cabinet and wall changes.
46. Retain last geometry with broken-source diagnostics.
47. Edit detach or remove fillers.
48. Reject stale previews and support undo/redo.
49. Save and reload settings.
50. Test workflows and document limits.
