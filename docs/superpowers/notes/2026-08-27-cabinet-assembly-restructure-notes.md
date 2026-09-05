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

### 2026-09-02 — the projection pane: what its own tests could not see, and one figure that is wrong

Task 8's seven planned tests leave five of the pane's rules undefended, found by mutating each one
and watching nothing fail:

- **Paint order.** Dropping `.reverse()` on `v.parts` passes all seven. The projector sorts nearest
  first and the pane paints backwards so the nearest part is drawn last and takes the click; with
  the reverse gone the carcase paints over the door and every click on a door selects what is behind
  it. Defended now by requiring the last `projection-part-*` group in the DOM to be the front.
- **The z flip.** `flip` returning `y` also passes all seven — nothing in the plan's set reads a
  coordinate. The elevation learned this in G1: an upside-down cabinet looks entirely plausible. The
  test reads the rendered `y` of the bottom panel and the top panel and requires the bottom to be
  lower on screen.
- **Three of the five draw families.** Deleting the `rects`, `hidden`, `cutRects` or `circles` map
  leaves all seven green. `rects` is not decoration — it is the only fill in the group, so with it
  gone nothing in a real browser is clickable at all, while a `userEvent.click` on the `<g>` in
  happy-dom still passes. `partsOfCarcase` builds parts with **no cuts**, so a Base 600 fixture
  reaches neither a cut rectangle nor a bore; the machining has to be attached from `carcaseCuts`
  and `carcaseHoleArrays` for those two families to exist at all.
- **The dimension ring.** `DIM_RING = [0, 18, 18]` — ring 2 collapsed onto ring 1 — passes
  everything. On a Base 600 the two left-side dimensions happen not to overlap in y, so only the
  ordering is assertable: the toe-kick label (ring 2) must sit further out than the opening-height
  label (ring 1).

**A measured defect, not a stylistic one: `PADDING` is absolute and `font` is proportional.** The
label size is `max(W, H) / 45` while the viewBox padding is a flat 60 mm, so the annotation ring
does not scale with the cabinet. Measured across all three presets and all three views, at a 0.55 em
digit advance: Base 600 and Wall 600 fit with ~6 mm of slack on the right, and **Tall 600's "2100"
overflows the viewBox by ~71 mm in both Front and End** (font 46.7 mm, four digits ≈ 103 mm, anchored
at `W + 28` with the right edge at `W + 60`). It is clipped silently — SVG reports nothing. The same
mismatch puts a 46.7 mm label in an 18 mm gap between rings. The fix is to derive `PADDING` and
`DIM_RING` from `font` rather than to state them in millimetres; left undone deliberately, because it
is a design decision the sheet variant (Tasks 11-14) shares and should be settled once for both.
The `it.each` viewBox test can only check anchor points — happy-dom lays out no text — so that
overflow is invisible to the suite and would have to be an e2e assertion or a computed-width check.

**`hullOf` is sane for a rotated cylinder**, checked because the outline test depends on it. Its
input is the eight corners of the prism around the cylinder, and for a rotation about the view's own
depth axis the eight project onto four distinct points — the monotone chain dedupes the pairs
correctly and returns exactly 4 points, an exact 8 × 40 rectangle for a ⌀8 × 40 dowel at 30°. A
general rotation (20°, 40°, 60°) returns a 6-point centrally symmetric hexagon. Never degenerate,
always closed and convex. It still overstates a cylinder — it is the square prism's shadow, so a
diagonal orientation reads ⌀8 as up to 11.3 wide — which is the same stated limitation the mitre
hull carries: it can never hide a part it does not really cover.

### 2026-09-03 — the open cabinet is a memory, and the plan's way of storing it does not lint

Task 9. The rule the user settled on is **not** "the cabinet containing the selection": an
already-open cabinet stays open while the selection lies inside it, a cabinet selected outright
opens, otherwise none. So the answer depends on the previous answer and cannot be a pure derivation
of the scene.

