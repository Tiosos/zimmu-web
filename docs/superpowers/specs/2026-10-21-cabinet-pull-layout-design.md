# Cabinet handle/pull layout

Add a Hardware tab for dimensioned generic knob/pull fixing holes on existing generated door and drawer-front boards. No solid hardware meshes or vendor compatibility claims. Hinges and runners retain their existing models. User dimensions are authoritative; defaults are editable examples.

## 25 tasks

1. Hardware workspace.
2. Eligible door-front list.
3. Eligible drawer-front list.
4. Individual paired-door leaves.
5. Multi-front selection.
6. Select all.
7. Select doors.
8. Select drawer fronts.
9. Select configured pulls.
10. Single-hole knobs.
11. Two-hole bar pulls.
12. Horizontal bars.
13. Vertical bars.
14. Custom fixing pitch.
15. Custom bore diameter.
16. Horizontal placement references.
17. Vertical placement references.
18. Position offsets.
19. Mirrored free-edge placement.
20. Edge and modeled hinge-cup checks.
21. Three-view drilling preview.
22. Staged removal/reset/cancel.
23. One-step apply, persistence and resize following.
24. Dimension-specific hardware quantities and pricing.
25. Drawing/manufacturing exports.

## Data and geometry

Optional BoardPart.frontPull stores version 1, kind knob/bar, bar orientation, fixing pitch, bore diameter, horizontal reference auto/left/right/centre, vertical reference top/bottom/centre and two offsets in mm. Default bar: vertical, 96 mm pitch, 5 mm diameter, auto horizontal reference with 50 mm inset, 100 mm below top. Knob ignores orientation/pitch for machining and identity. Auto uses free edge for doors, mirrored per hinge leaf, and centre for drawer fronts (offset still applies). Centre offsets are signed; edge offsets must be non-negative. Physical hole circles must lie fully within the front and not overlap emitted hinge-cup circles. Other machining and hardware-body clashes remain a review responsibility.

The existing carcase regeneration pass owns new pull cuts; read settings from the stable front board ID/role, derive against its new dimensions and actual hinge side. Only doors and drawer fronts qualify. Removing/changing a front to panel/false-front drops settings. Invalid geometry on later resizing omits the pull cuts and reports diagnostics in Hardware, while retaining settings for repair; never leave stale out-of-board holes. Detached boards retain their existing machining and settings as manual geometry, and are locked in Hardware. The front-pull BOM follows actual matching emitted holes, so invalid or removed drilling is not quoted. Moved single-board duplicates lose automatic pull metadata (existing copied machining is manual). Cabinet/group copies use board metadata with no foreign IDs. Saved opening-layout library entries remain structural and do not carry per-board pull choices.

A through HoleArrayCut starts on board +Z at thickness, with depth equal to thickness. Board X follows front height and Y follows width; U is vertical and V horizontal. One knob hole or two bar holes, stable cut ID pull_<front-role>, tagged sourceComponentId. Preserve unrelated manual/component/joint machining. No arbitrary hole count, blind handle drilling or screw-length selection.

## Transactions and persistence

Drafts map selected physical front IDs to settings/removal. Selection is independent of staged changes. Preview rebuilds through the real pipeline, reports invalid/locked/no-longer-existing fronts and no-ops, shows Front/Top/End, hole centres, and hardware deltas. Acceptance checks geometry/ownership/settings signature and rebuilds current scene instead of trusting supplied geometry. One scene-history transition. Reset/cancel only discard local drafts. Geometry edits invalidate previews; mesh or price updates do not. Finishing and Fronts previews must also invalidate when pull metadata changes.

Project format becomes 30. Validate metadata at both file boundaries. Missing metadata on old boards stays absent. Dynamic generic hardware keys distinguish knobs by bore diameter and bars by pitch plus bore diameter; names and quantities flow through the normal hardware BOM, library pricing and CSV. No supplier or unit price is invented.

Notes: ../notes/2026-10-21-cabinet-pull-layout-notes.md
