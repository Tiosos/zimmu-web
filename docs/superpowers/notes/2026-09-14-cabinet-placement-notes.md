# Cabinet placement — implementation notes

**Spec:** `docs/superpowers/specs/2026-09-14-cabinet-placement-design.md`
**Plan:** `docs/superpowers/plans/2026-09-14-cabinet-placement-stage-1-primitive.md` (Stage 1; later stages get their own files)

Living notes. The audience is whoever implements a stage and wonders why a rule is shaped the way it
is.

---

## 2026-09-14 — brainstorming session

### The opposite-face rule was wrong, and it was caught by arithmetic, not by review

The design went into the session with this rule: *anchor to the target's `front`, and the anchored
cabinet presents its `back` — which, when turned 90°, is a side in world terms.* That was asserted
from purpose and it is false. Working the corner numerically showed the return cabinet's back is a
plane of constant world **x** while the target's front is a plane of constant world **y** — they are
perpendicular, so the rule cannot place the cabinet at all.

The replacement — *the meeting face is the one whose outward normal most directly opposes the target
face's normal* — degenerates to the opposite face whenever the rotations match. **That is the whole
danger:** every straight-run fixture passes the broken rule. This is the same defect class as the
96-case symmetric sweep that `openingRect` survived, and the single-drawer fixture that index-based
reconciliation survived. A rule that is right in the symmetric case and wrong in the asymmetric one
needs an asymmetric fixture or it is not tested.

### Three things asserted in the first pass that the code contradicted

Recorded because the ratio is the point — three wrong claims in one short design, all of them
confident:

1. **"A carcase's box is `width × height × depth` straight off `CarcaseParams`."** False three ways.
   An applied back reaches `y = D + BT` (`carcaseRoles.ts:399`); an overlay front reaches `y = −FT`;
   and a toe-kick cabinet's shell starts at `z = floorZ`, so anchoring on the shell floats a Base 600
   100 mm off the floor. The last one is what forced occupied bounds.
2. **"Placement must lead the pipeline because it reads only parameters."** The premise is true and
   the inference invalid — but the *conclusion* turned out right, and the first correction to this
   entry was itself wrong. See "The ordering claim was wrong twice" below: `reconcileJoints` does
   depend on component position, through `resolveWorldMatrix`, so placement genuinely must lead.
3. **"The cycle guard in `componentTree.ts` sits beside this."** `wouldCycle` guards `parentId`. The
   anchor graph is a *different* graph over the same components. It is a model to copy, not code to
   reuse.

### `gap` alone underspecifies position by two axes

Not a subtlety — a hole. A face is two-dimensional, so a side-to-side anchor with only a `gap` has no
defined floor alignment and no defined front alignment. Fixed with a 2-vector `offset` in the target
face's plane.

The pleasing part: the local origin corner is front-bottom-left, so `offset: {0,0}` gives front-flush
and floor-flush without either being a special case. The *unpleasing* part is that this is the wrong
default for mixed depths — a 330 wall unit beside a 560 base lands front-flush rather than against
the wall. Resolved by keeping one model rule and letting the plan view's drag write a back-flush
offset when depths differ. **The user was asked and answered only the first half of that question;
the drag behaviour is my decision and is flagged as such.** If back-flush-on-drag turns out to be
wrong, it is a UI change, not a model change — which is the reason for putting it there.

### Blind corners cost one enum value

Expected to be the expensive part of the corner stage and it is not. `Section.front` is already
optional and `FrontSpec` already has `'false-front'` and `'panel'`, so a blind unit is an ordinary
carcase whose section tree has a leaf with no door. Nothing new in the generator, the front pass or
the hardware BOM.

What the corner genuinely needed was `'front'` in the anchor's face enum, so the return run can butt
into the blind portion. Worth remembering when the next "big" feature is estimated: the expensive
part was the placement rule, not the cabinetmaking.

### Why runs are derived rather than stored

A `RunComponent` was proposed and rejected. It gives a run an identity you can select and hang a
corner policy on, which is real value, but an L-shape is two runs that must still relate at the
corner — so the anchor between them has to exist anyway, and then the run is a second description of
a fact the anchors already carry. `nearestCarcase` exists because two BOM consumers each shipped
their own copy of an ownership question; this is the same trap with a component kind attached.

