# Resume: face frames stage 1 — stopped mid-Task 2

**Stopped:** 2026-09-24, partway through Task 2 of
`docs/superpowers/plans/2026-09-24-face-frames-stage-1-the-frame-exists.md`.

Delete this file when stage 1 is finished — it is a handover note, not documentation.

---

## Where things stand

**Branch:** `claude/next-suggested-task-z8rzaq` → **PR #52** (open, CI green on the pushed head)

| Commit | State |
|---|---|
| `f98ccdd` test: two cabinets side by side leave one reveal | pushed, green |
| `c3155be` docs: design face frames and half-overlay | pushed, green |
| `75619f3` docs: implementation plan for face frames stage 1 | pushed, green |
| `3dea8a2` feat: the face frame's geometry, stated once | **committed, NOT pushed** |
| `cf8c06c` chore: record the stopped state (Task 2 + this note) | pushed |
| `d0c6363` chore: note fixes | pushed — **CI went red here** |
| (next) Task 2 verified + EditPanel fixture fix | the green one |

**Task 2 is now verified and green.** It was pushed unverified at `d0c6363` to survive
container reclamation, and CI went red on it — one test, `EditPanel.test.tsx > offers
only materials that state a thickness`, which enumerates the material dropdown
exhaustively and so had to gain `Hardwood 20mm`. The test was right; the fixture was
stale. Fixed, and the suite is green at **108 files / 2083 passed / 10 skipped** —
exactly the figure predicted below.

**Lesson worth keeping: pushing for durability and pushing for review are different
acts.** Doing the first on a shared branch triggered CI on unverified code. Next time,
verify before the durability push, or expect to own the red.

---

## Exact stopping point

Task 2 is code-complete and `pnpm typecheck` exits **0**. It stopped at the
**verify** step, before `pnpm lint` and the full `pnpm test` had been run and
before the commit.

**Resume at Task 11 of the plan** (the Frame section in `CarcasePanel.tsx`).
Tasks 0-10 are done and verified; the suite stood at **110 files / 2148 passed** after Task 10.

