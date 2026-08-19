# Cabinet Structure & Assembly Model — Implementation Notes

Living notes for `docs/superpowers/specs/2026-08-18-cabinet-assembly-design.md`.

## 2026-08-18 — spec decided, not yet implemented

### How this scope was arrived at

The session began as a full review of features, structure and plans. The user's opening answer to
"what is the next phase for?" was **all four** of depth / deliverables / strategy / hardening, with
the anchor stated explicitly: *"the cabinet structure or assembly method need to be added as an
important feature."* Asked which of four readings of "assembly" they meant, they again picked all
four. Both answers are recorded because they set the decomposition, not the scope: the work was
split into four dependency-ordered projects, and this spec is the first.

The ordering argument, kept here because it will be questioned again:

- Hardening a model about to be restructured is wasted work → D last.
- Drawing sheets want assemblies to exist, so a sheet is "of a cabinet" not "of board #7" → B after.
- Two of the strategy questions (file format version, where the free/paid line sits) are forced by
  this work anyway → C folded into this project's close-out rather than run separately.
- The one exception carved out of D: the WASM performance baseline is worth doing **before**, so it
  is possible to tell whether assemblies made rebuilds slower.

### Review findings that predate the feature

Found while grounding the spec, all documentation drift rather than product defects:

- `FILE_FORMAT_VERSION` is **10**. README, CLAUDE.md and `joinery_3d_software_plan.md` all say 2.
  The migration ladder in `useFile.ts:76-84` shows the path (v6→v7 half-lap, v7→v8 mortise-tenon,
  v8→v9 finger, v9→v10 tongue-groove) — the docs simply stopped being updated at Phase 0.5.
- "374 tests across 25 files" in the plan and README; actual is **59 test files** (53 unit + 6 e2e).
  `project-structure.html`'s autogen block says 52 and is dated 2026-06-13.
- CLAUDE.md's architecture tree predates the joint engine, the suggestion engine and the checklist
  entirely, and describes `Scene` as parts + materials + hardware — it has carried `joints` since v6.
- **Strategic, not cosmetic:** the plan (§4) places mortise & tenon, box/finger and lap joints in
  the *paid* Premium Joint Library Pack. Three of the five shipped joints are therefore on the paid
  side of the project's own free/paid line, while the free-tier v1 list (butt/screw, dowel joint,
  biscuit, pocket hole, cope-and-stick, bridle) is entirely unbuilt. Not this spec's problem to
  solve, but it should not stay unrecorded.

Docs re-baseline is phase step 10 rather than a prerequisite, on the grounds that the tree, the
`Scene` shape and the file version are all about to change again.

### Why role-key reconciliation rather than regenerate-from-scratch

The obvious implementation of a live generator is to delete the carcase's parts and emit a fresh set
on every parameter change. Rejected for two independent reasons:

1. **It defeats the geometry cache.** `shapeKey()` keys `geometriesRef` by part id; fresh ids on
   every keystroke in a dimension field means a full OCCT rebuild of every board in the carcase per
   edit. Role keys keep ids stable, so changing `fixedShelves` 2 → 3 rebuilds one shelf.
2. **It has nowhere to put detach.** The `driven | detached` contract needs a per-part identity that
   survives regeneration. The role key *is* that identity.

The load-bearing rule is the last row of the reconciliation table: a part whose role the parameters
no longer imply is deleted **only if driven**. A detached part is kept and re-parented as a plain
child. Anything else means a parameter change can destroy work the user explicitly claimed.

### `resolveWorldMatrix` identity is the migration's safety property

`resolveWorldMatrix(part)` for `parentId: null` must return exactly `composeWorldMatrix(part)`. That
is what allows phase steps 1–2 to land with every existing test unchanged and no behaviour
difference, before any feature rides on the tree. If that identity ever needs a caveat, the
migration stops being safe and the phasing needs rethinking.

### `worldAabb` memoization needs more than object identity now

Recorded because the existing memo looks like it survives this change and does not.
`geom/halflap.ts` caches world AABBs in a `WeakMap` keyed on the part object, safe today because
parts are stored immutably so an edit yields a new object. Once transforms compose through
ancestors, the cached AABB also depends on ancestor position/rotation — and moving a component does
**not** produce new part objects. The spec's resolution is to store the resolved matrix alongside
the AABB and recompute on mismatch. Flagged as a likely source of a subtle stale-geometry bug if
implemented carelessly.

### Shelf pins are the performance risk, and it is a data-model problem

~480 boolean subtractions per regeneration for six cabinets with two hole rows per side. Modelling a
hole row as N `BoxCut`s would be the natural extension of what exists and is the wrong answer: the
fix belongs in the cut vocabulary (`HoleArrayCut`, one cut → one boolean against a compound of N
cylinders), not in worker-side batching, because `shapeKey` and the drawing builder both need to see
a row as one thing too.

### The joint checklist would drown on the first real kitchen

A 7-part carcase yields ~12 touching pairs, all jointed the instant the cabinet is created. Six
cabinets ≈ 72 always-green rows. The 2026-08-17 checklist work measured a 7-board carcase at 12
actionable rows and judged `MAX_ACTIONABLE_ROWS = 200` comfortable — that headroom assumed *one*
carcase. Grouping by owning component (collapsed when complete) is in this slice rather than
deferred, because the checklist shipped four days ago and would become unreadable the day cabinets
land.

