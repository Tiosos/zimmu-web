# Driven hardware — implementation notes

**Spec:** `docs/superpowers/specs/2026-09-06-driven-hardware-design.md`
**Plan:** `docs/superpowers/plans/2026-09-06-driven-hardware.md`

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

## 2026-09-06 — three defects the execution found in the plan itself

Recorded as they were found, because all three are the same failure as the spec cross-check: a
claim reasoned about rather than run.

**`sectionNodes` does not return an array.** It returns `{ sections, carcase }` — a divider belongs
to the carcase, so the openings live under `.sections`. The plan's Task 3 test and Task 6
implementation both called `.find(...)` straight on it. The Task 3 implementer hit it, fixed the
test's access path, and flagged Task 6 forward rather than leaving it to fail later; Task 6's code
in the plan was corrected before dispatch. The mistake came from reading `carcaseOpenings`'s
`ReturnType<typeof sectionNodes>` signature and inferring the shape without opening the module.

**The plan file contained three literal NUL bytes.** They sat where the tally key's separator was
meant to be an escape sequence, and they made `file` report the plan as binary data. Any implementer
copying those lines would have put a raw NUL into a TypeScript string literal. Caught before Tasks
4–8 were dispatched — they are the only tasks that quote those lines — and replaced with the
two-character escape the code should always have carried.

**Task 2's second test was a tautology.** Its expected value called `clearDepth`, the same function
production routes through, so a mutated formula cancelled out on both sides. The code-quality
reviewer proved it by mutation: test one failed, test two passed. The expectation is now derived
from the preset's depth and back-material thickness instead, and the mutation fails both. The
plan's own comment — "read off the generator rather than restated here, so the two cannot drift" —
had asserted the property the test did not actually have.

The pattern across all three: everything measured was right, everything inferred was suspect.

## 2026-09-06 — shipped

Unit tests: **1757 → 1767** passing (10 skipped throughout, 90 files throughout — the count moved
inside existing files, not across new ones). Typecheck, lint, the full Vitest run, all 25 Playwright
specs and the production build are all green on the branch this stage closes on. The spec predicted
no new e2e coverage for this stage ("Nothing here depends on the canvas, on CSS, or on hit-testing")
and none was added; the Playwright run is whole-app regression, not stage-specific evidence.

**The plan itself carried about a dozen defects, and execution found all of them.** Three are
recorded above (the `sectionNodes` shape, the plan file's three literal NUL bytes, Task 2's
tautological `clearDepth` test). The rest, found after that entry was written:

- **A second tautology**, in `carcaseOpenings.test.ts`'s `resolveCarcase` coverage: the assertion
  compared `nodes.sections` against `openings` by id, and both are derived from the same array by
  construction, so no mutation could fail it. Replaced (commit `3015dbe`) with assertions that read
  the actual owned parts — the opening's shelf and door, the shell filed under the carcase, every
  part accounted for exactly once.
- **Two "append the tests" instructions would have silently destroyed existing coverage.** Task 12
  said "(append)" for `buildCsv.test.ts`, which already carried a four-test `describe('buildHardwareCsv', …)`
  block for the hand-typed-only signature; Task 13 said "(create if absent)" for `HardwareTab.test.tsx`,
  which already existed with its own `describe('HardwareTab', …)` covering the manual-item table. Both
  plan sections gave a complete new `describe` block under the same name — literally overwriting
  either file's existing block, rather than truly appending, would have dropped that file's
  pre-existing coverage. Execution merged into the existing blocks instead: `buildCsv.test.ts` kept
  its original four tests (including the single-argument `buildHardwareCsv([])` case, still the only
  coverage of the default parameter) alongside the new ones, and `HardwareTab.test.tsx` gained a
  `defaultProps` spread so the pre-existing tests reproduce their old behaviour unchanged.
- **A predicted `grep -c` count was wrong.** Task 5's mutation-test step predicted
  `grep -c "seenSlide" src/scene/carcaseHardware.ts` would read `4` after restoring the file; it
  reads `3` (the declaration, the `.has` check, the `.add` call — one fewer than the plan counted).
- **Two predicted test totals were wrong**, for the same underlying reason each time: a task's
  "Expected: PASS, N tests" was arithmetic against the *previous* task's predicted total, not its
  actual one, and two tasks grew a test file beyond what the plan had carried forward. Task 6 shipped
  an extra fixture (`18c3ca0`, the two-bay asymmetric case for shelf-pin ownership) that the plan's
  Task 7 baseline didn't know about, so Task 7's predicted 21 landed at 22; Task 7 then shipped its
  own extra test (`1e5fdcb`, cross-owner screw attribution) the same way, so Task 8's predicted 26
  landed at 28. Both are legitimate coverage, added because execution found gaps the plan's fixtures
  didn't reach — the wrongness is in the plan's running total, not in the tests it undercounted.
