# Cabinet restructure Stage G3 — the scene tree mirrors the section tree

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cabinet's openings appear in the scene tree as selectable rows with their parts nested under them, so the tree, the elevation and the 3D model are three views of one structure.

**Architecture:** One pure module maps parts to already-resolved openings; `SceneTree` renders what it returns. The elevation's separate `sectionPick` folds into `Selection` as a third kind, so the app holds one selection instead of two.

**Tech Stack:** TypeScript strict, Vitest + happy-dom + @testing-library/react, React 19, Playwright. No new dependency, no file-format change.

**Spec:** `docs/superpowers/specs/2026-09-03-scene-tree-sections-design.md`
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`

---

## Facts verified against the tree before this plan was written

Do not re-derive these; do not assume anything not listed here.

| Fact | Evidence |
|---|---|
| `SectionOpening` is `{ sectionId, rect, spec, section }` | `sectionInterior.ts:54` |
| `sectionOpenings(root, tree)` sorts by `rect.x0` then `rect.z0` — **geometric order, not tree order** | `sectionInterior.ts:87` |
| `resolveSections(root, opening, thicknessOf)` | `sectionTree.ts:126` |
| `sectionThickness` is **NOT exported** — callers inline `(parentId, index) => thicknessOf(\`division-${parentId}-${index}\`)` | `carcaseRoles.ts:105`, and `SectionElevation.tsx:50` does exactly that |
| `openingRect(p, thicknessOf)` | `carcaseRoles.ts:94` |
| `Selection = {kind:'part'} \| {kind:'component'}` | `types.ts:237` |
| 17 sites discriminate on `.kind`; 16 construct | measured across `App`, `sidebar`, `SceneTree`, `useScene` |
| `useScene:183` derives `selectedId = selection?.kind === 'part' ? selection.id : null` | it **stays** — shortcuts and `suggestJointsFor` need it |
| `viewport` already has `highlightedIds?: readonly PartId[] \| null`, amber `0xfbbf24`, meaning "joint suggestion" | `viewport.tsx:34,556` |
| Selection colour is `0x4fc3f7`; emissive is `0x222244` | `viewport.tsx:556,562` |
| `SceneTree.renderChildren(parentId, depth)` renders child components then child parts | `SceneTree.tsx:201-206` |
| `collapsed` is `useState<Set<ComponentId>>` | `SceneTree.tsx:61` |
| `Sidebar` has `scene.materials` in scope at the `<SceneTree>` call | `sidebar.tsx:242` |
| `regenerateComponents` returns `[...others, ...kept, ...generated]`, `generated = roles.map(...)` | `regenerateComponents.ts:155` |
| **All three presets resolve to exactly ONE opening** | measured; `shelved([], …)` / `legacyToSection([], …)` |
| Role keys: `front-{sectionId}-{leaf}`, `adj-shelf-{sectionId}-{i}`, `fixed-shelf-{sectionId}-{i}`, `division-{parentId}-{index}` | `carcaseRoles.ts` |
| Existing test files to extend | `src/ui/SceneTree.test.tsx`, `src/ui/SectionElevation.test.tsx`, `src/App.test.tsx` |
| Baseline | **1661 unit passed / 10 skipped**, **23 e2e** |

**jest-dom is NOT configured in Vitest.** Use `getAttribute()` / `querySelectorAll()`; `toBeTruthy()` and `toHaveLength()` are plain Vitest and fine. Playwright's `expect` *does* have `toBeVisible` / `toHaveAttribute`.

`react-hooks/set-state-in-effect` is an eslint **error** in this repo.

## File structure

| File | Responsibility |
|---|---|
| Create `src/scene/sectionNodes.ts` | Map parts to already-resolved openings. Nothing else — no resolving, no validation |
| Create `src/scene/sectionNodes.test.ts` | Its tests, built on hand-made openings |
| Modify `src/scene/types.ts` | `Selection` gains the third kind |
| Modify `src/scene/useScene.ts` | 16 discriminating sites; `selectedId` unchanged |
| Modify `src/ui/SceneTree.tsx` | Render section rows; `materials` prop; `collapsed` widens |
| Modify `src/ui/sidebar.tsx` | Pass `materials`; derive the carcase from a section selection |
| Modify `src/ui/SectionElevation.tsx` | Draw the opening number in each cell |
| Modify `src/render/viewport.tsx` | `selectedIds` prop; one changed line |
| Modify `src/App.tsx` | Delete `sectionPick`; derive `selectedSectionId` and `selectedIds` |
| Modify `e2e/carcase.spec.ts` | One e2e that splits first |

---
# Group A — the pure module

## Task 1: `sectionNodes` maps parts to openings

**Files:**

- Create: `src/scene/sectionNodes.ts`
- Test: `src/scene/sectionNodes.test.ts`

This module is handed **already-resolved** openings. It never resolves, never validates, never
touches materials — so its tests build an openings array by hand and need none of that machinery.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/sectionNodes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sectionNodes } from './sectionNodes'
import type { BoardPart, Part, SectionOpening } from './types'

// Only `sectionId` is read. The rest of SectionOpening is carried for other callers, so a fixture
// that filled it in would be asserting against fields this module never looks at.
const opening = (sectionId: string): SectionOpening =>
  ({ sectionId, rect: { x0: 0, x1: 0, z0: 0, z1: 0 }, spec: undefined }) as unknown as SectionOpening

// REAL section ids, uuid-shaped and full of hyphens. A fixture using `sec_a` cannot fail: every
// plausible way of getting the parse wrong still works on an id with no hyphen in it — the same
// trap `panelThickness.test.ts` exists for on the thickness side.
const A = 'sec_e463c3bd-a90f-4009-80b5-303930147885'
const B = 'sec_86d09407-69cb-45a0-b804-16e0c969cd46'

const part = (over: Partial<BoardPart> = {}): Part => ({
  kind: 'board',
  id: 'board_1',
  label: 'Part',
  length: 100,
  width: 100,
  thickness: 18,
  grain: 'length',
  material: '',
  color: '#888',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: 'cmp_1',
  driven: true,
  ...over,
})

