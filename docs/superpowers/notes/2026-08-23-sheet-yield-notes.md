# Sheet yield and grain — implementation notes

**Spec:** `docs/superpowers/specs/2026-08-23-sheet-yield-design.md`
**Plan:** _(staged; written per stage)_

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered during implementation, and anything that would surprise a future reader.

## 2026-08-23 — how the scope arrived here

Worth recording because the feature looks disproportionate to its origin. It started as a
cutting-list defect: a generated cabinet side is stored `length 560, width 720`, so the list said
"cut it 560 long" for a 720 mm tall panel. Fixing *that* (Task 7.9, `cutDimensions`) raised the
question of what decides which dimension is the length — and the honest answer is grain, not size.
Grain in turn only earns its place if something consumes it, which is yield.

So the chain was: wrong label → what defines length → grain → why model grain → nesting. Each step
was a real consequence of the one before, not scope creep.

### Options rejected along the way, and why

- **Fixing the length/width swap in the geometry** rather than the cutting list. Rejected on
  measurement: `orientedPanel` maps all three board axes onto carcase axes *positively*, which is
  precisely what makes `position` the box min corner. Putting length on the long axis needs
  board x→x, y→z, z→y — a transposition, determinant −1, not a rotation. It is unreachable without
  an improper mapping, which would mean compensating position on every such panel and re-deriving
  the toe-kick notch, the joint faces, and the ladder contact decision. The cutting list was the
  cheap and correct place.
- **Guillotine nesting.** Rejected by the user in favour of free nesting (CNC). Guillotine would
  have produced a followable cut sequence; see the stated assumption in the spec for the tension
  this creates with a visual-only output.
- **No-fit polygons.** Rejected in favour of raster occupancy. NFP is the literature-standard method
  and would be exact, but its failure modes — degenerate contacts, concave-concave cases, holes,
  floating-point robustness — are the kind that consume weeks. At 1 mm, rasterisation is finer than
  router tolerance and the no-overlap property is directly checkable.
- **Continuous rotation.** Rejected: it turns an enumerable placement search into an optimisation
  over a continuous space, with run-to-run variation. A nest that shuffles on every keystroke is
  unusable in a live design tool.
- **Grain-free defaults for hidden parts** (backs, toe kicks, ladder rails). Proposed as a yield
  win and rejected by the user: every generated panel carries grain, and `free` is a manual
  override. Recorded because the yield cost of that choice is real and someone will ask.

### The board-frame subtlety

The per-role grain table lands on `width` for sides and `length` for shelves, expressing the *same*
physical convention. This is a consequence of each panel having its own board frame, not an
inconsistency. Anyone tempted to normalise it should read the `orientedPanel` parity argument first.

A property that makes Stage 1 cheap: for every generated role, the grain-running dimension is also
the larger one, so grain and `cutDimensions`' longest-first rule agree on every carcase panel. They
diverge only for a hand-made board whose grain was set across the short edge. Assert this in a test
— if it ever stops holding, a role table changed and the cutting list moved with it.

## 2026-08-24 — the spec's "grain runs along the longer dimension" property was false

**Plan:** `docs/superpowers/plans/2026-08-24-sheet-yield-stage-1-grain-and-stock.md`

Writing the Stage 1 plan meant turning the spec's role→grain table into code, and the honest way to
do that is to state the convention in *carcase* axes and derive the board field through
`orientedPanel`'s axis map rather than typing the table a second time. Doing so made the spec's
"useful property, worth asserting in a test" checkable, so it was checked — against `carcaseRoles`,
not against reasoning.

It does not hold. Two ordinary cabinets break it:

| cabinet | role | stored L × W | grain field | grain dimension |
|---|---|---|---|---|
| wall unit 1200 × 400 × 330 | `back` | 376 × 1176 | `length` | 376 — the smaller |
| 900 × 720 × 560, two dividers | `shelf-0-0` | 285 × 548 | `length` | 285 — the smaller |

A wide low wall unit is wider than it is tall, so its back's vertical grain runs across the short
way. A three-bay 900 gives 285 mm bays against 548 mm of depth, so a shelf's along-the-span grain
does too. Neither is exotic.