- **The plan's own third IndexedDB test never opened an old database.** It wrote a material rate with
  `writeLibraryEntry` (which itself calls the module's `openDb()`, already at the current schema) and
  read it straight back — passing regardless of whether `onupgradeneeded` actually added the new
  store. Rewritten (commit `164088b`) to seed a real v3 database by hand, first, then let `openDb()`
  run the v3 → v4 upgrade and read the material rate back through it. Mutation-tested on the spot by
  deleting the `hardware`-store creation line: 5 of 16 tests in the file failed (the two hardware
  round-trip tests directly, the upgrade test, and two unrelated clearance tests via a leaked IDB
  connection blocking `deleteDatabase` — a real cross-test hazard the rewrite happened to surface).
- **Tasks 13 and 14 could not be committed separately**, despite the plan listing them as two
  commits. Task 13 widens `HardwareTab`'s props; the moment they become required, `BomModal`'s
  existing call site fails whole-repo `tsc -b`, and the pre-commit hook runs that typecheck project-
  wide. Landed as one commit (`18775fb`) instead of a broken intermediate state.

**One Critical defect reached the tree and was caught only by review.** The first cut of the
generated unit-cost input (`18775fb`) used an uncontrolled `<input defaultValue={row.unitCost ?? ''}>`
with `onChange={(e) => onSaveHardwareEntry(row.key, { …, unitCost: Number(e.target.value) })}`.
`Number('-')` is `NaN`, and nothing guarded it: an interim keystroke while typing a price persisted
`NaN` straight into the global IndexedDB hardware library, and every consumer that read it back
rendered the literal text `$NaN` in place of the `'—'` unpriced fallback the design exists to
guarantee. It passed TDD, a spec review and a green suite of **1757** tests. The same input being
uncontrolled compounded it: `HARDWARE_CATALOGUE` keys are shared across cabinets by design (a screw
is one key, a shelf pin is one key), so a two-cabinet project has two rows keyed identically —
`row.unitCost` on the still-mounted, never-focused row kept mirroring `defaultValue` from whichever
row's edit last wrote the library, and a fresh `derived` prop landed with the *other* row's number
showing. That was not an edge case: it is the default outcome the first time a two-cabinet project's
hardware tab is priced. Fixed (`35efc4c`) by following `DimInput`'s established split — a local echo
while typing, synced from the committed prop only while unfocused, `parseFloat` guarded to a finite
non-negative value before a debounced commit.

**Two environment facts worth recording so nobody re-learns them:**

- `parseFloat('1e')` is `1`, not `NaN` (`Number('1e')` is `NaN` — the two functions disagree on a
  trailing bare exponent marker). The fix's own explanatory comment in `HardwareTab.tsx` originally
  named `"1e"` as an example of an interim value that "parses to NaN" — checked against Node directly
  while writing this entry, found wrong, and corrected to `"e"` (which does parse to `NaN` under
  `parseFloat`) as part of closing this stage. The code's guard itself (`isFinite(v) && v >= 0`) was
  never wrong — only the comment's example was.
- happy-dom is not a browser: an *untouched* `defaultValue` input keeps silently mirroring prop
  changes across a rerender, because the "dirty value flag" a real DOM sets on the first user edit
  never gets set. `HardwareTab.test.tsx`'s stale-price regression test has to fire a no-op `change`
  event on the row it isn't editing before asserting on it, or the assertion passes on both the fixed
  and the unfixed input for the wrong reason — recorded as a comment in the test itself, verified
  directly against happy-dom's behaviour rather than against a stated fact about it.

**Decisions taken during execution that a future reader would otherwise re-litigate:**

- `cell()` in `carcaseHardware.ts` serves three purposes: the tally key, the slide-row dedupe key,
  and the emit-time lookup key. Two reviewers flagged the reuse Minor; it was deliberately kept, with
  a comment at the dedupe call site explaining why it's safe (neither a component id nor a cut id can
  contain the separator, so the composed string can't collide across the two uses).
- The four near-identical read/write/delete accessor groups in `idb.ts` (handles, library, settings,
  hardware) were not factored into a shared helper. Structurally, only two of the four — `library`
  and `hardware` — share a shape (a cursor read building a `Record<string, T>`, a keyed put, a keyed
  delete); `handles` and `settings` are single-fixed-key get/put with no cursor at all. A generic
  helper would cover library and hardware only, at the cost of an abstraction over two call sites.
  No review flagged this one either way; recording it here rather than leaving a future reader to
  wonder why four blocks look alike and stay unmerged.
- `buildHardwareCsv` stayed in `buildCsv.ts`; `groupHardware` got its own file. Seen now with both
  written: the boundary holds up because it's grouper-out (`groupHardware`, joins counts against the
  catalogue and the price library) versus serialiser-in (`buildCsv.ts`, which already pairs
  `groupParts`+`buildCsv` and `groupDowels`+`buildDowelCsv` the same way). `buildCsv.ts` is a few
  lines longer for gaining `buildHardwareCsv`'s rewrite, not shorter — the split's payoff was keeping
  the *grouping and pricing* logic (which needs the catalogue and the library) out of the file that
  only ever needed parts and dowels before. The trigger to split `buildCsv.ts` itself would be a PDF
  or DXF hardware equivalent pushing it past its current size.