The cost is honest and was stated to the user: selecting "a run" means selecting something computed.
Stage 2 will have to make a derived group feel like an object.

### Deliberately not built

- **A `'top'` anchor side.** Stacking a wall unit on a base is the one real case. Asked, and the user
  confirmed it stays out. It is cheap now and expensive later, which is the argument *for* including
  it; it was excluded anyway because nothing in the three chosen layouts needs it.
- **Walls as objects.** Drawn as context, never modelled. Every anchor names a cabinet.
- **Filler strips.** A different answer to the corner question than a blind unit.

### The viewport gizmo was chosen against recommendation

Recommended deferring surface C: largest piece of new interaction code, duplicates the plan view, and
competes with `OrbitControls` for the same mouse drag. The user asked for all three surfaces. Staged
last so it blocks nothing — if it turns into a fight with the camera controls, stages 1–3 have
already shipped.

### Sourcing caveat that must not be lost

**The blind-corner dimensions are unverified.** A 900 blind unit against a 560-deep return leaves
340 mm of accessible opening. That figure is mine, from reasoning about the geometry, not from a
cabinetmaker or a catalogue. It is the same class of claim as the hinge table and the TANDEM runner
figures: a wrong number yields a perfectly self-consistent cabinet that does not work, and no test in
this repository can falsify it. The blind-width check (`blind ≥ return depth`) is a *geometric*
guard, not an ergonomic one — it says the door will not be overhung, not that anyone can reach into
the corner.

---

## 2026-09-17 — Stage 1 implementation

### The over-detachment bug: my rule, faithfully implemented

The plan said: *"Detach every member of a chain that revisits an id."* The implementer built exactly
that. **The rule is wrong**, and it shipped as a Critical defect caught only by review.

Anchors form a **functional graph** — out-degree ≤ 1, since a cabinet has at most one anchor. So a
walk that halts on "revisits any node I have seen" halts for every *transitive ancestor* of a cycle,
not just for cycle members. Reproduced live:

```
a ↔ b     a genuine 2-cycle
d → a     legitimate: a live carcase, not d itself, same parent

result:   d.anchor === undefined
```

`d`'s anchor was silently destroyed, and **unrecoverably** — once `anchor: undefined` is written out
the original value is gone from the scene; there is no "retry once the cycle is fixed" path. The fix
distinguishes *the walk came back to me* (detach) from *the walk wandered into someone else's cycle*
(leave alone — that cycle's members are detached on their own turn, and `positionOf` then freezes
their position for anyone anchored to them).

Latent only by timing: nothing called `resolvePlacement` until the next task wired it into
`applyPipeline`. One task later this would have been live, and the symptom — anchors vanishing from
cabinets nowhere near the cycle — is about as hard to diagnose as this codebase gets.

### The ordering claim was wrong twice, in opposite directions

Recorded in full because the shape of the error is more useful than the answer.

1. The plan said placement **must** lead, because it reads only parameters. True premise, invalid
   inference.
2. A review challenged it. A grep for `.position` across the three downstream stages came back empty,
   so it was "corrected" to **order-independent — convention, not constraint**, and that sentence was
   written into the source comment above `applyPipeline`.
3. A mutation test then ran placement **last**, and idempotence broke.

`reconcileJoints` does depend on component position — **transitively**. `deriveJoint` calls
`resolveWorldMatrix(housed, byId)` (`geom/dado.ts:109`), which composes through ancestor component
matrices. A joint derived before its cabinet has moved is derived against the wrong world placement,
so the next pass re-derives cuts the first got wrong.

**A grep for a field name does not establish that nothing depends on it.** The dependency ran through
a matrix; no search for `.position` could have shown it. The original conclusion was right, for a
reason neither version of the argument stated.

Worth noting how it was diagnosed: the failure surfaced as `toEqual` on two 16-part scenes, which
says nothing. Narrowing to *which part, which field* pointed at joint cuts, and from there to
`deriveJoint` in one step.

### Five surviving mutations, all one shape

Every mutation that survived its suite in this stage was **a rule written once but exercised on only
one of its branches**:

