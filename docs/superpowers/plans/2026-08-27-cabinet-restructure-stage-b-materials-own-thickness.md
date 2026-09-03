# Cabinet restructure Stage B — materials own thickness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete.** All tasks landed. Unit tests **1268 → 1310**; e2e **15/15**.

**Goal:** Move thickness onto the material, so assigning a 25 mm material to the sides resolves the bottom to `W − 50`, and give a part an explicit override that survives regeneration.

**Architecture:** One resolution rule — `roleThicknessFor(params, materials, overrides)` returns `(role) => number` — is threaded into `carcaseBoxes` in place of `p.thickness`. Overrides are read *before* the layout resolves, never applied after. Identity against today's output is proved with a golden master, the same control that worked in Stage A.

**Tech Stack:** TypeScript strict, Vitest, React 19. Pure modules only; no OCCT, no Three.js.

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Preceded by:** `docs/superpowers/plans/2026-08-27-cabinet-restructure-stage-a-section-tree.md`

---

## Commits are grouped by green boundaries

Stage A's plan tried one commit per task and left the build red for eight of them. It could not
work: the pre-commit typecheck is a Claude Code `PreToolUse` hook
(`.claude/settings.json` → `.claude/hooks/pre-commit-typecheck.sh`) that intercepts the Bash call
before git runs, so `--no-verify` is inert. **Never** edit that hook or those settings.

Stage B is grouped from the start:

| commit | covers | why it is green |
|---|---|---|
| **A** | `MaterialDef.thickness`, `resolveThickness.ts`, baseline capture | additive; no consumer changes behaviour |
| **B** | the switch — params slots, per-panel thickness, overrides, every consumer, equivalence | one atomic swap, proved by the baseline |
| **C** | file format v14 + migration | includes a real name-collision hazard, below |
| **D** | `EditPanel` — "just this part" as a third option | |
| **E** | close-out — retire the baseline, docs, notes | |

Group B is large by necessity: `p.thickness` appears at **18 sites** in `carcaseRoles.ts` plus the
`const { thickness: T, backThickness: BT } = p` destructure that feeds the whole of `carcaseBoxes`.
There is no smaller step that removes it while the build stays green.

---

## Three findings that shape this stage

**1. `shapeKey` already reads `part.thickness`.** The spec worried that thickness having two sources
would let a material change silently skip a geometry rebuild. It does not: `shapeKey` (`utils.ts`)
encodes the *part's resolved* thickness, and regeneration writes the resolved value onto the part.
One rule, one value on the part, cache key correct by construction. **Verify this rather than
assume it** — Task B7 pins it.

**2. `EditPanel` already asks the right question.** Its existing comment reads: *"A driven part's
dimensions belong to its cabinet, so an edit here is a question, not a command: push it up to the
parameter, or take ownership of the part."* Editing a driven part today offers apply-to-cabinet or
detach. Group D adds a **third** option — override this one part, stay driven — to an interaction
that already exists. This is not a new concept to invent.

**3. `MaterialDef.thickness` must be optional.** `MaterialDef` also describes dowel and hardware
stock, which has no panel thickness (that is why `costPerM` and `costPerM2` both exist, and why
`sheet?` is documented as "absent means the material is not nested"). So `thickness?: number`,
following the same idiom — and `validateCarcaseParams` requires it of a material actually used as a
carcase or back slot. A missing thickness is a validation error, not a silent zero.

---

## File structure

| file | responsibility |
|---|---|
| `src/scene/resolveThickness.ts` | **new.** `roleThicknessFor(params, materials, overrides)` → `(role) => number`. The single statement of the resolution rule. Pure. |
| `src/scene/resolveThickness.test.ts` | **new.** |
| `src/scene/__fixtures__/stage-b-baseline.json` | **new, generated, deleted at close-out.** |
| `src/scene/thicknessEquivalence.test.ts` | **new, deleted at close-out.** |
| `src/scene/types.ts` | modify — `MaterialDef.thickness?`, `BoardPart.overrides?`, `CarcaseParams` slots |
| `src/scene/carcaseRoles.ts` | modify — every `p.thickness` becomes that panel's own |
| `src/scene/regenerateComponents.ts` | modify — pass overrides in, write resolved thickness and per-role material out |
| `src/scene/carcasePresets.ts` | modify — presets name materials instead of carrying thicknesses |
| `src/scene/useFile.ts` | modify — v14 and its migration |
| `src/ui/EditPanel.tsx` | modify — the third option |
| `src/ui/CarcasePanel.tsx` | modify — thickness fields become material selects |