The property *does* hold for all three `CARCASE_PRESETS` — several of them by a margin of only a few
millimetres (`bottom` is 576 against 560; `back` on a Base 600 is 596 against 576). That is what
makes the original claim dangerous rather than merely wrong: a test written against the presets
would have passed, and the "grain and longest-first always agree" line would have been believed by
the next person to touch `cutDimensions`.

Two consequences, both now in the plan:

- The agreement test is scoped to `CARCASE_PRESETS` and its name says so, with the two
  counter-examples pinned beside it as passing tests.
- The spec's claim that "wiring grain into `cutDimensions` re-baselines no existing cutting list" is
  **wrong**. It re-baselines exactly these rows. The new answer is the correct one — grain decides
  which dimension is the length, that is what the length *means* on a sheet good — but Stage 1 owns
  a behaviour change rather than claiming none.

This is the same shape as every defect the cabinet-assembly work turned up: the claim came from
reasoning about the code, and reasoning about `orientedPanel`'s frames is exactly where this
codebase has been wrong before. Measuring took four minutes.

### Two smaller decisions taken while planning

- **`grainAxisOf` throws on an unknown role** rather than defaulting. A silent default would give a
  newly added role an arbitrary grain, no test would notice, and the only symptom would be a nest
  that comes out slightly worse for a reason nobody could trace.
- **The clearance gets its own IDB store, not a magic key in `library`.** `readLibrary` returns
  `Record<string, MaterialDef>`; a `"__clearance"` key holding a number would make that type a lie
  and force every consumer to filter it. The store costs one line in `onupgradeneeded`.

## 2026-08-24 — Stage 1 implementation

### `FILE_FORMAT_VERSION` deliberately holds at 12

A version bump earns its keep when an older *app* would misread a newer file. It would not here.
`grain` is additive and defaulted at the `parseFile` boundary; a v12 app reading a file this app
wrote simply ignores the field, and the board it renders is identical — grain changes no geometry,
only which dimension the cutting list calls the length. Bumping would force every file through a
migration that does nothing and would make "v13" mean nothing in particular.

The line where this stops being true: **Stage 1 does not cross it, Stage 3 might.** Once a `.zimmu`
file carries a nest result or a sheet definition an older app would render wrong, bump then, and let
13 mean that.

Recorded because it breaks the run of bumps through v12 and a silent omission would read as an
oversight.

### The reported grain is normalised, and a test found the first attempt wrong

The plan said a `GroupedRow` could take its grain from the first part of its group, on the reasoning
that grain feeds `cutDimensions`, whose output is in the grouping key, so a group cannot hold two
grains. The test written to check that claim failed immediately.

The reasoning was wrong in both directions. A 600×300 board with grain `length`, a 300×600 board
with grain `width`, and a 600×300 board with grain `free` all reduce to the same 600×300 cut
dimensions, so all three landed in one row — which then reported whichever grain happened to arrive
first.

Both halves are now fixed:

- **`GroupedRow.grain` is `'length' | 'free'`, not `Grain`.** After `cutDimensions` the
  grain-running dimension *is* the reported length, so a directional board always reports `length`
  and only an unconstrained one reports `free`. Printing the raw field would say "width" for a board
  whose reported length is its grain direction.
- **The normalised grain is part of the grouping key.** A part the nester may rotate and one it may
  not are different cuts even at identical dimensions.

Same shape as the false property in the spec: a claim that sounded right, was wrong, and cost four
minutes to check. The plan's Step 4 has since been rewritten to carry the correct instruction, with
the original claim quoted in place — the step's instruction to *check* the claim was the part that
was right, and deleting it would have removed the lesson along with the error.

### The role-coverage test was my error, and its shape was the worse half

An earlier deviation note here blamed the plan for the twelve-vs-thirteen role families. That was
wrong: the plan named `ladder-mid-*` explicitly among the roles the presets do not reach, and I
wrote a hand-typed list anyway and left it out.

The omission mattered less than the shape. **An enumeration test asserts a list a human typed, so it
is only ever as complete as whoever typed it** — the same failure mode as a check that enumerates
known instances and therefore cannot find the case with no instance to enumerate. It is now derived
on both sides: the families reached by the named fixtures must equal those reached by a 96-case
sweep across every `baseMode` × `backMode` × `hasTop` × divider-count × shelf-count combination, and
`grainAxisOf`'s totality is asserted over that sweep directly rather than over three presets. The
sweep reaches all thirteen families; dropping the ladder fixture fails the coverage test, and
removing `ladder-mid` from `grainAxisOf` fails the totality test.

