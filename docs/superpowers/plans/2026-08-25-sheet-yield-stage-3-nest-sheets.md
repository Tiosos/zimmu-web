# Sheet Yield — Stage 3: `nestSheets`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place a job's masks onto stock sheets and report where each part lands, how many sheets it takes, and how well they are used.

**Architecture:** One pure module, `src/nest/nest.ts`. It consumes `Mask` from Stage 2 and produces `Placement[]` per sheet. No React, no THREE, no OCCT, no worker — Stage 4 moves it off-thread.

**Tech Stack:** TypeScript strict · Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-sheet-yield-design.md`
**Notes:** `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md`
**Depends on:** Stage 2 (`occupancyMask`), merged as #35.

---

## Conventions for every task in this plan

- **Package manager is pnpm.** Never npm or yarn.
- **Run before every commit:** `pnpm typecheck && pnpm lint && pnpm test`.
- **TDD is mandatory.** Write the failing test, run it, watch it fail *for the stated reason*, then implement.
- **No `any`.** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- **Comments explain *why*, never *what*.**
- Branch: `claude/sheet-yield-stage-3`. Never commit on `main`.

## The rule this plan inherits

**Do not write a test that asserts a number this plan supplied.** Stages 1 and 2 corrected five claims between them — in the spec, in their own plans, and in a test — and every one was found by checking the system against itself. Treat every expected value here as a prediction to be checked.

---

## What was measured before this plan was written

### The spec's rotation rule is wrong, and it makes a standard cabinet unnestable

The spec says:

> For each part, orientations are 0° and 180° always, plus 90° and 270° when the part's `grain` is `'free'` or the material's `hasGrain` is false.

That assumes grain always runs along the mask's **w** axis. It does not. The mask is in board-local axes (Stage 2's invariant) and `BoardPart.grain` names *which board axis* the grain runs along — `'length'` is the mask's w, `'width'` is the mask's h.

Measured against real generated panels at a 14 mm clearance on a 2440 × 1220 sheet:

| cabinet | role | board | grain | mask | fits at 0° | fits at 90° |
|---|---|---|---|---|---|---|
| Tall 600 | `left-side` | 560 × 2100 | `width` | 574 × 2114 | **no** | yes |
| Tall 600 | `back` | 1976 × 576 | `length` | 1990 × 590 | yes | **no** |
| Base 600 | `bottom` | 576 × 560 | `length` | 590 × 574 | yes | yes |

Under the spec's rule a Tall 600 side is grain-locked to 0°/180° — and **cannot be placed on a standard sheet at all**. A probe confirmed it: 6 of the 8 largest masks in a six-cabinet job failed to place.

**The corrected rule.** The sheet's grain runs along its length (the x axis). A part's grain must end up parallel to it:

| part `grain` | grain runs along | allowed rotations |
|---|---|---|
| `'length'` | the mask's **w** | 0°, 180° |
| `'width'` | the mask's **h** | **90°, 270°** |
| `'free'`, or material `hasGrain: false` | — | all four |

This is derived, not chosen: the mask is in board axes, `grain` names the board axis, and rotation maps board axes onto sheet axes. The spec's rule happens to be right for `'length'` parts and wrong for every `'width'` part — which is both cabinet sides, every divider, and the toe kick.

### The spec's placement cost claim is right, and was checked rather than assumed

> Placement scans for the lowest free position, then leftmost … First-fit rather than best-fit: predictable, fast, and good enough at 1 mm.

A naive cell-by-cell bottom-left scan over a 2440 × 1220 sheet looks catastrophic on paper — millions of candidate positions × hundreds of thousands of mask cells. **Measured: 46 parts placed in 1.1 s across 31.5 M candidate positions.** Early rejection carries it: in bottom-left order almost every candidate collides on its first row and costs a handful of comparisons, not a full mask scan.

So **keep first-fit and do not pre-optimise.** No corner-point candidate lists, no skyline, no bitset packing. If a real job ever gets slow, measure again and put the cleverness behind the same `nestSheets` signature.

### A `Mask` must carry its own padding

`occupancyMask` dilates by `ceil(clearance / 2)` on every side, so a placement positions the *dilated* mask but must report the *undilated* rectangle — otherwise every offcut and utilisation figure is a clearance out.

Recomputing `ceil(clearance / 2)` in `nest.ts` would be a second copy of a rule, which is the mistake this project keeps paying for. **Add `pad: number` to `Mask` in Stage 2's module** and have `occupancyMask` set it. The nester then reads `mask.pad` and never knows the formula.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/nest/nest.ts` | `NestItem`, `SheetSpec`, `Placement`, `NestResult`, `nestSheets`. Pure. |
| `src/nest/nest.test.ts` | The six properties, the rotation rule, and the yield sanity check. |