describe('sectionNodes', () => {
  it('returns one node per opening, in the order it was handed them', () => {
    const { sections } = sectionNodes([opening(A), opening(B)], [])
    expect(sections.map((s) => s.sectionId)).toEqual([A, B])
  })

  it('puts a front, an adjustable shelf and a fixed shelf on their own opening', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A), opening(B)],
      [
        part({ id: 'board_1', role: `front-${A}-0` }),
        part({ id: 'board_2', role: `front-${A}-1` }),
        part({ id: 'board_3', role: `adj-shelf-${B}-0` }),
        part({ id: 'board_4', role: `fixed-shelf-${B}-2` }),
      ],
    )
    expect(sections[0].parts.map((p) => p.id)).toEqual(['board_1', 'board_2'])
    expect(sections[1].parts.map((p) => p.id)).toEqual(['board_3', 'board_4'])
    expect(carcase).toEqual([])
  })

  // The finding this module turns on. `division-{parentId}-{index}` names the section that was
  // SPLIT, which is by definition an internal node — never a leaf, so never an opening. A divider
  // sits between openings, not in one, which is correct woodworking as well as correct code.
  it('puts a divider in the carcase, never in the opening whose id it names', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A)],
      [part({ id: 'board_9', role: `division-${A}-0` })],
    )
    expect(sections[0].parts).toEqual([])
    expect(carcase.map((p) => p.id)).toEqual(['board_9'])
  })

  it('puts the shell and an unroled part in the carcase', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A)],
      [
        part({ id: 'board_1', role: 'left-side' }),
        part({ id: 'board_2', role: 'toe-kick' }),
        part({ id: 'board_3', role: undefined, driven: false }),
      ],
    )
    expect(sections[0].parts).toEqual([])
    expect(carcase.map((p) => p.id)).toEqual(['board_1', 'board_2', 'board_3'])
  })

  // A section id from a cabinet that has since been rebuilt names nothing here. The tree is rebuilt
  // with fresh ids whenever the v12 divider shim runs, so this is ordinary input, not an error.
  it('puts a part naming an unknown opening in the carcase rather than throwing', () => {
    const { sections, carcase } = sectionNodes(
      [opening(A)],
      [part({ id: 'board_1', role: `front-${B}-0` })],
    )
    expect(sections[0].parts).toEqual([])
    expect(carcase.map((p) => p.id)).toEqual(['board_1'])
  })

  it('returns every part as carcase when there are no openings', () => {
    const { sections, carcase } = sectionNodes([], [part({ role: `front-${A}-0` })])
    expect(sections).toEqual([])
    expect(carcase).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/scene/sectionNodes.test.ts`
Expected: FAIL — `Failed to resolve import "./sectionNodes"`.

- [ ] **Step 3: Implement**

Create `src/scene/sectionNodes.ts`:

```ts
import type { Part, SectionId, SectionOpening } from './types'

// Which opening owns which part, and nothing else. It is handed openings that are ALREADY resolved
// and ordered — it neither resolves nor validates — so a caller must pass what `sectionOpenings`
// returned. That is what makes the tree and the elevation number openings identically: they read
// one array rather than each deriving an order.
//
// Ownership is not inferred; the role keys the generator writes already state it. This is the only
// place a role key is read as structure.

export interface SectionNode {
  sectionId: SectionId
  parts: Part[]
}

// A leading capture of the family, then the section id. `division-` is deliberately absent: it
// names the section that was SPLIT, which is always an internal node and so never an opening.
const OWNED_BY_SECTION = /^(?:front|adj-shelf|fixed-shelf)-(.+)-\d+$/

export function sectionNodes(
  openings: readonly SectionOpening[],
  parts: readonly Part[],
): { sections: SectionNode[]; carcase: Part[] } {
  const sections: SectionNode[] = openings.map((o) => ({ sectionId: o.sectionId, parts: [] }))
  const byId = new Map(sections.map((s) => [s.sectionId, s]))
  const carcase: Part[] = []

  for (const part of parts) {
    const owner = part.role === undefined ? null : (OWNED_BY_SECTION.exec(part.role)?.[1] ?? null)
    const node = owner === null ? undefined : byId.get(owner)
    if (node === undefined) carcase.push(part)
    else node.parts.push(part)
  }

  return { sections, carcase }
}
```

**Why the regex ends `-\d+$`:** every section-owned role carries a trailing index — `front-{id}-0`,
`adj-shelf-{id}-2` — and a section id is a uuid full of hyphens. The `$` is what makes the capture
unambiguous: it forces the match out to the final `-digits`, so `(.+)` and `(.+?)` behave
**identically** here. Verified against real keys: `front-sec_e463c3bd-a90f-4009-80b5-303930147885-0`
captures the whole uuid, while `division-…`, `left-side`, `toe-kick` and `back` do not match at all.

Do **not** swap in a lazy quantifier expecting a behaviour change, and do not mutation-test that
swap: the two are equivalent, so it survives because there is nothing to catch, not because a test
is missing.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/scene/sectionNodes.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation check**

Back up with `cp` to the scratchpad and restore from that copy — **never `git checkout`**. Use
`grep -F` (fixed string, NOT `-E`) after applying and after restoring, and prefer `diff -q` as the
authority, since a mutated string can be a prefix of the restored line.

| # | Mutation | Must fail |
|---|---|---|
| 1 | Add `division` to the regex alternation | *puts a divider in the carcase* |
| 2 | Drop `fixed-shelf` from the alternation | *puts a front, an adjustable shelf and a fixed shelf on their own opening* |
| 3 | drop the `-\d+$` suffix, leaving `-(.+)$` | *…on their own opening* — the owner then captures the trailing index too, so it matches no opening |
| 4 | An unknown owner throws instead of falling to carcase | *puts a part naming an unknown opening in the carcase* |
| 5 | `openings.map` → `[...openings].reverse().map` | *returns one node per opening, in the order it was handed them* |

No survivor may be left unresolved: write the test that kills it, or delete the line it proves dead.

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: **1667 passed | 10 skipped** (1661 + 6).

Commit with `git commit -F -` and a heredoc:

```
feat(scene): sectionNodes maps parts to openings

Ownership is not inferred - the role keys the generator writes already state
it. front-, adj-shelf- and fixed-shelf- name a leaf; division- names the
section that was SPLIT, which is always an internal node and so never an
opening, which is why a divider belongs to the carcase. That is correct
woodworking too: a divider sits between openings, not in one.

Handed already-resolved openings rather than a cabinet, so it does one job and
its tests need neither materials nor a validator.
```

---

# Group B — one selection instead of two

## Task 2: `Selection` gains a section

**Files:**

- Modify: `src/scene/types.ts:237`
- Modify: whatever `tsc` names — expected `src/scene/useScene.ts`, `src/App.tsx`, `src/ui/sidebar.tsx`, `src/ui/SceneTree.tsx`

This task adds the variant and makes the tree compile again. It changes **no behaviour**: every new
branch is a no-op. Behaviour arrives in Tasks 3–7.

- [ ] **Step 1: Add the variant**

In `src/scene/types.ts`, replace line 237:

```ts
export type Selection =
  | { kind: 'part'; id: PartId }
  | { kind: 'component'; id: ComponentId }
  // Carries BOTH ids: the cabinet so a consumer can find the carcase without a second lookup, and
  // the section so the elevation and the tree agree. A section id from one cabinet names nothing in
  // another, which is what lets a stale pick clear itself.
  | { kind: 'section'; cabinetId: ComponentId; sectionId: SectionId }
```

`SectionId` is already imported in this file — check before adding an import.

- [ ] **Step 2: Let the compiler find the work**

Run: `pnpm typecheck`

Expected: errors wherever a switch or ternary is no longer exhaustive. **Fix every one as a no-op**
— a section selection must behave exactly as "nothing relevant is selected" until later tasks say
otherwise. Do not guess at behaviour here.

Specifically, `useScene.ts:183` must stay as it is:

```ts
const selectedId = selection?.kind === 'part' ? selection.id : null
```

A section selection yields `null`, which is correct: the keyboard shortcuts and `suggestJointsFor`
act on parts, and a section is not one.

- [ ] **Step 3: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: **1667 passed | 10 skipped** — unchanged from Task 1, because nothing behaves differently.

If any test fails, a branch was given behaviour rather than made a no-op. Find it and neutralise it.

- [ ] **Step 4: Commit**

```
feat(scene): Selection can name a section

Adds the third kind and makes every existing branch treat it as "nothing
relevant is selected". No behaviour changes; this exists so the compiler can
hand over the list of sites the following tasks have to answer for.

The variant carries both the cabinet id and the section id, so a consumer can
find the carcase without a second lookup and a stale pick clears itself.
```

---

## Task 3: `App` holds one selection

**Files:**

- Modify: `src/App.tsx:136-152`
- Test: `src/App.test.tsx`

`sectionPick` and its derivation go; `selectedSectionId` is computed from `selection` instead.

- [ ] **Step 1: Write the failing test**

Append to `src/App.test.tsx`, following the file's existing `mockUseScene` / `makeDefaultSceneReturn`
harness:

```tsx
it('keeps one selection: picking a section is the selection, not a second piece of state', async () => {
  // The regression this guards: with sectionPick alive, the tree and the elevation could hold
  // different opinions about which opening is picked. There is now one place to look.
  const carcase = {
    kind: 'carcase' as const,
    id: 'cmp_1',
    label: 'Base 600',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ' as const,
    visible: true,
    params: CARCASE_PRESETS[0].params,
  }
  mockUseScene.mockReturnValue({
    ...makeDefaultSceneReturn(),
    scene: { parts: [], materials: PRESET_MATERIALS, hardware: [], joints: [], components: [carcase] },
    selection: { kind: 'section', cabinetId: 'cmp_1', sectionId: 'sec_x' },
  })
  render(<App />)
  // The cabinet stays open: a section selection names its own cabinet.
  expect(screen.getByRole('tablist')).toBeTruthy()
})
```

Add `CARCASE_PRESETS` and `PRESET_MATERIALS` to the file's imports from `./scene/carcasePresets` if
they are not already there.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/App.test.tsx`
Expected: FAIL — `selectedCarcase` does not yet consider a section selection, so no editor mounts and
there is no `tablist`.

- [ ] **Step 3: Replace the state with a derivation**

Delete the `sectionPick` state and its `selectedSectionId` block at `src/App.tsx:136-143`, and
replace with:

```tsx
// One selection, not two. This used to be `sectionPick` — a second piece of state the elevation
// wrote and the panel read — which meant two things could disagree about which opening was picked.
// The cabinet-id guard is what `sectionPick` used it for: a section id from another cabinet names
// nothing here, and every `editSection` operation treats an unknown id as a no-op.
const selectedSectionId =
  selection?.kind === 'section' && selection.cabinetId === selectedCarcase?.id
    ? selection.sectionId
    : null
```

Replace `onSelectSection`'s body at `src/App.tsx:144-152`:

```tsx
const onSelectSection = useCallback(
  (sectionId: SectionId | null) => {
    const cabinetId = selectedCarcase?.id
    if (cabinetId === undefined) return
    onSelect(sectionId === null ? { kind: 'component', id: cabinetId } : { kind: 'section', cabinetId, sectionId })
  },
  [selectedCarcase, onSelect],
)
```

**Deselecting an opening selects the cabinet, not nothing.** Clicking the elevation's background
means "no opening", not "no cabinet" — returning `null` would close the editor the click was made in,
which is the Stage G2 Task 9 bug in a new place.

Add the third case to `selectedCarcase`'s memo so a section selection keeps its own cabinet open:

```tsx
  if (selection?.kind === 'section') {
    const c = scene.components.find((x) => x.id === selection.cabinetId)
    if (c?.kind === 'carcase') return c
  }
```

Place it beside the existing `selection?.kind === 'component'` branch, before the open-cabinet
fallback.

- [ ] **Step 3b: Clear a section selection whose cabinet is deleted**

Found during Task 2's spec review, deferred to here because it is a behaviour change and Task 2's
success criterion was an unchanged test count.

`useScene.ts:1270` clears a dangling **component** selection when components are removed:

```ts
setSelection((prev) => (prev?.kind === 'component' && doomed.has(prev.id) ? null : prev))
```

Its own comment says why — *"a selection pointing at a component that is gone is a dangling
reference the panel would try to render"* — and that sentence is now true of only one of the two
kinds that can dangle. A `section` selection whose `cabinetId` is in `doomed` survives the delete.

The Step 3 guard covers the **render** completely: `selectedCarcase` finds no component, falls
through to the open-cabinet fallback, which also finds nothing, so `selectedSectionId` is `null` and
no panel mounts. What it does not fix is the **state** — and it leaves Task 4's opening rows resting
on an unwritten precondition that a dangling selection never names a row that exists.

Widen the clear so the comment above it is true of every kind that can dangle:

```ts
setSelection((prev) =>
  prev === null
    ? prev
    : prev.kind === 'component' && doomed.has(prev.id)
      ? null
      : prev.kind === 'section' && doomed.has(prev.cabinetId)
        ? null
        : prev,
)
```

`doomed` is a `Set<ComponentId>` (`useScene.ts:1231`) and `cabinetId` is a `ComponentId`, so it is
the right set to ask.

This needs its own test in `useScene.test.ts`: select a section in a cabinet, remove that cabinet,
assert the selection is `null`. Then **check what the component case actually does on undo and make
the section case match it** — do not assume; run it. The two kinds differing there would be an
unstated behavioural difference, which is the thing this step exists to remove.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mutation check**

| # | Mutation | Must fail |
|---|---|---|
| 1 | Drop the `selection.cabinetId === selectedCarcase?.id` guard | an existing elevation/panel test — if none fails, add one selecting a section id from another cabinet |
| 2 | `onSelectSection(null)` emits `null` instead of the component | *keeps one selection…* — the editor closes |
| 3 | Drop the `kind === 'section'` case from `selectedCarcase` | *keeps one selection…* |

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```
refactor(ui): one selection, not two

sectionPick was a second piece of state that the elevation wrote and the panel
read, so the two could hold different opinions about which opening was picked.
selectedSectionId is now derived from the selection, keeping the same
cabinet-id guard that made a stale pick clear itself.

Deselecting an opening selects its cabinet rather than nothing: clicking the
elevation's background means "no opening", and returning null would close the
editor the click was made in.
```

---

# Group C — the three surfaces

## Task 4: the tree renders opening rows

**Files:**

- Modify: `src/ui/SceneTree.tsx`
- Modify: `src/ui/sidebar.tsx:222-232`
- Test: `src/ui/SceneTree.test.tsx`

> **Fixture hazard, found in Task 3's review.** Two cabinets added from the *same preset* share
> every section id — `CARCASE_PRESETS` builds each tree once at module evaluation and
> `onAddCarcase` assigns `params: preset.params` by reference. Opening rows are tagged
> `node-sec_*`, so two expanded Base 600s put duplicate `data-testid`s in the DOM and
> `getByTestId` throws on multiple matches. Use **one** cabinet in this task's fixtures, or
> cabinets from different presets. Fixing the collision is its own change (see the notes
> file) — do not fix it here.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/SceneTree.test.tsx`, matching whatever render helper that file already uses. **A
preset has only one opening**, so a multi-opening case must build a split tree:

```tsx
// legacyToSection([0.5], 0, width, thickness) makes two bays with one divider between them.
// No preset does — all three resolve to a single opening — so a fixture taken from CARCASE_PRESETS
// alone would pass whether or not the grouping worked.
const twoBay = { ...CARCASE_PRESETS[0].params, section: legacyToSection([0.5], 0, 600, 18) }

it('nests a cabinet’s parts under the opening that owns them', () => {
  const cabinet = { /* the carcase fixture this file already builds, with params: twoBay */ }
  // …render SceneTree with that component, its parts, and materials={PRESET_MATERIALS}…
  const rows = screen.getAllByTestId(/^node-sec_/)
  expect(rows).toHaveLength(2)
})

it('puts a divider among the carcase parts, not inside an opening', () => {
  // …render as above…
  // The divider's row must be a sibling of Left Side, not a descendant of either opening's subtree.
  const divider = screen.getByTestId(/* the division part's node id */)
  expect(divider.closest('[data-testid^="subtree-sec_"]')).toBeNull()
})

it('selects the opening when its row is clicked', async () => {
  const onSelect = vi.fn()
  // …render as above with onSelect…
  await userEvent.click(screen.getAllByTestId(/^node-sec_/)[0])
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'section', cabinetId: 'cmp_1' }),
  )
})
```

Import `legacyToSection` from `../scene/migrateSections` and `CARCASE_PRESETS` / `PRESET_MATERIALS`
from `../scene/carcasePresets`.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/SceneTree.test.tsx`
Expected: FAIL — no `node-sec_*` rows exist, and `materials` is not a prop.