---

## Group A — the resolution rule

### Task A1: `MaterialDef.thickness`

**Files:** `src/scene/types.ts`

- [ ] **Step 1: Add the field**

```ts
  // Panel thickness in mm. Absent means the material is not a sheet good — dowel and hardware
  // stock has no panel thickness — following the same convention as `sheet?`. A material used as a
  // carcase or back slot must have one; `validateCarcaseParams` rejects it otherwise, because a
  // silent zero would collapse every panel derived from it.
  thickness?: number
```

- [ ] **Step 2: Verify nothing breaks**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green — the field is optional, so no existing literal is invalidated.

- [ ] **Step 3: Commit**

```bash
git add src/scene/types.ts
git commit -m "feat(scene): a material can state its panel thickness"
```

### Task A2: capture the Stage B baseline

Same instrument as Stage A, same reason: prove the switch changes nothing when every panel resolves
to the thickness it has today. **Must run against the unmodified generator** — `git status` clean,
no edit to `carcaseRoles.ts`. If dirty, stop and report.

**Files:** create then delete `src/scene/captureBaselineB.test.ts`; create `src/scene/__fixtures__/stage-b-baseline.json`

- [ ] **Step 1: Write the temporary capture test**

Capture, for every case in `src/scene/__fixtures__/sweep.ts` (96 cases), in sweep order:
`{ index, boxes, joints }` with exactly the key format Stage A used —

```ts
const boxKey = (b) =>
  [b.box.x0, b.box.x1, b.box.y0, b.box.y1, b.box.z0, b.box.z1, b.thicknessAxis]
    .map((n) => (typeof n === 'number' ? n.toFixed(6) : n))
    .join('|')
```

and a joint key of `[d.kind, boxKey(housing), boxKey(housed), d.housingFace, d.housedEnd].join('#')`,
both arrays sorted. Look housing and housed boxes up from that case's `carcaseBoxes` output by role.
Write with `writeFileSync(resolve(process.cwd(), 'src/scene/__fixtures__/stage-b-baseline.json'), JSON.stringify(cases, null, 2) + '\n')`.

**Geometry only — no role names in the keys.** Role names do not change in Stage B, which makes it
tempting to include them; do not. The point of the key is to compare cabinets, and a name-keyed
baseline tests the wrong thing.

Assert in the same test that there are 96 entries and none has an empty `boxes` array.

- [ ] **Step 2: Run it, then delete it**

Run: `pnpm vitest run src/scene/captureBaselineB.test.ts` → PASS, 1 test.
Then `rm src/scene/captureBaselineB.test.ts`.

**It must be deleted.** A test that writes the baseline rewrites it on every `pnpm test`, so the
baseline would track the code instead of pinning it — which destroys the only thing it is for.

- [ ] **Step 3: Sanity check and commit**

Run: `node -e "const c=require('./src/scene/__fixtures__/stage-b-baseline.json'); console.log(c.length, Math.min(...c.map(x=>x.boxes.length)))"`
Expected: `96` and a minimum greater than zero.

```bash
git add src/scene/__fixtures__/stage-b-baseline.json
git commit -m "test: capture the pre-materials carcase baseline"
```

### Task A3: `roleThicknessFor`

