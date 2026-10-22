# Open and shelved sloped-top cabinets

Implementation checklist:

1. Sloped-Top Cabinet workspace.
2. Existing cabinet selection.
3. Construction compatibility.
4. Enable/disable profile.
5. Width slopes.
6. Depth slopes.
7. First end height.
8. Opposite end height.
9. Calculated slope angle.
10. Angle-driven heights.
11. Fixed reference end.
12. Preserve body footprint.
13. Minimum clear height.
14. Angle limits.
15. Conflicting settings diagnostics.
16. Envelope preview.
17. Dimensioned elevation.
18. Plan slope direction.
19. Generated-panel 3D preview.
20. Inclined top generation.
21. True top stock length.
22. Top material/thickness.
23. Cap overhangs.
24. Side profiles/heights.
25. Side-to-top bevels.
26. Back profile.
27. Applied backs.
28. Recessed/captured-back compatibility.
29. Bottom construction.
30. Base/plinth compatibility.
31. Horizontal shelves.
32. Shelf headroom.
33. Shelf clash diagnostics.
34. Divider compatibility.
35. Top-reaching divider profiles.
36. Conservative usable openings.
37. Door/drawer diagnostics.
38. Hardware compatibility.
39. Manufacturing warnings before apply.
40. Atomic apply.
41. Undo/redo.
42. Stale rejection.
43. Reset/cancel.
44. Resize regeneration.
45. Supported overrides preserved.
46. Save/reload.
47. Panel and bevel schedule.
48. Conservative shaped-panel nesting.
49. Drawings and geometry exports.
50. Regression/browser/documentation coverage.

## Use the workspace

Open **File → Sloped-Top Cabinets…**, choose an upright cabinet, and enable the profile. This batch supports open, frameless cabinets with a top and no back or an applied back. Remove fronts, frame, incompatible hardware and dependent linked geometry before changing construction. Captured backs need separately designed groove geometry and are declined. The existing construction editor remains the place to change those settings; this workspace does not silently remove them.

Set roof heights at the two ends of the body footprint. Width runs left to right; depth runs front to back. Alternatively enter a signed angle and choose the endpoint to hold fixed. The allowed slope is at most 60°. Set cap overhangs and minimum usable clear height, then preview. The diagrams show the roof, direction in plan and generated panel profiles in isometric projection; drilling and toe-kick notches are omitted from that diagram. Applied model geometry and CAD exports include the actual component cuts.

Apply is one undo step. Reload or cancel discards staged edits. A changed scene/project invalidates the preview and hides its diagrams and exports. Disable removes the profile while retaining the current maximum cabinet height. File format 42 preserves profiles and opposite-long-edge bevels; older projects remain supported.

## Geometry and interior space

The maximum body roof height uses the normal cabinet height parameter. The saved drop remains fixed when resizing: a height change translates both endpoints, while a width/depth change alters the angle. Preview validates the resulting clearance. Cap overhangs extend the same roof plane and may rise above the stated high endpoint; occupied bounds include those extensions. Overhangs that extend into the floor are rejected.

The top uses true inclined stock length plus the allowance needed for its two plumb end bevels. Side and applied-back tops follow the roof underside, spending the top's actual normal thickness. Applied backs end at that underside and remain behind the body, as their back mode requests. Material and thickness overrides feed the same solve. Explicit side grain is remapped when its board axes change so its physical direction is retained; generated shelf-pin rows and toe-kick notches follow the same frame conversion.

Openings remain rectangular below the lowest roof underside. Fixed and adjustable shelves stay horizontal; the workspace reports their minimum roof headroom. This is conservative usable space: it does not divide the high triangular region into polygonal openings. Vertical partitions reaching the rectangular ceiling extend to the roof; lower partitions keep their section boundaries.

## Manufacturing limits and outputs

Automatic cabinet joints, including base joints, are omitted for sloped cabinets. The geometry and clearances do not design workshop fixing or certify load capacity. Base/plinth panel geometry and bottom positions are retained. User-owned joints, detached roles, manual panel machining, catalogue construction pins and dependent hardware/installation/finishing recipes require resolution before applying a profile. New flat finishing and run-panel previews reject sloped cabinets and direct the designer to independent reviewed boards.

The existing edge policy does not calculate banding quantities for mitred panels. Supported shelf/bottom overrides remain effective; shaped-edge decisions need workshop review. The panel schedule lists cut bounds, actual material/thickness, profile versus bevel angles and which transverse edge carries the long point. CSV and production packets include that schedule. Part drawings and geometry exports use the same flipped bevel planes. Sloped generated panels reserve conservative rectangular bounds in the raster nester and mixed-stock planner, retaining their physical manufacturing identities.

## Verification

Typecheck, lint, CAD build and catalogue build pass. The local unit suite passes 4,347 tests with 10 existing skips. Forty-four intentional guard mutations fail on the intended assertions, with source restored exactly. Four new browser workflows are discoverable; execution and six catalogue HTTP tests await CI because local listeners are blocked in the implementation environment.