- [ ] **Step 3: Give `SceneTree` what it needs to resolve**

Add to `SceneTreeProps`:

```ts
  materials: Record<string, MaterialDef>
```

and pass it at `src/ui/sidebar.tsx:222`, where `scene.materials` is already in scope:

```tsx
              materials={scene.materials}
```

- [ ] **Step 4: Widen the collapse set and render the rows**

`collapsed` currently holds component ids only; a section row collapses the same way. Change
`SceneTree.tsx:61` and `toggleCollapsed`'s parameter:

```tsx
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapsed = (id: string) =>
```

Section and component ids cannot collide — they are `sec_`- and `cmp_`-prefixed.

Add above `renderChildren`:

```tsx
  // A carcase's parts are grouped by the opening that owns them; everything else renders flat.
  // `openingRect` reads thicknesses through a resolver that is fatal by design, so a cabinet naming
  // a material the scene cannot resolve would throw here — an unbuildable one falls back to the
  // flat tree that existed before this rather than taking the whole tree down with it.
  const carcaseGroups = (component: CarcaseComponent, own: Part[]) => {
    const thicknessOf = roleThicknessFor(component.params, materials, overridesOf(own, component.id))
    if (validateCarcaseParams(component.params, thicknessOf).length > 0) return null
    const tree = resolveSections(
      component.params.section,
      openingRect(component.params, thicknessOf),
      (parentId, index) => thicknessOf(`division-${parentId}-${index}`),
    )
    return sectionNodes(sectionOpenings(component.params.section, tree), own)
  }
```