| Where | Mutation that survived | Branch never exercised |
|---|---|---|
| `hasAnyFront` | one-level child check instead of recursion | nesting deeper than one level |
| `rotateVector` | swap x and y before delegating | any rotation not about z |
| `anchoredPosition` | transpose `IN_PLANE['y']` | front/back anchor with a non-zero offset |
| `anchoredPosition` | drop `gap` from the negative branch only | `left`/`front` anchor with a non-zero gap |
| `PlacementPanel` | drop the `parentId` clause from the target filter | a candidate under a different parent |

Two consequences for how the next stage should be run:

- **A prescribed mutation only probes what the author already suspected.** Every one of these was
  found by an implementer or reviewer choosing its own attack; none came from the list in the plan.
- **Wherever a flag selects a branch, both sides need a case.** That single heuristic would have
  predicted four of the five before any code was written.

### Six comments asserted things that were false

All originated in the spec or plan, none would have been caught by a green suite, and one caused the
bug above. `y0: -front` (yields `-0`, which `Object.is` rejects); `Bounds3` "must not be swapped" with
`LocalBox` (structurally identical, TypeScript enforces nothing); "every existing call site is
unaffected" by the `Placed` widening (two broke immediately); `{0,0}` means front-flush (true for
left/right only — front/back gives left-flush); "React re-renders on it" (`scene` is one flat
`useState` replaced wholesale, and there is no `React.memo` in the UI at all); and the cycle rule.

The generalisable habit: **asserting mechanism from intent.** The spec's geometry section already
carried that lesson; it applies to prose about the code just as much as to the code.

### Final mutation pass (Task 10)

Run against the finished code as a whole, not task by task. Every file backed up and restored by
`cp`, grepped after each apply and each restore; `git status` clean afterwards and the suite back to
1988 passing.

| # | Mutation | Predicted | Observed | Killed? |
|---|---|---|---|---|
| 1 | Hardcode the opposite face (drop the `positive` ternary) | left-face, both corner cases, back-to-back, applied-back | **6 failed** | yes |
| 2 | Shell bounds instead of occupied (`z0 = toeKickHeight`) | toe-kick bounds + toe-kick placement | **2 failed** | yes |
| 3 | Resolve in array order (`target.position` for `positionOf(target)`) | the back-to-front chain | **3 failed** | yes |
| 4 | Ignore `offset` on both in-plane axes | the two offset cases | **2 failed** | yes |
| 5 | Dangling anchor falls back to the origin | free-placed, ghost-target, self-anchor | **4 failed** | yes |

**Two mutations failed *more* tests than the plan predicted**, and that is the interesting result.
The plan's predictions were written against its own 13 `resolvePlacement` tests; the shipped suite
has 17, because review added a diamond, a chain of three and an applied-back case. Mutation 3 also
caught the chain-of-three and the diamond; mutation 5 also caught the diamond.

That is the right direction for a gap to point — predictions made before the reviews under-counted
because coverage grew. The rule from earlier in this file still holds, though, and is worth keeping
the other way round too: **when fewer fail than predicted, the gap is usually real; when more fail,
check that the extra failures are coverage you meant to add rather than a mutation reaching further
than intended.** Both here were the former, confirmed by reading which tests failed.

### One more wrong claim, caught at the very end

Writing the spec's closing status line I asserted the suite went "1890 → 1988". The 1988 was
measured; **1890 was from memory and wrong.** Checking it meant standing up a git worktree at the
merge base and running the suite there: the real figure is **1917** across 95 files.

Seventh false claim in this branch, and the cheapest possible one to have checked — which is rather
the point. The habit that produced the other six was still running right up to the last paragraph.

---

## 2026-09-17 — stage 2: runs and the plan view

**Plan:** `docs/superpowers/plans/2026-09-17-cabinet-placement-stage-2-adjacency.md`

