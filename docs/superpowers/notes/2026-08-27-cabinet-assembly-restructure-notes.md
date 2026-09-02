# Cabinet assembly restructure — implementation notes

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`
**Plan:** _(staged; written per stage)_

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered while designing, and anything that would surprise a future reader.

## 2026-08-27 — the design session

### The scope tripled twice, and both times for a good reason

The session opened as "suggest the next step" and landed on doors and drawer fronts, scoped to
"fronts plus their machining" — one spec, self-contained in a new module beside `carcaseRoles.ts`.
A full design section was written and approved on that basis.

The user then asked for the Cabinet Vision assembly method, which invalidated it: fronts are not a
parameter beside `dividers`, they are leaves of the same tree that *creates* the dividers. Then a
second round added per-part materials driving geometry, per-face joint overrides, screw fixing as the
default, and a five-subtab cabinet editor.

The first design is not in git; it was superseded in conversation. Recording its shape here because
someone will reasonably ask why the spec does not simply add a `fronts: FrontSpec[]` array beside
`dividers` — it did, and the answer is that two systems would then describe the same divisions.

### Four decisions went against the recommendation

Recorded because each carries a cost that will look like an oversight later:

- **Adjustable shelves are per-section in full**, not "count per section, geometry per cabinet". Every
  section therefore repeats `pitch`, `setback`, `backSetback` and `rows`. Mitigated by seeding new
  sections from the preset — the same pattern used for the front material — but a job that wants one
  pin setback everywhere has to set it everywhere. The alternative was rejected explicitly.
- **Carcase-side screw rows are generated now**, not deferred with the hardware model. The concern
  raised was that plate and slide geometry varies by manufacturer and nothing in the data model can
  yet record whose hardware a cabinet is built for. The user chose to generate them anyway; the
  mitigation is that every figure is a named constant in one module, explicitly marked as superseded
  by the hardware design. If those constants are wrong for a given shop, one file is wrong, not the
  generator.
- **Grain runs vertical on every front**, including drawer fronts. The common convention runs a
  bank of drawer fronts horizontally so they read as one board. Vertical throughout is simpler and
  matches the doors beside them; it will nest differently, because grain fixes `allowedRotations`.
- **The scene tree mirrors the section tree** rather than showing a Box group and a Fronts group.
  The concern was that a partition belongs to a split, not to either child. That was resolved rather
  than ignored — divisions are listed under the section whose split created them — but the tree is
  now as deep as the cabinet is subdivided.

### Three things turned out cheaper than expected

All three were checked against the code, not reasoned about:

- **A manual joint override needs no new concept.** Every member of the `Joint` union already carries
  `driven: boolean` and `sourceComponentId?`. `regenerateOne` today replaces every joint matching its
  component id unconditionally; respecting `driven: false` is one line, and mirrors exactly how a
  detached part is protected. The design very nearly invented a `part.overrides.joints[face]` map
  before this was checked.
- **Fronts need no special-casing in the joinery extension pass.** `carcaseRoles` extends panels by
  iterating `carcaseJoints`' descriptors. A front appears in no descriptor, so `extendToward` never
  reaches it. A front is a box no joint mentions, and it passes through face-to-face sized with no
  guard.
- **"Grain vertical on every front" collapses to an existing branch.** Fronts are thickness-on-y
  panels, exactly like `back`, and `grainAxisOf` already returns `'z'` for `back`. Fronts join that
  line verbatim; `grainFieldFor('y','z')` resolves to `'length'` through the existing
  `GRAIN_IN_PLANE.y` map. No new map entry, and no second copy of the role→field table.

### Two facts verified before being built on

- **`MaterialDef` has no thickness field** — only `costPerM2`, `costPerM`, `sheet`, `hasGrain`.
  Thickness lives on the part and is driven from `CarcaseParams.thickness`. So "change the material
  and parts resize" is not a re-wiring; it requires thickness to move onto the material and become
  the authority.
- **The three fastener methods emit nothing today.** `carcaseJoints` returns `[]` for `dowel`,
  `butt-screw` and `confirmat` (`carcaseRoles.ts:401`), with a comment that their geometry is
  hardware rather than a cut. Making screw fixing the default that *shows its holes* is new generator
  output, and it contradicts that comment — which should be updated rather than left to mislead.

### Rejected: a path-based section key

`s.0.2` was the obvious identity for a section. It was rejected because `regenerateOne` reconciles
parts by role key: inserting a section at index 0 would renumber every sibling, re-bind their parts,
and rebuild panels that did not change — losing their colours for a structural edit elsewhere in the
cabinet. A uuid costs nothing and matches every other identity in the codebase.

### The inversion nobody should undo

Overrides must be read *before* the layout resolves boxes, because a thickness override on a side is
what makes the bottom come out at `W − 50`. This makes `carcaseBoxes` a function of parameters *plus
the overrides currently on this cabinet's parts* — the generator reading from the parts it generates.

It stays a function, in one direction: overrides in, boxes out. The failure mode to guard against is
someone later making an override depend on a generated dimension, which would turn one pass into a
fixed-point iteration that may not converge. There is no test that catches this by accident; it needs
an explicit one.

### On Cabinet Vision

My knowledge of Cabinet Vision is general familiarity, not the product in front of me. The
characterisation was stated to the user before anything was built on it, and the two load-bearing
claims — the recursive front-elevation section tree, and per-part material overrides that resize
dependent parts — were confirmed. Everything else in the spec describes what Zimmu will do. Nobody
should cite this design as a description of Cabinet Vision's behaviour.

### The visual companion was not offered in its usual form

The brainstorming skill offers a browser companion served from a local URL. This session runs in a
remote container, so a local URL is not reachable from the user's machine; an Artifact was offered
instead as the equivalent. The user chose text-only, so overlay-versus-inset and the reveal model
were settled in prose. If the elevation editor in stage G needs design review, that is the point
where a visual is worth the tokens.

### 2026-08-27 — `legacyToSection` needed the carcase's width and thickness

Stage A's plan gave the conversion the signature `legacyToSection(dividers, fixedShelves)`. Written
that way it cannot reproduce v12 geometry, and the golden-master baseline caught it on the first
run: on the 1400 mm sweep case the tree put the first partition at x = 460.667 where v12 had it at
457.667.

The two models measure different things. A v12 divider is *centred* on a fraction of the **gross**
width, so its bays are that fraction less a whole side thickness at each end and a half divider
thickness at each divider. A section percentage is a share of the **clear** span that is left after
every division has taken its thickness. Converting one to the other is only possible with the
carcase's own `width` and `thickness` — algebraically the ratio depends on `T`, so no fixed set of
percentages works for all cabinets. The signature is now
`legacyToSection(dividers, fixedShelves, width, thickness)`, which is what the design already asked
for in prose: "sized by percentage **to reproduce the original fractions**".

Two details worth keeping:

- The last bay takes `100 − (the others)` rather than its own quotient. The shares sum to 100 only
  in real arithmetic; `validateSection` rejects a split whose percentages *exceed* 100, and a
  cabinet that fails validation emits no parts at all, so a float overshoot of 1e-14 would blank
  the cabinet. Checked over 196,172 randomised valid cabinets: no validation failure, and every
  partition landed on its v12 position to nine decimal places.
- The Stage C file loader must pass the same `width` and `thickness` when it migrates a v12 file.
  Until it does, a v12 file loads with `params.section` undefined and `validateCarcaseParams`
  throws — Stage A's commit groups B and C are not independently shippable.

### 2026-08-27 — `validateCarcaseParams` gained one geometric rule

Deleting the `dividers` and `fixedShelves` rules removed the only thing that stopped a cabinet too
short for its shelves, or a partition that does not clear a side, from generating panels that pass
through the shell and through each other. `validateSection` cannot replace them: it validates the
tree, and only the resolved rectangles know whether the cabinet is big enough to hold it. So the
carcase validator now resolves the tree and rejects any section with a non-positive span —
"the sections do not fit in the carcase". One rule replaces five, and the tests that pinned the old
failures still pin the same cabinets.

### 2026-08-27 — the label regression, and why 1459 unit tests could not see it

`carcaseBoxes` emitted `label: vertical ? 'Partition' : 'Shelf'`. That is what the Stage A plan
specified, and the plan was wrong: the pre-tree labels were `Divider {n}` and
`Bay {b} Shelf {i}` / `Shelf {i}`. The ordinal was dropped silently.

These labels are user-facing — the scene tree, the cutting list and the hardware BOM all print them.
A cutting list with three rows all called "Shelf" is a worse document than one that numbers them,
so this was a real downgrade rather than a cosmetic change.

**The whole unit suite passed.** It could not have failed, because the same commit that changed the
labels also rewrote the test that guarded them — and rewrote the comment above it into a
rationalisation of the loss ("which bay it stands in is in the tree, not spelled into every label").
A test edited alongside the code it guards has stopped being evidence about that code.

`e2e/sheets-tab.spec.ts` caught it, on two assertions, because it asserts text a user actually reads
and nobody thought to update it. That is the argument for having any test at all that is written
against the product rather than against the implementation.

The fix restores the ordinals and the bay prefix, derived from `resolveSections`' own record of
where each section sits in its parent (`placeOf`) rather than re-walking the tree. Three label
shapes are now pinned in `carcaseRoles.test.ts` — numbered partitions, bay-prefixed shelves in a
divided cabinet, bare numbered shelves in an undivided one — so the next regression fails a unit
test rather than waiting four minutes for Playwright.

### 2026-08-27 — `--no-verify` does not work here, and the plan should not have needed it

Stage A's plan had the build failing for eight consecutive commits, with `--no-verify` to get them
past the pre-commit typecheck. Both halves were wrong.

The gate is not a git hook. It is a Claude Code `PreToolUse` hook (`.claude/settings.json` →
`.claude/hooks/pre-commit-typecheck.sh`) that intercepts the Bash call before git runs and denies it
on a red typecheck; `--no-verify` is substring text to it. An implementer correctly refused to edit
the hook to get around it.

The deeper problem was the red window itself: eight commits nobody can verify, and no green commit
to bisect back to. Expand/contract was considered and rejected — keeping `section` alongside
`dividers`/`fixedShelves` would have let the ~40 test sites that spread `{ ...base, dividers: [0.5] }`
inherit a `section` describing no divider, passing while describing a different cabinet than they
name. Commits were regrouped by green boundaries instead: new modules, then the whole switch, then
the file format, then close-out. The switch is a large commit, and the 96-case equivalence test is
what makes a commit that size safe.

### 2026-08-27 — Stage A closed

- Unit tests **1231 → 1268** (the 193 equivalence assertions were temporary and are retired with the
  baseline; the +37 are permanent).
- e2e **15 / 15**, including both `sheets-tab` specs that caught the label regression.
- The golden master (`stage-a-baseline.json`, `sectionEquivalence.test.ts`) was green at 193/193
  immediately before deletion. It is deleted deliberately: keeping it would freeze Stage A's output
  against later stages that change it on purpose — Stage D changes pin bores, Stage E adds fronts.
- Not done, and deliberately: `adjustableShelves` still lives on `CarcaseParams` and pin rows still
  span whole panels (Stage D); `Section` has no `interior` or `front` (Stages D and E); thickness
  still comes from `CarcaseParams.thickness` (Stage B); `CarcasePanel` is a shim, not an editor
  (Stage G).

Two seams were built here specifically so Stage B has somewhere to land: `openingRect`, which spends
one thickness per side today and must spend each panel's own tomorrow, and `resolveSections`'
`thicknessOf` callback, which is a function rather than a number for exactly that reason. **A
symmetric fixture will not catch a mistake in either** — Stage B needs a case with different
materials on the left and right sides.

### 2026-08-27 — Stage B, group B: the switch to per-panel thickness

Decisions that are not in the plan, or that deviate from it.

- **Every generator entry point takes the resolver, `thicknessOf` immediately after `p`.**
  `carcaseBoxes`, `carcaseRoles`, `carcaseJoints`, `carcaseContactPairs`, `carcaseCuts`,
  `carcaseHoleArrays`, `validateCarcaseParams` and `openingRect` all needed it — the first four
  because they call `validateCarcaseParams`, and validation itself now reads resolved thicknesses.
  `floorZ` did **not** get one, unlike the snippet in the plan: it reads `toeKickHeight` only, and
  `noUnusedParameters` rejects a parameter added for symmetry.

- **`ladderMidRails` divides the frame's own clear width, not the carcase's.** The plan reads the
  old `p.width - 2 * p.thickness` as the two *side panels*. In the box table the mid rails are laid
  out between `ladder-left` and `ladder-right`, so the span has to be measured from those two, or
  the count and the placement disagree the moment a rail differs from a side. Identical for any
  cabinet whose ladder rails and sides share a material, which is every cabinet the app can make.

- **`validateCarcaseParams` is total across a throw.** `roleThicknessFor` is deliberately fatal, and
  the parameter panel validates on every keystroke, so the validator wraps every thickness read and
  turns a failure into `carcaseMaterial "X" has no thickness`. It also probes the roles no rule
  reads — toe kick, ladder rails — so an unusable material fails there, where it is a message,
  rather than inside `carcaseBoxes`, where it would throw in front of a user.

- **Two error messages changed meaning, and one mapping went away.** `backThickness must be less
  than depth` became `the back material is thicker than the cabinet is deep`; the parameter it named
  no longer exists. `parameterForRole` returns `null` for every thickness, because there is no
  cabinet-wide number to push a thickness edit into any more — `EditPanel` offers only "detach"
  until group D adds "just this part".

- **A carcase names a material per slot, so its back is no longer nested with its sides.** The
  Base 600 e2e nest went from 7 parts at 72.83% on one sheet to 6 at 61.30%, with the 12 mm MDF back
  absent from the yield report because no stock is set for it. That is the intended behaviour, not a
  regression: `sheets-tab.spec.ts` carried the old premise in a comment and in two label lists.

- **`useFile` fills the slot names only.** A pre-v14 carcase gets
  `carcaseMaterial: legacy.material ?? '18mm Ply'` and `backMaterial: '12mm MDF'`; its own
  `material`, `thickness` and `backThickness` ride along on the params object, unread, for the v14
  migration to pick up. Until that lands, a real v13 file's materials carry no thickness, so its
  carcase fails validation and keeps the parts the file already holds rather than regenerating them
  at the wrong size. A v13 file whose back was not 12 mm is exactly the case group C's collision
  test has to cover.

- **The seed is the trap the plan warned about.** `PRESET_MATERIALS` lives beside the presets that
  name it, and is seeded into `useScene`'s initial scene and into `useFile`'s `newFile` envelope
  **and** its saved snapshot — a new file whose baseline differed from its own scene would open
  dirty.

- **Mutation check on `openingRect`** (both `x0` and `x1` reading `thicknessOf('left-side')`): all
  96 box and 96 joint equivalence cases stayed green, and the asymmetric test failed with
  `expected 1375 to be 1382`. The bottom-panel assertion the plan sketched does **not** catch it —
  the shell panels are placed from the box table, and only what is placed inside the cabinet reads
  `openingRect`. The case that bites is a divided cabinet's shelf, and it now sits in
  `thicknessEquivalence.test.ts` beside the bottom-panel one.


- **v14's migration forks a colliding material name rather than reusing one.** `materialAtThickness`
  in `useFile.ts` walks candidate names — `18mm Ply`, then `18mm Ply (25mm)`, then
  `18mm Ply (25mm) 2` — and stops at the first that is either unknown, thickness-less (it then gains
  the thickness and keeps its `costPerM2`/`sheet`/`hasGrain`), or already at the thickness wanted.
  Reusing the first name for both would silently resize the 25 mm cabinet to 18 mm; the mutation
  check confirmed that is exactly what the collision test catches (`expected 18 to be 25`).
  A `thickness` of `undefined` short-circuits the whole thing, which is what makes a v14 file pass
  through untouched and the migration idempotent.

- **A slot the file never named is named after its thickness, not after the default.** v13 has no
  back material name at all, and some legacy carcases carry `material: ''`. Both become
  `${t}mm Ply` / `${t}mm MDF`, so an 18 mm/12 mm cabinet lands back on the seeded `18mm Ply` and
  `12mm MDF`, a 6 mm back becomes `6mm MDF` instead of a material *named* `12mm MDF` that is 6 mm
  thick, and no material is ever named the empty string. This is wider than the plan's "name the
  back material from its thickness" — the same rule had to cover the blank carcase name that
  `useFile.test.ts`'s v11 fixture carries.

- **`materialAtThickness` needs explicit annotations on `candidate` and `def`.** Without them `tsc`
  reports TS7022 (implicit `any`, self-referential) because the loop writes back into the same
  record it indexes. Not a design smell — just the inference giving up.

### 2026-08-28 — Stage B: the debounce dropped a pending edit on unmount

`e2e/carcase.spec.ts` failed at close-out: changing a cabinet's depth and then clicking a part left
the part at its old size. The generator was innocent — a unit test driving `regenerateComponents`
through the same depth change resized correctly.

The cause was `useDebouncedCallback`, untouched by this stage and wrong since it was written:

```ts
useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
```

It **cancelled** the pending call. `DimInput` commits 150 ms after a keystroke, and selecting a part
in the tree swaps `CarcasePanel` for `EditPanel` — so any cabinet dimension typed within 150 ms of
the next click was silently thrown away. Not a test artefact: a user typing a depth and clicking a
part loses the depth.

It now flushes instead, firing the latest pending value on unmount. Five tests pin the behaviour,
including that it does not double-fire when the timer already ran, and does not fire when nothing
was pending.

**Why no unit test caught this before.** Every existing test of a debounced field asserts what
happens when the timer *fires*; none unmounted mid-edit, because unmounting is not something a
component test does unless it is testing unmounting. The e2e caught it because a real user's next
action is a click somewhere else, and that is what the spec does.

Stage B did not cause it — the race has been there all along, and the suite passed by luck when the
gap between fill and click happened to exceed 150 ms. Stage B's extra work per render made the
losing side of that race the usual one.

### 2026-08-28 — Stage B closed

- Unit tests **1268 → 1310**; e2e **15/15**.
- The golden master (`stage-b-baseline.json`, `thicknessEquivalence.test.ts`) was green at 197/197
  immediately before retirement.
- **The four asymmetry tests were extracted, not deleted, into `panelThickness.test.ts`.** They were
  living in the equivalence file, and retiring the baseline would have taken them with it — which
  would have thrown away the *only* tests that can catch this stage's central bug. Re-verified after
  extraction by re-running the `openingRect` mutation against the extracted file alone: 1 failed, 3
  passed. A test worth keeping is worth proving still bites after it moves.
- The mutation that matters, recorded for whoever revisits `openingRect`: making it read
  `thicknessOf('left-side')` for both x edges leaves **all 96 baseline cases green** and fails only
  the shelf assertion. The golden master is blind to it, and so was the bottom-panel test the plan
  originally specified — shell panels come from the box table, and only what nests inside the
  cabinet reads `openingRect`.
- Not done, deliberately: no `frontMaterial` (Stage E, with the fronts that need it);
  `adjustableShelves` still on `CarcaseParams` (Stage D); joints still use `jointMethod` (Stage C of
  the wider restructure).

### 2026-08-28 — Stage C group D: a joint the user chose

- **Preservation is the detached-part line, moved.** `regenerateOne` builds `ownedJoints` (this
  component's joints, by id) and the emit returns the existing joint untouched when it is
  `driven: false` — the mirror of `if (existing !== undefined && !existing.driven) return existing`
  in the role pass. The deterministic id `joint_{componentId}_{housingRole}__{housedRole}` is what
  matches a kept joint to the descriptor it replaces, so nothing new is stored and the twin is never
  emitted beside it.
- **Where a joint parts company with a detached part.** A detached part is *also* kept when its role
  disappears (with its role key released). A joint is not: it is a relation between two panels, and
  when the params stop implying its role pair one of those panels has just been deleted. Keeping it
  would leave a dangling reference whose last-good cuts sit on a panel nothing seats into. For the
  same reason `sourceComponentId` is **kept** on a taken joint rather than cleared: clearing it is
  the joint analogue of releasing the role key, but the id stays deterministic, so a later
  regeneration would emit a second joint carrying the same id.
- **Deleting the cabinet takes the joint with it**, user-owned or not — it falls out of
  `onRemoveComponent`'s existing `sourceComponentId` filter, and follows from the same reasoning:
  both panels it names are driven and go with the cabinet, and unlike a part there is nowhere to
  promote a relation to.
- **Only dado ↔ screw are offered.** They are the two kinds naming one pairing — a panel's face and
  the perpendicular end meeting it — and `carcaseJoints` emits one *or the other* for identical role
  pairs with identical faces, which is the evidence that they are interchangeable. Finger is not
  offered anywhere: it meets two *ends* at a corner and needs the housing panel's end, which a joint
  naming its face does not carry (`carcaseJoints` computes it from the role, not from the joint).
  Mortise & tenon shares the face/end shape and could join the list later; it was left out as
  unasked-for. Legality is checked, not assumed: `isValidDadoSeat` for both, plus
  `faceAxes(housedEnd).depth !== 'z'` for the screw — a pilot centred in a panel's broad face is
  what `deriveScrewJoint` returns null for.
- **The override does not resize the panel, and that is visible.** Measured: on a screwed Base 600,
  converting `left-side__bottom` to a dado leaves the bottom at 564 mm and moves it from x = 18 to
  x = 12, so it reaches 6 mm into the side's groove and leaves a 6 mm gap at the right-hand side.
  The result is stable (a second pipeline pass does not move it again). The cause is that
  `carcaseRoles`' extension pass reads the cabinet's `jointMethod`, not the joints the scene
  actually holds, so a per-joint override is invisible to panel sizing. Fixing it means the layout
  reading joints — a real design change, out of group D's scope. A user overriding one joint on a
  cabinet today gets the right cuts and a panel sized for the cabinet's method.
- **The label keeps the old kind's name.** The plan requires the id *and* label to survive, so a
  screw converted to a dado still reads "Screw fixing — Left Side / Bottom" in the panel and on its
  derived cut labels. Kept deliberately; renaming would have to re-derive the label from the roles,
  which the joint does not carry either.

### 2026-08-28 — Stage C group D: panel sizing follows the overridden joint

- **The gap recorded in the entry above is closed**, by the shape Stage B already used for
  thickness. `resolveJointKind.ts` mirrors `resolveThickness.ts`: `jointKindFor(joints, componentId)`
  returns a `RoleJointKind` — "what kind is *this* role pair joined with" — and `carcaseRoles`,
  `carcaseJoints` and `carcaseHoleArrays` take it as the argument after the thickness resolver, the
  way `carcaseBoxes` already takes `RoleThickness`. `regenerateOne` builds it beside `thicknessOf`,
  from the same `driven: false` joints the emit preserves, **before** the layout runs.
- **The resolver answers `undefined`, not a kind, where the user has said nothing.** `carcaseJoints`
  still derives the cabinet default from `jointMethod` and `add` takes `kindOf(...) ?? kind`, so a
  cabinet nobody has touched produces byte-identical descriptors — the whole suite passed unchanged
  across the fix (1353 → 1356, the three additions being the new tests).
- **The id and the role pair are one thing now.** `carcaseJointId(componentId, housingRole,
  housedRole)` is stated once in `resolveJointKind.ts`; the emit calls it and the override lookup
  calls it, so the two cannot drift into disagreeing about which joint belongs to which pair.
- **Still one direction: overrides in, boxes out.** The resolver reads a joint's discrete *kind*,
  never a generated dimension, so regeneration has no fixed point to chase. Pinned by
  `regenerates an overridden cabinet to itself`.
- **The parameter is required, not optional-with-a-default.** A defaulting parameter would have let
  `carcaseHoleArrays` keep calling `carcaseRoles` with the cabinet default and silently place a
  partition's pin rows against a panel 6 mm from where it is — the same class of silent disagreement
  the bug itself was. Every caller now states which joints it is resolving against; the tests that
  are about layout rather than about overrides pass `jointKindFor([], '')`.
- **The mutation, recorded.** Making the extension pass read `carcaseJoints(p, thicknessOf,
  () => undefined, '')` — the override invisible to sizing, everything else intact — reproduces the
  measured defect exactly (bottom 564 mm at x = 12, 6 mm of daylight at the right side) and fails
  the two gap tests while the all-screws butt test still passes. Restored and re-verified green.

### 2026-08-28 — Stage C: the joint→cut pipeline was box-only

The spec said the screw joint's two hole families "are `HoleArrayCut`s, so drawings and the nest
handle them already". True of rendering, false of ownership:

```ts
export type DerivedCut = { partId: PartId; cut: BoxCut }          // src/geom/dado.ts
sourceComponentId?: string // hole arrays are component-owned, never joint-owned   // types.ts
```

Seven guards asked "is this joint-owned?" as `c.kind === 'box' && c.sourceJointId`. Unwidened, a
screw joint's bores would have outlived the joint that made them and stayed editable in the UI,
breaking the read-only contract every other derived cut has. `cutOwnership.ts` now states the
question once and all seven call it.

The `isJointOwned` signature was wrong on the first pass — a bare `boolean` cannot narrow
`sourceJointId`, so the orphan strip had to scan every joint per cut instead of using a `Set`. The
implementer flagged the trade-off rather than reaching for a non-null assertion, which was the right
call; it is a type predicate now.

### 2026-08-28 — the preset flip re-baselines every cabinet, and e2e cannot see it

`CARCASE_PRESETS` moved from `dado-rabbet` to `butt-screw`, so a screwed butt joint extends no panel.
Measured on a Base 600: **bottom 576 → 564**, a 12 mm change on every housed panel.

`extensionFor` returns 0 for `screw`. Mutating it to `thickness` fails **two** tests that know
nothing about each other — the computed span check (600 vs 564, exactly two phantom grooves) and the
touching-pair coverage property, which notices that over-extended panels touch differently. Two
independent tests, one bug.

**No e2e spec moved, and that is a coverage fact rather than luck.** `sheets-tab.spec.ts` pins
`used 61%`, and both methods nest to 61% — measured, not assumed: the difference is real but under
half a percent, so it rounds away. No e2e asserts a housed panel's dimensions at all. The
re-baseline was caught by unit tests only.

Three unit tests took `CARCASE_PRESETS[0].params` directly and so became screw tests while their
names still said "groove", "dado" and "box cuts that are not through". They are pinned to
`jointMethod: 'dado-rabbet'` explicitly rather than having their expected values updated — updating
them would have quietly repurposed tests into asserting something their names deny. New coverage
asserts the shipped preset *is* screwed; without it, flipping back to a groove method would break no
test.

### 2026-08-28 — the per-joint override put a 6 mm hole in the cabinet

Shipping the override revealed that `carcaseRoles` sizes panels from the cabinet-wide `jointMethod`
while `reconcileJoints` seats them from the joints the scene actually holds. Override one joint to a
dado and the two disagree:

```
bottom len=564 x=18  →  len=564 x=12   right edge 576, right side at 582   GAP = 6 mm
```

The panel slid into its new groove and never grew. Not a documented limitation — a feature whose use
produces a broken cabinet has not shipped.

The fix is the same inversion Stage B made for thickness, and `resolveJointKind.ts` is written as the
deliberate mirror of `resolveThickness.ts`: `jointKindFor(joints, componentId)` returns
`(housingRole, housedRole) => kind | undefined`, built in `regenerateOne` from the same `driven:
false` joints the emit preserves, and read **before** the layout resolves boxes. Where the user has
said nothing it answers `undefined` and the descriptors are byte-identical, which is why the entire
existing suite passed unchanged.

`carcaseJointId` is now spelled in exactly one place. The emit and the override lookup both call it,
so the joint id and the role pair can no longer encode the same fact two ways and drift.

After: `len=570 x=12`, right edge exactly on the right side's inner face, **GAP = 0**.

### 2026-08-28 — Stage C closed

- Unit tests **1337 → 1357**; e2e **15/15**, with no e2e file touched in the whole stage.
- Known and deliberate: a converted joint keeps its old kind's **label** ("Screw fixing — Left Side /
  Bottom" on a dado), because the joint does not carry the role labels needed to rename it.
- Only `dado` ↔ `screw` are convertible. That is evidence-based, not caution: `carcaseJoints` emits
  one *or the other* for identical role pairs with identical faces. Finger meets two *ends* at a
  corner and cannot be read off a joint that names a face.
- A user-owned joint dies with its cabinet, unlike a detached part. A board exists in its own right
  and can be promoted to top level; a relation between two panels has nowhere to be promoted to.
- `dowel` and `confirmat` still emit nothing — they need the hardware model, not a cut.

### 2026-08-28 — Stage D: "count" was never a shelf count

The spec's Stage D line treats `adjustable.count` as "how many shelves are in this opening". It is
not. `CarcasePanel` labels it **"Pin count"** and `carcaseHoleArrays` passes it straight into
`HoleArrayCut.count` — the number of *holes in the row*. A Base 600 ships `count: 10`, so building
the stage as the spec reads would have put **ten shelves** in every section.

There has never been a shelf count anywhere in the model: an adjustable shelf has only ever been a
row of bores. `AdjustableSpec` therefore carries both, named so the difference cannot be misread at
a call site: `shelves` (boards seated) and `count` (pin positions per row).

`InteriorSpec.fixedShelves` was left out deliberately. Stage A already turned a fixed shelf into a
horizontal split with `division: 'panel'`, and until fronts exist the two are observationally
identical — adding the field now would give the model two ways to say one thing.

### 2026-08-28 — a pre-v16 file's pin rows may move, and that is the correction

`startHeight` has no successor. It was an absolute height above the carcase floor; a row now starts
`FIRST_PIN_INSET` (32 mm, one increment of the system) above **its own section's floor**. So a
migrated cabinet whose rows began 200 mm up will find them starting just above the opening — and in
a divided cabinet, one row per section rather than one row spanning the panel.

That is the whole point of the stage rather than a regression: the old geometry bored a full-height
row on **both** faces of every partition, including the face looking into a drawer bank where
nothing can rest. `carcaseRoles.test.ts` now holds the test that could not be written before —
*drills a partition only on the face of the bay that asks for shelves* — and the mutation that bores
both faces regardless fails it.

The v16 migration copies the one cabinet-wide bundle onto every leaf, with `shelves: 0`: a pre-v16
file had no shelf boards, and inventing some would change what the user saved.

### 2026-08-28 — the legacy shim would have deleted the shelving on every keystroke

`CarcasePanel`'s Dividers and Fixed-shelves fields write a whole new tree through `legacyToSection`
on every edit — new sections, new ids. With shelving hanging off those sections, typing in the
Dividers field silently threw away the cabinet's pin rows. The fields are a v12 shim describing a
cabinet-wide bundle, so `firstInterior` reads the one spec back out and `seedInteriors` puts it on
every new leaf; nothing is lost because the shim cannot express more than one. Per-section editing
is exactly what makes this insufficient, and that is group D's job.

### 2026-08-28 — where the counts legitimately doubled

A panel bounding two sections now carries a row for **each**. Fixtures built on `legacyToSection(…,
fixedShelves ≥ 1, …)` therefore report twice the rows they used to, and three tests moved to say so
rather than being weakened:

- `carcaseRoles.test.ts` gained a `oneBay` fixture (`sec([], 0)`) for the tests that are about pitch
  and setback, plus a new *gives a panel one row per section it bounds* asserting the doubling
  directly.
- `regenerateComponents.test.ts`'s pin fixture dropped its fixed shelf: that test is about which
  panels get drilled, not about how division multiplies rows.
- `drawing.test.ts` filters a row's circles by its own span as well as its setback, because the
  preset's side panel now carries two rows at each setback, stacked.

### 2026-08-29 — an adjustable shelf is joined to nothing, and the suite said so first

Group C's first cut ran the shelf to `shelfBackY`, the same depth extent a fixed shelf has. Twelve
tests failed at once — `carcaseJoints`' "covers every touching pair exactly once" and the whole
joinery checklist — because a board flush against the back panel *touches* it, and a contact the
generator does not name is an unjoined pair on the checklist forever.

That is the suite catching a modelling error rather than a fixture needing an update. A loose shelf
that jams against the back cannot be tilted out past its pins. `SHELF_CLEARANCE` now applies to the
back edge as well as both sides; the front edge stays flush with the carcase, where a fixed shelf
sits and where the user looks.

### 2026-08-29 — shelves sit on pins, and the pin row is stated once

`pinRow(rect, spec)` is now the single answer to "which pin positions does this section have" —
what it asked for, capped by what fits between its own floor and ceiling. Both readers use it: the
row of bores, and `shelfPins`, which spreads `shelves` boards across those positions. Two copies of
that cap would eventually seat a shelf on a pin the cabinet never bored, and nothing downstream
would notice.

Shelves spread over the **pin positions**, not over the section's height. A ten-position row covers
288 mm of a 584 mm opening, so the two are not the same thing and the shelves cluster low. That is
what "adjustable" means here: they sit where pins exist.

A section asking for more shelves than it has pins seats what it can, matching the neighbouring
pin-count rule rather than invalidating the whole cabinet over one over-full opening.

### 2026-08-29 — the presets now ship a shelf, and a Base 600 spills onto a second sheet

`PRESET_INTERIOR` moved from `shelves: 0` to `shelves: 1`. A preset that bored two pin rows into
every opening and seated nothing would ship a cabinet whose cutting list denies what its panels are
for — and until the group D UI lands, a preset is the only way shelving reaches the app at all.

The yield consequence is real and worth stating: a Base 600's eight ply panels are **81 % of a
2440 × 1220 sheet by area**, and the bottom-left packer spills the toe kick onto a second sheet at
1.9 %. The Sheets e2e moved from "1 sheet, 61 % used" to "2 sheets, 41 % used" (the row reports the
mean). That is the packer, not the arithmetic; the existing comment already anticipated the figure
moving when the packer changes.

The sweep was seeded too. Without it `SWEEP` reached neither a pin row nor an adjustable shelf, so
the role-coverage test in `grain.test.ts` — the one that proves `grainAxisOf` is total over the
whole role space — would have passed while the new family was unreachable from it.

### 2026-08-29 — Stage D group D stopped, as the plan said to

The plan's group D says to move `CarcasePanel`'s Shelving section onto **the selected section's**
interior, using "whatever selection already exists — the scene tree selects parts, and a part knows
its section from its role key", and to **stop and report** if that route is not clean rather than
build a section picker, which is Stage G's job.

The route does not exist. `sidebar.tsx` renders `CarcasePanel` only when a **carcase** is selected
and `EditPanel` only when a **part** is selected — they are mutually exclusive, so selecting an
`Adj Shelf` board hides the panel that would edit it. Two further problems stand even if that were
solved:

- Only an `adj-shelf-{sectionId}-{i}` role names a *leaf* section. A `division-{parentId}-{index}`
  role names the section that was **split**, whose interior lives on its children, and a side panel
  bounds many sections at once.
- A section with `shelves: 0` has no board to select, so the route can never *add* shelving to an
  opening — only edit an opening that already has some. That is the primary case.

So the Shelving section keeps the two v12 shim fields (Dividers, Fixed shelves) and shelving is
stated by the presets and by the v16 migration until Stage G's elevation editor makes a section
selectable. `firstInterior` + `seedInteriors` keep the shim from destroying what those set. The
alternative the plan explicitly forbids — falling back to editing every section at once — would put
the cabinet-wide bundle back and undo the stage.

### 2026-08-29 — Stage D closed

- Unit tests **1369 → 1379**; e2e 15/15, with three specs moved to the new truth: the Base 600 part
  count (7 → 9 roles) and both Sheets specs.
- `project-structure.html`'s hand-written prose was stale at **v12** — Stages A, B and C each bumped
  the format without touching it. The three version mentions are now correct at v16; the rest of
  that page's prose has not been re-audited against Stages A–C.
- Deferred as planned: `interior.fixedShelves` (Stage E, with the front that gives "behind the door"
  a meaning), the section picker (Stage G), and rollouts/pull-outs — a shelf is a board on pins.

### 2026-08-29 — the presets trade their fixed shelf for an adjustable one

A Base 600 shipping one fixed *and* one adjustable shelf per opening was an artefact, not a design:
the fixed shelf came from the v12 `fixedShelves: 1` parameter Stage A inherited, and group C then
seated an adjustable board in each of the two openings it made. Three shelves in a 720 mm base unit
is not a cabinet anyone asked for, and its ply spilled onto a second sheet at 1.9 %.

Base 600 and Wall 600 are now one clear opening holding **one adjustable shelf and no fixed one** —
a base unit is shelved by what the user moves, not by a partition built into it. Tall 600 keeps its
four fixed shelves, because a pantry's shelves *are* its structure; its five openings are bored for
pins and seat none, since nine shelves in a 2100 mm cabinet is worse than none.

Every count in the suite moved by exactly **−2 joints and −1 contact** per cabinet: the fixed
shelf's two dados into the sides, and its back edge against the back panel. Measured before
editing, and the uniformity is itself the check — the adjustable board adds nothing back, which is
the "a loose shelf touches nothing" claim verified through `boardsTouch` rather than asserted.
A Base 600 is now 7 boards on one sheet at 60.38 %, cleaner than the 61.30 % it was before Stage D.

`jointChecklist.test.ts`'s *marks a shelf against the back as contact* now states its fixed shelf
explicitly. The preset no longer has one, and an adjustable shelf is held clear of the back
precisely so it never becomes that contact — testing it against the new preset would have quietly
inverted what the test claims.

### 2026-08-29 — the shelf front is set back, before there is a front to measure against

`SHELF_FRONT_SETBACK = 5` is separate from `SHELF_CLEARANCE` on purpose: the clearance lets a shelf
lift past the panels beside and behind it, the setback keeps it out of whatever the cabinet ends up
wearing. A shelf level with the carcase face rubs any door with an inset, and the door is not there
to be measured against when the shelf is generated. Stage E may make it a function of the front
rather than a constant; it is named and commented so that change has one place to happen.

### 2026-08-29 — the opening picker, and why group D's original route was the wrong one

Group D was reopened on the user's instruction after being stopped. The plan's route — reach the
section through a selected *part* — was still unusable for the reasons recorded above, but a
picker inside `CarcasePanel` turned out to be about eighty lines rather than a stage's worth:

- `sectionOpenings(root, tree)` lists **every leaf**, shelved or not. That is the whole difference
  from `sectionInteriors`, and the reason a separate function exists: an opening with no shelving
  is exactly the one a user wants to give some, and `sectionInteriors` deliberately omits it.
- `setInterior(root, id, spec)` writes one section's spec and leaves the rest alone. An id naming
  nothing is not an error — the divider shim rebuilds the tree with fresh ids constantly, so a
  stale selection is ordinary and must leave the cabinet as it was.
- The pick is held **by section id, not by index**. Held by index, touching the Dividers field
  would have kept "Opening 2" selected while the tree underneath became a different cabinet, and
  the next keystroke would have edited a different opening with no visible sign. Held by id it
  falls back to the first opening, which is what the rerender test pins.
- A bare opening's first edit creates `defaultInterior(0)` and applies the one field being edited.
  Without that, typing a shelf count would leave the other five fields undefined. `defaultInterior`
  is now also what the presets read, so a preset cannot drift from what the panel creates.

Openings are ordered bottom-left first and labelled `Opening 1 — 273 × 584`. Numbering by tree
order would have put "Opening 2" in different places for the same cabinet depending on how it was
built, and a bare ordinal says nothing about which hole in the cabinet it names.

The e2e caught two things no unit test could: the Shelving section is collapsed by default and its
content is `hidden` rather than unmounted, so `getByLabelText` finds the fields and a browser does
not; and Playwright's label lookup is substring and case-insensitive, so `Shelves` also matches
`Fixed shelves`.

### 2026-08-29 — the architecture page audited against Stages A–D

`project-structure.html`'s hand-written prose had not been touched since before Stage A. What it
claimed, and what is true:

- **File format v12** in three places, and a `"version": 12` sample. Now v16, with the intervening
  history spelled out.
- **`src/scene/` table** listed none of the modules the four stages added. Added `sectionTree`,
  `sectionInterior`, `migrateSections`, `resolveThickness`, `resolveJointKind`, `changeJointKind`,
  `cutOwnership`, `grain`, `defaultJoint`, `useNest`; corrected `carcaseRoles` (it claimed
  "dividers") and `carcasePresets`.
- **`src/nest/` had no section at all** — three files and the reason masks are built inside the
  worker rather than posted to it.
- **`geom/`** was missing `screw.ts`, `mitre.ts` and `dowelCut.ts`, and claimed `writeStep` uses
  XCAF named solids. It does not: the XCAF path is absent at runtime in opencascade.js v1.1.1 and
  the writer emits an unnamed compound. The Features table repeated the same claim.
- **Data model**: `MaterialDef` was shown as `{ costPerM2: number }`; `Joint` omitted `ScrewJoint`;
  `BoardPart` omitted `grain` and `overrides`; `CarcaseParams` and `Section` were absent entirely.
- **IndexedDB** heading said v2 while the text said v3, and the store table omitted `settings`.
- **Invariants table** carried none of the eleven the four stages established.
- **Features table** had no row for parametric cabinets, per-opening shelving, first-class joints,
  the joinery checklist or sheet nesting.

Two **pre-existing markup bugs** turned up while checking the result: `"cmp_<uuid>"` and
`"joint_<uuid>"` inside `<pre><code>` were parsed as unknown HTML elements, swallowing the text
after them in the browser. Browsers parse tags inside `<pre>` — only `<script>` and `<style>` are
raw text — so these were rendering wrong the whole time. Escaped, along with the `sec_<uuid>` this
audit would otherwise have added as a third.

Verified by loading the page in Chromium: 15 sections, no page errors, and every corrected string
present in the rendered text.

### 2026-08-29 — Stage E: the two mounts do not measure the reveal between the same things

Writing the group A tests turned up an error in the plan's own test, and it is the sort that would
have shipped a wrong cabinet with a green suite. "Every visible gap equals `frontReveal`" is true,
but *between what* differs by mount:

- **Overlay** fronts cover the division between them and meet over its midline, so the gap is
  front-to-front and equals one reveal.
- **Inset** fronts sit either side of a division that stays **visible**, so the gap between them is
  the division plus *two* reveals, and the rule that holds is each front clearing the material by
  one.

The plan had a single parameterised test asserting a front-to-front reveal for both. It would have
failed against correct code, and "fixing" it by halving the inset reveal would have shipped doors
that fouled the partition. Split into two tests, each stating its own mount's rule.

### 2026-08-29 — an overlay front is a contact, and the rule must read the geometry

The first cut gated the contact pairs on `p.frontMount === 'overlay'`. The mutation that holds the
door 6 mm further forward then failed only the placement test, not the contact test — because the
contact was derived from the *flag* that decides the placement rather than from the placement
itself. Two things that must agree, asked separately.

Rewritten to read the emitted boxes: a front contacts what it covers when `y1 === 0`, its inner face
on the carcase face. The mutation that holds the door 2 mm off the face now fails both tests, which
is the point — the box and the contact cannot drift apart.

Counted rather than asserted, too: every preset case in the pair table gains exactly **four contacts
and zero joints**. That uniformity *is* the "a front is housed in nothing" claim.

### 2026-08-29 — `git checkout` is the wrong way to undo a mutation

Restoring a mutated `carcaseRoles.ts` with `git checkout` threw away the whole group's uncommitted
work, because the group had not been committed yet. The plan said to do exactly that; it now says to
`cp` the file to the scratchpad first and restore from that copy. Cost: one re-application of a
large edit, and the only reason it was cheap is that the patches were still in the transcript.

### 2026-08-29 — a pantry's shelves had to stop being splits

Only a leaf wears a front. Tall 600's four fixed shelves were *splits*, so its root was a split with
five stacked children — five openings, each wanting its own door. Five doors on a pantry is not a
pantry, and Group B had to ship with Tall bare.

`interior.fixedShelves` is what resolves it, and this is precisely the distinction Stage D could not
draw: a split shelf **divides the opening**, an interior shelf does not. As one leaf with four
interior shelves, Tall takes one pair of doors over the whole front. The `%s ships %i divisions, %i
fixed shelves and %i loose` test now states all three shelf-shaped things side by side, because
"fixed shelf" no longer names one thing.

### 2026-08-29 — Stage E closed

- Unit tests **1419 → 1436**; e2e **17/17**, with three specs moved to the new truth (the Base 600
  part count 7 → 8 roles, and both Sheets figures: one sheet at 60.38% → 72.76%).
- The sweep is **96 → 192** cases: the front mount joined `baseMode`, `backMode` and `hasTop` as a
  loop variable, because an inset cabinet and an overlay one are different geometry everywhere.
- `setFrontOn` **deletes** the key rather than storing `undefined`. Both serialise identically, but
  `'front' in section` tells them apart and absence is how the model says "no front".
- The lint config ignores unused *arguments* only, not vars, so the idiomatic
  `const { front: _dropped, ...rest }` does not pass. Written as an explicit `delete` instead —
  changing the lint rule for one line would have been the wrong way round.
- Deferred as planned: hinge cups, hinge plate screws and drawer slide screws (Stage F); drawer
  boxes; frame-and-panel door construction.

### 2026-08-29 — the reveal could turn a door inside out

Re-reading the Stage E reveal code turned up a defect the whole stage had missed: `frontReveal` is
subtracted from every edge of every front, and nothing bounded it. An inset front at 400 mm on a
600 mm cabinet came out **−236 × −216 mm** — an inverted box, reaching OCCT as a degenerate solid —
and `validateCarcaseParams` reported no error at all. A *negative* reveal grew the door past the
carcase it is supposed to sit on.

`validateCarcaseParams` now rejects both, in the same shape as the existing "the sections do not fit
in the carcase" rule: read off the cells the cabinet would actually emit, so a cabinet with no front
is not failed for a number that cannot hurt it. Last-good parts survive, and the message lands
beside the field.

**The thresholds differ by mount, and the arithmetic is not what it looks like.** An inset front
takes a *full* reveal from each edge of the 564 mm opening, so it dies at 282. An overlay front
takes *half* a reveal from each edge of the 600 mm cabinet — which is one whole reveal across — so
it survives to 600. My first test asserted 400 was fatal to both; it is fatal to one and merely
silly on the other, and the test was wrong rather than the code. It is now a swept property (either
the validator rejects the reveal, or every front it emits has real width and height) plus one named
case per mount with the arithmetic spelled out.

### 2026-08-29 — three decisions taken, two needing no code

- **One `frontReveal` for both mounts**, not a separate inset figure. `frontMount` is cabinet-wide,
  so a cabinet cannot mix mounts, and a second field would only ever hold the number the user did
  not currently want.
- **A door stays a contact on the joinery checklist.** "No joint needed" is accurate — there is no
  joinery cut. The hinges become visible in Stage F as bores and in the hardware BOM; inventing a
  third checklist state before that machinery exists would change the checklist's type and every
  count in it for a distinction nothing can yet act on.
- **The mutation-testing discipline moved into `CLAUDE.md`**, where every future stage inherits it,
  rather than being restated in each plan: back the file up and restore from the copy, grep after
  applying *and* after restoring, and predict which tests should fail before running.

### 2026-08-29 — Stage F: a height carried between two panels needs carcase space

The first cut of the plate-screw rows copied the cup's board-x straight onto the upright as a
board-y. It came out 101.5 mm low, and the test that caught it is the one comparing the two families
in **carcase** space:

```
expected [ '100.000000', '517.000000' ] to deeply equal [ '201.500000', '618.500000' ]
```

Board x on a door runs the height from the *door's* bottom edge; board y on an upright runs it from
the *upright's*. On a toe-kick cabinet the side reaches the floor and the door starts above the
bottom panel, so those origins are 100 mm apart plus half a reveal. The fix reads each panel's own
`position.z` rather than translating through the cell rect — the two panels the figure has to agree
across are the two panels it is read from.

This is the third time in this restructure that two things which must agree were computed separately
and drifted: the Stage C per-joint override (sizing followed the cabinet, seating followed the
joint), the Stage E overlay contact (the contact read the mount flag, the box read the geometry), and
now this. The pattern is worth naming: **when two outputs must line up, derive the second from the
first, not from the first's inputs.**

### 2026-08-29 — a 37 mm setback is shared on purpose, and it broke a drawing test

`drawing.test.ts`'s hole-array tests isolate one row by filtering circles to a single column on the
Face view. A hinge plate screw uses `PLATE_SCREW_SETBACK = 37` and the front shelf-pin row uses
`setback: 37` — the same 32 mm-system figure, deliberately — so once the Base 600 preset hung a door,
its left side carried two families in that one column and the filter stopped isolating anything.

The fixture takes the door off rather than the assertion being loosened. Those tests are about how a
hole array is *drawn*, not about which families a cabinet happens to have, and filtering by the pitch
lattice would have asserted the spacing by assuming it.

### 2026-08-29 — the live kernel on a ⌀35 cup

A cup is the largest bore the app makes and the only one whose diameter is a real fraction of the
panel. `e2e/geom-kernel.spec.ts` now drills two into a Base 600 door and measures what came out:
**24 052 mm³** removed (2 · π · 17.5² · 12.5 ≈ 24 052), centroid midway between the two cups, and the
bore's `minZ` at **5.5** — the 5.5 mm of face an 18 mm door keeps behind a 12.5 mm cup. A `depth`
read as "through" would put that at 0.

### 2026-08-29 — Stage F closed

- Unit tests **1436 → 1477**; e2e **17 → 18**, the new one being the live-kernel cup.
- No part count moved anywhere, which is the check that this stage added *cuts* and not boards.
- Deferred as planned: hardware BOM entries for the hinges themselves, drawer boxes (so a slide
  height still comes off the front's own centreline and will move when boxes land), frame-and-panel
  door construction, and any hinge or slide *parameter* — every figure is a constant until the
  hardware model supersedes it.
- **Still owed: a woodworker's eye on the figure table.** ⌀35 / 12.5 deep / 22.5 from the edge and
  the 2-3-4-5 hinge-count table are claims about real hardware that no test in this repo can
  falsify.

### 2026-08-29 — Stage G1: the elevation replaced a picker rather than joining one

The plan called for the elevation to become "the" opening picker, and the temptation was to leave
`CarcasePanel`'s Opening dropdown alongside it as a keyboard-reachable alternative. It had to go.
Two selections for one thing is one way to select the wrong thing — and the dropdown's fallback
(*no pick? edit the first opening*) was the specific failure mode: a user who cleared the elevation
selection would have gone on silently shelving bay 1. The panel now reads `selectedSectionId` and,
finding nothing, says so. The mutation that reinstates `?? openings[0]` fails exactly one test,
which is the test that was written for it.

The same reasoning retired two e2e steps: both opening tests now click a cell in the elevation,
which is a strictly better assertion than the dropdown was — it proves the click, the pick, the
panel and the pipeline are one chain.

### 2026-08-29 — the axis names the division, not the stacking

`axis: 'vertical'` puts children side by side under a *vertical* partition; `axis: 'horizontal'`
stacks them under a *horizontal* shelf. Every time this is read quickly it reads backwards, which is
why the toolbar's buttons are labelled by what the user sees ("Split across" makes a shelf and passes
`'horizontal'`) and why the size field's label is derived — `Width` only when the parent splits
vertically. Hardcoding `'Width'` is wrong half the time and looks right in every symmetric fixture;
the mutation that hardcodes it fails only the test built on a stacked parent.

### 2026-08-29 — the viewport is hidden, and only the browser can prove it

`viewport.tsx` builds its renderer, camera and every mesh in a mount-once effect. Rendering the
cabinet editor *in place of* it would tear all that down on every tab change, and nothing in a unit
test would notice — happy-dom has no WebGL context to lose. So `CabinetEditor` renders nothing at all
for its 3D tab, `App` toggles `display` on the wrapper, and the e2e stamps an attribute on the live
canvas and requires the same element back after a Section → 3D → Section → 3D round trip. Worth
recording: the first version of that assertion was `toHaveCount(1)` over every canvas on the page,
which fails in dev because `stats.js` renders the FPS overlay into a second one.

### 2026-08-29 — Stage G1 closed

- Unit tests **1477 → 1512**; e2e **18 → 20** (the elevation split/merge round trip, plus the
  viewport-never-remounted proof).
- Five guards mutation-tested, each killed by the test written for it: the size label's axis, the two
  split axes, the `parent !== null` gate on Size, the `isSplit` gate on Merge, `unsplitSection`
  adopting the first child's front, and the panel's missing fallback.
- Deferred to G2/G3: the Front, Top and End projections (stubbed with a visible "not built yet"
  rather than a blank pane — a tab that silently shows nothing reads as broken), and mirroring the
  section tree in the scene tree.
- Not built, on purpose: drag-to-resize a division in the elevation. A size is typed, which is what a
  cabinetmaker actually wants for a 300 mm drawer bank; dragging is a nicety that would need its own
  snapping rules and a second way to write `setSectionSize`.

### 2026-09-02 — a bore's axes all come from its face, and one fixture family hid that

`carcaseHoleArrays` and `carcaseMachining` between them emit **every** bore a preset carries on a
`±Z` face — 46 on a Base 600, 46 on a Wall, 64 on a Tall, measured rather than assumed. `±Z` is the
one face for which `faceAxes` returns `{ depth: 'z', u: 'x', v: 'y' }`, which is exactly the tuple a
naive implementation hardcodes. So a projector that reads the drill axis as board **+Z** and marches
the row along board **x/y** is indistinguishable from the correct one on every fixture the presets
can build — and stays that way until the first screw joint, whose pilots land on
`joint.receivingEnd`, an *end* face. The synthetic `+Y` fixture in `assembly.test.ts` exists for that
reason alone; nothing a preset produces can stand in for it.

Same trap one level down: a square-on test written as "the drill span has extent along the view's
depth axis" is **behaviourally identical** to the correct "the drill step is flat in both of the
view's own axes" for every axis-aligned part, and differs only on a skewed one, where it claims
square-on in all three views at once. Measured, not predicted: mutating the rule to the wrong form
fails exactly one test — the tilted-part one — and 49 others pass. That test is load-bearing; the
plan predicted two entirely different witnesses for the same mutation and was wrong about both.

Also worth recording, because it cost a fixture rewrite: a `board()` two-part occlusion fixture must
clear the near board in **depth**, not merely sit behind its min corner. The default board is 720
deep and the Front view's depth axis is board y, so two boards 300 mm apart overlap and the occluder
gate (`depthMax <= depthMin`) never fires — the "without the mitre it really does hide it" honesty
check fails before the rule under test is reached.

**Stated limitations, not oversights.** A mitred board is treated as not-an-axis-aligned-box: it
draws as its convex hull and takes no part in occlusion in either direction. The hull still
overstates it — the bevel itself is not drawn — but it can never hide a part it does not really
cover, which is the failure that matters. `mitreFaceOutline` is deliberately *not* called here: it
returns board-local 2-D points for a Face or Edge view of that board, and those mean nothing in
cabinet space. And every bore is dashed regardless of depth: in a whole-cabinet projection machining
is interior detail whichever face it is on, so the through/blind distinction `buildBoardSheet` draws
for one board seen alone does not carry over. Circles and internal cut rectangles are also not
clipped by occluders — only by their own part's silhouette.
