# Sheet Yield — Stage 1: grain and stock data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grain direction and sheet stock real, persisted data — on a board, on a material, and in the material library — and let the cutting list use grain to decide which dimension is the length. Nothing nests yet; this stage is the data the nester will consume, and it pays for itself on its own by fixing which dimension the cutting list calls the length.

**Architecture:** `BoardPart` gains `grain: Grain`. `MaterialDef` gains optional `sheet` and `hasGrain`. The carcase generator states its grain convention in **carcase axes** and derives the board field through the same axis map `orientedPanel` already uses, so the role→field table is a consequence rather than a second hand-written table. `parseFile` normalises `grain` once at the boundary, the way `parentId` and `backSetback` are handled. `cutDimensions` consults grain first and falls back to longest-first.

**Tech Stack:** React 19 · TypeScript strict · Vitest + happy-dom + @testing-library/react · Playwright · Tailwind v4 + Radix.

**Status:** **Complete.** All seven tasks implemented on `claude/sheet-yield-stage-1`. Acceptance: 1150 unit tests across 61 files (10 skipped), 13 e2e green, `pnpm build` succeeds. Two of the plan's own claims turned out to be wrong and were corrected in the code — see "What changed against this plan" at the foot.

**Spec:** `docs/superpowers/specs/2026-08-23-sheet-yield-design.md`
**Notes:** `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md` — update it whenever a decision deviates from this plan.

---

## Conventions for every task in this plan

- **Package manager is pnpm.** Never npm or yarn.
- **Run before every commit:** `pnpm typecheck && pnpm lint && pnpm test`. A pre-commit hook runs typecheck and will block a red commit.
- **TDD is mandatory.** Write the failing test, run it, watch it fail *for the stated reason*, then implement. A test that passes before the implementation is not a test of the implementation.
- **No `any`.** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- **Comments explain *why*, never *what*.**
- Branch: `claude/sheet-yield-stage-1`. Never commit on `main`.

## The one rule this plan inherits from the cabinet-assembly work

**Do not write a test that asserts a number this plan supplied.** Every real defect in the previous ten phases was found by checking the system against itself — and the previous plan was wrong about its own code twice, including in the mutation it specified to prove a test bites. Where this plan gives an expected value, treat it as a *prediction to be checked*, not a fixture to be copied. If the code disagrees with this document, the code may well be right; measure before you edit either.

The correction already recorded in the spec is the live example: the spec originally asserted that grain always runs along a panel's longer dimension, and measurement found two ordinary cabinets where it does not.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/scene/grain.ts` | `Grain`, the carcase-axis grain convention, and `grainFieldFor(thicknessAxis, grainAxis)`. Pure, no React, no THREE. |
| `src/scene/grain.test.ts` | The axis map checked **against `orientedPanel`**, the role convention, and the preset-scoped agreement property. |

### Modified

| File | Change |
|---|---|
| `src/scene/types.ts` | `Grain` re-export; `grain: Grain` on `BoardPart`; `sheet` + `hasGrain` on `MaterialDef`. |
| `src/scene/carcaseRoles.ts` | `RoleSpec` gains `grain`; `carcaseRoles` fills it from `grain.ts`. |
| `src/scene/regenerateComponents.ts` | The emitted `BoardPart` carries `r.grain`. |
| `src/scene/useScene.ts` | The `+ Board` default board carries `grain: 'free'`. |
| `src/scene/useFile.ts` | `parseFile` defaults `grain` to `'free'`; `FILE_FORMAT_VERSION` stays **12** (justified in Task 1.4). |
| `src/scene/idb.ts` | A `settings` store for the global clearance. **DB_VERSION 2 → 3.** |
| `src/scene/useMaterialLibrary.ts` | Loads and persists the global clearance beside the rates. |
| `src/ui/buildCsv.ts` | `cutDimensions` consults grain; a Grain column in the board CSV. |
| `src/ui/CuttingList.tsx` | A Grain column in the on-screen table. |
| `src/ui/EditPanel.tsx` | A grain control in the Shape section, read-only on a driven part. |
| `src/ui/BomModal.tsx` | Library tab: sheet length/width/cost per material, and the global clearance field. |
| `CLAUDE.md`, `project-structure.html` | Re-baseline for `grain.ts` and the IDB v3 store. |

---

# Task 1.1: The grain type and the derivation

