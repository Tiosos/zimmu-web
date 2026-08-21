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

## 2026-08-19 — Phase 1 shipped

Three tasks, all TDD, subagent-implemented with review gates. Commits `e469702`, `5054e4e`, `8b69564`.

**Phase 1's contract held:** 778 → 793 passing tests, and the +15 are *only* the new
`componentTree` (11) and v11 migration (4) tests. No existing expectation was edited, and all 8
Playwright specs pass against the live app. That is the evidence the phase changed no behaviour,
which is what licenses Phase 2 to move world-transform resolution underneath everything.

### The `undefined` vs `null` parentId trap

Task 1.1 widened `Part` with `parentId: ComponentId | null`, but `parseFile` did not yet populate it
— so for two commits the type system asserted something untrue: a v10 file deserialised into parts
whose `parentId` was `undefined`, a value the declared type does not admit.

Nothing broke, and the analysis of *why* is worth keeping because it is nearly a false reassurance:
`promoteOrphans`'s `dangling()` tests `parentId !== null`, so `undefined` is read as "not dangling"
and left alone — correct, since `undefined` means top-level anyway. `ancestorsOf` loops on
`while (parentId !== null)`, so `undefined` *enters* the loop, misses in `byId`, and breaks on the
falsy-parent guard — returning `[]`, again correct. Both paths are right **by coincidence, not by
design**. Phase 2 walks these chains with `=== null` root checks, where the same coincidence would
have produced a silent geometry-placement bug rather than a crash.

Fixed the way it should be: normalised once at the single deserialisation boundary
(`useFile.ts:64,72`), not by scattering `?? null` through consumers. The rule to keep: **when a type
claims an invariant the loader does not enforce, fix the loader, not the readers.**

The guard test is deliberately stronger than the plan asked for — it asserts own-property presence
via `hasOwnProperty` (so "key absent" and "key present but undefined" are distinguishable, which
`toBeNull()` alone cannot tell apart), covers the board *and* cylinder mapper branches, and was
mutation-verified by deleting the default from one branch and watching it fail.

### Open — a component cycle in a hand-edited file still loads

`promoteOrphans` repairs *dangling* parentIds only. A file whose components form a cycle among ids
that all exist passes the loader untouched, and then `ancestorsOf` throws its max-depth error at
render time. `wouldCycle` guards the UI reparent path, so this is only reachable via a corrupted or
hand-edited file. Candidate for a load-time guard in Phase 2 — noted rather than fixed, because
Phase 1's contract is that it changes no behaviour.

### Two plan defects found by implementers

- **Off-by-one test count.** Task 1.2's snippet has 11 `it` blocks; the plan said 10. Left alone,
  every later task quoting a running total inherits the error and a future implementer "fixes" a
  phantom missing test. Corrected in the plan (`9e16aa1`).
- **A plan snippet that was not Prettier-clean** (a 5-name import at 108 chars). Written via heredoc
  the format hook never fires, so the first Write/Edit of that file would produce a spurious diff.
  Plan snippets now carry the wrapped form.

### Out-of-scope churn caught at review

Task 1.1's commit had reformatted `src/geom/mesh.ts` — a Prettier reflow of a file the task never
needed to touch. Reverted and amended before push. Worth a standing note for the remaining phases:
the Prettier hook will reformat whatever it is pointed at, so `git status --short` before every
commit, and revert anything the task did not intend. In a phase whose entire claim is "nothing
changed", unrelated churn is not cosmetic — it destroys the diff's evidentiary value.

### Environment note

The repo's `PreToolUse` hook matching `Bash(git commit *)` appears to over-match compound and
multi-line bash (a `for` loop, an `xargs`, a heredoc `cat` all triggered it), and because it runs
`pnpm typecheck` it hard-fails those commands while a wide refactor is mid-flight and red. Not
caused by this work, but Phases 2 and 4 are broad refactors and will hit it again.

## 2026-08-19 — Phase 2, Task 2.2 (`worldAabb` memo revalidation)

### The `byId` thread reaches further than the plan listed

The plan named `halflap.ts` and `suggestJoints.ts` as the call sites. The real transitive closure of
a required `byId` parameter on `worldAabb` is 9 production files:

`halflap.ts` → `suggestJoints.ts` + `dado.ts` (`deriveJoint`) → `reconcileJoints.ts`,
`suggestionOutline.ts`, `jointChecklist.ts` → `App.tsx`, `SceneSuggestionsPanel.tsx`,
`JointsPanel.tsx`.

It terminates cleanly, and that is the useful part: every leaf already holds a whole `Scene`, so no
caller had to grow a prop. `reconcileJoints(scene)` builds the map itself from `scene.components`;
the three React callers build it from `scene.components` too. Nothing was threaded through
`useScene`. Plus 6 test files, all call-site-only edits.

Not made optional with an empty-map default, deliberately: a defaulted `byId` would let a nested
part resolve as if it were top-level — silently wrong geometry, which is the exact failure this task
exists to prevent. A required parameter makes every new call site state which tree it means.

### Comparing the matrix by value is load-bearing, not a micro-optimization

The obvious cheap invalidation — store the `byId` map (or the ancestor component) and compare by
reference — passes the "ancestor moved" test and still destroys the memo. `componentsById` builds a
fresh `Map` on every render and the scene replaces component objects on every edit, so a reference
check misses every time and the WeakMap degenerates into a per-call recompute across the checklist's
two O(n²) pair walks. Pinned by `halflap.test.ts` → "holds the cache across a structurally equal but
freshly built tree", which was verified to fail against a reference-comparing implementation.