### Structural work taken on deliberately

Two items that are not strictly the feature but are caused by it, included per the repo's "improve
code you are working in, don't refactor what you aren't" rule:

- `sidebar.tsx` is 1118 lines (`EditPanel` 494–813, `Sidebar` 815–1118). A tree and a carcase
  parameter form would push it past 1500. `EditPanel` moves to its own file mechanically, in its own
  commit; the new UI lands in new files.
- `App.tsx` threads seven `*Active` booleans into `Sidebar`, all derived from `mode.activeMode` two
  lines above. This work would add an eighth. Pass `activeMode` instead.

## Open

- Unobserved, as with the checklist before it: the detach interaction is designed from the Workflow C
  narrative in the strategic plan, not from watching anyone use the app. Whether "Change the cabinet
  / Detach this part" is the prompt a woodworker wants at that moment is untested.
- `dividers: number[]` as fractions of width is a guess at the right parameterisation. Absolute
  offsets may read better to a cabinetmaker. Worth settling against a real preset before step 4.
- Face-frame is out of v1 on the argument that frameless dominates the Australian market. That is
  the plan's stated first market (§22 Q4), not a validated user finding — it is still an open
  question in the plan itself.

### Caught in spec self-review

- **Cut ownership was ambiguous.** The first draft gave `HoleArrayCut` a `sourceJointId`, which is
  wrong: shelf-pin rows come from the carcase directly, not from a joint. So does the toe-kick
  notch on a `BoxCut`. Added `sourceComponentId?` to both, with the ownership rule stated
  explicitly — `reconcileJoints` strips `sourceJointId` cuts, `regenerateComponents` strips
  `sourceComponentId` cuts, and a cut with neither is hand-made. Without that split, the generator
  and `reconcileJoints` would each be entitled to delete the other's cuts.
- `role?: string` was used by the reconciliation table but never declared in the type additions.
- `pitch: 32` typed as a literal rather than `number` now says why in the type: 32 mm is the system,
  not a preference. Left as a literal deliberately; if a 25 mm variant is ever needed it is a type
  widening, not a redesign.

## 2026-08-18 — plan written

`docs/superpowers/plans/2026-08-18-cabinet-assembly.md`. Ten phases, 33 tasks, 211 checkbox steps.

### Caught in plan self-review

- **The toe-kick notch had no task.** The spec names it as the motivating case for
  `sourceComponentId` on `BoxCut`, but the first draft of the role table ran the side panels full
  height and emitted a toe-kick rail without notching the sides — which would have blocked the toe
  recess with the sides themselves. Added as Task 4.6, and with it the test that matters more than
  the notch geometry: a side panel must end up carrying **both** a `sourceComponentId` cut and a
  `sourceJointId` cut, proving the two pipeline stages do not strip each other's work.
- **`faceDrillAxis` / `stepVector` were described rather than written.** Now written out. Chose to
  duplicate six lines rather than widen `faceAxes` in `snapMath.ts`, which returns THREE-typed axes
  for a different purpose; the duplication is bounded by a total function over six faces.
- **Four test fixtures were named but never defined** (`sideWithPins`, `partsTwoCabinetsTouching`,
  `twoIdenticalSidesInDifferentCabinets`, `partsWithTwoLooseBoards`). All now built by calling
  `regenerateComponents` on a preset, so the fixtures are the real generator output rather than
  hand-stitched geometry that could drift from it.

### Panel orientation was derived, not guessed

`orientedPanel` needs three rotations, one per thickness axis. They were solved algebraically against
`composeWorldMatrix`'s `R = Rx·Ry·Rz` convention rather than picked by trial:

- thickness on **z** → `(0, 0, 0)`
- thickness on **x** → `(0, 90, 90)` (board x→carcase y, y→z, z→x)
- thickness on **y** → `(-90, 0, -90)` (board x→carcase z, y→x, z→y)

Both non-trivial rotations map all three board axes onto carcase axes **positively**, which is why
`position` is always the box's min corner with no compensation term. That property is worth keeping
if the table is ever extended — a negative mapping would need an offset and would be easy to miss.

**The tests assert world AABBs, not rotation triples.** An equivalent Euler triple still passes; a
wrong one cannot. Recorded because the temptation on a red test will be to compare rotations.

### Phasing property worth preserving

Phases 1 and 2 are pure refactors: after each, the full suite passes **with no edited expectations**.
The plan states that explicitly as the pass condition, because "I had to update some tests" during
those two phases is the signal that the `resolveWorldMatrix` ≡ `composeWorldMatrix` identity for
top-level parts has been broken, and that identity is what makes the whole migration safe.

### Deliberate scope limit inside the plan

Joint emission covers `dado-rabbet` and `finger` only. `dowel`, `butt-screw` and `confirmat` are
fastener methods whose geometry is hardware, so they emit no joints and their pairs read as open on
the checklist. This is stated in Phase 7 and in the phase's verification list so it is not mistaken
for a bug.
