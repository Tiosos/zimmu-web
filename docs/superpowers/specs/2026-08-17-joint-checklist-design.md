# Joint Checklist — Design Spec

Status: **decided**, not yet implemented (2026-08-17).

## Overview

The scene panel lists unjointed pairs that have offers. As a design is jointed, rows disappear. That
answers "what can I do next?" but never "have I jointed everything?" — the two questions differ
precisely at the end of the run, when the list is empty and you still cannot tell an entirely
jointed carcase from one with a pair the engine never had an opinion about.

This spec turns the panel into a checklist: **every touching board pair gets a row that persists**,
in one of three states.

```
JOINTS — 9 / 14

  ✓ Left Side + Bottom      Dado
  ✓ Left Side + Top         Finger joint
    Left Side + Mid Shelf   [Dado] [M&T]
    Divider + Bottom        [Dado] [M&T]

  ▸ No joint available (3)
```

The counter is the progress signal that shrinkage used to provide.

## Reversing a recorded non-goal

`2026-08-09-scene-suggestions-pair-grouping-design.md:88` rejected this feature explicitly:

> Rejected: a full connections checklist showing jointed pairs as done. It answers "have I jointed
> everything?" but requires the engine to report what it currently discards, and the list would never
> shrink. Recorded here as a deliberate non-goal, not an oversight.

Both objections are answered rather than ignored:

- **"requires the engine to report what it currently discards."** It does not. The engine keeps
  discarding jointed pairs. A reporting layer *above* it re-derives the touching-pair set from the
  same adjacency predicate the engine uses, and joins that set against `scene.joints` and the
  engine's output. `suggestJointsForScene` and `suggestForOrderedPair` are untouched. See
  Architecture.
- **"the list would never shrink."** Correct, and that is now the intent — a checklist you can read
  against the physical model must keep its rows still. Progress moves to the `9 / 14` counter, and
  the rows that carry no decision at all (no offer) are removed from the main list into their own
  collapsed section, so the actionable list stays as tight as it is today.

The 2026-08-07 notes already flagged this as the expected migration if the checklist framing proved
valuable ("Open" section, final entry). This spec is that migration.

## Decisions

### Three row states

| State | Meaning | Renders as |
|---|---|---|
| `jointed` | a joint in `scene.joints` involves both boards | `✓` + joint kind label, static |
| `open` | no joint, engine has ≥1 suggestion | kind chips, exactly as today |
| `no-offer` | boards touch, no joint, engine offers nothing | muted text, own collapsed section |

`no-offer` is the state that makes the checklist honest. Without it, a pair the engine has no
opinion about is indistinguishable from a pair that does not touch — which is the precise failure
this feature exists to remove.

### The counter excludes `no-offer`

Header reads `Joints — {jointed} / {jointed + open}`. A pair the engine cannot joint is not a task
you have failed to complete, so counting it would make 100% unreachable and the number useless as a
completion signal. Those rows are still *visible* — in their own section, with their own count — so
nothing is hidden, it is just not scored.

### `no-offer` gets its own collapsed section

Not a muted sub-section inside the main list: its own `Collapsible`, closed by default. On a real
carcase this group is noise most of the time, and interleaving it with actionable rows would
re-inflate the row count the 2026-08-09 grouping work brought down from 40 to 14.

### Ordering: pair centre distance, for every row regardless of state

All rows sort on `aabbCenterDist` ascending, tiebroken on the sorted pair key.

The tiebreak is not decoration. `groupSuggestions.ts:22-26` documents that equidistant pairs
interleave in the engine's output; without an explicit tiebreak, equidistant checklist rows would
fall back on board-iteration order and reshuffle as parts are added or reordered.

Distance is computed for jointed and no-offer rows too — not inherited from the suggestion list —
because that is what makes a row **hold its position when it flips `open` → `jointed`**. Ordering by
the suggestion list alone would make a row jump the moment you joint it, losing your place mid-
carcase. This is the single most important behavioural property of the feature and it gets a
dedicated test.

### Hover on a done row tints both boards

Enter → `onHoverPair([aId, bId])`, leave → `onHoverPair(null)`. Both boards tint; no face outlines
are drawn.