### An incomplete test mock only now became load-bearing

`src/App.test.tsx` had one `useScene` mock whose `scene` omitted `components` (the other one has it).
Nothing read the field until this task, so it passed. Filling it in is fixture completion, not an
expectation change — but it is a reminder that a partial mock of `Scene` hides a whole phase's worth
of breakage until the first reader appears.

## 2026-08-20 — file-list audit over Phases 3-10

Run after Phase 2's consumer list turned out to be 11 files rather than the 6 the plan named — the
third under-count in one phase. The question was whether the same scoping error repeats downstream.

**It mostly does not.** Phases 3, 4 and 7 audit clean. Two phases had a single missed file each. One
phase had a problem worse than a missed file.

| Phase | Planned | Actual | Verdict |
|---|---|---|---|
| 3 — selection model | 3 files | 4 production | Sound (see below) |
| 4 — regeneration pipeline | 4 `reconcileJoints` sites | 4 | Accurate |
| 6 — detach prompt | `EditPanel` | + `DowelCutsPanel` consumes `onUpdate` | Noted |
| 7 — checklist grouping | 2 files | 2 | Accurate |
| 8 — hole arrays | 4 files | **discovery mechanism unsound** | Amended |
| 9 — cutting list | 2 files | + `BomModal` calls `groupParts` | Amended |
| 10 — docs | n/a | n/a | n/a |

### Phase 3's containment was a good decision, and the audit proves it

Ten files mention `selectedId`. Only four are real consumers. The reason is the plan's choice to keep
`selectedId` as a **derived** field on `UseSceneResult`:

```ts
const selectedId = selection?.kind === 'part' ? selection.id : null
```

`suggestJoints.ts:368` takes `selectedId` as a parameter and never learns the selection model changed.
`HardwareTab.tsx` has its own unrelated local `selectedId` `useState` for hardware rows — a name
collision, not a consumer at all. Widening the state while preserving the old projection is what keeps
this phase from touching six extra files, and it is worth reusing whenever a state shape widens.

### Phase 8: the compiler will NOT find every CutDef discrimination site

The most valuable finding, and it contradicts what the plan told the implementer to do. Widening
`CutDef` with `HoleArrayCut` produces two failure shapes and only one of them errors:

```ts
// utils.ts:9-11 — property access in the else branch. TS ERRORS: c.end is not on HoleArrayCut.
c.kind === 'box' ? `b:…` : `m:${c.end}|${c.axis}|${c.angle}`

// drawing.ts:261-262 — filter with a type predicate. TS IS SILENT.
const boxCuts = p.cuts.filter((c): c is BoxCut => c.kind === 'box')
const mitres  = p.cuts.filter((c): c is MitreCut => c.kind === 'mitre')
```

The second compiles clean and silently drops hole arrays from both lists. The symptom would be shelf-pin
rows that never appear in a shop drawing, with no error anywhere — found by a user, not by CI.

Task 8.4 happens to cover `drawing.ts` by intent, so this specific instance was already handled. The
defect is the **method**: Step 4 told the implementer to run `pnpm typecheck` and fix what it flags,
which would have left any filter-shaped site undiscovered. Step 4 now requires enumerating all 15
production files that mention `'box'`/`'mitre'` and triaging each into construct /
discriminate-by-property / discriminate-by-filter, treating typecheck output as a subset of the work
rather than the whole of it.

**General lesson: a discriminated union is only as exhaustive as the shape of the code reading it.**
`switch` with a `never` guard is checked; a ternary's else-branch is checked only if it touches a
member-specific property; a `filter` predicate is not checked at all.

### On the scoping method itself

Three under-counts in Phase 2 and two in Phases 3-10 share one cause: the lists were written by
grepping for direct consumers of the symbol being changed, which finds the first ring and misses the
ring above it. `worldAabb` → `suggestJoints` was obvious; `suggestJoints` → `jointChecklist` →
`SceneSuggestionsPanel` was not. For any future signature change, the list should be built by
following the compiler out to a fixpoint on a scratch branch, not by grepping once.

## 2026-08-20 — Task 2.4: the viewport, and the frame mismatches it exposed

### The viewport needed a different edit from the other 24 call sites

`viewport.tsx` never called `composeWorldMatrix`, so the grep that built Phase 2's consumer list
missed it entirely. It set `mesh.position` / `mesh.rotation` straight from the part, which is the
same composition written a different way. It is now placed by `mesh.matrix.fromArray(resolveWorldMatrix(part, componentMap))`
with `matrixAutoUpdate = false`.

One non-obvious consequence of that flag: Three raises `matrixWorldNeedsUpdate` inside
`Object3D.updateMatrix()`, and `updateMatrixWorld()` only recomputes `matrixWorld` when that flag
is set or `force` is passed. With `matrixAutoUpdate = false` nothing calls `updateMatrix()`, so
every manual `matrix` write must raise `matrixWorldNeedsUpdate` itself or `matrixWorld` silently
keeps its previous value — and `matrixWorld` is what the raycaster reads to build a `FaceHit`.
Stale-matrix bugs here would look like "clicking a board picks the wrong face", not like a crash.
The three placement sites (mesh, edge lines, snap ghost) all set the flag.

