# Scene-Wide Joint Suggestions — Design Spec

Status: **decided and implemented** — Option B chosen (2026-08-07). The orientation section below is
kept as the record of what was weighed, not as an open question.

> **No dedicated plan file.** This spec has no `plans/2026-08-07-scene-wide-suggestions.md`; its
> implementation planning was carried in the follow-on plans
> `plans/2026-08-09-scene-suggestions-pair-grouping.md` and `plans/2026-08-17-joint-checklist.md`,
> with the living thread in `notes/2026-08-07-scene-wide-suggestions-notes.md`.

## Overview

Joint suggestions today exist only for the selected board. `suggestJointsFor` opens with:

```ts
if (selectedId == null) return []
```

so deselecting shows nothing, and a four-board carcase means selecting each board in turn to
discover what it could join to. Because the loop skips pairs that already carry a joint
(`jointInvolves`, `suggestJoints.ts:250`), the list also shifts underneath you as you work. There is
no way to ask "what joints does this design still want?"

This spec covers a scene-wide view that answers that question, reusing the existing scoring and the
existing hover preview unchanged.

## What the existing code already gives us

- **Scoring is already pairwise.** The body of `suggestJointsFor` is a loop over `t` for a fixed
  `s`; an all-pairs pass is the same inner block over unordered pairs.
- **Previews are already scene-level.** `suggestionOutlines(s, parts)` takes a suggestion and the
  parts array — it never consults the selection. It works as-is for a scene-wide row.
- **Apply is already scene-level.** `applySuggestion` in `App.tsx` dispatches on `s.kind` to the
  `onAdd*` creators using ids carried on the suggestion. No selection involved.

So the engine and the preview need no changes. The work is enumeration, deduplication, ranking and
UI.

## Measured facts this design rests on

Both directions of every fixture pair were run through `suggestJointsFor` (2026-08-07):

```
perpendicular tee
  H->D   dado           housing=H housingFace=+Z housed=D housedEnd=-X   ┐ identical
  D->H   dado           housing=H housingFace=+Z housed=D housedEnd=-X   ┘
  H->D   mortise-tenon  mortise=H mortiseFace=+Z tenon=D tenonEnd=-X     ┐ identical
  D->H   mortise-tenon  mortise=H mortiseFace=+Z tenon=D tenonEnd=-X     ┘

box corner
  CA->CB finger         partA=CA endA=+X partB=CB endB=-X               ┐ DIFFER
  CB->CA finger         partA=CB endA=-X partB=CA endB=+X               ┘

edge glue-up
  G->E   tongue-groove  groove=G grooveEdge=+Y tongue=E tongueEdge=-Y   ┐ DIFFER
  E->G   tongue-groove  groove=E grooveEdge=-Y tongue=G tongueEdge=+Y   ┘

crossing lap
  LA->LB halflap        partA=LA partB=LB                               ┐ swap only
  LB->LA halflap        partA=LB partB=LA                               ┘
```

**Cost:** an all-pairs pass over 24 boards measured **30.3ms** — 576 pair evaluations. Acceptable,
but ~24× the current per-selection work, and it recomputes on every `scene.parts` change.

## Why dedup cannot be uniform

- **Dado and mortise & tenon are symmetric.** Housing/housed is chosen by geometry (`sBroad`), not
  by which board was selected, so both directions yield byte-identical roles. Scoring each pair
  twice produces true duplicates that must be collapsed to one row.
- **Finger and tongue & groove are asymmetric.** `FingerJoint.partAId` is the lead board that
  *stays put* while the other auto-seats into the corner; `TongueGrooveJoint.groovePartId` decides
  which board is grooved and which is tongued. The two directions are two different joints.
- **Half-lap swaps A/B only.** `HalfLapJoint.split` is documented as "fraction of thickness board A
  keeps", so at the default `0.5` the swap is immaterial, and only matters if `split` is later
  edited. Treat as symmetric for enumeration; note the caveat.

A naive "dedupe by unordered pair" would therefore be wrong twice over: it would show dado and
mortise & tenon twice, and it would silently discard one of the two real options for finger and
tongue & groove — keeping whichever the loop happened to reach first, i.e. an artefact of part
order.

## Orientation — decided (Option B)

This determined the row model, so it was settled before any component was written. Three options were
weighed, all consistent with the measured facts; kept here as the record of the trade-off.

### Option A — one row per pair, with a swap control

Collapse each unordered pair to a single row. For asymmetric kinds, show the current orientation in
the label ("Tongue & groove — groove on Board 1") and offer a swap affordance that flips to the
other orientation before applying.

- **For:** shortest list; the pair is the user's mental unit; the choice stays discoverable.
- **Against:** a control that is meaningful for two kinds and inert for three; needs a rule for the
  default orientation (see below).

### Option B — one row per distinct outcome

Emit both orientations as separate rows for asymmetric kinds; one row for symmetric kinds.

- **For:** rows map one-to-one onto outcomes, so hover preview and apply need no extra state; no
  inert control; nothing hidden.
- **Against:** longer list, and two adjacent rows whose labels differ only by which board is named —
  precisely the "two rows that look alike" complaint that motivated cut previews in the first place.
  Mitigated by the previews genuinely differing here (the groove moves to the other board), unlike
  the dado/mortise-tenon case where the faces were identical.

### Option C — one row per pair, orientation chosen by a rule, no control

Collapse to one row and pick an orientation by a deterministic heuristic (e.g. groove in the thicker
board; lead finger board = the one with more existing joints, or lower label ordinal).

- **For:** simplest UI and row model.
- **Against:** removes a real choice; the user must apply then edit the joint to flip it. Only
  defensible if one orientation is almost always right, which I have no evidence for.