- `LibraryTab` was given two new props, not the three (`hardwareLibrary`, `onSaveHardwareEntry`,
  `onDeleteHardwareEntry`) the plan listed for Task 15. The plan's own markup for that section never
  once referenced `onSaveHardwareEntry` — the Library tab only ever *lists and forgets* priced
  entries, it never writes one — and an unused prop fails lint. Confirmed by reading the plan's Task
  15 markup against the implementation before writing this line.
- A pre-existing single-argument `buildHardwareCsv([])` test (`'returns header-only with empty
  list'`) was deliberately kept rather than replaced by the new two-argument tests. It's the only
  coverage left of the default `derived: HardwareRow[] = []` parameter — every new test passes both
  arguments.
- The Forget button in the Library tab's hardware section gained destructive styling (the shared
  `Button` primitive, `variant="ghost" size="icon" text-destructive`, matching the materials Delete
  button) and a two-step Forget → Confirm/No flow, rather than the plan's plain `×` button wired
  straight to the delete. The deletion writes directly to IndexedDB, outside `useScene`'s undo/redo,
  and is global across every project that shares the library — strictly less recoverable than a
  delete inside the file, which is why it earned the same confirm pattern `HardwareEditPanel` already
  uses rather than `window.confirm`.

**The plan's own three questions, answered from evidence:**

- *Where should `groupHardware` live?* Confirmed correct having seen both files: see the
  `buildHardwareCsv`/`groupHardware` bullet above.
- *What does the `Ungrouped` group actually look like?* Rendered against `HardwareTab.tsx`'s real
  table: there is no separate heading or visual treatment for it at all. `'Ungrouped'` is just the
  string `UNGROUPED_LABEL` sitting in the same **Cabinet** column cell every real cabinet's label
  sits in, styled identically. A user scanning the generated table sees what reads as a cabinet
  literally named "Ungrouped," not a called-out exception — worth a follow-up if user-added screw
  joints between unowned parts turn out to be common enough to matter.
- *Did any mutation survive unresolved?* Re-ran the clearest one while writing this entry rather than
  trust the historical record: restored `seenSlide` deletion (Task 5's mutation A) against the
  current file — 3 of 28 tests in `carcaseHardware.test.ts` fail, cleanly restored after (`cp` from a
  scratchpad backup, never `git checkout`, `grep -c` confirmed the restore matched the original byte
  for byte). No commit message or review note in this stage's history records a mutation that was run
  and left unaddressed; the one explicit in-commit mutation record (`164088b`'s IndexedDB store
  deletion, 5 of 16 failing) also came back caught, not surviving.

**Found while closing, and fixed:** `BomModal`'s footer ("Boards / Dowels / Hardware / Grand
total") summed `hardwareSubtotal` from `scene.hardware` — the hand-typed items — only, so a project
priced entirely through the generated table read `$0.00` hardware and a grand total short by every
hinge, runner, pin and screw the cabinets need. The CSV one tab over already carried all three
figures, which is what made the footer's silence a contradiction rather than an omission.

Neither the spec nor the plan mentions the footer, so it is not a regression against either. It is
still this stage's to fix: before the generated rows existed the footer was correct, and adding them
is what made it wrong. Left open, the feature ships with two screens disagreeing about the same
number.

The fix adds `derivedHardware`'s priced total to the same subtotal, reusing the `?? 0` that `boards`
and `dowels` already use — so an unpriced row stays out of the total rather than counting as free,
the rule `groupHardware` states and `groupDowels` set the precedent for. Two tests, both
mutation-proven: dropping the new term fails the first, and making an unpriced row cost anything at
all fails the second. A third mutation was discarded as an equivalent rewrite — `(unitCost ?? 0) *
qty` is `totalCost ?? 0` by `groupHardware`'s own construction, so it changes no behaviour and its
survival was not a coverage gap. Worth recording, because a surviving mutation reads as one until
the two expressions are traced.
