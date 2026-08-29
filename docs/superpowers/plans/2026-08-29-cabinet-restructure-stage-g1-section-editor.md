# Cabinet restructure Stage G1 — the cabinet editor and the section elevation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a cabinet turns the main pane into its editor, with a **Section** tab that draws the cabinet's elevation and lets a section be clicked, split, resized and given a front — and a **3D** tab that is the viewport it replaced.

**Architecture:** A new pure module owns every change to the tree's *shape*, beside the two that already own its contents. The editor is a React-rendered SVG over `resolveSections`' rectangles — the first interactive SVG in the codebase. The selected section id lifts to `App`, so the elevation and the sidebar panel are two views of one selection.

**Tech Stack:** TypeScript strict, Vitest, React 19, hand-rolled SVG (no new dependency).

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md` (§ UI — The cabinet editor)
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Preceded by:** Stages A–F

---

## Scope, decided with the user

The spec's Stage G is three independent subsystems. This plan is the first:

| | | |
|---|---|---|
| **G1 — this plan** | the tab frame, the Section elevation editor, the 3D tab | |
| **G2 — later** | Front / Top / End projections | `buildDrawingSheets` must generalise from one part to a whole cabinet, which is its own subsystem |
| **G3 — later** | the scene tree mirroring the section tree | presentation only; worth doing once the editor exists and the grouping can be judged rather than guessed |

The editor lives in the **main pane**, replacing the viewport while a cabinet is selected. That is
what the spec's own tab list implies — **3D** is one of the subtabs, so the editor must own the pane
the viewport is in — and the sidebar is 240 px, which cannot hold the elevation of a 600 mm cabinet.

## Three findings, verified against the code

### 1. The Viewport must never unmount

`viewport.tsx:199` creates the `WebGLRenderer`, the scene, the camera and the controls in an effect
with an empty dependency array — commented "Scene setup — runs once". Every mesh and every uploaded
`BufferGeometry` hangs off that scene.

So the editor must **not** be rendered *instead of* `<Viewport>`. Selecting a cabinet would tear the
renderer down and rebuild it, re-uploading every geometry; switching to the 3D tab would do it again;
and the camera would survive only because `cameraStateRef` happens to persist it.

Hide it with CSS instead — `style={{ display: tab === '3d' ? 'flex' : 'none' }}` on its wrapper — so
the canvas, its camera and its geometry cache all survive a tab change untouched. **A hidden canvas
still renders**, so the animation loop keeps running; that is acceptable here (it is what the app
already does behind the BOM modal) and is worth a note rather than a fix in this plan.

### 2. `App` does not know a carcase is selected

`selectedCarcase` is derived inside `sidebar.tsx:112`, from a `selection` prop `App` passes down.
With the editor in the main pane, `App` needs the same answer, so that derivation lifts: `App`
computes it once and passes it to both. Deriving it twice is how the sidebar and the editor would
come to disagree about which cabinet is open.

### 3. Nothing can change the tree's *shape* yet

`sectionTree.ts` resolves and validates; `sectionInterior.ts` writes `interior` and `front`. Splitting
a section, collapsing a split and resizing a child do not exist anywhere — the only thing that has
ever built a tree is `legacyToSection`, which builds one from scratch.

They belong in a new pure module beside the others. The editor must not do tree surgery inline: every
other rule about this tree is a tested pure function, and an SVG click handler is the worst place in
the codebase to put the fourth one.

---

## Two semantic decisions the tests will pin

**Splitting a section carries its front and interior onto every child.** A user who splits a doored
600 mm bay in two should get two doored bays, not one silently undoored one. The parent's own fields
are cleared, since only leaves are read. Nothing the user set is lost, and removing a door they did
not want is one click.

**Collapsing a split adopts the first child's front and interior.** The mirror of the same rule, so
split-then-unsplit returns a section carrying what it carried before rather than a bare one.

---

## Commits by green boundary

The gate is a Claude Code `PreToolUse` hook running `pnpm typecheck`; `--no-verify` is inert.
**Never** edit `.claude/settings.json` or `.claude/hooks/`. Mutation-testing discipline is in
`CLAUDE.md`: back the file up and restore from the copy, grep after applying *and* after restoring,
and predict which tests should fail before running.

| commit | covers | why it is green |
|---|---|---|
| **A** | `editSection.ts` — split, unsplit, resize | new module, no consumer |
| **B** | the editor frame: tabs in the main pane, 3D showing the hidden-not-unmounted viewport | the Section tab is a placeholder |
| **C** | the elevation — rectangles, click to select, selection lifted to `App` | drawing and selecting only, no edits |
| **D** | the editing actions, and the opening picker retires | |
| **E** | close-out | |

**C and D are separate on purpose.** C is "the picture is right and clicking it selects the right
section"; D is "the buttons change the tree". A wrong rectangle and a wrong split look identical in
the finished editor.

---

## Group A — the shape operations

**Files:**
- Create: `src/scene/editSection.ts`
- Create: `src/scene/editSection.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { setSectionSize, splitSection, unsplitSection } from './editSection'
import type { Section } from './sectionTree'

