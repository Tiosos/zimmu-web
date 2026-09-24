# Face frames and half-overlay — implementation notes

**Spec:** `docs/superpowers/specs/2026-09-24-face-frames-design.md`
**Plans:** one per stage, `docs/superpowers/plans/YYYY-MM-DD-face-frames-stage-N-*.md`

Living record of decisions that do not belong in the spec — why an approach was rejected, what was
discovered during implementation, and anything that would surprise a future reader.

## 2026-09-24 — how this slice was chosen

Not from a roadmap entry. Three shipped specs defer it in almost the same words, and the most recent
of them — cabinet placement — says outright *"This design unblocks them."* Placement completed the
same day (stages 1–4, PRs #48, #49, #50, #51), so the blocker named in writing was removed on
purpose rather than incidentally.

Placement also justified itself partly by naming **two shipped claims that were unreachable without
it**. The first, `frontReveal`'s documented gap between the doors of two cabinets standing side by
side, was closed immediately afterwards by `adjacentFronts.test.ts` (PR #52) — and closing it
corrected a derivation: reasoning from the stated midline rule predicts a gap of `thickness +
reveal`, while the generator gives exactly `reveal`, because an overlay cell reaches the cabinet's
*outer edge* at the cabinet boundary. **Half-overlay is the second claim, and this slice is what
closes it.**

## 2026-09-24 — the decision that matters most, and why the spec's own wording is misleading

The cabinet-assembly restructure describes half-overlay as existing *"to share a face-frame stile
between neighbouring cabinets"*. Read literally, that says a door's size depends on whether a
cabinet stands next to it — which would make `regenerateComponents` read a neighbour, something it
has never done and which would end its being a pure function of one cabinet's parameters.

That reading was put to the user explicitly as an option and **rejected in favour of the
per-cabinet rule**: a half-overlay door laps its own stile by a fixed amount regardless of what is
beside it. The shared stile is then a *consequence* of two cabinets standing together, not a rule
either of them follows.

Recorded because the literal reading is the one a future implementer will reach for — it is what
the older spec appears to say — and because the argument for rejecting it is architectural rather
than cosmetic.

## 2026-09-24 — what decision 2 costs, stated so it is not rediscovered

The section tree drives the frame, which keeps *the section tree is the only description of a
cabinet's interior division* true. The price is real: **a centre stile cannot appear on the face
without a partition behind it**, and real face-frame cabinets sometimes want exactly that.

A per-leaf frame override was considered and rejected as a second place to describe the face. If
that constraint turns out to matter more than the single-tree invariant, the override is where to
look — but it should be a decision taken deliberately, not a patch applied when the first awkward
cabinet appears.

## Open questions carried into implementation

- **Three figures are stated, not derived**, and no test here can falsify them: face-frame hinge
  geometry, the default stile and rail widths, and the half-overlay lap. Same class as the hinge
  table and the TANDEM figures. They want a woodworker's eye.
- **`isNestable` must exclude frame members.** They are solid stock, and the nest is a sheet-goods
  layout. Flagged in the spec's risks because it is the easiest consequence to miss.
- **Two passes will add and remove components** once `regenerateFaceFrames` lands;
  `regenerateDrawers` was the only one, and that invariant is stated in `CLAUDE.md`.

## 2026-09-24 — stage 1 implemented

**Plan:** `docs/superpowers/plans/2026-09-24-face-frames-stage-1-the-frame-exists.md`

A framed cabinet with one opening and a door now emits a frame, hangs the door on it in all three
mounts, and reads 10 / 10 on the joinery checklist exactly as a frameless one does. A frameless
cabinet is untouched: the frame stage hands its scene back by identity.

### The three open questions above, answered

- **`isNestable` needed no change.** It keys off the *material*, so a frame material with no
  `sheet` is excluded by what it is made of. A test pins that the preset frame material carries no
  sheet. The plan's companion assertion — that the preset carcase material *is* nestable — was
  false: no preset carries a sheet; sheet sizes come from the user's library, merged at the BOM.
- **Two passes now add and remove components**, and `CLAUDE.md` says so in both places it used to
  say one.
- **The stated figures** are `DEFAULT_FRAME` (38 stiles, 38 rails, 51 mid stile, 38 mid rail) in
  `carcasePresets.ts` and the half-overlay lap (half a member, less half a reveal). Still unverified.

### Four corrections the plan made to the spec before any code

Recorded at the top of the plan. In short: `isNestable` (above); no `frameMode` field, since
`frame === undefined` is frameless; the frame takes the front *rectangle* rather than computing a
floor from `baseMode` — the first draft wrote `carcaseZ0`'s rule and would have run every toe-kick
cabinet's frame to the ground, and named a `'plinth'` mode that does not exist; and the frame
material is a fourth *slot*, not a field on the parameter bag.

### Where the implementation left the plan, and why

- **Task 0 said to re-branch from `origin/main`.** That would have destroyed three unmerged commits
  on the open PR — the reveal test, the spec and this plan. Continued on the branch instead. The
  plan's Task 0 is wrong for any stage whose spec lands on the same branch.
- **`FaceFrameParams` moved into Task 1**, because Task 1's test imports it.
- **Widening `frontMount` in Task 2 forced two changes the plan put later or not at all:**
  `hingeKeyFor` declines on half-overlay (no face-frame hinge is catalogued), and `frontCells`
  had to accept the new mount. `tsc` found both.
- **Validation (Task 5) raised a question the plan did not.** A validation error refuses the
  *whole* cabinet. So only the frame's own impossibilities are errors, and a frame stage 1 cannot
  build is a panel note — otherwise ticking "frame" on a divided cabinet makes it vanish. The
  validator also has to ask the frame material's thickness (it is total by design) and blame the
  frame slot, not the carcase one.
- **`reconcileBoards` moved out of `regenerateDrawers` (Task 6)** so the frame shares the
  preservation rules rather than copying sixty lines of them. Its own commit, no behaviour change.
- **The frame component exists whenever the cabinet asks for one; its boards only where the
  geometry resolves** — the drawer's precedent. **A dropped driven frame removes its driven boards
  and re-homes any detached one on the cabinet**, rather than orphaning them (see the drawer bug
  below).
- **Task 7's test could not fail.** "Apply twice and compare" is idempotence, and passes with the
  stage unwired. Replaced by one that requires a framed cabinet to come out framed, and one that
  requires the frame stage to return a frameless scene by identity.
- **Task 8 was far larger than planned.** Full overlay needed no new x/z rule (the plan's first
  test passed unchanged); half-overlay turned out to be the existing midline rule; but the door also
  had to move *forward* by the frame's thickness, `carcaseBounds` had to count the frame (and turned
  out to count a half-overlay door as nothing, asking `=== 'overlay'`), a framed door had to be
  bored for no hinge until stage 4, and — **what the spec asked and the plan missed** — the frame
  had to declare its contacts. Measured before: a framed Base 600 gained 12 open checklist rows and
  4 unresolved forever. `frontGeometryOf` now states once what every front is measured against.
- **Task 9 first seeded the frame material at load, and was wrong to.** It broke the v14 test's
  principle that a migration does not touch a file's materials — every old file would gain an
  unused one. Moved to Task 11's `onSetFrame`, which adds it only when absent and in the same undo
  step as the frame.
- **Task 11 grew `onSetFrame`**, threaded App → Sidebar → CarcasePanel, so a frame and its material
  land as one undo step; and it puts half-overlay back to overlay when the frame comes off, since
  otherwise the validator refuses the whole cabinet.

### Found in passing, not fixed — a pre-existing drawer bug

Switching a drawer front to a door drops the drawer *component* but leaves all five `box-*` boards
in the scene with a dangling `parentId`: a ghost drawer box in the viewport and the cutting list.
Reproduced through the real pipeline (five box boards before, five after, all dangling).
`regenerateDrawers` never reconciles a dropped drawer's boards, `promoteOrphans` runs only at file
load, and `regenerateDrawers.test.ts:159` counts components rather than boards. The frame pass does
not repeat it. Out of scope here; raised with the user.

### Known and left

`insetDepthOf` sets shelves back by the full door thickness behind a framed inset door, though that
door mostly sits inside the frame's own thickness. Conservative — nothing collides — just deeper
than it needs to be.

### Mutation testing

Thirty-six mutations through a harness that asserts each replacement matched exactly once, checks
the unmutated suite is green first, records why each test failed, and restores byte-identical. 34
killed as predicted. **The two survivors were the two predicted** — `<=` becoming `<` (every
decline case used a negative opening; an exactly-zero one now pins it) and reconciling a detached
frame's boards (survival was tested, being left alone was not). Both are killed now. Row 5 fails
with a `TypeError` by construction; row 22 with Testing Library's own "unable to find" error — both
the right reason.

A new trap, now a fourth rule in `CLAUDE.md`: **a test already red for another reason makes a
mutation look killed.** It happened here — a missing import made the test throw a `TypeError`
before any mutation was applied.

| # | Mutation | Result | Tests failed | Why |
|---|---|---|---|---|
| 1 | rails span the full width | KILLED as predicted | 1 | AssertionError |
| 2 | stiles stop at the rails | KILLED as predicted | 2 | AssertionError |
| 3 | members start at 0, not outer.z0 | KILLED as predicted | 2 | AssertionError |
| 4 | drop the split guard | KILLED as predicted | 1 | AssertionError |
| 5 | drop the frameless guard | KILLED as predicted | 1 | TypeError (crash-by-design) |
| 6 | opening ignores the rails | KILLED as predicted | 1 | AssertionError |
| 7 | <= becomes < in the opening guard | SURVIVED (predicted) | 0 | - |
| 8 | drop the drawer-front guard | KILLED as predicted | 1 | AssertionError |
| 9 | a stile's grain is x | KILLED as predicted | 3 | AssertionError |
| 10 | frame roles fall through to the carcase slot | KILLED as predicted | 2 | AssertionError |
| 11a | key only driven frames | KILLED as predicted | 1 | AssertionError |
| 11b | regenerate a detached frame's boards | SURVIVED (predicted) | 0 | - |
| 11c | dropped frame keeps its boards | KILLED as predicted | 2 | AssertionError |
| 11d | no re-homing of a detached board | KILLED as predicted | 1 | AssertionError |
| 11e | frame behind the carcase face | KILLED as predicted | 1 | AssertionError |
| 12 | inset measures to the carcase, not the frame | KILLED as predicted | 3 | AssertionError |
| 13 | half-overlay laps the whole stile | KILLED as predicted | 4 | AssertionError |
| 13b | a section the frame does not cover borrows its opening | KILLED as predicted | 1 | AssertionError |
| 14 | no frameMaterial default on load | KILLED as predicted | 1 | AssertionError |
| 15 | validation measures rails from the ground | KILLED as predicted | 1 | AssertionError |
| 16 | door depth ignores the frame | KILLED as predicted | 2 | AssertionError |
| 17a | cups bored into a framed door | KILLED as predicted | 3 | AssertionError |
| 17b | plates screwed behind the stile | KILLED as predicted | 3 | AssertionError |
| 18 | bounds count only '=== overlay' doors | KILLED as predicted | 1 | AssertionError |
| 19 | bounds omit the frame | KILLED as predicted | 4 | AssertionError |
| 19b | bounds count a declined frame | KILLED as predicted | 1 | AssertionError |
| 20 | validator never asks the frame material | KILLED as predicted | 1 | AssertionError |
| 21 | half-overlay kept when the frame comes off | KILLED as predicted | 1 | AssertionError |
| 21b | seed the material unconditionally | KILLED as predicted | 1 | AssertionError |
| 21c | never seed the material | KILLED as predicted | 1 | AssertionError |
| 22 | panel never notes a declined frame | KILLED as predicted | 1 | - |
| 23 | a frame with no driven flag loads driven | KILLED as predicted | 1 | AssertionError |
| 24 | a door on the frame is not a declared contact | KILLED as predicted | 3 | AssertionError |
| 24b | members never meet | KILLED as predicted | 4 | AssertionError |
| 24c | a frame pair honoured across cabinets | KILLED as predicted | 1 | AssertionError |
| 25 | the preset frame material gains a sheet | KILLED as predicted | 1 | AssertionError |

### The CI red on `d0c6363`

Task 2 was pushed unverified so a reclaimed container could not take it, and CI went red: one
`EditPanel` test enumerates the material dropdown and had to gain the frame material. The test was
right. Pushing for durability and pushing for review are different acts; the first should still
wait for the checks.
