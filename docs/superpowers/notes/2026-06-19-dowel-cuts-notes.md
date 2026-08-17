# Dowel Cuts (SP2) — Implementation Notes

Living notes for the SP2 dowel-cuts work. Audience: a future developer/AI who needs to know *why*, not just *what*. Spec: `../specs/2026-06-19-dowel-cuts-design.md`. Plan: `../plans/2026-06-12-dowel.md` (SP2 section).

## Base-branch dependency

- SP2 builds on SP1 (the dowel `CylinderPart`), which lived only in PR #6. SP1 predated the mitre (#9) and e2e (#8) merges, so before SP2 could start, PR #6 was rebased/merged onto `main`: `main` was merged into PR #6, **9 conflicts resolved as the union of the mitre + dowel features**, then PR #6 merged to `main` via merge commit `7063780`. SP2 then merged that `main` into the SP2 branch `claude/funny-cray-7uy6qp`.
- Conflict-resolution fix worth knowing: PR #6's pre-merge `buildSpecForPart`/`exportStep` stripped board cuts to `{id,position,size}` (predating mitres) — that would have silently dropped mitre cuts from the live mesh build and STEP export. Both now pass the full `CutDef[]`.
- A Playwright dowel smoke test was added to verify the live WASM dowel render path (PR #6's documented blocker) — it hides the default board and asserts the viewport stays non-blank, isolating the dowel mesh. Confirmed green in CI (proves `makeCylinder` renders).

## Decisions / deviations

- **Seeded end-cut default angle = 45° (deviates from spec §4, which said 0°).** A square end cut with `angle: 0, offset: 0` is a geometric no-op (zero-volume subtraction at the very end), so clicking "End" would produce nothing visible. Seeding 45° gives a visible mitre the user can then adjust (or click "Square" to set angle 0 with a non-zero offset). See `useAddCut.ts` cylinder branch.
- **Bore click-seed defaults are through-holes:** axial seeds `depth: part.length`, transverse seeds `depth: part.diameter`. Deliberate — "drill a hole through" is the common dowel-joinery intent; the seeded ⌀ is `max(2, diameter/3)` (a tube, not a disappeared dowel). Users adjust depth numerically or via the "Through" button.
- **`through` is represented as numeric `depth ≥ extent`, not a flag** (YAGNI — see spec). The OCCT cylinder tools overshoot by `dowel.diameter` so the boolean clears cleanly at the boundary.
- **`shapeKey` cylinder branch uses `JSON.stringify(cut)`** (includes `id`/`label`). Safe ONLY because dowel-cut editor rows expose no rename — `id`/`label` are immutable once created, so they can't trigger spurious geometry rebuilds. **Guardrail: do NOT add a label-rename input to `DowelCutsPanel`** (Task 6) without switching `shapeKey` to a field-by-field key first.

## Gotchas discovered

- The plan's Task 5 test snippet referenced a `hitPoint` field on `FaceHit` that does not exist, and omitted `faceCenter`. The real `FaceHit` (`src/scene/types.ts`) is `{ partId, faceNormal, faceCenter, localFaceNormal, localHitPoint }`. Use the real type in later tasks (Task 6 component tests, etc.). Tests use `localHitPoint`.
- An implementer's commit once omitted a collateral test-file change from its `git add`, leaving the commit non-green in isolation (the working tree was green only via the uncommitted file). Always `git add` every file you modified and confirm `git status --short` is empty after committing.

## UNVERIFIED OCCT overloads (pending live spike)

- End cuts / notches go through `makeBoxCutAt`, which reuses the **proven** `makeMitreCut` overloads (`BRepPrimAPI_MakeBox_1`, `gp_Trsf_1`, `gp_Vec_4`, `BRepBuilderAPI_Transform_2`, `gp_Pnt_3`, `gp_Dir_4`, `gp_Ax1_2`, `BRepAlgoAPI_Cut_3`) — low risk.
- Bores (Task 8) use `makeCylinderCut` with `gp_Ax2_3` + `BRepPrimAPI_MakeCylinder_3` (oriented cylinder) — these are this design's best read of the embind API and are **UNVERIFIED at runtime** until the live OCCT spike / e2e. Record the working overload ids here once confirmed.

## Decisions made during implementation

- **Notch seed depth = `radius / 2` (a shallow flat), not `radius` (half-lap).** Originally the click-seed used `depth: radius`, which equals exactly what the "Half-lap" quick-set button sets — so on a freshly placed notch the button was a no-op. Seeding a shallow flat makes the Half-lap button a meaningful one-click action (parallel to "Square" for end cuts and "Through" for bores). See `useAddCut.ts` notch seed.
- **Quick-set buttons per cut type:** End → "Square" (angle 0); Bores → "Through" (depth = full extent); Notch → "Half-lap" (depth = radius). Consistent affordance across the editor.

## Known debt (pre-existing patterns, flagged by review; not fixed in SP2)

- **`DowelCutsPanel`'s `patch(cutId, fields: Partial<DowelCut>)` is loosely typed.** `Partial<DowelCut>` is a union of partials, so the compiler would accept `patch(id, { end: ... })` on a notch. It can't happen through the UI (every call is guarded by a `cut.kind === 'X'` branch), but the type safety is illusory. A future hardening: make `patch` generic over the narrowed cut kind (pass the cut, not just the id).
- **No exhaustiveness/`never` check on `cut.kind` in `DowelCutsPanel`.** Four `cut.kind === 'X' && (...)` branches; a 5th `DowelCut` variant would compile and silently render a body-less row. Add a switch/never guard when the union next grows.

## Verification status (sandbox limitations)

- **Unit/typecheck/lint:** fully green. All pure tool-geometry math (`dowelCut.ts`) is exhaustively unit-tested; `shapeKey`, worker build-spec mapping, `useAddCut` seeding (all 4 tools incl. surface-mismatch no-ops), and the `DowelCutsPanel` editor rows have tests.
- **Live WASM cut-render path: NOT verified in this sandbox.** Node skips the OCCT kernel; Playwright Chromium could not be installed here (no outbound network for the browser download). The SP1 dowel *render* (uncut) is e2e-verified. The new cut operations execute OCCT only in a browser:
  - End cuts + notches go through `makeBoxCutAt`, which reuses the **proven** `makeMitreCut` overloads — low risk.
  - **Bores** use `makeCylinderCut` with `gp_Ax2_3` + `BRepPrimAPI_MakeCylinder_3` — **UNVERIFIED overloads**. Confirm via a `pnpm dev` spike (add dowel → arm Axial/Transverse bore → click cap/side → confirm the hole renders and re-meshes) or a future canvas-interaction e2e, and record the working overload ids here.

## Deferred (out of scope for SP2)

- Dowel cut-linking / `pairedCutId`; snap-align (SP3); 2D drawings for dowels (SP4) — drawings entry stays disabled for cylinders; curved-surface smooth shading; faceted edge lines on the curved surface.
