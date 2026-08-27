# Cabinet restructure Stage A — the section tree, output-identical

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `dividers` and `fixedShelves` with a recursive section tree that produces exactly the same parts and joints as today, and migrate v12 files onto it.

**Architecture:** A new pure module resolves a `Section` tree into rectangles; `carcaseBoxes` consumes those rectangles instead of `bayEdges()`. Equivalence is proved against a golden-master baseline captured from the current code *before* it changes, compared by geometry rather than by role name. `adjustableShelves` and `thickness` do not move in this stage.

**Tech Stack:** TypeScript strict, Vitest, React 19. No OCCT, no Three.js — every module touched here is pure.

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md`
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`

---

## Execution revision, 2026-08-27 — commits are grouped by green boundaries

**The original task-per-commit structure was wrong and has been regrouped.** The task *bodies* below
are unchanged and still authoritative for what to write; only the commit boundaries move.

Two things forced it, and the second matters more than the first:

**1. `--no-verify` does not work here.** The pre-commit typecheck is not a git hook — it is a Claude
Code `PreToolUse` hook (`.claude/settings.json` → `.claude/hooks/pre-commit-typecheck.sh`) that
intercepts the Bash call before git runs and denies it on a red typecheck. `--no-verify` is just
substring text to it. Every commit must typecheck. Do **not** edit the hook or settings to get
around this.

**2. A red window is bad practice regardless.** The original Tasks 3–11 left the build failing with
96 errors across 10 files for eight commits — eight unverifiable commits with no green commit to
bisect back to. The hook was right and the plan was wrong.

**Expand/contract was considered and rejected.** Adding `section` alongside `dividers`/`fixedShelves`
would give the transition two sources of truth: the ~40 test sites that spread `{ ...base, dividers:
[0.5] }` would inherit a `section` describing no divider, and would keep passing while describing a
different cabinet than they name. Silent disagreement between two fields is worse than one large
verified commit.

### The regrouping

| commit | covers original tasks | why it is green |
|---|---|---|
| **A** New modules | 3 (types), 4 (`legacyToSection`), 5 (`resolveSections`), 6 (`validateSection`) | adds new files only; touches no existing consumer |
| **B** The switch | 7 (`carcaseBoxes`), 8 (joints), 9 (equivalence), 10 (pin/grain/params), 11 (presets) | swaps the field and every consumer at once; the equivalence test is what makes a change this size safe, and is exactly why the baseline was captured first |
| **C** File format | 12 | v13 migration at the parse boundary |
| **D** Panel shim | 13 | the divider field and shelf counter write trees |
| **E** Close the stage | 14 | retire the baseline, docs, notes |

Commit B is large and that is accepted deliberately: there is no smaller step that removes
`dividers` and `fixedShelves` while leaving the build green, because they are load-bearing in 11
files. Its size is bought back by the 96-case equivalence test, which no incremental split would
have given.

Every commit in every group must pass `pnpm typecheck && pnpm lint && pnpm test` before it is made.
No `--no-verify` anywhere in this plan.

## Two deliberate deviations from the spec

Both were forced by measurements taken while writing this plan. Record them in the notes file when you reach Task 14.

**1. `adjustableShelves` stays on `CarcaseParams`, and `Section` has no `interior` field yet.**

The spec's `Section` carries `interior: InteriorSpec` with per-section pin geometry. If Stage A adopted that, pin rows would move from spanning a *panel* to spanning a *section* — and **all three presets have `fixedShelves > 0`** (Base 600: 1, Wall 600: 1, Tall 600: 4), so every one of them would migrate to a tree with horizontal splits and every one would change its bores. That destroys the output-identity property that is Stage A's entire risk control.

The spec's own staging table already puts per-section pin bores in Stage D. So Stage A moves `dividers` and `fixedShelves` only. `InteriorSpec` and `Section.interior` arrive in Stage D, `Section.front` in Stage E. File version 13 means "the tree"; later stages bump again. One version, one meaning — the argument the sheet-yield notes make for holding at 12.

**2. Equivalence is compared by geometry, not by role name.**

Role keys change from `divider-0` / `shelf-0-1` to `division-{sectionId}-{i}`, so a name-keyed comparison cannot express identity. The property is instead: *for every sweep case, the multiset of boxes (geometry + thickness axis) and the multiset of joints (kind + resolved geometry + faces) are unchanged.* This is stronger than a name comparison — it is name-independent, so it cannot be satisfied by renaming something into place.

---

## File structure

| file | responsibility |
|---|---|
| `src/scene/sectionTree.ts` | **new.** `Section` types, `resolveSections`, `boundsOf`, `validateSection`. Pure, no THREE, no OCCT. |
| `src/scene/sectionTree.test.ts` | **new.** Tests for the above. |
| `src/scene/migrateSections.ts` | **new.** `legacyToSection(dividers, fixedShelves)` — the one place v12 geometry becomes a tree. Used by the file parser, the presets and the test sweep. |
| `src/scene/migrateSections.test.ts` | **new.** |
| `src/scene/__fixtures__/sweep.ts` | **new.** The 96-case sweep, extracted from `grain.test.ts` so the equivalence test and the grain test share one definition. |
| `src/scene/__fixtures__/stage-a-baseline.json` | **new, generated.** Golden master captured from the current code before it changes. |
| `src/scene/sectionEquivalence.test.ts` | **new.** Compares live output against the baseline. |
| `src/scene/types.ts` | modify — `Section` types re-exported; `CarcaseParams` gains `section`, loses `dividers` and `fixedShelves`. |
| `src/scene/carcaseRoles.ts` | modify — `carcaseBoxes` consumes rectangles; `bayEdges` deleted; joints, contacts, `pinFaces`, `parameterForRole` follow. |
| `src/scene/carcasePresets.ts` | modify — presets carry trees. |
| `src/scene/grain.ts` | modify — `grainAxisOf` answers for `division-`. |
| `src/scene/useFile.ts` | modify — `FILE_FORMAT_VERSION = 13`, migration at the parse boundary. |
| `src/ui/CarcasePanel.tsx` | modify — the divider field and shelf counter become a shim writing simple trees. |

---

### Task 1: Extract the sweep into a shared fixture

Nothing changes behaviourally. This exists so the baseline, the equivalence test and the grain test all sweep the same 96 cases.

**Files:**
- Create: `src/scene/__fixtures__/sweep.ts`
- Modify: `src/scene/grain.test.ts:16-46`

- [ ] **Step 1: Create the fixture module**

```ts
// src/scene/__fixtures__/sweep.ts
import { CARCASE_PRESETS } from '../carcasePresets'
import type { CarcaseParams } from '../types'

// The presets reach neither a ladder base, nor dividers, nor a multi-bay shelf. Without this the
// role coverage test would pass while `grainAxisOf` had no answer for five roles.
export const LADDER_WITH_DIVIDERS: CarcaseParams = {
  ...CARCASE_PRESETS[0].params,
  width: 1400,
  baseMode: 'ladder',
  dividers: [0.5],
  fixedShelves: 1,
}

// Every combination of the parameters that decide which roles exist, on a carcase large enough for
// all of them to be valid. This is the generator's whole role space — fixtures are checked against
// it rather than against a list anyone typed.
export const SWEEP: CarcaseParams[] = (
  ['toe-kick', 'ladder', 'legs', 'none'] as const
).flatMap((baseMode) =>
  (['captured', 'applied', 'none'] as const).flatMap((backMode) =>
    [true, false].flatMap((hasTop) =>
      [[], [1 / 3, 2 / 3]].flatMap((dividers) =>
        [0, 2].map(
          (fixedShelves): CarcaseParams => ({
            ...CARCASE_PRESETS[0].params,
            width: 1400,
            height: 2100,
            baseMode,
            backMode,
            hasTop,
            dividers,
            fixedShelves,
          }),
        ),
      ),
    ),
  ),
)
```

- [ ] **Step 2: Import them in `grain.test.ts` instead of declaring them**

Delete the local `LADDER_WITH_DIVIDERS` and `SWEEP` declarations (currently `grain.test.ts:16-46`) and add to the imports at the top of the file:

```ts
import { LADDER_WITH_DIVIDERS, SWEEP } from './__fixtures__/sweep'
```

- [ ] **Step 3: Run the grain tests to prove nothing moved**