Imports to add: `sectionNodes` **and the `SectionNode` type** from `../scene/sectionNodes`
(`renderSection` below is typed with it); `sectionOpenings` from `../scene/sectionInterior`;
`resolveSections` from `../scene/sectionTree`; `openingRect` and `validateCarcaseParams` from
`../scene/carcaseRoles`; `overridesOf` and `roleThicknessFor` from `../scene/resolveThickness`; and
the `CarcaseComponent` and `MaterialDef` types from `../scene/types`. `Part`, `ComponentId` and `cn`
are already imported in this file — check before adding them again, since `noUnusedLocals` makes a
duplicate or unused import a `tsc` error.

Then in `renderComponent`, replace `{open && renderChildren(component.id, depth + 1)}` with:

```tsx
        {open &&
          (component.kind === 'carcase'
            ? renderCarcaseChildren(component, depth + 1)
            : renderChildren(component.id, depth + 1))}
```

and add:

```tsx
  const renderCarcaseChildren = (component: CarcaseComponent, depth: number) => {
    const own = parts.filter((p) => p.parentId === component.id)
    const groups = carcaseGroups(component, own)
    if (groups === null) return renderChildren(component.id, depth)
    return (
      <>
        {components.filter((c) => c.parentId === component.id).map((c) => renderComponent(c, depth))}
        {groups.sections.map((node, i) => renderSection(component, node, i, depth))}
        {groups.carcase.map((p) => renderPart(p, depth))}
      </>
    )
  }

  const renderSection = (
    component: CarcaseComponent,
    node: SectionNode,
    index: number,
    depth: number,
  ) => {
    const open = !collapsed.has(node.sectionId)
    const isSelected =
      selection?.kind === 'section' && selection.sectionId === node.sectionId
    return (
      <div key={node.sectionId} data-testid={`subtree-${node.sectionId}`}>
        <div
          data-testid={`node-${node.sectionId}`}
          data-selected={String(isSelected)}
          className={cn(ROW_CLASS, isSelected ? 'bg-secondary' : 'hover:bg-secondary/50')}
          style={{ paddingLeft: ROW_PADDING + depth * INDENT }}
          onClick={() =>
            onSelect({ kind: 'section', cabinetId: component.id, sectionId: node.sectionId })
          }
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${open ? 'Collapse' : 'Expand'} Opening ${index + 1}`}
            className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed(node.sectionId)
            }}
          >
            {open ? '▾' : '▸'}
          </Button>
          <span className="text-xs">▤</span>
          <span className={cn(LABEL_CLASS, 'text-foreground')}>Opening {index + 1}</span>
        </div>
        {open && node.parts.map((p) => renderPart(p, depth + 1))}
      </div>
    )
  }