### Modified

| File | Change |
|---|---|
| `src/nest/mask.ts` | `Mask` gains `pad`; `occupancyMask` sets it. |
| `src/nest/mask.test.ts` | One test that `pad` is half the clearance, rounded up. |

---

# Task 3.1: `Mask` carries its padding

**Files:** `src/nest/mask.ts`, `src/nest/mask.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('records the padding it added, so a caller never recomputes the formula', () => {
  expect(occupancyMask(board({ length: 100, width: 50 }), 14).pad).toBe(7)
  expect(occupancyMask(board({ length: 100, width: 50 }), 15).pad).toBe(8)
  expect(occupancyMask(board({ length: 100, width: 50 }), 0).pad).toBe(0)
})
```

- [ ] **Step 2: Implement** — add `pad: number` to `Mask`, set it from the same `r` the dilation uses. Both return paths must set it, including the `clearance === 0` one.

- [ ] **Step 3: Commit** — `feat(nest): a mask records the padding it added`

---

# Task 3.2: The rotation rule

**Files:** `src/nest/nest.ts`, `src/nest/nest.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('allowedRotations', () => {
  it('a length-grained part stays along the sheet', () => {
    expect(allowedRotations('length', true)).toEqual([0, 180])
  })

  it('a width-grained part must turn 90 degrees to lie along the sheet', () => {
    expect(allowedRotations('width', true)).toEqual([90, 270])
  })

  it('an unconstrained part may take any quarter turn', () => {
    expect(allowedRotations('free', true)).toEqual([0, 90, 180, 270])
  })

  it('grainless stock frees even a grained part', () => {
    expect(allowedRotations('length', false)).toEqual([0, 90, 180, 270])
  })
})
```

Then the one that proves the rule matters, built from real geometry rather than a fixture:

```ts
it('a Tall 600 side can be placed on a standard sheet', () => {
  // regenerate a Tall 600, take left-side, mask it at 14 mm, and assert that at least one allowed
  // rotation fits within 2440 x 1220. Under the spec's original rule this fails.
})
```

- [ ] **Step 2: Implement**

```ts
// The sheet's grain runs along its length. `grain` names which of the board's own axes the grain
// runs along, and the mask is in board axes — so 'length' is already parallel to the sheet and
// 'width' has to turn. 180° is in every list because a notched or mitred part is not symmetric
// even when its bounding box is.
export function allowedRotations(grain: Grain, stockHasGrain: boolean): Rotation[] {
  if (grain === 'free' || !stockHasGrain) return [0, 90, 180, 270]
  return grain === 'length' ? [0, 180] : [90, 270]
}
```

- [ ] **Step 3: Commit** — `feat(nest): grain decides which quarter turns a part may take`

---

# Task 3.3: Rotating a mask

**Files:** `src/nest/nest.ts`, `src/nest/nest.test.ts`

- [ ] **Step 1: Failing tests** — properties, not a hand-drawn expected bitmap:

```ts
it('preserves area under every rotation', () => { /* maskArea is invariant */ })
it('swaps w and h at 90 and 270, keeps them at 0 and 180', () => {})
it('four 90-degree turns return the original bits', () => {})
it('180 degrees maps a corner cell to the opposite corner', () => {})
```

The four-turns-is-identity test is the one that catches an index slip; a hand-written expected bitmap would just be a second implementation.

- [ ] **Step 2: Implement** `rotateMask(m, rotation): Mask`, carrying `pad` through unchanged — dilation is isotropic, so a turn does not change it.