Run: `pnpm vitest run src/scene/grain.test.ts`
Expected: PASS, same test count as before the change.

- [ ] **Step 4: Assert the sweep is the size the plan assumes**

Add to `src/scene/grain.test.ts`, inside the `describe('every generated role states a grain direction')` block:

```ts
  // The plan and the baseline both assume 96. A sweep that silently changed size would make the
  // equivalence test cover less than it claims.
  it('the sweep is 96 cases', () => {
    expect(SWEEP).toHaveLength(96)
  })
```

- [ ] **Step 5: Run it**

Run: `pnpm vitest run src/scene/grain.test.ts -t 'the sweep is 96 cases'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/__fixtures__/sweep.ts src/scene/grain.test.ts
git commit -m "test: extract the carcase sweep into a shared fixture"
```

---

### Task 2: Capture the golden-master baseline

**This task must run before any generator code changes.** It records what the current code produces so the tree can be proved equivalent to it.

A golden master is normally a smell — it asserts values nobody reasoned about. Here it is the right tool and for a specific reason: it is captured *from the system*, not typed by a person, and its only job is to detect unintended change across a refactor that deletes the code being compared against. It is deleted at the end of Stage A (Task 14).

**Files:**
- Create then delete: `src/scene/captureBaseline.test.ts` (a temporary runner)
- Create: `src/scene/__fixtures__/stage-a-baseline.json` (generated, committed)

> **Corrected 2026-08-27, during execution.** This task originally specified a standalone
> `scripts/capture-stage-a-baseline.mjs` run under `vite-node`. **There is no `vite-node` or `tsx`
> in this project's toolchain** — `node_modules/.bin` holds only `vite` and `vitest`, and
> `package.json` has no script for either. Rather than add a dependency for a one-shot capture, run
> the capture as a temporary Vitest file: Vitest is installed and already resolves TypeScript.
>
> The temporary file **must be deleted once the JSON exists.** A test that writes the baseline would
> rewrite it on every `pnpm test`, making the baseline follow the code instead of pinning it —
> which destroys the only thing it is for.

- [ ] **Step 1: Write the temporary capture test**

```ts
// src/scene/captureBaseline.test.ts — TEMPORARY. Delete after Step 2.
// Records carcaseBoxes + carcaseJoints output over the sweep so Stage A can prove the section tree
// reproduces it. Deleted again when Stage A closes.
import { writeFileSync, mkdirSync } from 'node:fs'
import { it, expect } from 'vitest'
import { carcaseBoxes, carcaseJoints } from './carcaseRoles'
import { SWEEP } from './__fixtures__/sweep'

// Geometry only. Role names are deliberately excluded: they change in this stage, and a baseline
// keyed on them could be satisfied by renaming rather than by producing the same cabinet.
const boxKey = (b) =>
  [b.box.x0, b.box.x1, b.box.y0, b.box.y1, b.box.z0, b.box.z1, b.thicknessAxis]
    .map((n) => (typeof n === 'number' ? n.toFixed(6) : n))
    .join('|')

const cases = SWEEP.map((params, i) => {
  const boxes = carcaseBoxes(params)
  const byRole = new Map(boxes.map((b) => [b.role, b]))
  // A joint is identified by the geometry of the two panels it connects plus its own faces, never
  // by the role strings, for the same reason.
  const joints = carcaseJoints(params, '')
    .map((d) =>
      [
        d.kind,
        boxKey(byRole.get(d.housingRole)),
        boxKey(byRole.get(d.housedRole)),
        d.housingFace,
        d.housedEnd,
      ].join('#'),
    )
    .sort()
  return { index: i, boxes: boxes.map(boxKey).sort(), joints }
})

it('captures the baseline', () => {
  mkdirSync('src/scene/__fixtures__', { recursive: true })
  writeFileSync('src/scene/__fixtures__/stage-a-baseline.json', JSON.stringify(cases, null, 2) + '\n')
  // Asserted here so a silent empty capture cannot pass: an empty box list means
  // validateCarcaseParams rejected a sweep case and the baseline would be worthless.
  expect(cases).toHaveLength(96)
  for (const c of cases) expect(c.boxes.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run it, then delete it**

Run: `pnpm vitest run src/scene/captureBaseline.test.ts`
Expected: PASS, 1 test.

The generator must be **unmodified** when this runs — `git status` clean, and no edit to `carcaseRoles.ts`. If anything is dirty, `git stash` first and re-run.

Then `rm src/scene/captureBaseline.test.ts`.

- [ ] **Step 3: Sanity-check the captured file**

Run: `node -e "const c=require('./src/scene/__fixtures__/stage-a-baseline.json'); console.log(c.length, Math.min(...c.map(x=>x.boxes.length)), Math.max(...c.map(x=>x.joints.length)))"`
Expected: 96, then a minimum box count greater than zero, then a maximum joint count greater than zero.

- [ ] **Step 4: Commit**

```bash
git add src/scene/__fixtures__/stage-a-baseline.json
git commit -m "test: capture the pre-restructure carcase baseline"
```

---

### Task 3: The Section types

**Files:**
- Create: `src/scene/sectionTree.ts`
- Modify: `src/scene/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/scene/sectionTree.ts
// The cabinet's interior division, as a recursive tree. Splitting a section is what *creates* the
// partition or shelf between its children — so this replaces `dividers` and `fixedShelves`, which
// described the same divisions twice.
//
// Stage A carries structure only. `interior` (per-section shelves) arrives in Stage D and `front`
// in Stage E.

export type SectionId = string // "sec_<uuid>"

export type SectionSize =
  | { kind: 'equal' }
  | { kind: 'fixed'; mm: number }
  | { kind: 'percent'; pct: number }

export type DivisionKind = 'none' | 'panel' | 'rail'

export type SectionContent =
  | { kind: 'leaf' }
  | {
      kind: 'split'
      axis: 'vertical' | 'horizontal'
      division: DivisionKind
      children: Section[]
    }

export interface Section {
  // A uuid, never a path. `regenerateOne` reconciles parts by role key; a positional key would
  // renumber every sibling when a section is inserted, re-binding parts that did not change.
  id: SectionId
  size: SectionSize
  content: SectionContent
}

export function newSectionId(): SectionId {
  return `sec_${crypto.randomUUID()}`
}
```

- [ ] **Step 2: Re-export from `types.ts` and change `CarcaseParams`**

In `src/scene/types.ts`, add near the other re-exports:

```ts
export type { Section, SectionId, SectionSize, SectionContent, DivisionKind } from './sectionTree'
```

Then in `CarcaseParams`, delete these two lines:

```ts
  fixedShelves: number
  dividers: number[] // fractions of width, 0..1, ascending
```

and add:

```ts
  section: import('./sectionTree').Section // the interior division tree
```

- [ ] **Step 3: Run typecheck to see the blast radius**

Run: `pnpm typecheck`
Expected: FAIL, with errors in `carcaseRoles.ts`, `carcasePresets.ts`, `grain.test.ts`, `carcaseRoles.test.ts`, `CarcasePanel.tsx` and `__fixtures__/sweep.ts`.

This is the expected state. Do not fix them yet — the following tasks fix them in dependency order. Record the error count; it should reach zero by Task 11.

- [ ] **Step 4: Commit the types alone**

```bash
git add src/scene/sectionTree.ts src/scene/types.ts
# Do NOT commit here. This task's output is part of commit group A — see the execution
# revision at the top. Commit once Tasks 4, 5 and 6 are also written and the suite is green.
```

**Do not delete `dividers` and `fixedShelves` from `CarcaseParams` in this task.** They come out in
commit group B, together with every consumer that reads them. Adding `Section` and `section` here
while leaving the old fields in place would create two sources of truth; the field swap belongs in
the one commit that also switches every reader.

---

### Task 4: `legacyToSection` — v12 parameters become a tree

**Files:**
- Create: `src/scene/migrateSections.ts`
- Create: `src/scene/migrateSections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/migrateSections.test.ts
import { describe, expect, it } from 'vitest'
import { legacyToSection } from './migrateSections'
import type { Section } from './sectionTree'

function shape(s: Section): unknown {
  if (s.content.kind === 'leaf') return { size: s.size }
  return {
    size: s.size,
    axis: s.content.axis,
    division: s.content.division,
    children: s.content.children.map(shape),
  }
}