```

No visibility, duplicate or remove control on the row — selection only.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/ui/SceneTree.test.tsx`
Expected: PASS.

- [ ] **Step 6: Mutation check**

| # | Mutation | Must fail |
|---|---|---|
| 1 | `renderCarcaseChildren` always returns `renderChildren(...)` | *nests a cabinet's parts under the opening that owns them* |
| 2 | Render `groups.carcase` inside the first section's subtree | *puts a divider among the carcase parts* |
| 3 | The row's `onSelect` emits `{kind:'component'}` | *selects the opening when its row is clicked* |
| 4 | Drop the `validateCarcaseParams` guard | nothing yet — **add the test**: an unbuildable cabinet still renders its parts flat |

Mutation 4 will survive without a test, and that is the load-bearing guard. Write it.

- [ ] **Step 7: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```
feat(ui): the scene tree groups a cabinet's parts by opening

A carcase expands into its openings, each carrying the fronts and shelves that
name it, with the shell and any divider below them. A divider is not inside an
opening: division- names the section that was split, which is always internal.

Resolving can throw for a cabinet naming a material the scene cannot resolve -
roleThicknessFor's resolver is fatal by design and openingRect is where it
surfaces - so an unbuildable one falls back to the flat tree that existed
before rather than taking the whole tree down with it. The guard also catches
merely invalid geometry, which does not throw.
```

---

## Task 5: the sidebar follows a section selection

**Files:**

- Modify: `src/ui/sidebar.tsx:117`
- Test: `src/ui/sidebar.test.tsx`

Without this, selecting an opening unmounts `CarcasePanel` and its shelving and front controls
vanish at the moment you pick the opening they belong to.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/sidebar.test.tsx`, using its existing `props()` builder:

```tsx
it('shows the carcase panel for a section selection, so the opening keeps its controls', () => {
  render(
    <Sidebar
      {...props({
        selection: { kind: 'section', cabinetId: 'cmp_1', sectionId: 'sec_x' },
      })}
    />,
  )
  expect(screen.getByLabelText('Dividers')).toBeTruthy()
})
```

The `props()` builder must already supply a carcase component with id `cmp_1`; if it does not, add
one rather than changing what other tests see.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Dividers`.

- [ ] **Step 3: Derive the carcase from either kind**

Replace `src/ui/sidebar.tsx:117`:

```tsx
  // A section belongs to a cabinet, so picking an opening must not unmount the panel that holds its
  // shelving and front controls. Resolved through `cabinetId` — the obligation `Selection` states.
  const hostComponent =
    selection?.kind === 'section'
      ? (scene.components.find((c) => c.id === selection.cabinetId) ?? null)
      : selectedComponent
  const selectedCarcase = hostComponent?.kind === 'carcase' ? hostComponent : null
```