### Two mechanical notes

- `ThicknessAxis` moved from `carcaseRoles.ts` to `types.ts`. `grain.ts` needs it and
  `carcaseRoles.ts` imports `grain.ts` back, so leaving it in place would have made a cycle.
  `carcaseRoles.ts` re-exports it, so its existing importers did not move.
- The two `kind: 'board'` literals in `useScene.ts` that build a `BuildSpec`/`ExportSpec` for the
  kernel do **not** get grain. They are geometry specs; grain is not geometry.

### Stage 1 acceptance, measured 2026-08-24

- `pnpm typecheck && pnpm lint && pnpm test` — 61 files, **1150 passed**, 10 skipped (up from 1105).
- `pnpm test:e2e` — **13 passed**, both live-kernel specs included.
- `pnpm build` — succeeds (the >500 kB chunk warning is pre-existing).
- `grep -rn "?? 'free'" src/ | grep -v useFile.ts` — nothing. The boundary normalises once.
- `carcaseRoles.ts` mentions grain three times: the import, the `RoleSpec` field, and the single
  derivation call. No per-role literal.
- Every guard added in Tasks 1.1, 1.3, 1.5 and 1.6 was mutation-tested — the axis map, the
  cutDimensions grain branch, the grouping key, the disabled control, the setter, the `hasGrain`
  default, the sheet-pair merge, and the `isNestable` zero check all go red when broken.

Not done, and deliberately: grain in the shop drawings (`buildSvg`/`buildDxf` are untouched), and
any change to `+ Board`'s `'free'` default. Both are deferred by the spec.

## 2026-08-24 — Stage 2 planning found three errors in the spec's `occupancyMask` sketch

**Plan:** `docs/superpowers/plans/2026-08-24-sheet-yield-stage-2-occupancy-mask.md`

The spec describes `occupancyMask` in one paragraph: fill the cut-size rectangle at 1 mm, clear each
box cut's footprint, apply mitre outlines, and reuse `cutFootprintCorners`. Checking each clause
against the code before writing the plan:

### `cutFootprintCorners` is the wrong seam

It returns **world-space** corners (it calls `resolveWorldMatrix` internally), takes a **`BoxCut`
only** where `CutDef` has three members, and needs a component map a pure mask function has no
business knowing. `mitreFaceOutline` in `src/geom/mitre.ts` is the seam that actually fits: pure,
board-local, in millimetres, min corner at the origin, already tested.

### "Clear each box cut's footprint" would carve a cabinet side into ribbons

**A dado is not a notch.** Measured on a Base 600 left side (560 × 720 × 18): the toe-kick notch
spans z[−9, 27] — through the 18 mm and genuinely outline-changing — while all four dados span
z[12, 18], a 6 mm groove that leaves the panel a full rectangle to cut around. Clearing all five
would let the nester tuck a neighbour into a groove.

A box cut removes outline material only when its z-span covers the whole thickness. Both live
through-cut conventions satisfy that: `computeFingerSlots` is exactly flush (z 0 → thickness) and
the toe-kick notch overshoots (−T/2 → 3T/2). See the cabinet-assembly notes for why both exist.

### And a standing defect in the shop drawings, found on the way

`BoxCut.position` is the box's **min corner**. `makeCut` builds `BRepPrimAPI_MakeBox_1(size)` — a box
over [0, size] — and translates by `position`, so the tool occupies [position, position + size]. The
generated cuts agree: a full-width dado on a 560-long panel is `position.x = 0, size.x = 560`.

**`projectCut` in `src/geom/drawing.ts:135` uses the opposite convention**, `x = (uPos - uSz/2)`,
treating `position` as the centre. Every Face-view cut rectangle on a Base 600 side is therefore
drawn offset by half its own size in both in-plane axes — measured output, board rect 56 × 72 at 0.1
scale, cut rects at x = −28, y = −36, x = −28, x = 54.2, x = 5.1, x = −28. All six outside the board.

Only `projectCut` is affected. `projectHoleArray` reads `h.start` directly with no centring, which is
why the hole-array e2e test passes and this went unnoticed.

Out of scope for sheet yield, reported separately. Recorded here so nobody reuses `projectCut` as a
reference for the mask.

