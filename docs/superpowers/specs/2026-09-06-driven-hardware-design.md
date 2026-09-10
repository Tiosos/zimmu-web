# Driven hardware — the BOM counts what the machining bored

**Status:** Complete. Shipped across 15 implementation tasks plus this documentation stage. Unit
tests 1700 → 1773 passing (10 skipped; 86 → 90 files, four of them new); typecheck, lint, all 25 Playwright specs and the
production build green. Full account of what execution found — a dozen plan defects, one Critical
`NaN` persistence bug caught only by review, two environment facts, and the decisions taken along the
way — is in `docs/superpowers/notes/2026-09-06-driven-hardware-notes.md`'s `2026-09-06 — shipped`
entry.

**Goal:** A cabinet that generates hinge cups, plate screw rows, slide screw rows, pin rows and
screw bores should say how many hinges, runners, pins and screws it needs. Today it generates all of
that geometry and reaches the Hardware tab with zero items, so a quote prices the boards and the
user hand-counts the ironmongery.

**Architecture:** One pure module derives hardware lines from the scene the pipeline already
produced; the BOM layer prices them against a global hardware library and groups them per cabinet.
Nothing is stored in the file, nothing enters the regeneration pipeline.

**Tech Stack:** TypeScript strict, Vitest, React 19. No new dependency. No file-format change.

