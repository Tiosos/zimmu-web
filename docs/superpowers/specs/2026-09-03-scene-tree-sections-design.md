# Cabinet restructure Stage G3 — the scene tree mirrors the section tree

**Status:** Approved 2026-09-03. Not yet implemented.

**Goal:** A cabinet's openings appear in the scene tree as selectable rows, with the parts each
opening owns nested under it — so the tree, the elevation and the 3D model are three views of one
structure rather than three unrelated lists.

**Architecture:** One pure module states which opening owns which part; `SceneTree` renders what it
returns. The elevation's separate section pick is folded into `Selection`, so the app has one
selection instead of two.

**Tech Stack:** TypeScript strict, Vitest, React 19. No new dependency, no file-format change.

**Spec:** this file
**Plan:** _not yet written_
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`

---

## Why now

G1 deferred this deliberately: *"presentation only; worth doing once the editor exists and the
grouping can be judged rather than guessed."* That condition is met. The elevation exists, the
projections exist, and a cabinet's structure is now visible in three places — so the grouping can be
judged against something real.

The problem it solves is concrete. A Tall 600 expands into thirteen boards with nothing saying which
door closes which opening, or which shelf sits behind which door. The section tree already knows;
the scene tree does not show it.

## What this stage is not

- **Not a second editor.** Split, merge and size stay in `SectionToolbar`. `editSection.ts` gains no
  new caller. CLAUDE.md already warns that an SVG click handler was "the worst place for a fourth
  copy of those rules"; a tree context menu would be a fifth.
- **Not a file-format change.** `FILE_FORMAT_VERSION` stays at 17. Nothing in `regenerateComponents`
  or `carcaseRoles` is touched. If a task starts editing either, the design has drifted.
- **No visibility toggle on a section row.** Visibility lives on the part; hiding a section would
  write several parts and raise an undo-granularity question this stage does not need to answer.
- **No drag to reorder or reparent.** The tree reflects structure; it does not restructure.

## The ownership rule

`src/scene/sectionNodes.ts` — pure, no React, no THREE, beside `sectionTree.ts` and
`sectionInterior.ts`.

```ts
export interface SectionNode {
  sectionId: SectionId
  parts: Part[]        // this opening's own parts, in role order (driven parts only)
}

export function sectionNodes(
  openings: SectionOpening[],
  parts: Part[],
): { sections: SectionNode[]; carcase: Part[] }
```

**It is handed resolved openings, and it does one job: mapping parts to them.** It neither resolves
the tree nor validates the cabinet, so its tests need no materials and no validator.

**Numbering is the array index, and the array comes from `sectionOpenings`.** `sections` is returned
in the same order as `openings`, so "Opening 2" is position 1 in both the tree and the elevation —
one array, read twice, rather than two orderings that must be kept in step.

That ordering **cannot** be recovered from the tree's topology. `sectionOpenings` ends with
`sort((a, b) => a.rect.x0 - b.rect.x0 || a.rect.z0 - b.rect.z0)` and says why: *"the order the user
sees them in, not the order the tree happens to be written in. Numbering by tree order would put
'Opening 2' somewhere different depending on how the same cabinet was built."* So resolved
rectangles are required, and a topology walk — tempting, because it would need no materials and
have no failure mode — is wrong.

Every part lands in exactly one list, decided by its role key — which already encodes the answer:

| Role shape | Owner | Why |
|---|---|---|
| `front-{sectionId}-{leaf}` | that leaf | a door belongs to the opening it closes |
| `adj-shelf-{sectionId}-{i}` | that leaf | the section asked for it |
| `fixed-shelf-{sectionId}-{i}` | that leaf | `interior.fixedShelves` divides nothing — the section stays one leaf |
| `division-{parentId}-{index}` | **carcase** | it names an internal node, never a leaf |
| `left-side`, `right-side`, `top`, `bottom`, `back`, `toe-kick`, `ladder-*` | carcase | shell |
| no `role` — detached, or user-added | carcase | not the generator's to group |

**A divider belongs to the carcase, not to an opening.** `sectionOpenings` returns only leaves — it
recurses past splits — while `division-{parentId}-{index}` names the section that *was* split, which
is by definition an internal node. So a divider has no opening to nest under, and that is correct
woodworking as well as correct code: a divider sits *between* openings, not in one.

### Two invariants this module carries

- **Every driven part is classified.** A role family added later — `drawer-box-…`, say — must land
  somewhere deliberately, not silently in "carcase". A sweep over all three presets asserts every
  emitted role matches a known pattern, so a new family fails loudly the day it appears.
- **This is the only place a role key is read as structure.** Nothing else parses one. Stage G2 cost
  three rules duplicated per consumer, twice with copies that disagreed; this states the rule once
  before it can happen a fourth time.

## The selection model

```ts
export type Selection =
  | { kind: 'part'; id: PartId }
  | { kind: 'component'; id: ComponentId }
  | { kind: 'section'; cabinetId: ComponentId; sectionId: SectionId }