**Files:**
- Create: `src/scene/grain.ts`, `src/scene/grain.test.ts`
- Modify: `src/scene/types.ts`

This task is the load-bearing one. Everything downstream reads the field it produces.

## Why a separate module and not more of `carcaseRoles.ts`

`carcaseRoles.ts` is 646 lines and already owns three tables (boxes, joints, contact pairs). Grain is consumed by `buildCsv`, `EditPanel` and — in Stage 3 — the nester, none of which want to import the carcase generator. A 40-line pure module is the smaller seam.

- [ ] **Step 1: Add the type to `src/scene/types.ts`**

Above `BoardPart`:

```ts
// 'free' means the nester may rotate the part 90°. It is the default for a hand-made board and is
// never what the carcase generator emits — a generated panel always states a direction.
export type Grain = 'length' | 'width' | 'free'
```

and add to `BoardPart`, after `thickness`:

```ts
  grain: Grain
```

Note this is **not** optional. `parseFile` normalises it at the boundary (Task 1.4), so no read site carries `?? 'free'`. Expect roughly a dozen typecheck errors from test fixtures once this lands — that is the compiler doing its job, and each one is a real construction site.

Also widen `MaterialDef`:

```ts
export interface MaterialDef {
  costPerM2?: number // areal rate ($/m²) for sheet/board stock
  costPerM?: number // linear rate ($/m) for round/linear stock (dowels)
  // Absent means the material is not nested — dowels, hardware, solid stock bought to length. Such
  // a material keeps its Boards-tab rows and is simply absent from the yield report.
  sheet?: { length: number; width: number; costPerSheet?: number }
  // MDF and the like: the stock has no direction, so the nester may rotate any part of it 90°
  // regardless of that part's own grain. Absent is treated as "has grain" — the safe default.
  hasGrain?: boolean
}
```

- [ ] **Step 2: Write the failing tests first — `src/scene/grain.test.ts`**

Three groups, in this order. The first is the important one.

```ts
import { describe, expect, it } from 'vitest'
import { carcaseBoxes, carcaseRoles, orientedPanel } from './carcaseRoles'
import type { LocalBox } from './carcaseRoles'
import type { ThicknessAxis } from './types'
import { CARCASE_PRESETS } from './carcasePresets'
import { GRAIN_IN_PLANE, grainAxisOf, grainFieldFor } from './grain'

// Distinct extents on every axis, so a wrong mapping cannot coincidentally match.
const BOX: LocalBox = { x0: 0, x1: 100, y0: 0, y1: 200, z0: 0, z1: 300 }
const EXTENT = { x: 100, y: 200, z: 300 } as const
const AXES: ThicknessAxis[] = ['x', 'y', 'z']

describe('GRAIN_IN_PLANE agrees with orientedPanel', () => {
  // The whole point of stating grain in carcase axes: the board field it lands on is *derived*
  // from the same map orientedPanel uses. If someone changes orientedPanel's rotations without
  // changing this table, this test is what catches it.
  it.each(AXES)('thickness on %s: the table names the axes orientedPanel actually used', (ax) => {
    const panel = orientedPanel(BOX, ax)
    expect(panel.length).toBe(EXTENT[GRAIN_IN_PLANE[ax].length])
    expect(panel.width).toBe(EXTENT[GRAIN_IN_PLANE[ax].width])
  })

  it.each(AXES)('thickness on %s: the thickness axis is not in the in-plane pair', (ax) => {
    expect(Object.values(GRAIN_IN_PLANE[ax])).not.toContain(ax)
  })
})
```

Then the role convention. **Derive the expectation from `carcaseBoxes`, not from a typed list of roles** — a hand-typed role list silently omits the role someone adds later:

```ts
describe('every generated role states a grain direction', () => {
  it.each(CARCASE_PRESETS.map((p) => [p.name, p.params] as const))(
    '%s: no role is grain-free, and no grain runs along the thickness',
    (_name, params) => {
      const boxes = carcaseBoxes(params)
      expect(boxes.length).toBeGreaterThan(0)
      for (const b of boxes) {
        const axis = grainAxisOf(b.role)
        expect(axis).not.toBe(b.thicknessAxis)
        expect(grainFieldFor(b.thicknessAxis, axis)).not.toBe('free')
      }
    },
  )
})
```

