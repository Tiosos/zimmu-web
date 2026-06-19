# Mitre End-Cut — Implementation Notes

Living log of decisions that don't belong in the spec. Audience: future dev/AI.

## 2026-06-18 — Design decisions (brainstorm)

- **Scope = angled end-cut (one board, one plane).** Rejected: general angled cut
  anywhere (vague to drive from UI, not really "a mitre") and auto frame-mitre
  pairing (needs corner inference + two-part transaction — too big for one cycle).
- **Representation = discriminated union `CutDef = BoxCut | MitreCut`, single
  `cuts` array.** Considered separately: extending `CutDef` with optional `angle`
  (overloads one type with two semantics) and a parallel `part.mitres` array
  (duplicate iteration/linking paths). Union keeps one pipeline (linking, undo,
  drawing all iterate one list) at the cost of `kind === 'box'` narrowing churn.
  Accepted that cost. (User initially picked the separate-array option, then
  switched to the union.)
- **Orientation = `{ end, axis, angle }`, both flat (`axis:'Z'`) and bevel
  (`axis:'Y'`).** Difference is one stored field + which rotation axis the tool
  uses; constraining to one felt arbitrary. Compound (two planes) stays out.
- **Angle convention = 0° square / 45° standard**, drop = dim·tan(angle). Matches
  a mitre-saw setting; the "from length axis" (cot) convention is easy to get
  backwards. UI clamps to (0, 89).
- **Hand = fixed**, long point at the min-coordinate edge (y=0 flat / z=0 bevel).
  Opposite hand via 180° board rotation about X. A `direction` field is deferred —
  flagged as the obvious first extension if frames feel awkward.
- **Linking = none for mitres.** Avoids defining mitre-pairing semantics now.
- **2D drawings = included** (user choice over 3D-only). This adds a second
  geometry-projection path: per-view `boardOutline` polygon. Only the Face view
  (flat) / Edge view (bevel) change; the End view's YZ silhouette is unaffected.
- **UI = sidebar-only.** A mitre is fully described by end+axis+angle — clean
  sidebar inputs; avoids standing up a second face-interaction state machine
  (`useAddMitre`) like `useAddCut`.

## 2026-06-18 — Implementation outcome

- Implemented per spec. `pnpm typecheck`, `pnpm lint`, `pnpm test` all green
  (398 passed / 6 skipped). New tests: `mitre.test.ts` (tool math + outline),
  `shapeKey` mitre cases, `useFile` v2→v3 migration + v3 mitre round-trip,
  `useScene` onAddMitre + mitre edit, `drawing` mitre outline/note per view.
- The discriminated union forced `kind === 'box'` narrowing across `useScene`
  (onUpdateCut/onRemoveCut/onLinkCuts/onUnlinkCuts), `sidebar` updaters, and
  `drawing.ts`. Introduced a shared `Face` type (was `CutDef['face']`, no longer
  valid on the union) used by snapMath/useAddCut/drawing.
- Test churn: every legacy box-cut literal needed `kind: 'box'`; reads of
  `.size`/`.face`/`.pairedCutId` on cuts needed `as BoxCut`. Mechanical.
- `computeMitreTool` rotation sign verified by test:
  `sign = (end==='+X'?1:-1) * (axis==='Z'?1:-1)`. Pinned by intersecting the
  rotated cut plane with the far edge and asserting the short-point x.
- STL needed no change (re-meshes from worker geometry, which now includes the
  mitre). STEP/`writeStep` inherits mitres via `makeShape` once `ExportSpec.cuts`
  became `CutDef[]`.
- `mesh.ts` unchanged — it walks all faces generically, so the angled face
  triangulates without special handling.

## STILL TO VERIFY (not done)

- **Manual `pnpm dev` smoke of `makeMitreCut`** — OCCT is browser-only and cannot
  run in Node, so the actual Boolean cut is UNVERIFIED at runtime (the tool math
  is unit-tested, but the `gp_Ax1`/`gp_Dir_4`/`gp_Pnt_3`/`SetRotation_1`/
  `BRepBuilderAPI_Transform_2` embind calls are not). Smoke a 45° flat mitre +
  a bevel, confirm the viewport, then STL/STEP/SVG/DXF export.

## Open risks / to verify during implementation

- `makeMitreCut` uses OCCT symbols (`gp_Ax1`, `gp_Dir_4`, `gp_Pnt_3`,
  `SetRotation_1`, `BRepBuilderAPI_Transform_2`) that are UNVERIFIED in Node —
  must smoke-test in `pnpm dev`. Same caveat class as `writeStep`.
- Rotation **sign** per end×axis is the easy thing to get wrong; pin it in
  `computeMitreTool` tests by asserting which corner gets removed.
- `drop ≥ length` consumes the whole end — allowed, UI soft-warns; confirm OCCT
  doesn't error (returns valid/empty solid) during the smoke test.
- Compound case (a flat + a bevel on the same end): 3D is correct (both cuts
  apply); drawings render each in its own view independently. Acceptable; noted.