This reverses another recorded non-goal —
`2026-08-09-scene-suggestions-pair-grouping-design.md:154-161` declined row-level hover because it
"would need a second hover concept in `App` (tint without outlines), because `suggestionOutlines`
requires a specific suggestion and picking one arbitrarily would draw a highlight that does not
match what the user is pointing at."

That reasoning was about **suggestion** rows, where several candidate suggestions exist and choosing
one to preview is arbitrary. A `jointed` row has no suggestions at all — there is nothing to pick
arbitrarily from, and nothing an outline could correctly depict. Tint-only is the complete and
correct answer here, not a compromise. The second hover concept is genuinely needed, and it is two
lines: `App.tsx` already drives a plural `highlightedIds`.

Chips on `open` rows keep hovering exactly as today (`onHoverSuggestion`, tint + outlines).

## Architecture

### The cap must move out of `groupByPair` — correctness, not tidiness

`groupSuggestions.ts:36` ends `.slice(0, MAX_SCENE_PAIRS)`. The checklist calls `groupByPair` to get
each open row's options, so with >100 offering pairs, groups 101+ vanish before classification and
those pairs are reported as **"no joint available"** when the engine in fact has offers for them.

A cap placed *below* a classifier stops being a runaway guard and becomes a source of wrong answers.
This is the same defect class the 2026-08-09 spec fixed when it moved the cap above grouping
(`:92-104`) — a truncation that silently changes what a row claims.

So: `groupByPair` drops its `.slice` and becomes pure grouping; `buildJointChecklist` applies
`MAX_SCENE_PAIRS`. The existing cap test moves with the cap.

The cap applies to `rows` and `unresolved` **independently**, so a scene with many untouchable-but-
adjacent boards cannot starve the actionable list.

`MAX_SCENE_PAIRS` stays exported from `groupSuggestions.ts` — moving the constant as well as its
application would churn imports for no gain, and its doc comment is already written about rows.

### Extracted adjacency predicate — `src/scene/suggestJoints.ts`

```ts
export function boardsTouch(a: BoardPart, b: BoardPart): boolean
```

Three-axis AABB gap against `TOUCH_TOL`. This predicate already exists twice, written identically:
`contactPair:142-149` and `cornerPair:200-203`. The checklist's denominator *is* this predicate, so
a third copy would be the one most likely to drift.

`cornerPair` delegates to it — its prelude is exactly this function, so the change is
behaviour-preserving. **`contactPair` keeps its own fused loop**, because it derives `contactAx` and
`bestGap` as byproducts of the same iteration and delegating would mean walking the axes twice for
no gain. Net: three copies → two. The remaining two stay consistent by construction (same tolerance,
same early return on the same comparison), but this is a smaller win than "one definition" and is
recorded as such rather than overclaimed.

Also newly exported: `aabbCenterDist` (currently module-private) for the ordering key.

### New module: `src/scene/jointChecklist.ts`

```ts
export type PairState = 'jointed' | 'open' | 'no-offer'

export interface ChecklistRow {
  key: string                 // sorted `${aId}|${bId}` — same scheme as PairGroup.key
  aId: PartId
  bId: PartId
  state: PairState
  options: JointSuggestion[]  // non-empty only when 'open'
  joints: Joint[]             // non-empty only when 'jointed'
  dist: number                // AABB centre distance — the ordering key
}

export interface JointChecklist {
  rows: ChecklistRow[]        // jointed + open, distance-sorted
  unresolved: ChecklistRow[]  // no-offer, distance-sorted
  jointedCount: number
  actionableTotal: number     // jointed + open
}

export function buildJointChecklist(
  parts: Part[],
  joints: Joint[],
  suggestions: JointSuggestion[],
): JointChecklist
```

Two arrays rather than one array plus a UI-side filter, so the rendered rows and the counter cannot
disagree — the split is made once, in the pure layer that is tested.

Pure and React-free, tested directly rather than through the panel — matching `groupSuggestions.ts`,
`jointInvolves.ts`, `suggestionOutline.ts`. A separate module rather than more weight in
`suggestJoints.ts` (already ~410 lines).

**Algorithm:**

