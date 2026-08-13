# Scene Suggestions: Pair Grouping — Design Spec

Status: **decided**, not yet implemented (2026-08-09).

## Overview

The scene-wide panel shipped on 2026-08-07 lists one row per candidate joint. Measured on a real
800×600×720 base cabinet — two sides, bottom, top, back, mid shelf, divider, upper shelf, 18 mm ply —
that is **40 rows for 14 real decisions**:

```
14 dado · 14 mortise-tenon · 12 finger  =  40 rows
14 of the 28 board pairs actually touch
```

The list is not wrong. It is un-grouped. One corner occupies four consecutive rows:

```
25. Dado            — Bottom into Left Side
29. Mortise & tenon — Bottom into Left Side
33. Finger joint    — Left Side leads, Bottom seats
34. Finger joint    — Bottom leads, Left Side seats
```

Those are four ways to make **one** joint, presented as four independent choices. This spec groups
rows by board pair: 40 → 14, with every option still reachable.

## What the existing code already gives us

Grouping is presentation only. Verified by reading the wiring on `main` (946ec6d):

- **Hover takes one suggestion.** `App.tsx` holds `hoveredSuggestion: JointSuggestion | null`;
  `highlightedIds = pairIdsOf(hovered)` and `hoveredOutlines = suggestionOutlines(hovered, parts)`.
- **Apply takes one suggestion.** `applySuggestion(s)` switches on `s.kind` and dispatches to the
  `onAdd*` creators using ids carried on `s`.

So a grouped row only has to hand back the *same object* a flat row hands back today. The engine,
the outline preview and the apply path are untouched.

The 2026-08-07 notes predicted exactly this: "the engine does not change — only the row model does."

## Decisions

### Row model: inline kind chips

One row per pair; each available joint kind is a chip. One click applies. Every option is visible
without expanding anything, and there is no per-row open/closed state to manage.

```
ALL POSSIBLE JOINTS (14)

Left Side + Bottom      [Dado] [M&T] [Finger →] [Finger ←]
Left Side + Top         [Dado] [M&T] [Finger →] [Finger ←]
Left Side + Mid Shelf   [Dado] [M&T]
Divider + Bottom        [Dado] [M&T]
```

Rejected: collapsible pair rows (hides options behind a click, adds state) and a kind dropdown
(options invisible until opened, and per-kind hover preview stops working naturally).

### Orientation: direction arrows

`finger` and `tongue-groove` are in `ORIENTATION_MATTERS`, so a pair yields two genuinely different
joints — which board leads / carries the groove. An arrow is appended **only when a pair has two
chips of the same kind**:

- `→` the first-named board leads (finger `partAId`) or carries the groove (`groovePartId`)
- `←` the second-named board does

This reuses the `→` / `←` convention `JointsPanel.tsx:238` already uses for lead direction. The
tooltip is the existing `describe()` from `SceneSuggestionsPanel`, unchanged — it already renders
"Finger joint — Left Side leads, Back seats" and "Tongue & groove — groove in X, tongue on Y", so
there is no second wording to keep in sync.

**Why this matters rather than applying a default:** orientation is fixed at creation.
`JointsPanel.tsx:245-271` lets only the lead board edit `fingerCount` / `clearance`; the other board
reads "Edit from …". There is no swap control. Picking the wrong orientation costs a delete and
re-add, so both orientations must be offered up front.

On the carcase this affects 6 of 14 pairs (the 12 finger rows are 6 corners × 2).

### Scope: suggestions only

Pairs that already carry a joint stay excluded, as today (`jointInvolves`; pinned by
`suggestJoints.test.ts:395`). The list shrinks as the design is jointed, which is its own progress
signal.

Rejected: a full connections checklist showing jointed pairs as done. It answers "have I jointed
everything?" but requires the engine to report what it currently discards, and the list would never
shrink. Recorded here as a deliberate non-goal, not an oversight.

### The cap moves from suggestions to pairs

`MAX_SCENE_SUGGESTIONS = 100` truncates the flat list. If grouping runs *after* that cap, a pair
near the boundary renders with only some of its kinds — a silently partial row. That is the same
defect class fixed on 2026-08-09 in `MAX_SUGGESTIONS` (a nearest-first cap that hid whole joints
without saying so).

It is reachable: three carcases — 24 boards, a modest kitchen run — produce 120 candidates and are
cut to 100.

So the cap applies to **pairs, after grouping**: a rendered row is always complete. A partial row is
worse than an absent one, because a missing chip is indistinguishable from a joint the engine cannot
make.