Add one case covering the roles the presets do not reach — a `ladder` base with dividers, so `ladder-left`, `ladder-mid-*`, `divider-*` and multi-bay `shelf-b-i` all appear. **`grainAxisOf` must throw on an unknown role rather than default**, and this test is what proves the presets plus that one case cover every role `carcaseBoxes` can emit.

Third group, the preset-scoped agreement property — note the test name:

```ts
describe('for the presets only, grain agrees with longest-first', () => {
  // Deliberately scoped to CARCASE_PRESETS. This is NOT a property of the role table: a 1200×400
  // wall unit's back and a three-bay 900's shelf both run grain along their *shorter* dimension.
  // See the Correction section in the design doc. Asserting it as a law would pass here and be
  // believed.
  it.each(CARCASE_PRESETS.map((p) => [p.name, p.params] as const))('%s', (_name, params) => {
    for (const r of carcaseRoles(params)) {
      const grainDim = r.grain === 'length' ? r.panel.length : r.panel.width
      const otherDim = r.grain === 'length' ? r.panel.width : r.panel.length
      expect(grainDim).toBeGreaterThanOrEqual(otherDim)
    }
  })
})
```

and immediately below it, the counter-examples, as a *passing* test that pins the disagreement:

```ts
it('a wide low wall unit runs its back grain along the shorter dimension', () => {
  const params = { ...CARCASE_PRESETS[1].params, width: 1200, height: 400, fixedShelves: 0 }
  const back = carcaseRoles(params).find((r) => r.role === 'back')!
  expect(back.grain).toBe('length')
  expect(back.panel.length).toBeLessThan(back.panel.width)
})

it('a narrow bay runs its shelf grain along the shorter dimension', () => {
  const params = { ...CARCASE_PRESETS[0].params, width: 900, dividers: [1 / 3, 2 / 3] }
  const shelf = carcaseRoles(params).find((r) => r.role === 'shelf-0-0')!
  expect(shelf.grain).toBe('length')
  expect(shelf.panel.length).toBeLessThan(shelf.panel.width)
})
```

Run: `pnpm vitest run src/scene/grain.test.ts` — every test must fail on "Cannot find module './grain'". That is the expected failure; anything else means a stale import.

- [ ] **Step 3: Implement `src/scene/grain.ts`**

```ts
import type { ThicknessAxis } from './carcaseRoles'
import type { Grain } from './types'

export type GrainAxis = 'x' | 'y' | 'z'

// Which carcase axes a panel's length and width land on, given where its thickness is. This
// mirrors `orientedPanel`'s three rotations and is checked against them in the tests — the map is
// the contract, the rotations are the implementation.
export const GRAIN_IN_PLANE: Record<ThicknessAxis, { length: GrainAxis; width: GrainAxis }> = {
  z: { length: 'x', width: 'y' },
  x: { length: 'y', width: 'z' },
  y: { length: 'z', width: 'x' },
}

// The convention, stated once, in carcase axes. Vertical panels run grain up (+Z); flat panels and
// the kick run it across the cabinet (+X); ladder side rails run it front-to-back (+Y). Which
// board *field* that becomes is derived below and differs per role — that is the frames differing,
// not the convention.
export function grainAxisOf(role: string): GrainAxis {
  if (role === 'left-side' || role === 'right-side' || role.startsWith('divider-')) return 'z'
  if (role === 'back') return 'z'
  if (role === 'bottom' || role === 'top' || role.startsWith('shelf-')) return 'x'
  if (role === 'toe-kick' || role === 'ladder-front' || role === 'ladder-back') return 'x'
  if (role === 'ladder-left' || role === 'ladder-right' || role.startsWith('ladder-mid-')) return 'y'
  // Deliberately fatal. A silent default would give a new role an arbitrary grain and no test
  // would notice — a nest would just come out slightly worse for a reason nobody could find.
  throw new Error(`zimmu: no grain convention for role "${role}"`)
}

export function grainFieldFor(thicknessAxis: ThicknessAxis, grainAxis: GrainAxis): Grain {
  const inPlane = GRAIN_IN_PLANE[thicknessAxis]
  if (grainAxis === inPlane.length) return 'length'
  if (grainAxis === inPlane.width) return 'width'
  // Grain along the thickness is meaningless for a sheet good; the caller has a bad pairing.
  throw new Error(`zimmu: grain axis ${grainAxis} is the thickness axis of this panel`)
}
```

Run the tests. If the third group fails on a preset, **do not adjust the expectation** — a preset panel genuinely runs grain across its short edge and the spec's correction needs another row.