describe('legacyToSection', () => {
  it('a plain cabinet is a single leaf', () => {
    expect(shape(legacyToSection([], 0))).toEqual({ size: { kind: 'equal' } })
  })

  it('one divider becomes a vertical split of two panelled bays', () => {
    expect(shape(legacyToSection([0.5], 0))).toEqual({
      size: { kind: 'equal' },
      axis: 'vertical',
      division: 'panel',
      children: [
        { size: { kind: 'percent', pct: 50 } },
        { size: { kind: 'percent', pct: 50 } },
      ],
    })
  })

  it('fixed shelves split each bay horizontally', () => {
    const root = legacyToSection([], 2)
    expect(shape(root)).toEqual({
      size: { kind: 'equal' },
      axis: 'horizontal',
      division: 'panel',
      children: [
        { size: { kind: 'equal' } },
        { size: { kind: 'equal' } },
        { size: { kind: 'equal' } },
      ],
    })
  })

  it('dividers and shelves nest, shelves inside bays', () => {
    const root = legacyToSection([0.5], 1)
    expect(root.content.kind).toBe('split')
    if (root.content.kind !== 'split') throw new Error('unreachable')
    expect(root.content.axis).toBe('vertical')
    expect(root.content.children).toHaveLength(2)
    for (const bay of root.content.children) {
      expect(bay.content.kind).toBe('split')
      if (bay.content.kind !== 'split') throw new Error('unreachable')
      expect(bay.content.axis).toBe('horizontal')
      expect(bay.content.children).toHaveLength(2)
    }
  })

  it('gives every section a distinct id', () => {
    const ids: string[] = []
    const walk = (s: Section) => {
      ids.push(s.id)
      if (s.content.kind === 'split') s.content.children.forEach(walk)
    }
    walk(legacyToSection([0.25, 0.5, 0.75], 3))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The fractions are cumulative positions, not widths: [0.25, 0.5] means bays of 25%, 25%, 50%.
  it('turns cumulative divider positions into bay widths', () => {
    const root = legacyToSection([0.25, 0.5], 0)
    if (root.content.kind !== 'split') throw new Error('unreachable')
    expect(root.content.children.map((c) => c.size)).toEqual([
      { kind: 'percent', pct: 25 },
      { kind: 'percent', pct: 25 },
      { kind: 'percent', pct: 50 },
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/migrateSections.test.ts`
Expected: FAIL — `Failed to resolve import "./migrateSections"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/scene/migrateSections.ts
import { newSectionId, type Section } from './sectionTree'

// v12 described interior division twice: `dividers` as cumulative fractions of the width, and
// `fixedShelves` as a count repeated in every bay. Both are splits of the same tree — a divider is
// a vertical split, a fixed shelf a horizontal one — which is the whole reason the tree replaces
// them. This function is the only place that conversion exists: the file parser, the presets and
// the test sweep all call it.
export function legacyToSection(dividers: number[], fixedShelves: number): Section {
  const bays = bayWidths(dividers).map((pct) =>
    withShelves({ kind: 'percent' as const, pct }, fixedShelves),
  )

  if (bays.length === 1) return bays[0]

  return {
    id: newSectionId(),
    size: { kind: 'equal' },
    content: { kind: 'split', axis: 'vertical', division: 'panel', children: bays },
  }
}

// Cumulative positions to widths: [0.25, 0.5] is bays of 25%, 25% and 50%.
function bayWidths(dividers: number[]): number[] {
  const edges = [0, ...dividers, 1]
  return edges.slice(1).map((e, i) => (e - edges[i]) * 100)
}

function withShelves(size: Section['size'], fixedShelves: number): Section {
  const id = newSectionId()
  if (fixedShelves <= 0) return { id, size, content: { kind: 'leaf' } }

  return {
    id,
    size,
    content: {
      kind: 'split',
      axis: 'horizontal',
      division: 'panel',
      children: Array.from({ length: fixedShelves + 1 }, () => ({
        id: newSectionId(),
        size: { kind: 'equal' as const },
        content: { kind: 'leaf' as const },
      })),
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/scene/migrateSections.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the bay-width test bites**

Change `bayWidths` to `return edges.slice(1).map((e) => e * 100)` (cumulative rather than differences).
Run: `pnpm vitest run src/scene/migrateSections.test.ts`
Expected: FAIL on "turns cumulative divider positions into bay widths" — 25/50/100 instead of 25/25/50.
Restore the correct implementation and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/scene/migrateSections.ts src/scene/migrateSections.test.ts
git commit -m "feat(scene): convert v12 dividers and shelves into a section tree"
```

---

### Task 5: `resolveSections` — the tree becomes rectangles

**Files:**
- Modify: `src/scene/sectionTree.ts`
- Create: `src/scene/sectionTree.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/sectionTree.test.ts
import { describe, expect, it } from 'vitest'
import { resolveSections, type Rect, type Section } from './sectionTree'

const OPENING: Rect = { x0: 0, x1: 1000, z0: 0, z1: 2000 }

const leaf = (id: string, size: Section['size'] = { kind: 'equal' }): Section => ({
  id,
  size,
  content: { kind: 'leaf' },
})

describe('resolveSections', () => {
  it('a single leaf fills the opening', () => {
    const r = resolveSections(leaf('a'), OPENING, () => 18)
    expect(r.rects.get('a')).toEqual(OPENING)
    expect(r.divisions).toEqual([])
  })

  it('two equal children share the span less the division', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b')],
      },
    }
    const r = resolveSections(root, OPENING, () => 18)
    // 1000 less one 18mm partition = 982, split evenly = 491 each.
    expect(r.rects.get('a')).toEqual({ x0: 0, x1: 491, z0: 0, z1: 2000 })
    expect(r.rects.get('b')).toEqual({ x0: 509, x1: 1000, z0: 0, z1: 2000 })
    expect(r.divisions).toEqual([
      { parentId: 'root', index: 0, axis: 'vertical', kind: 'panel', rect: { x0: 491, x1: 509, z0: 0, z1: 2000 } },
    ])
  })

  it('a fixed child takes its millimetres and equals share the rest', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'none',
        children: [leaf('a', { kind: 'fixed', mm: 150 }), leaf('b'), leaf('c')],
      },
    }
    const r = resolveSections(root, OPENING, () => 18)
    // Horizontal splits stack bottom-up, matching how shelf-{b}-{i} is indexed today.
    expect(r.rects.get('a')).toEqual({ x0: 0, x1: 1000, z0: 0, z1: 150 })
    expect(r.rects.get('b')).toEqual({ x0: 0, x1: 1000, z0: 150, z1: 1075 })
    expect(r.rects.get('c')).toEqual({ x0: 0, x1: 1000, z0: 1075, z1: 2000 })
  })

  it('percent children take their share of the clear span', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [leaf('a', { kind: 'percent', pct: 25 }), leaf('b', { kind: 'percent', pct: 75 })],
      },
    }
    const r = resolveSections(root, OPENING, () => 18)
    expect(r.rects.get('a')).toEqual({ x0: 0, x1: 250, z0: 0, z1: 2000 })
    expect(r.rects.get('b')).toEqual({ x0: 250, x1: 1000, z0: 0, z1: 2000 })
  })

  it('a division consumes its own thickness, which may differ per division', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b'), leaf('c')],
      },
    }
    // A thickness function that answers differently per division index — the asymmetric case a
    // uniform fixture cannot catch.
    const r = resolveSections(root, OPENING, (_p, i) => (i === 0 ? 18 : 25))
    const spans = ['a', 'b', 'c'].map((id) => {
      const rect = r.rects.get(id)!
      return rect.x1 - rect.x0
    })
    // 1000 - 18 - 25 = 957, split three ways = 319 each.
    expect(spans).toEqual([319, 319, 319])
    expect(r.divisions.map((d) => d.rect.x1 - d.rect.x0)).toEqual([18, 25])
  })

  // The property that must hold for any tree at any depth, and the one a hand-typed expectation
  // cannot express. Children plus divisions exactly fill the parent — no gap, no overlap.
  it('children and divisions exactly fill their parent, at every depth', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [
          leaf('a', { kind: 'fixed', mm: 300 }),
          {
            id: 'b',
            size: { kind: 'equal' },
            content: {
              kind: 'split',
              axis: 'horizontal',
              division: 'panel',
              children: [leaf('b0'), leaf('b1', { kind: 'percent', pct: 40 })],
            },
          },
        ],
      },
    }
    const r = resolveSections(root, OPENING, () => 18)
    for (const [parentId, axis] of [
      ['root', 'vertical'],
      ['b', 'horizontal'],
    ] as const) {
      const parent = r.rects.get(parentId)!
      const lo = axis === 'vertical' ? 'x0' : 'z0'
      const hi = axis === 'vertical' ? 'x1' : 'z1'
      const pieces = [
        ...r.childRects(parentId).map((c) => c[hi] - c[lo]),
        ...r.divisions.filter((d) => d.parentId === parentId).map((d) => d.rect[hi] - d.rect[lo]),
      ]
      expect(pieces.reduce((s, n) => s + n, 0)).toBeCloseTo(parent[hi] - parent[lo], 6)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: FAIL — `resolveSections` is not exported.

- [ ] **Step 3: Implement it**

Append to `src/scene/sectionTree.ts`:

```ts
export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface ResolvedDivision {
  parentId: SectionId
  index: number // the i in `division-{parentId}-{i}`
  axis: 'vertical' | 'horizontal'
  kind: Exclude<DivisionKind, 'none'>
  rect: Rect
}

// Answers a division's own thickness. Stage A always returns the carcase thickness; Stage B makes
// it depend on the division part's material and override, which is why it is a function and not a
// number.
export type DivisionThickness = (parentId: SectionId, index: number) => number

export interface ResolvedTree {
  rects: Map<SectionId, Rect>
  divisions: ResolvedDivision[]
  childRects: (parentId: SectionId) => Rect[]
}

export function resolveSections(
  root: Section,
  opening: Rect,
  thicknessOf: DivisionThickness,
): ResolvedTree {
  const rects = new Map<SectionId, Rect>()
  const divisions: ResolvedDivision[] = []
  const childIds = new Map<SectionId, SectionId[]>()

  const place = (section: Section, rect: Rect): void => {
    rects.set(section.id, rect)
    if (section.content.kind === 'leaf') return

    const { axis, division, children } = section.content
    const vertical = axis === 'vertical'
    const lo = vertical ? rect.x0 : rect.z0
    const hi = vertical ? rect.x1 : rect.z1

    const gaps = division === 'none' ? [] : children.slice(1).map((_, i) => thicknessOf(section.id, i))
    const clear = hi - lo - gaps.reduce((s, n) => s + n, 0)

    const spans = resolveSpans(children, clear)

    childIds.set(
      section.id,
      children.map((c) => c.id),
    )

    let cursor = lo
    children.forEach((child, i) => {
      const span = spans[i]
      place(child, vertical
        ? { ...rect, x0: cursor, x1: cursor + span }
        : { ...rect, z0: cursor, z1: cursor + span })
      cursor += span
      if (i < gaps.length) {
        divisions.push({
          parentId: section.id,
          index: i,
          axis,
          kind: division as Exclude<DivisionKind, 'none'>,
          rect: vertical
            ? { ...rect, x0: cursor, x1: cursor + gaps[i] }
            : { ...rect, z0: cursor, z1: cursor + gaps[i] },
        })
        cursor += gaps[i]
      }
    })
  }

  place(root, opening)

  return {
    rects,
    divisions,
    childRects: (parentId) => (childIds.get(parentId) ?? []).map((id) => rects.get(id)!),
  }
}

// Fixed children take their millimetres; percent children take their share of the clear span; equal
// children split whatever is left. Stated once so the validator and the layout cannot disagree.
function resolveSpans(children: Section[], clear: number): number[] {
  const spans = children.map((c) =>
    c.size.kind === 'fixed' ? c.size.mm : c.size.kind === 'percent' ? (c.size.pct / 100) * clear : 0,
  )
  const claimed = spans.reduce((s, n) => s + n, 0)
  const equals = children.filter((c) => c.size.kind === 'equal').length
  if (equals === 0) return spans
  const each = (clear - claimed) / equals
  return children.map((c, i) => (c.size.kind === 'equal' ? each : spans[i]))
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the fill property bites**

In `resolveSections`, change `const clear = hi - lo - gaps.reduce(...)` to `const clear = hi - lo` (forgetting to reserve the divisions).
Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: FAIL on "children and divisions exactly fill their parent" — the sum overshoots the parent by the division thickness.
Restore and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/scene/sectionTree.ts src/scene/sectionTree.test.ts
git commit -m "feat(scene): resolve a section tree into rectangles"
```

---

### Task 6: Tree validation

**Files:**
- Modify: `src/scene/sectionTree.ts`
- Modify: `src/scene/sectionTree.test.ts`

- [ ] **Step 1: Write the failing test**

Add `validateSection` to the existing `./sectionTree` import at the top of the file, then append:

```ts
describe('validateSection', () => {
  const split = (children: Section[]): Section => ({
    id: 'root',
    size: { kind: 'equal' },
    content: { kind: 'split', axis: 'vertical', division: 'panel', children },
  })

  it('accepts a valid tree', () => {
    expect(validateSection(split([leaf('a'), leaf('b')]))).toEqual([])
  })

  it('rejects a split with fewer than two children', () => {
    expect(validateSection(split([leaf('a')]))).toContain('a split needs at least two sections')
  })

  it('rejects a non-positive fixed size', () => {
    expect(validateSection(split([leaf('a', { kind: 'fixed', mm: 0 }), leaf('b')]))).toContain(
      'a fixed section size must be positive',
    )
  })

  it('rejects percentages over 100 within one split', () => {
    expect(
      validateSection(
        split([leaf('a', { kind: 'percent', pct: 60 }), leaf('b', { kind: 'percent', pct: 60 })]),
      ),
    ).toContain('section percentages must not exceed 100')
  })

  it('rejects a rail on a vertical split', () => {
    const s: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: { kind: 'split', axis: 'vertical', division: 'rail', children: [leaf('a'), leaf('b')] },
    }
    // A vertical stretcher across a front is a mullion — a different part with different joinery.
    expect(validateSection(s)).toContain('a rail division needs a horizontal split')
  })

  it('rejects duplicate section ids', () => {
    expect(validateSection(split([leaf('dup'), leaf('dup')]))).toContain(
      'section ids must be unique',
    )
  })

  it('collects every problem rather than stopping at the first', () => {
    const s = split([leaf('dup', { kind: 'fixed', mm: -5 }), leaf('dup')])
    expect(validateSection(s).length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/sectionTree.test.ts -t validateSection`
Expected: FAIL — `validateSection` is not exported.

- [ ] **Step 3: Implement it**

Append to `src/scene/sectionTree.ts`:

```ts
// Total and side-effect free, matching `validateCarcaseParams`: the generator calls this on every
// keystroke and emits nothing when it returns errors, so last-good parts survive a transient state.
// Every problem is collected — reporting one at a time turns fixing three mistakes into three
// round trips.
export function validateSection(root: Section): string[] {
  const errors: string[] = []
  const seen = new Set<SectionId>()

  const walk = (s: Section): void => {
    if (seen.has(s.id)) errors.push('section ids must be unique')
    seen.add(s.id)

    if (s.size.kind === 'fixed' && s.size.mm <= 0) {
      errors.push('a fixed section size must be positive')
    }
    if (s.size.kind === 'percent' && (s.size.pct <= 0 || s.size.pct > 100)) {
      errors.push('a section percentage must be between 0 and 100')
    }
    if (s.content.kind === 'leaf') return

    const { axis, division, children } = s.content
    if (children.length < 2) errors.push('a split needs at least two sections')
    if (division === 'rail' && axis === 'vertical') {
      errors.push('a rail division needs a horizontal split')
    }
    const pct = children.reduce((sum, c) => sum + (c.size.kind === 'percent' ? c.size.pct : 0), 0)
    if (pct > 100) errors.push('section percentages must not exceed 100')

    children.forEach(walk)
  }

  walk(root)
  return [...new Set(errors)]
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: PASS, 13 tests.

Note the `[...new Set(errors)]` dedupe: "collects every problem" asserts more than one *distinct* message, which the fixture satisfies via a bad size and a duplicate id.

- [ ] **Step 5: Commit**

```bash
git add src/scene/sectionTree.ts src/scene/sectionTree.test.ts
git commit -m "feat(scene): validate a section tree"
```

---

### Task 7: `carcaseBoxes` consumes the tree

This is the load-bearing change. `bayEdges` disappears; divider and shelf boxes come from `resolveSections`.

**Files:**
- Modify: `src/scene/carcaseRoles.ts:74-78` (delete `bayEdges`), `:181-338` (`carcaseBoxes`)

- [ ] **Step 1: Delete `bayEdges` and add the opening helper**

Replace the `bayEdges` function (`carcaseRoles.ts:74-78`) with:

```ts
// The rectangle the section tree divides: the clear opening between the shell panels. Stage A
// spends one thickness on each side because CarcaseParams still carries one; Stage B replaces each
// of these four with that panel's own resolved thickness, and a symmetric fixture will not catch a
// mistake there — see the plan's note.
function openingRect(p: CarcaseParams): Rect {
  return {
    x0: p.thickness,
    x1: p.width - p.thickness,
    z0: floorZ(p) + p.thickness,
    z1: p.hasTop ? p.height - p.thickness : p.height,
  }
}
```

Add to the imports at the top of `carcaseRoles.ts`:

```ts
import {
  resolveSections,
  type Bound,
  type Rect,
  type ResolvedDivision,
  type SectionBounds,
} from './sectionTree'
```

- [ ] **Step 2: Replace the divider and shelf blocks in `carcaseBoxes`**

Delete the `p.dividers.forEach(...)` block and the `for (let b = 0; ...)` shelf block at the end of `carcaseBoxes` (currently `carcaseRoles.ts:299-336`), and replace both with:

```ts
  const tree = resolveSections(p.section, openingRect(p), () => p.thickness)

  for (const d of tree.divisions) {
    const vertical = d.axis === 'vertical'
    boxes.push({
      role: `division-${d.parentId}-${d.index}`,
      label: vertical ? 'Partition' : 'Shelf',
      box: {
        x0: d.rect.x0,
        x1: d.rect.x1,
        y0: 0,
        // `shelfBackY` is already computed above and was previously consumed by the divider and
        // shelf blocks this replaces. Keep using it: dropping it would leave an unused local, and
        // `noUnusedLocals` is on.
        y1: d.kind === 'rail' ? T : shelfBackY,
        z0: d.rect.z0,
        z1: d.rect.z1,
      },
      thicknessAxis: vertical ? 'x' : 'z',
    })
  }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: still FAIL, but no longer in `carcaseBoxes` — remaining errors should be in `carcaseJoints`, `carcaseContactPairs`, `pinFaces`, `parameterForRole`, the presets, and the tests. Those are Tasks 8–11.

- [ ] **Step 4: Commit**

```bash
git add src/scene/carcaseRoles.ts
# Do NOT commit here. This is the first piece of commit group B — see the execution revision
# at the top. Group B commits once Tasks 8, 9, 10 and 11 are done and the suite is green.
```

---

### Task 8: Joints and contacts follow the tree

Today `carcaseJoints` hardcodes a divider into bottom-and-top and a shelf into the two sides. Those are one rule seen twice: **a division is housed at both ends into whatever bounds its parent section along the perpendicular axis.**

**Files:**
- Modify: `src/scene/carcaseRoles.ts` — `carcaseJoints` (`:399`), `carcaseContactPairs` (`:478`)
- Modify: `src/scene/sectionTree.ts` — add `boundsOf`

- [ ] **Step 1: Write the failing test for `boundsOf`**

Append to `src/scene/sectionTree.test.ts`:

```ts
describe('boundsOf', () => {
  it('names the shell where nothing else bounds a section', () => {
    const r = resolveSections(leaf('a'), OPENING, () => 18)
    expect(r.boundsOf('a')).toEqual({
      left: { kind: 'shell' },
      right: { kind: 'shell' },
      bottom: { kind: 'shell' },
      top: { kind: 'shell' },
    })
  })

  it('names the division between two siblings', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b')],
      },
    }
    const r = resolveSections(root, OPENING, () => 18)
    expect(r.boundsOf('a').right).toEqual({ kind: 'division', parentId: 'root', index: 0 })
    expect(r.boundsOf('b').left).toEqual({ kind: 'division', parentId: 'root', index: 0 })
    expect(r.boundsOf('a').left).toEqual({ kind: 'shell' })
  })

  it('a division with no neighbour on one side reports the shell there', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'panel',
        children: [leaf('a'), leaf('b'), leaf('c')],
      },
    }
    const r = resolveSections(root, OPENING, () => 18)
    expect(r.boundsOf('b').bottom).toEqual({ kind: 'division', parentId: 'root', index: 0 })
    expect(r.boundsOf('b').top).toEqual({ kind: 'division', parentId: 'root', index: 1 })
    expect(r.boundsOf('b').left).toEqual({ kind: 'shell' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/sectionTree.test.ts -t boundsOf`
Expected: FAIL — `boundsOf` is not a property of the resolved tree.

- [ ] **Step 3: Implement `boundsOf`**

In `src/scene/sectionTree.ts`, add the types and extend `ResolvedTree`:

```ts
export type Bound = { kind: 'shell' } | { kind: 'division'; parentId: SectionId; index: number }

export interface SectionBounds {
  left: Bound
  right: Bound
  bottom: Bound
  top: Bound
}
```

Add `boundsOf: (id: SectionId) => SectionBounds` to the `ResolvedTree` interface, and inside `resolveSections` record each child's neighbours while placing them. In the `children.forEach` loop, after `place(child, ...)`, add:

```ts
      // A child's neighbour across a division is that division; anything else inherits whatever
      // bounds the parent on that side, all the way up to the shell.
      neighbours.set(child.id, { parentId: section.id, axis, index: i, count: children.length })
```

Declare `const neighbours = new Map<SectionId, { parentId: SectionId; axis: 'vertical' | 'horizontal'; index: number; count: number }>()` beside `rects`, and add before the `return`:

```ts
  const hasDivision = (parentId: SectionId, index: number): boolean =>
    divisions.some((d) => d.parentId === parentId && d.index === index)

  const boundsOf = (id: SectionId): SectionBounds => {
    const sides: SectionBounds = {
      left: { kind: 'shell' },
      right: { kind: 'shell' },
      bottom: { kind: 'shell' },
      top: { kind: 'shell' },
    }
    let cursor: SectionId | undefined = id
    while (cursor !== undefined) {
      const n = neighbours.get(cursor)
      if (n === undefined) break
      const [lowSide, highSide] =
        n.axis === 'vertical' ? (['left', 'right'] as const) : (['bottom', 'top'] as const)
      if (sides[lowSide].kind === 'shell' && n.index > 0 && hasDivision(n.parentId, n.index - 1)) {
        sides[lowSide] = { kind: 'division', parentId: n.parentId, index: n.index - 1 }
      }
      if (
        sides[highSide].kind === 'shell' &&
        n.index < n.count - 1 &&
        hasDivision(n.parentId, n.index)
      ) {
        sides[highSide] = { kind: 'division', parentId: n.parentId, index: n.index }
      }
      cursor = n.parentId
    }
    return sides
  }
```

Add `boundsOf` to the returned object.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Rewrite the divider and shelf joint blocks**

In `carcaseJoints` (`carcaseRoles.ts`), delete the blocks that emit joints for `divider-{i}` and `shelf-{b}-{i}` and replace with:

```ts
  // A division is housed at both ends into whatever bounds its parent section along the
  // perpendicular axis. The old divider-into-bottom-and-top and shelf-into-the-two-sides rules
  // were this same rule, written twice.
  const tree = resolveSections(p.section, openingRect(p), () => p.thickness)
  for (const d of tree.divisions) {
    if (d.kind === 'rail') continue // butt-jointed; no housing
    const housedRole = `division-${d.parentId}-${d.index}`
    for (const h of housingsFor(p, d, tree.boundsOf(d.parentId))) {
      add('dado', h.role, housedRole, h.housingFace, h.housedEnd)
    }
  }
```

and add this helper above `carcaseJoints`:

```ts
interface Housing {
  role: string
  housingFace: Face
  housedEnd: Face
}

// What a division is housed into, and with which faces. Both branches are transcribed from the two
// rules the old code wrote separately — a partition into bottom and top, a shelf into whatever
// bounds its bay — so the face constants here are the ones that were already shipping, not ones
// re-derived from the frames.
//
// The two panel kinds line up because a bound is always the same thickness axis as the shell panel
// it replaces: a shelf is thickness-on-z like bottom and top, a partition is thickness-on-x like a
// side, so one pair of faces covers a shell bound and a division bound alike.
function housingsFor(p: CarcaseParams, d: ResolvedDivision, parent: SectionBounds): Housing[] {
  const roleOf = (b: Bound, shell: string | null): string | null =>
    b.kind === 'division' ? `division-${b.parentId}-${b.index}` : shell

  if (d.axis === 'vertical') {
    // A partition spans its parent's full height and never reaches a side.
    // Was: add('dado', 'bottom', `divider-${i}`, '+Z', '-Y') / ('top', …, '-Z', '+Y')
    const below = roleOf(parent.bottom, 'bottom')
    const above = roleOf(parent.top, p.hasTop ? 'top' : null)
    return [
      ...(below === null ? [] : [{ role: below, housingFace: '+Z' as Face, housedEnd: '-Y' as Face }]),
      ...(above === null ? [] : [{ role: above, housingFace: '-Z' as Face, housedEnd: '+Y' as Face }]),
    ]
  }

  // Was: add('dado', left, `shelf-${b}-${i}`, LEFT_EDGE_FACE, '-X') / (right, …, RIGHT_EDGE_FACE, '+X')
  const left = roleOf(parent.left, 'left-side')
  const right = roleOf(parent.right, 'right-side')
  return [
    ...(left === null ? [] : [{ role: left, housingFace: LEFT_EDGE_FACE, housedEnd: '-X' as Face }]),
    ...(right === null ? [] : [{ role: right, housingFace: RIGHT_EDGE_FACE, housedEnd: '+X' as Face }]),
  ]
}
```

**Why these particular constants:** they are copied from `carcaseRoles.ts:456-468`, not reasoned out. A partition's ends are `-Y`/`+Y`, a shelf's are `-X`/`+X` — the opposite of what "vertical means X" intuition suggests, because the ends are named in the *housed board's own* local frame, not in carcase axes. Getting this backwards is the single most likely error in Stage A, and the equivalence test in Task 9 is what proves it right.

- [ ] **Step 6: Run the equivalence test**

Task 9 builds it. Complete Task 9, then confirm this task's joint output is green before moving on. If it is not, the diff names the exact geometry of the housing panel that differs — work back from that to which bound was chosen wrongly, rather than adjusting constants by trial.

- [ ] **Step 7: Update `carcaseContactPairs` the same way**

Every pair naming `divider-{i}` or `shelf-{b}-{i}` becomes the corresponding `division-{parentId}-{index}`, derived from the same `tree.divisions` list. The equivalence test does not cover contacts, so add a direct test asserting that `carcaseContactPairs` names only roles that `carcaseBoxes` emits:

```ts
// In src/scene/carcaseRoles.test.ts
it('every contact pair names a role the generator actually emits', () => {
  for (const params of SWEEP) {
    const roles = new Set(carcaseBoxes(params).map((b) => b.role))
    for (const [a, b] of carcaseContactPairs(params)) {
      expect(roles.has(a), a).toBe(true)
      expect(roles.has(b), b).toBe(true)
    }
  }
})
```

- [ ] **Step 8: Commit**

```bash
git add src/scene/carcaseRoles.ts src/scene/sectionTree.ts src/scene/sectionTree.test.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): derive division joints from section bounds"
```

---

### Task 9: The equivalence test

**Files:**
- Create: `src/scene/sectionEquivalence.test.ts`
- Modify: `src/scene/__fixtures__/sweep.ts`

- [ ] **Step 1: Migrate the sweep onto trees**

In `src/scene/__fixtures__/sweep.ts`, replace the `dividers` / `fixedShelves` fields in both `LADDER_WITH_DIVIDERS` and the `SWEEP` builder with a `section` built by `legacyToSection`, keeping the legacy values as the source so the sweep still spans the same space:

```ts
import { legacyToSection } from '../migrateSections'

export const LADDER_WITH_DIVIDERS: CarcaseParams = {
  ...CARCASE_PRESETS[0].params,
  width: 1400,
  baseMode: 'ladder',
  section: legacyToSection([0.5], 1),
}

export const SWEEP: CarcaseParams[] = (['toe-kick', 'ladder', 'legs', 'none'] as const).flatMap(
  (baseMode) =>
    (['captured', 'applied', 'none'] as const).flatMap((backMode) =>
      [true, false].flatMap((hasTop) =>
        [[], [1 / 3, 2 / 3]].flatMap((dividers) =>
          [0, 2].map(
            (fixedShelves): CarcaseParams => ({
              ...CARCASE_PRESETS[0].params,
              width: 1400,
              height: 2100,
              baseMode,
              backMode,
              hasTop,
              section: legacyToSection(dividers, fixedShelves),
            }),
          ),
        ),
      ),
    ),
)
```

The sweep order is unchanged, so `SWEEP[i]` still corresponds to `baseline[i]`.

- [ ] **Step 2: Write the equivalence test**

```ts
// src/scene/sectionEquivalence.test.ts
import { describe, expect, it } from 'vitest'
import { carcaseBoxes, carcaseJoints } from './carcaseRoles'
import { SWEEP } from './__fixtures__/sweep'
import baseline from './__fixtures__/stage-a-baseline.json'

// Stage A's whole risk control. The section tree must reproduce, for every case in the sweep, the
// exact cabinet the v12 parameters produced.
//
// Compared by *geometry*, never by role name: role keys change in this stage, so a name-keyed
// comparison could be satisfied by renaming something into place rather than by building the same
// cabinet. Both sides are derived; neither is a number anyone typed.
const boxKey = (b: { box: Record<string, number>; thicknessAxis: string }) =>
  [b.box.x0, b.box.x1, b.box.y0, b.box.y1, b.box.z0, b.box.z1, b.thicknessAxis]
    .map((n) => (typeof n === 'number' ? n.toFixed(6) : n))
    .join('|')

describe('the section tree reproduces the pre-restructure cabinet', () => {
  it('covers every baseline case', () => {
    expect(SWEEP).toHaveLength(baseline.length)
  })

  it.each(SWEEP.map((p, i) => [i, p] as const))('case %i: same boxes', (i, params) => {
    expect(carcaseBoxes(params).map(boxKey).sort()).toEqual(baseline[i].boxes)
  })

  it.each(SWEEP.map((p, i) => [i, p] as const))('case %i: same joints', (i, params) => {
    const byRole = new Map(carcaseBoxes(params).map((b) => [b.role, b]))
    const joints = carcaseJoints(params, '')
      .map((d) =>
        [
          d.kind,
          boxKey(byRole.get(d.housingRole)!),
          boxKey(byRole.get(d.housedRole)!),
          d.housingFace,
          d.housedEnd,
        ].join('#'),
      )
      .sort()
    expect(joints).toEqual(baseline[i].joints)
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm vitest run src/scene/sectionEquivalence.test.ts`
Expected: FAIL initially — most likely on joints, because `boundRole` in Task 8 is deliberately incomplete.

- [ ] **Step 4: Iterate Task 8's `boundRole` until green**

Read the first failing case's diff. It names the exact geometry of the housing panel that differs. Work back from that to which bound should have been chosen. Repeat until all 96 box assertions and all 96 joint assertions pass.

Run: `pnpm vitest run src/scene/sectionEquivalence.test.ts`
Expected, when done: PASS, 193 tests (1 coverage + 96 boxes + 96 joints).

- [ ] **Step 5: Prove the test bites**

In `openingRect`, change `z0: floorZ(p) + p.thickness` to `z0: floorZ(p)`.
Run: `pnpm vitest run src/scene/sectionEquivalence.test.ts`
Expected: FAIL on many cases — every shelf sits one thickness low.
Restore and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/scene/sectionEquivalence.test.ts src/scene/__fixtures__/sweep.ts src/scene/carcaseRoles.ts
git commit -m "test: prove the section tree reproduces the v12 cabinet"
```

---

### Task 10: Pin faces, grain, and `parameterForRole`

Three consumers still match the old role strings.

**Files:**
- Modify: `src/scene/carcaseRoles.ts` — `pinFaces` (`:554`), `parameterForRole` (`:616`)
- Modify: `src/scene/grain.ts` — `grainAxisOf`

- [ ] **Step 1: Write the failing grain test**

Append to `src/scene/grain.test.ts`:

```ts
describe('division roles state a grain direction', () => {
  it('a vertical division runs grain up, like a side', () => {
    expect(grainAxisOf('division-sec_abc-0')).toBe('z')
  })

  // Both are `division-` roles and they differ only in the split axis, which the role string does
  // not carry. The generator therefore has to disambiguate before asking — see grainAxisOf's second
  // argument.
  it('a horizontal division runs grain across, like a shelf', () => {
    expect(grainAxisOf('division-sec_abc-0', 'horizontal')).toBe('x')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/grain.test.ts -t 'division roles'`
Expected: FAIL — `no grain convention for role "division-sec_abc-0"`.

- [ ] **Step 3: Extend `grainAxisOf`**

In `src/scene/grain.ts`, add the axis parameter and the branch:

```ts
export function grainAxisOf(role: string, splitAxis?: 'vertical' | 'horizontal'): GrainAxis {
  // A division's grain follows what it *is*, and a role string cannot say: a `division-` role is a
  // partition when its split was vertical and a shelf when it was horizontal. The caller knows;
  // defaulting would give one of the two an arbitrary grain that no test would notice.
  if (role.startsWith('division-')) {
    if (splitAxis === undefined) {
      throw new Error(`zimmu: division role "${role}" needs its split axis to state a grain`)
    }
    return splitAxis === 'vertical' ? 'z' : 'x'
  }
  if (role === 'left-side' || role === 'right-side') return 'z'
  ...
```

Delete the now-unreachable `role.startsWith('divider-')` and `role.startsWith('shelf-')` clauses.

- [ ] **Step 4: Thread the axis through `carcaseRoles`**

In `carcaseRoles`, the final `boxes.map(...)` calls `grainAxisOf(b.role)`. A `RoleBox` already carries `thicknessAxis`, which determines this exactly: a division with `thicknessAxis: 'x'` came from a vertical split, `'z'` from a horizontal one. Pass it:

```ts
    grain: grainFieldFor(
      b.thicknessAxis,
      grainAxisOf(b.role, b.thicknessAxis === 'x' ? 'vertical' : 'horizontal'),
    ),
```

- [ ] **Step 5: Fix `pinFaces`**

`pinFaces` matched `divider-` by prefix. A horizontal division is a shelf and bores nothing, so the prefix alone is not enough. Change the signature to take the box:

```ts
function pinFaces(role: string, thicknessAxis: ThicknessAxis): Face[] {
  if (role === 'left-side') return [LEFT_EDGE_FACE]
  if (role === 'right-side') return [RIGHT_EDGE_FACE]
  // Only a vertical division is an upright that carries pins; a horizontal one is a shelf.
  if (role.startsWith('division-') && thicknessAxis === 'x') {
    return [LEFT_EDGE_FACE, RIGHT_EDGE_FACE]
  }
  return []
}
```

and update its caller in `carcaseHoleArrays` to look the box up first:

```ts
  const box = carcaseBoxes(p).find((b) => b.role === role)
  if (box === undefined) return []
  const faces = pinFaces(role, box.thicknessAxis)
```

- [ ] **Step 6: Fix `parameterForRole`**

Replace the shelf/divider clause:

```ts
  // Divisions are material-thick and their span is set by the tree, not by a scalar parameter.
  if (role.startsWith('division-')) {
    return dimension === 'thickness' ? 'thickness' : null
  }
```

- [ ] **Step 7: Run the whole scene suite**

Run: `pnpm vitest run src/scene`
Expected: PASS, including the equivalence test. Any remaining failure in `carcaseRoles.test.ts` is a test asserting an old role name — update the assertion to the new key, never the code to the old name.

- [ ] **Step 8: Commit**

```bash
git add src/scene/carcaseRoles.ts src/scene/grain.ts src/scene/grain.test.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): pin faces, grain and parameters follow division roles"
```

---

### Task 11: Presets carry trees

**Files:**
- Modify: `src/scene/carcasePresets.ts`

- [ ] **Step 1: Replace the legacy fields**

In `COMMON`, delete `dividers: []`. In each preset, delete `fixedShelves: n` and add `section`:

```ts
import { legacyToSection } from './migrateSections'
```

- Base 600: `section: legacyToSection([], 1),`
- Wall 600: `section: legacyToSection([], 1),`
- Tall 600: `section: legacyToSection([], 4),`

These reproduce the shipped `fixedShelves` values exactly — 1, 1 and 4.

- [ ] **Step 2: Write a test pinning that**

Append to `src/scene/carcaseRoles.test.ts`:

```ts
// All three presets ship fixed shelves, which is why Stage A could not also move adjustableShelves
// into the tree — see the plan's deviation note.
it.each([
  ['Base 600', 1],
  ['Wall 600', 1],
  ['Tall 600', 4],
])('%s still has %i fixed shelves', (name, expected) => {
  const params = CARCASE_PRESETS.find((p) => p.name === name)!.params
  const divisions = carcaseBoxes(params).filter((b) => b.role.startsWith('division-'))
  expect(divisions).toHaveLength(expected)
  for (const d of divisions) expect(d.thicknessAxis).toBe('z')
})
```

- [ ] **Step 3: Run it**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t 'fixed shelves'`
Expected: PASS, 3 cases.

- [ ] **Step 4: Typecheck must now be clean**

Run: `pnpm typecheck`
Expected: PASS with zero errors. If any remain, they are in `CarcasePanel.tsx`, which Task 13 fixes — note them and continue.

- [ ] **Step 5: Commit**

```bash
git add src/scene/carcasePresets.ts src/scene/carcaseRoles.test.ts
git commit -m "feat(scene): presets carry section trees"
```

---

### Task 12: File format v13

**Files:**
- Modify: `src/scene/useFile.ts:15` and the carcase branch at `:175-187`
- Modify: `src/scene/useFile.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/useFile.test.ts`:

```ts
describe('v12 → v13 migration', () => {
  const v12 = (params: Record<string, unknown>) =>
    JSON.stringify({
      version: 12,
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'carcase',
            id: 'cmp_1',
            label: 'Base',
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            visible: true,
            params,
          },
        ],
      },
    })

  const BASE = {
    width: 600, height: 720, depth: 560, material: '18mm Ply', thickness: 18,
    hasTop: true, backMode: 'captured', backThickness: 12,
    baseMode: 'toe-kick', toeKickHeight: 100, toeKickSetback: 60,
    jointMethod: 'dado-rabbet',
    adjustableShelves: { rows: 2, pitch: 32, setback: 37, backSetback: 37, startHeight: 200, count: 10 },
  }

  it('turns dividers and fixedShelves into a tree', () => {
    const file = parseFile(v12({ ...BASE, dividers: [0.5], fixedShelves: 1 }))
    const c = file.scene.components[0]
    if (c.kind !== 'carcase') throw new Error('expected a carcase')
    expect(c.params.section.content.kind).toBe('split')
    expect('dividers' in c.params).toBe(false)
    expect('fixedShelves' in c.params).toBe(false)
  })

  it('produces the same cabinet the v12 parameters described', () => {
    const file = parseFile(v12({ ...BASE, dividers: [0.5], fixedShelves: 1 }))
    const c = file.scene.components[0]
    if (c.kind !== 'carcase') throw new Error('expected a carcase')
    const divisions = carcaseBoxes(c.params).filter((b) => b.role.startsWith('division-'))
    // One partition, plus one shelf in each of the two bays.
    expect(divisions.filter((d) => d.thicknessAxis === 'x')).toHaveLength(1)
    expect(divisions.filter((d) => d.thicknessAxis === 'z')).toHaveLength(2)
  })

  it('a plain v12 cabinet becomes a single leaf', () => {
    const file = parseFile(v12({ ...BASE, dividers: [], fixedShelves: 0 }))
    const c = file.scene.components[0]
    if (c.kind !== 'carcase') throw new Error('expected a carcase')
    expect(c.params.section.content.kind).toBe('leaf')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/useFile.test.ts -t 'v12'`
Expected: FAIL — `params.section` is undefined.

- [ ] **Step 3: Bump the version and migrate at the boundary**

Add to the imports at the top of `src/scene/useFile.ts`:

```ts
import { legacyToSection } from './migrateSections'
import type { Section } from './sectionTree'
```

and in `src/scene/useFile.test.ts`, add `carcaseBoxes` from `./carcaseRoles` to its imports.

Then `src/scene/useFile.ts:15`:

```ts
export const FILE_FORMAT_VERSION = 13
```

In the `if (base.kind === 'carcase')` branch, alongside the existing `backSetback` fill, add — following the same convention that branch already states, *filled here and nowhere else, so no read site carries a fallback*:

```ts
        // v12→v13: `dividers` and `fixedShelves` became the section tree. Converted at the
        // boundary, so the generator never sees a legacy field.
        const legacy = base.params as unknown as {
          dividers?: number[]
          fixedShelves?: number
          section?: Section
        }
        const section =
          legacy.section ?? legacyToSection(legacy.dividers ?? [], legacy.fixedShelves ?? 0)
```

and include `section` in the returned `params`, deleting `dividers` and `fixedShelves` from it.

- [ ] **Step 4: Run the file tests**

Run: `pnpm vitest run src/scene/useFile.test.ts`
Expected: PASS, including the pre-existing v1–v5, v10 and v11 fixture tests. Those older fixtures route through the same conversion because their carcases also lack `section`.

- [ ] **Step 5: Prove the migration bites**

Change `legacyToSection(legacy.dividers ?? [], legacy.fixedShelves ?? 0)` to `legacyToSection([], 0)`.
Run: `pnpm vitest run src/scene/useFile.test.ts -t 'same cabinet'`
Expected: FAIL — no divisions at all.
Restore and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/scene/useFile.ts src/scene/useFile.test.ts
git commit -m "feat(scene): file format v13 migrates dividers and shelves to the tree"
```

---

### Task 13: The CarcasePanel shim

The divider text field and fixed-shelf counter stay, writing simple trees. Nothing regresses; the real editor is Stage G.

**Files:**
- Modify: `src/ui/CarcasePanel.tsx:228-262`
- Modify: `src/ui/CarcasePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/ui/CarcasePanel.test.tsx`:

```ts
it('the divider field writes a tree', async () => {
  const setParams = vi.fn()
  render(<CarcasePanel p={{ ...CARCASE_PRESETS[0].params }} setParams={setParams} />)
  await userEvent.clear(screen.getByLabelText('Dividers'))
  await userEvent.type(screen.getByLabelText('Dividers'), '0.5')
  const written = setParams.mock.calls.at(-1)![0]
  expect(written.section.content.kind).toBe('split')
  expect(written.section.content.axis).toBe('vertical')
})
```

Match the existing file's render helper and prop names — read the top of `CarcasePanel.test.tsx` and follow it rather than the sketch above if they differ.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx -t 'writes a tree'`
Expected: FAIL — `setParams` still called with `{ dividers: [...] }`.

- [ ] **Step 3: Add the shim state and rewrite both handlers**

Add to the imports at the top of `src/ui/CarcasePanel.tsx`:

```tsx
import { legacyToSection } from '@/scene/migrateSections'
import type { Section } from '@/scene/types'
```

Match the existing import style in that file — if it uses relative paths (`../scene/...`) rather than the `@/` alias, follow it.

The panel needs to read the current bay and shelf counts back out of the tree to populate its own fields. Add above the component's return:

```tsx
// Stage A shim. The tree can express far more than two numbers, but this panel only writes the
// shapes v12 could describe: n bays of equal width, m shelves in each. Stage G replaces it with the
// elevation editor. Reading the counts back out keeps the fields showing what the tree holds.
function legacyShape(section: Section): { bays: number; shelves: number } {
  const top = section.content
  if (top.kind === 'split' && top.axis === 'vertical') {
    const first = top.children[0].content
    return {
      bays: top.children.length,
      shelves: first.kind === 'split' && first.axis === 'horizontal' ? first.children.length - 1 : 0,
    }
  }
  if (top.kind === 'split' && top.axis === 'horizontal') {
    return { bays: 1, shelves: top.children.length - 1 }
  }
  return { bays: 1, shelves: 0 }
}
```

Change the divider `onChange` to:

```tsx
                const dividers = parseDividers(e.target.value)
                if (dividers !== null) {
                  setParams({ section: legacyToSection(dividers, legacyShape(p.section).shelves) })
                }
```

and the fixed-shelf `DimInput` to write `section: legacyToSection(currentDividers, next)`, where `currentDividers` are the evenly spaced fractions implied by `legacyShape(p.section).bays`:

```tsx
const { bays, shelves } = legacyShape(p.section)
const currentDividers = Array.from({ length: bays - 1 }, (_, i) => (i + 1) / bays)
```

Replace `value={p.fixedShelves}` with `value={shelves}`.

- [ ] **Step 4: Run the panel tests**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run typecheck — it must now be fully clean**

Run: `pnpm typecheck`
Expected: PASS, zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/CarcasePanel.tsx src/ui/CarcasePanel.test.tsx
git commit -m "feat(ui): the carcase panel writes section trees"
```

---

### Task 14: Close the stage

**Files:**
- Delete: `src/scene/__fixtures__/stage-a-baseline.json`, `src/scene/sectionEquivalence.test.ts`
- Modify: `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
- Modify: `CLAUDE.md`, `project-structure.html`

- [ ] **Step 1: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all three PASS.

Record the test count in the notes. Do not compare it against a number quoted from memory — measure the baseline yourself before starting Stage A (`pnpm test` on a clean checkout) and compare against that. The only figure that matters is that no previously-passing test was deleted to make the suite green.

Do **not** pipe this through `tail` or `head`. The sheet-yield notes record a red lint reaching `main` because `pnpm lint 2>&1 | tail -1` made the exit status `tail`'s and the `&&` never short-circuited.

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS, 13 specs. `e2e/carcase.spec.ts` drives the divider field and shelf counter, which is exactly what the shim exists to keep working — if it fails, the shim is wrong, not the test.

- [ ] **Step 3: Decide whether the equivalence test stays**

It has done its job once green, and it depends on a fixture captured from deleted code. Keeping it would freeze Stage A's output against every later stage, which is wrong — Stage D deliberately changes pin bores and Stage E adds fronts.

Delete all three files. The properties worth keeping permanently are already in `sectionTree.test.ts` (the fill property, bounds) and `carcaseRoles.test.ts` (contact-pair coverage, preset shelf counts).

```bash
git rm src/scene/__fixtures__/stage-a-baseline.json src/scene/sectionEquivalence.test.ts
```

- [ ] **Step 4: Re-run the suite after the deletion**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. If anything fails now, a permanent test was leaning on the fixture — fix it to stand on its own rather than restoring the fixture.

- [ ] **Step 5: Update the notes file**

Append a dated section to `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md` recording: the two deviations at the top of this plan and why; the measurement that all three presets ship `fixedShelves > 0`; what `boundRole` turned out to need once the equivalence test drove it out; any case where the baseline disagreed with what you expected; and the final test counts.

- [ ] **Step 6: Update the architecture docs**

In `CLAUDE.md`: change the `FILE_FORMAT_VERSION` invariant to 13 and say what 13 means; add `sectionTree.ts` and `migrateSections.ts` to the `src/scene/` tree; replace the description of `carcaseRoles.ts` bay handling.

Run: `node scripts/update-structure-html.mjs`

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: close Stage A — retire the equivalence baseline, update the docs"
```

---

## Acceptance

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass, exit codes checked directly
- [ ] `pnpm test:e2e` passes all 13 specs, `e2e/carcase.spec.ts` included and unmodified
- [ ] The equivalence test passed over all 96 cases before being retired
- [ ] `grep -rn "dividers\|fixedShelves" src/` returns hits only in `migrateSections.ts`, its test, and the `CarcasePanel` shim
- [ ] `grep -rn "bayEdges" src/` returns nothing
- [ ] A v12 file on disk opens and renders the same cabinet it rendered before
- [ ] Every guard added was mutation-tested: Tasks 4, 5, 9 and 12 each contain an explicit break-it step, and each was run

## What Stage A deliberately does not do

- `adjustableShelves` still lives on `CarcaseParams`; pin rows still span whole panels. **Stage D.**
- No `Section.interior`, no `Section.front`. **Stages D and E.**
- Thickness still comes from `CarcaseParams.thickness`. **Stage B** — and note that `openingRect` and the `resolveSections` thickness callback are the two seams built here specifically so Stage B has somewhere to land.
- The panel is a shim, not an editor. **Stage G.**
