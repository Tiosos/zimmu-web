# Parametric Dado Joint (JP1) — Implementation Notes

Living notes: decisions, surprises, and deviations from the spec/plan. Audience is a
future developer (or AI) who needs the *why*.

## File format version

- **Spec said "bump 2 → 3"; that was stale.** `FILE_FORMAT_VERSION` was already `3`
  (bumped during the earlier joinery-cuts/mitre work, with `parseFile` already doing
  lenient v2→v3 field defaulting). JP1 bumps it to **4** and defaults `scene.joints` to
  `[]` in `parseFile`. Adding `joints` also required fixing two `newFile` literals — the
  empty scene **and** the `lastSavedSceneRef` dirty-tracking baseline — or the app reads as
  permanently dirty after New (the dirty check is a `JSON.stringify` equality against that
  baseline).

## State model

- **Materialized derived cuts (spec Approach 1).** A joint owns a `BoxCut` tagged
  `sourceJointId` on the housing board plus the housed board's `position`. `reconcileJoints`
  regenerates both. The OCCT worker never sees a `Joint` — only the materialized cut — so
  `occt.ts`/`mesh.ts`/drawings/export/cutting-list are untouched.
- **Single reconcile-commit helper.** Every joint-affecting mutation goes through
  `commitReconciled(mutate, label, coalesceKey?)`, which snapshots the whole scene before,
  applies `reconcileJoints`, and pushes one undo entry with `setScene(before)` /
  `setScene(after)` closures. This keeps undo single-entry and atomic (a joint edit that
  moves the housed board + re-cuts the groove is one Ctrl+Z), matching the existing
  paired-cut precedent.
- **`onUpdate` keeps its fast path.** Only when the edited part participates in a joint does
  `onUpdate` route through the reconcile helper (whole-scene snapshot). Non-joint parts use
  the original single-part snapshot path unchanged, so the common case (dragging/resizing a
  plain board) pays nothing.
- **`shapeKey` unchanged.** It already serializes only `position`/`size` for box cuts, so
  `sourceJointId` is naturally excluded — confirmed by a guard test rather than a code change.
  The derived cut's `position`/`size` *do* enter the key, so updating a joint rebuilds the
  housing via the normal path; the housed board's new `position` is applied by the Viewport
  with no OCCT rebuild.

## Geometry / placement

- **Stale preserves last-good.** `reconcileJoints` only strips *orphan* derived cuts (whose
  joint is gone). A joint that fails `isValidDadoSeat` (a participating board rotated
  off-axis) is skipped — its existing derived cut and the housed position are left as-is —
  so the model shows the last valid geometry plus a sidebar "stale" banner, never a silently
  wrong groove. Rotating back re-validates and regenerates.
- **Narrow axis = housed *thickness* direction.** The groove width is the housed board's
  thickness (+clearance); the run axis spans the housing fully (through dado). Derived at
  reconcile time from the parts' axis-aligned orientations, so a 90° flip stays correct.
- **v1 boundary is enforced numerically.** `isValidDadoSeat` requires
  `dot(housedEndNormal_world, housingFaceNormal_world) ≈ -1`. Creation is rejected with a
  message otherwise; a later rotation flags stale.
- **`computeDadoSeat` is idempotent** (re-seating a seated board is a ~0 delta). For
  axis-aligned parts the arithmetic is exact, so `reconcileJoints` idempotence is asserted
  with strict `JSON.stringify` equality in the tests.

## UI

- **Redundant top-level `joints` prop removed.** The plan added a `joints: Joint[]` prop to
  `SidebarProps`, but `JointsPanel` reads `scene.joints` (and needs `scene` anyway for part-
  label lookups), so the extra prop was dead. Dropped it from `SidebarProps` and the App JSX
  (YAGNI) rather than thread an unused value.
- **Derived cuts are read-only in the sidebar** — rendered as a plain "Dado N (joint)" row,
  and `onUpdateCut`/`onRemoveCut`/`onLinkCuts` reject any cut carrying `sourceJointId`.

## Verification

- Full suite green (513 passing at Task 7). Coverage: `dado.test.ts` (validity/axes/groove/
  seat/idempotence), `reconcileJoints.test.ts` (materialize/idempotence/orphan/stale/
  passthrough), `useScene` joint tests (single-entry undo, cascade delete, resize
  re-derivation), `useAddJoint` (two-click state machine, validity mocked).
- **Interactive 3D smoke not run in-agent.** Per `2026-06-17-e2e-playwright-smoke-notes.md`,
  OCCT WASM does not load in the agent sandbox, so the raycaster-driven click-two-faces smoke
  is a human step. The joint *logic* is fully exercised headlessly through the real
  `useScene` + `reconcileJoints` + `dado` modules; `pnpm build` confirms the UI wiring
  compiles and bundles.

## Deferred (future joint slices)

- Stopped/blind dado (a `stop` param + housed notch), rabbeted/tongue-and-dado (two-sided
  cut). The `Joint` union and `reconcileJoints` are structured to grow into these.
- Non-orthogonal / angle-solved joints; multi-joint constraint networks (today a board in two
  joints just takes the last reconcile for its position).