**Files:** create `src/scene/resolveThickness.ts` and `src/scene/resolveThickness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { roleThicknessFor } from './resolveThickness'
import type { MaterialDef } from './types'

const MATERIALS: Record<string, MaterialDef> = {
  '18mm Ply': { thickness: 18 },
  '25mm Ply': { thickness: 25 },
  '12mm MDF': { thickness: 12 },
  Dowel: { costPerM: 2 }, // no thickness — not a sheet good
}

const slots = { carcaseMaterial: '18mm Ply', backMaterial: '12mm MDF' }

describe('roleThicknessFor', () => {
  it('gives every carcase role the carcase slot thickness', () => {
    const t = roleThicknessFor(slots, MATERIALS, new Map())
    expect(t('left-side')).toBe(18)
    expect(t('bottom')).toBe(18)
    expect(t('division-sec_a-0')).toBe(18)
  })

  it('gives the back its own slot thickness', () => {
    expect(roleThicknessFor(slots, MATERIALS, new Map())('back')).toBe(12)
  })

  it('a material override takes that material thickness', () => {
    const t = roleThicknessFor(slots, MATERIALS, new Map([['left-side', { material: '25mm Ply' }]]))
    expect(t('left-side')).toBe(25)
    expect(t('right-side')).toBe(18)
  })

  // The user's number wins over the material's, which is what "override to any number > 0" means.
  it('an explicit thickness override beats its own material', () => {
    const t = roleThicknessFor(
      slots,
      MATERIALS,
      new Map([['left-side', { material: '25mm Ply', thickness: 20 }]]),
    )
    expect(t('left-side')).toBe(20)
  })

  // Deliberately fatal, matching grainAxisOf: a silent zero collapses every panel derived from it
  // and the symptom appears far from the cause.
  it('throws for a material with no thickness', () => {
    expect(() => roleThicknessFor({ ...slots, carcaseMaterial: 'Dowel' }, MATERIALS, new Map())('bottom')).toThrow(
      /no thickness/,
    )
  })

  it('throws for a material that is not in the record at all', () => {
    expect(() => roleThicknessFor({ ...slots, carcaseMaterial: 'Nope' }, MATERIALS, new Map())('bottom')).toThrow(
      /no thickness/,
    )
  })
})
```

- [ ] **Step 2: Run it, confirm it fails** (`Failed to resolve import`)

- [ ] **Step 3: Implement**

```ts
// src/scene/resolveThickness.ts
import type { MaterialDef } from './types'

export interface PartOverrides {
  thickness?: number
  material?: string
}

export interface MaterialSlots {
  carcaseMaterial: string
  backMaterial: string
}

export type RoleThickness = (role: string) => number

// The one statement of where a panel's thickness comes from: its own explicit override, else its
// own material, else the slot its role belongs to. Stated once because four callers need it and a
// second copy would drift — the same argument grainFieldFor makes for the grain table.
//
// Read *before* the layout resolves boxes, never applied after: a 25 mm override on a side is what
// makes the bottom come out at `W − 50`, so the layout has to see it. That keeps the generator a
// function in one direction — overrides in, boxes out — and an override must never depend on a
// generated dimension.
export function roleThicknessFor(
  slots: MaterialSlots,
  materials: Record<string, MaterialDef>,
  overrides: Map<string, PartOverrides>,
): RoleThickness {
  return (role) => {
    const own = overrides.get(role)
    if (own?.thickness !== undefined) return own.thickness
    const name = own?.material ?? (role === 'back' ? slots.backMaterial : slots.carcaseMaterial)
    const thickness = materials[name]?.thickness
    // Deliberately fatal. A zero here would collapse every panel the layout derives from it, and
    // the symptom would appear nowhere near the cause.
    if (thickness === undefined) throw new Error(`zimmu: material "${name}" has no thickness`)
    return thickness
  }
}
```

- [ ] **Step 4: Run the tests** — PASS, 6 tests.

- [ ] **Step 5: Mutation check (required)**

Swap the precedence so the material wins over the explicit thickness (`if (own?.material !== undefined) …` first). Confirm "an explicit thickness override beats its own material" FAILS with 25 instead of 20. Restore, re-confirm green. Report what you saw.

- [ ] **Step 6: Commit**

```bash
git add src/scene/resolveThickness.ts src/scene/resolveThickness.test.ts
git commit -m "feat(scene): one rule for where a panel's thickness comes from"
```

---

## Group B — the switch

One commit. Do not commit until `pnpm typecheck && pnpm lint && pnpm test` are all green.

### Task B1: `CarcaseParams` slots

`material: string` and `thickness: number` and `backThickness: number` come out. `carcaseMaterial: string` and `backMaterial: string` go in.

