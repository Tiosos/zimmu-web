# Cabinet restructure Stage D — section interiors and real adjustable shelves

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move adjustable shelving off the cabinet and onto the section that actually holds it, so pin rows stop being bored where nothing can rest on them — and make the shelves themselves real boards that reach the cutting list.

**Architecture:** `Section` gains an `interior`. Pin rows are contributed *by a section to the panels that bound it* rather than owned by a panel, which inverts who asks whom. Shelf boards are new driven roles keyed on the section id.

**Tech Stack:** TypeScript strict, Vitest, React 19. Pure modules plus one panel.

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Preceded by:** Stage A (section tree), Stage B (materials own thickness), Stage C (screw joints)

---

## The finding that reshapes this stage

**The spec conflates two different numbers.** Its Stage D line treats `adjustable.count` as "how many
shelves are in this opening". It is not. `CarcasePanel.tsx:387` labels it **"Pin count"**, and
`carcaseHoleArrays` passes it straight to `HoleArrayCut.count` — the number of *holes in the row*.

A Base 600 ships `count: 10`. Built as the spec reads, every section would sprout **ten shelves**
instead of ten pin positions.

**There is no shelf count anywhere in the model today.** Adjustable shelves have never been boards —
only bores. So this stage adds a genuinely new field, and the two must stay distinguishable:

```ts
adjustable: {
  shelves: number   // NEW — how many boards actually sit in this section
  count: number     // pin positions in each row. What "Pin count" has always meant.
  rows: 1 | 2
  pitch: 32
  setback: number
  backSetback: number
}
```

Name them so the difference cannot be misread at a call site. `shelves` and `count` side by side is
already better than two fields both called count, but if a clearer pair of names occurs to you while
implementing, take it and say so in the report.

## A second, smaller deviation from the spec

The spec's `InteriorSpec` carries `fixedShelves` as well. **Leave it out.** Stage A turned fixed
shelves into horizontal *splits* with `division: 'panel'`, and until fronts exist (Stage E) a section's
interior fixed shelf is observationally identical to a split that makes one. Adding the field now
would create two ways to say the same thing with no way to tell them apart — the exact failure the
section tree was introduced to remove.

`interior.fixedShelves` belongs to Stage E, alongside the front that makes "behind the door" mean
something.

---

## What is wrong today, precisely

`carcaseHoleArrays(p, …, role)` asks: *given this panel, what rows go on it?* It answers from the
cabinet-wide `p.adjustableShelves`, boring from `startHeight` up the panel's whole extent, on every
face `pinFaces` allows. A divider therefore gets a full-height row **on both faces** — including the
side facing a drawer bank, where nothing can ever rest on it.

Stage A deferred this deliberately: all three presets ship `fixedShelves > 0`, so changing bore
extents then would have destroyed its output-identity property.

The inversion this stage makes: **a section contributes rows to the panels that bound it.** A panel's
rows are the union of what every section it bounds asks for. `boundsOf` (Stage A) already answers
which panels bound a section, so the machinery exists.

`startHeight` — an absolute height above the carcase floor — disappears with it. A section's rows
start at the section's own bottom plus an inset. That is a deliberate behaviour change and the whole
point of the stage.

---

## Commits by green boundary

The gate is a Claude Code `PreToolUse` hook running `pnpm typecheck`; `--no-verify` is inert.
**Never** edit `.claude/settings.json` or `.claude/hooks/`.

| commit | covers | why it is green |
|---|---|---|
| **A** | `InteriorSpec` type + `sectionInteriors(tree, root)` listing every leaf's spec, rect and bounds | new module, no consumer |
| **B** | the switch — `Section.interior`, `adjustableShelves` off `CarcaseParams`, per-section bores, v16 migration, presets | behaviour changes deliberately |
| **C** | adjustable shelves become real driven boards | adds parts; re-baselines part counts and the nest |
| **D** | per-section shelf editing in the UI | |
| **E** | close-out | |

**B and C are separate on purpose.** B changes where holes go; C changes how many parts exist. C moves
`e2e/carcase.spec.ts`'s `toHaveCount(partsBefore + 7)` and the Sheets tab's nest figures, and mixing
that with a bore change would make a failure ambiguous.

---

## Group A — the interior spec

`src/scene/sectionInterior.ts`:

```ts
export interface AdjustableSpec {
  shelves: number // boards seated in this section
  count: number // pin positions per row — what the panel's "Pin count" has always meant
  rows: 1 | 2
  pitch: 32 // literal, not number: 32 mm *is* the system being modelled
  setback: number // front row, from the panel's front edge
  backSetback: number // back row, from the panel's back edge
}

export interface InteriorSpec {
  adjustable: AdjustableSpec
}
```

Plus `sectionInteriors(root, tree)` returning, for every **leaf** section that asks for anything, its
`{ sectionId, rect, bounds, spec }`. A split section holds no interior — its children do. Use
`resolveSections`' existing `rects` and `boundsOf`; do not re-walk the tree.

Tests: a lone leaf with shelves is listed; a leaf asking for nothing is not; a split section is never
listed but its children are; a nested tree lists every leaf at every depth.

- [x] **Acceptance:** the full suite passes with its count unchanged apart from your additions. Nothing consumes this yet.

## Group B — the switch