```

The section variant carries **both** ids. That is what lets the sidebar derive the carcase without a
second lookup, and what lets a stale pick self-clear: a section id from one cabinet names nothing in
another.

`sectionPick` and its `selectedSectionId` state are **deleted** from `App`. `selectedSectionId`
becomes a derivation over `selection` — the same cabinet-match guard, one fewer piece of state. The
app ends with one selection where it had two, which is G1's own lesson applied rather than worked
around: two ways to pick an opening is one way to pick the wrong one.

Measured across `App.tsx`, `sidebar.tsx`, `SceneTree.tsx` and `useScene.ts`: **17 sites discriminate**
on the kind and 16 construct a selection. Only the 17 reads are affected — adding a variant makes
every non-exhaustive switch among them a **compile error**, so `tsc` hands over the list rather than
requiring a grep. That is the discipline `CutDef`'s sort and `worldBounds` already use.

| Consumer | Behaviour with a section selected |
|---|---|
| `useScene` | No-op. Delete, duplicate and hide act on parts; a section owns no state to remove |
| `viewport` | `selectedId: PartId \| null` becomes `highlightIds: ReadonlySet<PartId>`; the `id === selectedIdRef.current` comparison becomes `.has(id)` |
| `sidebar` | Derives the carcase from `cabinetId` and shows `CarcasePanel` with the opening picked |
| `SceneTree` | Renders the row; a click emits the section selection |
| `App` | `selectedCarcase` gains a third case — a section selection keeps its own cabinet open |

**Why the sidebar rule is not optional.** Today `onSelectSection` writes only `sectionPick`; it never
touches `selection`, so picking an opening leaves the *cabinet* selected and `CarcasePanel` stays
mounted with its shelving and front controls live. Merging sections into `Selection` would otherwise
make `selectedComponent` null and unmount the panel at the moment you pick an opening — the same
shape as the Stage G2 Task 9 bug, where a selection change destroyed the surface it was made in. The
sidebar therefore derives its carcase from the section's `cabinetId`.

## The tree

`SceneTree` keeps its job. For a carcase it calls `sectionNodes(cabinet, itsParts)` and renders
sections first, then carcase parts:

```
▾ 🗄 Base 600
  ▾ ▤ Opening 1          ← selectable; selects the section
      □ Door L
      □ Door R
      □ Shelf 1
    □ Left Side           ← carcase parts, unnested
    □ Right Side
    □ Bottom