const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const
const SHELVES = { fixedShelves: 0, adjustable: { shelves: 2, count: 10, rows: 2 as 1 | 2, pitch: 32 as const, setback: 37, backSetback: 37 } }

const leaf = (id: string): Section => ({ id, size: { kind: 'equal' }, content: { kind: 'leaf' } })

const childrenOf = (s: Section): Section[] => {
  if (s.content.kind !== 'split') throw new Error('expected a split')
  return s.content.children
}

describe('splitSection', () => {
  it('turns a leaf into a split with the requested axis, division and children', () => {
    const next = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    if (next.content.kind !== 'split') throw new Error('expected a split')
    expect(next.content.axis).toBe('vertical')
    expect(next.content.division).toBe('panel')
    expect(next.content.children).toHaveLength(2)
    for (const c of next.content.children) expect(c.content.kind).toBe('leaf')
  })

  it('gives every child a fresh id, distinct from its parent and each other', () => {
    const next = splitSection(leaf('a'), 'a', 'horizontal', 'panel', 3)
    const ids = childrenOf(next).map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain('a')
    for (const id of ids) expect(id.startsWith('sec_')).toBe(true)
  })

  // A user who splits a doored bay in two should get two doored bays, not one silently undoored
  // one. Nothing they set is lost, and removing a door they did not want is one click.
  it('carries the front and the interior onto every child', () => {
    const doored: Section = { ...leaf('a'), front: DOOR, interior: SHELVES }
    const next = splitSection(doored, 'a', 'vertical', 'panel', 2)
    for (const c of childrenOf(next)) {
      expect(c.front).toEqual(DOOR)
      expect(c.interior).toEqual(SHELVES)
    }
  })

  // Only leaves are read, so a split section holding a front is a field nothing will ever look at —
  // and a field nothing looks at is one that will be wrong when something finally does.
  it('clears the parent’s own front and interior', () => {
    const doored: Section = { ...leaf('a'), front: DOOR, interior: SHELVES }
    const next = splitSection(doored, 'a', 'vertical', 'panel', 2)
    expect(next.front).toBeUndefined()
    expect(next.interior).toBeUndefined()
  })

  it('splits a section nested deep in the tree and leaves its siblings alone', () => {
    const root = splitSection(leaf('root'), 'root', 'vertical', 'panel', 2)
    const [first, second] = childrenOf(root)
    const next = splitSection(root, second.id, 'horizontal', 'panel', 2)
    expect(childrenOf(next)[0]).toEqual(first)
    expect(childrenOf(next)[1].content.kind).toBe('split')
  })

  // The id naming nothing is ordinary, not an error: a stale selection outlives the tree it names.
  it('leaves the tree alone when the id names nothing', () => {
    const root = leaf('a')
    expect(splitSection(root, 'nobody', 'vertical', 'panel', 2)).toEqual(root)
  })

  // `validateSection` already rejects a split with fewer than two children; refusing here keeps a
  // tree that cannot be built from ever existing, rather than building one and reporting it later.
  it('refuses to split into fewer than two', () => {
    const root = leaf('a')
    expect(splitSection(root, 'a', 'vertical', 'panel', 1)).toEqual(root)
  })

  // Splitting a section that is already split replaces its children. The alternative — nesting
  // another split inside it — is what the user gets by selecting a child and splitting that.
  it('replaces the children of a section that is already split', () => {
    const once = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    const twice = splitSection(once, 'a', 'horizontal', 'rail', 3)
    if (twice.content.kind !== 'split') throw new Error('expected a split')
    expect(twice.content.axis).toBe('horizontal')
    expect(twice.content.division).toBe('rail')
    expect(twice.content.children).toHaveLength(3)
  })
})