Stage 1 was still an open PR (#48) when this began. The user chose to merge it first and branch from
the updated `main`, rather than stacking — so stage 2's diff is its own.

### Two decisions taken with the user

**A run is a maximal chain of LEFT/RIGHT links only.** A front or back anchor starts a new run. The
alternatives were "any anchor chain" (an L-shape is one run that turns a corner) and "connected
components". The deciding argument is stage 3's: a kitchen run is one straight line against one
wall, so an L-shape is *two* runs — and the blind-width check exists precisely to compare a blind
unit's width against the depth of the run returning into it. Defining a run as "everything joined
together" leaves that check with one run and nothing to check it against.

Connectivity is nonetheless **undirected**. `L → T` and `R → T` is one run of three, not two of two:
direction records who moves when `T` moves, which is a different question from what is in the line.

**The plan view is a main-pane toggle, not a modal.** The precedent for scene-wide surfaces is a
modal (`BomModal`, `DrawingViewer`), but drag-to-anchor is primary editing and a dialog you must
close to see the result in 3D is the wrong shape for it. The toggle extends the `display` rule the
cabinet tabs already use, so the mount-once viewport is hidden rather than unmounted.

### What the plan got wrong — the useful part

1. **Rotations are stored in degrees, not radians.** The plan's `worldBoundsOf` test turned a
   cabinet by `Math.PI / 2` and asserted the footprint extents swapped. They did not: the extent
   came back 615.6 against an expected 578, which is a **1.57° turn** of a 600 × 578 box, not a
   quarter one. `composeWorldMatrix` multiplies by `DEG2RAD` (`transform.ts:19`). Caught because the
   assertion was written against a measured consequence rather than against the code's own
   arithmetic — a test asserting "the extents swap" fails loudly here, where one asserting a matrix
   would have agreed with whatever the matrix did.

2. **The plan hedged on duplicating `FACE_NORMAL` and `IN_PLANE` into `dragAnchor.ts`**, with a note
   saying to export them from `anchor.ts` "if a third reader appears". A second reader *was* the
   thing being written. They are now exported and imported, because a drop that names a different
   face than the resolver honours is exactly the class of drift this codebase states rules once to
   avoid.

3. **`spanRef.current = …` and `dragRef.current = drag` during render are lint errors**
   (`react-hooks/refs`), and the plan wrote both. The fix was not a suppression: the frame moved
   into a `useMemo` **above** the empty-job guard so the effect can read it as a value, and the
   pointer handlers close over `drag` directly, resubscribing per move. That costs a few listener
   swaps per gesture and nothing else.

4. **The plan's drag tests dispatched pointer events without flushing React between them.** The
   listeners are attached by an effect, so the `pointermove` landed before anything was listening
   and `onDrop` was never called. Each phase is now `act()`-wrapped, in one `dragBy` helper rather
   than four copies.

5. **A pipeline's exit code is its last command's.** `pnpm lint 2>&1 | tail -2 && git commit` reports
   `tail`'s status, so a failing lint was masked and a commit went through with two lint errors in
   it. Amended. Worth carrying forward: gate on the command, not on a pipe through `tail`.

### Mutation testing: three tests that could not fail

Eleven mutations were predicted; four are recorded here because they are the ones that taught
something. Every file was backed up with `cp` and restored from the copy, and grepped after both.

| Mutation | Predicted | Actual |
| --- | --- | --- |
| `runs.ts`: `front`/`back` continue a run | 1 fail | 1 fail ✓ |
| `runs.ts`: directed graph only | 1 fail | 4 fail ✓ |
| `runs.ts`: drop the `parentId` clause | 1 fail | **0 — survived** |
| `runs.ts`: unsorted members | 1 fail | 2 fail ✓ |
| `dragAnchor.ts`: `SNAP_MM` 60 → 5 | 3 fail | **0 — survived** |
| `dragAnchor.ts`: no `flush` on `offset.u` | 1 fail | 1 fail ✓ |
| `dragAnchor.ts`: `flush` always 0 | 1 fail | 1 fail ✓ |
| `dragAnchor.ts`: drop the self-anchor clause | 1 fail | **0 — survived** |
| `PlanView.tsx`: `toSvg` reads the near edge | 1 fail | 1 fail ✓ |

The three survivors were three different failures of the same kind — *a test that pins something
other than what it names*:

- **The `parentId` clause.** The test built its scene through `sceneOf`, which runs
  `resolvePlacement` — and that pass detaches a cross-frame anchor before `runsOf` ever sees it. The
  test was passing on the resolver's guard. It now calls `runsOf` on raw components. This is the
  general hazard of a fixture helper that runs the pipeline: it tests the pipeline.
- **The self-anchor clause.** The drop sat near the origin, which is out of snap range of every one
  of the dragged cabinet's *own* faces, so it returned `free` with or without the clause. It now
  drops on its own right face, where the clause is the only thing preventing a self-anchor.
- **`SNAP_MM`.** Every boundary test expressed its figure as `SNAP_MM ± n`, so shrinking the
  constant moved the tests with it. A constant cannot be pinned by tests written in terms of it. One
  absolute figure (30 mm) now stands in for the real claim — the snap is wide enough to catch a drop
  placed by hand — without being the tautology that asserting `SNAP_MM === 60` would be.

All four were re-run after the tests were strengthened and all four now fail. The source files were
restored from the `cp` backups and `git diff --stat` confirmed only the two test files had changed.

### Measured

- **Baseline** (`a4bebd4`, main with stage 1 merged, measured not quoted): 99 files, 1988 passed,
  10 skipped.
- **Branch tip:** 103 files, 2025 passed, 10 skipped.
- **Delta:** +4 files (`carcaseWorldBounds`, `runs`, `dragAnchor`, `PlanView`), **+37 tests**.
- `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

### Still open

Stage 3 (corners: rotation in the plan view, front-face anchors, blind-width validation) and stage 4
(the viewport move gizmo) remain designed and unbuilt. The **blind-corner dimensions in the spec are
still unverified** — reasoned from geometry, not read off a catalogue, the same class of claim as
the hinge table and the TANDEM figures. Stage 3 is where that matters.

One thing stage 3 should not have to rediscover: `PlanView` has no rotation affordance at all, so a
turned cabinet can be drawn (`worldBoundsOf` handles it, and `rotatedBounds` is exact for quarter
turns) but not made. Rotation is the user's in both mounts and never derived from a target, so the
affordance is a control, not a rule.

---

## 2026-09-17 — stage 3: corners

**Plan:** `docs/superpowers/plans/2026-09-17-cabinet-placement-stage-3-corners.md`

### Two thirds of the staged scope was already shipped

The spec's staging line reads *"rotation in the plan view, front-face anchors, blind-width
validation"*. Reading the source rather than the summary — which is the whole lesson here — showed
that **front-face anchors already worked**: `Anchor['face']` has carried `'front' | 'back'` since
stage 1, `FACE_NORMAL` maps both, `PlacementPanel` offers all four faces and `anchorForDrop`
considers all four. More importantly, the spec's self-declared "load-bearing claim" — that the
meeting face is derived from the normal, and that *every straight-run fixture passes the broken
rule* — is **already pinned by a corner fixture**: `anchor.test.ts:93`, `:102`, and a 90°
front-anchored case in `resolvePlacement.test.ts:170`.

So an L-shape was buildable before this stage, by typing `90` into `PlacementPanel`'s Rotation Z and
picking a `front` anchor. Stage 3 made that ergonomic and caught the one way it goes wrong. Recorded
because the staging line reads like three pieces of work and is one and a half; anyone planning from
the summary alone would have rebuilt a corner fixture that already exists.

**What was genuinely missing** was decision 9 — *"Does drag-anchoring inherit the target's rotation?
**Yes**, as a UI default only"* — which had never been implemented. Without it the corner *gesture*
does not work: dragging a cabinet onto a blind unit's front face leaves it at 0°, facing out of the
wall. That is the piece that makes the plan view able to build a corner at all.

### The blind-width figure, sharpened

An earlier framing of this (in the stage 2 hand-off) called the blind-corner *dimensions* the
blocker. That was imprecise, and the correction matters: the spec's rule contains **no vendor
figure**. It is arithmetic — *the blind portion must be at least as wide as the return run's
cabinets are deep*. What the Risks section calls unverified is the judgement that **bare contact is
enough**, i.e. whether real practice wants a margin for door swing, a handle, or a minimum
accessible opening.

So `BLIND_CLEARANCE = 0` is the spec as written, taken as an explicit assumption rather than a
settled figure, and isolated so a woodworker's answer changes one number and the tests that read it.
**Still open.**

### Mutation testing: one survivor, the same shape as stage 2's

| Mutation | Predicted | Actual |
| --- | --- | --- |
| `turnCabinet`: drop the compensating translation | 1 fail | 2 fail ✓ |
| `turnCabinet`: compensate on the min corner, not the centre | 1 fail | 1 fail ✓ |
| `turnCabinet`: drop the `% 360` wrap | 1 fail | 1 fail ✓ |
| `blindCorner`: `'panel'` counts as accessible | 1 fail | **0 — survived** |
| `blindCorner`: warn on every face | 1 fail | 1 fail ✓ |
| `blindCorner`: measure the target's depth, not the return's | 1 fail | 2 fail ✓ |
| `blindCorner`: flip the comparison | 1 fail | 4 fail ✓ |
| `dragAnchor`: always suggest `rotationZ: 0` | 1 fail | 1 fail ✓ |

The survivor is **exactly stage 2's shape — a rule written once but exercised on only one of its
branches.** Every blind-unit fixture used a *bare opening* for the blind leaf, so the
`'panel'` and `'false-front'` arms of the blind test were never reached and deleting either killed
nothing. A panelled leaf is the case a real blind unit actually wears. Both arms now have a case,
and a second mutation (`'false-front'`) was added and killed too.

**A process note worth keeping.** The first attempt at the "drop the compensating translation"
mutation produced `Tests no tests` — the Python surgery had broken the file syntactically, so
nothing compiled. That reads *nothing like* a survivor but is equally not a result; it was redone
with an exact string replacement. Add it to the mutation rules: **a run that reports no tests is a
broken mutation, not evidence.**

The `FrontSpec` import in the new test pointed at `types.ts`, where it does not live (it is exported
from `sectionTree.ts`). Caught only because this stage gated commits on the **real exit code** —
`pnpm typecheck; tc=$?` — rather than piping through `tail`, which is the trap stage 2 recorded.

### Measured

- **Baseline** (`f644198`, main with stage 2 merged, measured not quoted): 103 files, 2025 passed,
  10 skipped.
- **Branch tip:** 105 files, 2051 passed, 10 skipped.
- **Delta:** +2 files (`turnCabinet`, `blindCorner`), **+26 tests**.
- `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

### Still open

Stage 4 (the viewport move gizmo) remains — the only stage nothing else depends on, staged last
deliberately because it duplicates the plan view and competes with `OrbitControls` for the same
drag.

Two judgement figures are unverified and both are one-line changes: `SNAP_MM = 60`, which has never
been felt in the running app, and `BLIND_CLEARANCE = 0` above.

---

## 2026-09-24 — stage 4: the move gizmo (the design completes)

**Plan:** `docs/superpowers/plans/2026-09-24-cabinet-placement-stage-4-gizmo.md`

### The risk the spec named was real, and had no precedent

The spec warned surface C "competes with `OrbitControls` for the same mouse drag". Measured before
planning, that is exactly right and nothing in the app had met it: `interactionActive` *looks* like
it might gate orbit and does not — it sets the cursor (`viewport.tsx:677`) and routes face clicks
(`:357`, `:382`). Every existing gesture (snap, cut, the five joint tools) is **click**-based,
discriminated from a drag by a 4-pixel threshold in `handleClick`. Orbit was enabled
unconditionally and never had to yield. The gizmo is the first drag gesture in the app.

### Two decisions taken with the user

**1 — build on `TransformControls`.** It ships inside `three@0.184.0` at
`three/examples/jsm/controls/`, the same directory `OrbitControls` already comes from, so it is a
zero-dependency addition. Its `dragging-changed` event suspends orbit only while a handle is
actually held.

**The API was verified against the installed source rather than recalled**, which is worth keeping
as a habit: `defineProperty` at `TransformControls.js:105-131` dispatches
`` `${propName}-changed` `` carrying `{ value }`, and `dragging` is one of those properties
(`:225`). `getHelper()` exists (`:424`). `mode` already defaults to `'translate'` (`:167`) and
`space` to `'world'` (`:206`), so the plan's `setMode`/`setSpace` calls were dropped as redundant
before any code was written.

**2 — X, Y *and* Z, against the recommendation.** The recommendation was X/Y only: placement is 2D,
the design excludes a `'top'` anchor side, nothing stacks. The user chose all three, and it
composes better than the recommendation anticipated — for a `left`/`right`/`front`/`back` face,
`anchorForDrop`'s in-plane `v` axis **is z**, so a wall unit dragged beside another snaps flush in
height through the existing rule. Z is not an unsnapped free axis after all. Pinned by *snaps a
near-flush height to flush* and *keeps a deliberate height difference past the snap*.

### One deliberate deviation from the spec

The spec names `scene/useMoveGizmo.ts`. **It was not created.** `CLAUDE.md` forbids abstractions for
single-use code, and there is no gizmo state to hook: the drag lives inside `TransformControls`, the
resolution is one callback in `App`, and a hook wrapping a single callback would be a file existing
to match a table row. The real content — the centre↔origin conversion — went into a pure module,
`moveGizmo.ts`, exactly where stages 2 and 3 put theirs.

### Where the evidence comes from, and where it does not

`viewport.tsx` has **no unit test at all**, and `App.test.tsx` mocks the entire module
(`vi.mock('./render/viewport')`). happy-dom has no WebGL. So this stage's correctness rests on
Task 1's pure arithmetic plus the e2e suite, and the viewport change was deliberately kept to
wiring with no arithmetic in it. A future reader should not mistake the green suite for evidence
that the gizmo renders.

### Mutation testing: no survivors, and every kill larger than predicted

| Mutation | Predicted | Actual |
| --- | --- | --- |
| `gizmoCentreOf` returns the origin | 1 | **8** ✓ |
| centre uses `b.x0` in place of the midpoint | 2 | **8** ✓ |
| `positionForCentre` uses the world box | 1 | **2** ✓ |
| `positionForCentre` drops the z term | 2 | **4** ✓ |
| `dropForCentre` passes the centre straight through | 1 | **3** ✓ |

First stage in this series with **no survivor**, where stages 2 and 3 each had one. The reason is
structural rather than virtuous: `gizmoCentreOf` and `positionForCentre` are inverses, so every
round-trip test exercises both, and breaking either kills a cluster instead of a single assertion.
That is a property worth copying — a rule stated as a pair of inverses is far harder to
under-test than a rule stated once.

### What this stage got wrong

- **A test asserted an assumption rather than the code.** *gives the gizmo the selected cabinet and
  nothing else* cleared the selection and expected the gizmo to detach. It does not: `selectedCarcase`
  deliberately keeps an open cabinet open, and a cabinet closes when the selection moves **outside**
  it. The test now does what the neighbouring *closes the cabinet when the selection moves outside
  it* already demonstrated. The code was right and the test was wrong.
- **Two typecheck errors the plan predicted in outline:** `Vec3` was not imported into
  `viewport.tsx`, and `dragging-changed` types its `value` as `unknown`. The latter was narrowed
  (`e.value === true`) rather than cast, since `CLAUDE.md` forbids `any`.

### Measured

- **Baseline** (`f90c1f3`, main with stage 3 merged, measured not quoted): 105 files, 2051 passed,
  10 skipped.
- **Branch tip:** 106 files, 2064 passed, 10 skipped.
- **Delta:** +1 file (`moveGizmo`), **+13 tests**.
- `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

### The design is complete

All four stages are shipped: free placement, straight runs, L-corners and the gizmo. Still excluded
by the design itself: a `'top'` anchor side, walls as objects, filler strips, per-run operations
beyond what a chain gives for free.

Two judgement figures remain unverified and both are one-line changes. `SNAP_MM = 60` is now read by
**two** surfaces rather than one, so the gizmo makes it more visible than the plan view did;
`BLIND_CLEARANCE = 0` is still the spec's bare-contact rule awaiting a woodworker's ruling. Neither
should be called settled on the strength of a green suite.

### 2026-09-24 — driving the actual app, and the one thing it found

The stage-4 notes above warn that `viewport.tsx` has no unit test and that a green suite is not
evidence the gizmo renders. So it was driven for real, through the repo's own Playwright harness
(`playwright.config.ts` already carries `PW_CHROMIUM_EXECUTABLE` for this container; the binary is
at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, **not** the `/opt/pw-browsers/chromium`
path the environment advertises).

**What the app confirmed.** The gizmo attaches to the selected cabinet and renders as a
double-ended X/Y/Z triad at the box centre. Dragging the X handle moved the cabinet (`0 → 225.438`)
and dragging empty space did not (`225.438 → 225.438`) — so the orbit conflict really is solved,
not merely solved in principle.

**One thing was wrong in the reading, and is recorded because the mistake is instructive.** The
first screenshot looked like the gizmo was buried inside the carcase with half its arrowheads
occluded. It is not: `TransformControls` sets `depthTest: false` on its shared gizmo materials
(`TransformControls.js:1153`, `:1161`), and translate mode draws arrows at **both** ±0.5 of each
axis (`:1262-1272`). The "detached arrowheads" were the second arrow of each pair. Read the source
before reporting a rendering defect from a screenshot.

**The real finding: a free drag landed on `225.43806578321403` mm.** Neither surface rounded, and
nothing in this app is specified to a fourteenth decimal place. The plan view had the identical
defect since stage 2 and nobody had noticed, because no unit test asserts on a *free* drop's exact
value — only on `kind: 'free'`.

The user chose to fix it in the **shared** drop path rather than per-surface (`gizmo.translationSnap`
was the one-line alternative), so `roundMm` lives in `dragAnchor.ts` and both surfaces inherit it.
It is applied to the free position **and** to a past-the-snap offset: an offset is a dragged figure
too, and rounding only the position would have fixed half the problem and left the other half to be
rediscovered. Both halves are mutation-tested.

**Also observed, not fixed:** selecting a cabinet opens the Section tab, which *hides the viewport* —
so the act that attaches the gizmo is the act that hides it, and the gizmo is invisible until the 3D
subtab is clicked. That is stage-2 behaviour (`App` shows the viewport only while `selectedCarcase`
is null or the tab is 3D) and deliberate, but it makes the gizmo hard to discover. A design question
for whoever picks up placement next, not a defect in this stage.

### 2026-09-24 — the gizmo broke an e2e gate, and the one pixel that did it

CI went red on #51: `carcase.spec.ts:417` *"an opening selected in the tree lights its own parts in
3D"*, timing out in `pollHues` at **Gate 1** — *"no opening selected should paint no blue"*. It
failed on both runs and on retry, so not a flake, and it is this PR's.

**Diagnosed by measurement, after the first two theories were wrong.** The guess was that the
gizmo's blue Z arrow was being counted. It is not: `isSelectionBlue` is
`r > 40 && b > 120 && g*100 > b*75 && r*100 < b*55`, which wants a *cyan*, and the gizmo's blue is
`0x0000ff` where `r > 40` fails. The second guess — occlusion, then hue from the translucent plane
handles — was also wrong.

Reproducing locally and probing the failure screenshot with the matcher found the real cause:
**exactly one pixel**, at `(261,378)`, `rgb(63,165,136)` — the anti-aliased blend where the gizmo's
green and blue axes meet at its origin. It satisfies all four terms. Gate 1 asserted `blue === 0`,
so one pixel was enough.

**The fix, and why it is not a weakened test.** Gates 1 and 3 now bound the count below
`SELECTION_PIXELS` (400) instead of demanding exactly zero. The gate's claim — *nothing is
highlighted* — is unchanged, and so is its power: one opening lit measures 1759-1880 and an all-lit
viewport 6932, both far above 400. That was **verified rather than asserted**: the file's own named
mutation (light every part whenever a cabinet is selected) was applied and Gate 1 still failed under
the new bound. `=== 0` was only ever valid while the highlight was the single source of that hue;
the viewport now legitimately carries an overlay, and the gate is re-expressed against that.

Gate 3 needed the same treatment for a reason worth stating: deselecting a part does **not** close
the cabinet (`App` keeps it open deliberately), so the gizmo is still attached and still painting
its pixel.

**Process note.** The full e2e suite was run locally before pushing — 25 passed — rather than
pushing the one fixed test and letting CI find the rest. The gizmo overlays the viewport in every
test where a cabinet is selected, and several other specs sample canvas hues.