- [ ] **Step 3: Commit** — `feat(nest): rotate a mask by a quarter turn`

---

# Task 3.4: Placement

**Files:** `src/nest/nest.ts`, `src/nest/nest.test.ts`

- [ ] **Step 1: The types**

```ts
export type Rotation = 0 | 90 | 180 | 270

export interface NestItem {
  id: string // part id: the report needs it, and ties in the sort break on it
  mask: Mask
  grain: Grain
}

export interface SheetSpec {
  length: number // along the sheet's grain
  width: number
}

export interface Placement {
  id: string
  sheet: number
  rotation: Rotation
  // The min corner and extent of the REAL part, not its dilated mask. Everything downstream —
  // utilisation, offcuts, the SVG — measures material, and the mask is bigger than the material by
  // `mask.pad` on every side.
  x: number
  y: number
  w: number
  h: number
}

export interface NestResult {
  sheets: Placement[][]
  utilisation: number[] // per sheet: placed part area / sheet area
  unplaced: string[] // ids that fit no sheet in any allowed rotation
}
```

`unplaced` is not in the spec and is required: a part larger than the stock in every allowed rotation has no home, and silently dropping it would make the sheet count a lie. A 3000 mm panel on a 2440 mm sheet is a real user mistake, not an impossible state.

- [ ] **Step 2: Failing tests** — the six properties from the spec, every one recomputed from the returned placements rather than from the engine's internals.

1. **No two placed parts overlap.** Rebuild each placement's mask from its item and rotation, offset it by the placement, and check pairwise per sheet. *This is the property the whole engine exists to satisfy.*
2. **Every part is placed exactly once**, across all sheets and `unplaced` together.
3. **Every placement lies wholly within its sheet.**
4. **A grain-locked part never appears at a rotation its grain forbids.**
5. **Determinism** — same input twice, identical output.
6. **Clearance is respected** — no two placed parts are closer than the clearance. Measure between the *reported rectangles*, which is where the `pad` bookkeeping either holds or does not.

Plus the yield sanity check: *n* identical parts that tile a sheet exactly occupy exactly one sheet.

- [ ] **Step 3: Implement**

- Sort by mask area descending, ties by `id`. Determinism comes from the sort being total.
- For each item, for each allowed rotation, scan y ascending then x ascending; take the first position where the rotated mask does not collide.
- Rotation order within an item is the order `allowedRotations` returns, so it is fixed.
- Open a new sheet when no rotation fits on any existing sheet. **Try every open sheet before opening a new one** — the spec says "a new sheet opens when no orientation fits anywhere on the current one", but a part rejected from sheet 1 may well fit in sheet 2's offcut, and only trying the current sheet wastes stock.
- A part that fits no sheet even when empty goes to `unplaced`.

- [ ] **Step 4: Mutation-test each property** — break the collision test and property 1 must fail; drop the rotation filter and property 4 must fail; make the sort unstable and property 5 must fail.

- [ ] **Step 5: Measure** — time a six-cabinet job and record it. The naive scan measured 1.1 s for 46 parts before this plan; confirm the real implementation is in the same range and record the figure. **Set no budget until there is a number.**

- [ ] **Step 6: Commit** — `feat(nest): place masks onto sheets, bottom-left first fit`

---

# Stage 3 acceptance

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green. Record the test count.
- [ ] `pnpm build` — succeeds.
- [ ] `grep -rniE "three|opencascade|from 'react'" src/nest/*.ts` — nothing.
- [ ] `grep -rn "clearance / 2" src/nest/nest.ts` — nothing; the pad formula lives only in `mask.ts`.
- [ ] All six properties pass over a six-cabinet job, not just over fixtures.
- [ ] Every property mutation-tested.
- [ ] The notes carry the measured nest timing and the corrected rotation rule.

## What Stage 3 deliberately does not do

- **No worker, no UI.** Stage 4.
- **No best-fit or offcut banking.** First-fit, measured adequate. Better heuristics go behind the same signature if a real job ever needs them.
- **No grouping by material.** `nestSheets` nests one material's parts onto one stock size; Stage 4 groups.