`frontMaterial` is **not** added here — fronts do not exist until Stage E, and a field nothing reads is a field nobody maintains. The spec lists three slots; this stage delivers the two that have panels.

### Task B2: `BoardPart.overrides`

```ts
  // What the user has taken ownership of on an otherwise driven part. Applied on top of the driven
  // value, so the part still follows width, depth and joinery. Absent on almost every part.
  overrides?: PartOverrides
```

### Task B3: per-panel thickness through `carcaseBoxes`

`carcaseBoxes(p, thicknessOf: RoleThickness)`. Inside, the `const { thickness: T } = p` destructure goes; each box uses `thicknessOf(<its own role>)`.

**The `openingRect` change is the one to get right**, and Stage A left a note about it:

```ts
function openingRect(p: CarcaseParams, thicknessOf: RoleThickness): Rect {
  return {
    x0: thicknessOf('left-side'),
    x1: p.width - thicknessOf('right-side'),
    z0: floorZ(p, thicknessOf) + thicknessOf('bottom'),
    z1: p.hasTop ? p.height - thicknessOf('top') : p.height,
  }
}
```

**A symmetric fixture cannot catch a mistake here.** Every test that gives both sides the same
thickness passes whether or not the two calls are distinguished. Task B8 requires an asymmetric case.

`ladderMidRails` also spends thickness twice (`(p.width - 2 * p.thickness - n * p.thickness)`) — the
first is the two side panels, the second is the rails themselves. They are now different numbers.

### Task B4: validation

- `thickness must be positive` and its relatives now read the *resolved* thicknesses.
- New: a carcase or back slot naming a material with no thickness is an error, not a throw. `validateCarcaseParams` must catch it and return a message, because the generator calls it on every keystroke and a throw would take the app down mid-edit. Wrap the `roleThicknessFor` call.

### Task B5: `regenerateComponents`

- Build `overrides` from this component's existing parts, keyed by role, before generating.
- Build `thicknessOf` with `roleThicknessFor(component.params, scene.materials, overrides)`.
- Write the **resolved** thickness onto each generated part, and its **resolved material name** —
  `back` takes `backMaterial`, everything else `carcaseMaterial`, unless overridden.
- Preserve `existing.overrides` onto the regenerated part. A driven part keeps its override; that
  is the entire point.

`regenerateComponents(scene)` already receives the whole scene, so `scene.materials` is in hand.

### Task B6: presets

`carcaseMaterial: '18mm Ply'`, `backMaterial: '12mm MDF'`, thickness fields gone. `CARCASE_PRESETS`
is data only, so the materials it names must exist in a new scene — check where `useScene` seeds
`materials: {}` and seed those two definitions with their thicknesses, or the first dropped preset
fails validation. **Test that dropping each preset into a fresh scene validates clean.**

### Task B7: `shapeKey` — verify, do not change

`shapeKey` reads `part.thickness`, which is now the resolved value. Add a test: two scenes identical
but for a material's thickness must produce different `shapeKey`s for the parts made of it.

### Task B8: the equivalence test

`src/scene/thicknessEquivalence.test.ts`, same shape as Stage A's: for each of the 96 sweep cases,
`carcaseBoxes` and `carcaseJoints` output must equal `stage-b-baseline.json`. The sweep's params get
`carcaseMaterial: '18mm Ply'`, `backMaterial: '12mm MDF'` and a materials record giving those 18 and
12 — reproducing exactly the thicknesses the sweep used before.

**Plus the asymmetric case the baseline cannot cover.** A separate test, computed not typed:

```ts
// The whole point of the stage: a thicker side shortens the bottom. Both sides differ, so a
// mistake that reads one thickness for both fails here and nowhere else.
it('a thicker left side shortens the panels between the sides', () => {
  const overrides = new Map([['left-side', { thickness: 25 }]])
  const boxes = carcaseBoxes(params, roleThicknessFor(params, materials, overrides))
  const bottom = boxes.find((b) => b.role === 'bottom')!
  expect(bottom.box.x0).toBe(25)
  expect(bottom.box.x1).toBe(params.width - 18)
  expect(bottom.box.x1 - bottom.box.x0).toBe(params.width - 43)
})
```

