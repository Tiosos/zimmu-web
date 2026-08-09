# Scene-Wide Suggestions — Implementation Notes

Living notes for `docs/superpowers/specs/2026-08-07-scene-wide-suggestions-design.md`.
Nothing is implemented yet; these are the findings the spec was built on.

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

## Open

- **Orientation is the blocking decision** and is a product judgement, not a technical one — three
  options are laid out in the spec with a recommendation (B: one row per distinct outcome) that has
  not been confirmed. Implementation should not start until it is.
- Whether the feature is wanted at all: the gap was found by reading code, not by watching the app
  be used. If the working style is "place two boards, joint them, repeat", per-part scoping is
  already correct.