1. `boards = parts.filter(p => p.kind === 'board' && p.visible)` — the identical filter
   `suggestJointsForScene:358` uses. Any divergence here would produce rows for pairs the engine
   never considered.
2. `groupByPair(suggestions)` → index by `key`. Reuses the existing grouping (and with it
   `orientationArrow`, which reads `PairGroup.aId`).
3. Index `joints` by sorted pair key via a local `jointPairIds(joint): [PartId, PartId]` helper.
4. For each `i < j` board pair: keep it if `boardsTouch(a, b)` **or** the pair carries a joint;
   skip otherwise. Compute `key` and `dist`. Classify `jointed` → `open` → `no-offer`, in that order
   of precedence.
5. Sort each array by `dist`, tiebreak `key`. Apply `MAX_SCENE_PAIRS` to each.

**An existing joint outranks the adjacency test.** `reconcileJoints.ts:27-29` preserves a joint whose
`deriveJoint` returns null — a stale joint keeps its last-good cuts rather than being deleted. So a
joint survives its boards being moved apart, and gating rows on `boardsTouch` alone would make that
joint vanish from the checklist while `jointedCount` silently decremented. A joint is the strongest
possible evidence that a pair is a real junction, so it admits the row on its own. This also keeps a
jointed row from flickering out when a board drifts a hair past `TOUCH_TOL`.

**Hidden boards are excluded, numerator and denominator alike.** `boards` filters on `visible`, so
hiding a board drops both its jointed rows and its open rows. The counter therefore describes the
visible scene, which is coherent but worth stating: hiding a jointed board moves the count for a
non-structural reason. Consistent with the engine, which already refuses to suggest against hidden
boards.

**`aId`/`bId` role order.** For `open` rows these come from the `PairGroup`, **not** from the board
loop. `groupSuggestions.ts:13-16` warns that `PairGroup.aId` preserves `pairIdsOf` role order and
that sorting the ids "would silently invert every arrow on real data". Since `open` rows render
chips through `orientationArrow`, they must inherit the group's order verbatim. `jointed` and
`no-offer` rows have no arrows and take board-iteration order, which is deterministic.

**`jointPairIds` placement.** Defined locally in `jointChecklist.ts`, not added to `jointInvolves.ts`
— one consumer, so no shared module until there is a second. It mirrors `pairIdsOf`'s shape and
carries the same `never` exhaustiveness guard, so a sixth joint kind fails to compile rather than
silently reporting a pair as unjointed.

### UI

`SceneSuggestionsPanel.tsx` builds the checklist in a `useMemo` from the `scene` prop it already
receives — mirroring today's internal `groupByPair` call, so `App.tsx` needs no new data wiring.

- Header: `Joints — {jointedCount} / {actionableTotal}` (replaces `All possible joints (N)`).
- `jointed` rows: `✓`, both board labels, joint kind label. Static; hover tints.
- `open` rows: unchanged from today — chips, `orientationArrow`, `describe()` tooltip.
- `unresolved`: nested `Collapsible`, closed by default, header `No joint available ({n})`.
- Renders `null` only when `rows` and `unresolved` are both empty.
- New prop `onHoverPair: (ids: [PartId, PartId] | null) => void`.

`App.tsx`:

```ts
const [hoveredPair, setHoveredPair] = useState<[PartId, PartId] | null>(null)
const highlightedIds = useMemo(
  () => (hoveredSuggestion ? pairIdsOf(hoveredSuggestion) : hoveredPair),
  [hoveredSuggestion, hoveredPair],
)
```

`hoveredOutlines` is unchanged — it stays driven by `hoveredSuggestion` alone, so a done row tints
without drawing outlines, which is the intended behaviour rather than an omission.

## Testing

TDD, per repo convention — each test written and watched to fail first.

`jointChecklist.test.ts`:

- touching pair, no joint, has suggestions → `open`, `options` populated
- touching pair with a joint → `jointed`, `options` empty, `joints` populated
- touching pair, no joint, no suggestions → `no-offer`, lands in `unresolved`
- **non-touching pair produces no row at all** — the guard against a checklist of every pair in the
  scene
