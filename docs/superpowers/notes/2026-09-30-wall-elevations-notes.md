# Wall elevations — implementation notes

2026-09-30: Design approved in brainstorming. Basic `wallElevation()` and a plain panel SVG already
existed from Stage 2 (#71); this stage adds dimensions, scale and export.

- Rejected: extending `AssemblyView` to cover walls — it would put an `if (wall)` through
  `assembly.ts`, which `CLAUDE.md` already declines for `drawing.ts`.
- Rejected: panel-only dimensions — no export and a second source of truth.
- Deferred: floor/site-level evidence and clearance annotations on the drawing, until their rules
  are decided.
- User has CNC, saw, boring and edge-bander models and catalogue owners (2026-09-30); no extra
  release approval gate beyond Designer/Draftsperson. Relevant to edge banding (next) and release.
- Order agreed: wall elevations, then edge banding with finished/cut dimensions, then
  drawing-to-cutlist reconciliation.

## Refinements decided while planning (and why)

- `wallElevation()` stays in `roomAssessment.ts` and `buildWallElevation` calls it: the spec said it
  moves, but keeping it changes no behaviour. `ElevationSpan` gained `kind`.
- `ELEVATION_SCALES = [...STANDARD_SCALES, 0.02, 0.01, 0.005]`: `STANDARD_SCALES` stops at 1:20, so a
  4 m wall already overflowed. Board and assembly sheets keep their scales.
- `originX` exists because a span can hang past the wall start; bounds widen rather than clip.
- The ring is sized from vertical labels only: the horizontal provenance label would reserve ~50 mm a
  side for nothing.
- Vertical dimensions: cabinets left, openings right, overlap goes to ring 2, duplicates emitted once.
- The panel needs `roomName` and `projectName`; `ProjectPanel` passes them.
- Review fix: the panel calls `buildSvg(sheet, { embedded: true })` so the preview is fluid and carries
  no document-global print style (inline SVG `<style>` is global and would hit the whole page).

## Mutation results (Task 7)

All ten run against the current code, each restored from a backup and diffed afterwards.

| # | Mutation | Predicted | Observed | Result |
|---|---|---|---|---|
| 1 | `verified` `<=` to `<` | boundary row | "labels the wall length when measured, exactly on the tolerance" (AssertionError, label) | killed; the boundary row (value 3978, uncertainty 5) did not exist and was added first |
| 2 | chain sorted from the far end | first-segment and chain tests | 3 failed: chain sums to wall, first segment from START, empty wall (one as a TypeError on `.label`, the others AssertionErrors) | killed |
| 3 | drop `seen.has` de-dupe | "emits a repeated height once" | that test, length 3 vs 2 | killed |
| 4 | ring always 1 | same test | that test, `[1, 1]` vs `[1, 2]` | killed |
| 5 | `xMin = 0` | "real extent of a cabinet hanging past" | that test, `[0, 3983]` vs `[200, 4183]` | killed |
| 6 | ring from all labels | "sizes the ring from the vertical labels" | that test, 46.875 vs 12.75 | killed |
| 7 | `ELEVATION_SCALES = STANDARD_SCALES` | "drops to 1:50" | that test, `1:20` vs `1:50` | killed |
| 8 | `fy = py + v * scale` | "draws the floor at the bottom" | that test | killed |
| 9 | drop `opening ? DASH` | "draws an opening dashed" | that test, no `stroke-dasharray` | killed |
| 10 | drop the not-site-verified line | "says so when unverified" | that test | killed |

No mutation survived, so the only test added was the tolerance-boundary row for mutation 1.

## Known limitations

- A very short chain segment's label can overlap its neighbour's at small scale.
- The chain merges breakpoints closer than `EPS` (0.5 mm), so a wall-end break can drift or be dropped
  by under 0.5 mm.
- The PDF label test uses a measured fixture: an em dash is not a one-byte round trip through the text
  reader, so a plain length assertion would be wrong.
- Two walls with the same name in one room collide on the export filename.
- A name outside WinAnsi does not fail the deck PDF: `buildPdf` replaces such characters with
  `[U+XXXX]` (the review ran "厨房", "→" and "≠" names and each produced a PDF). The text is
  substituted, not drawn, so such a name reads oddly on the PDF page.

## Review follow-ups

Fixed after the max-level review, one commit each:

- Overlapping vertical dimensions: `AssemblyDim.ring` is now `1 | 2 | 3` and `RING_EM` has a third
  entry (3.1 em, spaced like the others; entries 1 and 2 are untouched, so cabinet sheets and panes
  are byte-identical). `ringed` gives each dimension the first ring whose intervals it does not
  overlap; a fourth overlapping one shares ring 3. `elevationRing` reserves ring 3's width only when a
  ring-3 dimension exists. Before, a Base 600, a wall unit at z = 1400 and a Tall 600 put "1400" and
  "2100" on one line of ring 2.
- DXF: the elevation title and the warning line are left-justified (group 72 = 0, no second
  alignment point), so a long title no longer starts left of the page. `dxfText` now writes DXF-safe
  text everywhere (`±` to `%%p`, `—` to `-`) because the file is AC1009 with no code page. Openings are
  drawn with `dxfDashedLine` (HIDDEN layer, DASHED linetype), as SVG and PDF dash them. One existing
  test asserted the raw `—`/`±` and now asserts the escaped form.
- Spans below the floor: the view shifts z so the lowest drawn z is 0 and records `floorZ` (0 on a
  normal wall); all three renderers draw the floor line at `floorZ`. Dimension labels keep their real
  heights; only start/end are in view space.
- 1:500 added to `ELEVATION_SCALES`.
- `ProjectPanel` memoises each room's cabinet id set, so the Room panel's elevation memo is stable.
- A zero-length wall says "This wall has zero length, so no elevation can be drawn."
- Rule change: the `verified` test in `buildWallElevation` is `|drawn - value| <= max(uncertainty,
  0.5)`. A zero uncertainty and a float drawn length (from `hypot`) otherwise read as a disagreement
  ("drawn 3983 / site 3983 ±0"). The printed uncertainty is unchanged.
- Tests that could not fail now can: deck order with a cabinet present (mutation: swapping elevation
  and assembly fails it), a moved and turned room (mutation: ignoring the room transform in
  `wallElevation` fails it), and a height-bound scale (mutation: dropping the `h` term gives 1:5, not
  1:50).

Known and not fixed:

- Rounded chain labels need not sum to the overall length (sub-millimetre).
- `EPS` merging can drift a breakpoint by under 1 mm.
- The embedded preview renders 2 mm text at about 4 px in a ~600 px panel.
- Vertical dimensions have no extension lines, so on a multi-cabinet wall which "720" belongs to which
  cabinet is ambiguous.
- Very long room or wall names run into the title block's Scale field after about 35 characters, in
  every format.
- Same-named walls in one room share an export filename.
- The production packet's drawings never include wall elevations (it passes `rooms = []`). Out of
  scope here; the decision is pending with the user.
