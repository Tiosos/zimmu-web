# Auto-Suggest Joints — Implementation Notes

Living notes. Audience: a future dev/AI who needs the *why*.

## 2026-07-26 — enumeration approach was geometrically wrong (design-time discovery)

The brainstorm settled on "enumerate the six faces of each board, run each joint's `isValid*` gate,
take the first pair that passes." Verifying against the real gates while writing the plan showed this
is wrong for four of the five joints:

- Only `isValidHalfLap` is **position-aware** (checks world-AABB overlap + coplanarity).
- `isValidDadoSeat`, `isValidMortiseTenon`, `isValidFingerJoint`, `isValidTongueGroove` check
  **orientation only** (anti-parallel / perpendicular face normals). They are intentionally weak
  because the two-click UI relies on the *human* clicking the actually-touching faces.

So blind enumeration picks the first *orientation*-passing pair — e.g. for the M&T derivation
fixture, the `+Y`/`-Y` edge faces (100 mm apart) rather than the real `+Z`/`+X` contact — and would
emit joints on the wrong faces.

Also learned: the joint creators **auto-seat** the mating board, so the derivation-test fixtures are
geometrically arbitrary (declared faces don't match the boards' positions). Do **not** reuse them for
suggester tests; build physically-coherent fixtures.

### Decision: contact-based detection

`contactPair(a, b)` infers the meeting axis as the world axis with the largest (least-negative)
AABB gap within `TOUCH_TOL`, then maps that ±axis to each board's actual touching face. The existing
gates validate that one physically-correct pair. Classification by the contact faces' local depth
axis:

- exactly one broad (`depth 'z'`) face → perpendicular tee → dado + mortise-tenon;
- both long edges (`depth 'y'`) → coplanar edge glue-up → tongue-groove;
- else (two broad = lamination, two ends = butt/corner) → nothing.

This also fixes a cross-type noise case: the raw M&T orientation gate accepts a coplanar edge
glue-up, but the classification never routes an edge contact to M&T.

Assumption: shallow post-snap contact (seat axis has the smallest overlap). Deep penetration could
flip the argmax; accepted for MVP.

### Decision: defer finger joints

A finger/box joint is a *perpendicular interlocking corner* — the two ends are perpendicular and the
boards overlap in the corner region, so it has no single anti-parallel contact face that
`contactPair` models. Detecting it needs a separate corner detector. Rather than bolt a second
heuristic onto the MVP, finger is deferred to a fast-follow (adds a fifth `JointSuggestion` variant +
an `onAddFingerJoint` dispatcher arm). MVP ships half-lap + dado + mortise-tenon + tongue-groove.

### Other choices

- `TOUCH_TOL = 1 mm`; `MAX_SUGGESTIONS = 8`; `KIND_PRIORITY = [halflap, dado, mortise-tenon, tongue-groove]`.
- Apply replays through the existing `onAdd*` creators via `synthHit` (creators read only `partId` +
  `localFaceNormal`), so undo/redo + cut derivation come for free and stale suggestions fail safe.
- `FACE_NORMALS` gets a fifth private copy (matches the per-file convention in `geom/*`); a shared
  export is a separate refactor.

## 2026-07-27 — implementation complete

- Implemented via subagent-driven development across 6 tasks; all merged with a spec review and a
  code-quality review each.
- Ships 4 joint types: half-lap, dado, mortise-tenon, tongue-groove. Finger deferred as designed above.
- One test-infra necessity discovered: `SuggestionsPanel.test.tsx` needs `afterEach(cleanup)` because
  the repo doesn't set vitest `globals: true` (matches the existing `src/ui/*.test.tsx` convention).
- A follow-up during Task 3 added a sort-order test and two classification "why" comments (from code
  review).

## 2026-07-27 — finger joints added (feature now covers all five joint types)

- `cornerPair` detects the right-angle corner `contactPair` cannot model: world-AABB adjacency, then
  each board's end face pointing toward the other, then a proximity gate.
- The proximity gate was **not** in the approved spec — planning found that without it, a board
  standing on another's broad face, off-centre toward one end, is reported as being at that end and
  passes `isValidFingerJoint` (which checks orientation and widths, never position). Threshold is
  `(Ta + Tb) / 2 + TOUCH_TOL`, derived from the flush-corner offset, not tuned. Same class of bug as
  the enumeration flaw recorded on 2026-07-26.
- `cornerPair` is position-only by design: it does not verify perpendicularity (collinear boards
  butted end-to-end also return a pair), so it must always be composed with `isValidFingerJoint`.