describe('unsplitSection', () => {
  it('collapses a split back to a leaf', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    const next = unsplitSection(root, 'a')
    expect(next.content.kind).toBe('leaf')
    expect(next.id).toBe('a')
  })

  // The mirror of the split rule, so split-then-unsplit returns a section carrying what it carried
  // rather than a bare one.
  it('adopts the first child’s front and interior', () => {
    const doored: Section = { ...leaf('a'), front: DOOR, interior: SHELVES }
    const split = splitSection(doored, 'a', 'vertical', 'panel', 2)
    const back = unsplitSection(split, 'a')
    expect(back.front).toEqual(DOOR)
    expect(back.interior).toEqual(SHELVES)
  })

  it('does nothing to a section that is already a leaf', () => {
    const root = leaf('a')
    expect(unsplitSection(root, 'a')).toEqual(root)
  })

  it('leaves the tree alone when the id names nothing', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    expect(unsplitSection(root, 'nobody')).toEqual(root)
  })
})

describe('setSectionSize', () => {
  it('sets one section’s size and no other', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    const [first, second] = childrenOf(root)
    const next = setSectionSize(root, first.id, { kind: 'fixed', mm: 300 })
    expect(childrenOf(next)[0].size).toEqual({ kind: 'fixed', mm: 300 })
    expect(childrenOf(next)[1].size).toEqual(second.size)
  })

  it('leaves the tree alone when the id names nothing', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    expect(setSectionSize(root, 'nobody', { kind: 'fixed', mm: 300 })).toEqual(root)
  })
})
```

- [x] **Step 2: Run and confirm the whole file fails to import**

Run: `pnpm vitest run src/scene/editSection.test.ts`
Expected: FAIL — `Failed to resolve import "./editSection"`.

- [x] **Step 3: Write `src/scene/editSection.ts`**

```ts
// Every change to the section tree's *shape*. Its two siblings write what a section holds —
// `setInterior` and `setFrontOn` in `sectionInterior.ts` — and this writes how it is divided.
//
// Pure and total, and total in the same way they are: an id naming nothing returns the tree
// unchanged rather than throwing. A selection outlives the tree it names every time the divider
// shim rebuilds one, so a stale id is ordinary rather than exceptional.

import { newSectionId, type DivisionKind, type Section, type SectionId, type SectionSize } from './sectionTree'

// Applies `f` to the section with `id` and rebuilds the spine above it, leaving every other node
// referentially identical. Written once because all three operations below are the same walk.
function edit(root: Section, id: SectionId, f: (s: Section) => Section): Section {
  if (root.id === id) return f(root)
  const content = root.content
  if (content.kind === 'leaf') return root
  const children = content.children.map((c) => edit(c, id, f))
  // Referentially identical when nothing below changed, so React sees no new object for a branch
  // the edit did not touch — and so the "leaves the tree alone" tests can use `toEqual` honestly.
  return children.every((c, i) => c === content.children[i])
    ? root
    : { ...root, content: { ...content, children } }
}

// Divides a section into `count` children. Children inherit the parent's front and interior: a user
// who splits a doored bay in two should get two doored bays, not one silently undoored one. The
// parent's own copies are cleared, because only leaves are read and a field nothing looks at is one
// that will be wrong when something finally does.
export function splitSection(
  root: Section,
  id: SectionId,
  axis: 'vertical' | 'horizontal',
  division: DivisionKind,
  count: number,
): Section {
  // `validateSection` rejects a split with fewer than two children. Refusing here keeps a tree that
  // cannot be built from ever existing, rather than building one and reporting it afterwards.
  if (count < 2) return root
  return edit(root, id, (s) => {
    const child = (): Section => ({
      id: newSectionId(),
      size: { kind: 'equal' },
      content: { kind: 'leaf' },
      ...(s.front === undefined ? {} : { front: s.front }),
      ...(s.interior === undefined ? {} : { interior: s.interior }),
    })
    const next: Section = {
      id: s.id,
      size: s.size,
      content: { kind: 'split', axis, division, children: Array.from({ length: count }, child) },
    }
    return next
  })
}

// Collapses a split back to a leaf, adopting the first child's front and interior — the mirror of
// the split rule, so split-then-unsplit returns a section carrying what it carried before.
export function unsplitSection(root: Section, id: SectionId): Section {
  return edit(root, id, (s) => {
    if (s.content.kind === 'leaf') return s
    const [first] = s.content.children
    return {
      id: s.id,
      size: s.size,
      content: { kind: 'leaf' },
      ...(first.front === undefined ? {} : { front: first.front }),
      ...(first.interior === undefined ? {} : { interior: first.interior }),
    }
  })
}