Concretely: `suggestJointsForScene` drops its `.slice(0, MAX_SCENE_SUGGESTIONS)` and returns the
full list; `groupByPair` applies `MAX_SCENE_PAIRS` to the grouped result. The cap has to live with
the grouping — `suggestJoints.ts` cannot "cap after grouping" when grouping happens in another
module. Cost is affordable: the whole all-pairs pass measured ~10 ms for 24 boards, well inside the
300 ms guard.

`MAX_SCENE_PAIRS = 100`. It stays a runaway guard rather than a curation device, but it now counts
rows — and a row is one real decision, where a suggestion was a quarter of one. The carcase needs
14 and three carcases need 42, so unlike the old 100-suggestion cap this is not reachable by any
scene we have measured.

## Architecture

### New module: `src/scene/groupSuggestions.ts`

```ts
export interface PairGroup {
  key: string                  // `${aId}|${bId}` — ids in engine-encounter order
  aId: PartId
  bId: PartId
  options: JointSuggestion[]   // KIND_PRIORITY order
}

export function groupByPair(suggestions: JointSuggestion[]): PairGroup[]
```

The collapsible header counts **pairs**, not suggestions: "All possible joints (14)" on the carcase,
where it reads 40 today.

Pure and React-free, so it is tested directly rather than through the panel. A separate small module
rather than more weight in `suggestJoints.ts` (already ~400 lines), matching the existing
`jointInvolves.ts` / `cutFootprint.ts` / `suggestionOutline.ts` pattern.

- **Row order = first appearance in the engine's output.** The engine already ranks by pair
  distance; taking first appearance inherits that ranking with no new sorting logic.
- **A pair's suggestions are not contiguous.** `suggestJointsForScene` sorts by pair distance and
  tiebreaks on `KIND_PRIORITY`, so equidistant pairs interleave. On the carcase, Left Side + Bottom
  and Left Side + Top are both 525 mm from their partner and come back as
  `dado(LS+Bottom), dado(LS+Top), … , mortise-tenon(LS+Bottom), mortise-tenon(LS+Top), …`.
  Grouping must therefore key a **map** by pair, not collapse adjacent runs. An adjacency-based
  implementation passes a two-board fixture and silently splits every real carcase pair into
  several rows.
- **Chip order needs no explicit sort.** Within one pair every suggestion has identical pair
  distance, so the sort's tiebreak is `KIND_PRIORITY` — encounter order inside a group is already
  `KIND_PRIORITY` order. `groupByPair` preserves encounter order and `KIND_PRIORITY` stays private
  to `suggestJoints.ts`.
- Pair identity uses `pairIdsOf(s)`, which already exists and carries a `never` guard.

### Hover

Chips are the hover targets, exactly as rows are today: enter → `onHoverSuggestion(s)`, leave →
`onHoverSuggestion(null)`. Both boards tint and that kind's outlines draw, unchanged.

Row-level hover is deliberately **not** added. It would need a second hover concept in `App`
(tint without outlines), because `suggestionOutlines` requires a specific suggestion and picking one
arbitrarily would draw a highlight that does not match what the user is pointing at.

## Testing

TDD, per repo convention — each test written and watched to fail first.

`groupSuggestions.test.ts`:
- collapses every suggestion for one pair into a single group
- **groups a pair whose suggestions are interleaved with another pair's** — the real carcase
  ordering; this is the test that fails an adjacency-based implementation
- preserves engine order by first appearance
- `options` come out in `KIND_PRIORITY` order
- keeps both entries when a kind appears twice for a pair (orientation)
- caps at `MAX_SCENE_PAIRS` groups, and the last kept group is complete
- empty input → empty output

`SceneSuggestionsPanel.test.tsx` (following `SuggestionsPanel.test.tsx`):
- renders one row per pair, not one per suggestion
- an arrow appears only on a kind duplicated within that pair
- clicking a chip calls `onApply` with that exact suggestion
- hovering a chip calls `onHoverSuggestion` with that exact suggestion

## Files

| File | Change |
|---|---|
| `src/scene/groupSuggestions.ts` | **new** — `groupByPair`, `PairGroup` |
| `src/scene/groupSuggestions.test.ts` | **new** |
| `src/ui/SceneSuggestionsPanel.tsx` | render groups + chips; keep `describe()` as chip tooltip |
| `src/ui/SceneSuggestionsPanel.test.tsx` | **new** |
| `src/scene/suggestJoints.ts` | drop `MAX_SCENE_SUGGESTIONS` and its `.slice`; return the full list |
| `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` | append outcome |
| `project-structure.html` | new module in the source tree |

## Non-goals

- Grouping the **per-part** panel. It shows "Dado with Left Side" against a single selected board;
  13 rows for a carcase side is legible, and the pair is already implied by the selection.
- A connections checklist including jointed pairs (see Scope above).
- Camera framing on hover — still a non-goal; scene rows can name off-screen boards.