- [ ] **Step 4: Commit**

```bash
git add src/scene/grain.ts src/scene/grain.test.ts src/scene/types.ts
git commit -m "feat(scene): grain direction as derived data, not a second table"
```

Typecheck will be red at this point because `BoardPart.grain` is required and nothing sets it. That is expected and Task 1.2 closes it — **but the pre-commit hook runs typecheck and will block this commit.** Either fold Steps 1–4 of Tasks 1.1 and 1.2 into one commit, or add `grain` to `BoardPart` in Task 1.2 instead. Prefer the former: the type and its first producer belong together.

---

# Task 1.2: The generator emits grain

**Files:**
- Modify: `src/scene/carcaseRoles.ts`, `src/scene/regenerateComponents.ts`, `src/scene/useScene.ts`
- Modify: `src/scene/carcaseRoles.test.ts`, `src/scene/regenerateComponents.test.ts`

- [ ] **Step 1: Failing test in `regenerateComponents.test.ts`**

The one that matters is not "a side has grain `width`" — that restates the table. It is that a **detached** part keeps the grain the user gave it:

```ts
it('a detached part keeps its own grain when the cabinet regenerates', () => {
  // ... build a scene with one carcase, take the left-side part, detach it with grain 'free'
  const after = regenerateComponents({ ...scene, parts: detachedParts })
  const side = after.parts.find((p) => p.id === detachedId)!
  expect(side.kind === 'board' && side.grain).toBe('free')
})
```

This works for free — `regenerateOne` returns `existing` untouched when `!existing.driven` — but it is the contract Stage 3 will lean on, so it wants a standing test.

Add one more that would catch a real slip:

```ts
it('every generated board carries a direction, never free', () => {
  const after = regenerateComponents(sceneWithCarcase)
  const driven = after.parts.filter((p) => p.driven && p.kind === 'board')
  expect(driven.length).toBeGreaterThan(0)
  for (const p of driven) expect(p.kind === 'board' && p.grain).not.toBe('free')
})
```

- [ ] **Step 2: `RoleSpec` gains `grain`**

In `carcaseRoles.ts`:

```ts
export interface RoleSpec {
  role: string
  label: string
  panel: PanelSpec
  grain: Grain
}
```

and in `carcaseRoles`, the final map:

```ts
  return boxes.map((b) => ({
    role: b.role,
    label: b.label,
    panel: orientedPanel(b.box, b.thicknessAxis),
    grain: grainFieldFor(b.thicknessAxis, grainAxisOf(b.role)),
  }))
```

`grain.ts` imports `ThicknessAxis` from `carcaseRoles.ts` and `carcaseRoles.ts` imports the two functions back. **That is a cycle.** Break it by moving `ThicknessAxis` into `types.ts` — it is a three-string union with no dependencies, and `carcaseRoles.ts` can re-export it so its existing importers do not move. Verify with `pnpm build`; Vite will not warn about a type-only cycle but `verbatimModuleSyntax` makes the import real if anyone drops the `type` keyword.

- [ ] **Step 3: `regenerateComponents.ts` — one line**

In the `BoardPart` literal, after `thickness: r.panel.thickness`:

```ts
      grain: r.grain,
```

Note it is **not** `existing?.grain ?? r.grain`. A driven part's grain belongs to its cabinet, exactly as its material does; a detached part never reaches this line.

- [ ] **Step 4: `useScene.ts` — the `+ Board` default**

Add `grain: 'free',` to the default board literal after `thickness: 25,`.

`'free'` and not `'length'`: a hand-made board's grain is unknown, and the spec defers the question of whether that should change once the field exists and can be lived with. Record in the notes if it starts to feel wrong.

- [ ] **Step 5: Fix the fixtures the compiler now rejects**

`pnpm typecheck` will list every place a `BoardPart` is built literally in a test. Add `grain: 'free'` to each **unless the test is about grain** — a fixture that quietly says `'length'` to make a test pass is how a wrong expectation gets frozen.

