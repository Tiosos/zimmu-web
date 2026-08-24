# Sheet Yield — Stage 4: the worker and the Sheets tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the nest off the main thread and show the answer — per material: sheet count, utilisation, cost, and a picture of each sheet.

**Architecture:** A Comlink worker (`src/nest/nest.worker.ts`) that takes **parts**, not masks, and does the masking and nesting in one hop. A hook (`src/scene/useNest.ts`) that groups by material, debounces, and holds results. A pure SVG serialiser (`src/ui/buildSheetSvg.ts`) and a `SheetsTab` in `BomModal`.

**Tech Stack:** React 19 · TypeScript strict · Vitest + happy-dom · Comlink · Tailwind v4 + Radix.

**Spec:** `docs/superpowers/specs/2026-08-23-sheet-yield-design.md`
**Notes:** `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md`
**Depends on:** Stages 1–3, merged as #33, #35, #36.

---

## Conventions for every task in this plan

- **Package manager is pnpm.** Never npm or yarn.
- **Run before every commit:** `pnpm typecheck && pnpm lint && pnpm test`.
- **TDD is mandatory.** Write the failing test, run it, watch it fail *for the stated reason*, then implement.
- **No `any`.** `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- **Comments explain *why*, never *what*.**
- Branch: `claude/sheet-yield-stage-4`. Never commit on `main`.

## The rule this plan inherits

Stages 1–3 corrected **six** claims between them — three in the approved spec, two in their own plans, one in a test — every one found by checking the system against itself. Treat every expected value here as a prediction to be checked.

---

## Two decisions taken before writing this plan

### The worker takes parts, not masks

`occupancyMask` costs ~6 ms a board and a dilated mask for a 2100 mm panel is over a megabyte. Masking on the main thread and posting 46 of them across the boundary would move the wrong thing: it leaves the 280 ms of masking on the thread we are trying to protect, and transfers megabytes to save nothing.

`BoardPart` is plain serialisable data, so the worker takes parts and a clearance and does both steps. Nothing needs `transfer()`; the OCCT worker uses it because it returns big typed arrays, and this one returns a small `NestResult`.

### The nest runs only while the Sheets tab is open

A nest is **5.4 s** for six cabinets (measured in Stage 3). Running one on every cabinet keystroke would queue a 5-second job per edit for a figure nobody is looking at — and most materials have no sheet stock defined at all, so most of those jobs would be nesting nothing.

So `useNest` is driven by an `enabled` flag that `BomModal` sets from its tab state, and debounced while enabled. **This is an assumption, not a spec requirement**, and the alternatives are worth naming: nesting always in the background trades waste for a warm answer; a "Calculate" button trades an extra click for total control. If opening the tab and waiting ~5 s turns out to annoy, background nesting is the change, and it is a one-line flip of the `enabled` condition.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/nest/nest.worker.ts` | Comlink worker: `nestJob(job)` → masks + nests one material. |
| `src/scene/useNest.ts` | Groups boards by nestable material, debounces, holds results and a pending flag. |
| `src/scene/useNest.test.ts` | Grouping, gating, debounce, and the worker mock. |
| `src/ui/buildSheetSvg.ts` | `buildSheetSvg(sheet, placements, labels)` → SVG string. Pure. |
| `src/ui/buildSheetSvg.test.ts` | Every placement appears, inside the sheet, labelled. |
| `src/ui/SheetsTab.tsx` | Per-material rows, the per-sheet SVGs, pending and unplaced states. |
| `src/ui/SheetsTab.test.tsx` | Rendering across empty / pending / unplaced / normal. |

### Modified

| File | Change |
|---|---|
| `src/ui/BomModal.tsx` | A fifth tab; passes `enabled` down to the nest. |
| `src/App.tsx` | Wires `useNest`. |
| `CLAUDE.md`, `project-structure.html` | Re-baseline. |

---

# Task 4.1: The worker

**Files:** `src/nest/nest.worker.ts`

