# Driven hardware — implementation notes

**Spec:** `docs/superpowers/specs/2026-09-06-driven-hardware-design.md`
**Plan:** _(to be written)_

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered during implementation, and anything that would surprise a future reader.

## 2026-09-06 — how this stage was chosen

The cabinet-assembly restructure closed on 2026-09-06 with Stage G3 and its three follow-up defects.
Nothing in the specs, the notes or `project-structure.html` named a next item: the roadmap table
carries no *Next* badge, because G3's close deliberately declined to promote one without evidence.

Three candidates were weighed against the restructure spec's own excluded-scope list:

- **Driven hardware** — excluded there as "a separate design", with the machining already generated.
- **Drawer boxes** — also excluded, and carrying a recorded consequence: slide screw heights are
  derived from the drawer front's centreline *because there is no box*, and the risk list says that
  height is expected to move when boxes land. Doing it first would re-baseline Stage F's machining.
- **FSAPI fallback** — *Planned* on the roadmap, real, but it advances the shell rather than the
  cabinet model, and nothing is blocked on it.

Hardware won on three counts: the figures already exist (`hingeCount`, `hingePositions`,
`slideScrewRow`), the consumer already exists (`HardwareTab`, `buildHardwareCsv`, the library rates),
and it is one plan rather than a stage series. Recorded because a future reader will find no
roadmap entry saying so.

Noted while weighing them: drawer boxes would move slide *heights*, not hinge or runner *counts*, so
the quantities this design produces survive that stage.

## 2026-09-06 — measurements taken before the design was written

A scratch Vitest file (removed after) ran the three presets through `carcaseRoles`,
`carcaseMachining`, `carcaseHoleArrays`, `carcaseJoints` and `defaultScrewJoint`:

| preset | leaves | cups | adj shelves | drawer bays | screw joints → screws |
|---|---|---|---|---|---|
| Base 600 | 1 | 2 | 1 | 0 | 10 → 32 |
| Wall 600 | 1 | 2 | 1 | 0 | 8 → 28 |
| Tall 600 | 2 | 4 + 4 | 0 (4 fixed) | 0 | 18 → 66 |

Both surprises are in the spec, but the reason for measuring at all belongs here: the design's first
draft asserted a runner rule and a screw key from reasoning alone, and measuring falsified the screw
key within a minute. `defaultJoint.ts` models exactly one screw, so a key derived from bore depth
would have invented a purchasing distinction the geometry does not make — and, worse, would have
changed the ordered screw when a panel was overridden to 25 mm.

Side panel lengths came out equal to the cabinet depth on all three presets (560, 330, 560). That
equality is what made the first runner rule *look* readable off a panel, and the cross-check below
is where it broke: a division panel is 12 mm shorter than the side beside it. Recorded as it stood,
because the misleading measurement is the interesting part.

## 2026-09-06 — why `groupDowels` is the precedent, not `regenerateComponents`

The obvious move was a third collection through the regeneration pipeline: parts, joints, hardware,
each reconciled by a stable key with `driven: false` meaning the user's. It was rejected during
brainstorming and the argument is worth keeping, because it will be proposed again.

`driven` exists so a user can take an item over and edit it. Once the user chose a global hardware
library for price, supplier and part number, a derived line has nothing left to edit — quantity is a
fact about the cabinet, identity is a catalogue key. The flag would carry no load, and it would cost
a file-format bump, a parse-time migration, undo entries for hardware, and a third collection through
a pipeline whose two-stage purity is a stated invariant in CLAUDE.md.

`groupDowels` had already solved this one tab away: rows derived from parts, priced from the material
library, stored nowhere. Nobody has ever wanted to detach a dowel row.

The cost is stated in the spec — no per-cabinet hardware choice — and the intended home for that when
it lands is an override bag on `CarcaseParams`, not a detached row.

## Open questions for the plan

- **Where `groupHardware` lives.** `buildCsv.ts` is the precedent (`groupParts`, `groupDowels` are
  both there), but that file is already 206 lines and doing three jobs. If the hardware grouping
  pushes it past the point where it is one module, split it rather than grow it — the restructure
  spec made exactly that call about `carcaseRoles.ts` at 649 lines and was right.
- **The `Ungrouped` group's label.** It appears only when a screw joint joins parts belonging to no
  component. Worth checking against a real scene before naming it in the UI.

## 2026-09-06 — the cross-check, and the five errors it found

The spec was reviewed line by line against the code before any plan was written. Five claims were
wrong. All five were reasoned rather than measured, which is the pattern worth remembering — none of
them came from misreading a file, all of them from not opening one.

1. **The runner rule had two answers for one bay.** "Largest nominal ≤ upright length − 30" reads a
   panel, and the two uprights bounding a drawer bay are not the same length: measured 560 mm for the
   side panel and **548 mm** for the division beside it, the 12 mm being the captured back. Now the
   clear internal depth, which `carcaseRoles.ts` already computes as `backY0` and which the division
   length *is*. The 30 mm allowance disappeared with it — invented, and no test could ever have
   falsified it.
2. **Shelf pins were a flat four.** `carcaseHoleArrays` bores `.slice(0, a.rows)` rows per bounding
   upright, so `rows: 1` bores two rows and a shelf has two pins, not four. Four is right for every
   shipped preset, which is exactly why no fixture would have caught it.
3. **`adjustable.count` is pin positions, not shelves.** The testing table named it as the shelf
   count asked for; the shelf count is `adjustable.shelves`, and `shelfPins` caps it at what the row
   can seat. An implementer following the draft would have swept the wrong field — and `count`
   defaults to 10 against `shelves` of 1 or 2, so the test would have failed loudly and been
   "fixed" by weakening it.
4. **"Invalid parameters produce no hardware lines" was false.** True of the generator, false of the
   scene: `regenerateOne` returns the previous parts when `carcaseRoles` yields none, so the last
   good boards and bores stay in the scene and this pass reports them. The behaviour is the one to
   want, and the spec now says so — but the draft asserted it for the wrong reason, which would have
   produced a test asserting emptiness that could never pass.
5. **`BomModal` counting was off by one.** The draft said adding `joints` made it depend on "three of
   the four" scene collections. `Scene` has five, and the modal already takes four — so the `joints`
   prop makes it all five, which is the argument for handing it the `Scene` rather than a fifth prop.

What generalises: every error was in a figure derived by reasoning about the code rather than by
running it, and the two measured tables in the spec had none. The scratch-file habit from the design
session should extend to review — measuring the division panel took one test file and about a minute,
and it is what turned an ambiguous rule into a stated one.

## 2026-09-06 — what writing the plan changed

**The `joints` prop is gone, and with it the spec's last open risk.** The spec worried that adding
`joints` to `BomModal` would make it hold four of `Scene`'s five collections and force the question
of just passing the `Scene`. Both options were bad: a fifth prop, or a modal assembling a `Scene`
from its own props. The plan takes a third — `App` holds the scene and already computes
`nestReports` outside the modal and passes them in, so `carcaseHardware(scene)` goes the same way.
The modal stays presentational and never sees a joint.

**`groupHardware` gets its own file**, resolving the first of the two open questions above.
`buildCsv.ts` is at 206 lines serialising three formats; grouping and pricing is a fourth job. If
that looks wrong once both are written, the stage close should say so.

**Two mutations in the plan are there because a preset cannot catch them.** The flat-four pin
mutation passes every preset and every fixture with `rows: 2` — only the `rows: 1` case kills it.
The runner dedupe passes any cabinet with no drawer bay, which is all three presets. Both are noted
in their tasks so a subagent does not "simplify" the fixture that makes them fail.