- Role assignment is load-bearing: `FingerJoint.partAId` stays put and `partBId` auto-seats, so the
  **selected** board is always A — clicking Add never moves the board the user selected.
- The dispatcher arm in `App.tsx` is not compile-enforced (the switch has no `never` guard), unlike
  `KIND_LABEL` which is. A missing arm would silently no-op. The round-trip test's kind chain does
  now carry a `never` guard, added after code review flagged that converting its bare `else` had
  removed exhaustiveness for a future sixth kind.
- A right-angle corner also satisfies the tee classification, so a box corner lists Dado, Mortise &
  tenon, and Finger joint together. Confirmed intentional — all three are legitimate for that
  geometry.

## 2026-07-27 — suggestion hover highlight

- Hovering a Suggested joints row lights the neighbouring board's edges amber (`0xfbbf24`) in the
  viewport, so "Dado with Rail 2" is self-explanatory. Matters more now that one box corner can list
  Dado, Mortise & tenon and Finger joint together.
- **Edge colour only, never emissive.** Selection uses both channels, so mirroring it is the
  instinct — but the flash animation's completion handler (`viewport.tsx`, animation loop) resets a
  mesh's emissive to a hardcoded `selected ? 0x222244 : 0x000000`. An emissive-based highlight would
  be silently wiped when a flash finished on that board, and stay wiped until `parts`/`geometries`/
  `selectedId`/`highlightedId` next changed. Staying on the edge channel sidesteps it without
  touching working animation code.
- `applySuggestion` clears the hover: applying makes the row unmount, and `onMouseLeave` never fires
  on an unmounted element, which would otherwise leave the board lit indefinitely.
- `onHoverSuggestion` is deliberately a **required** prop through the whole chain, so a missing
  wire-up is a compile error. `Viewport.highlightedId` is optional (matching the existing
  `flashTarget?` convention), so that one is not compile-enforced.
- Moving the pointer from the row onto its Add button does NOT clear the highlight: React's
  `onMouseEnter`/`onMouseLeave` use native mouseenter/mouseleave semantics, which ignore transitions
  onto descendant elements.
- Known minor gap: rows are keyed by array index, so if the distance-sorted `suggestions` reorder
  while the pointer sits motionless over a row, the highlight can go stale until the next mouse move.
  Self-correcting; not worth a guard yet.
- Face-level highlighting (outlining the two faces a joint would use) was considered and deferred.
  The groundwork exists: `computeFaceCorners` reads only `localFaceNormal`, which `synthHit` sets, so
  suggestion faces feed the existing `updateHighlight` LineLoops directly. Blockers were half-lap
  carrying no faces and the two LineLoops being owned by the snap/gesture modes.

## 2026-07-27 — suggestion face outlines

- Hovering a suggestion now outlines the two faces the joint would cut, in addition to tinting the
  neighbour board. This is what makes the three suggestions on one box corner distinguishable —
  Dado, Mortise & tenon and Finger joint all point at the same board but use different faces.
  **Correction (2026-08-07): the second sentence is wrong.** Dado and Mortise & tenon use the *same*
  faces and are indistinguishable by their outlines. See the 2026-08-07 entry at the end of this file.
- **Latent bug fixed on the way.** `updateHighlight` builds the outline from `localFaceNormal` but
  offsets it 1mm clear of the surface along `faceNormal`, expecting a WORLD normal. `synthHit` sets
  both to the same LOCAL vector — harmless for the apply path (creators read only `localFaceNormal`)
  but wrong for drawing: on a rotated board the outline was pushed the wrong way, into the solid.
  Added `faceHitForDisplay` rather than changing `synthHit`, whose local/zeroed shape the `onAdd*`
  creators depend on and the round-trip test asserts. The test that pins this uses a ROTATED board
  (Ry=-90, local +X → world +Z); an unrotated one cannot tell the two apart.
- `suggestionFaceRefs` carries a `never` guard, so a sixth joint kind is a compile error rather than
  a row that silently highlights nothing.
- Dedicated LineLoops rather than reusing `sourceFace`/`hoveredFace`: those belong to the snap and
  add-joint gestures, and the sidebar stays live during a gesture, so the two would contend.
- Only two loops exist, because `suggestionFaceRefs` returns 0 or 2 faces for every kind. A future
  kind returning 3+ would silently lose the extras; there is a comment at the call site saying so.