export function setSectionSize(root: Section, id: SectionId, size: SectionSize): Section {
  return edit(root, id, (s) => ({ ...s, size }))
}
```

- [x] **Step 4: Run and confirm they pass**

- [x] **Step 5: Mutation check — the inheritance rule**

Back up first (`cp src/scene/editSection.ts "$SCRATCHPAD"/es.bak`), then substitute
`      ...(s.front === undefined ? {} : { front: s.front }),` → `` (delete the line). Grep to
confirm. Expected: FAIL on *carries the front and the interior onto every child*. Restore from the
copy and grep again.

- [x] **Step 6: Mutation check — the parent's stale fields**

Substitute the `next` object's construction so it spreads `s` first:
`    const next: Section = {\n      id: s.id,` → `    const next: Section = {\n      ...s,\n      id: s.id,`.
Grep. Expected: FAIL on *clears the parent's own front and interior*. Restore and grep.

- [x] **Acceptance:** the full suite passes with its count unchanged apart from your additions. Nothing consumes this yet.

## Group B — the editor frame

**Files:**
- Create: `src/ui/CabinetEditor.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/sidebar.tsx` (take `selectedCarcase` as a prop)
- Test: `src/ui/CabinetEditor.test.tsx`

### B1 — lift `selectedCarcase`

`sidebar.tsx:112` derives it from `selection`. Move that derivation into `App`, pass the result to
`Sidebar` as a prop, and use the same value to decide whether the editor is showing. Deriving it in
two places is how the sidebar and the editor come to disagree about which cabinet is open.

### B2 — the frame

```tsx
// The cabinet edit level: selecting a cabinet turns the main pane into its editor. The tabs are the
// ones a cabinet is actually described by — its elevation, its projections, and the model itself.
//
// 3D is a tab rather than a separate mode because the viewport *is* one of the ways to look at a
// cabinet. It is hidden rather than unmounted (see App): its renderer, camera and every uploaded
// geometry are built in a mount-once effect, so swapping it out would rebuild all of it on a click.
const TABS = ['section', 'front', 'top', 'end', '3d'] as const
export type CabinetTab = (typeof TABS)[number]
```

The tab strip follows `BomModal.tsx:284` — a plain `<button role="tab" aria-selected>` row, so
`getByRole('tab', { name })` finds them and no new dependency arrives. Front / Top / End render a
one-line "not built yet" note naming G2; a tab that silently shows nothing is worse than one that
says why.

- [x] **Step 1: Write the failing tests**

```tsx
describe('CabinetEditor', () => {
  afterEach(cleanup)

  const cabinet: CarcaseComponent = {
    kind: 'carcase',
    id: 'cmp_1',
    label: 'Base 600',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: CARCASE_PRESETS[0].params,
  }

  const props = (over: Partial<ComponentProps<typeof CabinetEditor>> = {}) => ({
    component: cabinet,
    materials: PRESET_MATERIALS,
    tab: 'section' as CabinetTab,
    onTabChange: vi.fn(),
    selectedSectionId: null,
    onSelectSection: vi.fn(),
    onUpdate: vi.fn(),
    ...over,
  })

  it('offers the five subtabs a cabinet is described by', () => {
    render(<CabinetEditor {...props()} />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Section',
      'Front',
      'Top',
      'End',
      '3D',
    ])
  })

  it('opens on Section', () => {
    render(<CabinetEditor {...props()} />)
    expect(screen.getByRole('tab', { name: 'Section' })).toHaveAttribute('aria-selected', 'true')
  })

  it('reports the tab upward so the viewport can show itself', async () => {
    const onTabChange = vi.fn()
    render(<CabinetEditor {...props({ onTabChange })} />)
    await userEvent.click(screen.getByRole('tab', { name: '3D' }))
    expect(onTabChange).toHaveBeenLastCalledWith('3d')
  })

  // A tab that silently shows nothing reads as broken. G2 builds these.
  it.each(['Front', 'Top', 'End'])('says %s is not built yet rather than showing nothing', async (name) => {
    render(<CabinetEditor {...props()} />)
    await userEvent.click(screen.getByRole('tab', { name }))
    expect(screen.getByText(/not built yet/i)).toBeTruthy()
  })

  // The 3D tab is the viewport, which lives outside this component precisely so it is never
  // unmounted — so the editor renders nothing for it and App does the showing.
  it('renders no panel of its own for 3D', async () => {
    render(<CabinetEditor {...props()} />)
    await userEvent.click(screen.getByRole('tab', { name: '3D' }))
    expect(screen.queryByTestId('cabinet-editor-panel')).toBeNull()
  })
})
```

- [x] **Step 2: Run, confirm failure, implement, run again**

- [x] **Step 3: Wire it into `App.tsx`**

```tsx
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Hidden, never unmounted: the renderer, the camera and every uploaded geometry are built
            in a mount-once effect, so swapping the viewport out on a selection or a tab change
            would tear all of it down and rebuild it. A hidden canvas keeps rendering, which is what
            the app already does behind the BOM modal. */}
        <div
          style={{
            display: selectedCarcase === null || cabinetTab === '3d' ? 'flex' : 'none',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Viewport … />
        </div>
        {selectedCarcase !== null && (
          <CabinetEditor
            key={selectedCarcase.id}
            component={selectedCarcase}
            materials={scene.materials}
            tab={cabinetTab}
            onTabChange={setCabinetTab}
            …
          />
        )}
        <Sidebar … />
      </div>
```

- [x] **Step 4: Filter the 3D tab to this cabinet**

The spec says 3D is "the existing viewport, **filtered to this cabinet**". Pass `Viewport` the parts
whose `parentId` is in this cabinet's subtree (`descendantIds` in `componentTree.ts` already answers
that) while a cabinet is open, and every part otherwise.

`Viewport` keys its meshes by part id and already handles parts appearing and disappearing — it must,
for add and remove — so a filter is not a new capability. It does mean switching between cabinets
rebuilds meshes for the parts that came and went; that is the cost of the feature and it is bounded
by one cabinet's part count, not the scene's.

- [x] **Step 5: An e2e that the viewport survives a tab round trip**

The claim this group rests on is that the canvas is never rebuilt. A unit test cannot see that; a
browser can:

```ts
// The claim this group rests on is that the canvas is never rebuilt. A unit test cannot see that: a
// marker set on the live element, and still there after a round trip, can.
test('the cabinet editor never rebuilds the viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()

  // Mark the canvas while it is still the only thing in the main pane.
  await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (c === null) throw new Error('no canvas')
    c.setAttribute('data-zimmu-mark', 'kept')
  })

  // Selecting the cabinet swaps the pane for the editor; 3D swaps it back; Section hides it again.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await expect(page.getByRole('tab', { name: 'Section' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '3D' }).click()
  await page.getByRole('tab', { name: 'Section' }).click()
  await page.getByRole('tab', { name: '3D' }).click()

  // A remount would have produced a fresh <canvas> without the marker.
  await expect(page.locator('canvas[data-zimmu-mark="kept"]')).toHaveCount(1)
  await expect(page.locator('canvas')).toHaveCount(1)
})
```

## Group C — the elevation

**Files:**
- Create: `src/ui/SectionElevation.tsx`
- Create: `src/ui/SectionElevation.test.tsx`
- Modify: `src/App.tsx` (own `selectedSectionId`)

The first interactive SVG in the codebase. `buildSheetSvg.ts` and `buildSvg.ts` produce SVG
*strings*; this renders React elements, because every rectangle needs a click handler.

Drawn from `resolveSections`: the opening rect is the frame, every **leaf** rect a clickable cell,
every division a filled bar. Carcase z is up and SVG y is down, so the transform flips it — the one
place that conversion happens, stated once.

- [x] **Step 1: Write the failing tests**

```tsx
describe('SectionElevation', () => {
  afterEach(cleanup)

  const base = CARCASE_PRESETS[0].params
  const divided = (): CarcaseParams => ({ ...base, section: legacyToSection([0.5], 0, 600, 18) })

  it('draws one cell per leaf and one bar per division', () => {
    render(<SectionElevation params={divided()} materials={PRESET_MATERIALS} selected={null} onSelect={vi.fn()} />)
    expect(screen.getAllByTestId(/^section-cell-/)).toHaveLength(2)
    expect(screen.getAllByTestId(/^section-division-/)).toHaveLength(1)
  })

  it('selects the section a cell stands for', async () => {
    const onSelect = vi.fn()
    const p = divided()
    render(<SectionElevation params={p} materials={PRESET_MATERIALS} selected={null} onSelect={onSelect} />)
    const cells = screen.getAllByTestId(/^section-cell-/)
    await userEvent.click(cells[0])
    const ids = sectionOpenings(p.section, resolvedOf(p)).map((o) => o.sectionId)
    expect(onSelect).toHaveBeenCalledWith(ids[0])
  })

  it('marks the selected cell and no other', () => {
    const p = divided()
    const [first] = sectionOpenings(p.section, resolvedOf(p))
    render(<SectionElevation params={p} materials={PRESET_MATERIALS} selected={first.sectionId} onSelect={vi.fn()} />)
    const marked = screen.getAllByTestId(/^section-cell-/).filter((c) => c.getAttribute('data-selected') === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-testid')).toBe(`section-cell-${first.sectionId}`)
  })

  // Carcase z runs up and SVG y runs down. Getting that backwards draws an upside-down cabinet that
  // looks plausible until one is asymmetric — so the fixture is one that is. Read off the rendered
  // attributes, never the component's internals: the claim is about what the user sees.
  it('draws the cabinet the right way up', () => {
    const root = legacyToSection([], 0, 600, 18)
    const split = splitSection(root, root.id, 'horizontal', 'panel', 2)
    if (split.content.kind !== 'split') throw new Error('fixture is not a split')
    // The lower child fixed short, so the two cells cannot be mistaken for each other.
    const lopsided = setSectionSize(split, split.content.children[0].id, { kind: 'fixed', mm: 150 })
    const p: CarcaseParams = { ...base, section: lopsided }

    render(<SectionElevation params={p} materials={PRESET_MATERIALS} selected={null} onSelect={vi.fn()} />)

    // `sectionOpenings` orders bottom-left first, so [0] is the low one in carcase space.
    const [low, high] = sectionOpenings(p.section, resolvedOf(p))
    expect(low.rect.z0).toBeLessThan(high.rect.z0)

    const yOf = (id: string) =>
      Number(screen.getByTestId(`section-cell-${id}`).getAttribute('y'))
    // Lower in the cabinet is *further down* the SVG, which is a larger y.
    expect(yOf(low.sectionId)).toBeGreaterThan(yOf(high.sectionId))
  })

  it('renders nothing rather than throwing for a cabinet that does not build', () => {
    const broken: CarcaseParams = { ...base, width: 5 }
    render(<SectionElevation params={broken} materials={PRESET_MATERIALS} selected={null} onSelect={vi.fn()} />)
    expect(screen.queryAllByTestId(/^section-cell-/)).toEqual([])
  })
})
```

`resolvedOf` is defined **inside `CarcasePanel.test.tsx`** and is not importable from a sibling test
file — the same scoping trap `toCarcase` sprang in Stage F. Before writing these tests, move it to a
shared fixture (`src/scene/__fixtures__/resolve.ts` beside `sweep.ts`) and have both files import it:

```ts
export const resolvedOf = (p: CarcaseParams, materials = PRESET_MATERIALS) => {
  const thicknessOf = roleThicknessFor(p, materials, new Map())
  return resolveSections(p.section, openingRect(p, thicknessOf), (parentId, index) =>
    thicknessOf(`division-${parentId}-${index}`),
  )
}
```

Run the suite after the move and before writing anything new.

- [x] **Step 2: Run, confirm failure, implement, run again**

- [x] **Step 3: Lift `selectedSectionId` into `App`**

The elevation sets it and `CarcasePanel` reads it, so the two are one selection rather than two that
agree by luck. Clear it when the selected cabinet changes — a section id from another cabinet names
nothing in this one, and the pure functions treat that as a no-op, so the symptom would be a panel
that silently edits nothing.

- [x] **Step 4: Mutation check — the flip**

Substitute the y transform for one that does not flip. Expected: FAIL on *draws the cabinet the right
way up* and on nothing else. If the selection tests fail too, they are reading position where they
should be reading identity.

## Group D — the editing actions

**Files:**
- Modify: `src/ui/SectionElevation.tsx` or a sibling toolbar
- Modify: `src/ui/CarcasePanel.tsx` (the opening picker retires)
- Test: both test files

The selected section gets: **Split across**, **Split down**, **Merge** (unsplit), a **Size** control
(Equal / Fixed + mm), and the **Front** control moved from `CarcasePanel`.

**The axis names are a trap.** In `sectionTree`, `axis: 'vertical'` puts children **side by side**
separated by a *vertical* partition, and `axis: 'horizontal'` **stacks** them separated by a
*horizontal* shelf — the axis names the division's orientation, not the stacking direction, which is
why `divisionLabel` maps vertical → "Partition" and horizontal → "Shelf". So:

| button | axis | what appears |
|---|---|---|
| Split across | `'horizontal'` | a shelf across the opening, children stacked |
| Split down | `'vertical'` | a partition down it, children side by side |

The button labels say what the user sees; the axis says what the division is. Wire them the wrong way
round and every test above still reads plausibly, which is why the table is here and why the mutation
in step 3 swaps exactly this.

**The mm field is labelled by the axis, not "Width".** A fixed size is an extent along the parent's
split axis: a width for a section side by side with its siblings, a height for one stacked above
them. A field labelled "Width" on a stacked section is wrong half the time — the same class of defect
as offering a hinge side on a two-leaf door.

- [x] **Step 1: Write the failing tests**

```tsx
describe('the section toolbar', () => {
  afterEach(cleanup)

  const base = CARCASE_PRESETS[0].params
  const rootId = base.section.id

  // Asserted through the applied params rather than through the SVG: the picture is Group C's
  // claim, and this group's is that the buttons change the tree.
  const applied = (onUpdate: ReturnType<typeof vi.fn>): CarcaseParams => {
    const updater = onUpdate.mock.calls.at(-1)![0] as (c: Component) => Component
    const next = updater(cabinet)
    if (next.kind !== 'carcase') throw new Error('updater must return a carcase')
    return next.params
  }
  const contentOf = (p: CarcaseParams) => p.section.content

  it.each([
    ['Split across', 'horizontal'],
    ['Split down', 'vertical'],
  ])('%s divides the selected section', async (label, axis) => {
    const onUpdate = vi.fn()
    render(<CabinetEditor {...props({ selectedSectionId: rootId, onUpdate })} />)
    await userEvent.click(screen.getByRole('button', { name: label }))

    const content = contentOf(applied(onUpdate))
    if (content.kind !== 'split') throw new Error('expected a split')
    expect(content.axis).toBe(axis)
    expect(content.children).toHaveLength(2)
  })

  it('merges a split back and keeps the first child’s front', async () => {
    const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const
    const split = splitSection({ ...base.section, front: DOOR }, rootId, 'vertical', 'panel', 2)
    const onUpdate = vi.fn()
    render(
      <CabinetEditor
        {...props({
          component: { ...cabinet, params: { ...base, section: split } },
          selectedSectionId: rootId,
          onUpdate,
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))

    const next = applied(onUpdate).section
    expect(next.content.kind).toBe('leaf')
    expect(next.front).toEqual(DOOR)
  })

  it('sets a fixed size on the selected section', async () => {
    const split = splitSection(base.section, rootId, 'vertical', 'panel', 2)
    if (split.content.kind !== 'split') throw new Error('fixture is not a split')
    const childId = split.content.children[0].id
    const onUpdate = vi.fn()
    render(
      <CabinetEditor
        {...props({
          component: { ...cabinet, params: { ...base, section: split } },
          selectedSectionId: childId,
          onUpdate,
        })}
      />,
    )
    await userEvent.click(screen.getByLabelText('Size'))
    await userEvent.click(screen.getByRole('option', { name: 'Fixed' }))
    // 'Width' because this fixture splits *down* — the children sit side by side. A stacked child
    // is labelled 'Height'; see the axis table above.
    const field = screen.getByLabelText('Width', { exact: true })
    await userEvent.clear(field)
    await userEvent.type(field, '300')
    await waitFor(() => expect(onUpdate.mock.calls.length).toBeGreaterThan(1))

    const content = contentOf(applied(onUpdate))
    if (content.kind !== 'split') throw new Error('expected a split')
    expect(content.children[0].size).toEqual({ kind: 'fixed', mm: 300 })
  })

  it('labels the size by the axis its parent splits on', () => {
    const across = splitSection(base.section, rootId, 'horizontal', 'panel', 2)
    if (across.content.kind !== 'split') throw new Error('fixture is not a split')
    render(
      <CabinetEditor
        {...props({
          component: { ...cabinet, params: { ...base, section: across } },
          selectedSectionId: across.content.children[0].id,
        })}
      />,
    )
    // Stacked children are sized by height. Labelling it 'Width' would be wrong half the time.
    expect(screen.getByLabelText('Height', { exact: true })).toBeTruthy()
    expect(screen.queryByLabelText('Width', { exact: true })).toBeNull()
  })

  // The root has no parent to claim space inside, so there is nothing to size and no split to
  // merge. Offering either would be offering a control that cannot do anything.
  it('offers neither Merge nor Size for a root leaf', () => {
    render(<CabinetEditor {...props({ selectedSectionId: rootId })} />)
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
    expect(screen.queryByLabelText('Size')).toBeNull()
  })

  it('offers nothing at all when no section is selected', () => {
    render(<CabinetEditor {...props({ selectedSectionId: null })} />)
    expect(screen.queryByRole('button', { name: 'Split across' })).toBeNull()
    expect(screen.getByText(/pick an opening/i)).toBeTruthy()
  })
})
```

and in `CarcasePanel.test.tsx`:

```tsx
  // The elevation *is* the picker now. Two ways to choose an opening is one way to choose the
  // wrong one.
  it('no longer offers an opening dropdown', () => {
    renderPanel(carcase())
    expect(screen.queryByLabelText('Opening')).toBeNull()
  })

  // With no section selected the panel has nothing to edit and must say so, rather than falling
  // back to the first opening — which is what the dropdown did, and what made it a second
  // selection that could disagree with the elevation's.
  it('says to pick an opening in the elevation when none is selected', () => {
    renderPanel(carcase(), vi.fn(), PRESET_MATERIALS, { selectedSectionId: null })
    expect(screen.queryByLabelText('Shelves')).toBeNull()
    expect(screen.getByText(/pick an opening/i)).toBeTruthy()
  })

  it('edits the section the elevation selected', async () => {
    const c = carcase()
    const id = sectionOpenings(c.params.section, resolvedOf(c.params))[0].sectionId
    const onUpdate = renderPanel(c, vi.fn(), PRESET_MATERIALS, { selectedSectionId: id })
    await typeInto('Shelves', '3', onUpdate)
    expect(
      sectionOpenings(appliedParams(onUpdate, c).section, resolvedOf(appliedParams(onUpdate, c)))[0]
        .spec?.adjustable.shelves,
    ).toBe(3)
  })
```

`renderPanel` gains a fourth argument for the props the panel no longer derives for itself.

- [x] **Step 2: Retire the picker**

`CarcasePanel`'s `pickedOpening` state and its Opening `Select` come out; `opening` becomes the
section `App` says is selected. The Shelving and Front sections then edit that, unchanged otherwise.

- [x] **Step 3: Mutation check — the split axis**

Substitute the axis passed at the "Split across" call site for `'vertical'`, so both buttons make a
partition. Grep to confirm. Expected: FAIL on *Split across divides the selected section* and pass on
*Split down* — the table above is exactly the thing that is easy to wire backwards, and both buttons
still "work" when it is. Restore from the backup and grep again.

- [x] **Step 4: e2e**

Extend `e2e/carcase.spec.ts`: drop a Base 600, select it, click a cell in the elevation, split it
across, and see the board count rise by the division the split created. That is the whole stage in
one gesture.

## Group E — close the stage

- [x] `pnpm typecheck && pnpm lint && pnpm test`, exit codes read directly, **never piped through `tail`/`head`**
- [x] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e`. Do **not** run `playwright install`. Expect the existing carcase and sheets specs to need a selection step: selecting a cabinet now changes the main pane, so a test that selected one and then looked for the viewport will need the 3D tab. Fix them to the new truth and list which moved.
- [x] `CLAUDE.md`: `editSection.ts` and `CabinetEditor.tsx` in the tree; an invariant that the viewport is hidden and never unmounted, and one that the elevation is the only place a section is picked.
- [x] `node scripts/update-structure-html.mjs`, then the hand-written prose: the `src/scene/` and `src/ui/` tables, the Features row, the invariants table.
- [x] Notes: the mount-once finding; the split/unsplit inheritance rule and why; which e2e moved.

## Acceptance

- [x] Selecting a cabinet shows the editor; the **3D** tab shows the same viewport, never a rebuilt one
- [x] The elevation draws one cell per leaf and one bar per division, the right way up
- [x] Clicking a cell selects that section, in the elevation *and* in the sidebar panel
- [x] Split across, split down, merge and size all change the tree through `editSection`
- [x] Splitting a doored bay gives two doored bays; merging keeps the first child's front
- [x] The sidebar's opening dropdown is gone
- [x] Every mutation check above was run and reported

## What Stage G1 deliberately does not do

- **No Front / Top / End projections.** G2. `buildDrawingSheets` produces one sheet per part today;
  a whole-cabinet projection is a generalisation of the projector, not a use of it.
- **No scene-tree grouping.** G3.
- **No drag to resize.** A size is typed. Dragging a division is a gesture with its own hit-testing,
  snapping and undo semantics, and none of that is what makes the tree editable.
- **No multi-select, no copy/paste of a section.**
