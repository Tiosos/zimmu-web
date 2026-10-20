# Run worktops notes

- Branch starts at local pull-layout commit 074d0eb; verified origin/main remains 6a1e59c. Both batches are retained for a later PR.
- One rectangular board attaches to the common container, not one source cabinet. Explicit member IDs are required; newly attached cabinets are not silently added.
- Existing Top/End views are sections and can hide a worktop. Only the new preview requests complete external views; defaults remain unchanged for all current consumers.
- Spec: ../specs/2026-10-21-run-worktops-design.md
- Plan: ../plans/2026-10-21-run-worktops.md
- The geometry builder is independent of the regeneration pipeline to avoid a dependency cycle. The scene hook accepts against the current reconciled scene, then reconciles once and records one undo snapshot.
- Rotation order is copied from the reference cabinet along with its rotation; matching three-axis rotations are covered in addition to simple plan rotations.
- Complete projections are opt-in on both the pure projector and its UI component. A regression asserts the worktop is present in the complete Top view and absent in the default Top section.
- Run recipes use the same owned-field release helper and stale-scene signature as single-cabinet finishing. This also invalidates previously open Fronts/Hardware previews when a run recipe changes.
- Validation: 210 unit files pass, with 3,680 tests passed and 10 skipped. Typechecking and lint pass. Focused geometry/UI/history coverage adds 48 tests. Nineteen guard mutations are killed by AssertionErrors, with each original restored from a compared scratch backup; the stale-signature mutation needed a strengthened unrelated-material-change test before it was killed.
- Both production builds pass: CAD and the catalogue service. Browser checks use a temporary configuration on port 5193 with reuse disabled, isolating this worktree from the previously running development server.
- Chromium: all 9 selected end-to-end flows pass (1.7 minutes), including both new run-worktop flows and regressions for single/linked finishing, Fronts & Drawers and handle/pull drilling. Temporary browser configuration removed afterward.
- Completed all 25 tasks in the spec. User guide: docs/cabinet-run-worktops.md. The branch retains the preceding 25-task handle/pull batch; this turn does not publish a PR or merge.