- [ ] **Mutation check (required):** make `openingRect` use `thicknessOf('left-side')` for both `x0` and `x1`. Confirm the asymmetric test FAILS and the 96 equivalence cases still PASS — which is the proof that the baseline alone would not have caught it. Restore and report both observations.

### Task B9: every remaining consumer

`pnpm typecheck` names them. `CarcasePanel.tsx`'s thickness and back-thickness fields become
material selects. Do not weaken a test to compile: where a test's name says a cabinet is 18 mm, it
must still be 18 mm.

### Commit

```bash
git add -A
git commit -m "feat(scene): materials own thickness, and a part can override it"
```

---

## Group C — file format v14

### The migration hazard

A v13 file has one `material` name and a separate `thickness`. v14 has one thickness *per material*.
**Two carcases in one file can legally share a material name at different thicknesses in v13, and
cannot in v14.** The migration must detect that and disambiguate by suffixing the name (e.g.
`18mm Ply` and `18mm Ply (25mm)`), not silently pick one — silently picking would resize somebody's
cabinet.

- [ ] Write the test for the collision case **first**, with two carcases sharing `material: '18mm Ply'` at `thickness: 18` and `thickness: 25`, asserting both keep their own thickness after the migration.
- [ ] `FILE_FORMAT_VERSION` 13 → 14.
- [ ] At the `parseFile` carcase branch: synthesise `scene.materials` entries from each carcase's `material`/`thickness`, name the back material from its thickness, set `carcaseMaterial`/`backMaterial`, drop `material`/`thickness`/`backThickness`.
- [ ] **Remember `CLAUDE.md`'s warning, added in Stage A:** `base.params` is loosely typed in `useFile.ts`, so `tsc` cannot see a file-format regression there. A `parseFile` test is required, not just a typecheck.
- [ ] Mutation check: make the migration reuse one material for both carcases; confirm the collision test fails.

---

## Group D — `EditPanel`'s third option

Editing thickness on a driven part currently offers apply-to-cabinet or detach. Add **"just this
part"**, writing `overrides.thickness`. The part stays `driven: true` and keeps following every
other parameter.

Also add a material select per part, writing `overrides.material`, and a way to clear an override
back to the cabinet's value. An overridden field should read as overridden — follow whatever
affordance the panel already uses for a modified value rather than inventing one.

Test: an override survives a cabinet width change; clearing it returns the part to the slot value.

---

## Group E — close the stage

- [ ] Confirm the equivalence test is green, report the number, then `git rm` it and the baseline. Deleting a failing test buries a regression.
- [ ] Re-run the full unit suite after deletion; if something fails, a permanent test was leaning on the fixture — fix that test, do not restore the fixture.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e` — expect **15 passed**. The image's Chromium is not the build `@playwright/test` pins; do **not** run `playwright install`.
- [ ] `CLAUDE.md`: `FILE_FORMAT_VERSION = 14` and what 14 means; add `resolveThickness.ts` to the tree; a new invariant stating that thickness comes from the material and that overrides are read before layout.
- [ ] `node scripts/update-structure-html.mjs`
- [ ] Notes: the mutation result showing the baseline could not catch the asymmetric case; the material-name collision and how it is disambiguated; final test counts and e2e result.

---

## Acceptance

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green, exit codes read directly, never piped through `tail`/`head`
- [ ] `pnpm test:e2e` 15/15
- [ ] Equivalence green over all 96 cases before retirement
- [ ] A 25 mm side resolves the bottom to `W − 43` with an 18 mm right side — asymmetric, computed
- [ ] An override survives a cabinet width change
- [ ] `grep -rn "p\.thickness\|backThickness" src/` returns nothing outside the migration
- [ ] Every guard added was mutation-tested; each break-it step above was actually run

## What Stage B deliberately does not do

- No `frontMaterial` — Stage E, with the fronts that need it.
- No per-part material in the *nest* grouping beyond what falls out of `part.material` already.
- `adjustableShelves` still lives on `CarcaseParams` — Stage D.
- Joints still use `jointMethod` — Stage C of the wider restructure.
