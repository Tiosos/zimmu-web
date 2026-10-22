# Corner worktops and finishing returns

Open **Finishing → Corner assemblies** from a cabinet. Select cabinets for each leg, or use **Find corner runs** and choose a detected pair. Each leg can contain one or more straight, co-oriented cabinets in the same container. The two legs must be perpendicular and upright in that container; a transformed ancestor is supported. Board bottom/top planes must match, so choose compatible thickness and height settings.

Choose worktop, plinth or splashback, the through leg and joint clearance. Each leg has its own overhangs/extensions, offsets, material, stock/custom thickness, grain and four board-local edge decisions. Plinth height can follow toe kicks or use a custom height. Optional vertical end returns close each leg's outer endpoint toward the opposite cabinet-depth boundary. Their material, thickness, grain and edge settings follow that leg. The dimension table and coloured plan show separate stock boards and their joint; machining remains in each board's local axes.

Preview before applying. An entire assembly is one undo/redo action. Saved assemblies can be reloaded, edited, detached into fixed boards, or deleted together. Editing preserves slot identities, visibility, cuts and machining recipes; removing a machined return or changing a machined profile requires clearing its machining first. Ordinary dimensions/material/grain/edge edits are blocked while linked: use this workspace or detach first. Duplicates are fixed boards. Bulk Materials/Edgebanding lists mark corner boards as locked/shared; Service Openings and worktop machining still address the appropriate individual boards.

Cabinet changes regenerate complete, valid assemblies before machining. Missing cabinets, incompatible placement, malformed or incomplete groups retain their last geometry and show issues in the workspace. A manually deleted member is never silently recreated; detach or remove the remaining assembly to repair it. Draft changes never write to the scene; project changes require reset/reload. Format 37 stores the recipe on each board and continues to read older projects.

Limits: only rectangular boards and square butt joints are generated. No mitred joints, worktop connectors, routed joint profiles, curved corners, arbitrary angles, structural span certification or wall scribing. Joint resolution can shorten or extend the original leg boards: review the reported coverage/support changes, especially when choosing the other through leg. Gaps are intentional geometric allowances, not support approval. Interference uses conservative board/appliance envelopes and does not subtract cuts. Retained machining receives boundary/joint review warnings; feature checks do not certify connector clearance, installation or airflow. Tape thickness changes cutting sizes; physical tape width and substrate compatibility still need manual review. Local edge keys are interpreted in each generated board's axes, including vertical boards and returns. Drafts are discarded on leaving the workspace.

50-task checklist:

1. Detect perpendicular run pairs.
2. Select cabinets for each leg.
3. Validate shared containers.
4. Validate top heights.
5. Support left and right returns.
6. Name assemblies.
7. Set overhangs per leg.
8. Set end extensions.
9. Set rear offsets.
10. Choose the through leg.
11. Set joint clearance.
12. Generate two worktop boards.
13. Preserve board identities.
14. Preview dimensions.
15. Preview joint placement.
16. Detect board overlaps.
17. Detect corner gaps.
18. Detect existing-worktop conflicts.
19. Set materials per leg.
20. Set grain per leg.
21. Set exposed-edge treatments.
22. Preserve compatible cut-outs.
23. Flag machining near joints.
24. Follow cabinet edits.
25. Apply worktops in one undo step.
26. Select plinth runs.
27. Generate corner plinth boards.
28. Set plinth height and thickness.
29. Set setbacks per leg.
30. Choose plinth overlap direction.
31. Set plinth joint clearance.
32. Add plinth end returns.
33. Select splashback runs.
34. Generate corner splashbacks.
35. Set splashback height and thickness.
36. Set offsets per leg.
37. Choose splashback overlap direction.
38. Set splashback joint clearance.
39. Add splashback end returns.
40. Set finishing materials.
41. Set finishing grain.
42. Set finishing edge treatments.
43. Preview finishing assemblies.
44. Diagnose finishing overlaps and gaps.
45. Flag appliance and service interference.
46. Follow cabinet edits for finishing assemblies.
47. Edit detach and remove assemblies.
48. Apply finishing changes in one undo step.
49. Save and reload assemblies.
50. Test workflows and document limits.

Verification: typecheck, lint, CAD build, catalogue build and 38 targeted mutation checks passed locally. The full local run passed 4,087 tests; the catalogue HTTP setup could not bind a listener in this shell sandbox (EPERM), leaving its six tests unrun alongside ten existing skips. The 13 selected Chromium flows were discovered but require a local listener. GitHub CI provides the full HTTP and browser execution for publication; consult the PR checks for their result.