**Spec:** this file
**Plan:** `docs/superpowers/plans/2026-09-06-driven-hardware.md`
**Notes:** `docs/superpowers/notes/2026-09-06-driven-hardware-notes.md`
**Follows:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`, whose
excluded-scope list names this work: *"Machining positions are generated; no `HardwareItem` is
emitted. The hardware model is a separate design."*

---

## What exists today, measured

`carcaseMachining` walks `frontCells` per role and places cups, plate rows and slide rows;
`carcaseHoleArrays` places pin rows; `deriveScrewJoint` places a clearance array and a pilot array
per screw joint. Every count needed for a hardware BOM is computed and then thrown away.

Measured on the three shipped presets before this document was written:

| preset | leaves | cups bored | adjustable shelves | drawer bays | screw joints → screws |
|---|---|---|---|---|---|
| Base 600 (W600 H720 D560, toe kick) | 1 | 2 | 1 | 0 | 10 → **32** |
| Wall 600 (D330, no toe kick) | 1 | 2 | 1 | 0 | 8 → **28** |
| Tall 600 (H2100, pair) | 2 | 4 + 4 | 0 (4 fixed) | 0 | 18 → **66** |

Two facts from that table shape the whole plan:

- **No preset has a drawer.** Every runner test must build a `drawer-front` cell of its own. This is
  the same trap Stage G3 hit three times with its one-opening presets, and it is recorded here so
  the plan does not have to rediscover it.
- **Tall 600's doors carry 4 cups, not 5.** `hingeCount(2100)` is 5, but the leaf is 1997 mm and
  `hingeCount(1997)` is 4. The count follows the door, not the cabinet — which is exactly why the
  hinge test sweeps door heights rather than cabinet heights.

## Decisions taken with the user

All taken in the 2026-09-06 session, each put as a question with the trade-off stated.

| # | Question | Decision |
|---|---|---|
| 1 | Which families? | All four: hinges + plates, runners, shelf pins, assembly screws |
| 2 | Where does a driven item's price live? | A global hardware library in IndexedDB, mirroring materials |
| 3 | How do rows read? | Grouped by catalogue key, **per cabinet** |
| 4 | How fine-grained is the catalogue key? | Keyed by what the geometry already knows |
| 5 | Stored or derived? | Derived at read time; nothing enters the file or the pipeline |
| 6 | Hinge and plate: one row or two? | One — `110° hinge c/w plate`, because that is how they are sold |
| 7 | Which depth picks the runner nominal? | The cabinet's clear internal depth *(taken at review, after measuring falsified the first rule)* |
| 8 | How many pins does one shelf sit on? | One per bored row — `2 × interior.adjustable.rows` *(taken at review)* |

## The counting rule

Stated once, because four families follow it and a fifth will:

> **Quantity comes from what the pipeline emitted. The variant comes from the cabinet.**

| family | quantity read from | key |
|---|---|---|
| hinge c/w plate | `count` of the `cups_{frontRole}` hole array on each door | `hinge-overlay` / `hinge-inset`, from `frontMount` |
| drawer runner | distinct front roles carrying a `slide_{frontRole}` row — one pair each | `runner-{nominal}`, from the cabinet's clear internal depth |
| shelf pin | each `adj-shelf-` part × the pin rows bounding its section (`2 × interior.adjustable.rows`) | `shelf-pin-5mm` |
| assembly screw | `count` of hole arrays whose id ends `_clearance` and whose `sourceJointId` names a screw joint | `screw-8x40` |

Reading the emitted bores rather than re-deriving from parameters buys two behaviours for free:

- **A door too thin for a cup lists no hinge.** `cupRow` returns `null` below
  `CUP_DEPTH + MIN_FACE_BEHIND_CUP` (15.5 mm), so there is no cup row to count. A parameter-driven
  count would order hinges for a door that was never bored for them.
- **A joint converted from screw to dado drops its screws**, with no second rule to keep in step.

**Why pins are not a flat four.** `carcaseHoleArrays` bores
`[a.setback, panel.length - a.backSetback].slice(0, a.rows)` on **each** of the two uprights bounding
a section, so a section with the default `rows: 2` is bored four rows and one with `rows: 1` is bored
two. A shelf sits on one pin per row that bounds it. Four is therefore the answer for every shipped
preset and the wrong answer for `rows: 1` — a flat four would order pins with no hole to sit in, and
would hide that `rows: 1` is an under-supported shelf rather than a cheaper one.

Note that `adjustable.count` is the number of **pin positions in the row** (10 by default), not the
number of shelves; `adjustable.shelves` is the shelf count, and `shelfPins` caps it at what the row
can seat. The quantity here counts emitted `adj-shelf-` boards, so it is the seated number by
construction and the cap needs no second statement.

**Why the clearance array and not the pilot array.** `deriveScrewJoint` emits both, each at
`count = joint.screwCount`; they are the same screws seen from two ends. Counting both doubles every
figure, which is the obvious defect in this pass, so the rule names one of them.

**Why the variant is read from the parameter.** `frontMount` is a purchasing decision, not a
measured fact — an overlay hinge and an inset hinge are different products fitted to identically
bored doors. The geometry cannot tell them apart, so asking it would be false precision. This is a
deliberate departure from the "read the emitted boxes" rule that `frontCells` follows for contacts,
and it is confined to the variant: no quantity is ever read from a parameter.

## Which cabinet a line belongs to

The owning component of the part the hardware is fitted to — `part.parentId` — for all four
families. **Not** the joint's `sourceComponentId`.

The difference is a screw joint the *user* added between two panels of a cabinet: it carries no
`sourceComponentId`, but its screws are still screws that cabinet needs. A joint between parts that
belong to no component falls into a single `Ungrouped` group, which appears only when such joints
exist. Dropping them would print a total that is quietly wrong, which is worse than a group with an
awkward name.

## The catalogue

`src/scene/hardwareCatalogue.ts` — stated figures, not derived, exactly as `frontMachining.ts` is
stated. A wrong figure here produces a self-consistent cabinet that does not work, so this table
needs a woodworker's eye and no test in this repo can falsify it.

| key | name | unit |
|---|---|---|
| `hinge-overlay` | 110° hinge c/w plate | pcs |
| `hinge-inset` | 110° inset hinge c/w plate | pcs |
| `runner-{250…600}` | {n} mm drawer runner | pair |
| `shelf-pin-5mm` | 5 mm shelf pin | pcs |
| `screw-8x40` | #8 × 40 mm carcase screw | pcs |

**Runner length.** Standard nominals are 250, 300, 350, 400, 450, 500, 550, 600. `runnerKeyFor`
takes the largest nominal `≤ clearDepth`, where **`clearDepth = depth − backThickness` for a captured
back, and `depth` for an applied back or none**. A 560 mm Base takes a **500 mm** runner (548 clear);
a 330 mm Wall takes **300 mm** (318 clear). Below the smallest nominal the bay lists no runner rather
than one that will not fit.

That figure is not new: `carcaseRoles.ts` already computes it as `backY0`
(`p.backMode === 'captured' ? D - BT : D`), and a division panel's length **is** it — measured 548 mm
on a split 560 mm Base. The plan must read it from one place rather than restate the expression; two
copies of a clear-depth rule is how a runner comes to disagree with the panel it screws to.

An earlier draft read the length off "the upright the row is bored into", and measuring falsified it:
the two uprights bounding one drawer bay are **560 mm (the side panel) and 548 mm (the division)**, so
the rule had two answers for one bay. Identical drawers taking different runners because one sits
beside a division is the kind of output a shop stops trusting. The clear-depth rule also drops the
30 mm allowance that draft invented — one fewer stated figure with no test behind it.

**One screw, not a family of them.** `defaultJoint.ts` models exactly one carcase screw — #8 ⌀4.2,
5 mm clearance, 3 mm pilot, 30 mm deep — as constants shared by every screw joint. An earlier draft
of this design keyed screws as `screw-{pilotDepth + through thickness}`; that was wrong, because it
would order a different screw when a panel is overridden to 25 mm while the modelled fastener has
not changed at all. One key until a screw becomes a real catalogue item with its own geometry.

## Modules

| file | responsibility |
|---|---|
| `src/scene/carcaseHardware.ts` | **new.** Pure `carcaseHardware(scene) → HardwareLine[]`, where a line is `{ componentId, cabinetLabel, key, qty }`. No React, no THREE, no IndexedDB. |
| `src/scene/hardwareCatalogue.ts` | **new.** The stated table above, plus `runnerKeyFor(clearDepth)` and the hinge key from `frontMount`. Data and key derivation only. |
| `src/scene/useHardwareLibrary.ts` | **new.** Mirrors `useMaterialLibrary` against a new `hardware` store. |
| `src/scene/idb.ts` | `DB_VERSION` 3 → 4; a fourth store, `hardware`, keyed by catalogue key, holding `{ supplier, partNumber, unitCost }`. The name comes from the catalogue, never from the library. |
| `src/ui/groupHardware.ts` | `groupHardware(lines, library)` → priced rows. Shipped as its own module rather than a fourth job inside `buildCsv.ts`; see the notes. |
| `src/ui/buildCsv.ts` | `buildHardwareCsv` learns the derived rows alongside the hand-typed items. |
| `src/ui/HardwareTab.tsx` | A read-only derived section above the hand-typed list, with an inline unit-cost field writing straight to the library. |
| `src/ui/BomModal.tsx` | Takes the hardware lines already computed, prices them, and gains a hardware section in the Library tab. |
| `src/App.tsx` | Wire `useHardwareLibrary`; compute `carcaseHardware(scene)` and pass the lines down. |

**Untouched, and this is the point:** `useScene.ts`, `regenerateComponents.ts`, `reconcileJoints.ts`,
`useFile.ts`, `FILE_FORMAT_VERSION`. No migration, no pipeline stage, nothing new in the `.zimmu`
file, no undo entries for hardware.

## Why derived rather than driven

`HardwareItem` could have gained `driven`, `sourceComponentId` and a role key, reconciled by
`regenerateComponents` exactly as parts and joints are. It was rejected.

The reason `driven` exists on a part is so a user can take one over and edit it. With price,
supplier and part number living in the library, a derived hardware line has **nothing left on it to
edit** — its quantity is a fact about the cabinet and its identity is a catalogue key. The machinery
would carry no load.

The precedent is already in the repo, one tab away: `groupDowels` derives rows from `scene.parts`,
prices them from the material library, stores nothing, and nobody has ever wanted to detach a dowel
row. The cutting list is the same shape. A hardware row is a cutting-list row for ironmongery.

**What this costs.** There is nowhere to hang a per-cabinet hardware choice — "this run takes
soft-close". When that lands it becomes an override bag on `CarcaseParams`, which is where the repo
already puts per-cabinet overrides, and not a detached item. That is the better home for it anyway:
a hardware choice is a property of the cabinet, not of a row in a table.

**Rejected outright:** deriving the rows but caching them into the file on save. Two sources of
truth for one number, and the cache goes stale the first time an old file opens against new code.

## Pricing and edge cases

- An unpriced key shows a blank cost and is excluded from the total — how `groupDowels` treats a
  material with no `costPerM`. **An unpriced job must never read as a free one.**
- **A cabinet mid-keystroke invalid keeps its last good hardware counts.** `regenerateOne` returns
  the previous parts unchanged when `carcaseRoles` yields none, so the scene still holds the last
  good boards and their bores, and this pass — reading the scene, not the parameters — reports them.
  That is the same thing the scene tree and the 3D view show, and it is the behaviour to want: a
  quote that emptied itself while a width was being retyped would be worse than one a keystroke
  stale. An earlier draft of this document claimed the opposite ("no roles, so no cuts, so no
  hardware lines"), which is true of the generator and false of the scene it writes into.
- Hand-typed items are untouched. The tab and the CSV carry a derived subtotal, a hand-typed
  subtotal, and a grand total — three figures, so a user can see which half of the quote is
  generated.
- The derived section is read-only apart from unit cost. Editing a quantity is meaningless — the
  cabinet decides it.
- **Row order is stated, not incidental:** cabinets in `scene.components` order, then keys in the
  catalogue table's own order, with `Ungrouped` last. A CSV regenerated from an unchanged scene must
  be byte-identical, which is what makes it diffable and what a test can assert.

## Testing

Every property has **two independent derivations**, so no test can pass by agreeing with the code it
tests:

| property | side A | side B |
|---|---|---|
| hinges | `hingeCount(doorLength)` — the stated table | the pass, counting bored cups |
| runners | drawer-front cells in the section tree | the pass, counting `slide_` rows |
| shelf pins | `interior.adjustable.shelves` (capped by `shelfPins`) × `2 × rows` | the pass, counting emitted boards and bored rows |
| screws | `Σ screwCount` over the cabinet's screw joints | the pass, counting `_clearance` bores |

The tautology trap is specific and worth naming: a hinge test that counted cups on both sides would
pass however wrong `hingeCount` was.

**As shipped, the three-preset sweep is exactly that tautology**, and the final review proved it by
mutation: making `hingeCount` return 3 instead of 2 below 900 mm left all three preset cases green.
The sweep still earns its place — it kills "count the wrong cut" mutations, and a `plate_` row
counted as a hinge fails all three — but it is not what pins the table. That is done by the two
tests hardcoding a number (`counts by the leaf` at 8, `keys by the mount` at 2), and the 2000 mm
band is anchored the same way. Recorded rather than fixed: hardcoding a third band would pin the
table further, but the figures are read off standard hardware and CLAUDE.md already says that table
wants a woodworker's eye rather than a greener suite.

**Cases no preset reaches**, so fixtures must build them: any drawer bay; an inset cabinet; a door
under 15.5 mm, which must list **no** hinge; a second cabinet, to prove per-cabinet grouping does not
merge.

**Mutations to run, with the test each must break:**

| mutation | must fail |
|---|---|
| count plates as well as cups | hinge sweep (doubles) |
| count pilot arrays as well as clearance | screw equality (doubles) |
| a flat 4 pins per shelf, ignoring `rows` | the `rows: 1` case (must give 2, not 4) |
| 2 pins per shelf, not `2 × rows` | pin sweep at the default `rows: 2` |
| group scene-wide instead of per cabinet | two-cabinet grouping |
| attribute by `joint.sourceComponentId`, not `part.parentId` | user-added-joint attribution |
| `runnerKeyFor` picks the smallest nominal `≥` available | runner key table |
| unpriced key contributes 0 rather than blank | library merge |

**The `DB_VERSION` upgrade needs its own test.** `onupgradeneeded` only ever adds stores, but that
is a claim: `fake-indexeddb` can write a material rate at v3, reopen at v4, and read it back.

**No e2e.** Nothing here depends on the canvas, on CSS, or on hit-testing — the three things that
pushed Stage G3's coverage into Playwright. A `HardwareTab` render test with
`@testing-library/react` covers the derived rows appearing above the hand-typed list.

## Risks and things that will surprise someone

- **The catalogue is not falsifiable by any test in this repo.** Hinge naming, the 110° assumption,
  the runner nominals and the 30 mm depth allowance are read off convention, not off a vendor list.
  A green suite says the pass counts correctly, never that it counts the right product.
- **The hinge variant is the one quantity-adjacent figure read from a parameter.** If a future stage
  lets a single cabinet mix overlay and inset fronts, `frontMount` stops being the right source and
  the key has to come from the cell.
- **Runner length is derived from the cabinet's clear depth, not from a drawer box**, because there
  is no drawer box — the same absence that makes `carcaseMachining` derive slide heights from the
  front's centreline. When drawer boxes land, both figures should be revisited together.
- **A screw joint the user converts to dado silently changes the screw count**, which is correct and
  will still look like a bug to someone reading a quote that moved.
- **`BomModal` was going to gain a `joints` prop, and does not.** It already takes four of
  `Scene`'s five collections, so a fifth would have made "pass it the `Scene`" the honest move —
  and assembling a `Scene` from five props inside the modal would have been worse than either.
  Writing the plan found the third option: `App` holds the scene and already computes `nestReports`
  outside the modal and passes them in, so `carcaseHardware(scene)` follows that path and the modal
  stays presentational. Recorded because the risk was real and the resolution is not the one this
  document first proposed.