### Two decisions taken in the plan

- **The mask stays in board-local axes**, not `cutDimensions`' grain-ordered pair. `cutDimensions`
  answers "which dimension does the cutting list call the length"; the mask answers "what shape is
  this on a sheet". Stage 3 reads `part.grain` to decide which rotations are allowed, and a
  pre-transposed mask would make that decision twice.
- **Rounding goes outward on dimensions and inward on the mitre polygon.** Opposite directions, same
  principle: never claim material the part does not have.

## 2026-08-24 — Stage 2 implemented

### The first dilation was O(w·h·r), and the plan's own comment said otherwise

The plan specified "a separable box dilation: one horizontal pass with a running window of `2r+1`,
then one vertical pass. O(w·h) regardless of `r`." The first implementation wrote the vertical pass
as an inner loop over the `2r+1` window, which is O(w·h·r) — and the monotonicity property, which
sweeps clearance over `[0, 4, 14, 30]`, timed out. Rewritten with prefix sums, which is what
"running window" actually requires.

**Measured after the rewrite**, and flat in `r`, which is the proof it worked:

| panel | clearance 0 | 14 | 30 |
|---|---|---|---|
| 600 × 300 | 0.7 ms | 4.6 ms | 2.8 ms |
| 2100 × 560 | 2.2 ms | 17.6 ms | 18.2 ms |
| 2440 × 1220 (a whole sheet) | 5.0 ms | 45.7 ms | 45.0 ms |

**A realistic six-cabinet job — 46 boards — is 280 ms at a 14 mm clearance, ~6 ms per board.** Well
inside a debounce, and it is a worker's job anyway from Stage 4. No budget is set beyond that: the
number to watch is the per-board figure, not the total, since Stage 3's placement search will dwarf
this.

The square-vs-disc decision stands: a cell grows if any set cell lies within Chebyshev distance `r`,
which over-reserves by up to r·(√2−1) mm at a 45° corner — always toward more clearance, never less.
A disc is the "correct" structuring element; the square is the defensible one.

### The property tests went from 59 s to 1.8 s, and got better in the process

Two separate costs, both mine:

- `expect(a.bits).toEqual(b.bits)` on a multi-million-cell `Uint8Array`. Vitest's deep equality was
  timing the determinism test out rather than finding a difference. A hand loop instead.
- Running the properties over **every** board the 96-case sweep emits — over a thousand, most of them
  near duplicates. Now deduped to **one board per role family**, which is 13.

The dedupe is better testing, not just cheaper: a family is the unit the mask rules are stated in, so
covering each once is the meaningful coverage. It also gives a free assertion — `boards.length` is
exactly 13, agreeing with the independent count in `grain.test.ts`.

### What the mask does and does not model

- **Only a through-cut clears material.** Confirmed against a Base 600: four dados span z[12, 18] on
  an 18 mm panel and leave the outline whole; the toe-kick notch spans z[−9, 27] and removes exactly
  60 × 100. A test asserts precisely that, per role, so loosening the rule fails loudly.
- **`face` is not consulted.** A box cut is an axis-aligned box in board-local space, so its
  footprint is its x-y span whichever face it was authored from.
- **Hole arrays are ignored.** A drilled hole does not change the outline anyone cuts around.
- **Only flat (`axis: 'Z'`) mitres shave the outline.** `mitreFaceOutline` filters the Face view's
  own axis itself, so a bevel through the thickness correctly leaves the footprint square — the
  widest section is what a nest must reserve.

## 2026-08-25 — Stage 3: the spec's rotation rule made a standard cabinet unnestable

**Plan:** `docs/superpowers/plans/2026-08-25-sheet-yield-stage-3-nest-sheets.md`

The spec said: "orientations are 0° and 180° always, plus 90° and 270° when the part's `grain` is
`'free'` or the material's `hasGrain` is false."

That silently assumes grain always runs along the mask's **w** axis. It does not. The mask is in
board-local axes and `BoardPart.grain` names *which board axis* the grain runs along — `'length'` is
w, `'width'` is h. Measured at a 14 mm clearance on a 2440 × 1220 sheet:

| cabinet | role | board | grain | mask | fits 0° | fits 90° |
|---|---|---|---|---|---|---|
| Tall 600 | `left-side` | 560 × 2100 | `width` | 574 × 2114 | **no** | yes |
| Tall 600 | `back` | 1976 × 576 | `length` | 1990 × 590 | yes | **no** |