An upside worth recording: because the raycaster derives `localHitPoint` / `localFaceNormal` by
inverting `mesh.matrixWorld`, those two fields become correct for nested parts for free, and every
consumer that reads only them (`useAddCut` and the dowel-cut tools) is already frame-correct.

### Frame mismatch: world-space FaceHits feeding parent-local part fields

Recorded, deliberately NOT fixed — it is outside Phase 2's no-behaviour-change contract.

`FaceHit.faceNormal`, `faceCenter` and `hitPoint` are **world** space (the raycaster builds them by
applying `mesh.matrixWorld`). `Part.position` and `Part.rotation` are **parent-local** as of Phase 1.
Three functions bridge those frames without converting:

- `computeSnapTransform` (`snapMath.ts:123`) mixes `sourceFace`/`targetFace` world data with
  `sourcePart.position`/`rotation` read as if world, and returns a `{position, rotation}` that
  `useSnap` (`useSnap.ts:93-96`) writes straight into `part.position`/`part.rotation`.
- `computeDowelSnapTransform` (`snapMath.ts:211`) does the same, landing on `targetFace.faceCenter`
  or `targetFace.hitPoint`.
- `computeFaceCorners` (`snapMath.ts:70`) composes a matrix from `part.position`/`rotation` alone,
  ignoring `parentId` — it is `composeWorldMatrix` inlined by hand, which is why the Phase 2 grep
  missed it too. Its corners feed the viewport's snap/hover `LineLoop`s and `suggestionOutline.ts`,
  all of which are unparented scene objects drawn in world space.

All three are correct **today** only because every part has `parentId === null`, which makes the
parent-local frame and the world frame the same frame. Once a part is nested under a component with
a non-identity placement:

- snapping a nested board would write a world position into a local field, so the board would jump
  by the component's transform (doubly displaced once the component transform is applied on render);
- its snap ghost, highlight loops and suggestion outlines would draw at the un-parented location,
  i.e. the preview and the result would disagree in the same way.

The fix belongs to a later phase and has a clear shape: convert the FaceHit world data into the
source part's parent frame before the math (or do the math in world and convert the result back
with the inverse of the parent chain), and give `computeFaceCorners` the `componentMap` so it goes
through `resolveWorldMatrix` like every other consumer. Both need `Part.parentId` to actually be
non-null somewhere before they can be tested, so they are gated on Phase 3.

`suggestJoints.ts` is already clear of this: `worldFaceNormal(part, face, byId)` (`suggestJoints.ts:135`)
takes the component map and resolves through the tree, and its synthetic hits set `faceCenter` and
`hitPoint` to zero rather than to an unresolved placement.

## 2026-08-20 — Phase 2 is complete by its stated test, and incomplete by its intent

Task 2.3b's success criterion was a command:

```
grep -rn 'composeWorldMatrix(' src/ --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v 'transform.ts'
```

It returns nothing. That is real and worth having — but it proves less than it appears to. Task 2.4's
implementer found `computeFaceCorners` (`snapMath.ts:101`) building
`new THREE.Matrix4().compose(position, quaternionFromEuler(rotation))` by hand: `composeWorldMatrix`
inlined, character for character, under a different name. Searching for it found the symbol's callers,
not the computation's.

A sweep for the computation rather than the symbol finds **seven** sites, none of which resolve
through ancestors:

| Site | Shape | Consequence once parts nest |
|---|---|---|
| `snapMath.ts:101` `computeFaceCorners` | full `Matrix4.compose` | face-highlight loops and `suggestionOutline` draw at the un-nested pose |
| `snapMath.ts:129` `computeSnapTransform` | rotation quaternion | snap target computed from the wrong orientation |
| `snapMath.ts:218` `computeDowelSnapTransform` | rotation quaternion | same, for dowels |
| `dado.ts:45` `localDirToWorld` | rotation quaternion | face direction wrong ⇒ groove cut on the wrong side |
| `mortisetenon.ts:39` `localDirToWorld` | rotation quaternion | same |
| `tonguegroove.ts:40` `localDirToWorld` | rotation quaternion | same |
| `fingerjoint.ts:40` `localDirToWorld` | rotation quaternion | same |

All seven are **correct today** — every part is top-level, so the ancestor product is the identity —
which is why the full suite and all 8 e2e specs pass. They become wrong the moment Phase 3 lets a user
nest a part, and they fail silently: geometry lands in a plausible-but-wrong place rather than throwing.

Note the four `localDirToWorld` copies are in the four modules Task 2.3a migrated. That task replaced
every `composeWorldMatrix(` call in those files and left a private function computing the rotation half
of the same thing three lines above. The grep was satisfied; the file was not.

**Recommendation: a Task 2.5 before Phase 3 starts.** It is behaviour-neutral under the same
conditions as the rest of Phase 2, so it verifies identically — unit counts unchanged, e2e green — and
doing it now keeps the "no behaviour change" evidence available. Deferring it means Phase 3 ships
nesting on top of seven known-wrong paths, and the first symptom is a misplaced dado in a cabinet
rather than a test failure.

The natural shape is `localDirToWorld(part, dir, byId)` delegating to a shared helper in
`transform.ts` (the four copies are identical), and `computeFaceCorners` / the two snap transforms
taking `byId` and calling `resolveWorldMatrix`.

### The generalised lesson, third instance

This is the same failure mode as the Phase 8 audit finding, in a different costume:

