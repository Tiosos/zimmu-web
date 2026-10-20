# Run-spanning cabinet worktops

Add Run worktops mode inside Finishing, keeping Single-cabinet panels as the default. Build one rectangular board over at least two selected cabinets. The preceding pull-layout batch remains on the branch ancestry; main is 6a1e59c.

## 25 tasks

1. Run worktops mode under Finishing.
2. Select sibling cabinets.
3. Select anchored run.
4. Clear/reset selection.
5. Shared frame validation.
6. Matching orientations.
7. Aligned occupied front line.
8. Aligned cabinet tops.
9. Cabinet overlap detection.
10. Allowed cabinet gap.
11. Full run width.
12. Maximum occupied depth.
13. Left overhang.
14. Right overhang.
15. Front overhang.
16. Rear overhang.
17. Vertical gap.
18. Material and stock/custom thickness.
19. Name and grain.
20. Complete preview, dimensions and area.
21. One-board creation and undo.
22. Stable-ID editing.
23. Saved links and resize/move following.
24. Detach/delete/repair diagnostics.
25. Manufacturing and drawing exports.

## Geometry

All selected carcases must exist, have the same immediate parent, matching rotation bases, aligned occupied front edges and aligned top planes. Derive each occupied material-slot envelope (fronts/frames/applied backs included, per-board overrides excluded) in the first selected cabinet's frame through rigid transforms. Sort along its X axis. Reject overlap and gaps larger than an explicit non-negative allowance (default zero); this is a geometry limit, not a structural rating. Different depths and heights are supported when fronts and tops align. Worktop X spans all cabinets plus left/right overhangs; Y covers the shallowest front/deepest rear plus front/rear overhangs. Underside is the shared top plus vertical gap. All geometry, area, hierarchy and world corners must be finite and dimensions representable and positive. Validate source carcase geometry using the existing opening validator.

Board length follows run X and width follows depth, grain is stated in those board axes. Material uses existing positive-thickness panel stock or explicit positive custom thickness. Parent is the cabinets' common container, with local pose derived from the reference cabinet; never parent to a source cabinet. Preview complete external Front/Top/End views, not the normal Top/End sections that hide a worktop. Existing cabinet/drawing views keep section behavior by default.

## Data/lifecycle

Optional BoardPart.runWorktop stores version 1 and a complete copied draft (memberIds, label/material/thickness mode/thickness/grain, four overhangs, vertical gap, allowed gap, follow:true). Creation can opt out of following and produce a fixed board. Linked boards are non-driven and role-free, exclusive of single-cabinet finishing and front-pull ownership. Project format increments 30 to 31; validate metadata at legacy/current boundaries.

Regenerate after cabinet placement, generators and single-cabinet finishing, before joints. Stable board ID, color, visibility, cuts, manual machining and edge choices survive. Update pose and common parent when all linked members move together. If some members disappear or become misaligned, preserve last-good geometry and recipe, show actionable diagnostics, and allow editing membership. If every source cabinet disappears, release the recipe and keep fixed geometry (normal container deletion bakes world pose first). Direct part-tool changes to owned dimensions/pose/parent/name/material/grain release the recipe. Cosmetic/machining edits retain it. A moved single-board duplicate is fixed and drops the recipe.

Saved membership is explicit: selecting an anchored run captures its current members; newly added cabinets require reselection. Worktop links do not change cabinet placement envelopes. No L-shaped tops, automatic joints, cutouts, structural span guarantees or room partition checks. Per-board metadata has member IDs, so generic cabinet-only reuse is not a worktop-copy feature.

## Transaction/UI

Choose siblings or Select anchored run, enter settings, then preview. Show dimensions, area, occupied bounds, member order/gaps and real board. List relevant linked worktops when they share the current container or include the opened cabinet. Load existing recipes (including missing-member rows), preview and save with stable ID, detach/delete in one undo step. Reset/cancel discard local drafts; scene geometry/settings changes require reload/reset. Acceptance rechecks signature/target ownership, rebuilds from current scene, rejects invalid/stale/no-op or colliding-ID requests, and preserves unrelated current metadata. Invalid links can still be detached/deleted. Existing single-finishing, Fronts and Hardware previews must stale when worktop recipes change.

Notes: ../notes/2026-10-21-run-worktops-notes.md
