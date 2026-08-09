# Scene-Wide Suggestions — Implementation Notes

Living notes for `docs/superpowers/specs/2026-08-07-scene-wide-suggestions-design.md`.

## 2026-08-07 — scoping

- **The measurement that shaped the design.** Running every fixture pair through
  `suggestJointsFor` in both directions showed the deduplication rule is *per kind*, not uniform:
  dado and mortise & tenon come back byte-identical either way (housing/housed is decided by
  geometry via `sBroad`, not by which board is selected), while finger and tongue & groove come back
  genuinely different (which board stays put; which board is grooved). Half-lap swaps `partA`/`partB`
  only, immaterial at the default `split: 0.5`.
  A naive dedupe-by-unordered-pair would have been wrong in both directions at once — duplicating two
  kinds and silently dropping a real option for two others, keeping whichever the loop reached first,
  which is an artefact of part order. This was not visible from reading the code; it needed running.
- **Cost measured, not guessed:** an all-pairs pass over 24 boards is 30.3ms (576 pair evaluations).
  Fine for a memo. The concern is not the pass but its trigger — `scene.parts` changes on every
  keystroke in a dimension input, and scene-wide is ~24× the current per-selection work.
- **What needs no change:** `suggestionOutlines(s, parts)` never consults the selection, and
  `applySuggestion` dispatches purely on ids carried by the suggestion. Both work scene-wide as-is.
  That is why this is mostly an enumeration + UI problem.
- **What does need change, and is easy to miss:** `App.tsx` derives the board tint from
  `hoveredSuggestion?.neighborId` — a field that means "the other board relative to the selection".
  Scene-wide there is no selection and both boards are equally "other", so the tint has to become
  plural, which reaches into `viewport.tsx`'s tint branch. `neighborId` itself becomes a misleading
  name in a scene context; the spec leaves it in place but flags it.
- **Ranking cannot be reused.** `suggestJointsFor` sorts by distance from the selected board and
  slices to `MAX_SUGGESTIONS = 8`. Neither survives scene-wide: there is no reference board, and 8 is
  far too few for a whole carcase.

## 2026-08-07 — implemented (Option B)

- **`suggestForOrderedPair(s, t)` extracted first**, so the per-part and scene passes share one
  scoring body rather than drifting. Behaviour-preserving; the existing suggestion tests were the
  check. One wrinkle: the extracted block contained a loop `continue` (`if (!pair) continue`) which
  becomes a compile error inside a function — it is now `return out`.
- **`suggestJointsForScene` visits each unordered pair once**, taking the forward direction whole
  and keeping only `ORIENTATION_MATTERS` kinds from the reverse. That is the entire dedup rule, and
  it is expressed as a set of kinds rather than a per-kind branch so a new kind has to be classified
  deliberately.
- **`pairIdsOf(sug)`** names both boards without `neighborId`, which means "the other board relative
  to the selection" and is meaningless scene-wide. It has a `never` guard like `suggestionFaceRefs`.
- **The tint became plural** (`highlightedIds`). In the per-part panel this changes nothing visible:
  the selected board's cyan is checked first in the viewport's colour branch, so adding it to the
  list is inert there. Scene-wide, where neither board is selected, both now tint.
- **The scene panel is collapsed by default.** It lists every candidate in the scene, which is noise
  while working on one board; the per-part panel remains the foreground path.
- Confirmed in the app with **nothing selected** — the case that was impossible before, since
  `suggestJointsFor` returns `[]` for a null selection. Two boards edge-to-edge produce exactly the
  two tongue & groove rows Option B predicts, each naming which board carries the groove.

## 2026-08-09 — measured on a real carcase (8-board base cabinet)

Built an 800×600×720 carcase — two sides, bottom, top, back, mid shelf, divider, upper shelf, 18mm
ply — first as a pure-engine fixture, then through the UI. Both gave identical results, so the
numbers below are the app's, not a model of it. 14 of the 28 board pairs actually touch.

- **`MAX_SUGGESTIONS = 8` was silently destroying data, and it has been removed.** The per-part
  panel — the foreground path — showed 8 of 13 candidates for each cabinet side, 8 of 10 for the
  bottom and the back. Nothing in the UI indicated a cap: `SuggestionsPanel` renders a bare
  "Suggested joints" header with no count, so a hidden row is indistinguishable from a joint the
  engine cannot make. Worse, because the sort is nearest-neighbour first, the truncation was not
  random: for the Left Side the cut fell at row 8 ("Dado with Bottom"), removing rows 9–13 — *all
  three* side-to-Top joints. A defining carcase joint was unreachable from the board's own panel.
  The list is bounded by physical adjacency (13 is the observed worst case here), so there is
  nothing for a cap to protect against; it was curation that hid real options. Verified in-browser
  after the fix: the Left Side lists all 13 and they fit on screen.
- **Row count, scene-wide: 40 rows for 14 real decisions.** Breakdown: 14 dado, 14 mortise & tenon,
  12 finger. Option B's both-ways rule accounts for only 6 of the duplicates; the larger multiplier
  is that every tee contact emits *both* a dado and a mortise & tenon. One corner (Left Side +
  Bottom) occupies four rows. So the list is not wrong, it is un-grouped — and Option A (one row per
  pair + swap control) fixes only the orientation half, not the kind half. What the carcase argues
  for is grouping by **pair**, with kind and orientation chosen inside the row: 14 rows, and it
  doubles as a "have I jointed everything?" checklist, which is what a carcase actually needs.
- **Cost is a non-issue — this question is closed.** 8 boards: ~2ms. 24 boards: ~10ms. (The earlier
  30.3ms figure was a denser scene; three separated carcases let more pairs exit early on the AABB
  test.) Per-keystroke recompute is affordable; the 300ms guard is nowhere near firing.
- **`MAX_SCENE_SUGGESTIONS = 100` is reachable after all.** Three of these carcases — 24 boards, a
  modest kitchen run — produce 120 candidates and are cut to 100, silently, with the header still
  reading "(100)". The comment claiming it "sits far above any plausible real scene" was wrong and
  has been corrected in place. Grouping by pair is the fix; raising the number only moves the cliff.
- **No zoom-to-fit exists anywhere in the app.** The camera is hardcoded to `(250, -200, 150)`
  looking at the origin (`viewport.tsx`), tuned for the default 200×100×25 board. On first render of
  a real carcase you are effectively inside the cabinet, and twelve mouse-wheel steps still do not
  frame it. Unrelated to suggestions, but it is friction on every session of the 60-second-cabinet
  workflow.

## Open

- Whether the feature is wanted at all: the gap was found by reading code, not by watching the app
  be used. If the working style is "place two boards, joint them, repeat", per-part scoping is
  already correct and this is unused weight. The carcase run leans this way — the scene panel
  restated the same 14 decisions with 26 extra rows — but it earns its place if it becomes the
  grouped checklist described above.
- **Row model, not the engine, is the next change.** Group scene rows by pair (40 → 14). The engine
  is unchanged by this, exactly as scoped on 2026-08-07.
- Camera framing on hover is still a non-goal; scene rows can name boards that are off-screen.