- A **`filter` with a type predicate** silently drops a new union member — the compiler is blind to it.
- A **hand-inlined computation** silently keeps the old semantics — a symbol grep is blind to it.

Both look complete by the check that was chosen. For a migration, the check has to target the
*semantics* being migrated, not the name they happen to be spelled with. The cheap version: before
declaring a symbol migration done, grep for the two or three distinctive lines of the symbol's own
body, not just its name.

## 2026-08-20 — Task 2.5a: five of seven hand-inlined sites closed

| Site | Status |
|---|---|
| `dado.ts:45` `localDirToWorld` | ✅ deleted, delegates to shared helper |
| `mortisetenon.ts:39` `localDirToWorld` | ✅ |
| `tonguegroove.ts:40` `localDirToWorld` | ✅ |
| `fingerjoint.ts:40` `localDirToWorld` | ✅ |
| `snapMath.ts:101` `computeFaceCorners` | ✅ uses `resolveWorldMatrix` |
| `snapMath.ts:134` `computeSnapTransform` | ✅ Task 2.5b |
| `snapMath.ts:223` `computeDowelSnapTransform` | ✅ Task 2.5b |

All four copies hashed identically (`d0bd753…`) — no divergence had crept in, which is mild luck given
they were copy-pasted four times.

### `localDirToWorld` returns `Vec3`, not `THREE.Vector3` — and that was the interesting call

The obvious implementation returns a `THREE.Vector3`, since all ~30 downstream uses want `.dot()` and
`.addScaledVector()`. That would have meant importing `three` into `transform.ts`.

Rejected, because CLAUDE.md describes `composeWorldMatrix` as "THREE-free, element-wise parity-tested
against `THREE.Matrix4`" — and **the parity test only means anything because the module derives the
matrix independently**. Importing THREE to build the thing you then compare against THREE would quietly
turn a real cross-check into a tautology. The four joint modules keep a 3-line `worldDir` adapter that
wraps the `Vec3`; the adapter carries no convention knowledge, so rotation order and ancestor
resolution still live in exactly one place.

Worth recording as a general shape: **a module kept free of a dependency on purpose will look like it
"just needs" that dependency the first time something convenient requires it.** Check why it was free
before adding it.

### A latent inconsistency the deletion removed

The four deleted copies passed `part.rotationOrder` into their Euler, while `composeWorldMatrix`
hardcodes XYZ. Harmless today — `rotationOrder` is the literal type `'XYZ'` everywhere — but the two
would have diverged the moment that literal widened, in opposite directions, in code that looks
identical. Consolidation removed a trap nobody had noticed.

### Scope, again

Nine functions and two hooks gained a `byId` parameter beyond the five named sites, all
compiler-forced pass-through. Notably `computeSnapTransform` now **already takes `byId` and only
forwards it** to `computeFaceCorners` — so Task 2.5b must consume the existing parameter rather than
add one.

Lint caught a real omission the tests did not: the viewport highlight `useEffect` needed `componentMap`
in its dependency array. A stale closure there would have frozen face highlights at the previous
tree — the kind of bug that survives a green suite and shows up as "the outline is in the wrong place
sometimes".

## 2026-08-20 — Task 2.5b: the snap transforms now round-trip through the parent frame

`grep -rn 'setFromEuler' src/geom/ src/scene/ --include=*.ts | grep -v '\.test\.'` now returns a
single hit — `localQuaternion` in `snapMath.ts`, which is by construction *one node's local*
rotation and is only ever consumed by `worldQuaternion`'s ancestor loop. No site left in `geom/` or
`scene/` builds a world pose from a bare Euler triple. That closes the seven-site finding.

### The bug had two halves, and only one of them was visible

`computeSnapTransform` read `sourcePart.rotation` (parent-local) into a variable commented "current
**world** rotation". That was the half everybody looked at. The other half was on the way out: the
function computes a world placement from world-space `FaceHit` data and returned it straight into
`part.position`/`part.rotation`, which are parent-local. Fixing only the input would have produced a
*more* wrong answer than leaving both broken, since the two errors partly cancel for a
translation-only ancestor. Both conversions had to land in the same commit.

Evidence of the partial cancellation: the "returns a parent-local placement, not a world one" test
(cabinet translated 500mm, no rotation) **passed against the unfixed code**. `computeFaceCorners`
already resolved through ancestors, so the `sourcePart.position + target − c` formula happened to
subtract the parent translation back out. Only the rotated-ancestor tests actually failed. A
translation-only fixture would have certified the bug as fixed.

### Why the round-trip is quaternion-side on the way in but matrix-side on the way out

The natural implementation resolves the incoming rotation with
`new THREE.Matrix4().fromArray(resolveWorldMatrix(part, byId)).decompose(…)`. It is correct, and it
shifts a top-level part's result by one ULP (`39.72128732801056` → `…57`), because
`Euler → quaternion` and `Euler → matrix → quaternion` are different code paths. Phase 2's contract
is that a top-level part behaves *identically*, so `worldQuaternion` composes ancestor quaternions
directly: with no ancestors the loop body never runs and the expression is literally the old one.

The way out can use the matrix, because `ancestorWorldMatrix` returns the exact identity for a
top-level node and `decompose` of the identity yields exactly `(0,0,0)` / `(0,0,0,1)`; inverting and
applying that perturbs nothing. Verified, not assumed: both functions have a test asserting `toBe`
(Object.is) against values captured from the pre-change implementation.