**Task 10:** the plan's test asserted `isNestable(PRESET_MATERIALS['18mm Ply'])` is true — but no
preset material carries a `sheet` (sheets come from the user's library, merged at the BOM). The
test pins only what is true: the preset frame material has no sheet.

**New mutation-testing trap, found in Task 10 — add it to the notes and to CLAUDE.md's mutation
rules in Task 13:** a test that is *already red for another reason* (here a `TypeError` from a
missing import) makes a mutation look killed. Always confirm the unmutated run is green, then
check the mutated run fails with an `AssertionError` for the reason predicted.

**Task 9 — a decision Task 11 now owes.** The plan said to seed nothing; I first seeded the
frame material at load so ticking "frame" on an old file would just work. That broke the v14
test's stated principle — *the migration must not touch a file's materials* — and it was right:
every old file would gain an unused material. Reverted. **So Task 11's "turn a frame on" must
add the frame material to `scene.materials` when it is missing**, or an old file's first frame
reads "frameMaterial has no thickness". A v19 load adding nothing is now pinned by a test.

**Task 10 is mostly done:** `DEFAULT_FRAME_MATERIAL` and its sheetless preset entry landed in
Task 2. What remains is the `isNestable` test that pins it.

**Task 8 went well beyond the plan — every gap below is now closed:**
- `frontGeometryOf(p)` in `carcaseRoles.ts` is the one statement of what fronts are measured
  against; the validator, the box table, the machining and `regenerateFaceFrames` all read it.
  It carries the frame's openings only where the frame resolved.
- Full overlay needed no new x/z rule (the frame's outer edge is the cabinet's). Half-overlay is
  the existing midline rule applied to the members. Inset measures to the frame opening. The
  plan's first Task 8 test would have passed unchanged, so it was replaced.
- Doors stand on the frame (`y` moves by the frame thickness); inset is flush with its face.
- A framed door gets **no hinge machining** until stage 4 (face-frame hinges), so the BOM
  lists no hinge — the "door too thin to bore" rule.
- `carcaseBounds` counts the frame, and counts half-overlay doors (it used to ask
  `=== 'overlay'`, which would have counted a half-overlay door as zero depth).
- **The spec said the frame declares its internal contacts; the plan missed it.**
  `faceFrameContactPairs` declares stile~rail, member~carcase edge (the applied-back
  precedent) and door~frame, and the checklist honours them only within one cabinet. A framed
  Base 600 reads 10 / 10 exactly as a frameless one. Measured before: +12 open, +4 unresolved.

**Known, left for later, recorded here so it is not lost:** `insetDepthOf` sets shelves back by
the full door thickness behind a framed inset door, though that door mostly sits inside the
frame. Conservative (no collision), just deeper than needed.

**Task 6 deviations:** `reconcileBoards` moved out of `regenerateDrawers.ts` into
`src/scene/reconcileBoards.ts` (own commit, no behaviour change) so the frame shares the
preservation rules rather than copying them. `floorZ` is now exported from `carcaseRoles.ts`.
The frame **component** exists whenever the cabinet asks for a frame; its **boards** exist only
when the geometry resolves (the drawer precedent). A dropped driven frame removes its driven
boards and re-homes any user-detached board on the cabinet.

**Pre-existing bug found, NOT fixed (out of scope — raise with the user):** switching a drawer
front to a door drops the drawer component but leaves all five `box-*` boards in the scene
with a dangling `parentId` — a ghost drawer box in the viewport and the cutting list.
Reproduced through the real pipeline (5 box boards → 5, all dangling). `regenerateDrawers`
never calls `reconcileBoards` for a dropped drawer, and `promoteOrphans` only runs at file
load. Its test (`regenerateDrawers.test.ts:159`) counts components, not boards.

**Gaps the plan's Task 8 misses — do them there:**
- The frame occupies `y ∈ [−FT, 0]`, which is exactly where an overlay door sits today. A
  framed door must move **forward** by the frame thickness (overlay/half-overlay), and an inset
  door must sit inside the frame's thickness. The plan only moves it in x/z.
- `carcaseBounds` must grow by the frame thickness in front, or two anchored cabinets overlap it.
- The "overlay front is a contact" rule reads `y1 === 0`; a framed door no longer has `y1 = 0`.
  Decide what it contacts (the frame) and check the joinery checklist doesn't gain unjoined pairs.

Task 4 skipped the plan's "still refuses a role it does not know" test — it already exists at
`grain.test.ts:90` — and added a board-field check the plan missed instead.

**Task 5 made a decision the plan left open — carry it into Task 11 and the notes.** A
validation error refuses the *whole* cabinet (`carcaseBoxes` returns `[]`). So only the
frame's own impossibilities are errors (no opening, zero-width member, half-overlay with no
frame). A frame stage 1 cannot build — split cabinet, drawer front — is deliberately **not** an
error, or ticking "frame" would make the cabinet vanish; the geometry declines quietly instead.
**Task 11 must therefore show a warning** when `frame` is set but `faceFrameGeometry` returns
null, or the user ticks the box and sees nothing. Task 5 also asks the frame material's
thickness (framed cabinets only) and names `frameMaterial` in the message — both missing from
the plan.

**Add to Task 12's mutation table:** validation's `floorZ(p)` → `0` should kill *measures the
rails from the carcase floor*.

Baseline to compare against (measured at Task 0, on `75619f3`):
**107 files, 2070 passed, 10 skipped**; typecheck 0, lint 0.

Task 1 added 13 tests, so **2083 passed / 108 files** is the expected figure if
nothing else moved. A *lower* number than 2083 means something regressed — read
it, do not wave it through.

If both are clean, Task 2 is verified — amend or follow up with a proper
`feat(scene): the face frame model` commit message if you want the history to read
cleanly, then carry on at Task 3 in the plan.

If either is red, the fix belongs on top of `cf8c06c`; do not reset it.

