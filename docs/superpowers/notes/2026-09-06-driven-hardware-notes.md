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

Side panel lengths came out equal to the cabinet depth on all three presets (560, 330, 560), which
is what makes `runnerKeyFor(sideLength)` readable. If a future base mode changes that relationship,
the runner rule needs re-reading, not just re-testing.

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