### `ancestorWorldMatrix` deliberately does not become the basis of `resolveWorldMatrix`

`resolveWorldMatrix(node) === multiplyMatrix(ancestorWorldMatrix(node), composeWorldMatrix(node))`
is now a test, but the refactor it invites was rejected. `composeWorldMatrix` emits `-0` for several
rotation entries (`r01 = -cy * sz` at zero yaw), and multiplying by the identity turns `-0` into
`+0` — which `toBe`/`Object.is` distinguishes. It would break the exact-equality test that pins
"top-level resolves to exactly `composeWorldMatrix`" for some inputs and not others.

### The nesting test asserts an equivalence, not an Euler triple

The obvious test — "snap a nested board, expect the same world pose as snapping the flat board" — is
wrong, and it took writing it to see why. Re-parenting a board under a yawed cabinet changes its
*world* rotation, and the roll-snap in step 3 deliberately preserves the part's existing roll to the
nearest 90°. So the world outcome legitimately differs. The test that means something is: snapping a
nested part must land in exactly the world pose that snapping an **unparented part at the same
resolved world pose** lands in. Nesting is then provably a no-op on the geometry, and the returned
Euler triple is never asserted directly — it is only defined up to equivalent representations.

## 2026-08-20 — Task 3.2, and an audit that erred the *other* way

Every previous scoping correction in this project was an under-count. This one was an over-count, and
the reason is worth keeping.

The audit predicted four consumer files for the selection widening: `useScene.ts`, `App.tsx`,
`viewport.tsx`, `sidebar.tsx`. The compiler named **three** source files — `types.ts`, `useScene.ts`,
`App.tsx`. `sidebar.tsx` and `viewport.tsx` never needed touching, because they declare their **own**
prop types (`onSelect: (id: PartId | null) => void`, `onPartClick: (id: PartId | null) => void`) that
are structurally decoupled from `UseSceneResult`. They consume a *shape*, not the hook's type.

So the audit counted **mentions of a name**, when what governs blast radius is **type dependency**.
That over-counts where props are locally typed and under-counts where a computation is inlined by
hand (the Phase 2 finding). Both errors have the same root: grep sees text, the compiler sees types.
The reliable method remains "change it and let `tsc` walk the graph", with greps used only to *predict*
effort, never to bound it.

### Widening those prop types would have been actively wrong

Had the implementer "completed" the migration by widening `Sidebar`/`Viewport` to speak `Selection`,
it would have cascaded to `useInteractionMode` and `useAddCut` (both declare their own
`onSelect: (id: PartId) => void`), and forced `sidebar.test.tsx`'s
`expect(onSelect).toHaveBeenCalledWith('board_t1')` to become an object literal — a changed **expected
value**, which the phase contract forbids. The narrow reading was also the correct one.

Containment instead lives in one adapter in `App.tsx`:

```ts
// The viewport and sidebar only ever select parts; components are addressed elsewhere.
const onSelectPart = useCallback(
  (id: PartId | null) => onSelect(id === null ? null : { kind: 'part', id }),
  [onSelect],
)
```

**`onSelectPart` is deliberately a stopgap.** Task 3.4 makes components selectable from the tree, and
at that point `Sidebar` should speak `Selection` directly and this adapter should disappear rather
than accumulate a second caller. Recorded so it is removed on purpose rather than surviving by
inertia.

### Confirmed, not assumed: deleting a selected part already clears the selection

`onRemove` has always done `setSelectedId(prev => prev === id ? null : prev)`, with an existing test
pinning it. No dangling-selection bug to fix. The new behaviour needed is the converse — a **component**
selection must survive the removal of a part — which is why every part-scoped clear is now
`prev?.kind === 'part' && prev.id === id ? null : prev`. Without the `kind` guard, deleting any board
would silently deselect the cabinet you were editing.

## 2026-08-20 — Task 3.4, the tree on screen

### `SceneTree` takes four props beyond the five the plan named

The plan's signature was `components / parts / selection / onSelect / onToggleVisible`. Implemented
verbatim, replacing the flat list would have **deleted** four things the flat list had: the ⚠ error
badge (with the OCCT message as its `title`), the ⟳ pending spinner, and the per-row Duplicate and
Delete buttons. Four existing `sidebar.test.tsx` tests pin exactly those, and `step-export.spec.ts`
/ `smoke.spec.ts` assert `⚠` has count 0 — an assertion that would have silently become vacuous
rather than failing loudly.

So `SceneTree` also takes `errors`, `pendingIds`, `onDuplicate`, `onRemove`, and part rows keep the
markup they had. The specified five props are unchanged; this is a superset, not a substitution.
Dropping a row affordance is a product decision, not a side effect of moving the list.

### Component visibility is a field, part visibility is an action

`onToggleVisible` on the tree takes a `Selection`, but `useScene` has no component-visibility action
and does not need one: a component's `visible` is just a field, so `App` toggles it through
`onUpdateComponent`. Parts keep `onToggleVisible(id)` because hiding a board is its own undo entry
with its own label.

**Known gap:** `viewport.tsx` reads `part.visible` only, so hiding a *component* currently greys its
row in the tree and persists to the file, but does not hide its parts in 3D. Resolving visibility
through ancestors is the same shape of change Phase 2 made for placement, and belongs with whatever
task takes it on — not smuggled into the tree.

### `onSelectPart` survives, deliberately, for the viewport only