- Half-lap has no faces, so it degrades to the board tint alone — deliberate, not a gap.
- Hover state changed from `hoveredNeighborId: PartId | null` to `hoveredSuggestion: JointSuggestion
  | null` one slice after landing; the tint now derives `neighborId` from it. Runtime value is
  unchanged because `SuggestionBase` mandates `neighborId` on every variant.

## 2026-08-06 — browser verification of the hover highlight

Everything above this line was verified by unit tests only: the tests pin `suggestionFaceRefs` and
`faceHitForDisplay` as pure functions, but nothing asserted that the LineLoops actually reach the
screen. Driven in headless Chromium to close that gap.

- Repro, for anyone re-checking this: add a second board, set its Position Y to 100 (both boards are
  200×100×25 at the origin, so y=100 makes their long edges meet at y=50), then hover the
  "Tongue & groove with Board 1" row in the selected board's panel.
- Confirmed on screen: the neighbour board's edges go amber, and the two mating faces are outlined.
  Isolating just the pixels that changed between the un-hovered and hovered frames shows the
  neighbour silhouette plus one rectangle standing along the seam and nothing else — no stray
  geometry. Un-hovering returns the canvas to the baseline frame (0.002% of pixels differ, all of it
  the dev FPS counter). No console or page errors across the whole run.
- The two face outlines are coincident for an edge-to-edge joint — both faces occupy the same plane
  at y=50 — so they draw as one doubled line, separated only by `updateHighlight`'s 1mm clearance
  offset. Correct, but worth knowing before someone reports "only one face highlights".
- **Legibility nit, not a defect.** The neighbour tint and the face outline are both `0xfbbf24`, so
  the outline on the *neighbour* board is hard to pick out against that board's now-amber wireframe;
  it reads clearly on the selected board, whose edges stay cyan. If the face outlines ever need to
  carry more weight, giving them a distinct hue from the board tint is the cheap fix.