- **a jointed pair whose boards no longer touch still produces a `jointed` row** and still counts —
  the stale-joint case `reconcileJoints` makes reachable
- `jointedCount` / `actionableTotal` exclude `no-offer`
- **stability:** build → apply a joint to the nearest pair → rebuild → that row's index in `rows` is
  unchanged. The distance-ordering decision has no other teeth.
- equidistant pairs come back in deterministic key order
- `MAX_SCENE_PAIRS` applies to `rows` and `unresolved` independently
- hidden and non-board parts produce no rows (mirrors the engine's filter)
- `open` rows preserve `PairGroup` role order, so `orientationArrow` still resolves — the mutation
  the `groupSuggestions` comment warns about
- empty scene → empty arrays, zero counts

`groupSuggestions.test.ts`: the cap test moves to `jointChecklist.test.ts`; add a test that
`groupByPair` no longer truncates (>100 pairs all present), pinning the correctness fix.

`suggestJoints.test.ts`: `boardsTouch` true for touching / false for separated; existing `cornerPair`
tests stand unchanged as the parity guard on the extraction.

`SceneSuggestionsPanel.test.tsx`:

- header renders `jointed / total`
- a jointed pair renders `✓` and its kind label, and no chips
- no-offer rows are absent from the main list and present in the nested section
- the nested section starts closed
- hovering a jointed row calls `onHoverPair` with both ids; leaving calls it with `null`
- existing chip apply/hover assertions still pass

## Files

| File | Change |
|---|---|
| `src/scene/jointChecklist.ts` | **new** — `buildJointChecklist`, `ChecklistRow`, `PairState` |
| `src/scene/jointChecklist.test.ts` | **new** |
| `src/scene/suggestJoints.ts` | export `boardsTouch` + `aabbCenterDist`; `cornerPair` delegates |
| `src/scene/suggestJoints.test.ts` | `boardsTouch` cases |
| `src/scene/groupSuggestions.ts` | drop `.slice`; `MAX_SCENE_PAIRS` re-homed to the checklist |
| `src/scene/groupSuggestions.test.ts` | cap test moves out; add no-truncation test |
| `src/ui/SceneSuggestionsPanel.tsx` | checklist rows, counter header, nested no-offer section |
| `src/ui/SceneSuggestionsPanel.test.tsx` | new state/counter/hover assertions |
| `src/App.tsx` | `hoveredPair` state; `highlightedIds` falls back to it |
| `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md` | **new** — living notes |
| `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` | close the "Open" item |
| `project-structure.html` | new module in the source tree |

## Risks and limitations

- **AABB-only adjacency.** `boardsTouch` is a three-axis AABB gap test, so two boards meeting only at
  a diagonal corner count as touching. They land in `no-offer` — muted, collapsed, uncounted — which
  is the least harmful place for a false positive, but the group will read longer than a
  woodworker's intuition suggests.
- **Rotated boards inflate their AABBs**, over-reporting adjacency the same way. Both limitations are
  inherited from the existing engine's model rather than introduced here; fixing them means OBB
  adjacency, which is out of scope.
- **A second O(n²) walk.** The checklist re-walks pairs that `suggestJointsForScene` already walked,
  recomputing `worldAabb` per pair. The full existing pass measured ~10 ms for 24 boards
  (2026-08-09 spec, `:109`), so this is immaterial at any scene we have measured. Memoizing
  `worldAabb` per board is the fix if it ever bites — deferred, not designed in.
- **`MAX_SCENE_PAIRS` is now reachable in a way it was not.** It counted offering pairs; it now
  counts touching pairs, which is a strictly larger set. Still far above the 14 a carcase needs and
  the 42 three carcases need, but the headroom is smaller than the 2026-08-09 analysis assumed.

## Non-goals

- Clicking a done row to select or edit the joint. Hover-to-tint is the confirmation affordance;
  editing stays in the per-part `JointsPanel`, and wiring selection out of the scene panel is new
  plumbing this feature does not need.
- Removing a joint from the checklist.
- Grouping or restating the per-part panel.
- Camera framing on hover — still a non-goal; scene rows can name off-screen boards.
- OBB-accurate adjacency (see Risks).