Task 3.2 recorded the adapter as a stopgap to be deleted here. It is gone from the **sidebar** path:
`Sidebar` now speaks `Selection` end to end. It stays for `Viewport` and `useInteractionMode`, both
of which address parts by id because a mesh click can only ever land on a part and nothing
component-shaped is drawn in the 3D scene. Widening them would cascade into `useAddCut` for no gain.

### Changed expectations, and why each is legitimate

Phase 3 changes behaviour, so these are not regressions:

- `sidebar.test.tsx`: `expect(onSelect).toHaveBeenCalledWith('board_t1')` →
  `…toHaveBeenCalledWith({ kind: 'part', id: 'board_t1' })`, same for `onToggleVisible`. The sidebar
  now reports a `Selection`, which is the whole point of the task.
- `sidebar.test.tsx`: every `selectedId: 'x'` prop became `selection: partSel('x')`. Prop shape, not
  a changed expected value.
- `useScene.test.ts`: the component-coalescing test expected the pre-edit label `'Group'` and now
  expects `'Group 1'`, because `onAddComponent` numbers labels (B3).

### B4: the seven booleans went; the `tools` array did not

`activeMode` replaces the seven `*Active` booleans as required. The seven `onXToggle` callbacks
collapse to one `onSetMode`, and the five `*Status` strings to the existing `statuses` object from
`useInteractionMode` — 49 props down to 31, with every button's markup untouched.

The data-driven `tools` array was **not** built. The six buttons are not interchangeable: Add Cut is
a single-line `h-8` button with no status line at all, Snap derives its sub-label from `snapPhase`
rather than a status string, and only the five joint tools share the `status ?? fallback` shape.
Rendering them from one array means either three branches inside the map — no simpler than the JSX
it replaces — or flattening Cut and Snap into a shape they do not have, which is a visual change
smuggled in as a refactor. Phase 5's extra entry is a joint tool, so it can join the five without
the array existing.

### No UI entry point creates a component yet

The tree renders `scene.components`, but nothing in the sidebar calls `onAddComponent` — components
only enter a scene from a `.zimmu` file today. Adding a "+ Group" button was outside this task; it
belongs with the carcase-creation UI that needs it.

## 2026-08-20 — Phase 4: the role table was wrong three times, and how that was found

Tasks 4.1–4.4 landed the generator. Four defects surfaced, **all of them in the specification rather
than the implementation**, and the way each was found is the transferable part.

### The tests that found them checked the system against itself

Every assertion I wrote by hand compared a panel against numbers I had supplied — so my arithmetic
errors were baked into the code *and* its tests, and agreed with each other. The defects were found by
two tests that don't work that way:

- **Pairwise overlap** — no two panel AABBs may share volume. Solid objects don't interpenetrate, and
  no amount of consistent-but-wrong arithmetic satisfies that.
- **Feasibility, reasoning forward** — assert the generator's inputs leave room for what it must
  build, rather than backward from the rules that happen to exist.

| Defect | Found by | What it was |
|---|---|---|
| Infeasible test fixture (4.1) | implementer reading it | a thickness guard looping 3 axes against a box thin on 1 — no implementation could pass |
| No interior bay (4.2) | feasibility test | `H=130, KH=100, T=18` passed every rule, left −6 mm of bay |
| Divider × shelf (4.3) | overlap test | full-height divider vs full-width shelf: 18 × 548 × 18 shared volume, unfixable by arithmetic |
| Ladder inside carcase (4.3) | overlap test | prose said "frame *under* the carcase", formula left `floor` at 0 |
| Divider through side panel (4.3b) | **neither** | `dividers:[0.02]` → x[3,21] through a side at x[0,18]; `0 < d < 1` passed it |

That last row is the important one: the overlap test **structurally could not** find it, because no
fixture placed a divider near an edge. The fix was to assert the overlap property across *every
divider set the validator accepts*, not across a hand-picked list. **Fixture tests find the cases you
thought of; property tests find the ones you didn't.**

### Two rows were individually sensible and jointly impossible

Dividers ran the full internal height; shelves ran the full internal width. Each row read fine alone.
Reviewing rows one at a time cannot catch that class of error — only checking them against each other
can. Shelves are now emitted **per vertical bay**, and `fixedShelves` means shelves *per bay*, which is
what a cabinetmaker means by it.

### Clearing `role` is load-bearing, not tidying

The reconciliation table says a detached part whose role disappears keeps its part and "clears its
`role`". That reads like metadata housekeeping. It is **the only thing preventing a later
regeneration from reclaiming the part.**

**Invariant: a detached part must never carry a role key.** If someone later keeps the role "so the
user can see what it used to be", the detach guarantee silently breaks and exactly one test catches
it. Recorded here because the rule's importance is invisible at its call site.

### An accepted UX consequence, not a bug

Turn `hasTop` off with the top detached, then on again: the user gets their ex-top **and** a fresh
driven top, geometrically coincident. That follows from the table, and every alternative is worse —
reclaiming violates the contract, refusing to create leaves the cabinet topless for no visible reason.

But a checkbox toggled twice producing a duplicate board is a real outcome someone will hit. The
mitigation is UI, not geometry: **Phase 6 must make detached parts visually obvious**, or the
duplicate shows up first as a mystery line in the cutting list. Phase 3 left `data-driven` on tree
rows with no visual treatment; this is the reason to finish that.

### Judgement calls the table did not cover