**The narrowing has to happen outside the `find`.** This plan's first draft wrote
`components.find((c) => c.id === carcaseId && c.kind === 'carcase') ?? null`, which does not
compile: `Array.prototype.find` with a plain boolean lambda is not a type guard, so `c.kind ===
'carcase'` inside it narrows nothing and the result is `Component | null` where `CarcasePanel`
requires `CarcaseComponent`. The error surfaces at the `<CarcasePanel component={selectedCarcase}>`
call, not at the `find`. Narrowing a single-variable discriminant afterwards is also the minimal
edit — it is what the line being replaced already did. (The array in scope is `scene.components`.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mutation check**

| # | Mutation | Must fail |
|---|---|---|
| 1 | Drop the `kind === 'section'` arm | *shows the carcase panel for a section selection* |
| 2 | `selection.cabinetId` → `selection.sectionId` | same test — a section id is not a component id |

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```
fix(ui): a section selection keeps its cabinet's panel on screen

The sidebar derived its carcase from a component selection alone, so choosing
an opening would have unmounted CarcasePanel and taken that opening's shelving
and front controls with it. Same shape as the Stage G2 Task 9 bug: a selection
change destroying the surface it was made in.
```

---

## Task 6: a selected opening lights up in 3D

**Files:**

- Modify: `src/render/viewport.tsx:34,75,556`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Read this before touching the viewport.** It already has `highlightedIds?: readonly PartId[] | null`
(line 34), painted amber `0xfbbf24` at line 556, meaning "a joint is suggested here". That is a
*different* meaning from selection, which is blue `0x4fc3f7`. This task adds a **third** prop rather
than reusing either.

`selectedId` **stays exactly as it is** — `useScene.ts:183` derives it, and the keyboard shortcuts
and `suggestJointsFor` both need it. Converting it to a set would leave the app carrying a scalar
*and* a set for one idea.

- [ ] **Step 1: Write the failing test**

Append to `src/App.test.tsx`. Mock the viewport to capture its props, following the pattern
`App.test.tsx` already uses for `DrawingViewer`:

```tsx
it('highlights every part of a selected opening', () => {
  // MUST be a two-bay cabinet. **All three presets resolve to exactly ONE opening**, and against a
  // single opening "this opening's parts" and "every opening's parts" are the same set — so a
  // `sections.flatMap` mutation survives a preset fixture entirely. Build the tree the way
  // `SceneTree.test.tsx` does: `seedInteriors(legacyToSection([0.5], 0, 600, 18), defaultInterior(2))`.
  // Note the bays then own only `adj-shelf-` boards: `front` comes from the separate `doored()`
  // wrapper in `carcasePresets.ts`, not from `legacyToSection`, so wrap it too if you want the
  // fixture to exercise more than one arm of the ownership regex.
  const parts = [ /* built from the file's part fixture over that two-bay tree */ ]
  mockUseScene.mockReturnValue({
    ...makeDefaultSceneReturn(),
    scene: { parts, materials: PRESET_MATERIALS, hardware: [], joints: [], components: [carcase] },
    selection: { kind: 'section', cabinetId: 'cmp_1', sectionId: /* that section's id */ },
  })
  render(<App />)
  // The captured Viewport props: both doors, not the side, and not one id.
  expect(viewportProps.selectedIds).toHaveLength(2)
  expect(viewportProps.selectedIds).not.toContain('board_side')
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/App.test.tsx`
Expected: FAIL — `selectedIds` is `undefined`.

- [ ] **Step 3: Add the prop**

In `src/render/viewport.tsx`, add to the props interface beside `highlightedIds` (line 34):

```ts
  // Parts that are selected without being THE selected part — the members of a selected opening.
  // Painted in the selection colour, not `highlightedIds`' amber, which means "a joint is suggested
  // here" and would give one colour two meanings.
  selectedIds?: readonly PartId[]
```

Destructure it at line 75 alongside `highlightedIds`, and change line 556:

```ts
        id === selectedId || selectedIds?.includes(id)
          ? 0x4fc3f7
          : highlightedIds?.includes(id)
            ? 0xfbbf24
            : 0x1a1a1d,
```

Add `selectedIds` to that effect's dependency array at line 565.

Leave line 562 (`emissive`) and the flash path at line 305 alone: both key off the single selected
part, and a section has no single part to flash.

- [ ] **Step 4: Compute it in `App`**

Beside `highlightedIds` (around `src/App.tsx:182`):

> **Step 0 first: extract, do not paste.** This plan originally spelled the whole resolve chain out
> again here. Task 4 put the identical chain in `SceneTree.tsx` as `carcaseGroups`, and its review
> made the case that two hand-copied chains are exactly how the tree and the 3D highlight come to
> disagree about an opening's membership — a bug with no visible cause. The comment below ("so the
> two cannot disagree") is only true if there is one chain.
>
> So **Step 0** is a pure move, no behaviour change: create `src/scene/carcaseOpenings.ts` with
>
> ```ts
> export function carcaseOpenings(
>   component: CarcaseComponent,
>   own: Part[],
>   materials: Record<string, MaterialDef>,
> ): { sections: SectionNode[]; carcase: Part[] } | null
> ```
>
> carrying `carcaseGroups`' body verbatim — it captures nothing from `SceneTree`'s body except
> `materials`, so the move is mechanical. Point `SceneTree.tsx` at it, confirm the suite is
> unchanged at that point, and commit the move on its own before writing any of Task 6.
>
> It does **not** belong in `sectionNodes.ts`: that module's header promises it "neither resolves
> nor validates", and a resolver there would contradict its own contract.
>
> While moving it, take the fourth copy of the division lambda with it —
> `(parentId, index) => thicknessOf(`division-${parentId}-${index}`)` now appears in
> `SectionElevation.tsx`, `SceneTree.tsx`, `CarcasePanel.tsx` (twice) and `assembly.ts`, while
> `carcaseRoles.ts:105` holds a private `sectionThickness()` that *is* this function. Exporting it
> costs one keyword and removes the copy from the extracted module for free. Leave the other call
> sites alone — they are not this task's.

```tsx
// The opening's own parts. Resolved through the same `carcaseOpenings` the scene tree uses, so the
// two cannot disagree about which parts an opening owns.
const selectedIds = useMemo(() => {
  if (selectedCarcase === null || selectedSectionId === null) return []
  const own = scene.parts.filter((p) => p.parentId === selectedCarcase.id)
  const groups = carcaseOpenings(selectedCarcase, own, scene.materials)
  return (
    groups?.sections.find((s) => s.sectionId === selectedSectionId)?.parts.map((p) => p.id) ?? []
  )
}, [selectedCarcase, selectedSectionId, scene.parts, scene.materials])
```

**Read `selectedSectionId`, never `selection.sectionId`.** This plan's first draft read the raw
selection, which lights up the wrong cabinet's opening — measured, not theorised. `selectedCarcase`
falls back to the *previously open* cabinet when a section selection names a cabinet the scene no
longer holds, and section ids are shared by every cabinet built from one preset (`params:
preset.params` is assigned by reference), so the `find` then matches the same-numbered opening of
the cabinet on screen. `selectedSectionId` already carries that guard, so reading it states the rule
once. The defective version compiles and lints — `tsc` will not save you.

An unbuildable cabinet returns `null` from `carcaseOpenings`, so the `?? []` covers the guard case
that used to be its own early return — mutation 3 in the table below still applies, now against the
extracted module.

and pass it at the `<Viewport>` call beside `highlightedIds={highlightedIds}`:

```tsx
            selectedIds={selectedIds}
```

**Imports `App.tsx` needs for that block**, several of which it does not have today: `sectionNodes`
from `./scene/sectionNodes`, `sectionOpenings` from `./scene/sectionInterior`, `resolveSections`
from `./scene/sectionTree`, and `openingRect` / `validateCarcaseParams` from `./scene/carcaseRoles`.
`roleThicknessFor` and `overridesOf` are likely already imported for `cabinetParts` — check first,
because `noUnusedLocals` makes a duplicate import a `tsc` error.

**This is the second place that resolves a cabinet's openings**, the first being `SceneTree`. They
must stay identical: both call `sectionOpenings` on a tree resolved with the same overrides, or the
tree and the 3D highlight will disagree about which parts an opening owns. If a third caller appears,
extract the resolve rather than copying it a third time — that duplication is what cost Stage G2
three separate rules.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Mutation check**

| # | Mutation | Must fail |
|---|---|---|
| 1 | `selectedIds` returns every part of the cabinet | *highlights every part of a selected opening* — the side would be included |
| 1b | `sections.flatMap((s) => s.parts)` — every opening's parts | the same test, **and only against a two-bay fixture**. This is the mutation mutation 1 does not cover, and the reason the fixture above cannot be a preset |
| 2 | Drops the `selectedIds?.includes(id)` arm in `viewport.tsx` | nothing in Vitest — see below |
| 3 | Drop the `validateCarcaseParams` guard (now in `carcaseOpenings.ts`) | an unbuildable cabinet yields `[]` rather than throwing — plus five pre-existing sidebar and SceneTree cases |
| 4 | Read `selection.sectionId` instead of `selectedSectionId` | *ignores a section selection whose cabinet the scene no longer holds* |

Mutation 2 is the honest limit of this task's **unit** testing, and it is structural rather than an
oversight: there is no `viewport.test.tsx` at all, and every unit consumer mocks the viewport, so
nothing in Vitest instantiates a material. Assert the prop; do not invent an assertion that appears
to cover the render.

But **do not write that the colour is "covered only by eye"** — this plan's first draft did, and it
is false. `e2e/suggestion-highlight.spec.ts` already pixel-counts the *sibling* prop's amber
(`0xfbbf24`) off a real Playwright screenshot of the live WebGL canvas, with calibrated thresholds.
The same pattern applies to selection blue `0x4fc3f7` on a split cabinet in about forty lines. That
belongs in **Task 8**, which is where this plan now carries it.

- [ ] **Step 7: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```
feat(render): a selected opening highlights its parts

Adds selectedIds beside the existing highlightedIds rather than reusing it:
highlightedIds is amber and means "a joint is suggested here", so a section's
parts would have borrowed a colour that already means something else. They now
read as selected, in the colour selection already uses.

selectedId is untouched. useScene derives it and the keyboard shortcuts and
suggestJointsFor both need it, so turning it into a set would leave a scalar
and a set for one idea.
```

---

## Task 7: the elevation numbers its cells

**Files:**

- Modify: `src/ui/SectionElevation.tsx`
- Test: `src/ui/SectionElevation.test.tsx`

The tree says "Opening 2". Nothing in the app names an opening today, so without this the name
cannot be located — and a name nobody can find is worse than no name.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/SectionElevation.test.tsx`:

```tsx
// The tree and the elevation must agree, and both take the number from the same `sectionOpenings`
// array — so this pins the ORDER, not a constant. `sectionOpenings` sorts by rect.x0 then rect.z0,
// which is why a two-bay cabinet reads 1 on the left and 2 on the right regardless of how the tree
// was built.
it('numbers each opening in the order sectionOpenings returns them', () => {
  const p = { ...base, section: legacyToSection([0.5], 0, 600, 18) }
  draw(p)
  const cells = screen.getAllByTestId(/^section-cell-/)
  expect(cells).toHaveLength(2)
  const numbers = [...screen.getByRole('img').querySelectorAll('text')].map((t) => t.textContent)
  expect(numbers).toEqual(['1', '2'])
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/SectionElevation.test.tsx`
Expected: FAIL — the SVG contains no `<text>` at all.

- [ ] **Step 3: Draw the number**

In the `sectionOpenings(...).map((o) => {` block, change the callback signature to `(o, i)` and add a
label after the existing `<rect>`, inside the same fragment. The rect currently returns bare — wrap
it:

```tsx
        return (
          <g key={o.sectionId}>
            {/* …the existing <rect> …, with its `key` removed since the <g> now carries it… */}
            <text
              x={x + (o.rect.x1 - o.rect.x0) / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground pointer-events-none"
              fontSize={Math.min(o.rect.x1 - o.rect.x0, height) / 6}
            >
              {i + 1}
            </text>
          </g>
        )
```

`pointer-events-none` matters: the number must not swallow the click that selects the cell.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/SectionElevation.test.tsx`
Expected: PASS — including the file's existing click tests, which would break if the text
intercepted pointer events.

- [ ] **Step 5: Mutation check**

| # | Mutation | Must fail |
|---|---|---|
| 1 | `{i + 1}` → `{i}` | *numbers each opening in the order…* |
| 2 | Reverse the openings before mapping | same test |
| 3 | Remove `pointer-events-none` | an existing "clicking a cell selects it" test — **if none fails, happy-dom is not modelling pointer interception**; say so rather than assuming it is covered |

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```
feat(ui): the elevation numbers its openings

The tree names openings; nothing in the app did before, so without a number in
the drawing the name could not be located. Both take it from the same
sectionOpenings array, which sorts geometrically - bottom-left first, reading
up then across - so the two cannot disagree and neither depends on how the
section tree happens to be written.
```

---

# Group D — close the stage

## Task 8: the e2e

**Files:**

- Modify: `e2e/carcase.spec.ts`

**No preset has two openings**, so this must split before it can click "Opening 2". An e2e that
skipped the split would assert against a one-opening cabinet and pass whether or not the grouping
worked — which is the failure mode Stage G2 Task 15 found in its own End-view test.

- [ ] **Step 0: the highlight colour, which nothing else in this plan covers**

Added after Task 6's review. Task 6 can assert only the `selectedIds` prop `App` hands the viewport:
there is no `viewport.test.tsx`, every unit consumer mocks the viewport, and happy-dom has no WebGL,
so dropping the `selectedIds?.includes(id)` arm passes the whole Vitest suite. That is a real gap,
and it is closable here rather than accepted — `e2e/suggestion-highlight.spec.ts` already
pixel-counts the sibling `highlightedIds` prop's amber `0xfbbf24` off a live WebGL canvas, with
calibrated thresholds and an off/on/off poll.

Follow that file's shape for selection blue `0x4fc3f7`: split the cabinet, screenshot with no
selection, select an opening, screenshot again, and require the blue pixel count to rise and then
fall when the selection moves off. Read its comments first — it records why a single-colour
threshold had to sit in a narrow gap, and that reasoning transfers.

Two things to hold to. **Count the colour, do not diff the frame:** a whole-frame `changedFraction`
would pass on any repaint, including one that recoloured the wrong parts. And **prove the count can
fall as well as rise** — a monotonic assertion passes against a viewport that highlights
everything, which is exactly mutation 1 of Task 6.

- [ ] **Step 1: Write the test**

Append to `e2e/carcase.spec.ts`, reusing `OCCT_READY_TIMEOUT` which that file already defines:

```ts
test('an opening selected in the tree is the opening the elevation shows', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()

  // One opening to start with — every preset has exactly one. Split it so there are two to tell
  // apart; without this the test cannot distinguish grouping from not grouping.
  await page.getByTestId(/^section-cell-/).first().click()
  await page.getByRole('button', { name: /Split down/i }).click()
  await expect(page.getByTestId(/^section-cell-/)).toHaveCount(2)

  // The tree now carries two opening rows. Click the second.
  const rows = page.getByTestId(/^node-sec_/)
  await expect(rows).toHaveCount(2, { timeout: OCCT_READY_TIMEOUT })
  await rows.nth(1).click()

  // The elevation shows the same one selected, by id rather than by position.
  const id = await rows.nth(1).getAttribute('data-testid')
  const sectionId = id!.replace('node-', '')
  await expect(page.getByTestId(`section-cell-${sectionId}`)).toHaveAttribute(
    'data-selected',
    'true',
  )
  // …and the cabinet editor is still open: selecting a part or a section must not close it.
  await expect(page.getByRole('tablist')).toBeVisible()
})
```

Check `SectionToolbar`'s real button label before running — the plan assumes "Split down". If it
differs, use the real one; do not loosen the selector to a substring that could match two buttons.

- [ ] **Step 2: Run it**

Run:
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test e2e/carcase.spec.ts`

**Never run `playwright install`.** Chromium is pre-installed and the config reads that env var.

Expected: 7 passed in that file, 24 across the suite.

- [ ] **Step 3: Prove it guards something**

Mutate `SceneTree`'s section row to emit `{kind:'component', id: component.id}` instead of the
section selection, re-run, and confirm this test fails. Restore with `cp` from the backup and verify
with `diff -q`. A green e2e that passes under that mutation is testing the screen, not the rule.

- [ ] **Step 4: Commit**

```
test(e2e): an opening picked in the tree is the one the elevation shows

Splits first, because every preset resolves to exactly one opening - a version
of this test that skipped the split would pass whether or not the grouping
worked. Reads the section id off the tree row and asserts on that cell by id
rather than by position, so it cannot pass by counting.
```

---

## Task 9: documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `project-structure.html`
- Modify: `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
- Modify: `docs/superpowers/specs/2026-09-03-scene-tree-sections-design.md` (status line)

- [ ] **Step 1: `CLAUDE.md` — the tree**

Under `src/scene/`, beside the other section modules:

```
│   ├── sectionNodes.ts  sectionNodes(openings, parts) — which opening owns which part, read
│   │                    off the role keys that already say so. The only place a role key is
│   │                    parsed as structure
```

- [ ] **Step 2: `CLAUDE.md` — two invariants**

```markdown
- **An opening owns a part when the part's role says so, and a divider owns nothing.** `front-`,
  `adj-shelf-` and `fixed-shelf-` name a leaf section; `division-{parentId}-{index}` names the
  section that was *split*, which is always an internal node and so never an opening — so a divider
  belongs to the carcase, between openings rather than in one. `sectionNodes.ts` is the only place a
  role key is read as structure; a second parser is how the tree and the generator come to disagree
  about which door belongs to which door opening.
- **Openings are numbered in geometric order, and one array carries it.** `sectionOpenings` sorts by
  `rect.x0` then `rect.z0` — bottom-left first, reading up then across — so numbering cannot be
  recovered from the section tree's topology, and a cabinet built two ways numbers its openings the
  same. The scene tree and the elevation both take the number from the index of that one array,
  never from a walk of their own.
```

- [ ] **Step 3: The architecture page**

```bash
node scripts/update-structure-html.mjs
```

Then by hand: add `sectionNodes.ts` to the `src/scene/` table; update the measured counts sentence
at the `AUTOGEN:test-file-count` paragraph with the real figures from Step 5; and move the roadmap
row *The scene tree mirrors the section tree* from **Next** to **Done**, putting the next roadmap
item in its place.

- [ ] **Step 4: Notes**

Append a `### 2026-09-03 — Stage G3 closed` entry recording: the measured unit and e2e counts; that
all three presets have one opening so every multi-opening test builds a split tree; that the divider
rule came from `sectionOpenings` returning only leaves; and any mutation that survived with what was
done about it.

Set the spec's `**Status:**` line to `**Complete.**` with the same counts.

- [ ] **Step 5: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`

Record the real numbers in the notes and the architecture page — not the ones this plan predicts.

---

## Acceptance

- [ ] Every preset shows exactly one opening row, carrying its fronts and shelves
- [ ] A Tall 600's opening holds **both** leaves of its door pair — two fronts, one opening
- [ ] A cabinet split into three bays shows three opening rows, numbered 1–3 left to right
- [ ] A divider appears among the carcase parts, not inside an opening
- [ ] Clicking an opening in the tree selects the cell the elevation shows selected, and the reverse
- [ ] Selecting an opening highlights its parts in 3D and leaves the cabinet editor open
- [ ] The sidebar shows that opening's shelving and front controls
- [ ] A cabinet mid-keystroke invalid still renders its parts, flat
- [ ] `sectionPick` no longer exists in `App.tsx`
- [ ] `FILE_FORMAT_VERSION` is still 17
- [ ] Every mutation in every task was run, and no survivor was left unresolved
