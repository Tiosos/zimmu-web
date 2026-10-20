# Cabinet finishing panels

User selected finishing panels as the next main cabinet feature. Build on the completed Layout branch; do not merge or open a PR in this task.

## Twenty-five tasks
1. Finishing workspace in the cabinet editor.
2. Worktop board creation.
3. Left end-panel creation.
4. Right end-panel creation.
5. Left filler creation.
6. Right filler creation.
7. Front plinth creation.
8. Rear splashback creation.
9. Fit defaults to the cabinet's local occupied envelope.
10. Choose a panel material.
11. Use stock material thickness.
12. Override thickness explicitly.
13. Choose length/width/free grain.
14. Name the new board.
15. Worktop left overhang.
16. Worktop right overhang.
17. Worktop front overhang.
18. Worktop rear overhang.
19. Configure vertical panel height (end panels, fillers, plinth and splashback).
20. Configure filler width.
21. Configure bottom clearance (or worktop vertical gap).
22. Configure plinth setback.
23. Preview Front/Top/End with existing cabinet geometry.
24. Show board dimensions, material, grain and footprint/area summary.
25. Apply as a separate, undoable board-add operation.

## Geometry and lifecycle
All boards are generated in the cabinet's own coordinate frame with `orientedPanel`, then parented to that cabinet. Local occupied bounds use the same material-slot front/frame/applied-back convention as placement. Worktop spans local occupied X/Y plus nonnegative four-sided overhangs, with underside at cabinet top plus vertical gap. End panels stand immediately outside left/right envelope, covering occupied depth. Fillers occupy width outside the left/right envelope, with face flush to the occupied front and thickness behind that face. Plinth spans occupied width, with front setback from the occupied front and thickness behind it; reject setback that would extend its rear beyond occupied depth. Splashback spans occupied width, immediately behind the occupied rear, beginning at cabinet top plus bottom clearance. Other vertical panels start at bottom clearance above envelope bottom. Heights are explicit; defaults use cabinet height, toe-kick height for plinth (100 mm fallback), and 100 mm for splashback. Filler default width is 50 mm. Worktop defaults to 20 mm front overhang, all others zero.

Created parts are ordinary editable, non-driven, role-free boards. They move and rotate with their parent; sizing is a snapshot and does not automatically follow future cabinet dimensions. Existing part editing/deletion, persistence, cutting lists, nesting and exports consume the actual boards. Do not claim joints, machining, physical clearance or automatic collision validation. Do not add schema fields or infer provenance from a label. Adding another finishing panel is explicit and may intentionally duplicate a position.

Use stock material thickness unless custom mode is selected. Material must exist, be panel stock with positive finite thickness, and not be edge-band stock; custom thickness remains positive finite and can differ from stock. Show the difference in the summary. Grain must be one of the existing three values. Reject blank/nonfinite/negative dimensions, empty names, invalid source cabinet geometry/transforms, overflow/nonpositive panel extents, unavailable source, stale signatures and ID collisions at acceptance. Invalid input never modifies the project.

Draft controls invalidate previews. Geometry/material/part changes stale the draft until reset, while mesh updates do not; hardware/pricing metadata outside geometry may change without losing preview. Apply rebuilds the board against current source data with a fresh ID, rather than trusting a cached board or scene. Preserve current unrelated scene data. Reset, cancel, kind change and fit-to-cabinet reset staged inputs. Disclose discard-on-tab-exit and fixed-size behavior.

## Validation
Unit tests compare actual oriented bounds for all seven kinds, rotated/translated cabinet attachment, material/custom thickness, offsets and non-mutation. Validate accepted-board preservation through regeneration, save/load, board CSV and nesting inputs. UI tests cover controls, three projections, preview invalidation, stale/reset/cancel and rejected acceptance. Scene hook tests verify one separate undo/redo step after sizing. Browser workflows use real geometry for creation, material/dimensions, projection, persistence through sizing and independent undo. Mutate each new guard after a green baseline, restore from backups and inspect assertion failures. Run full units with local networking enabled, then builds and browser checks without competing heavy jobs to avoid the previous test timeout.