- **`visible` and `cuts` survive regeneration** on a driven part, alongside id/colour/label. Hiding a
  board is a user action; wiping cuts would destroy the last-good cuts `reconcileJoints` deliberately
  preserves when `deriveJoint` returns null.
- **`material` is overwritten** — it is a carcase-level parameter, so a driven part cannot own it.
- **Colour is `PART_COLORS[roleIndex % 8]`**, deterministic so idempotence holds. Consequence: adding
  a divider shifts the colour of every shelf after it. Harmless; hash the role key instead if it ever
  grates.

## 2026-08-20 — Task 4.5: two owners of cuts, and a convention split worth knowing

The toe-kick notch is trivial geometry with a structural purpose: it is the first cut placed by a
**component** rather than derived from a **joint**, so two independent stages now write cuts onto the
same part.

| Owner field | Written by | Stripped by |
|---|---|---|
| `sourceJointId` | `reconcileJoints` | `reconcileJoints` |
| `sourceComponentId` | `regenerateComponents` | `regenerateComponents` |
| neither | the user, by hand | nobody |

**Neither stage may strip the other's cuts.** Audited rather than assumed: both filters in
`reconcileJoints.ts` test `sourceJointId` specifically (`c.sourceJointId !== undefined && !jointIds.has(...)`
and `c.sourceJointId === joint.id`), never a bare "has an owner" check, so a component-owned cut
short-circuits out of both. No defect found; the file was not modified.

The test that matters is not the notch geometry — it is the one asserting a side panel ends up
carrying **both** kinds of cut after the real pipeline order (`regenerateComponents` then
`reconcileJoints`), plus a hand-made cut owned by nobody. It is deliberately non-vacuous: the injected
joint cut is `cut_stale`, and the post-reconcile assertion demands `cut_j1` — the id
`computeDadoGroove` mints — so it only passes if `deriveJoint` genuinely re-derived the groove through
the strip-and-scatter path while the notch rode through untouched.

### The codebase now has two conventions for a through-cut

Worth recording because both apparently work, and a future reader will find the disagreement:

- **`computeFingerSlots` (`geom/fingerjoint.ts`)** — exactly coplanar: `position.z = 0`,
  `size.z = dim.z`. The tool's faces sit precisely on the part's faces.
- **`carcaseCuts` (the toe-kick notch)** — overshoots: `position.z = -T/2`, `size.z = 2T`, straddling
  both thickness faces.

Coplanar boolean faces are classically unreliable in OCCT, which is why the notch overshoots. But the
finger joint has shipped and works, so this is not a live bug — it is an undocumented divergence. Not
unified, because changing working joint geometry without evidence of a defect is churn; recorded so
that whoever *does* hit a ragged boolean knows both conventions exist and which one is defensive.

Related and also left alone: the notch's `x = 0` and `y = 0` tool faces **are** coplanar with the
panel's `-X` end and `-Y` edge, because overshooting there would break the "sized to setback × kick
height" contract. If the notch ever renders ragged at the front-bottom corner, that is the first place
to look.

## Task 6.2 — two defects the unit tests structurally could not see

### `sceneRef` is one render behind, so detach-then-edit undid the detach

`EditPanel.detachAndApply` originally called `onDetachPart(id)` and then
`onUpdate(id, ...)` from the same click handler. Every `useScene` mutator reads its `before`
from `sceneRef.current`, which a `useLayoutEffect` only refreshes **after** render. So the second
call read a scene in which the part was still `driven` with its `role` intact, took the
`needsPipeline` branch, and regenerated the detachment away. The user's edit landed on a part that
the cabinet immediately reclaimed — the detach button did nothing at all.

Both unit tests passed throughout. `useScene.test.ts` only ever called `onDetachPart` alone, inside
its own `act()`, so the ref was always current. `EditPanel.test.tsx` mocked both callbacks and
asserted only that each was called — a mock cannot express "the second call reads state the first
one wrote." **Neither test was wrong; the bug lived in the seam between them**, and only the e2e
exercised the two real implementations in one tick.

Fixed by making the operation atomic rather than by chasing ref staleness:
`onDetachPart(id, updater?)` applies the updater and clears `driven`/`role` in a single
transition, with a single history entry. That also fixes an undo bug nobody had noticed — the old
two-call form pushed two entries, so one Ctrl+Z left the part detached at its new size.

The general hazard remains: *any* two `useScene` mutators called from one handler have this
problem. Not fixed globally, because making `sceneRef` write-through would put it out of step with
the `setScene((prev) => …)` functional-updater call sites. Recorded so the next person composing
two mutators knows to fold them into one instead.

### The edit panel collapsed the scene tree to zero height

With a cabinet selected, the sidebar's fixed stack of seven joint buttons plus an unbounded
`EditPanel` consumed the whole 720px column, squeezing the `flex-1` ScrollArea to nothing. The e2e
failed with "subtree intercepts pointer events" — the tree row was technically in the DOM and
"visible" to Playwright, but had no space to be clicked in.

This is the same shape as the Task 5.2 CarcasePanel finding, and the second time a pure-layout
defect has been invisible to jsdom: happy-dom has no layout engine, so a panel covering a tree is
literally unrepresentable in a unit test. **Sidebar height budget is e2e-only territory.**

Fix: `max-h-[55%] overflow-y-auto` on the EditPanel root (bounded, but *not* `shrink-0` — it must
still yield), plus `min-h-32` on the ScrollArea so the tree keeps a floor. Note the asymmetry with
CarcasePanel, which does carry `shrink-0`: only one of the two panels is ever mounted, so they do
not compete, but a future third panel would need the same "bounded and shrinkable" treatment.

