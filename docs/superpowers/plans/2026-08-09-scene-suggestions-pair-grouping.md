# Scene Suggestions Pair Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the scene-wide joint suggestion list from one row per candidate joint to one row per board pair — 40 rows to 14 on an 8-board carcase — with every option still reachable as a chip on its row.

**Architecture:** A new pure module `src/scene/groupSuggestions.ts` turns the engine's flat `JointSuggestion[]` into `PairGroup[]`. `SceneSuggestionsPanel` renders one row per group with a chip per option. The engine, the apply path and the outline preview are untouched — hover and apply already take a single `JointSuggestion`, and a chip hands back the same object a flat row does today. The scene cap moves from suggestions to pairs so a rendered row is never partial.

**Tech Stack:** TypeScript (strict), React 19, Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn-style Radix primitives.

**Spec:** `docs/superpowers/specs/2026-08-09-scene-suggestions-pair-grouping-design.md`
**Notes:** `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` (this feature's existing thread)

---

## Background the engineer needs

`JointSuggestion` is a discriminated union on `kind` (`src/scene/suggestJoints.ts:27`). Every variant also carries `neighborId`, which means "the other board relative to the selection" and is **meaningless scene-wide** — do not use it here. Use `pairIdsOf(s)` (`suggestJoints.ts:396`), which returns the two board ids for any kind.

Two facts drive the whole design:

1. **`pairIdsOf` returns role order, not a canonical order.** A dado gives `[housingPartId, housedPartId]`; a finger joint gives `[partAId, partBId]`. The same two boards can come back in either order depending on kind and direction. So the group key must be order-independent.

2. **A pair's suggestions are not contiguous.** `suggestJointsForScene` sorts by pair distance and tiebreaks on `KIND_PRIORITY` (`suggestJoints.ts:386-390`), so equidistant pairs interleave. On a real carcase, Left Side + Bottom and Left Side + Top are both 525 mm apart and come back as `dado(LS+Bottom), dado(LS+Top), …, mortise-tenon(LS+Bottom), …`. **Grouping must key a map, not collapse adjacent runs.** An adjacency implementation passes a two-board fixture and silently splits every real pair.

Run the full check suite before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scene/groupSuggestions.ts` | **new.** Pure grouping: `PairGroup`, `groupByPair`, `orientationArrow`, `MAX_SCENE_PAIRS`. No React. |
| `src/scene/groupSuggestions.test.ts` | **new.** Unit tests for the above. |
| `src/ui/SceneSuggestionsPanel.tsx` | Renders one row per group, one chip per option. Keeps `describe()` as the chip tooltip. |
| `src/ui/SceneSuggestionsPanel.test.tsx` | **new.** Component tests. |
| `src/scene/suggestJoints.ts` | Drop `MAX_SCENE_SUGGESTIONS` and its `.slice`. |
| `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` | Append the outcome. |
| `project-structure.html` | Add the new module to the source tree. |

`App.tsx` is **not** modified. The panel groups internally, so `App` keeps passing the flat array and the same two callbacks.

---

### Task 1: `groupByPair` — one group per board pair

**Files:**
- Create: `src/scene/groupSuggestions.ts`
- Test: `src/scene/groupSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/groupSuggestions.test.ts`:

```ts
import { test, expect } from 'vitest'
import type { JointSuggestion } from './suggestJoints'
import { groupByPair } from './groupSuggestions'

const dado = (housing: string, housed: string): JointSuggestion => ({
  kind: 'dado',
  neighborId: housed,
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
})

const mortiseTenon = (mortise: string, tenon: string): JointSuggestion => ({
  kind: 'mortise-tenon',
  neighborId: tenon,
  mortisePartId: mortise,
  mortiseFace: '+Z',
  tenonPartId: tenon,
  tenonEnd: '-X',
})

test('collapses every suggestion for one pair into a single group', () => {
  const groups = groupByPair([dado('A', 'B'), mortiseTenon('A', 'B')])
  expect(groups).toHaveLength(1)
  expect(groups[0].aId).toBe('A')
  expect(groups[0].bId).toBe('B')
  expect(groups[0].options).toHaveLength(2)
})

// The real carcase ordering: suggestJointsForScene sorts by pair distance and tiebreaks on kind,
// so two equidistant pairs interleave. This is the test an adjacency-based grouping fails.
test('groups a pair whose suggestions are interleaved with another pair', () => {
  const groups = groupByPair([
    dado('A', 'B'),
    dado('A', 'C'),
    mortiseTenon('A', 'B'),
    mortiseTenon('A', 'C'),
  ])
  expect(groups).toHaveLength(2)
  expect(groups.map((g) => g.options.length)).toEqual([2, 2])
})

test('orders groups by first appearance', () => {
  const groups = groupByPair([dado('A', 'C'), dado('A', 'B')])
  expect(groups.map((g) => g.bId)).toEqual(['C', 'B'])
})

// pairIdsOf returns role order, which differs per kind, so the same two boards can arrive either
// way round. They must still land in one group.
test('treats a pair as the same group regardless of role order', () => {
  const groups = groupByPair([dado('A', 'B'), mortiseTenon('B', 'A')])
  expect(groups).toHaveLength(1)
})

// groupByPair does not sort. It does not need to: within one pair every suggestion has the same
// pair distance, so suggestJointsForScene's tiebreak is KIND_PRIORITY — preserving input order is
// exactly what delivers KIND_PRIORITY chip order.
test('keeps options in input order within a group', () => {
  const groups = groupByPair([mortiseTenon('A', 'B'), dado('A', 'B')])
  expect(groups[0].options.map((o) => o.kind)).toEqual(['mortise-tenon', 'dado'])
})

test('returns an empty array for no suggestions', () => {
  expect(groupByPair([])).toEqual([])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: FAIL — `Failed to resolve import "./groupSuggestions"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/scene/groupSuggestions.ts`:

```ts
import type { PartId } from './types'
import type { JointSuggestion } from './suggestJoints'
import { pairIdsOf } from './suggestJoints'

export interface PairGroup {
  key: string
  aId: PartId
  bId: PartId
  options: JointSuggestion[]
}

// Keyed by a sorted pair id, because pairIdsOf returns role order — a dado gives
// [housing, housed], a finger joint gives [partA, partB] — so the same two boards arrive either way
// round. Keyed by a Map rather than by collapsing adjacent runs, because suggestJointsForScene
// sorts by pair distance and tiebreaks on kind, so equidistant pairs interleave and a pair's
// suggestions are not contiguous. Map iteration order is insertion order, which gives
// first-appearance row ordering for free.
export function groupByPair(suggestions: JointSuggestion[]): PairGroup[] {
  const groups = new Map<string, PairGroup>()
  for (const s of suggestions) {
    const [x, y] = pairIdsOf(s)
    const key = x < y ? `${x}|${y}` : `${y}|${x}`
    const existing = groups.get(key)
    if (existing) existing.options.push(s)
    else groups.set(key, { key, aId: x, bId: y, options: [s] })
  }
  return [...groups.values()]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; test count up by 6.

- [ ] **Step 6: Commit**

```bash
git add src/scene/groupSuggestions.ts src/scene/groupSuggestions.test.ts
git commit -m "feat(scene): groupByPair collapses scene suggestions into one group per board pair"
```

---

### Task 2: Cap rows, not suggestions

**Files:**
- Modify: `src/scene/groupSuggestions.ts`
- Test: `src/scene/groupSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

Add `MAX_SCENE_PAIRS` to the existing import at the top of `src/scene/groupSuggestions.test.ts`:

```ts
import { groupByPair, MAX_SCENE_PAIRS } from './groupSuggestions'
```

Append to the same file:

```ts
test('caps the number of groups, and the last kept group is complete', () => {
  const many: JointSuggestion[] = []
  for (let i = 0; i < MAX_SCENE_PAIRS + 5; i++) {
    many.push(dado('A', `B${i}`))
    many.push(mortiseTenon('A', `B${i}`))
  }
  const groups = groupByPair(many)
  expect(groups).toHaveLength(MAX_SCENE_PAIRS)
  // A partial row is worse than an absent one: a missing chip is indistinguishable from a joint
  // the engine cannot make.
  expect(groups[groups.length - 1].options).toHaveLength(2)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: FAIL — `MAX_SCENE_PAIRS` is not exported, so the import errors.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/groupSuggestions.ts`, add above `PairGroup`:

```ts
// Runaway guard on rows, not on suggestions. A row is one real decision where a suggestion was a
// quarter of one, so this sits far above any scene measured: an 8-board carcase needs 14 rows and
// three of them need 42. Applied after grouping so a rendered row is always complete — capping the
// flat list instead would render a pair with only some of its kinds.
export const MAX_SCENE_PAIRS = 100
```

and change the return statement:

```ts
  return [...groups.values()].slice(0, MAX_SCENE_PAIRS)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: PASS — 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/groupSuggestions.ts src/scene/groupSuggestions.test.ts
git commit -m "feat(scene): cap scene suggestions by pair so a row is never partial"
```

---

### Task 3: Remove the flat cap from the engine

The engine must return the full list, or `groupByPair` groups an already-truncated array and the pair cap cannot guarantee complete rows.

**Files:**
- Modify: `src/scene/suggestJoints.ts` (the `MAX_SCENE_SUGGESTIONS` constant and the `return` at the end of `suggestJointsForScene`)
- Test: `src/scene/suggestJoints.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/suggestJoints.test.ts`. The file already imports `board`, `Part` and `suggestJointsForScene`:

```ts
// The pair cap in groupSuggestions.ts guarantees complete rows only if the engine hands over every
// suggestion. Measured 2026-08-09: three 8-board carcases produce 120 candidates, so the old
// 100-suggestion slice was reachable by a real scene.
test('scene: the suggestion list is not truncated', () => {
  const many: Part[] = []
  // 60 tees, each yielding a dado + a mortise-tenon = 120 suggestions, comfortably past the old
  // 100 slice. Rows are 300 mm apart in y so no board touches its neighbours' tees.
  for (let i = 0; i < 60; i++) {
    many.push(
      board({
        id: `S${i}`,
        length: 200,
        width: 100,
        thickness: 20,
        position: { x: 0, y: i * 300, z: 0 },
      }),
    )
    many.push(
      board({
        id: `U${i}`,
        length: 80,
        width: 40,
        thickness: 18,
        rotation: { x: 0, y: -90, z: 0 },
        position: { x: 100, y: i * 300 + 30, z: 20 },
      }),
    )
  }
  expect(suggestJointsForScene(many, []).length).toBeGreaterThan(100)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts -t "not truncated"`
Expected: FAIL — `expected 100 to be greater than 100`.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/suggestJoints.ts`, delete this constant and its comment:

```ts
// Runaway guard on an all-pairs list, not a curation device. Measured 2026-08-09: three 8-board
// carcases — a modest kitchen run — produce 120 candidates and are cut to 100, so this IS reachable
// by a real scene and truncates it silently. Grouping rows by pair is the fix; raising the number
// only moves the cliff.
const MAX_SCENE_SUGGESTIONS = 100
```

and change the final return of `suggestJointsForScene` from:

```ts
  return out.slice(0, MAX_SCENE_SUGGESTIONS)
```

to:

```ts
  // Not truncated: the cap now applies to rows, after grouping (groupSuggestions.ts), so a rendered
  // row is always complete. Capping here would render a pair with only some of its kinds.
  return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS — all tests in the file pass. `noUnusedLocals` would fail typecheck if the constant were left behind.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "refactor(scene): return every scene suggestion; the cap now applies to rows"
```

---

### Task 4: `orientationArrow` — disambiguate the two-orientation kinds

`finger` and `tongue-groove` are in `ORIENTATION_MATTERS`, so a pair yields two genuinely different joints. Two chips both reading "Finger" would be ambiguous.

**Files:**
- Modify: `src/scene/groupSuggestions.ts`
- Test: `src/scene/groupSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the import at the top of `src/scene/groupSuggestions.test.ts`:

```ts
import { groupByPair, orientationArrow, MAX_SCENE_PAIRS } from './groupSuggestions'
```

Append to the same file:

```ts
const finger = (a: string, b: string): JointSuggestion => ({
  kind: 'finger',
  neighborId: b,
  partAId: a,
  endA: '+X',
  partBId: b,
  endB: '-X',
})

test('no arrow when a kind appears once in the group', () => {
  const [group] = groupByPair([dado('A', 'B'), finger('A', 'B')])
  expect(orientationArrow(group, group.options[0])).toBeNull()
  expect(orientationArrow(group, group.options[1])).toBeNull()
})

test('arrows point at whichever board leads when a kind appears twice', () => {
  const [group] = groupByPair([dado('A', 'B'), finger('A', 'B'), finger('B', 'A')])
  expect(group.aId).toBe('A')
  const fingers = group.options.filter((o) => o.kind === 'finger')
  // Both orientations survive grouping — they are different joints, not duplicates.
  expect(fingers).toHaveLength(2)
  expect(orientationArrow(group, fingers[0])).toBe('→')
  expect(orientationArrow(group, fingers[1])).toBe('←')
  expect(orientationArrow(group, group.options[0])).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: FAIL — `orientationArrow` is not exported, so the import errors.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/scene/groupSuggestions.ts`:

```ts
// Only the ORIENTATION_MATTERS kinds (finger, tongue-groove) can appear twice for one pair, so an
// arrow is added only when that happens. '→' means the row's first-named board leads: it carries
// the finger joint's partA role, or the groove. Matches the →/← lead convention JointsPanel already
// uses for an existing joint.
export function orientationArrow(group: PairGroup, s: JointSuggestion): '→' | '←' | null {
  if (group.options.filter((o) => o.kind === s.kind).length < 2) return null
  const leadId =
    s.kind === 'finger' ? s.partAId : s.kind === 'tongue-groove' ? s.groovePartId : null
  if (leadId === null) return null
  return leadId === group.aId ? '→' : '←'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: PASS — 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/groupSuggestions.ts src/scene/groupSuggestions.test.ts
git commit -m "feat(scene): orientationArrow disambiguates the two-orientation joint kinds"
```

---

### Task 5: Render one row per pair with a chip per option

**Files:**
- Modify: `src/ui/SceneSuggestionsPanel.tsx`
- Create: `src/ui/SceneSuggestionsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ui/SceneSuggestionsPanel.test.tsx`:

```tsx
import { test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { SceneSuggestionsPanel } from './SceneSuggestionsPanel'

afterEach(cleanup)

function scene(): Scene {
  const base = {
    kind: 'board' as const,
    length: 100,
    width: 40,
    thickness: 18,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ' as const,
    cuts: [],
    visible: true,
  }
  return {
    parts: [
      { ...base, id: 'A', label: 'Left Side' },
      { ...base, id: 'B', label: 'Bottom' },
      { ...base, id: 'C', label: 'Top' },
    ],
    materials: {},
    hardware: [],
    joints: [],
  }
}

const dado = (housing: string, housed: string): JointSuggestion => ({
  kind: 'dado',
  neighborId: housed,
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
})

const mortiseTenon = (mortise: string, tenon: string): JointSuggestion => ({
  kind: 'mortise-tenon',
  neighborId: tenon,
  mortisePartId: mortise,
  mortiseFace: '+Z',
  tenonPartId: tenon,
  tenonEnd: '-X',
})

// Interleaved on purpose — the ordering suggestJointsForScene actually produces.
const interleaved = [dado('A', 'B'), dado('A', 'C'), mortiseTenon('A', 'B'), mortiseTenon('A', 'C')]

test('renders one row per pair, not one per suggestion', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  expect(screen.getByText('Left Side + Bottom')).toBeTruthy()
  expect(screen.getByText('Left Side + Top')).toBeTruthy()
})

test('the header counts pairs, not suggestions', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  expect(screen.getByText(/All possible joints \(2\)/)).toBeTruthy()
})

test('clicking a chip applies that exact suggestion', () => {
  const onApply = vi.fn()
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={onApply}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  fireEvent.click(screen.getAllByRole('button', { name: 'M&T' })[0])
  expect(onApply).toHaveBeenCalledWith(interleaved[2])
})

test('hovering a chip reports that exact suggestion, and leaving clears it', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  const chip = screen.getAllByRole('button', { name: 'Dado' })[1]
  fireEvent.mouseEnter(chip)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(interleaved[1])
  fireEvent.mouseLeave(chip)
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(null)
})

test('renders nothing when there are no suggestions', () => {
  const { container } = render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  expect(container.textContent).toBe('')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Left Side + Bottom`. The panel still renders one row per suggestion, labelled "Dado — Bottom into Left Side".

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/SceneSuggestionsPanel.tsx`, keep `KIND_LABEL`, `label()` and `describe()` exactly as they are — `describe()` becomes the chip tooltip.

Add to the imports:

```tsx
import { useMemo, useState } from 'react'
import { groupByPair, orientationArrow } from '../scene/groupSuggestions'
```

(The file already imports `useState` from `react`; merge the two rather than adding a second import statement.)

Add the short chip labels immediately below `KIND_LABEL`:

```tsx
// Short forms: a chip sits inside a row alongside up to three others.
const CHIP_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'M&T',
  finger: 'Finger',
  'tongue-groove': 'T&G',
}
```

Replace the whole `SceneSuggestionsPanel` function with:

```tsx
export function SceneSuggestionsPanel({
  suggestions,
  scene,
  onApply,
  onHoverSuggestion,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
}) {
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => groupByPair(suggestions), [suggestions])
  if (groups.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border px-2">
      <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
        {open ? '▾' : '▸'} All possible joints ({groups.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        {groups.map((g) => (
          <div key={g.key} className="flex items-center gap-1 py-0.5 border-t border-border/30">
            <span className="flex-1 text-[11px] text-foreground">
              {label(scene, g.aId)} + {label(scene, g.bId)}
            </span>
            <div className="flex flex-wrap gap-1 justify-end">
              {g.options.map((s, i) => {
                const arrow = orientationArrow(g, s)
                return (
                  <Button
                    key={i}
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-1.5"
                    title={describe(scene, s)}
                    onMouseEnter={() => onHoverSuggestion(s)}
                    onMouseLeave={() => onHoverSuggestion(null)}
                    onClick={() => onApply(s)}
                  >
                    {CHIP_LABEL[s.kind]}
                    {arrow ? ` ${arrow}` : ''}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: PASS — 5 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/SceneSuggestionsPanel.tsx src/ui/SceneSuggestionsPanel.test.tsx
git commit -m "feat(ui): scene suggestions render one row per pair with a chip per option"
```

---

### Task 6: Pin the chip arrows and tooltips

Task 5 already wired `orientationArrow` and `title` into the chip. These tests pin that rendered behaviour so a later refactor cannot drop it silently.

**Files:**
- Test: `src/ui/SceneSuggestionsPanel.test.tsx`

- [ ] **Step 1: Write the tests**

Append to `src/ui/SceneSuggestionsPanel.test.tsx`:

```tsx
const finger = (a: string, b: string): JointSuggestion => ({
  kind: 'finger',
  neighborId: b,
  partAId: a,
  endA: '+X',
  partBId: b,
  endB: '-X',
})

test('an arrow appears only on a kind duplicated within the pair', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[dado('A', 'B'), finger('A', 'B'), finger('B', 'A')]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  expect(screen.getByRole('button', { name: 'Dado' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Finger →' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Finger ←' })).toBeTruthy()
})

test('a chip carries the long description as its tooltip', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[dado('A', 'B'), finger('A', 'B'), finger('B', 'A')]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/All possible joints/))
  expect(screen.getByRole('button', { name: 'Finger →' }).getAttribute('title')).toBe(
    'Finger joint — Left Side leads, Bottom seats',
  )
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: PASS — 7 passed. These are guard tests over Task 5's implementation, so they pass immediately. If either fails, the Task 5 chip label or `title` wiring is wrong — fix it in `SceneSuggestionsPanel.tsx`, not in the test.

- [ ] **Step 3: Commit**

```bash
git add src/ui/SceneSuggestionsPanel.test.tsx
git commit -m "test(ui): pin chip arrows and tooltips on grouped scene rows"
```

---

### Task 7: Verify in the browser

The unit tests use synthetic fixtures. This confirms the real engine output groups as expected.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Open `http://localhost:5173` in Chrome. Wait for the OCCT WASM to boot — `+ Board` becomes enabled.

- [ ] **Step 2: Build a two-board tee**

Click `+ Board` twice. Select Board 1 in the parts list and leave it at its defaults. Select Board 2 and set Rotation Y to `-90`, Position to X `100`, Y `30`, Z `20`.

- [ ] **Step 3: Check the grouped row**

Expand "All possible joints". Expected: **one** row reading `Board 1 + Board 2` carrying two chips, `Dado` and `M&T`. On `main` this is two separate rows.

- [ ] **Step 4: Check hover and apply**

Hover each chip: both boards tint and the face outlines draw, exactly as before. Click `Dado`: the joint is created and the row disappears from the list.

- [ ] **Step 5: Record the result**

Append to `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md`:

```markdown
## 2026-08-09 — pair grouping shipped

- Scene rows now group by board pair: the 8-board carcase goes from 40 rows to 14, with every
  option reachable as a chip. Confirmed in the browser on a two-board tee — one row, two chips,
  where main showed two rows.
- The ordering trap was real and is worth remembering: `suggestJointsForScene` sorts by pair
  distance then tiebreaks on kind, so equidistant pairs interleave and a pair's suggestions are
  **not** contiguous. `groupByPair` keys a Map. An adjacency-based grouping passes a two-board
  fixture and splits every real carcase pair.
- `MAX_SCENE_SUGGESTIONS` is gone; `MAX_SCENE_PAIRS = 100` in `groupSuggestions.ts` replaces it.
  Capping rows rather than suggestions is what guarantees a rendered row is never partial.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md
git commit -m "docs: record scene suggestion pair grouping"
```

---

### Task 8: Update the architecture reference

**Files:**
- Modify: `project-structure.html`

- [ ] **Step 1: Find the scene module table**

Run: `grep -n "suggestJoints.ts" project-structure.html`
Expected: a hit around line 537, inside the `src/scene/` table.

- [ ] **Step 2: Add the new module**

Insert this row immediately after the `suggestJoints.ts` row (one `<tr>` per module, same as its neighbours):

```html
          <tr><td><code>groupSuggestions.ts</code></td><td>Collapses scene suggestions to one <code>PairGroup</code> per board pair for the sidebar rows; <code>orientationArrow</code> disambiguates the two-orientation kinds; <code>MAX_SCENE_PAIRS</code> caps rows, not suggestions.</td></tr>
```

- [ ] **Step 3: Verify**

Run: `grep -n "groupSuggestions" project-structure.html`
Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add project-structure.html
git commit -m "docs: add groupSuggestions to the structure reference"
```

---

## Done when

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass
- [ ] The scene panel shows one row per pair; the header counts pairs
- [ ] Chips carry arrows only where a kind is duplicated for that pair
- [ ] Hover and apply behave exactly as before, per chip
- [ ] `MAX_SCENE_SUGGESTIONS` no longer exists; `MAX_SCENE_PAIRS` caps rows
- [ ] Notes and `project-structure.html` updated