- **The plan's `useEffect` form fails `pnpm lint`.** `react-hooks/set-state-in-effect` (enabled by
  `reactHooks.configs.flat.recommended`) rejects `useEffect(() => setOpenCabinetId(...), [x])`
  outright — it is an error, not a warning, so the plan's Step 4 as written cannot be committed.
  What replaced it is React's documented adjust-during-render: `if ((selectedCarcase?.id ?? null)
  !== openCabinetId) setOpenCabinetId(...)`. That is safe **only because the derivation is
  idempotent** — feed it its own answer as `openCabinetId` and it returns the same carcase — which
  is worth keeping true if anyone edits the rule.
- **Measured, not assumed:** counting committed child renders through the mocked `Viewport`, opening
  a cabinet costs 2 and every other selection change costs 1. A control run with the *pure*
  derivation this task replaced (no state at all) gives exactly the same 2/1/1/1, so the state
  machine adds no render and lags by none. The second render on open belongs to the editor mounting.
- **`openCabinetId` can name a component the scene has dropped**, so it is resolved through
  `scene.components` on every render rather than being stored as an object. Storing the
  `CarcaseComponent` itself is the obvious alternative and leaves a deleted cabinet's editor on
  screen; that mutation is what the "closes a cabinet the scene no longer holds" test kills.
- **A cleared selection leaves the cabinet open.** Nothing selected is not a selection *outside* the
  cabinet — clicking empty space in a projection or the viewport deselects, and being thrown out of
  the editor by a stray click is not what "stays open" means. Two separate mutations (the draft's
  ancestry rule, and `node === undefined → null`) close it, so the branch is pinned rather than
  incidental.
- **The plan forgot its own predecessor test.** Step 3 removes the "not built yet" placeholder while
  Step 1 says only to *append* the new projection test — leaving
  `says %s is not built yet rather than showing nothing` failing. It was replaced, not appended.
- **A projection that renders is not a projection that is wired.** The plan's Step 1 test asserts
  only that an `img` appears. Passing `selectedId={null}` or `onSelect={() => {}}` from
  `CabinetEditor` survives it, so the pane would draw and be dead to the touch — which is the exact
  behaviour Task 9 exists to protect. `carries the selection into the projection and a click back
  out` kills both.
- **Consequence worth knowing:** while a cabinet is open the 3D tab shows `cabinetParts`, so a part
  of *another* cabinet cannot be clicked there — leaving the open cabinet is done from the scene
  tree. STL/STEP export is unaffected: it reads `visibleParts`, the whole scene.

## Task 11 — the `assembly` sheet variant (2026-09-03)

- **Adding a member to `DrawingSheet` breaks four renderers at `tsc`, and the plan listed only
  `drawing.ts`.** `buildSvg`, `buildDxf`, `buildPdf` and `DrawingViewer` all narrow with
  `sheet.kind === 'cover'` and then read `shape` or `partLabel` off "everything else". An
  `assembly` branch that renders nothing went into each of them so the commit compiles; Tasks 12–14
  fill them in. The alternative — deferring the union member — would have left the task's own tests
  unwritable.
- **Row versus stack does not change any preset's scale.** The plan's motivation ("stacked puts a
  Base 600 at 1:20") was measured against the *board* sheet's usable height of 120 mm
  (`AREA_H - GAP`). Once the ring replaces `DIM_MARGIN + GAP`, the height available is 132.75 mm,
  and a stacked Base 600 comes out at 132.75 / 1280 = 0.1037 → **1:10, the same as the row**. Wall
  600 and Tall 600 are unchanged too. The row is still right — Front and End share a top edge, so
  heights read straight across — but the scale is not the argument for it.
- **Which is why mutations 1, 2 and 6 all survived the three presets.** Standard scales step by 2x
  and every preset sits far inside its band, so a stacked selector, a selector reserving no ring at
  all, and a ring computed from a constant label width all pick the same scale for all three. Two
  tests were added rather than the checks dropped:
  - `a wide low unit` (800 x 700 x 500) in the scale table. Its row bound is 2W + D = 2100 mm
    against a stacked W + D of 1300, so the row says 1:20 where both a stacked and a ringless
    selector say 1:10 — which then overruns the page by 9.75 mm and fails `fits(sheet.scale)`.
  - `reserves a wider ring for a cabinet whose dimension labels are longer`. Every fit assertion
    measures the ring *the sheet itself reports*, so none of them can see a ring that is simply too
    small for its own text — the layout stays self-consistent and the label overflows. Comparing
    Tall 600 (`2100`, four characters, 12.75 mm) against Base 600 (three characters, 11.125 mm)
    pins the ring to the labels without restating the em formula in the test.
- **Measured scales:** Base 600 1:10 (row 242.75 of 267 mm), Wall 600 1:10 (219.75), Tall 600 1:20
  (164.50). The plan's comment quoting "14.5 mm to spare" for a Base 600 used Tall's 12.75 mm ring;
  a Base 600's labels are three characters, its ring is 11.125 mm, and it has 24.25 mm to spare.
- **`assemblyRing` is safe on a view with no dims** — `Math.max(...[], 1)` is 1, not `-Infinity` —
  but the case cannot arise: `buildDims` always emits the two overall figures from the parameters,
  so even `parts: []` carries labels.
- **The em constants are duplicated.** `RING_EM` / `TICK_EM` / `TEXT_GAP_EM` / `CHAR_EM` now exist
  in both `CabinetProjection.tsx` and `drawing.ts`, which the plan's own comment describes as "one
  rule, two consumers" while writing it twice. `geom` importing from a `.tsx` component is the
  wrong direction, so the honest fix is to move them into `assembly.ts` beside `AssemblyDim.ring`
  (the field that indexes `RING_EM`) and have both read them there. Not done here to keep the task
  surgical; it is the first thing to do if the ring geometry is ever touched again.

## Task 12 — `buildSvg` renders an assembly sheet (2026-09-03)

- **`SHEET_FONT` did not move with the ring.** The plan moved all five constants into
  `assembly.ts`; only the four em figures did. `assembly.ts` opens by saying it emits unscaled
  millimetres because "a projector that scaled would have to be told a page size the pane does not
  have" — and `SHEET_FONT` is exactly a page size. It stays in `drawing.ts` and is exported. The em
  table is what all three consumers share; the font each multiplies it by is theirs alone
  (`FONT_DIVISOR` for the pane, `SHEET_FONT` for the sheet).
- **Mutation 6 as the plan states it is unsatisfiable, and both directions were needed.** No single
  value of `RING_EM[2]` fails tests in `drawing.test.ts` *and* `CabinetProjection.test.tsx`: the
  sheet layout only notices the ring through scale selection, which needs `6 * ring` to overrun the
  page at every standard scale (`RING_EM[2] > 15.2`), while the pane only notices when the outer
  ring falls inside the inner one (`RING_EM[2] < ~0.5`). The two windows are disjoint. Measured:
  `1.8 → 0.3` fails 8 tests in `CabinetProjection.test.tsx` and none elsewhere; `1.8 → 18` fails 5
  in `drawing.test.ts` and none elsewhere. Together they still prove the move took — before it, a
  change in `assembly.ts` could not have moved the pane at all.
- **A polygon, not a polyline.** `hullOf` returns a closed ring of points with no repeated first
  point, so the drafted `<polyline>` would have left the last edge of every dowel and every mitred
  board undrawn. `renderView` and `renderDowelView` already use `<polygon>` for the same reason.
- **The `.reverse()` was deleted rather than tested.** The pane reverses so the nearest part paints
  last and takes the click. On a sheet nothing is filled and nothing is clickable, so the order is
  unobservable: reversing it passes all 1632 tests. Mutation 5 therefore resolves by deleting the
  line, not by pinning it — a test asserting element order would assert the implementation.
- **Two of the drafted tests could not have failed.** The hidden-edge test asserted only that
  `stroke-dasharray` appears somewhere, which a dashed cut rect or bore satisfies; it passes on this
  fixture solely because `partsOfCarcase` gives every part `cuts: []`. It now counts dashed `<line>`
  elements against the projector's own hidden-segment total. And nothing at all covered the flip —
  `fy` feeds only the part geometry, never the dimension offsets — so `flips carcase v into SVG y`
  was added: it compares the Front view's `stroke="#000"` y-coordinates against
  `py + (H - v) * scale` as a set. The fixture is asymmetric in v (a toe kick at the bottom with
  nothing matching it at the top), which is what makes the flipped and unflipped sets differ.
- **The drafted ring test was too loose by 12 mm.** Bounding every `<text>` by
  `MARGIN ± sheet.ring` across the whole page passes the draft's own `[0, 8, 16]` table: the
  leftmost label lands at 11.6 mm against a bound of 3.9 mm. The check is now per view — every
  dimension label lies inside *its own* view's placement plus the ring — which puts that label
  3.4 mm outside the Front view's band and fails.
- **`renderDimLine` anchors every vertical label `'start'`, so a left-hand dimension reads back
  across the drawing it annotates.** This is the bug `CabinetProjection` fixed by anchoring
  `right ? 'start' : 'end'`, and the assembly sheet inherits it: the ring is reserved on the left
  and the label is drawn into the cabinet. Not fixed here — `DimLine` carries no side, and the
  board and dowel sheets share the function, so the fix is a signature change with three call sites
  rather than a renderer change. The reservation is generous enough that nothing clips; it just
  reads wrong.
- **The three views are unlabelled.** `renderView` and `renderDowelView` both write `view.label`
  above the drawing; the assembly sheet does not, because the plan's renderer does not and a fourth
  text element would have to be excluded from the ring test by hand. Three unnamed orthographic
  views on one sheet is a real gap for a shop drawing — worth a line in Task 13/14 or a follow-up.

## Task 13 — `buildDxf` and `buildPdf` learn the variant (2026-09-03)

- **The DXF `fy` in the plan flips twice, and so does the `py` it passes to `dxfDimLine`.** Every
  `dxf*` helper in the file already applies the single flip itself — `dxfLine` writes
  `fmt(fy(y1))`, and `fy` is `210 - y`. They take SHEET millimetres with y running down, exactly
  as the SVG renderer does. The drafted `fy = 210 - (py + (H - v) * scale)` therefore cancels that
  flip and lands the drawing mirrored in the wrong band of the page, and
  `dxfDimLine(dim, px, 210 - py - H * scale)` puts every "below" dimension above its view. The
  branch converts carcase v to sheet y and stops; `px, py` go to `dxfDimLine` unchanged. Pinned by
  *maps carcase v to DXF y with a single flip*, which fails on the drafted expression (measured).
- **No POLYLINE, and `LWPOLYLINE` would have been a bug.** The header declares `AC1009` (R12),
  which has no `LWPOLYLINE` at all — that entity arrives with R14. A closed R12
  `POLYLINE`/`VERTEX`/`SEQEND` run would be legal, but `dxfRect` does not do that and neither does
  `dxfView`'s `boardOutline` branch or `dxfDowelView`: both walk the ring and emit one `LINE` per
  edge, wrapping with `% length`. The assembly branch follows them, so the file keeps one
  convention. The test therefore counts `LINE`s on the `OUTLINE` layer against the hull's own
  vertex count and requires one of them to be diagonal — a bounding box has four axis-aligned
  edges, which is the same count in the End and Top views and would otherwise pass.
- **The drafted "on the right layers" test could not have failed.** `expect(dxf).toContain('HIDDEN')`
  and `toContain('DASHED')` are satisfied by `dxfTables`, which *defines* both — a file that drew
  every hidden edge solid still contains the words. It now counts `LINE` entities carrying
  `8/HIDDEN` against the projector's hidden-segment total and requires each to carry the per-entity
  `6/DASHED` override.
- **The drafted `keeps the layer tables` test would have passed the mutation it names.**
  `indexOf('TABLES') < indexOf('ENTITIES')` is true when `TABLES` is absent, because `indexOf`
  returns -1. The presence of `0/LTYPE/2/DASHED` and `0/LAYER/2/HIDDEN` is what actually fails on
  an early return.
- **pdf-lib can read back drawn content, but only as a content stream.** There is no model of drawn
  objects to query. `page.node.get('Contents')` gives a `PDFArray` of one ref to a `PDFRawStream`,
  Flate-compressed, whose text is written as hex strings (`<4A6F62> Tj`). Page count and
  orientation alone are NOT enough for mutation 6: the page is added outside the branch, so both
  still pass when the branch draws nothing. What fails is that an undrawn page carries no
  `Contents` entry at all. `node:zlib` is not available to `src` (tsconfig sets
  `types: ["vite/client"]`, so `@types/node` is out), so the test inflates with the platform's
  `DecompressionStream('deflate')` instead of pulling node types into the app's compile.
- **Three families the plan dropped, restored deliberately.** The drafted branches draw `solid`,
  `hidden` and `dims` only. Task 12's SVG draws `cutRects` and `circles` too, and every sheet in
  the deck carries a title block. A regenerated Base 600 assembly sheet has **26 bores and 4
  internal cut rectangles**; a Tall 600 has 36 and 4. Dropping them makes the DXF and the PDF show
  less than the SVG of the same sheet, and a shop drawing with no scale on it is not the same sheet
  in another format. Both are drawn now, `dxfRect('CUTS', …)` following the convention `dxfView`
  already uses for cut rectangles (solid, on `CUTS`, ignoring `DrawRect.dashed`).
- **`assemblyDimLine` was the only thing standing between the ring table and nothing.** Mutating
  `RING_EM[d.ring]` to `RING_EM[1]` fails **one** test in the whole 1652-test suite, and it is the
  one added with the extraction. Before it, no renderer's output could see which ring a dimension
  read: both rings sit inside the band the layout reserved, so the ring-placement test in
  `buildSvg.test.ts` passes with the toe-kick label printed on top of the opening label.
- **Still unlabelled, still reading backwards.** The two gaps recorded under Task 12 — the three
  views carry no `Front`/`End`/`Top` text, and `renderDimLine` anchors every vertical label
  `'start'` so a left-hand dimension reads back across the drawing — are now in three renderers
  rather than one. Neither is fixed here; both are cheap in one place each and belong in a
  follow-up.

## Task 14 — both export paths, and the two renderer defects (2026-09-03)

- **Both gaps recorded under Tasks 12 and 13 are fixed here**, in all three renderers, in a commit
  of their own so the export wiring lands on drawings that are not visibly wrong. Every assembly
  view now carries its `Front`/`End`/`Top` label at `px, py - 2`, exactly where and how a board
  sheet writes it, and a vertical dimension label on a left-hand ring reads away from its line.
- **The anchor fix needed no signature change**, contrary to the Task 12 note. Every board vertical
  dim has a positive offset (`boardRect.w + …`, `L * scale + …`), and `assemblyDimLine` returns a
  negative offset for a vertical dim if and only if `side === 'left'` — the `'right'` case is
  `bounds.w * scale + off`, which cannot be negative. So `dim.offset < 0` identifies a left-hand
  label exactly, and the branch is unreachable on a board sheet. (A *horizontal* dim on `'above'`
  is also negative, but the two branches are separate and the h label is centred anyway.)
- **DXF shifts by HALF the label's width, not all of it.** `dxfText` writes justification `72=1`,
  so its x is the label's CENTRE, not its left edge — the plan's `x - 2 - CHAR_EM * h * len` puts
  the left edge a width and a half out. Measured on a Base 600, the End view's toe-kick label
  landed at x = 96.975 with the Front view's reserved band ending at 97.25: outside the ring the
  layout reserved and inside its neighbour's. Half the width clears the line under both readings —
  centred, the right edge sits 2 mm short of it; and in a viewer that ignores 72 and draws from
  (10,20), the whole label still ends before it.
- **The ring test had to be updated deliberately, not loosened.** It asserted that every `text`
  above the title block was a dimension, which the three new view labels make false. It now
  partitions them and counts both — `above.length === labels.length + views.length` — so a
  renderer that stopped drawing the names still fails it.
- **`effectiveMaterials` does not exist in `App`.** The plan's `handleOpenDrawings` snippet reads a
  binding that is not there; the nearest thing is `nestMaterials`, which merges the IndexedDB
  library under `scene.materials`. Both paths use **`scene.materials`**: that is what
  `regenerateComponents` resolved the panels' own thicknesses from, and a sheet resolving them from
  a different table would dimension panels the cabinet does not have. It is also what `App` already
  hands `CabinetEditor`, so the deck and the tab cannot disagree.
- **An assembly sheet's filename now says `-assembly`.** The old local `sheetFilename` gave the
  cabinet's label alone, so a cabinet and a part sharing a label both wrote `job-base-600.svg`.
- **`sheetFilename` still lowercases and hyphenates whitespace only.** A label carrying `/` or `:`
  passes straight through into the `download` attribute. The UA sanitises path separators, so
  nothing escapes a directory, but "Base 600 / Left" downloads as `job-base-600-/-left.svg`. That
  behaviour is pre-existing for part labels and was lifted verbatim; worth a slug helper if labels
  ever come from anywhere but a person typing.
- **happy-dom does not parse an SVG injected through `dangerouslySetInnerHTML`.** Measured: the
  string carries 77 `stroke="#000"` line elements and one `<svg>` reaches the DOM with exactly one
  child — the `<style>` — and the rest is gone. So an App-level test cannot assert on what the
  viewer draws; the assembly-sheet test reads the `sheets` prop App hands over instead, which is
  the thing App alone decides. That also kills the sharper mutation: passing the cabinet **no
  parts** still produces a sheet titled "Assembly — Base 600" with a full dimension ring.
- **The Top view carries a toe-kick dimension that means nothing** (pre-existing, from Task 5, not
  fixed here). `buildDims` pushes `{axis:'v', side:'left', ring:2, 0..toeKickHeight}` whenever
  `baseMode !== 'none'`, for every view. In Front and End the v axis is z, so it dimensions the toe
  kick correctly; in **Top** the v axis is the cabinet's depth, so a Base 600's plan view is
  labelled 100 mm across 100 mm of *depth*. Measured in the sheet's own dims. Deserves a line in
  Task 16 or a follow-up.

### 2026-09-03 — Stage G2 closed

**Correct hidden-line output is a useless drawing.** The design was approved with plain HLR and
would have shipped a tab nobody would open: pure hidden-line removal of a closed box is one solid
rectangle. Measured with the cull disabled, a Base 600's **End view shows 2 of 8 parts carrying any
visible edge, and Top shows 4 of 8**; with the cull, End shows 7 of 7 and Top 6 of 7. Front is fine
either way, because a front elevation looks at a face that is mostly door. The defect is specific to
the two views that look at a closed face, and the fix is the standard drafting one: Top and End are
sections, Front is a view.

**That rule is about visibility, not population, and the first test of it could not fail.** It read
`parts.length > 1` under a comment saying "without the cull this count is 1". `culled` filters parts
*out*, so disabling it *raises* the count — 7 becomes 8 — and the assertion survived the mutation
from Task 3 until Task 15, when the same assertion copied into an e2e was mutation-tested and
passed with the cull off. The honest statement is *a section shows the majority of what it cuts
through*, and it must not be "every part": in Top the toe-kick rail sits directly beneath the bottom
panel and is genuinely invisible in a plan view.

**Three views in a row, for the alignment and not for the scale.** The original argument was that
stacking costs `H + D` = 1280 mm against 120 mm of usable height and drops a Base 600 to 1:20. That
was measured against `AREA_H - GAP` and **no longer holds**: once the dimension ring replaces
`DIM_MARGIN + GAP`, usable height is 132.75 mm, `132.75 / 1280 = 0.104`, and stacked reaches 1:10
too. Row and stacked agree on every preset (1:10, 1:10, 1:20). Fixing the area arithmetic
invalidated the justification for the layout it was fixing. The row survives on the reason that does
not depend on scale: Front and End share a top edge, so heights read straight across.

**The recurring failure of this stage was a rule duplicated per consumer.** Three times a figure was
stated once, then copied into the next renderer rather than shared, and twice the copies disagreed:
the ring geometry (pane, then `drawing.ts`, then `buildSvg` — with the renderer drawing ring 2 at
16 mm inside a 12.75 mm reservation), the `outline` polygon branch (missing in `buildSvg`, then
again in DXF and PDF), and the `AssemblyDim` → `DimLine` conversion (inlined in `buildSvg`, needed
verbatim by two more). After the second occurrence the extraction became step 0 of each remaining
task. The lesson is the project's own, arriving again: when two outputs must line up, derive the
second from the first, not from the first's inputs.

**Defects found next door and fixed here:**

- *Selecting a part unmounted the cabinet editor.* Fixed as "an open cabinet stays open while the
  selection lies inside it" — deliberately narrower than "the cabinet containing the selection",
  which opens a cabinet on any part click and would have swapped the 3D viewport for the Section
  elevation.
- *The elevation and the panel ignored thickness overrides.* Both passed an empty map to
  `roleThicknessFor`, so a cabinet with a 25 mm side drew 564 mm openings where its boards make 557.
  Pre-existing since Stage B.
- *The toe kick was dimensioned in every view.* Top's v axis is the depth, so a Base 600's plan view
  carried a "100" drawn across 100 mm of a 560 mm depth. From Task 5, fixed in Task 14.

**Counts.** Unit 1512 → **1661** (10 skipped) across 84 files; e2e 20 → **23**. Every task was
mutation-tested and no survivor was left unresolved; where a mutation survived, either the test that
kills it was written or the line it proved dead was deleted (the sheet renderers' paint-order
reversal was deleted on exactly that basis — nothing on a sheet is filled or clickable, so the order
is unobservable).

**Still owed**, unchanged from Stage F and now larger: a woodworker's eye on the hardware figure
table, and on the opening-chain convention (openings listed, deliberately not summing to the
overall). Neither is falsifiable by any test in this repo.

## Stage G3

**Two cabinets from the same preset share every section id** — found during Task 3's review, not
fixed there. `CARCASE_PRESETS` builds each preset's section tree once at module evaluation
(`carcasePresets.ts:86`, via `legacyToSection` → `newSectionId()`), and `onAddCarcase` assigns
`params: preset.params` **by reference** (`useScene.ts:1218`). So two Base 600s in one scene carry
the identical `sec_*` id at every node.

The shared *reference* is harmless: everything downstream is copy-on-write. `edit` in
`editSection.ts` rebuilds the spine and returns new objects — it guarantees untouched branches stay
referentially identical, so it never mutates — and `onUpdateComponent` maps to a new component.
There is no in-place `params.<field> =` write anywhere in `src/`. Editing one Base 600 cannot be
seen in another.

The **id collision** is the real defect, and it is why Task 3's `cabinetId` guard is load-bearing
rather than theoretical: a stale section id names a *live* opening in a different cabinet, so
dropping the guard puts the toolbar on the wrong bay rather than on nothing. That mutation survived
the entire 1671-test suite until `ignores a section selection made in another cabinet` was written
for it.

It will surface in Task 4 before it surfaces for a user: opening rows are tagged `node-sec_*`, so
two expanded cabinets from one preset put duplicate `data-testid`s in the DOM and `getByTestId`
throws on multiple matches. A Task 4 fixture must therefore use **one** cabinet, or cabinets from
different presets, until this is fixed.

The fix belongs in `onAddCarcase`: clone the preset params and re-id the tree (a
`freshSectionIds(section)` beside `newSectionId`), so a cabinet's openings are unique to it. Its own
change, with its own test — deliberately not folded into a G3 task.

**`null` does not close the cabinet editor.** The Task 3 plan justified emitting a component
selection on deselect by claiming `null` "would close the editor the click was made in". Measured:
it does not. With `selection === null`, `selectedCarcase` falls through to the open-cabinet fallback
and returns it — which is what `leaves an open cabinet open when the selection is cleared` already
pins. The design is still right, on different grounds: `null` would make a background click silently
load-bearing on a state machine already narrowed once for a regression, and would blank the sidebar
on a click made inside the cabinet. The comments were corrected; the commit message carries the
original wrong reason and cannot be.

**The branch was not shippable between Task 3 and Task 5** — closed by Task 5, kept because it is
the kind of window that reopens. Task 3 made `{kind: 'section'}` a *reachable* selection for the
first time, so every consumer that narrowed on `'component'` suddenly saw it, and `sidebar.tsx:117`
derived its carcase from `selectedComponent` alone. `CarcasePanel` therefore unmounted on the very
click that picked the opening its shelving and front controls belong to. Verified under `App`, not
inferred, and then pinned: `App.test.tsx`'s *keeps the sidebar carcase panel on screen when an
opening is selected* fails on its second assertion against the pre-Task-5 derivation.

The lesson is about *where the damage is visible*. Nothing in Task 3's own diff shows it opens a
window — the state it made reachable was unreachable before, so no test could have been red. A task
that makes a state reachable for the first time has to be audited against every consumer that
narrows on the states beside it, and that audit belongs in the task that opens the window rather
than the one that closes it.

One claim in this entry's first draft has since gone stale, which is worth keeping as its own
lesson: it said `SceneTree.tsx` "drops the cabinet row's highlight for the same reason". It does,
and after Task 4 that is *correct* — the opening row now carries its own highlight, so the selection
moves rather than vanishing. One selected row in the tree is the right invariant. A symptom noted
before its neighbouring task lands can turn into intended behaviour without anyone editing the note.

**A width of 6 does not throw; an unresolvable material does.** The G3 spec and plan both justified
the scene tree's unbuildable-cabinet guard with "the scene tree must never empty or throw because a
width is briefly 6". Measured in Task 4, step by step through the chain `carcaseGroups` calls:

| case | where it errors |
| --- | --- |
| `width: 6` | nowhere. `validateCarcaseParams` reports two errors, but `openingRect` returns an inverted rectangle (`x1 < x0`) and `resolveSections` / `sectionOpenings` / `sectionNodes` propagate it without complaint |
| `carcaseMaterial: 'Unobtanium'` | **`openingRect` throws** — `roleThicknessFor` only builds the closure; the closure is fatal by design |

So without the guard a width-6 cabinet would render its opening rows normally. The guard is still
right, and covers both, because `validateCarcaseParams` is *total*: it wraps every thickness read in
try/catch, so an unresolvable material comes back as a string rather than an exception. Its
placement between `roleThicknessFor` and `openingRect` is what makes that work.

The consequence for testing is the part worth keeping: **a `width: 6` fixture would have survived
the mutation that deletes the guard.** Task 4's test uses `carcaseMaterial: 'Unobtanium'` for that
reason. The spec and plan were corrected; Task 4's commit message repeats the original wrong reason
and cannot be.

The guard was already load-bearing before Task 4, which nothing recorded: deleting it also fails two
pre-existing `sidebar.test.tsx` cases, whose fixture renders a preset carcase with `materials: {}`.

**Two modules now answer "which carcase does this selection name".** `App.tsx` derives
`selectedCarcase` for the cabinet editor; `sidebar.tsx` derives its own for `CarcasePanel`. They
agree on every state reachable today — deleting a component clears a dangling section selection and
`replaceScene` nulls the selection outright — so this is a note, not a bug.

The one state where they disagree is a `cabinetId` naming a component the scene no longer holds:
measured, the cabinet editor stays open while the sidebar's parameter panel is gone. That is a
smaller version of exactly what Task 5 fixed, and it was equally true before Task 5, so nothing
regressed. If it ever becomes reachable, the cheap permanent fix is for `App` to pass the
`selectedCarcase` it has already computed down to `Sidebar` rather than have the sidebar re-derive
it — one source, as `resolveWorldMatrix` and `roleThicknessFor` are for their own questions.

Related precision, worth keeping honest: "one selected row in the tree" holds only while the opening
row is rendered. A collapsed cabinet, or one whose params the validator rejects, renders no opening
rows at all, so a section selection then highlights nothing. Pre-existing from Task 4 and correct —
there is no row to light — but the invariant is narrower than its one-line statement.

**A one-opening fixture cannot test opening ownership.** Every one of the three presets resolves to
exactly one opening, so against a preset fixture "this opening's parts" and "every opening's parts"
are the same set. Task 6's plan sketched its test on Base 600; a `sections.flatMap` mutation would
have survived it. Measured both ways: the mutation fails the two-bay fixture that shipped, and
passes a plan-shaped Base 600 probe with the mutation still in place.

Worth separating from the `width: 6` case earlier in these notes, because the two are different
species of the same disease. There, the fixture picked a value that did not reach the code under
test. Here, the fixture is perfectly valid — it just has one of the thing whose *plurality* is the
whole point. Any test about "which of several X owns Y" needs at least two X, and a fixture built
from defaults will rarely have them.

Related, and cheap to lose track of: the two-bay tree is built by `legacyToSection`, and `front`
comes from a separate `doored()` wrapper in `carcasePresets.ts` rather than from the migration. So
those bays own only `adj-shelf-` boards and the App-level test exercises one arm of the ownership
regex where the preset fixture exercised two. Accepted rather than fixed: `sectionNodes.test.ts`
pins all three role families and the `division-` exclusion directly, which is where that rule
belongs. Wrapping the fixture in `doored()` would recover the mix if it ever matters.

**"Covered only by eye" was too quick.** Task 6's plan said the viewport highlight colour could not
be tested and left it there. The unit half is true and structural — there is no `viewport.test.tsx`,
every unit consumer mocks the viewport, and happy-dom has no WebGL, so dropping the colour arm
passes all 1686 tests. But `e2e/suggestion-highlight.spec.ts` already pixel-counts the *sibling*
prop's amber off a live WebGL canvas with calibrated thresholds. The pattern exists, in this repo,
working. The gap was the plan's for not routing it to Task 8, not the implementer's for reporting
it honestly — and it is now Task 8 Step 0.

The general form: "untestable" is a claim about the current suite, not about the system. Before
accepting one, check whether a sibling feature already tests the same kind of thing.

**Two bays are not enough; the selected one must not be the first.** Task 6's fixture was rebuilt as
two bays precisely so a `flatMap` mutation could be caught — and its headline test then selected
*bay one*, where `sections[0]` and `find(by id)` return the same thing. Measured: replacing the
`find` with `sections[0]` passed all 26 App tests. CLAUDE.md already names that fallback as a bug
this codebase shipped once, silently shelving the wrong bay. Selecting the second bay kills it.

Worth stating as a rule, because this is the third variant of the same mistake in one stage: a
fixture has to make the *wrong* answers distinguishable from each other, not just from nothing. Two
bays separate "this opening" from "all openings"; picking the second also separates it from "the
first opening". Each wrong answer needs its own way of being wrong.

**Selection blue now suppresses joint amber across a whole opening.** The precedence is unchanged
and correct — the selected board's colour has always beaten the suggestion tint — but its scale is
not: it used to cover one board, and now covers every part of a bay. Reachable today: with an
opening selected on the 3D tab, hovering a checklist row whose pair lies inside that opening gives
no hover feedback at all. Left as is, since changing it is a design decision rather than a fix, but
recorded so it is not rediscovered as a bug.

**The five copies of the division-thickness lambda are closed**, and closing them found something.
`SectionElevation.tsx`, `CarcasePanel.tsx` (twice), `assembly.ts` and the shared resolve fixture all
now call the exported `sectionThickness`. The reason was never tidiness: `thicknessOf` falls back to
the carcase material for any role it does not recognise, so a change to the
`division-{parentId}-{index}` key format would not throw — it would quietly return the carcase
default instead of the division's own override, which is the same silent wrong-geometry class as a
25 mm side beside an 18 mm one.

**That risk turned out to be entirely unpinned.** Mutating the key to `divisionX-` after the
consolidation passed all 1689 tests. Every fixture in the suite is uniform enough that the fallback
returns the right number by coincidence — the divisions had no override of their own, so "read the
override" and "read the carcase default" were the same answer everywhere. `panelThickness.test.ts`
now carries the case that kills it: one division overridden to 25 beside a sibling left at 18, which
distinguishes reading the override from reading the default *and* from applying one override to
every division. It is the only test in the repo that catches that mutation.

The pattern is the stage's own lesson arriving from a new direction. Consolidating five copies into
one is worth nothing on its own — what makes it safe is that the one copy is now covered, and it was
not before. A refactor that leaves the consolidated statement untested has moved the risk, not
removed it.

**The plan's own Task 7 test could not catch the mutation it named.** It drew a two-bay cabinet and
compared the `<text>` contents in document order against `['1', '2']`. Reversing the openings before
mapping reverses the `<g>` elements too, so the labels still read 1 then 2 down the DOM — measured,
not reasoned: with the reversal applied, that exact assertion passed while the one now in the file
failed. A number has to be read off the cell it lands in, so the test finds each label by its
position inside the rendered cell rectangle rather than by its place in the DOM.

**And two bays cannot tell geometric order from tree order.** `legacyToSection([0.5], …)` builds a
vertical split whose children run left to right, which is exactly what sorting by `rect.x0` produces
— tree order and `sectionOpenings` order agree, so a fixture built from it pins neither. Measured on
a full-width top over two bottom bays: the walk visits bottom-left, bottom-right, top, while
`sectionOpenings` returns bottom-left, top, bottom-right. Mutating the elevation to sort by `z0`
then `x0` — the reading-order slip, and the tree's order for that shape — numbers the cells 1, 3, 2
and fails. The third variant of the stage's own rule: the fixture has to separate the wrong answers
from *each other*.

**`pointer-events-none` on the number is unpinned, and stays unpinned.** Removing it passed all 1691
tests. happy-dom loads no stylesheet, so a Tailwind class has no computed effect at all, and
`user-event` checks `pointer-events` on the clicked element and its ancestors rather than
hit-testing — the `<text>` is a sibling of the `<rect>`, never an ancestor. In a real browser the
label is painted over the cell and carries no handler, and the `onClick` sits on the `<rect>` rather
than on the wrapping `<g>`, so a click on the glyph would reach nothing. The class is load-bearing
and no unit test can say so; an e2e clicking the centre of a cell is the only thing that could.