## Phase 7 — the plan's joint table was re-derived before a line was written

The plan asserted a joint table and a `12 / 12` headline from reasoning alone. Probing the running
generator (regenerate a preset, run `boardsTouch` over every board pair, then `buildJointChecklist`)
showed four things wrong at once:

- **A Base 600 has 14 touching pairs, not 12.** The panel would have read `12 / 14`, and no test in
  the plan would have noticed, because every one of them asserted against the number 12.
- **Dividers are never housed in the sides.** A divider spans `bayZ0 → innerTop` at `x ≈ W·d`; the
  sides are nowhere near it. It is housed in the bottom and the top. Confirmed by the probe:
  `bottom↔divider-0`, `top↔divider-0`, and no side pair at all.
- **A shelf is housed in its bay's edges, not in both sides.** With one divider the probe reports
  `left-side↔shelf-0-0` and `right-side↔shelf-1-0` — each shelf meets one side and the divider.
  With no dividers there is one bay and both edges *are* the sides, which is exactly why the wrong
  rule looked right.
- **`back` housing `bottom`/`top` is inverted.** The back's `z0 = bayZ0 = floor + T` — it sits *on*
  the bottom panel and *under* the top, so those two house it.

Two more gaps: `JointDescriptor` carried no faces, so it could not have been passed to
`defaultDadoJoint` (which needs `housingFace`, `housedEnd`, and a `byId` map) or `defaultFingerJoint`
(`endA`, `endB`) — the plan would have failed at its own step 3. And `buildJointChecklist` already
takes four arguments, not the two the plan claimed; its proposed replacement signature dropped
`suggestions`, which supplies every row's `options`.

### Two decisions taken with the user

**Contact pairs are declared, not jointed.** `bottom↔toe-kick` and `back↔shelf` touch but are not
joinery — a shelf stops at the back, it is not housed in it. Rather than emit dados nobody would cut
(`14 / 14`) or leave the cabinet permanently incomplete (`12 / 14`), the carcase declares those pairs
deliberately unjointed and the checklist renders them muted, excluded from the count. Deliberately a
**new `'contact'` state rather than reusing `'no-offer'`**: no-offer means the engine has nothing to
propose, whereas here it proposes a dado and the carcase declines it. Same muted styling, different
fact — collapsing them would have hidden the distinction behind identical pixels.

**Finger joints only at flush corners.** A toe kick insets the bottom to `z ∈ [KH, KH + T]` while the
sides run to the floor, so only the two top corners are true corners. The suggestion engine already
refuses to offer `finger` for the inset pairs — the plan's "always four" would have emitted two joints
the panel would never have proposed, a disagreement between generator and UI over the same pair.

### The transferable bit

Every one of these was found the same way: **by asking the running system what is true instead of
asking myself.** The probe was fifteen throwaway lines. The plan's own tests could not have found any
of it, because they asserted the numbers the plan had already assumed — the same failure mode as
Task 4.3's role table, now three phases running. The corrected Task 7.1 therefore leads with a test
that checks each emitted face against the parts' actual positions (a housing face must point *at*
what it houses) and one that demands joints ∪ contact pairs equals the measured touching set — both
check the system against itself rather than against a table I wrote.

## 2026-08-21 — Task 7.1 implemented (`carcaseJoints`, `carcaseContactPairs`)

The two self-checking tests were written first and both agreed with the corrected Phase 7 tables:
the measured touching sets (14 / 11 / 20 pairs) split exactly as 12 + 2, 10 + 1, 16 + 4, and every
emitted face passes the "housing face points at what it houses" check. No further correction was
needed — the first phase in four where the plan's table survived contact with the geometry.

The self-check earns its keep: mutating any single face letter, or reverting any of the three rows
the plan had corrected (sides housing dividers, shelves housing in both sides, back housing the
bottom), makes it fail. Verified by mutation, not by reading.

- **Fastener methods emit no joints.** `'dowel' | 'butt-screw' | 'confirmat'` return `[]` from
  `carcaseJoints`; their geometry is hardware, and this slice does not model it. Contact pairs are
  emitted regardless — a shelf abuts the back whatever holds the cabinet together.
- **One face rule, not ten.** Sides and dividers are both thickness-on-x panels, so every housing in
  the table reduces to: an edge facing carcase +x presents board `+Z`, and the panel it houses meets
  it with its own `-X` (thickness-on-z: bottom, top, shelf) or `-Y` (thickness-on-y: back, toe kick).
  The plan's ten-row face table is that rule enumerated.
- **`bayEdges(p)` is now a shared module-private helper** used by both `carcaseRoles` and
  `carcaseJoints`, so bay layout cannot desynchronise between the role table and the joint table.
- **Known gap: a ladder base is not jointed.** `baseMode: 'ladder'` adds four rails and 14 touching
  pairs (rail↔rail, rail↔side, rail↔bottom) that Phase 7 never enumerated, so a ladder cabinet will
  read `10 / 24` rather than complete. Every other mode is exact — including `legs`, `applied` and
  `none` backs, and `hasTop: false` — measured the same way as the three headline presets. Left as a
  gap deliberately: inventing a rail joint table here would be the same reasoning-not-measuring
  mistake this phase exists to correct.