### B1 — `Section.interior`

Optional (`interior?: InteriorSpec`): most sections want nothing, and a required field would put an
empty spec on every leaf in every saved file.

### B2 — `CarcaseParams.adjustableShelves` is deleted

Every read site follows. `pnpm typecheck` names them.

### B3 — bores are contributed, not owned

`carcaseHoleArrays(…, role)` now answers: *which sections does this panel bound, and what do they
ask for?* For each such section, one row per `rows`, spanning that section's own z-range:

- the row starts at the section's rect bottom plus an inset, **not** at an absolute `startHeight`
- the count is capped by the section's own height, not the panel's
- a panel bounding two sections that both want shelves gets **two rows on that face**, and their ids
  must not collide — the id is currently `holes_${role}_${i}`, which is unique per panel; make it
  unique per (panel, section, row).

**The test that matters:** a divider between a section with shelves and a section without gets rows
on **one face only**. That is the defect this stage exists to fix, and it is unrepresentable today.

- [x] **Mutation check:** bore every section's rows into both of a divider's faces regardless. Confirmed FAILS (4 cuts on 2 faces, expected 2 on 1), restored, grep-verified both ways.

### B4 — file format v16

`adjustableShelves` moves from params onto every leaf's `interior.adjustable`, with `shelves` seeded
at **0** — a pre-v16 file had no shelf boards, and inventing some would silently change what the user
saved. `startHeight` is dropped; record in the notes that a pre-v16 file's rows may move, and why
that is the correction rather than a regression.

`CLAUDE.md` records that `base.params` is loosely typed in `useFile.ts` so `tsc` cannot see a
file-format regression there — **a `parseFile` test is required**, not a green typecheck.

### B5 — presets

`PRESET_MATERIALS`-style: each preset's leaves carry the interior the cabinet used to. Base 600 and
Wall 600 keep their pin geometry; `shelves: 0` for now, since group C is what makes boards.

## Group C — adjustable shelves become boards

New roles `adj-shelf-{sectionId}-{i}`, sized to the section's rect less a running clearance on each
side, seated at pin positions distributed through the section's height.

- `grainAxisOf` must answer for the new family — a shelf runs grain across the cabinet (`'x'`), like
  `bottom` and a horizontal division. It throws on an unknown role by design; that throw is the
  reminder, not a bug.
- They are **driven parts** like any other: `regenerateOne` reconciles them by role key, and a
  detached one survives.
- They must reach the cutting list and the nest — that is the point. **Expect the Sheets tab e2e and
  the part-count e2e to move**, and fix them to the new truth.

**The clearance is a chosen figure**, not a derived one. Name it as a constant and say so in the
comment, the way `MAX_LADDER_SPAN` and `MAX_SCREW_SPACING` do.

Tests: a section with `shelves: 3` emits three boards; each spans the section's clear width less
twice the clearance; they sit at pin positions, not at arbitrary heights; `shelves: 0` emits none.

## Group D — the UI

`CarcasePanel`'s Shelving section currently edits the cabinet-wide bundle. It now edits **the selected
section's** interior. If no section is selected there is nothing to edit — say so rather than falling
back to editing all of them, which would undo the stage.

Selecting a section is not yet possible from the panel (the elevation editor is Stage G). Use whatever
selection already exists — the scene tree selects parts, and a part knows its section from its role
key. **If that route is not clean, stop and report** rather than building a section picker; that is
Stage G's job.

**Stopped, 2026-08-29.** The route does not exist: `sidebar.tsx` renders `CarcasePanel` only for a
selected *carcase* and `EditPanel` only for a selected *part*, so selecting an `Adj Shelf` hides the
panel that would edit it. And a section with `shelves: 0` has no board to select, so the route could
never *add* shelving — only edit an opening that already has some. See the notes entry for the full
finding. The Shelving section keeps its two v12 shim fields until Stage G.

## Group E — close the stage

- [x] `pnpm typecheck && pnpm lint && pnpm test` — 1379 passed, 10 skipped, 76 files
- [x] e2e → 15 passed. Three specs moved to the new truth: `carcase.spec.ts` (7 → 9 roles) and both `sheets-tab.spec.ts` tests (8 → 10 boards; 1 sheet at 61% → 2 sheets at 41% mean).
- [x] `CLAUDE.md`: v16, `sectionInterior.ts`, and three invariants — the pin row belongs to a section, a shelf sits on a pin that exists, a loose shelf touches nothing.
- [x] `node scripts/update-structure-html.mjs`, plus the hand-written version prose, which was stale at v12.
- [x] Notes: the pin-count-vs-shelf-count finding; that pre-v16 rows move and why; which e2e moved; the group D blocker.

## Acceptance

- [x] A divider between a shelved section and a drawer bay is bored on **one face only**
- [x] A section's rows start at its own bottom, not at an absolute cabinet height
- [x] `shelves: 3` produces three boards that appear in the cutting list
- [x] A pre-v16 file opens, keeps its pin geometry, and gains no shelf boards it did not have
- [x] Every mutation check above was run and reported

## What Stage D deliberately does not do

- No `interior.fixedShelves` — Stage E, with the front that gives "behind the door" a meaning.
- No section picker in the UI — Stage G.
- No rollouts, no pull-outs: a shelf is a board on pins.