- Headless setup notes: the image ships Chromium build 1194 while the project pins
  `@playwright/test` 1.61 (which wants 1228), so a launch must pass
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` — do not run
  `playwright install`. WebGL needs `--use-gl=swiftshader --enable-unsafe-swiftshader`, and the OCCT
  WASM kernel takes long enough to boot that the gate to wait on is the `+ Board` button losing its
  `disabled` attribute, not any fixed timeout.

## 2026-08-07 — the butt corner, confirmed in the app (and one claim disproved)

The finger-joint spec flagged "butt corners now produce three suggestions … worth confirming in the
app" and it had never been confirmed. Built the `cornerA`/`cornerB` fixture through the UI and
hovered each row.

- **The three suggestions are real.** Selecting Board 1 on a flush right-angle corner lists Dado,
  Mortise & tenon and Finger joint, exactly matching `suggestJointsFor`. The unit test asserted this
  with `toContain('finger')`, which would have passed even if dado or mortise-tenon had silently
  stopped being offered; it now pins the exact set.
- **Dado and Mortise & tenon are visually identical on hover.** Measured amber pixels per row: dado
  1772, mortise-tenon 1772, finger 1262 — and the dado and mortise-tenon amber *pixel sets* overlap
  100%, not merely in count. The two frames differ only in the dev FPS counter.
- **Cause is structural, not specific to corners.** Both kinds are pushed from the same contact pair
  using the same `housing`/`housingFace`/`housed`/`housedEnd` values (`suggestJoints.ts`), so
  `suggestionFaceRefs` returns the same pair for both, always. They are indistinguishable by outline
  anywhere they appear together — every perpendicular tee as well as every butt corner. Pinned by a
  test so a future change to the outline logic has to confront it.
- **So the face-outline rationale above was one-third right.** Outlines separate Finger joint from
  the other two (51.5% overlap), and do nothing to separate Dado from Mortise & tenon. That is not a
  bug in the outline code — the two joints genuinely use the same faces and differ in how much
  material is removed, so no face-based cue can ever separate them. Distinguishing them needs a
  different signal: a ghost of the resulting cut, a one-line description per row, or simply not
  offering both where one clearly dominates. Left open — it is a design decision, not a defect.

## 2026-08-07 — `defaultJoint.ts`, and the scope of cut-footprint previews

The candidate fix for the above is to outline the **cut footprint** rather than the whole face: the
dado groove runs the full board width, the mortise pocket is inset, and that difference is visible at
a glance. `computeDadoGroove` and `computeMortisePocket` already return the removed region as a
`BoxCut`, on the main thread, with no OCCT round-trip. Only the groundwork is done so far.

- **Extracted `src/scene/defaultJoint.ts`** — `defaultDadoJoint` / `defaultMortiseTenonJoint`, called
  by useScene's creators. A preview needs a whole joint object to call the footprint functions, and
  duplicating the seeded parameters would let the preview drift from what the creator actually makes.
- **`id`/`label` are parameters, not generated inside.** The footprint functions read them only to
  stamp the resulting `BoxCut`'s id/label/`sourceJointId`; position and size are independent. So a
  preview passes placeholders and needs neither `crypto.randomUUID()` nor the joint counter nor any
  scene state. That is what keeps a preview a pure function of two boards and two faces.
- **The defaults were pinned first, and were previously pinned by nothing.** No test in
  `useScene.test.ts` (79 at the time), `useAddJoint.test.ts` or `useAddMortiseTenon.test.ts` asserted
  any default value, though they decide real cut geometry. Two characterization tests went in as a
  separate commit *before* the extraction, so the refactor had something to be verified against.
  `offset` and `offsetU` centre on 12.500000000000005, hence `toBeCloseTo` for those two.

Two findings for whoever picks up the drawing half:

- **Do not reuse `computeFaceCorners` for footprints.** `BoxCut.position`/`size` are in board-local
  x/y/z; `computeFaceCorners` builds its rectangle from an arbitrary u/v cross-product basis, not
  `faceAxes()`. Build the corners straight from the `BoxCut` in local axes and transform with
  `composeWorldMatrix`, the way `suggestJoints.ts` already does.
- **The tenon side is not one rectangle.** `computeTenonShoulders` returns `BoxCut[]`. The viewport
  allocates exactly two `LineLoop`s and has a comment warning that a kind needing 3+ silently loses
  the extras — so footprint previews force that pool to become dynamic. This is the largest hidden
  cost in the idea and was not visible until the housed/tenon side was examined.
  *(Done — the pool is dynamic as of the entry below.)*

## 2026-08-07 — `cutFootprint.ts` + dynamic highlight pool (drawing half, not yet wired)

- **`cutFootprintCorners(part, cut)`** returns the world-space corners of the rectangle a `BoxCut`
  removes from one board face. Built directly in the board's local axes rather than on
  `computeFaceCorners`, whose in-plane basis comes from a cross product with an arbitrary fallback
  vector — fine for a full face, which is symmetric about its centre either way, and meaningless for
  an off-centre sub-rectangle. Board-local space and `BoxCut.position` share the same min-corner
  origin (`computeLocalFaceCenter` confirms it), so no rebasing was needed after all.
- The outline sits on the board's own face plane, not the cut's far plane: it marks where material
  leaves the surface being looked at, and `updateHighlight` lifts it 1mm clear from there.
- **The payoff is pinned by a test**: on the same tee, the dado groove's footprint runs the full
  100mm width of the housing board while the mortise pocket's reaches neither board dimension. That
  is the difference face outlines structurally could not show.
- **The viewport's suggestion `LineLoop` pool now grows on demand** and no longer assumes two faces.
  It never shrinks — a few hidden loops cost nothing and reusing them avoids churning geometry on
  every hover. Cleanup reads the ref rather than a captured local, since the pool grows after mount.
  `snapMat`/`emptyGeo` moved to module scope so the highlight effect can allocate too.
- **Not yet wired.** `cutFootprintCorners` has no production caller — only its tests. Hovering still
  outlines whole faces, so dado and mortise-tenon still look identical in the app. Swapping
  `suggestionFaces` over to footprints is the remaining step; the existing `suggestion-highlight`
  e2e spec passing throughout this change is what shows the pool refactor kept current behaviour.
  *(Wired in the entry below.)*

## 2026-08-07 — footprints wired: dado and mortise & tenon now look different

`suggestionOutline.ts` turns a hovered suggestion into `Outline[]` (`corners` + world `normal`), and
the viewport draws outlines rather than faces — one code path, no faces-vs-footprints branch in the
renderer. `App` passes `suggestionOutlines` where it used to pass `suggestionFaces`.

- **Driven through `deriveJoint`, not by hand-picking cut functions.** Build the default joint, ask
  `deriveJoint` what it cuts, outline each resulting `BoxCut`. The preview is then the same
  derivation the creator uses, so it cannot drift, and it needs no per-kind knowledge of how many
  cuts a joint makes.
- **Only dado and mortise & tenon use footprints.** Everything else keeps whole-face outlines:
  finger and tongue & groove are already distinguishable, half-lap has no face pair. That also
  leaves the `suggestion-highlight` e2e spec's amber calibration untouched, since it hovers a
  tongue & groove.
- **Measured result on the box corner** (same scene as the 2026-08-07 entry above): dado 1005 amber
  px, mortise & tenon 1538, and their pixel-set overlap fell from **100% to 42%**. On screen the
  dado is a single groove running across the housing board; the mortise & tenon is a nest of
  rectangles — the inset pocket plus the tenon shoulders.
- What the defaults actually cut, which decided what gets drawn: a default dado is `profile:
  'plain'` with no stops, so `deriveDadoJoint` emits exactly **one** cut, the groove on the housing
  board — nothing at all on the housed board. A mortise & tenon emits the pocket plus up to **four**
  shoulder strips, so a single preview can be five outlines. Hence the dynamic loop pool.

## 2026-08-07 — half-lap gets a preview at all

Half-lap was the one kind that previewed *nothing*: `suggestionFaceRefs` returns `[]` for it, so
hovering drew only the neighbour tint. That was right when outlines meant faces — a crossing overlap
has no mating face pair — and stopped being right the moment footprints existed. It now outlines its
two lap cuts. Earlier notes calling this "deliberate, not a gap" are superseded.

- `defaultHalfLapJoint` joins the other two in `defaultJoint.ts`; its defaults (`split: 0.5`,
  `clearance: 0`) were pinned by a characterization test before the extraction, same discipline.
- **`face` on a lap cut is a placeholder and must not be trusted.** `worldBoxToLocalCut` stamps
  every lap cut `'+Z'` with a comment saying it is cosmetic — the geometry lives in position/size.
  Taken at face value both outlines land on the boards' *top* faces, when a lap removes the upper
  half of one board and the lower half of the other. `lapFace` recovers the real side: `stackAxis`
  reads the board's local z column and `isValidHalfLap` requires both boards to share that axis, so
  a lap always cuts through local z; only the sign is open, and the cut's local z position settles
  it. A test asserts the two outline normals oppose, which is what fails if this is naive.
- Scoped to laps rather than applied everywhere: every other producer sets a meaningful `face`, and
  re-deriving it globally would risk the dado and mortise & tenon behaviour already verified.
- Confirmed in the app on two crossing 200×40×20 / 40×200×20 boards: 903 amber px at the crossing,
  two rectangles at different heights. Previously this hover produced zero outlines.

## 2026-08-07 — all five kinds preview cuts, and outlines get their own hue

- **Finger and tongue & groove now preview cuts too**, so a hover means one thing everywhere rather
  than "cuts for three kinds, faces for two". A finger joint benefits most: its end faces are plain
  rectangles that say nothing, while `computeFingerCuts` draws the comb of slots that *is* the
  joint. `defaultFingerJoint` / `defaultTongueGrooveJoint` complete `defaultJoint.ts`, both pinned
  by characterization tests first. Neither producer has half-lap's placeholder-`face` problem —
  checked before starting: `fingerjoint.ts` sets `face: end`, `tonguegroove.ts` sets the real edge.
- `faceOutlines` survives only as the fallback for a joint `deriveJoint` declines to resolve.
- **Cut outlines moved to their own colour** (`SUGGESTION_OUTLINE_COLOR = 0xf472b6`). They sit on a
  neighbour board whose edges are tinted amber, and amber-on-amber left an outline hard to pick out
  against the very board it marked. Pink is clear of the amber tint, the blue hover face, the cyan
  selection, and every entry in `PART_COLORS` (whose closest neighbour is a pale lavender).
- **The e2e spec had to change with it**, and got better for it. It counted one colour against a
  threshold sitting in a narrow gap, because that single number had to discriminate between the
  tint and the outlines. Now it counts both hues separately, so each is evidence for exactly one
  half and the floors can be generous: measured tint 717 / outline 1749 against gates of 300.
  Mutation-checked both ways — disabling the tint fails the tint gate, disabling the outlines
  fails the outline gate.
- Measured on the box corner, hovering each of the three suggestions: amber is now **constant**
  (748 / 744 / 747 — it is the same neighbour board every time, which is the point), while the pink
  outline count varies with the joint (dado 252, mortise & tenon 782, finger 480). Before the split,
  one number conflated both and moved for reasons that were hard to attribute.

**Process note for anyone mutation-testing uncommitted work:** restoring a mutated file with
`git checkout <file>` reverts it to the index, which silently discards *any* uncommitted change in
that file — including the one under test. That happened here: the colour change vanished mid-run and
a later verification showed zero pink, which looked like the feature failing rather than the harness
eating it. Copy the file aside and restore from the copy, or commit before mutating.
