# Cabinet restructure Stage E — fronts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A section can wear a front — a door, a drawer front, a false front or a panel — mounted inset or overlay, with every visible gap equal to `frontReveal`.

**Architecture:** A new pure module turns the section tree into *front cells* (rectangles on the cabinet's front face, reveals already applied). `carcaseBoxes` emits one board per cell. Nothing else in the generator learns what a front is: a front appears in no joint descriptor, so the extension pass never reaches it.

**Tech Stack:** TypeScript strict, Vitest, React 19. Two pure modules, one panel section, one file-format bump.

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md` (§ Fronts, § `CarcaseParams` after the restructure)
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Preceded by:** Stage A (section tree), B (materials own thickness), C (screw joints), D (section interiors)

---

## Two findings that reshape this stage

Both were found by reading the shipped Stage D code against the spec's § Fronts. Neither is in the
spec, and each breaks a working cabinet if implemented as written.

### 1. An overlay front touches every carcase panel it covers

The spec says overlay is `y ∈ [−FT, 0]`, "inner face against them". That is contact: the sides, the
bottom, the top and every division run `y0 = 0`, so `boardsTouch` fires on each one the front
overlaps in x/z.

Stage D established what happens then, and it cost twelve tests to learn: **a contact the generator
does not name is an unjoined pair on the joinery checklist forever.** An adjustable shelf was pulled
clear of the back for exactly this reason.

A front is different from a shelf, though: a door genuinely *is* attached to the carcase — by hinges
— so the honest model is a **contact pair**, not a gap. `carcaseContactPairs` exists to say "these
meet and need no joinery cut". So this stage adds contact pairs, and every checklist count in the
suite moves. Do not instead pull the front off the face by an invented standoff: that models a gap
where the hardware puts none, and it would make the reveal rule false on the y axis alone.

An **inset** front touches nothing — every edge is a reveal clear of surrounding material — so it
contributes no pairs. That asymmetry is the test worth writing.

### 2. `SHELF_FRONT_SETBACK` is 5 mm and an inset door is 18 mm thick

`carcaseRoles.ts` seats every adjustable shelf at `y0 = SHELF_FRONT_SETBACK = 5`. An inset front
occupies `y ∈ [0, FT]`. With an 18 mm front the two intersect by 13 mm — a shelf driven through a
closed door.

The Stage D notes anticipated this in as many words: *"Stage E may make it a function of the front
rather than a constant; it is named and commented so that change has one place to happen."* This is
that change. The setback becomes `max(SHELF_FRONT_SETBACK, insetFrontThickness + SHELF_CLEARANCE)`,
where `insetFrontThickness` is 0 unless the section actually wears an inset front.

Note the asymmetry again: an **overlay** front is in front of `y = 0` and needs no setback at all.
So the constant stays as the floor, and the front only ever pushes it further back.

## Deviations from the spec, and why

### `front` goes on `Section`, not inside `content`

The spec writes `content: { kind: 'leaf'; front: FrontSpec }`. Stage D put `interior?: InteriorSpec`
on `Section` instead, for a reason that applies identically here: a required field inside `content`
forces every leaf construction site in the codebase — `legacyToSection`, the presets, twenty
fixtures — to supply one. `front?: FrontSpec` on `Section` matches `interior?` exactly.

Consequence: there is **no `{ kind: 'open' }` member.** Absence says it, the way absence of an
`interior` says an opening wants no shelving. A `FrontSpec` union with an "actually nothing" member
alongside an optional field would give the model two ways to say one thing.

### `interior.fixedShelves` arrives here, as Stage D said it would

Stage D deliberately left it out: *"until fronts exist a section's interior fixed shelf is
observationally identical to a split that makes one."* With a front it is not. A shelf **behind a
door** must not split the section, because a split section is two sections and would want two doors.

So `InteriorSpec` gains `fixedShelves: number` — non-splitting shelves, evenly spaced through the
section's clear height, housed in the sections's own bounds. That is what makes a one-door cabinet
with a shelf inside expressible at all, and without it this stage ships a model that cannot describe
the commonest cabinet there is.

---

## Commits by green boundary

The gate is a Claude Code `PreToolUse` hook running `pnpm typecheck`; `--no-verify` is inert.
**Never** edit `.claude/settings.json` or `.claude/hooks/`.

| commit | covers | why it is green |
|---|---|---|
| **A** | `FrontSpec` + `frontCells(root, tree, geometry)` — rectangles with reveals applied | new module, no consumer |
| **B** | the switch — three `CarcaseParams` fields, front boxes, grain, thickness slot, contacts, v17 | behaviour changes deliberately; checklist counts move |
| **C** | the inset shelf setback | one constant becomes a function; only inset cabinets move |
| **D** | `interior.fixedShelves` — shelves behind a door | adds parts |
| **E** | UI: front kind and mount per opening | |
| **F** | close-out | |

**B and C are separate on purpose.** B changes what exists; C changes where an existing part sits.
Mixed, a shelf in the wrong place would be indistinguishable from a front in the wrong place.

---

## Group A — front cells

**Files:**
- Create: `src/scene/frontCells.ts`
- Create: `src/scene/frontCells.test.ts`
- Modify: `src/scene/sectionTree.ts` (add `FrontSpec` and `Section.front`)

### A1 — the type

- [ ] **Step 1: Add the type to `src/scene/sectionTree.ts`**

Beside `InteriorSpec`, and for the same reason it lives there rather than in the consumer module:
Stage D moved these spec types onto `sectionTree` to break a type-only import cycle
(`sectionInterior` ↔ `sectionTree`). Putting `FrontSpec` in `frontCells.ts` would recreate it.

```ts
// What covers a section. Absent means nothing does — the same convention `interior` uses, so the
// model has one way to say "no front" rather than a field and a union member that both mean it.
//
// `hinge` is read only when `leaves === 1`: a pair of doors is hinged at both outer edges, and a
// field that is meaningless half the time is a field that will be set wrong.
export type FrontSpec =
  | { kind: 'door'; leaves: 1 | 2; hinge: 'left' | 'right' }
  | { kind: 'drawer-front' }
  | { kind: 'false-front' }
  | { kind: 'panel' }
```

And on `Section`, immediately after `interior?`:

```ts
  // What covers this section. Optional for the same reason `interior` is.
  front?: FrontSpec
```

- [ ] **Step 2: Run `pnpm typecheck`**

Expected: PASS. Nothing reads the field yet.

### A2 — the cell geometry

`src/scene/frontCells.ts`. The whole reveal rule lives here and nowhere else.

- [ ] **Step 1: Write the failing test file `src/scene/frontCells.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { frontCells, type FrontGeometry } from './frontCells'
import { resolveSections, type Rect, type Section } from './sectionTree'

// A 600 × 720 cabinet's clear opening on 18 mm stock, matching `openingRect` for the Base preset.
const OPENING: Rect = { x0: 18, x1: 582, z0: 118, z1: 702 }

// What the cabinet is, outside the opening: where an overlay front expands to.
const OUTER: Rect = { x0: 0, x1: 600, z0: 100, z1: 720 }

const leaf = (id: string, front?: Section['front']): Section => ({
  id,
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
  ...(front === undefined ? {} : { front }),
})

const geom = (over: Partial<FrontGeometry> = {}): FrontGeometry => ({
  outer: OUTER,
  mount: 'overlay',
  reveal: 3,
  ...over,
})

const cellsOf = (root: Section, g: FrontGeometry) =>
  frontCells(root, resolveSections(root, OPENING, () => 18), g)

describe('frontCells', () => {
  it('lists nothing for a section with no front', () => {
    expect(cellsOf(leaf('a'), geom())).toEqual([])
  })

  // Overlay: the cell expands to the cabinet's outer edge, then every edge takes half a reveal, so
  // two cabinets side by side leave one reveal between their doors.
  it('expands a lone overlay front to the cabinet and insets half a reveal all round', () => {
    const [cell] = cellsOf(leaf('a', { kind: 'door', leaves: 1, hinge: 'left' }), geom())
    expect(cell.rect).toEqual({ x0: 1.5, x1: 598.5, z0: 101.5, z1: 718.5 })
  })

  // Inset: the cell is the opening itself, every edge a full reveal clear of the carcase.
  it('insets a lone inset front by a full reveal from the opening', () => {
    const [cell] = cellsOf(
      leaf('a', { kind: 'door', leaves: 1, hinge: 'left' }),
      geom({ mount: 'inset' }),
    )
    expect(cell.rect).toEqual({ x0: 21, x1: 579, z0: 121, z1: 699 })
  })

  const DIVIDED: Section = {
    id: 'root',
    size: { kind: 'equal' },
    content: {
      kind: 'split',
      axis: 'vertical',
      division: 'panel',
      children: [
        leaf('l', { kind: 'door', leaves: 1, hinge: 'left' }),
        leaf('r', { kind: 'door', leaves: 1, hinge: 'right' }),
      ],
    },
  }

  // Overlay: the two fronts cover the division between them and meet over its midline, so the gap
  // between them is one reveal — the division is not visible.
  it('leaves one reveal between two overlay fronts over a division', () => {
    const [left, right] = cellsOf(DIVIDED, geom())
    expect(right.rect.x0 - left.rect.x1).toBeCloseTo(3, 9)
  })

  // Inset: the division *is* visible between the two fronts, so the gap between them is the
  // division plus two reveals. The rule that holds is the spec's own — every inset front clears
  // surrounding material by exactly one reveal — so that is what is asserted. Asserting a
  // front-to-front gap of one reveal here would be asserting the wrong cabinet.
  it('clears the division by exactly one reveal on each side, inset', () => {
    const tree = resolveSections(DIVIDED, OPENING, () => 18)
    const [division] = tree.divisions
    const [left, right] = frontCells(DIVIDED, tree, geom({ mount: 'inset' }))
    expect(division.rect.x0 - left.rect.x1).toBeCloseTo(3, 9)
    expect(right.rect.x0 - division.rect.x1).toBeCloseTo(3, 9)
  })

  // A two-leaf door is one front on one section: the pair splits the cell with a reveal between
  // them, and each leaf is hinged on its own outer edge.
  it('splits a two-leaf door into a hinged pair with one reveal between', () => {
    const cells = cellsOf(leaf('a', { kind: 'door', leaves: 2, hinge: 'left' }), geom())
    expect(cells).toHaveLength(2)
    expect(cells[1].rect.x0 - cells[0].rect.x1).toBeCloseTo(3, 9)
    expect(cells.map((c) => c.hinge)).toEqual(['left', 'right'])
    expect(cells.map((c) => c.leaf)).toEqual([0, 1])
  })

  // A split with `division: 'none'` puts two fronts edge to edge with no material between. Each
  // must take half a reveal there, not a full one, or the gap comes out at two reveals.
  it('takes half a reveal where a front abuts another front with no division between', () => {
    const door = { kind: 'door', leaves: 1, hinge: 'left' } as const
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [leaf('l', door), leaf('r', door)],
      },
    }
    const [left, right] = cellsOf(root, geom({ mount: 'inset' }))
    expect(right.rect.x0 - left.rect.x1).toBeCloseTo(3, 9)
    // …and the outer edges still take a full reveal from the carcase.
    expect(left.rect.x0).toBeCloseTo(OPENING.x0 + 3, 9)
    expect(right.rect.x1).toBeCloseTo(OPENING.x1 - 3, 9)
  })

  it('carries the section id and the spec through', () => {
    const spec = { kind: 'drawer-front' } as const
    const [cell] = cellsOf(leaf('a', spec), geom())
    expect(cell.sectionId).toBe('a')
    expect(cell.spec).toEqual(spec)
  })

  // A split section holds no front of its own — its children do — matching `sectionInteriors`.
  it('never lists a split section', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'panel',
        children: [leaf('a'), leaf('b', { kind: 'panel' })],
      },
      front: { kind: 'door', leaves: 1, hinge: 'left' },
    }
    expect(cellsOf(root, geom()).map((c) => c.sectionId)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/scene/frontCells.test.ts`
Expected: FAIL — `Failed to resolve import "./frontCells"`.

- [ ] **Step 3: Write `src/scene/frontCells.ts`**

```ts
import type { Rect, ResolvedTree, Section, SectionId, FrontSpec } from './sectionTree'

export type { FrontSpec }

export interface FrontGeometry {
  // What an overlay front expands to at the cabinet's edge: x from 0 to width, z from the carcase
  // floor to its top. Passed in rather than derived, so this module needs no CarcaseParams and no
  // thickness resolver — it is about rectangles.
  outer: Rect
  mount: 'overlay' | 'inset'
  reveal: number
}

export interface FrontCell {
  sectionId: SectionId
  // Which leaf of a two-leaf door. 0 for everything else, and part of the role key, so a pair of
  // doors cannot collide on one id.
  leaf: 0 | 1
  spec: FrontSpec
  rect: Rect
  hinge: 'left' | 'right' | undefined
}

// What lies immediately beyond one edge of a section. `expandTo` is where an overlay front reaches
// on that side — the cabinet's outer edge, or the midline of the division it shares. `material`
// says whether a *full* reveal is owed there: an inset front clears carcase material by the whole
// reveal, and another front by half, so the gap between two fronts is one reveal either way.
interface Side {
  material: boolean
  expandTo: number
}

interface Sides {
  left: Side
  right: Side
  bottom: Side
  top: Side
}

// Every front on the cabinet, as a rectangle on its front face with the reveals already taken.
//
// The whole reveal rule lives here. It is stated once as: an overlay cell reaches to the material
// midline on every side and then gives back half a reveal; an inset cell is the opening itself and
// gives back a full reveal where it meets material, half where it meets another front. Both come
// out at one reveal between any two fronts, which is the property the tests assert rather than the
// coordinates.
export function frontCells(root: Section, tree: ResolvedTree, g: FrontGeometry): FrontCell[] {
  const cells: FrontCell[] = []
  const half = g.reveal / 2

  const walk = (section: Section, sides: Sides): void => {
    const rect = tree.rects.get(section.id)!

    if (section.content.kind === 'split') {
      const { axis, division, children } = section.content
      const vertical = axis === 'vertical'
      const [lo, hi] = vertical ? (['left', 'right'] as const) : (['bottom', 'top'] as const)
      children.forEach((child, i) => {
        const childRect = tree.rects.get(child.id)!
        const first = i === 0
        const last = i === children.length - 1
        // Between two children there is either a division panel — material, and an overlay front
        // reaches its midline — or nothing at all, in which case the two fronts meet on the
        // section boundary and each gives back half a reveal.
        const between = (near: number, far: number): Side =>
          division === 'none'
            ? { material: false, expandTo: near }
            : { material: true, expandTo: (near + far) / 2 }
        walk(child, {
          ...sides,
          [lo]: first
            ? sides[lo]
            : between(
                vertical ? childRect.x0 : childRect.z0,
                vertical ? tree.rects.get(children[i - 1].id)!.x1 : tree.rects.get(children[i - 1].id)!.z1,
              ),
          [hi]: last
            ? sides[hi]
            : between(
                vertical ? childRect.x1 : childRect.z1,
                vertical ? tree.rects.get(children[i + 1].id)!.x0 : tree.rects.get(children[i + 1].id)!.z0,
              ),
        })
      })
      return
    }

    const spec = section.front
    if (spec === undefined) return

    const cell: Rect =
      g.mount === 'overlay'
        ? {
            x0: sides.left.expandTo + half,
            x1: sides.right.expandTo - half,
            z0: sides.bottom.expandTo + half,
            z1: sides.top.expandTo - half,
          }
        : {
            x0: rect.x0 + (sides.left.material ? g.reveal : half),
            x1: rect.x1 - (sides.right.material ? g.reveal : half),
            z0: rect.z0 + (sides.bottom.material ? g.reveal : half),
            z1: rect.z1 - (sides.top.material ? g.reveal : half),
          }

    if (spec.kind === 'door' && spec.leaves === 2) {
      // The pair divides the cell, one reveal between them. Each leaf is hinged on its own outer
      // edge, which is what makes `hinge` meaningless on a two-leaf door and unread here.
      const mid = (cell.x0 + cell.x1) / 2
      cells.push(
        { sectionId: section.id, leaf: 0, spec, rect: { ...cell, x1: mid - half }, hinge: 'left' },
        { sectionId: section.id, leaf: 1, spec, rect: { ...cell, x0: mid + half }, hinge: 'right' },
      )
      return
    }

    cells.push({
      sectionId: section.id,
      leaf: 0,
      spec,
      rect: cell,
      hinge: spec.kind === 'door' ? spec.hinge : undefined,
    })
  }

  walk(root, {
    left: { material: true, expandTo: g.outer.x0 },
    right: { material: true, expandTo: g.outer.x1 },
    bottom: { material: true, expandTo: g.outer.z0 },
    top: { material: true, expandTo: g.outer.z1 },
  })
  return cells
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/scene/frontCells.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Mutation check — the half-reveal between fronts**

Apply with Python, not `sed` (a `sed` pattern that matches nothing looks exactly like a surviving
mutation; that happened twice in this session):

```python
p = 'src/scene/frontCells.ts'
s = open(p).read()
old = "            ? { material: false, expandTo: near }"
new = "            ? { material: true, expandTo: near }"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Then **grep to confirm it applied**: `grep -n "material: true, expandTo: near" src/scene/frontCells.ts`
Run: `pnpm vitest run src/scene/frontCells.test.ts`
Expected: FAIL on *takes half a reveal where a front abuts another front* — the gap comes out at
2 × reveal. Restore from git: `git checkout src/scene/frontCells.ts`, and grep again to confirm.

- [ ] **Step 6: Run the full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` — read the exit codes directly, **never pipe
through `tail` or `head`**.
Expected: PASS, count up by 8.

```bash
git add src/scene/frontCells.ts src/scene/frontCells.test.ts src/scene/sectionTree.ts
git commit -m "feat(scene): a section can state the front that covers it"
```

- [ ] **Acceptance:** the full suite passes with its count unchanged apart from your additions. Nothing consumes this yet.

## Group B — the switch

**Files:**
- Modify: `src/scene/types.ts` (three `CarcaseParams` fields)
- Modify: `src/scene/carcaseRoles.ts` (front boxes, contact pairs)
- Modify: `src/scene/grain.ts` (the `front-` family)
- Modify: `src/scene/resolveThickness.ts` (the front material slot)
- Modify: `src/scene/carcasePresets.ts` (`DEFAULT_FRONT_MATERIAL`, the three new fields)
- Modify: `src/scene/useFile.ts` (v17)
- Modify: `src/scene/__fixtures__/sweep.ts`
- Tests: `src/scene/carcaseRoles.test.ts`, `src/scene/grain.test.ts`, `src/scene/useFile.test.ts`, `src/scene/jointChecklist.test.ts`

### B1 — three fields on `CarcaseParams`

- [ ] **Step 1: Add them in `src/scene/types.ts`, after `backMaterial`/before `hasTop`**

```ts
  // Fronts draw on their own slot, so a shaker door in oak on a ply carcase is one field, not a
  // per-part override on every door. Material is the nest's grouping key, so this also gives the
  // fronts their own sheet count and cost line in the yield report.
  frontMaterial: string
```

and after `toeKickSetback`:

```ts
  // Inset sits the front in the opening, `y ∈ [0, FT]`; overlay puts it in front of the carcase,
  // `y ∈ [−FT, 0]`. The difference is not cosmetic: an overlay front lands on the carcase face and
  // is a contact pair, an inset one is a reveal clear of everything.
  frontMount: 'overlay' | 'inset'
  // The visible gap, everywhere. One number governs the gap between two fronts, between a front and
  // the carcase, and between the doors of two cabinets standing side by side.
  frontReveal: number
```

- [ ] **Step 2: Run `pnpm typecheck` and read the list of call sites it names**

Expected: FAIL, listing every object literal that builds a `CarcaseParams`. That list is the work
for the rest of B1: the three presets, the sweep fixture, and each test fixture. Give them
`frontMaterial: DEFAULT_FRONT_MATERIAL`, `frontMount: 'overlay'`, `frontReveal: 3`.

- [ ] **Step 3: Add the default to `src/scene/carcasePresets.ts`**

Beside `DEFAULT_CARCASE_MATERIAL`:

```ts
// Fronts are the same 18 mm ply as the carcase until someone says otherwise. A separate slot with
// the same default is the point: changing it is one edit, and the nest reports it separately.
export const DEFAULT_FRONT_MATERIAL = DEFAULT_CARCASE_MATERIAL
```

and in `COMMON`:

```ts
  frontMaterial: DEFAULT_FRONT_MATERIAL,
  // Overlay, because it is what a frameless cabinet is: the doors cover the carcase edges. Inset is
  // a decision, not a default — it needs tighter tolerances and it moves every shelf back.
  frontMount: 'overlay',
  // 3 mm: the gap a frameless kitchen is usually built to, and small enough that a wrong reveal
  // reads as a defect rather than as a style.
  frontReveal: 3,
```

- [ ] **Step 4: Run `pnpm typecheck` until it passes**

### B2 — the front material slot

- [ ] **Step 1: Write the failing test in `src/scene/resolveThickness.test.ts`**

```ts
it('draws a front on the front slot, not the carcase slot', () => {
  const slots = { carcaseMaterial: '18mm Ply', backMaterial: '12mm MDF', frontMaterial: '25mm Ply' }
  const materials = {
    '18mm Ply': { thickness: 18 },
    '12mm MDF': { thickness: 12 },
    '25mm Ply': { thickness: 25 },
  }
  const thicknessOf = roleThicknessFor(slots, materials, new Map())
  expect(thicknessOf('front-sec_a-0')).toBe(25)
  expect(thicknessOf('left-side')).toBe(18)
  expect(thicknessOf('back')).toBe(12)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/scene/resolveThickness.test.ts -t "front slot"`
Expected: FAIL — `expected 18 to be 25`. It falls through to the carcase slot.

- [ ] **Step 3: Widen `MaterialSlots` and `materialForRole` in `src/scene/resolveThickness.ts`**

```ts
export interface MaterialSlots {
  carcaseMaterial: string
  backMaterial: string
  frontMaterial: string
}
```

```ts
export function materialForRole(
  slots: MaterialSlots,
  overrides: Map<string, PartOverrides>,
  role: string,
): string {
  const own = overrides.get(role)?.material
  if (own !== undefined) return own
  if (role === 'back') return slots.backMaterial
  // A family, not a name: a front's role carries the section it covers and which leaf it is.
  if (role.startsWith('front-')) return slots.frontMaterial
  return slots.carcaseMaterial
}
```

- [ ] **Step 4: Run it and confirm it passes**

### B3 — grain

- [ ] **Step 1: Add the case to `src/scene/grain.ts`, beside the `back` line**

```ts
  // Grain runs vertical on every front, and a front is a thickness-on-y panel exactly like the
  // back — so it joins that branch verbatim and `grainFieldFor('y', 'z')` resolves it to 'length'
  // through the existing GRAIN_IN_PLANE map. No new map entry.
  if (role.startsWith('front-')) return 'z'
```

- [ ] **Step 2: Add the family to `familyOf` in `src/scene/grain.test.ts`**

The helper strips a trailing `-\d+`, which would leave the section id in the family name — the same
fix `adj-shelf-` needed in Stage D:

```ts
  if (b.role.startsWith('front-')) return 'front'
```

### B4 — the boxes

- [ ] **Step 1: Write the failing tests in `src/scene/carcaseRoles.test.ts`**

Add a `describe('fronts', …)` block after `describe('adjustable shelves', …)`:

```ts
describe('fronts', () => {
  const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const

  const fronted = (p: CarcaseParams, front = DOOR): CarcaseParams => ({
    ...p,
    section: { ...p.section, front },
  })

  const frontBoxes = (p: CarcaseParams) =>
    carcaseBoxes(p).filter((b) => b.role.startsWith('front-'))

  const oneBay: CarcaseParams = { ...base, section: sec([], 0) }

  it('emits one board per front cell', () => {
    expect(frontBoxes(fronted(oneBay))).toHaveLength(1)
  })

  it('emits none for a section with no front', () => {
    expect(frontBoxes(oneBay)).toEqual([])
  })

  // Overlay sits in front of the carcase face, inset sits in the opening. The y extent is the whole
  // difference between the two mounts, so it is asserted as the difference.
  it('places an overlay front before the carcase face and an inset front in the opening', () => {
    const [overlay] = frontBoxes(fronted({ ...oneBay, frontMount: 'overlay' }))
    expect(overlay.box.y0).toBeCloseTo(-T, 9)
    expect(overlay.box.y1).toBeCloseTo(0, 9)

    const [inset] = frontBoxes(fronted({ ...oneBay, frontMount: 'inset' }))
    expect(inset.box.y0).toBeCloseTo(0, 9)
    expect(inset.box.y1).toBeCloseTo(T, 9)
  })

  it('is a thickness-on-y panel that runs grain along its length', () => {
    for (const r of carcaseRoles(fronted(oneBay)).filter((r) => r.role.startsWith('front-'))) {
      expect(r.grain).toBe('length')
    }
    expect(frontBoxes(fronted(oneBay))[0].thicknessAxis).toBe('y')
  })

  // A front hangs on hardware and is housed in nothing, so it appears in no joint descriptor and
  // `extendToward` never reaches it. Were it ever to appear, its length would grow by a groove
  // depth and every reveal on the cabinet would be wrong.
  it('is housed in nothing, so no joint extends it', () => {
    const p = fronted(oneBay)
    const fronts = new Set(frontBoxes(p).map((b) => b.role))
    for (const d of carcaseJoints(p, 'cmp_1')) {
      expect(fronts.has(d.housingRole), d.housingRole).toBe(false)
      expect(fronts.has(d.housedRole), d.housedRole).toBe(false)
    }
  })

  // The governing rule, measured on the emitted boxes rather than on the cell arithmetic. The two
  // mounts state it differently and that difference is real: overlay fronts cover the division and
  // meet over it, so the gap between *them* is one reveal; inset fronts sit either side of a
  // division that stays visible, so each clears *it* by one reveal. Asserting a front-to-front gap
  // for both would be asserting a cabinet that does not exist.
  const twoDoors = (frontMount: 'overlay' | 'inset'): CarcaseParams => {
    const divided: CarcaseParams = { ...base, frontMount, section: sec([0.5], 0) }
    if (divided.section.content.kind !== 'split') throw new Error('fixture is not a split')
    return {
      ...divided,
      section: {
        ...divided.section,
        content: {
          ...divided.section.content,
          children: divided.section.content.children.map((c) => ({ ...c, front: DOOR })),
        },
      },
    }
  }

  it('leaves one reveal between two overlay fronts', () => {
    const p = twoDoors('overlay')
    const [left, right] = frontBoxes(p).sort((a, b) => a.box.x0 - b.box.x0)
    expect(right.box.x0 - left.box.x1).toBeCloseTo(p.frontReveal, 9)
  })

  it('clears the partition by one reveal on each side when inset', () => {
    const p = twoDoors('inset')
    const [left, right] = frontBoxes(p).sort((a, b) => a.box.x0 - b.box.x0)
    const partition = carcaseBoxes(p).find(
      (b) => b.role.startsWith('division-') && b.thicknessAxis === 'x',
    )!
    expect(partition.box.x0 - left.box.x1).toBeCloseTo(p.frontReveal, 9)
    expect(right.box.x0 - partition.box.x1).toBeCloseTo(p.frontReveal, 9)
  })

  // An overlay front lands on the carcase face and is fixed to it; an inset one is a reveal clear
  // of everything. The asymmetry is the point — a contact the generator does not name becomes an
  // unjoined pair on the joinery checklist forever, which is what Stage D learned from a shelf.
  it('contacts the panels it covers when overlaid, and nothing when inset', () => {
    const overlay = fronted({ ...oneBay, frontMount: 'overlay' })
    const role = frontBoxes(overlay)[0].role
    const covered = carcaseContactPairs(overlay)
      .filter(([a, b]) => a === role || b === role)
      .map(([a, b]) => (a === role ? b : a))
      .sort()
    expect(covered).toEqual(['bottom', 'left-side', 'right-side', 'top'])

    const inset = fronted({ ...oneBay, frontMount: 'inset' })
    const insetRole = frontBoxes(inset)[0].role
    expect(carcaseContactPairs(inset).filter(([a, b]) => a === insetRole || b === insetRole)).toEqual(
      [],
    )
  })

  it('gives a two-leaf door two boards that do not overlap', () => {
    const pair = fronted(oneBay, { kind: 'door', leaves: 2, hinge: 'left' })
    const [l, r] = frontBoxes(pair).sort((a, b) => a.box.x0 - b.box.x0)
    expect(r.box.x0).toBeGreaterThan(l.box.x1)
  })
})
```

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t fronts`
Expected: FAIL — every one, with empty arrays.

- [ ] **Step 3: Emit the boxes in `carcaseBoxes`, after the adjustable-shelf loop**

```ts
  // Fronts last: the build order runs shell, then what divides it, then what sits inside, then what
  // covers it. A front is housed in nothing, so no joint descriptor names it and the extension pass
  // in `carcaseRoles` passes it through face-to-face sized.
  let faced = 0
  for (const cell of cells) {
    const role = `front-${cell.sectionId}-${cell.leaf}`
    const FT = thicknessOf(role)
    faced += 1
    boxes.push({
      role,
      label: `${FRONT_LABEL[cell.spec.kind]} ${faced}`,
      box: {
        x0: cell.rect.x0,
        x1: cell.rect.x1,
        // Inset sits in the opening, overlay in front of the carcase face. Both are measured from
        // y = 0, which is the cabinet's front throughout the generator.
        y0: p.frontMount === 'inset' ? 0 : -FT,
        y1: p.frontMount === 'inset' ? FT : 0,
        z0: cell.rect.z0,
        z1: cell.rect.z1,
      },
      thicknessAxis: 'y',
    })
  }
```

with, beside the other tables in the module:

```ts
// What a front is called in the cutting list. A door and a false front are different parts to make
// and to price, so they are different words even where the geometry is identical.
const FRONT_LABEL: Record<FrontSpec['kind'], string> = {
  door: 'Door',
  'drawer-front': 'Drawer Front',
  'false-front': 'False Front',
  panel: 'Panel',
}
```

`cells` is the single `frontCells` call Group C hoists above both loops; write it now, above the
adjustable-shelf loop, so C has nothing to move:

```ts
  const cells = frontCells(p.section, tree, {
    // The carcase *body*, which is what a front covers: from the bottom panel's underside to the
    // top. `floorZ` already returns `toeKickHeight` for both a toe kick and a ladder and 0
    // otherwise, so no base-mode branch is needed. Not `carcaseZ0`: under a toe kick the sides run
    // to the ground and a door that followed them would cover the kick.
    outer: { x0: 0, x1: W, z0: floorZ(p), z1: H },
    mount: p.frontMount,
    reveal: p.frontReveal,
  })
  const frontedSections = new Set(cells.map((c) => c.sectionId))
```

`FRONT_LABEL` needs `FrontSpec` in scope: add it to the existing `./sectionTree` type import at the
top of `carcaseRoles.ts`, and `frontCells` to a new value import from `./frontCells`.

- [ ] **Step 4: Add the contact pairs in `carcaseContactPairs`**

```ts
  // An overlay front lands flat on every carcase panel it covers, and is fixed to it — by hinges,
  // by screws through a drawer box, by whatever hangs it. That is a contact, not joinery, and a
  // contact the generator does not name is an unjoined pair on the checklist forever. An inset
  // front is a reveal clear of everything and contributes none.
  if (p.frontMount === 'overlay') {
    const boxes = carcaseBoxes(p, thicknessOf)
    // The same geometry `carcaseBoxes` built the fronts from. Recomputing it with a different
    // `outer` here would put the contacts under rectangles that are not the ones on the cabinet.
    for (const cell of frontCells(p.section, tree, {
      outer: { x0: 0, x1: p.width, z0: floorZ(p), z1: p.height },
      mount: p.frontMount,
      reveal: p.frontReveal,
    })) {
      const role = `front-${cell.sectionId}-${cell.leaf}`
      for (const b of boxes) {
        // The carcase face is y = 0. Every panel that reaches it and lies behind the front's
        // rectangle is under it; the toe kick and the ladder rails are set back and are not.
        if (b.box.y0 !== 0 || b.role.startsWith('front-')) continue
        if (b.box.x1 <= cell.rect.x0 || b.box.x0 >= cell.rect.x1) continue
        if (b.box.z1 <= cell.rect.z0 || b.box.z0 >= cell.rect.z1) continue
        pairs.push([role, b.role])
      }
    }
  }
```

`tree` is already resolved in that function for the back/division pairs; if the `backMode !== 'none'`
guard scopes it, hoist the `resolveSections` call above that guard first.

- [ ] **Step 5: Run and confirm the fronts tests pass**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t fronts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Mutation check — the extension pass must never reach a front**

```python
p = 'src/scene/carcaseRoles.ts'
s = open(p).read()
old = "        y0: p.frontMount === 'inset' ? 0 : -FT,"
new = "        y0: p.frontMount === 'inset' ? 0 : -FT - 6,"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Grep to confirm: `grep -n "\-FT - 6" src/scene/carcaseRoles.ts`
Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t fronts`
Expected: FAIL on *places an overlay front before the carcase face* **and** on *contacts the panels
it covers* — the front no longer reaches `y = 0`, so nothing touches it. Restore with
`git checkout src/scene/carcaseRoles.ts` and grep again.

- [ ] **Step 7: Run the full suite; expect the checklist counts to move**

Run: `pnpm test`
Expected: the `jointChecklist`, `SceneSuggestionsPanel` and `regenerateComponents` counts move **only
if a preset ships a front**. Until B6 they do not, so expect PASS. If anything else fails, that is a
real regression — read it rather than re-baselining it.

### B5 — file format v17

- [ ] **Step 1: Write the failing `parseFile` test in `src/scene/useFile.test.ts`**

`CLAUDE.md` records that `useFile.ts` types `base.params` loosely, so `tsc` cannot see a file-format
regression here. **A `parseFile` test is required, not a green typecheck.**

```ts
describe('v16 → v17 migration', () => {
  const v16 = (params: Record<string, unknown>) =>
    JSON.stringify({
      version: 16,
      scene: {
        parts: [],
        materials: { '18mm Ply': { thickness: 18 }, '12mm MDF': { thickness: 12 } },
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
            params: {
              width: 600,
              height: 720,
              depth: 560,
              carcaseMaterial: '18mm Ply',
              backMaterial: '12mm MDF',
              hasTop: true,
              backMode: 'captured',
              baseMode: 'toe-kick',
              toeKickHeight: 100,
              toeKickSetback: 60,
              jointMethod: 'butt-screw',
              section: legacyToSection([], 0, 600, 18),
              ...params,
            },
          },
        ],
      },
    })

  const carcaseOf = (text: string) => {
    const c = parseFile(text).scene.components[0]
    if (c.kind !== 'carcase') throw new Error('not a carcase')
    return c.params
  }

  // A pre-v17 file states no front slot at all, and every read site downstream treats the three
  // fields as present — `carcaseBoxes` dereferences `frontMount` on every call.
  it('fills the three front fields a pre-v17 file cannot state', () => {
    const p = carcaseOf(v16({}))
    expect(p.frontMaterial).toBe('18mm Ply')
    expect(p.frontMount).toBe('overlay')
    expect(p.frontReveal).toBe(3)
  })

  // A file that has no fronts must not gain any: a door appearing in someone's saved cabinet is a
  // change to what they drew, not a migration.
  it('invents no fronts', () => {
    const p = carcaseOf(v16({}))
    const boxes = carcaseBoxes(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()))
    expect(boxes.filter((b) => b.role.startsWith('front-'))).toEqual([])
  })

  it('leaves the three fields alone when the file already states them', () => {
    const p = carcaseOf(
      v16({ frontMaterial: '12mm MDF', frontMount: 'inset', frontReveal: 2 }),
    )
    expect(p.frontMaterial).toBe('12mm MDF')
    expect(p.frontMount).toBe('inset')
    expect(p.frontReveal).toBe(2)
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm vitest run src/scene/useFile.test.ts -t "v17"`
Expected: FAIL — `expected undefined to be '18mm Ply'`.

- [ ] **Step 3: Bump the version and fill the fields in `src/scene/useFile.ts`**

```ts
export const FILE_FORMAT_VERSION = 17
```

In the `base.kind === 'carcase'` branch, widen the `legacy` type with the three optional fields and
add them to the `params` object:

```ts
        // v16→v17: fronts arrive. A pre-v17 file states no front slot, so the three fields are
        // defaulted here and nowhere else — every read site downstream treats them as present, and
        // `carcaseBoxes` dereferences `frontMount` on every call. No `front` is seeded on any
        // section: a door appearing in a saved cabinet is a change to what the user drew.
        frontMaterial: legacy.frontMaterial ?? DEFAULT_FRONT_MATERIAL,
        frontMount: legacy.frontMount ?? 'overlay',
        frontReveal: legacy.frontReveal ?? 3,
```

- [ ] **Step 4: Run and confirm it passes; then run the full suite**

Run: `pnpm vitest run src/scene/useFile.test.ts` then `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 5: Mutation check — the migration must not invent fronts**

```python
p = 'src/scene/useFile.ts'
s = open(p).read()
old = "        frontMount: legacy.frontMount ?? 'overlay',"
new = "        frontMount: legacy.frontMount ?? 'inset',"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Grep: `grep -n "?? 'inset'" src/scene/useFile.ts`
Expected: FAIL on *fills the three front fields*. Restore and grep again.

### B6 — the sweep, and whether the presets ship a door

- [ ] **Step 1: Give the sweep fronts**

`src/scene/__fixtures__/sweep.ts` is what proves `grainAxisOf` is total over the whole role space.
Stage D found it reached neither a pin row nor an adjustable shelf; without this it reaches no front
either, and the role-coverage test in `grain.test.ts` would pass while the new family was
unreachable from it. Seed a door on every leaf, and sweep **both mounts**:

```ts
const FRONTED: FrontSpec = { kind: 'door', leaves: 1, hinge: 'left' }

const seedFronts = (root: Section): Section =>
  root.content.kind === 'leaf'
    ? { ...root, front: FRONTED }
    : { ...root, content: { ...root.content, children: root.content.children.map(seedFronts) } }
```

and add `frontMount` to the sweep's loop variables, beside `baseMode` and `backMode`. The case count
doubles from 96 to 192; `grain.test.ts` asserts the sweep's size, so update that number and its
comment.

- [ ] **Step 2: DECISION REQUIRED — do the presets ship a door?**

**Do not decide this alone.** Stage D's equivalent question was put to the user and answered against
the recommendation, and preset content is a product decision with a visible cost: a Base 600 gaining
a door adds a board, four contact pairs, and a nest group, and moves every checklist count in the
suite plus three e2e specs.

The recommendation to put to them: **yes, Base 600 and Wall 600 ship a single overlay door; Tall 600
ships a two-leaf door.** The Stage D argument applies unchanged — a cabinet generator whose cabinets
have no doors describes a carcase, not a cabinet — and the alternative leaves fronts unreachable
except through the group E panel.

If the answer is yes: measure the new counts **before** editing any expectation, exactly as Stage D
did. Write a scratch test that runs `regenerateComponents` → `reconcileJoints` → `nestSheets` on the
preset, write its output to the scratchpad, delete the scratch file, and move each expectation to the
measured figure. Deltas should be uniform across cabinets; a non-uniform one is a bug, not a
re-baseline.

- [ ] **Step 3: Run everything and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat(scene): a section wears a front, inset or overlaid"
```

## Group C — the shelf setback follows the front

**Files:**
- Modify: `src/scene/carcaseRoles.ts`
- Test: `src/scene/carcaseRoles.test.ts`

An inset front occupies `y ∈ [0, FT]`; a shelf sits at `y0 = SHELF_FRONT_SETBACK = 5`. With an 18 mm
front they intersect by 13 mm — a shelf driven through a closed door.

- [ ] **Step 1: Write the failing test**

```ts
  // An inset front occupies the first FT millimetres of the opening. A shelf seated in front of it
  // is a shelf driven through a closed door — invisible in the viewport from outside, and a defect
  // in the cutting list's depth.
  it('holds a shelf behind an inset front, and does not move it for an overlay one', () => {
    const shelvedBay = (mount: 'inset' | 'overlay'): CarcaseParams => ({
      ...base,
      frontMount: mount,
      section: {
        ...shelved(sec([], 0), { shelves: 1 }),
        front: { kind: 'door', leaves: 1, hinge: 'left' },
      },
    })
    const shelfOf = (p: CarcaseParams) =>
      carcaseBoxes(p).find((b) => b.role.startsWith('adj-shelf-'))!

    expect(shelfOf(shelvedBay('inset')).box.y0).toBeGreaterThanOrEqual(T)
    expect(shelfOf(shelvedBay('overlay')).box.y0).toBeCloseTo(5, 9)
  })
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t "inset front"`
Expected: FAIL — `expected 5 to be greater than or equal to 18`.

- [ ] **Step 3: Make the setback a function of the front**

In `carcaseBoxes`, inside the adjustable-shelf loop, replace `y0: SHELF_FRONT_SETBACK` with:

```ts
        // An inset front stands in the first FT millimetres of the opening, so the shelf starts
        // behind it plus the same clearance it keeps from every other panel. An overlay front is in
        // front of y = 0 and costs nothing. The constant is the floor, never the answer.
        y0: Math.max(SHELF_FRONT_SETBACK, insetDepthOf(sectionId) + SHELF_CLEARANCE),
```

with, defined once above the loop, beside the `frontedSections` set B4 already built:

```ts
  // 0 unless this section actually wears an inset front: an opening with no door has nothing to
  // clear, and asking the *cabinet* instead of the section would set every shelf in the carcase
  // back because one opening has a door.
  const insetDepthOf = (sectionId: SectionId): number =>
    p.frontMount === 'inset' && frontedSections.has(sectionId)
      ? thicknessOf(`front-${sectionId}-0`)
      : 0
```

`sectionId` is already destructured from `sectionInteriors` in that loop. `SectionId` needs adding
to the `./sectionTree` type import if it is not there yet.

- [ ] **Step 4: Run and confirm it passes, then run the full suite**

- [ ] **Step 5: Mutation check**

```python
p = 'src/scene/carcaseRoles.ts'
s = open(p).read()
old = "        y0: Math.max(SHELF_FRONT_SETBACK, insetDepthOf(sectionId) + SHELF_CLEARANCE),"
new = "        y0: SHELF_FRONT_SETBACK,"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Grep, run, expect FAIL on the new test, restore, grep again.

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(scene): a shelf sits behind the inset front, not through it"
```

## Group D — shelves behind a door

`InteriorSpec` gains `fixedShelves: number` — shelves that do **not** split the section, so the
section stays a leaf and can wear one front. Stage D left this out deliberately, because until a
front existed it was indistinguishable from a horizontal split with `division: 'panel'`.

**Files:**
- Modify: `src/scene/sectionTree.ts` (`AdjustableSpec`'s sibling in `InteriorSpec`)
- Modify: `src/scene/sectionInterior.ts` (`defaultInterior`)
- Modify: `src/scene/carcaseRoles.ts` (boxes, joints, contacts)
- Modify: `src/scene/useFile.ts` (v17 seeds `fixedShelves: 0`)
- Test: `src/scene/carcaseRoles.test.ts`

- [ ] **Step 1: Add the field**

```ts
export interface InteriorSpec {
  // Shelves that do not divide the section. A *split* with `division: 'panel'` makes a shelf too,
  // and until fronts existed the two were observationally identical — but a split section is two
  // sections and would want two doors, so a shelf behind one door has to be stated here.
  fixedShelves: number
  adjustable: AdjustableSpec
}
```

- [ ] **Step 2: Write the failing tests**

```ts
  // A fixed shelf inside a section is housed in the panels bounding that section, spreads evenly
  // through its clear height, and — unlike a loose shelf — is jointed to them.
  it('emits a fixed shelf per interior, evenly spaced and jointed', () => {
    const p: CarcaseParams = {
      ...base,
      section: seedInteriors(sec([], 0), {
        fixedShelves: 2,
        adjustable: { ...ADJ, shelves: 0 },
      }),
    }
    const fixed = carcaseBoxes(p).filter((b) => b.role.startsWith('fixed-shelf-'))
    expect(fixed).toHaveLength(2)
    const gaps = [
      fixed[0].box.z0 - 118,
      fixed[1].box.z0 - fixed[0].box.z1,
      702 - fixed[1].box.z1,
    ]
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)

    const jointed = new Set(
      carcaseJoints(p, 'cmp_1').flatMap((d) => [d.housingRole, d.housedRole]),
    )
    for (const b of fixed) expect(jointed.has(b.role), b.role).toBe(true)
  })

  it('emits none when the interior asks for none', () => {
    const p: CarcaseParams = { ...base, section: shelved(sec([], 0), { shelves: 0 }) }
    expect(carcaseBoxes(p).filter((b) => b.role.startsWith('fixed-shelf-'))).toEqual([])
  })
```

- [ ] **Step 3: Run and confirm they fail**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t "fixed shelf"`
Expected: FAIL — `expected [] to have a length of 2`.

- [ ] **Step 4: Emit the boxes in `carcaseBoxes`, between the divisions and the adjustable shelves**

```ts
  // A fixed shelf inside a section, which is not the same thing as a horizontal split: a split
  // makes two sections and would want two fronts, so a shelf *behind one door* has to come from
  // the interior instead. Emitted before the loose shelves because it is structure and they rest
  // between it.
  let housed = 0
  for (const { sectionId, rect, spec } of sectionInteriors(p.section, tree)) {
    const n = spec.fixedShelves
    if (n < 1) continue
    const role0 = `fixed-shelf-${sectionId}-0`
    const t = thicknessOf(role0)
    // The clear height the bays share, once the shelves have taken their own thickness out of it —
    // the same subtraction `resolveSpans` makes for a split, so n shelves leave n + 1 equal bays.
    const bay = (rect.z1 - rect.z0 - n * t) / (n + 1)
    for (let i = 0; i < n; i++) {
      const role = `fixed-shelf-${sectionId}-${i}`
      const z0 = rect.z0 + (i + 1) * bay + i * t
      housed += 1
      boxes.push({
        role,
        label: `Fixed Shelf ${housed}`,
        box: { x0: rect.x0, x1: rect.x1, y0: 0, y1: shelfBackY, z0, z1: z0 + t },
        thicknessAxis: 'z',
      })
    }
  }
```

Note `y0: 0` and `y1: shelfBackY` — the same depth extent a horizontal division has, because it is
the same part. It is jointed to the uprights, so unlike a loose shelf it neither needs nor wants the
clearances `SHELF_CLEARANCE` and `SHELF_FRONT_SETBACK` give.

- [ ] **Step 5: State its grain**

In `src/scene/grain.ts`, beside the `adj-shelf-` line:

```ts
  // Flat, and grain across the cabinet — the same convention the bottom, a horizontal division and
  // a loose shelf follow. A family because its role carries the section it sits in.
  if (role.startsWith('fixed-shelf-')) return 'x'
```

and in `familyOf` in `src/scene/grain.test.ts`, beside the `adj-shelf-` line:

```ts
  if (b.role.startsWith('fixed-shelf-')) return 'fixed-shelf'
```

- [ ] **Step 6: Joint it, and contact it against the back**

A fixed shelf is housed in the panels bounding its section, exactly as a horizontal division is. In
`carcaseJoints`, the loop that emits a descriptor per housed panel already resolves those panels
through `boundsOf`; extend it with the same two descriptors a division gets, using
`boundRole(bounds.left, 'left')` and `boundRole(bounds.right, 'right')` as the housing roles and the
fixed shelf as the housed role. Read the kind through `kindOf(housingRole, housedRole)` like every
other pair — do **not** hardcode `'dado'`, or a screwed cabinet grows a groove nobody cuts.

In `carcaseContactPairs`, inside the existing `p.backMode !== 'none'` block that pairs the back with
every division, add the fixed shelves the same way:

```ts
    for (const { sectionId, spec } of sectionInteriors(p.section, tree)) {
      for (let i = 0; i < spec.fixedShelves; i++) {
        pairs.push(['back', `fixed-shelf-${sectionId}-${i}`])
      }
    }
```

Run `pnpm vitest run src/scene/carcaseRoles.test.ts` after each of the two edits: the *covers every
touching pair exactly once* test is what tells you the joints and contacts add up, and it fails
loudly if one side is missing.

- [ ] **Step 7: Seed `fixedShelves: 0` in `defaultInterior` and in the v17 migration**

Both must state it, or a v16 file loads an interior missing a required field — the failure
`CLAUDE.md` warns about, invisible to `tsc`. Extend the v17 `parseFile` test:

```ts
  it('gives a migrated interior no fixed shelves', () => {
    const p = carcaseOf(v16({ section: seedInteriors(legacyToSection([], 0, 600, 18), OLD_SPEC) }))
    for (const leaf of leaves(p.section)) expect(leaf.interior?.fixedShelves).toBe(0)
  })
```

- [ ] **Step 8: Mutation check, full suite, commit**

```python
p = 'src/scene/carcaseRoles.ts'
s = open(p).read()
old = "    const bay = (rect.z1 - rect.z0 - n * t) / (n + 1)"
new = "    const bay = (rect.z1 - rect.z0 - n * t) / n"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Grep to confirm: `grep -n "n \* t) / n" src/scene/carcaseRoles.ts`
Expected: FAIL on *emits a fixed shelf per interior, evenly spaced and jointed* — the shelves march
past the section's ceiling. Restore with `git checkout src/scene/carcaseRoles.ts` and grep again.

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git commit -am "feat(scene): a section can hold fixed shelves behind its front"
```

## Group E — the UI

**Files:**
- Modify: `src/ui/CarcasePanel.tsx`
- Test: `src/ui/CarcasePanel.test.tsx`

The Shelving section already names an opening and edits that opening's interior (Stage D). A
**Front** section reuses the same picker — the same `opening` value, the same `setPickedOpening` —
and edits that opening's `front`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('CarcasePanel fronts', () => {
  afterEach(cleanup)

  const twoBays = () => carcase({ section: sec([0.5], 0) })

  const frontsOf = (params: CarcaseParams) =>
    sectionOpenings(params.section, resolvedOf(params)).map((o) => o.section.front?.kind)

  it('gives a front to the opening picked and to no other', async () => {
    const c = twoBays()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Front'))
    await userEvent.click(screen.getByRole('option', { name: 'Door' }))
    expect(frontsOf(appliedParams(onUpdate, c))).toEqual(['door', undefined])
  })

  it('offers None, which removes the front rather than storing an empty one', async () => {
    const c = carcase({
      section: { ...sec([], 0), front: { kind: 'door', leaves: 1, hinge: 'left' } },
    })
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Front'))
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    expect(frontsOf(appliedParams(onUpdate, c))).toEqual([undefined])
  })

  it('exposes the cabinet-wide mount and reveal', () => {
    renderPanel(twoBays())
    expect(screen.getByLabelText('Mount')).toBeTruthy()
    expect(screen.getByLabelText('Reveal')).toBeTruthy()
  })

  // Hinge is meaningless on a pair — each leaf is hinged on its own outer edge — so offering it
  // there would be a field that is wrong half the time.
  it('offers a hinge side only for a single-leaf door', async () => {
    const c = carcase({
      section: { ...sec([], 0), front: { kind: 'door', leaves: 1, hinge: 'left' } },
    })
    renderPanel(c)
    expect(screen.getByLabelText('Hinge')).toBeTruthy()
    cleanup()
    renderPanel(
      carcase({ section: { ...sec([], 0), front: { kind: 'door', leaves: 2, hinge: 'left' } } }),
    )
    expect(screen.queryByLabelText('Hinge')).toBeNull()
  })
})
```

`sectionOpenings` returns `{ sectionId, rect, spec }` today; add `section: Section` to
`SectionOpening` so the panel and these tests can read `front` without a second lookup, and update
`sectionInterior.test.ts`'s `toEqual` assertions for the extra field.

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx -t fronts`
Expected: FAIL — `Unable to find a label with the text of: Front`.

- [ ] **Step 3: Add `setFrontOn` to `src/scene/sectionInterior.ts`, beside `setInterior`**

```ts
// The mirror of `setInterior` for the other thing a section can carry. `undefined` **deletes** the
// key rather than storing a spec that means nothing: absence is how the model says "no front", so
// leaving an empty one behind would give it two ways to say it.
export function setFrontOn(root: Section, id: SectionId, front: FrontSpec | undefined): Section {
  if (root.id === id) {
    const { front: _dropped, ...rest } = root
    return front === undefined ? rest : { ...rest, front }
  }
  if (root.content.kind === 'leaf') return root
  return {
    ...root,
    content: {
      ...root.content,
      children: root.content.children.map((c) => setFrontOn(c, id, front)),
    },
  }
}
```

- [ ] **Step 4: Add the writer and the option table to `src/ui/CarcasePanel.tsx`**

```ts
// What a front can be. 'none' is the absence of a spec, not a member of FrontSpec — the select
// needs a value for it, the model does not.
const FRONT_KINDS: { value: 'none' | FrontSpec['kind']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'door', label: 'Door' },
  { value: 'drawer-front', label: 'Drawer front' },
  { value: 'false-front', label: 'False front' },
  { value: 'panel', label: 'Panel' },
]
```

```ts
  const front = opening?.section.front
  const setFront = (next: FrontSpec | undefined) => {
    if (opening === undefined) return
    setParams({ section: setFrontOn(p.section, opening.sectionId, next) })
  }
  // A door needs two more fields than the other kinds, and switching to it has to supply them: a
  // single leaf hinged left is what a cabinet door is unless someone says otherwise.
  const setFrontKind = (v: string) =>
    setFront(
      v === 'none'
        ? undefined
        : v === 'door'
          ? { kind: 'door', leaves: 1, hinge: 'left' }
          : { kind: v as 'drawer-front' | 'false-front' | 'panel' },
    )
```

- [ ] **Step 5: Add the section to the panel, after `Shelving`**

A `Collapsible` holding: the Front select (bound to `front?.kind ?? 'none'` and `setFrontKind`); a
Leaves select and a Hinge select, both rendered only when `front?.kind === 'door'` and Hinge only
when `front.leaves === 1`; and the two cabinet-wide fields, a Mount select over
`[{ value: 'overlay', label: 'Overlay' }, { value: 'inset', label: 'Inset' }]` and a Reveal
`DimInput` with `min={0}` — those two write `setParams`, not `setFront`, because a reveal is a
property of the cabinet and not of one opening.

Copy the markup shape from the Opening select added in Stage D: a `div.flex.items-center.gap-1.5.mb-1`
wrapping a `Label htmlFor` and a `Select`, with a matching `id` so `getByLabelText` finds it. Every
one of the five controls needs that pair or it is queryable by nothing — the accessibility defect
`DimInput`'s own comment records.

- [ ] **Step 6: Run, mutation-check the per-opening claim, and commit**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx` — expect PASS.

Mutation: make `setFrontOn` ignore the id and write the front onto every leaf.

```python
p = 'src/scene/sectionInterior.ts'
s = open(p).read()
old = "export function setFrontOn(root: Section, id: SectionId, front: FrontSpec | undefined): Section {\n  if (root.id === id) {"
new = "export function setFrontOn(root: Section, id: SectionId, front: FrontSpec | undefined): Section {\n  if (root.content.kind === 'leaf') {"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Grep to confirm, run, expect *gives a front to the opening picked and to no other* to FAIL with
`['door', 'door']`. Restore and grep again.

```bash
pnpm typecheck && pnpm lint && pnpm test
git commit -am "feat(ui): a front is chosen one opening at a time"
```

## Group F — close the stage

- [ ] `pnpm typecheck && pnpm lint && pnpm test`, exit codes read directly, **never piped through `tail`/`head`**
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e` → 16 passed. Do **not** run `playwright install`. If B6 gave the presets a door, expect `carcase.spec.ts`'s part count and both `sheets-tab.spec.ts` figures to move; recompute the nest ground truth rather than guessing it, and list which moved.
- [ ] Add an e2e that sets a front from the panel and sees the board appear, alongside the Stage D shelf one. Remember what that one cost: the section is collapsed by default and its content is `hidden` rather than unmounted, so click the section header first; and Playwright's `getByLabel` is substring and case-insensitive, so pass `{ exact: true }` for any label that is a substring of another.
- [ ] `CLAUDE.md`: v17, `frontCells.ts`, `DEFAULT_FRONT_MATERIAL`, and invariants for the reveal rule, the overlay contact, and the inset shelf setback.
- [ ] `node scripts/update-structure-html.mjs`, then update the hand-written prose the script does not touch: the `src/scene/` table, the data-model `CarcaseParams`/`Section` blocks, the version history, the Features table, and the invariants table. The page was audited to Stage D on 2026-08-29; keep it there rather than letting it drift four versions again.
- [ ] Notes: the overlay-contact finding; the inset shelf setback; whether the presets took a door and what moved; the 96 → 192 sweep.

## Acceptance

- [ ] Every visible gap equals `frontReveal`, measured on the emitted boxes: between two **overlay** fronts, and between an **inset** front and every piece of carcase material around it. The two mounts state the rule differently because an inset cabinet's divisions stay visible and an overlay cabinet's do not
- [ ] An overlay front contacts every panel it covers; an inset front contacts nothing
- [ ] No joint descriptor names a front, so the extension pass never lengthens one
- [ ] A shelf behind an inset front is behind it, by the front's own thickness plus the shelf clearance
- [ ] A two-leaf door is two boards, hinged at opposite edges, one reveal apart
- [ ] Fronts draw on `frontMaterial` and form their own nest group
- [ ] A pre-v17 file opens, gains the three fields at their defaults, and gains no fronts
- [ ] Every mutation check above was run and reported

## What Stage E deliberately does not do

- **No machining.** Hinge cups, hinge plate screws and drawer slide screws are Stage F. A front is a
  board until then — which is exactly why F is separate: bores that land in the wrong place are hard
  to tell from a front in the wrong place.
- **No drawer boxes.** A drawer front has no box behind it. The spec is explicit that slide screw
  rows will be derived from the front's own centreline for want of a box, and that the height is
  likely to move when boxes land.
- **No frame-and-panel door construction.** A door is one board. Rails, stiles and a centre panel are
  a separate design.
- **No per-front material override beyond the existing `BoardPart.overrides`**, which already covers
  it: a front is a driven board like any other.