Under the spec's rule a Tall 600 side is locked to 0°/180° and **cannot be placed on a standard
sheet at all**. A probe confirmed it: 6 of the 8 largest masks in a six-cabinet job failed to place.

The corrected rule is derived rather than chosen — the sheet's grain runs along its length, `grain`
names the board axis, rotation maps board axes onto sheet axes:

| `grain` | allowed rotations |
|---|---|
| `'length'` | 0°, 180° |
| `'width'` | **90°, 270°** |
| `'free'`, or `hasGrain: false` | all four |

The spec's rule is right for `'length'` parts and wrong for every `'width'` one — which is both
sides, every divider, and the toe kick.

### The spec's performance claim was right, and my arithmetic was wrong

I expected the naive bottom-left scan to be infeasible: ~3 M candidate positions × ~200 K mask cells
is 10¹¹ operations on paper. **Measured: 46 parts in 1.1 s across 31.5 M candidates.** Early
rejection carries it — in bottom-left order almost every candidate collides on its first row and
costs a handful of comparisons, never a full mask scan. Recorded because the arithmetic is seductive
and wrong, and someone will redo it.

The real implementation is slower than that probe — **5.4 s for a six-cabinet job, 46 parts → 8
sheets, 0 unplaced, 62–86% utilisation** — because it tries *every open sheet* before opening a new
one, which the probe did not. That is a deliberate trade: a part rejected from sheet 1 often fits
sheet 2's offcut, and only looking at the newest sheet wastes stock. 5.4 s is a worker's job, which
is Stage 4.

**A free-area prune was tried and removed.** Skipping any sheet whose remaining free area is less
than the part's area is provably result-preserving and costs nothing to maintain. It bought
5.38 s → 5.32 s, i.e. nothing: the cost is not in scanning full sheets but in scanning sheets that
have area free and no room for *this shape*. Removed rather than kept, since dead complexity is
worse than none. Recorded so the next person with the idea can skip it.

### `unplaced` is not in the spec and had to be added

A part larger than the stock in every allowed rotation has no home. Dropping it silently would make
the sheet count a lie, and a 3000 mm panel on a 2440 mm sheet is an ordinary user mistake rather
than an impossible state.

### Two mutations survived the first pass, and both were test gaps

- **Dropping the id tie-break in the sort changed nothing.** `Array.prototype.sort` is stable, so
  nesting the *same array* twice is deterministic either way. The tie-break exists to make the
  result independent of input *ordering*, so the test now shuffles the items deterministically and
  asserts an identical nest.
- **Restricting placement to the newest sheet changed nothing.** The fixture did not create the only
  arrangement that distinguishes the rules: a part that fits an *earlier* sheet but not the latest.
  It cannot happen with full-width parts — sorting by area descending guarantees the earlier sheet
  is the fuller one — so the test now uses an L-shaped leftover: a 1220 × 1220 part leaves a
  full-height column on sheet 1, a 2440 × 600 part needs the whole width and opens sheet 2, and a
  1220 × 700 part fits the column but not sheet 2's strip.

Both now fail when mutated. The general lesson, again: a test that cannot fail is not evidence, and
the way to find out is to break the line on purpose.

## 2026-08-25 — Stage 4: the worker and the Sheets tab

### End-to-end measurement

Measured on the real `nestJob` path — masking and placement in one call, as the worker does it:

**Six cabinets, 46 boards, 2440 × 1220 stock, 14 mm clearance: 4.82 s** — 384 ms masking, 4.44 s
placement, 8 sheets, nothing unplaced. Close enough to Stage 3's standalone 5.4 s that the two
stages compose additively, which is what the plan asked to confirm rather than assume.

That figure is why the nest is gated on the Sheets tab rather than run in the background.

### The hook depended on object identity and hung the suite

`useNest`'s first version depended on `parts` and `materials` directly. Both are fresh objects on
almost every render — `effectiveMaterials` is rebuilt inside `BomModal` each time — so the effect
re-ran on every render, set state, re-rendered, forever. The test run hung rather than failed.

It now depends on a **derived signature** built from `shapeKey`, which already encodes exactly what
changes a board's shape, and is exactly what `occupancyMask` reads. No second copy of that rule.

