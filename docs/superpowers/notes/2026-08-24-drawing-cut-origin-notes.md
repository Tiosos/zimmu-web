# Shop drawings: the cut-rectangle origin bug

**Date:** 2026-08-24
**Spec / plan:** none — a standalone defect found while planning sheet-yield Stage 2.

## What was wrong

`projectCut` in `src/geom/drawing.ts` read `BoxCut.position` as the cut's **centre**:

```ts
const x = (uPos - uSz / 2) * scale
const y = flipV ? (boardH - (vPos + vSz / 2)) * scale : (vPos - vSz / 2) * scale
```

`position` is the box's **min corner**. `makeCut` in `occt.ts` builds
`BRepPrimAPI_MakeBox_1(size)` — a box spanning `[0, size]` — and translates it by `position`, so the
cutting tool occupies `[position, position + size]`. The generated geometry agrees: a full-width dado
on a 560 mm-long panel is `position.x = 0, size.x = 560`, spanning x[0, 560]. Reading it as a centre
would put that dado at x[−280, 280].

Every cut rectangle in the shop drawings was therefore drawn **half its own size low and left** of
where the material is actually removed. Measured on a Base 600 left side before the fix — board rect
56 × 72 at 0.1 scale, and all six Face-view cut rects outside it:

```
cut[0] x=-3.0  y=-5.0      cut[3] x=54.2 y=-36.0
cut[1] x=-28.0 y=9.1       cut[4] x=5.1  y=-36.0
cut[2] x=-28.0 y=69.3      cut[5] x=-28.0 y=39.2
```

## Why nothing caught it

`projectHoleArray` sits ten lines below and reads `h.start` directly with no centring, so hole arrays
were always right — which is why `e2e/geom-kernel.spec.ts`'s "drills the right material out of the
right place" passed and gave a false sense that the whole projection was verified.

The drawing tests asserted view counts, labels, scales and circle positions. **None asserted that a
cut rectangle lands on the board it is cut from**, and none asserted an absolute offset. The two new
tests do exactly that, and the containment one needs no number the test supplies — it compares the
cut rect against the board rect the same code produced.

After the fix the whole suite went from 1105 to 1107 passing with **no existing expectation
changed**, which confirms no test had baked the wrong convention; they simply never looked.

## Found while doing something else

This surfaced while checking whether sheet-yield Stage 2's `occupancyMask` could reuse an existing
cut-rectangle derivation. It could not — and the reason it could not was that the two candidates
disagree with each other. `cutFootprintCorners` (`src/scene/cutFootprint.ts`) uses min-corner and is
right; `projectCut` used centre and was wrong. Two consumers of the same field disagreeing is the
signal; neither one alone would have shown anything.

## One prediction in the new test was wrong, and the code was right

The absolute-offset test originally expected the Face view's `y` to measure from the top
(`300 - (60 + 50)`), on the assumption that it flips v like the other views. It does not:
`buildBoardSheet` passes `flipV = false` for Face and `true` for Edge and End. The code returned 60,
the raw v offset. Expectation corrected, comment kept in the test so the next reader does not make
the same assumption.

## Not changed

- The `cutPosDims` guard `if (cr.x > 0.5)` — "the cut does not start at the board's left edge, so
  dimension it". Checked against the corrected values: a full-width dado is now `x = 0` (was −28) and
  still draws no dimension line, and an inset cut is now `x = 6` (was 5.1) and still draws one.
  Behaviour preserved, and now for the right reason.
- `projectHoleArray`, which was already correct.
