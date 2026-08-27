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