### eslint forced a better design than the plan specified

The rewrite wrote refs during render and called `setState` synchronously inside the effect, both of
which `react-hooks` rejects. **And it was committed anyway**, because the verification command was
`pnpm typecheck && pnpm lint 2>&1 | tail -1 && git commit` — the pipe made the exit status `tail`'s,
so the `&&` never short-circuited on a red lint. Check exit codes directly, not through a pipe.

Fixing it properly meant keying stored results by the signature they were computed for, which makes
both outputs **derived**:

- `reports` is `fresh ? stored.reports : []` — a result belonging to a different scene can never be
  shown as current, and nothing has to be cleared when the tab closes.
- `pending` is `enabled && groups.length > 0 && !fresh` — correctly true during the debounce window
  too, when nothing is running yet but the answer on screen is already wrong.
- Reopening the tab on an unchanged scene reuses the previous nest instead of recomputing it, which
  falls out for free.

Better than what the plan described. The lint rule was right and the plan was lazy.

### A type error surfaced a real lifecycle bug

Wiring `useNest` into `App.tsx` failed with "`cuttingListOpen` used before declaration". The obvious
fix — reorder, or guard with `sheetsTabOpen && cuttingListOpen` — would have papered over the actual
problem: closing the modal while on the Sheets tab leaves `sheetsTabOpen` true forever, so every
later scene edit runs a 4.8 s nest for a report nobody can see.

The fix belongs in `BomModal`, which owns that lifecycle: its effect returns
`onSheetsTabChange(false)`, and a test unmounts on the Sheets tab to prove it.

### A mutation that never applied looked exactly like a surviving one

While mutation-testing `buildSheetSvg`, the "always draw the label" mutation reported the test as
surviving. The mutation had never applied — prettier reflowed the `const fits =` line after the file
was written, so the string replacement matched nothing and the run tested unmodified code.

**Grep the file after applying a mutation.** A no-op replacement and a genuinely surviving mutation
produce identical output, and only one of them means anything.

## 2026-08-25 — the six claims re-verified, and the spec finally corrected

All six were re-checked against merged `main` rather than against memory. Every one still holds:

| # | Claim as originally written | Measured on main |
|---|---|---|
| 1 | Grain always runs along the longer dimension | False — wide wall `back` grain=`length` at L=376 vs W=1176; narrow `shelf-0-0` grain=`length` at L=285 vs W=548 |
| 2 | `cutFootprintCorners` is the masking seam | Wrong seam — it calls `resolveWorldMatrix`, takes `cut: BoxCut`, needs `byId`. `src/nest/` never imports it |
| 3 | Clear each box cut's footprint | Base 600 side has 6 box cuts, **1** through; the mask removes exactly 6000 mm², the 60 × 100 notch |
| 4 | Grained parts get 0°/180° | Tall side mask 574 × 2114, grain=`width`, allowed 90/270, fits only at 90/270 |
| 5 | Row grain from the first part of a group | `cutGrain(p)` is in the grouping key in `buildCsv.ts` |
| 6 | The dilation is O(w·h) | Now flat in `r`: 1 / 28 / 49 / 45 ms at clearance 0 / 14 / 30 / 60 |

### The gap that was still open

The code and plans were right, but **the spec still stated claims 2, 3 and 4 as originally written**.
Only claim 1 had been given a Correction section. Anyone reading the approved design fresh would have
been misled three times — and the spec is the document a future stage starts from.

Now corrected in place, each with a dated block quoting what it originally said and the measurement
that disproved it. The corrections are inline rather than collected at the top, so a reader hits the
right instruction and the reason for it in the same place.

### Four questions put to the user, three of which confirmed the code

- **Sheet grain along the length** — confirmed as always true for the stock in question, so
  `allowedRotations` keeps its assumption and no per-material direction is added.
- **The through-cut test stays exact.** A cut leaving even 0.5 mm of web keeps the part one piece, so
  the mask treats it as solid. Erring solid never claims material that is not there.
- **The cutting list keeps Length × Width with a Grain column**, even where the length is the smaller
  number. That is the point of the change: on a sheet good the length is the grain direction, not the
  bigger dimension.

Only the spec needed an edit. Recorded because "the code is right" and "the document is right" are
different claims, and this session had been conflating them.