- [ ] **Step 6: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/scene
git commit -m "feat(scene): carcase roles emit their grain direction"
```

Use `git add -u src/scene`, never `git add -A`. This repo has been bitten twice by `-A` sweeping an unrelated in-flight edit into a commit.

---

# Task 1.3: `cutDimensions` consults grain

**Files:**
- Modify: `src/ui/buildCsv.ts`, `src/ui/buildCsv.test.ts`, `src/ui/CuttingList.tsx`

This is the task that changes what the user sees, and the task with a real behaviour change to own.

- [ ] **Step 1: Failing tests in `buildCsv.test.ts`**

```ts
it('grain decides the length, even when it is the shorter dimension', () => {
  const part = board({ length: 285, width: 548, thickness: 18, grain: 'length' })
  expect(cutDimensions(part)).toEqual({ length: 285, width: 548, thickness: 18 })
})

it('grain on width swaps the pair', () => {
  const part = board({ length: 560, width: 720, thickness: 18, grain: 'width' })
  expect(cutDimensions(part)).toEqual({ length: 720, width: 560, thickness: 18 })
})

it('free grain keeps the longest-first rule', () => {
  const part = board({ length: 560, width: 720, thickness: 18, grain: 'free' })
  expect(cutDimensions(part)).toEqual({ length: 720, width: 560, thickness: 18 })
})
```

The second and third cases return the same pair by two different routes. That is deliberate — it is the case that would hide a bug where `grain` is ignored. Prove the first test fails against the current implementation **before** writing the new one; if it passes, the fixture is wrong.

- [ ] **Step 2: Implement**

```ts
// What a woodworker cuts, which is not what the part stores: `orientedPanel` fixes which carcase
// axis a board's x lands on to keep `position` the box min corner, so a 720 mm tall side is stored
// length 560. Grain decides which dimension is the length, because that is what the length *means*
// on a sheet good; size only decides it when grain is unconstrained. Thickness is never in play.
export function cutDimensions({ length, width, thickness, grain }: BoardPart): CutDims {
  if (grain === 'length') return { length, width, thickness }
  if (grain === 'width') return { length: width, width: length, thickness }
  return length >= width ? { length, width, thickness } : { length: width, width: length, thickness }
}
```

- [ ] **Step 3: Own the behaviour change**

Grain-aware cut dimensions **re-baseline two known cabinets**: a 1200 × 400 wall unit's back and a narrow-bay shelf now report length and width swapped relative to today. That is the correct answer, and it is a change. Two consequences to check, not assume:

1. `groupParts`' key is `${component}|${dims.length}×${dims.width}×${dims.thickness}|...`. Two parts that used to group now split if their grain differs. **That is correct** — they are different cuts — but confirm no existing test asserted a merged row that now splits, and if one does, fix the test's *expectation*, not `cutDimensions`.
2. `EditPanel`'s `cutSizeNote` shows only when `cut.length !== part.length`. It will now appear on panels where it did not. Check its wording still reads correctly when the "cut size" is the *smaller*-first pair.

- [ ] **Step 4: A Grain column**

In `buildCsv`'s header, after `Thickness (mm)`, add `Grain`; in each row, emit `row.grain`. Add `grain: Grain` to `GroupedRow` and set it from the part.

Two parts in the same group always share a grain — grain feeds `cutDimensions`, whose output is in the key — so taking it from the first part of a group is sound rather than lossy. Assert exactly that in a test, because it is the kind of claim that is true today and quietly stops being true when the key changes:

```ts
it('every part in a group shares the grain the row reports', () => {
  // build a mixed scene, group it, then re-derive: for each row, every part whose key matches
  // must have the row's grain.
})
```

Add the same column to `CuttingList.tsx`'s table. Render `'free'` as `—`: a dash reads as "unconstrained" where the word "free" reads as a cost.

- [ ] **Step 5: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/ui
git commit -m "feat(ui): grain decides the cut length, and the cutting list says so"
```

---

# Task 1.4: `parseFile` normalisation, and why the version does not bump

**Files:**
- Modify: `src/scene/useFile.ts`, `src/scene/useFile.test.ts`

- [ ] **Step 1: Failing test**

```ts
it('defaults grain to free on a file that predates the field', () => {
  const v12 = JSON.stringify({ ...FIXTURE, version: 12 }) // FIXTURE's board has no `grain`
  const part = parseFile(v12).scene.parts[0]
  expect(part.kind === 'board' && part.grain).toBe('free')
})

it('keeps a grain the file already carries', () => {
  // ... a board with grain: 'width' round-trips untouched
})
```

The second test is the one that catches a normaliser written as `grain: 'free'` instead of `grain: p.grain ?? 'free'`. Both are needed.

- [ ] **Step 2: Implement**

In `parseFile`'s board branch, beside `driven: p.driven ?? false`:

