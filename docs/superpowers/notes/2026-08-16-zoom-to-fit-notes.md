# Zoom to Fit — Implementation Notes

Living notes for `docs/superpowers/specs/2026-08-16-zoom-to-fit-design.md`.

## 2026-08-16 — shipped

- `Home` frames every visible part. The math is a pure module, `src/scene/fitCamera.ts`; `App.tsx`
  owns the intent (a `fitRequest` nonce) and `viewport.tsx` owns the camera mechanics, because
  `camera.aspect` is a viewport-owned fact derived from the mount's client size.
- **The corner-origin box is the trap.** A board's local box is `(0,0,0)..(length,width,thickness)`,
  not centred — `BRepPrimAPI_MakeBox_1` spans `0..d`. A cylinder is different again: centred in x/y,
  corner-origin in z. There is a dedicated test for each, because a centred-box assumption offsets
  every fit by half a part and still looks approximately right.
- **Two distinct degeneracies, not one.** `position === target` leaves no bearing to preserve, and a
  dead top-down bearing collapses `cross(f, up)`. The second is not covered by a guard for the first,
  and is the easier one to miss because orbiting reaches it.
- **The tightness test earns its place.** "Every corner is inside the frustum" passes for any absurdly
  large distance; it is only meaningful paired with "pulling in past the margin overflows". Both are
  in `fitCamera.test.ts`, each using an independent `worstOverflow` frustum recomputation so the test
  is a real check, not a restatement of the production formula.

## Verified in the browser (real Chromium, `pnpm dev`)

Screenshots were unavailable this session (the Browser pane was not displayed, so the page was not
compositing frames — a screenshot needs the pane shown). Instead the fit was verified **numerically
against the live Three.js camera and OrbitControls**, reached through the React fiber tree, which is
stronger than a screenshot: it asserts every corner is inside the frustum, not merely that the framing
"looks right".

**Primary path — clean pass.** Added a board, set it to 800 × 600 × 720 at the origin (world box
`[0,800]×[0,600]×[0,720]`, centre `(400,300,360)`), with the camera at the default `(250,-200,150)`
aimed at the origin corner — the badly-framed starting condition. Dispatched a real `Home` `keydown`
through App's native window listener (the same path the unit test uses), which drove the whole chain:
keydown → `setFitRequest` → prop → viewport effect → `fitCameraToParts` → live controls. Result:

- target moved to `(400,300,360)` — exactly the box centre;
- camera moved to `(1587,-649.6,1072.2)`, distance 1678.6 mm;
- independent frustum check: worst corner overflow **0.942 ≤ 1** — every one of the 8 corners is in
  frame, and 0.942 sits right against the 5% margin (ideal 1/1.05 = 0.952), so the fit is tight, not
  parked far back;
- bearing preserved: direction dot product **1.000**.

The app also loaded with zero console or build errors and the `fitCamera` import resolved and mounted
in a real browser, not only under happy-dom.

**Not cleanly measurable in-browser this session:** the no-visible-parts no-op guard. Dev-mode async
state updates plus an HMR reload scrambled the scene between the hide and the re-read, so the
before/after camera comparison was unreliable. This guard is covered by a unit test
(`fitCameraToParts` returns `null` when nothing is visible) and the input-focus suppression is covered
by an App test (`Home` inside a text input does not request a fit), so it is verified by the suite even
though the live measurement was inconclusive.

**Corner-origin nuance surfaced by the live test.** The spec's "the session begins with the camera
inside the cabinet" holds for the measured 8-board carcase, whose parts straddle the origin, but a
single 800 × 600 × 720 board placed at the origin is corner-origin — box `[0,800]×[0,600]×[0,720]` —
so the default camera at `(250,-200,150)` sits just outside it on −Y while aimed at its origin corner.
The "badly framed, most of the box off to the side" condition still reproduces; "strictly inside" is
position-dependent. Worth remembering when reasoning about framing from part positions.