- [ ] **Step 1: Implement** — there is nothing here to TDD that the pure modules do not already cover; the worker is a two-line adapter and its value is proven by the hook's test and by a manual run.

```ts
import { expose } from 'comlink'
import { occupancyMask } from './mask'
import { nestSheets } from './nest'
import type { NestResult, SheetSpec } from './nest'
import type { BoardPart } from '../scene/types'

export interface NestJob {
  parts: BoardPart[] // one material's boards
  clearance: number
  sheet: SheetSpec
  hasGrain: boolean
}

const api = {
  nestJob({ parts, clearance, sheet, hasGrain }: NestJob): NestResult {
    const t0 = performance.now()
    const items = parts.map((p) => ({ id: p.id, mask: occupancyMask(p, clearance), grain: p.grain }))
    const result = nestSheets(items, sheet, { hasGrain })
    if (import.meta.env.DEV) {
      console.debug(`zimmu: nestJob ${parts.length} parts ${(performance.now() - t0).toFixed(0)}ms`)
    }
    return result
  },
}

expose(api)

export type NestWorkerApi = typeof api
```

- [ ] **Step 2: Commit** — `feat(nest): a Comlink worker that masks and nests one material`

---

# Task 4.2: `useNest`

**Files:** `src/scene/useNest.ts`, `src/scene/useNest.test.ts`

- [ ] **Step 1: Failing tests**

Mock `comlink` and stub `Worker` *before* importing the hook, the way `useScene.test.ts` does:

```ts
vi.mock('comlink', () => ({ wrap: () => ({ nestJob: mockNestJob }), expose: vi.fn() }))
vi.stubGlobal('Worker', vi.fn(function MockWorker() {}))
```

The tests that matter:

1. **Disabled means no work at all.** `enabled: false` never calls the worker. This is the whole point of the gating decision.
2. **Only nestable materials are nested.** A material with no `sheet`, or with a zero dimension, is skipped — reuse `isNestable` rather than re-deriving it.
3. **Boards group by material**, and a board whose material has no entry at all is skipped rather than crashing.
4. **`hasGrain` defaults to true** when the field is absent, matching the Library tab's checkbox.
5. **A superseded run does not overwrite a newer one.** Edit twice quickly and only the last result may land. A monotonically increasing request id, compared on resolve, is the cheap fix; a nest is 5 s, so overlapping runs are the normal case, not an edge one.
6. **`pending` is true while a job is in flight** and false after.

Test 5 is the one that would otherwise produce a bug nobody could reproduce.

- [ ] **Step 2: Implement**

Lazy worker singleton, exactly the `getOcct()` pattern — not instantiated at module load, so `vi.stubGlobal('Worker', …)` works:

```ts
let _nest: ReturnType<typeof wrap<NestWorkerApi>> | null = null
function getNester() {
  if (!_nest) {
    const w = new Worker(new URL('../nest/nest.worker.ts', import.meta.url), { type: 'module' })
    _nest = wrap<NestWorkerApi>(w)
  }
  return _nest
}
```

Signature:

```ts
export interface NestReport {
  material: string
  sheet: SheetSpec
  result: NestResult
}

export function useNest(
  parts: Part[],
  materials: Record<string, MaterialDef>,
  clearance: number,
  enabled: boolean,
): { reports: NestReport[]; pending: boolean }
```

Debounce with the existing `useDebouncedCallback` if it fits; otherwise a `setTimeout` in an effect. Do not add a debounce library.

- [ ] **Step 3: Commit** — `feat(scene): useNest groups by material and nests off-thread`

---

# Task 4.3: `buildSheetSvg`

**Files:** `src/ui/buildSheetSvg.ts`, `src/ui/buildSheetSvg.test.ts`

- [ ] **Step 1: Failing tests** — properties, not a golden string:

```ts
it('draws one rect per placement, all inside the sheet outline', () => {})
it('labels every placement', () => {})
it('scales the sheet to fit the given viewport width', () => {})
it('renders an empty sheet without throwing', () => {})
```

