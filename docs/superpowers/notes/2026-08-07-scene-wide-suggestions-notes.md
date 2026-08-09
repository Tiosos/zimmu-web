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

## Open

- Whether the feature is wanted at all: the gap was found by reading code, not by watching the app
  be used. If the working style is "place two boards, joint them, repeat", per-part scoping is
  already correct and this is unused weight.
- **List length is untested on a real carcase.** Option B's row count grows with asymmetric pairs.
  If it proves unwieldy, Option A (one row per pair + swap control) is the migration, and the engine
  does not change — only the row model does.
- **Recompute cost is guarded but not tuned.** A 24-board pass is ~30ms and recomputes on every
  `scene.parts` change, including each keystroke in a dimension input. A test caps it at 300ms to
  catch an order-of-magnitude regression. If it ever bites, memoize on something narrower than
  `scene.parts` or defer during edits.
- Camera framing on hover is still a non-goal; scene rows can name boards that are off-screen.