```ts
            grain: p.grain ?? 'free',
```

Only the board branch. `CylinderPart` has no grain and must not grow one.

- [ ] **Step 3: Do not bump `FILE_FORMAT_VERSION`**

Leave it at **12**, and record the reasoning in the notes:

> A version bump earns its keep when an older *app* would misread a newer file. It would not here.
> `grain` is additive and defaulted; a v12 app reading a file this app wrote simply ignores the
> field, and the board it renders is identical because grain changes no geometry — only which
> dimension the cutting list calls the length. Bumping would force every file through a migration
> that does nothing and would make "v13" mean nothing in particular.
>
> The line where this stops being true: **Stage 1 does not cross it, Stage 3 might.** Once a
> `.zimmu` file carries a nest result or a sheet definition that an older app would render wrong,
> bump then, and let 13 mean that.

This is a deliberate departure from the run of bumps through v12, so it needs the argument written down rather than a silent omission.

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/scene docs/superpowers/notes
git commit -m "feat(scene): default grain at the parse boundary, and hold at v12"
```

---

# Task 1.5: The grain control in the edit panel

**Files:**
- Modify: `src/ui/EditPanel.tsx`, `src/ui/EditPanel.test.tsx`

- [ ] **Step 1: Failing tests**

Two, and the second is the one worth having:

```ts
it('sets grain on an undriven board', async () => {
  // render EditPanel with an undriven board, open the grain select, choose Width,
  // assert onUpdate produced grain: 'width'
})

it('a driven board shows its grain read-only and names the owner', () => {
  // render with driven: true; the select is disabled and the owner label is shown
})
```

Radix `Select` **does** open under happy-dom — `CarcasePanel.test.tsx` already clicks a `SelectItem`. Scope the query with `within(row)` rather than `getAllByRole('combobox')[0]`, which reaches past the row you meant.

Put the new `describe` block's `afterEach(cleanup)` in place before writing the tests. A rendered panel that leaks into a later block produces failures that look like the feature is broken.

- [ ] **Step 2: Implement**

In the Shape section, after the `T` `DimInput` and before `cutSizeNote`:

```tsx
              <div className="flex items-center gap-1.5 mb-1">
                <Label htmlFor="part-grain" className="w-8 shrink-0 text-right">
                  Grain
                </Label>
                <Select
                  value={part.grain}
                  // A driven part's grain is its cabinet's, exactly as its material is: the
                  // generator rewrites it on every regeneration, so an edit here would revert on
                  // the next keystroke and leave a junk undo entry behind.
                  disabled={part.driven}
                  onValueChange={(v) => onUpdate(part.id, (p) => ({ ...p, grain: v as Grain }))}
                >
                  <SelectTrigger id="part-grain" className="h-7 flex-1 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="length">Along length</SelectItem>
                    <SelectItem value="width">Along width</SelectItem>
                    <SelectItem value="free">Free (no grain)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {part.driven && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Grain is set by {ownerLabel}.
                </div>
              )}
```

`onUpdate(part.id, (p) => ({ ...p, grain: ... }))` on a `Part` union: `grain` is only on `BoardPart`, so the updater needs the `p.kind === 'board'` guard the cylinder branch uses elsewhere in this file. Follow the existing pattern rather than casting.

The control sits inside the `part.kind === 'board'` branch, so a cylinder never renders it.

- [ ] **Step 3: Mutation-test both**

Flip `disabled={part.driven}` to `disabled={false}` and confirm the second test fails. Then remove the `onValueChange` body and confirm the first fails. A guard test that passes with its guard removed is not a test.

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/ui
git commit -m "feat(ui): grain control on a board, read-only when a cabinet owns it"
```

---

# Task 1.6: Sheet stock and the global clearance in the library

**Files:**
- Modify: `src/scene/idb.ts`, `src/scene/idb.test.ts`, `src/scene/useMaterialLibrary.ts`, `src/ui/BomModal.tsx`

Two separate things share this task because they share the IDB upgrade.

## The IDB version bump

`DB_VERSION` goes **2 → 3** with a third store, `settings`. Per `CLAUDE.md`'s invariant, a bump requires adding the store in `onupgradeneeded` — and note the existing handler is already written to be re-entrant (`if (!db.objectStoreNames.contains(...))`), so adding one more line is the whole change:

```ts
const DB_VERSION = 3
const SETTINGS_STORE = 'settings'
// …
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE)
```