**Chosen: Option B** (confirmed 2026-08-07), on the grounds that it needs no new interaction, keeps
the row model identical to the per-part panel (one row = one applicable suggestion), and does not
require inventing a defaulting heuristic. Its weakness — near-duplicate labels — is addressable in wording, whereas
Option C's weakness (a silently discarded option) is not addressable at all. Option A is the better
end state if the list proves too long in practice, and B can migrate to A later without changing the
engine.

This was a product judgement about how woodworkers choose orientation, made without observing anyone
use the app, and was flagged for confirmation rather than assumed. Confirmed 2026-08-07.

## Ranking

`suggestJointsFor` sorts by `aabbCenterDist(s, t)` then `KIND_PRIORITY`, and slices to
`MAX_SUGGESTIONS = 8`. Scene-wide, both are unusable as written:

- there is no `s` to measure distance from;
- 8 is far too few — a 24-board carcase can legitimately have dozens of candidates.

Proposed: group rows **by pair**, order pairs by the distance between the two boards' AABB centres
(closest first, so touching boards lead), and within a pair keep `KIND_PRIORITY`. Cap generously
(e.g. 100) purely as a runaway guard, not as a curation device. The per-part path keeps its existing
sort and cap untouched.

## Data model

No persisted state. A new pure function beside the existing one:

```ts
export function suggestJointsForScene(parts: Part[], joints: Joint[]): JointSuggestion[]
```

`JointSuggestion` is reused unchanged. Note `neighborId` becomes ambiguous scene-wide (it means
"the other board relative to the selected one"); scene rows should name both boards from the
role-carrying fields rather than relying on it. `suggestionOutlines` does not read `neighborId`, but
`App.tsx` currently derives the board tint from `hoveredSuggestion?.neighborId` — see Wiring.

## UI

`SuggestionsPanel` renders inside `EditPanel` (`sidebar.tsx:782`), i.e. inside the selected part's
editor, so it cannot host a scene-wide list. Options: a sibling collapsible section in the sidebar
outside `EditPanel`, or a tab in the existing `BomModal`. Prefer the sidebar section — the modal is
for outputs (cutting list, hardware), not for editing the design.

**Keep the per-part panel.** It is better while working on one board; the scene-wide list answers a
different question. Replacing one with the other trades one gap for another.

Each row must name both boards ("Dado — Board 3 into Board 1"), since neither is the selection.

## Wiring

- Hovering a scene row reuses `suggestionOutlines` unchanged.
- **The board tint needs revisiting.** `App.tsx` sets `highlightedId={hoveredSuggestion?.neighborId}`
  — one board, defined relative to the selection. Scene-wide, neither board is selected and both are
  equally "other", so both should tint. This means `highlightedId: PartId | null` becomes a set, or
  a second prop. Small, but it touches the viewport's tint branch (`viewport.tsx:505`).
- Hovering should also frame the pair — the boards may be off-screen. Deferred: see Non-Goals.
- Applying from a scene row uses the existing `applySuggestion` unchanged.

## Goals

- Enumerate every applicable joint across all visible boards, with no selection.
- Correct per-kind deduplication as measured above.
- Hover preview identical in behaviour to the per-part panel.
- Apply path unchanged.
- Per-part panel unchanged.

## Non-Goals

- **Apply-all / bulk apply.** Each application mutates geometry and can invalidate other candidates;
  batch semantics need their own design.
- **Camera framing on hover.** Worth having, but it is a viewport-control change with its own
  questions (animate or jump, respect user zoom) and should not ride along here.
- **Re-ranking by "quality".** No basis for scoring one joint as better than another.
- Cylinders/dowels — the engine is board-only today.

## Testing

- Pure-function tests for `suggestJointsForScene`: the four fixtures already in
  `suggestJoints.test.ts`, asserting exact deduplication per kind (one dado row, two tongue & groove
  rows under Option B, etc.).
- A regression test that a pair carrying an existing joint is excluded, matching the per-part rule.
- A test that scene and per-part paths agree: every suggestion the per-part path yields for a board
  appears in the scene list (modulo orientation collapsing).
- Perf guard: an all-pairs pass over a 24-board scene stays under a stated budget.
- No new e2e is strictly required — the hover preview is already covered — but one that opens the
  scene list and hovers a row would cover the new tint-both-boards path.

## Risks & Open Questions

1. ~~**Orientation (blocking).**~~ Resolved: Option B.
2. **Whether this is wanted at all.** The gap was found by reading code, not by observing use. If
   the real workflow is "place two boards, joint them, place the next two", per-part scoping is
   already right and this solves nothing.
3. **Recompute cost.** 30.3ms/pass is fine as a memo but is triggered by every `scene.parts` change,
   including each keystroke in a dimension input. Memoize on something narrower, or defer during
   edits. Measure before optimising.
4. **List length.** Unknown until tried on a real carcase. If Option B's list is unwieldy, migrate to
   Option A — the engine does not change.
5. **`neighborId` is selection-relative** and becomes misleading scene-wide. Either leave it (rows
   read the role fields instead) or introduce a scene-oriented row type. Leaving it risks a future
   reader trusting it.

## Files Touched

- `src/scene/suggestJoints.ts` — add `suggestJointsForScene`; extract the per-pair block currently
  inlined in `suggestJointsFor` so both callers share it.
- `src/scene/suggestJoints.test.ts` — tests above.
- `src/ui/SuggestionsPanel.tsx` — reuse for scene rows, or a sibling component if labels diverge.
- `src/ui/sidebar.tsx` — host the scene section outside `EditPanel`.
- `src/App.tsx` — scene suggestions memo; tint both boards on hover.
- `src/render/viewport.tsx` — `highlightedId` becomes plural.
- `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` — living notes.