---

## What Task 2 changed (10 files, inside `cf8c06c`)

Task 2 is "the model", plus the fallout `tsc` named. All of it traces to the plan.

**The model itself** — `src/scene/types.ts`
- `FaceFrameParams` (added early, during Task 1 — see deviations below)
- `CarcaseParams.frame?: FaceFrameParams` — absent **is** frameless
- `CarcaseParams.frameMaterial: string` — a fourth material slot
- `frontMount` widened to `'overlay' | 'half-overlay' | 'inset'`
- `FaceFrameComponent` + added to the `Component` union

**Fallout `tsc` named, each fixed deliberately:**

- `carcasePresets.ts` — `DEFAULT_FRAME_MATERIAL = 'Hardwood 20mm'`, thickness 20,
  **deliberately no `sheet`** so `isNestable` excludes it; `frameMaterial` on `COMMON`.
  Presets stay frameless (`frame` absent), which is what keeps this slice opt-in.
  *(This pulls Task 9's material forward — Task 9's test then just pins it.)*
- `hardwareCatalogue.ts` — `hingeKeyFor` now returns `string | undefined` and
  **declines on half-overlay**: that door hangs on a face-frame hinge, which is
  stage 4 and not catalogued. Declining follows the existing rule that a door too
  thin to bore lists no hinge. It is *not* a silent fallback to an overlay hinge.
- `carcaseHardware.ts` — skips the row when `hingeKeyFor` declines.
- `frontCells.ts` — `FrontGeometry.mount` widened; the cell branch flipped from
  `mount === 'overlay' ? …` to `mount !== 'inset' ? …` so half-overlay lands on the
  overlay side. Behaviourally identical for the two existing values. **Task 8 replaces
  this** with the real framed branch that reads the frame's own opening.
- `SceneTree.tsx` — added the `faceFrame: '🖼'` icon. The file's own comment predicted
  this ("a fourth component kind is then a compile error here"); it worked as designed.
- Four test fixtures gained `frameMaterial`, each naming a material that fixture
  already defines: `carcaseBounds.test.ts`, `carcaseRoles.test.ts`,
  `regenerateComponents.test.ts`, `resolvePlacement.test.ts`.

---

## Deviations from the plan so far — carry these into the notes file

1. **Did NOT re-branch from `origin/main`.** The plan's Task 0 Step 1 says
   `git checkout -B … origin/main`. That would have destroyed three unmerged commits
   on open PR #52 (the reveal test, the spec, the plan). Continuing on the existing
   branch is correct; the implementation stacks on the spec it implements.
   **The plan's Task 0 Step 1 is wrong and should be corrected if reused.**
2. **`FaceFrameParams` moved from Task 2 into Task 1.** Task 1's test imports it, so
   Task 1 cannot compile without it. Tasks must each be independently green.
3. **`hingeKeyFor` and `frontCells` changes were not in the plan at all.** Widening
   `frontMount` in Task 2 forces both, and `tsc` found them. The plan put the
   `frontCells` widening in Task 8; it has to happen in Task 2 or the tree does not
   compile between the two.

---

## Remaining tasks

3 frame material slot · 4 grain · 5 validation · 6 `regenerateFaceFrames` ·
7 pipeline (five stages) · 8 door mounts to frame · 9 file format v20 ·
10 solid stock / nest · 11 CarcasePanel · 12 mutation testing · 13 docs · 14 verify + push

Task 12's mutation table gained two rows during planning (`drawer-front` guard,
`stile-` grain) — the numbering in the plan already reflects that.

---

## Two things worth re-reading before resuming

- `pnpm lint 2>&1 | tail -2 && git commit` returns **tail's** exit code and has
  masked a real lint failure in this repo. Always `pnpm lint; lt=$?`.
- During Task 12, a mutation run reporting `Tests  no tests` is a **broken mutation,
  not a survivor**. Back files up with `cp` and restore from the copy —
  **never `git checkout`**, which has cost a whole group's edits here before.