**Why a store and not a `library` entry keyed `"__clearance"`:** the library store is keyed by material name and its values are `MaterialDef`. A magic key whose value is a number would make `readLibrary`'s `Record<string, MaterialDef>` a lie, and every consumer would need to filter it out. A store costs one line.

- [ ] **Step 1: Failing tests in `idb.test.ts`**

`fake-indexeddb/auto` is already in `vitest.setup.ts`, so this is testable directly:

```ts
it('a v2 database upgrades to v3 without losing its library entries', async () => {
  // open at v2 with the OLD schema, write a library entry, close,
  // then call openDb() (v3) and assert the entry survives and `settings` exists
})

it('reads back a clearance it wrote', async () => { /* writeClearance(14) → readClearance() */ })

it('returns the default clearance when none was ever written', async () => {
  expect(await readClearance()).toBe(DEFAULT_CLEARANCE)
})
```

The first is the one that matters. An `onupgradeneeded` that drops a store is silent data loss, and it is the exact failure mode a version bump invites.

- [ ] **Step 2: Implement the accessors**

```ts
// One global setting rather than per-material: it is a property of the machine, not the sheet.
// 14 mm is a common router-cutter diameter; applied as a margin around every placed part, so the
// gap between two neighbours is one clearance, not two.
export const DEFAULT_CLEARANCE = 14
```

with `readClearance(): Promise<number>` and `writeClearance(mm: number): Promise<void>` following the shape of the existing library accessors exactly — same open/transaction/close/reject structure. Do not refactor the existing four into a generic helper; that is an improvement to adjacent code this task did not ask for.

- [ ] **Step 3: `useMaterialLibrary` carries the clearance**

Widen the result to `{ library, clearance, saveRate, deleteEntry, setClearance }`, loading the clearance in the same `useEffect` and persisting on change, exactly as `saveRate` does. The optimistic-`setState`-then-`void write().catch(console.error)` pattern is the one already used; match it.

- [ ] **Step 4: The Library tab UI**

Add three columns to `LibraryTab`'s table — Sheet L, Sheet W, Cost/sheet — each an `Input` writing back through `onSaveRate(name, { ...def, sheet: { ... } })`. A material with no sheet shows `—` in all three; typing a length into a material that has none creates the `sheet` object with the other dimension at `0`.

A `0` dimension must be treated as **absent** by the nester, not as a zero-sized sheet. Rather than leave that as a downstream trap, say it here: Stage 3 reads a material as nestable only when `sheet.length > 0 && sheet.width > 0`. Write that predicate now, as `isNestable(def: MaterialDef): boolean` in `buildCsv.ts` beside the other material readers, with a test — so Stage 3 inherits it rather than reinventing it.

Also add a `hasGrain` checkbox per row, defaulting to checked when the field is absent. The empty-state message ("No materials saved yet. Set a rate in the Boards tab…") stays as it is.

Below the table, the clearance field:

```tsx
<div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
  <Label htmlFor="lib-clearance" className="text-xs">Tool clearance</Label>
  <Input id="lib-clearance" type="number" value={clearance}
         onChange={(e) => onSetClearance(Number(e.target.value))} className="h-7 w-20 text-xs" />
  <span className="text-xs text-muted-foreground">mm — the gap left around every nested part</span>
</div>
```

Note `BomModal` currently disables Copy and Download when `tab === 'library'`. That stays true — the library has nothing to export.