```

A cabinet with one opening still shows its row, so every cabinet reads the same way and the tree's
shape says how many openings a cabinet has.

Three changes inside the component: `collapsed: Set<ComponentId>` widens to `Set<string>` so a
section collapses like a component; a section row gets `data-testid="node-{sectionId}"`, matching the
existing convention; and the row carries no visibility, duplicate or remove control.

**Two callers, each resolving.** `SceneTree` groups the rows; `App` needs the same mapping to build
`highlightIds` for a section selection. Both resolve through `sectionOpenings` first, and both carry
the unbuildable guard below. `SceneTree` gains a `materials` prop to do it — `Sidebar` already has
`scene.materials`, so that is one line at the call site.

Called during render, not memoised: `resolveSections` is small arithmetic over one cabinet's tree and
`overridesOf` is a single pass over its parts. Measure before adding a memo, following
`CabinetProjection`'s precedent.

## Numbering, in both places

G3 introduces the **first user-visible name for an opening**: nothing names one today. The elevation
draws unlabelled rectangles and `CarcasePanel` shows the picked opening's controls without naming it.

So the elevation draws the same number in each cell, from the same `sectionOpenings` index the tree
uses. The two agree by construction *and* the agreement is visible — a name nobody can locate is
worse than no name.

## Failure

| Condition | Behaviour |
|---|---|
| A role matching no known pattern | Falls to carcase, and the sweep test fails |
| A section id naming nothing | Renders no selection. The same total-function rule `editSection` follows |
| **A cabinet whose params do not build** | The **caller** skips resolving and renders every part flat, as today. `sectionNodes` never sees it |

The last row is load-bearing. `sectionOpenings` needs a resolved tree, which needs valid parameters,
and `CarcasePanel` renders in states the validator rejects because the params are mid-keystroke. **The
scene tree must never empty or throw because a width is briefly `6`.** It degrades to the flat tree
that exists today — the same "empty rather than throwing" rule `SectionElevation` states.

## A preset has one opening

Measured: **Base 600, Wall 600 and Tall 600 each resolve to exactly one opening.** All three build
their tree from an empty divider list, so `sectionOpenings` returns a single leaf. Tall 600's two
fronts are the two leaves of one door *pair* on that single opening, not two openings.

This has a direct consequence for the tests. **No preset exercises the multi-opening case**, so every
test that needs several must construct a split tree — `legacyToSection([0.5], …)` or `splitSection`
— rather than reach for a preset and assume. A fixture built from `CARCASE_PRESETS` alone would
leave the grouping's whole reason for existing untested, and would pass whether the code grouped by
section or returned one bucket.

## Testing

`sectionNodes.test.ts`, pure:

- Every driven role in all three presets is classified. *Mutation: add a `drawer-box-` role.*
- A divider lands in carcase, not in a section. *Mutation: route `division-` to its parent id.*
- Fronts, adjustable and fixed shelves land on their own leaf. *Mutation: drop any one pattern.*
- A part with no `role` lands in carcase. *Mutation: throw on unroled.*
- An unbuildable cabinet renders flat — asserted at the caller, since the guard lives there. *Mutation: remove the guard.*

`App.test.tsx` — the level Stage G2 Task 9 proved is the only one that sees these:

- Selecting a section keeps its cabinet open and the projection mounted.
- The sidebar shows `CarcasePanel` with that opening picked.
- `highlightIds` is the section's parts — not one id, not empty.

`SectionElevation.test.tsx`: cell *n*'s text matches the tree's "Opening *n*" for a three-bay
cabinet. *Mutation: reverse either ordering.* Both read one `sectionOpenings` call, so they cannot
drift.

One e2e. **It must split first** — no preset has two openings, so the flow is: add a cabinet, open
its editor, split the opening, then click **Opening 2** in the tree and assert the elevation's second
cell reads selected and the 3D highlight covers its door. That crosses all three surfaces, which no
unit test does. An e2e that skipped the split would be asserting against a cabinet with one opening
and would pass whether or not the grouping worked.

## Acceptance

- [ ] Every preset shows exactly one opening row, carrying its fronts and shelves
- [ ] A Tall 600's opening holds **both** leaves of its door pair — two fronts, one opening
- [ ] A cabinet split into three bays shows three opening rows, numbered 1–3 left to right
- [ ] A divider appears among the carcase parts, not inside an opening
- [ ] Clicking an opening in the tree selects the same cell the elevation shows selected
- [ ] Clicking a cell in the elevation selects the same row the tree shows selected
- [ ] Selecting an opening highlights its parts in 3D and leaves the cabinet editor open
- [ ] The sidebar shows that opening's shelving and front controls
- [ ] A cabinet mid-keystroke invalid still renders its parts, flat
- [ ] `sectionPick` no longer exists in `App.tsx`
- [ ] `FILE_FORMAT_VERSION` is still 17