The containment test is the valuable one, and it is the same shape as the assertion that caught the drawing bug in #34: compare each part rect against the sheet rect the same code produced, so it asserts no number the test supplies.

- [ ] **Step 2: Implement**

```ts
export function buildSheetSvg(
  sheet: SheetSpec,
  placements: Placement[],
  labelOf: (id: string) => string,
  viewportWidth = 600,
): string
```

Scale is `viewportWidth / sheet.length`. Y is flipped — a nest is drawn with the origin bottom-left, like a sheet on a bench, where SVG y grows downward. **Note the Face-view lesson from #34: state the flip and test it, rather than assuming which way it goes.**

Escape label text (`&`, `<`, `>`), and skip a label that does not fit its rect rather than letting it overflow.

- [ ] **Step 3: Commit** — `feat(ui): render a nested sheet as SVG`

---

# Task 4.4: The Sheets tab

**Files:** `src/ui/SheetsTab.tsx`, `src/ui/SheetsTab.test.tsx`, `src/ui/BomModal.tsx`, `src/App.tsx`

- [ ] **Step 1: Failing tests**

```ts
it('tells the user how to get a nest when no material has sheet stock', () => {})
it('shows a pending state while nesting', () => {})
it('shows sheet count and utilisation per material', () => {})
it('names the parts that did not fit, rather than hiding them', () => {})
it('prices by cost per sheet when the material has one', () => {})
it('falls back to the areal rate when it does not', () => {})
```

The `unplaced` test is load-bearing: Stage 3 added the field precisely so a too-big panel is visible, and a tab that silently ignored it would undo that.

- [ ] **Step 2: Implement**

Per material: `N sheets`, `utilisation %` (one decimal at most — Stage 2's mask is a 1 mm raster and the spec is explicit that utilisation must not be quoted to two), cost, then an SVG per sheet.

Cost precedence follows the spec: `costPerSheet × sheets` where defined, otherwise `costPerM2 × placed area`. Show which basis was used, since the two can differ a lot and a figure with no basis is a figure nobody can check.

The empty state names the fix: *"No material has a sheet size yet. Set one in the Library tab."*

- [ ] **Step 3: Wire it** — `Tab` gains `'sheets'`, the tab list and the render switch gain a branch, and Copy/Download stay disabled for it as they are for Library (there is no CSV of a nest, and the spec excludes DXF export).

- [ ] **Step 4: Commit** — `feat(ui): a Sheets tab reporting yield per material`

---

# Task 4.5: Re-baseline and measure

**Files:** `CLAUDE.md`, `project-structure.html`, the notes

- [ ] Add `src/nest/` to the architecture tree in `CLAUDE.md`: `mask.ts`, `nest.ts`, `nest.worker.ts`, and `useNest.ts` under `src/scene/`.
- [ ] Add a Key Invariant: **the nest runs off-thread and only while the Sheets tab is open**, and masks are built in the worker, not posted to it.
- [ ] `node scripts/update-structure-html.mjs`.
- [ ] Record the end-to-end figure — open the tab on a six-cabinet scene and time it from click to rendered — in the notes. It should be the Stage 3 nest cost plus masking; confirm rather than assume.

---

# Stage 4 acceptance

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — green. Record the test count.
- [ ] `pnpm test:e2e` — green.
- [ ] `pnpm build` — succeeds.
- [ ] With the tab closed, the worker is never constructed — asserted in a test, not eyeballed.
- [ ] A six-cabinet scene with a 2440 × 1220 sheet on `18mm Ply` renders sheet count, utilisation and per-sheet SVGs, and the viewport stays interactive throughout.
- [ ] `grep -rn "occupancyMask\|nestSheets" src/ui/` returns nothing — the UI talks to the hook, never to the engine.

## What Stage 4 deliberately does not do

- **No DXF or G-code export of the nest.** Excluded by the spec.
- **No offcut banking across jobs.** Excluded by the spec.
- **No best-fit.** Stage 3's decision stands until a measurement says otherwise.