- [ ] **Step 5: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -u src/scene src/ui
git commit -m "feat(scene): sheet stock and a global tool clearance in the material library"
```

---

# Task 1.7: Re-baseline the docs

**Files:**
- Modify: `CLAUDE.md`, `project-structure.html`
- Modify: `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md`

- [ ] **Step 1: `CLAUDE.md`**

Add to the `src/scene/` tree:

```
│   ├── grain.ts         Grain convention in carcase axes + grainFieldFor() — the board field is
│   │                    derived from orientedPanel's axis map, never hand-tabulated
```

Update the IndexedDB invariant — it currently says "schema is version 2 with two object stores":

> - **IndexedDB schema is version 3** with three object stores: `handles` (file handle persistence),
>   `library` (material cost rates and sheet stock) and `settings` (the global tool clearance).
>   Bumping `DB_VERSION` in `idb.ts` requires adding the new store in `onupgradeneeded`. (This DB
>   version is unrelated to `FILE_FORMAT_VERSION`.)

And add one:

> - **Grain is stated in carcase axes and derived into a board field.** `grainAxisOf(role)` names the
>   direction; `grainFieldFor(thicknessAxis, axis)` turns it into `'length'` or `'width'` through the
>   same map `orientedPanel` uses. The role→field table in the design doc is a *consequence* — never
>   hand-maintain a second copy of it, and never assume grain runs along a panel's longer dimension.

- [ ] **Step 2: Regenerate the autogen blocks**

```bash
node scripts/update-structure-html.mjs
```

and update the hand-written `project-structure.html` prose where it describes the cutting list, so it says grain decides the length.

- [ ] **Step 3: The notes**

Record, at minimum: the v12 hold and its reasoning; the IDB 2→3 bump; the two cabinets whose cutting list rows changed; and anything measured that contradicted this plan.

- [ ] **Step 4: Commit**

```bash
git add -u CLAUDE.md project-structure.html docs
git commit -m "docs: re-baseline for grain, sheet stock and the IDB v3 store"
```

---

# Stage 1 acceptance

Run all of these on the branch before opening a PR:

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green. Record the new test count.
- [ ] `pnpm test:e2e` — green. `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` is needed locally; CI installs its own pinned build.
- [ ] `pnpm build` — succeeds.
- [ ] `grep -rn "?? 'free'" src/ | grep -v useFile.ts` returns **nothing** — the boundary normalises once, no read site defends itself.
- [ ] `grep -rn "grain" src/scene/carcaseRoles.ts` shows the derivation only, never a literal `'length'`/`'width'` per role.
- [ ] Every test added in Tasks 1.1, 1.3 and 1.5 has been **mutation-tested**: break the line it covers, watch it go red, restore.
- [ ] Drop a Base 600, a Wall 600 and a Tall 600, open the Boards tab, and confirm the Grain column is populated on every row with no `—`.
- [ ] Set a 2440 × 1220 sheet on `18mm Ply`, reload the page, reopen the Library tab, and confirm it survived.

## What Stage 1 deliberately does not do

- **No nesting, no Sheets tab, no yield figure.** Stages 2–4.
- **No grain in the shop drawings.** `buildSvg`/`buildDxf` are untouched. The spec mentions drawings as a benefit of the stage; the arrow on a drawing is a small independent piece of work and is better done once the field has been lived with.
- **No change to `+ Board`'s default.** It is `'free'`; whether it should be `'length'` is deferred by the spec until the field exists.


---

# What changed against this plan

Two claims in the tasks above were wrong. Both were found by a test written to check them, not by review.

### Task 1.3 said a row could take its grain from the first part of its group

The stated reasoning: grain feeds `cutDimensions`, whose output is in the grouping key, so a group cannot hold two grains. **False in both directions.** A 600 × 300 board with grain `length`, a 300 × 600 board with grain `width`, and a 600 × 300 board with grain `free` all reduce to the same 600 × 300 cut, so all three landed in one row that then reported whichever grain arrived first.

The fix is two-part and is in the code:

- `GroupedRow.grain` is `'length' | 'free'`, not `Grain`. After `cutDimensions` the grain-running dimension *is* the reported length, so a directional board reports `length` and only an unconstrained one reports `free`.
- The normalised grain is part of the grouping key. A part the nester may rotate and one it may not are different cuts at identical dimensions.

### Task 1.1's role-coverage test named twelve role families; there are thirteen

`ladder-mid-*` appears once a ladder base is wide enough to need a mid rail, which the plan's suggested fixture did not reach. The test asserted a list this plan supplied, the code disagreed, and the code was right.

### Smaller deviations

- **Tasks 1.1 and 1.2 landed as one commit**, as the plan's own Step 4 anticipated: `BoardPart.grain` is required, so the tree does not typecheck between them and the pre-commit hook blocks the split.
- **72 test fixtures needed `grain`**, not the "roughly a dozen" predicted. All default to `'free'`; none was set to a direction to make a test pass.
- **The two `kind: 'board'` literals in `useScene.ts` that build a `BuildSpec`/`ExportSpec`** deliberately do *not* carry grain. They are kernel geometry specs, and grain is not geometry.
- **An existing EditPanel test's `getByText(/Base 600/)` became ambiguous** once the Shape section grew its own "Grain is set by Base 600." note. Scoped to its exact text rather than the new note being renamed around it.
