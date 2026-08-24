# Sheet Yield — Stage 2: `occupancyMask`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `BoardPart` into a 1 mm occupancy bitmask of the material it actually occupies on a sheet, dilated by half the global tool clearance. Nothing places anything yet — Stage 3 consumes this.

**Architecture:** One pure module, `src/nest/mask.ts`, with no React, no THREE, and no OCCT. It reads a part's cut-size rectangle in **board-local** axes, applies the flat-mitre outline, clears the footprint of every cut that goes all the way through the thickness, and dilates the result. Rotation and grain are **not** its business — the mask is always in board axes and Stage 3 rotates it.

**Tech Stack:** TypeScript strict · Vitest. No new dependencies.

**Status:** **Complete.** All five tasks implemented on `claude/sheet-yield-stage-2`. Acceptance: 1175 unit tests across 62 files (10 skipped), `pnpm build` green, every rule mutation-tested. One of this plan's own claims was wrong — see "What changed against this plan" at the foot.

**Spec:** `docs/superpowers/specs/2026-08-23-sheet-yield-design.md`
**Notes:** `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md` — update it whenever a decision deviates from this plan.
**Depends on:** Stage 1 (`docs/superpowers/plans/2026-08-24-sheet-yield-stage-1-grain-and-stock.md`, PR #33). `DEFAULT_CLEARANCE` and `MaterialDef.sheet` land there.

---

## Conventions for every task in this plan

- **Package manager is pnpm.** Never npm or yarn.
- **Run before every commit:** `pnpm typecheck && pnpm lint && pnpm test`.
- **TDD is mandatory.** Write the failing test, run it, watch it fail *for the stated reason*, then implement.
- **No `any`.** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- **Comments explain *why*, never *what*.**
- Branch: `claude/sheet-yield-stage-2`. Never commit on `main`.

## The rule this plan inherits

**Do not write a test that asserts a number this plan supplied.** Stage 1 corrected three claims — one in the approved spec, one in its own plan, one in a test — and every one was found by checking the system against itself. Where this plan gives an expected value, treat it as a prediction to be checked. If the code disagrees with this document, measure before editing either.

---

## What the spec got wrong, and what was measured instead

The spec's one-paragraph sketch of `occupancyMask` says it "fills the part's cut-size rectangle at 1 mm per cell, clears each box cut's footprint, and applies mitre outlines. Reuses `cutFootprintCorners` from `src/scene/cutFootprint.ts` rather than deriving cut rectangles again."

**Three of those four clauses are wrong.** Each was checked against the code before this plan was written.

### 1. `cutFootprintCorners` is the wrong seam

Verified in `src/scene/cutFootprint.ts`:

- It returns **world-space** corners — it calls `resolveWorldMatrix(part, byId)` internally. A mask needs board-local millimetres, so every corner would have to be un-transformed straight back.
- Its signature takes a **`BoxCut` only**. `CutDef` is `BoxCut | MitreCut | HoleArrayCut`.
- It needs a `Map<ComponentId, Component>`, which a pure mask function has no reason to know about.

**Use `mitreFaceOutline` from `src/geom/mitre.ts` instead**, plus the box cut's own `position`/`size`. `mitreFaceOutline(board, mitres, 'Face')` already returns the board-local x-y outline in millimetres with its min corner at the origin, is pure and THREE-free, and has its own tests.

### 2. "Clears each box cut's footprint" would punch grooves out of the outline

A dado is not a notch. Measured on a Base 600 left side (560 × 720 × 18):

| cut | z-span | goes through 18 mm? |
|---|---|---|
| `Toe Kick Notch` | −9 → 27 | **yes** — really removes material from the outline |
| `Dado — Left Side / Bottom` | 12 → 18 | no — a 6 mm groove; the panel is still a full rectangle to cut around |
| `Dado — Left Side / Back` | 12 → 18 | no |
| `Dado — Left Side / Shelf 1` | 12 → 18 | no |

Clearing all five would carve a Base 600 side into ribbons and let the nester tuck a neighbour into a groove that is 6 mm deep in a part 18 mm thick. **A box cut removes outline material only when its z-span covers the whole thickness.**

### 3. `BoxCut.position` is the box's **min corner**, and one existing consumer disagrees

`makeCut` in `occt.ts` builds `BRepPrimAPI_MakeBox_1(size)` — a box spanning `[0, size]` — and translates it by `position`. So the tool spans `[position, position + size]`. The generated cuts above confirm it: a full-width dado on a 560-long panel is `position.x = 0, size.x = 560`, spanning x[0, 560].

**`projectCut` in `src/geom/drawing.ts:135` uses the opposite convention** — `x = (uPos - uSz/2) * scale` — treating `position` as the centre. That is a standing defect in the shop drawings, not a thing to copy: on a Base 600 side every Face-view cut rectangle is drawn outside the board rectangle (board 56 × 72 at 0.1 scale; cuts at x = −28, y = −36, …). It is **out of scope for this stage** and is reported separately; noted here so nobody reuses `projectCut` as a reference.

Only `projectCut` is affected — `projectHoleArray` reads `h.start` directly with no centring, which is why the hole-array e2e test passes.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/nest/mask.ts` | `Mask`, `occupancyMask(part, clearance)`, `maskArea(mask)`. Pure. |
| `src/nest/mask.test.ts` | Set-bit counts, the through-cut rule, mitres, dilation, and the property that a mask never exceeds its bounds. |

### Modified

Nothing. Stage 2 adds a leaf module with no callers; Stage 3 is its first consumer.

---

# Task 2.1: The `Mask` type and a plain rectangle

**Files:**
- Create: `src/nest/mask.ts`, `src/nest/mask.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest'
import { occupancyMask, maskArea } from './mask'

describe('occupancyMask — a plain panel', () => {
  it('is exactly its cut-size rectangle when there is no clearance', () => {
    const m = occupancyMask(board({ length: 600, width: 300, thickness: 18 }), 0)
    expect(m.w).toBe(600)
    expect(m.h).toBe(300)
    expect(maskArea(m)).toBe(600 * 300)
  })
})
```

`maskArea` counts set bits. It exists so tests can assert an area exactly rather than sampling cells, and Stage 3 needs it anyway to sort parts by area.

- [ ] **Step 2: Implement the type and the rectangle fill**

```ts
export interface Mask {
  w: number // cells, 1 mm each, along the board's own length
  h: number // cells along the board's own width
  bits: Uint8Array // row-major, length w * h; 1 = material
}
```

**The mask is in board-local axes** — `w` is `part.length`, `h` is `part.width` — **not** `cutDimensions`' grain-ordered pair. Keeping the two apart matters: `cutDimensions` answers "which dimension does the cutting list call the length", and the mask answers "what shape is this on a sheet". Stage 3 reads `part.grain` to decide which rotations are allowed, and a mask that had already been transposed would make that decision twice.

Dimensions are rounded **outward** (`Math.ceil`) so a 599.5 mm panel never nests as 599 and comes back short.

- [ ] **Step 3: Commit**

```bash
git add src/nest/mask.ts src/nest/mask.test.ts
git commit -m "feat(nest): a 1mm occupancy mask for a plain panel"
```

---

# Task 2.2: Through-cuts clear material; grooves do not

**Files:**
- Modify: `src/nest/mask.ts`, `src/nest/mask.test.ts`

This is the task the spec got wrong, so it carries the most weight.

- [ ] **Step 1: Failing tests**

Three, and the second is the one that would have caught the spec's version:

```ts
it('a through notch removes exactly its own area', () => {
  const notched = board({
    length: 600, width: 300, thickness: 18,
    cuts: [boxCut({ position: { x: 0, y: 0, z: -9 }, size: { x: 60, y: 100, z: 36 } })],
  })
  expect(maskArea(occupancyMask(notched, 0))).toBe(600 * 300 - 60 * 100)
})

it('a dado leaves the outline whole', () => {
  const grooved = board({
    length: 600, width: 300, thickness: 18,
    cuts: [boxCut({ position: { x: 0, y: 100, z: 12 }, size: { x: 600, y: 18, z: 6 } })],
  })
  expect(maskArea(occupancyMask(grooved, 0))).toBe(600 * 300)
})

it('a cut flush with both faces counts as through', () => {
  // position.z = 0, size.z = thickness exactly. computeFingerSlots emits this shape; the toe-kick
  // notch overshoots instead. Both conventions are live in this codebase (see the cabinet-assembly
  // notes) and both must read as through.
})
```

- [ ] **Step 2: Implement**

```ts
// A dado is not a notch. A box cut only changes the shape someone cuts around when it goes all the
// way through the material — a 6 mm groove in an 18 mm panel leaves a full rectangle. The kernel is
// the authority on the span: `makeCut` builds a box over [0, size] and translates it by `position`,
// so the tool occupies [position, position + size] and `position` is the min corner.
function isThroughCut(c: BoxCut, thickness: number): boolean {
  return c.position.z <= 0 && c.position.z + c.size.z >= thickness
}
```

and for each through cut, clear `[position.x, position.x + size.x) × [position.y, position.y + size.y)`, clamped to the mask.

The cut's `face` is **not** consulted. A box cut is an axis-aligned box in board-local space; its x-y footprint is its x-y span whichever face it was authored from, and `face` only ever mattered for choosing a drawing view.

`HoleArrayCut` is ignored entirely — a drilled hole does not change the outline anyone cuts around, and admitting a neighbour into a 5 mm shelf-pin hole is not a nest anyone would run. `MitreCut` is Task 2.3.

- [ ] **Step 3: Verify against a real cabinet, not a fixture**

Add a test that regenerates a Base 600 and asserts that **only the toe-kick notch** reduces any panel's mask below its full rectangle:

```ts
it('on a Base 600, only the toe-kick notch removes outline material', () => {
  // regenerateComponents + reconcileJoints, then for each board:
  //   maskArea === length * width, except the two sides, which are short by exactly 60 * 100.
})
```

This is the assertion that fails loudly if the through-cut rule is ever loosened back to "every box cut".

- [ ] **Step 4: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/nest
git commit -m "feat(nest): only a through-cut changes the outline, a groove does not"
```

---

# Task 2.3: Flat mitres shave the outline

**Files:**
- Modify: `src/nest/mask.ts`, `src/nest/mask.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('a 45° flat mitre removes a triangle of exactly half the drop times the width', () => {
  // axis 'Z', end '+X', angle 45 on a 600 x 300 board: drop = 300 * tan(45) = 300,
  // so the triangle is 300 * 300 / 2 = 45000 mm². Predicted, not asserted blind:
  // check it against mitreFaceOutline's own polygon rather than trusting this arithmetic.
})

it('a bevel through the thickness leaves the footprint square', () => {
  // axis 'Y' tilts through the thickness. The widest section is still the full rectangle, and that
  // is what a nest must reserve.
})
```

- [ ] **Step 2: Implement**

```ts
import { mitreFaceOutline } from '../geom/mitre'
```

Take `mitreFaceOutline({ length, width, thickness }, mitres, 'Face')` — board-local millimetres, min corner at the origin, already tested in `mitre.test.ts` — and fill the polygon instead of the plain rectangle. It returns four points `[bl, br, tr, tl]` and only ever moves `tr.x` or `tl.x`, so a scanline fill is four lines: for each row `y`, the run is `[leftEdgeAt(y), rightEdgeAt(y))` interpolated between `bl→tl` and `br→tr`.

Only `axis: 'Z'` mitres reach it — `mitreFaceOutline` filters on `relevantAxis` for the `'Face'` view itself, so passing every mitre is correct and the filter is not duplicated here.

**Round the polygon inward** (a cell is material only if its centre is inside), the opposite of the outward rounding on the overall dimensions. Both err the same way: never claim material the part does not have.

- [ ] **Step 3: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/nest
git commit -m "feat(nest): flat mitres shave the mask outline"
```

---

# Task 2.4: Clearance dilation

**Files:**
- Modify: `src/nest/mask.ts`, `src/nest/mask.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('grows a rectangle by half the clearance on every side', () => {
  const m = occupancyMask(board({ length: 100, width: 50, thickness: 18 }), 14)
  expect(m.w).toBe(100 + 14)
  expect(m.h).toBe(50 + 14)
  expect(maskArea(m)).toBe((100 + 14) * (50 + 14))
})

it('two masks that do not overlap are a full clearance apart', () => {
  // The property the dilation exists for, and the one Stage 3 will lean on. Place two dilated
  // 100x50 masks at the closest non-overlapping offset and check the gap between the *undilated*
  // rectangles is >= the clearance.
})

it('fills a notch narrower than the clearance', () => {
  // A 10 mm notch on a 14 mm clearance cannot admit anything, so dilation should close it. This is
  // the case that proves dilation runs on the cleared mask rather than on the bounding rectangle.
})
```

- [ ] **Step 2: Implement**

Half the clearance on each side, so two neighbours that just touch are one full clearance apart — the spec is explicit about this and it is the whole reason the margin is halved.

Use a **separable box dilation**: one horizontal pass with a running window of `2r+1`, then one vertical pass. O(w·h) regardless of `r`, and it needs no distance transform.

```ts
// A square structuring element, not a disc: a cell is grown if any cell within Chebyshev distance r
// is set. That over-reserves by up to r*(√2−1) mm at a 45° corner — always in the direction of more
// clearance, never less — and costs two linear passes instead of a distance transform. At 1 mm
// resolution against a 14 mm cutter the difference is under 3 mm at a corner and no part is ever
// placed closer than asked.
```

Record the choice in the notes. A disc is the "correct" element; the square is the defensible one, and saying which is which is the point.

Note the mask **grows** — `w` becomes `ceil(length) + 2 * ceil(r)`. Stage 3 must place by the dilated mask and report the undilated rectangle, or every reported offcut will be wrong by a clearance. Say so in the module's doc comment, since that is the mistake the next stage is most likely to make.

- [ ] **Step 3: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/nest
git commit -m "feat(nest): dilate a mask by half the tool clearance"
```

---

# Task 2.5: Properties, and the measurement

**Files:**
- Modify: `src/nest/mask.test.ts`
- Modify: `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md`

- [ ] **Step 1: Properties over a generated scene**

Sweep every role a carcase can emit — reuse the `SWEEP` idea from `src/scene/grain.test.ts`, which crosses `baseMode` × `backMode` × `hasTop` × divider-count × shelf-count — and assert, for every generated board:

1. `maskArea(mask) > 0` — no role ever masks to nothing.
2. `maskArea(occupancyMask(p, 0)) <= p.length * p.width` — a mask never claims material the part does not have.
3. `maskArea(occupancyMask(p, c))` is monotone non-decreasing in `c` over `[0, 4, 14, 30]`.
4. Determinism — same part, same clearance, byte-identical `bits`, twice.

Property 2 is the one that catches an off-by-one in the outward rounding, and property 1 the one that catches a through-cut rule that has become too eager.

- [ ] **Step 2: Measure, do not assert**

Time `occupancyMask` over a six-cabinet scene (42 parts) and record the figure in the notes. **Set no budget until there is a number.** For reference, the cabinet-assembly work measured pure regeneration at ~3 ms and a six-cabinet kernel build at ~2.7 s, so the mask has a lot of room before it is the thing to optimise.

A 2440 × 1220 sheet is 2.98 M cells and a large panel is ~0.4 M, so if this is slow the answer is a coarser grid, not a cleverer loop — but decide that against a measurement.

- [ ] **Step 3: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/nest docs
git commit -m "test(nest): mask properties over the full role sweep, and the first timing"
```

---

# Stage 2 acceptance

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green. Record the new test count.
- [ ] `pnpm build` — succeeds.
- [ ] `grep -rn "cutFootprintCorners\|projectCut" src/nest/` returns **nothing** — neither seam is reused, for the reasons measured above.
- [ ] `grep -rn "THREE\|opencascade\|react" src/nest/` returns **nothing** — the module is pure.
- [ ] Every rule added is **mutation-tested**: loosen `isThroughCut` to `true` and the Base 600 test must fail; drop the mitre outline and the mitre test must fail; halve the dilation radius and the clearance property must fail.
- [ ] The notes carry the measured six-cabinet mask timing and the square-vs-disc dilation decision.

## What Stage 2 deliberately does not do

- **No placement, no sheets, no rotation.** Stage 3.
- **No holes in the mask.** A drilled hole does not change the outline.
- **No fix to `projectCut`'s convention bug in `drawing.ts`.** Real, out of scope, reported separately.
- **No transposition for grain.** The mask stays in board axes; Stage 3 decides which rotations `part.grain` permits.


---

# What changed against this plan

### The dilation was specified as O(w·h) and the first implementation was not

Task 2.4 said "a separable box dilation: one horizontal pass with a running window of `2r+1`, then one vertical pass. O(w·h) regardless of `r`." The first implementation wrote the vertical pass as an inner loop over the `2r+1` window — O(w·h·r), roughly 31× the work at a 30 mm clearance on a 2100 mm panel — and the monotonicity property, which sweeps clearance over `[0, 4, 14, 30]`, timed out.

Rewritten with prefix sums, which is what "running window" actually requires. Measured after, and **flat in `r`**, which is the proof it worked: 17.6 ms for a 2100 × 560 panel at 14 mm and 18.2 ms at 30 mm. A six-cabinet job is **280 ms over 46 boards**, ~6 ms per board.

The plan was right about the complexity it wanted; the implementation did not deliver it, and only the property test noticed.

### The property tests were restructured, and got better for it

Written as specified they took 59 s. Two costs, both avoidable:

- `expect(a.bits).toEqual(b.bits)` on a multi-million-cell `Uint8Array` — vitest's deep equality was timing the determinism test out rather than finding a difference. A hand loop instead.
- Running the properties over **every** board the 96-case sweep emits, over a thousand of them, most near duplicates. Now **one board per role family** — 13.

The dedupe is better testing, not just cheaper: a family is the unit the mask rules are stated in. It also yields a free assertion, `boards.length === 13`, which agrees with the independent count in `grain.test.ts`.

### Everything the plan got right

Worth recording, since the plan's value was mostly in what it stopped: `cutFootprintCorners` was indeed the wrong seam, `mitreFaceOutline` was the right one, the through-cut rule was needed (a Base 600 side has four grooves and one notch), and `BoxCut.position` is the min corner — that last one turned into its own fix, merged as #34.
