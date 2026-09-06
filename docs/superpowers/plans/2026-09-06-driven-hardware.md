# Driven Hardware BOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cabinet's hinges, drawer runners, shelf pins and assembly screws appear in the Hardware tab and its CSV, counted from the bores the generator already emits and priced from a global hardware library.

**Architecture:** One pure module (`carcaseHardware`) reads the scene the pipeline already produced and returns `{ componentId, cabinetLabel, key, qty }` lines. `App` computes them, `BomModal` prices them against an IndexedDB hardware library and renders them above the hand-typed items. Nothing is stored in the `.zimmu` file and nothing enters the regeneration pipeline.

**Tech Stack:** TypeScript strict, Vitest + happy-dom + @testing-library/react, React 19, IndexedDB (fake-indexeddb in tests). No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-06-driven-hardware-design.md`
**Notes:** `docs/superpowers/notes/2026-09-06-driven-hardware-notes.md`

---

## Before you start

Read the spec. Two rules from it govern every task here:

1. **Quantity comes from what the pipeline emitted; the variant comes from the cabinet.** Counts are read off hole-array cuts on parts, never re-derived from `CarcaseParams`.
2. **Every property is tested from two independent derivations.** A test that counts cups on both sides passes however wrong `hingeCount` is. Sweep the stated table against the pass.

Repo commands: `pnpm typecheck && pnpm lint && pnpm test` before every commit (a pre-commit hook runs typecheck anyway). Run one file with `pnpm vitest run <path>`.

**Measured facts you will need** (from the spec, re-measured at design time — do not re-derive them):

| preset | leaves | cups | adj. shelves | drawer bays | screws |
|---|---|---|---|---|---|
| Base 600 (W600 H720 D560, toe kick, captured 12 mm back) | 1 | 2 | 1 | 0 | 32 |
| Wall 600 (D330, no toe kick) | 1 | 2 | 1 | 0 | 28 |
| Tall 600 (H2100, door pair) | 2 | 4+4 | 0 (4 fixed) | 0 | 66 |

**No preset has a drawer bay.** Every runner test builds its own `drawer-front` cell. A one-bay preset also cannot distinguish "the right opening" from "the first opening" — Stage G3 was bitten by that three times.

## File structure

| file | responsibility |
|---|---|
| `src/scene/hardwareCatalogue.ts` | **create.** Stated key → `{ name, unit }` table, `runnerKeyFor`, `hingeKeyFor`, `CATALOGUE_ORDER`. Data only. |
| `src/scene/carcaseHardware.ts` | **create.** Pure `carcaseHardware(scene) → HardwareLine[]`. |
| `src/ui/groupHardware.ts` | **create.** `groupHardware(lines, library) → HardwareRow[]` — the pricing join. |
| `src/scene/useHardwareLibrary.ts` | **create.** Mirrors `useMaterialLibrary` against the new store. |
| `src/scene/carcaseRoles.ts` | **modify.** Export `clearDepth`; use it for `backY0`. |
| `src/scene/carcaseOpenings.ts` | **modify.** Add `resolveCarcase` returning openings *and* nodes; `carcaseOpenings` becomes its wrapper. |
| `src/scene/types.ts` | **modify.** Add `HardwareLibraryEntry`. |
| `src/scene/idb.ts` | **modify.** `DB_VERSION` 3 → 4, `hardware` store, three accessors. |
| `src/ui/buildCsv.ts` | **modify.** `buildHardwareCsv` learns the derived rows. |
| `src/ui/HardwareTab.tsx` | **modify.** Derived section above the hand-typed list. |
| `src/ui/BomModal.tsx` | **modify.** Take `hardwareLines` + library props; Library tab gains a hardware section. |
| `src/App.tsx` | **modify.** Wire `useHardwareLibrary` and compute the lines. |

`groupHardware` gets its own file rather than joining `groupParts`/`groupDowels` in `buildCsv.ts`: that file is already 206 lines serialising three formats, and the notes pre-authorised the split.

---

## Task 1: The catalogue

**Files:**
- Create: `src/scene/hardwareCatalogue.ts`
- Test: `src/scene/hardwareCatalogue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  CATALOGUE_ORDER,
  HARDWARE_CATALOGUE,
  RUNNER_NOMINALS,
  SCREW_KEY,
  SHELF_PIN_KEY,
  hingeKeyFor,
  runnerKeyFor,
} from './hardwareCatalogue'

describe('hardwareCatalogue', () => {
  it('gives every catalogue key a name and a unit', () => {
    for (const key of CATALOGUE_ORDER) {
      expect(HARDWARE_CATALOGUE[key].name.length, key).toBeGreaterThan(0)
      expect(HARDWARE_CATALOGUE[key].unit.length, key).toBeGreaterThan(0)
    }
    expect(CATALOGUE_ORDER.length).toBe(Object.keys(HARDWARE_CATALOGUE).length)
  })

  it('names a runner for every nominal, priced by the pair', () => {
    for (const n of RUNNER_NOMINALS) {
      expect(HARDWARE_CATALOGUE[`runner-${n}`].unit).toBe('pair')
    }
  })

  it('picks the largest nominal that fits the clear depth', () => {
    expect(runnerKeyFor(548)).toBe('runner-500') // a 560 mm Base, 12 mm captured back
    expect(runnerKeyFor(318)).toBe('runner-300') // a 330 mm Wall
    expect(runnerKeyFor(500)).toBe('runner-500') // exactly the nominal still fits
    expect(runnerKeyFor(499)).toBe('runner-450')
    expect(runnerKeyFor(1000)).toBe('runner-600') // never past the largest stocked length
  })

  it('lists no runner at all below the smallest nominal', () => {
    expect(runnerKeyFor(249)).toBeNull()
  })

  it('keys a hinge by the mount, because the bores cannot tell them apart', () => {
    expect(hingeKeyFor('overlay')).toBe('hinge-overlay')
    expect(hingeKeyFor('inset')).toBe('hinge-inset')
    expect(hingeKeyFor('overlay')).not.toBe(hingeKeyFor('inset'))
  })

  it('holds one screw and one pin, not a family of each', () => {
    expect(HARDWARE_CATALOGUE[SCREW_KEY].unit).toBe('pcs')
    expect(HARDWARE_CATALOGUE[SHELF_PIN_KEY].unit).toBe('pcs')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/hardwareCatalogue.test.ts`
Expected: FAIL — `Failed to resolve import "./hardwareCatalogue"`.

- [ ] **Step 3: Write the module**

```ts
// The hardware a generated cabinet implies, as stated figures rather than derived ones — the same
// contract `frontMachining.ts` has, and for the same reason. A wrong name or nominal here produces
// a perfectly self-consistent quote for parts that do not fit, and no test in this repo can
// falsify it. Treat this table as needing a woodworker's eye.
//
// No vendor catalogue is modelled: a key names a *kind* of item, and the price, supplier and part
// number for it live in the hardware library, which is global rather than per project.

export interface HardwareDef {
  name: string
  unit: string
}

export const HINGE_OVERLAY_KEY = 'hinge-overlay'
export const HINGE_INSET_KEY = 'hinge-inset'
export const SHELF_PIN_KEY = 'shelf-pin-5mm'
// One key, not a family: `defaultJoint.ts` models exactly one carcase screw — #8 ⌀4.2, 5 mm
// clearance, 3 mm pilot, 30 mm deep — shared by every screw joint. A key derived from bore depth
// would order a different screw when a panel is overridden to 25 mm, while the modelled fastener
// has not changed at all.
export const SCREW_KEY = 'screw-8x40'

// What a runner is stocked in. Deliberately not every length made: a quote naming a length nobody
// stocks is worse than one naming the next size down.
export const RUNNER_NOMINALS = [250, 300, 350, 400, 450, 500, 550, 600]

export const HARDWARE_CATALOGUE: Record<string, HardwareDef> = {
  [HINGE_OVERLAY_KEY]: { name: '110° hinge c/w plate', unit: 'pcs' },
  [HINGE_INSET_KEY]: { name: '110° inset hinge c/w plate', unit: 'pcs' },
  ...Object.fromEntries(
    RUNNER_NOMINALS.map((n) => [`runner-${n}`, { name: `${n} mm drawer runner`, unit: 'pair' }]),
  ),
  [SHELF_PIN_KEY]: { name: '5 mm shelf pin', unit: 'pcs' },
  [SCREW_KEY]: { name: '#8 × 40 mm carcase screw', unit: 'pcs' },
}

// Insertion order, which is what gives every grouped table and every CSV the same row order
// without any consumer stating one of its own.
export const CATALOGUE_ORDER = Object.keys(HARDWARE_CATALOGUE)

// The largest nominal that fits. Below the smallest, the bay lists no runner rather than one that
// will not go in.
export function runnerKeyFor(clearDepth: number): string | null {
  let best: number | null = null
  for (const n of RUNNER_NOMINALS) if (n <= clearDepth) best = n
  return best === null ? null : `runner-${best}`
}

// The one figure read from a parameter rather than from geometry. An overlay hinge and an inset
// hinge are different products fitted to identically bored doors, so the bores cannot answer this
// and asking them would be false precision.
export function hingeKeyFor(mount: 'overlay' | 'inset'): string {
  return mount === 'overlay' ? HINGE_OVERLAY_KEY : HINGE_INSET_KEY
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/hardwareCatalogue.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation-test the runner rule**

```bash
cp src/scene/hardwareCatalogue.ts "$SCRATCHPAD"/hardwareCatalogue.bak
```

Change `if (n <= clearDepth) best = n` to `if (n >= clearDepth && best === null) best = n` (the smallest nominal *at least* as big — the plausible wrong rule). Then:

Run: `pnpm vitest run src/scene/hardwareCatalogue.test.ts`
Expected: FAIL on "picks the largest nominal that fits the clear depth" — `runnerKeyFor(548)` returns `runner-550`.

Restore and confirm the restore landed:

```bash
cp "$SCRATCHPAD"/hardwareCatalogue.bak src/scene/hardwareCatalogue.ts
grep -n "n <= clearDepth" src/scene/hardwareCatalogue.ts
```

Expected: the original line is back. **Never `git checkout` to undo a mutation** — the working tree carries uncommitted work.

- [ ] **Step 6: Commit**

```bash
git add src/scene/hardwareCatalogue.ts src/scene/hardwareCatalogue.test.ts
git commit -m "feat(scene): the hardware catalogue, stated not derived"
```

---

## Task 2: `clearDepth`, stated once

The runner nominal comes from the cabinet's clear internal depth. `carcaseRoles.ts` already computes that as `backY0`; this task gives it a name and an export so the hardware pass reads the same rule rather than restating it.

**Files:**
- Modify: `src/scene/carcaseRoles.ts` (add the export near `openingRect`; use it at the `backY0` line inside `carcaseBoxes`)
- Test: `src/scene/carcaseRoles.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/scene/carcaseRoles.test.ts`:

```ts
describe('clearDepth', () => {
  it('takes the back out of the depth only when the back is captured', () => {
    const base = { depth: 560 } as CarcaseParams
    expect(clearDepth({ ...base, backMode: 'captured' } as CarcaseParams, 12)).toBe(548)
    expect(clearDepth({ ...base, backMode: 'applied' } as CarcaseParams, 12)).toBe(560)
    expect(clearDepth({ ...base, backMode: 'none' } as CarcaseParams, 0)).toBe(560)
  })

  // The property that matters: a division panel runs from the front to the back panel, so its
  // board length IS the clear depth. Read off the generator rather than restated here, so the two
  // cannot drift.
  it('equals the length of a division panel', () => {
    const p = CARCASE_PRESETS[0].params
    const withBays = { ...p, section: splitSection(p.section, p.section.id, 'vertical', 'panel', 2) }
    const thicknessOf = roleThicknessFor(withBays, PRESET_MATERIALS, new Map())
    const roles = carcaseRoles(withBays, thicknessOf, jointKindFor([], 'cmp_1'))
    const division = roles.find((r) => r.role.startsWith('division-'))
    expect(division).toBeDefined()
    expect(division!.panel.length).toBe(clearDepth(withBays, thicknessOf('back')))
  })
})
```

Add `clearDepth` to the existing `./carcaseRoles` import in that file, and `splitSection` from `./editSection` if it is not imported already.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t clearDepth`
Expected: FAIL — `clearDepth is not a function`.

- [ ] **Step 3: Add the export and use it**

Add near `openingRect` in `src/scene/carcaseRoles.ts`:

```ts
// How deep the inside of the cabinet actually is: a captured back stands inside the carcase and
// takes its own thickness out of the depth; an applied one hangs behind it and takes none. Stated
// here because a drawer runner has to fit this and a division panel's length *is* it — two copies
// of the rule is how a runner comes to disagree with the panel it screws to.
export function clearDepth(p: CarcaseParams, backThickness: number): number {
  return p.backMode === 'captured' ? p.depth - backThickness : p.depth
}
```

Then in `carcaseBoxes`, replace

```ts
  const backY0 = p.backMode === 'captured' ? D - BT : D
```

with

```ts
  const backY0 = clearDepth(p, BT)
```

- [ ] **Step 4: Run the whole suite — this touches the most-tested module in the repo**

Run: `pnpm vitest run src/scene/`
Expected: PASS, no change in count except the two new tests. Any failure here means the replacement is not equivalent; `BT` is already 0 when `backMode === 'none'`, so it is.

- [ ] **Step 5: Commit**

```bash
git add src/scene/carcaseRoles.ts src/scene/carcaseRoles.test.ts
git commit -m "refactor(scene): name the clear internal depth, and state it once"
```

---

## Task 3: `resolveCarcase` — openings *and* nodes from one chain

The pin count needs each opening's `interior.adjustable.rows`, which `carcaseOpenings` resolves and then discards. Rather than a second copy of the resolution chain, widen what the existing one returns.

**Files:**
- Modify: `src/scene/carcaseOpenings.ts`
- Test: `src/scene/carcaseOpenings.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { resolveCarcase } from './carcaseOpenings'

describe('resolveCarcase', () => {
  it('returns the openings beside the nodes, from one resolution', () => {
    const scene = regenerateComponents(freshScene(CARCASE_PRESETS[0]))
    const cabinet = scene.components[0]
    if (cabinet.kind !== 'carcase') throw new Error('fixture is a carcase')

    const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
    expect(resolved).not.toBeNull()
    // Every node names an opening that was returned beside it — one resolution, not two.
    expect(resolved!.nodes.map((n) => n.sectionId).sort()).toEqual(
      resolved!.openings.map((o) => o.sectionId).sort(),
    )
    // The spec the pin rows were bored from is now reachable.
    expect(resolved!.openings[0].spec?.adjustable.rows).toBe(2)
  })

  it('agrees with carcaseOpenings, which is now its wrapper', () => {
    const scene = regenerateComponents(freshScene(CARCASE_PRESETS[0]))
    const cabinet = scene.components[0]
    if (cabinet.kind !== 'carcase') throw new Error('fixture is a carcase')

    expect(carcaseOpenings(cabinet, scene.parts, scene.materials)).toEqual(
      resolveCarcase(cabinet, scene.parts, scene.materials)!.nodes,
    )
  })
})
```

If `freshScene` is not already in this test file, copy it from `src/scene/carcasePresets.test.ts` (it is the scene a new file starts from: empty but for `PRESET_MATERIALS`, one carcase component `cmp_1`).

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseOpenings.test.ts`
Expected: FAIL — `resolveCarcase is not exported`.

- [ ] **Step 3: Widen the module**

Replace the body of `src/scene/carcaseOpenings.ts` below its imports with:

```ts
export interface ResolvedCarcase {
  openings: ReturnType<typeof sectionOpenings>
  nodes: ReturnType<typeof sectionNodes>
}

// The whole chain from a cabinet to its openings and to which of its parts each one owns:
// thicknesses, validation, section rectangles, ownership. Stated once because three callers ask
// it — the scene tree, the 3D highlight and the hardware pass — and copies would be free to
// disagree about an opening's membership.
//
// `null` says the cabinet cannot be resolved: `openingRect` reads thicknesses through a resolver
// that is fatal by design, so a cabinet naming a material the scene cannot resolve would throw
// here. What to show instead is the caller's to decide.
export function resolveCarcase(
  component: CarcaseComponent,
  parts: Part[],
  materials: Record<string, MaterialDef>,
): ResolvedCarcase | null {
  // Filtered here rather than by each caller. Section ids and role keys are shared by every cabinet
  // built from one preset — `params` is assigned by reference — so an unfiltered array files
  // another cabinet's `front-<sec>-0` into this cabinet's opening, silently, which is the exact
  // confusion this module exists to prevent.
  const own = parts.filter((p) => p.parentId === component.id)
  const thicknessOf = roleThicknessFor(component.params, materials, overridesOf(own, component.id))
  if (validateCarcaseParams(component.params, thicknessOf).length > 0) return null
  const tree = resolveSections(
    component.params.section,
    openingRect(component.params, thicknessOf),
    sectionThickness(thicknessOf),
  )
  const openings = sectionOpenings(component.params.section, tree)
  return { openings, nodes: sectionNodes(openings, own) }
}

// Which opening owns which part. The shape two callers already take.
export function carcaseOpenings(
  component: CarcaseComponent,
  parts: Part[],
  materials: Record<string, MaterialDef>,
): ReturnType<typeof sectionNodes> | null {
  return resolveCarcase(component, parts, materials)?.nodes ?? null
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/ src/ui/`
Expected: PASS — the two new tests plus every existing `carcaseOpenings` consumer (`SceneTree`, the viewport highlight) unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/scene/carcaseOpenings.ts src/scene/carcaseOpenings.test.ts
git commit -m "refactor(scene): resolveCarcase returns the openings beside the nodes"
```

---

## Task 4: `carcaseHardware` — hinges

**Files:**
- Create: `src/scene/carcaseHardware.ts`
- Test: `src/scene/carcaseHardware.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { hingeCount } from './frontMachining'
import { carcaseHardware } from './carcaseHardware'
import { CARCASE_PRESETS as PRESETS, type CarcasePreset } from './carcasePresets'
import type { CarcaseParams, MaterialDef, Scene } from './types'

// The scene a new file starts from, with one cabinet in it. Materials are a parameter because a
// door thin enough to refuse a cup needs a material the presets do not name.
const sceneOf = (
  params: CarcaseParams,
  label = 'Cabinet',
  materials: Record<string, MaterialDef> = PRESET_MATERIALS,
): Scene =>
  regenerateComponents({
    parts: [],
    materials: { ...materials },
    hardware: [],
    joints: [],
    components: [
      {
        kind: 'carcase',
        id: 'cmp_1',
        label,
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        params,
      },
    ],
  })

const qtyOf = (scene: Scene, key: string): number =>
  carcaseHardware(scene)
    .filter((l) => l.key === key)
    .reduce((sum, l) => sum + l.qty, 0)

describe('carcaseHardware — hinges', () => {
  // Side A is the stated table read against each DOOR's own height; side B is the pass counting
  // bored cups. Counting cups on both sides would pass however wrong `hingeCount` is.
  it.each(CARCASE_PRESETS.map((p) => [p.name, p] as const))(
    '%s lists one hinge per cup, and the table agrees',
    (_name, preset: CarcasePreset) => {
      const scene = sceneOf(preset.params, preset.name)
      const doors = scene.parts.filter((p) => p.kind === 'board' && p.role?.startsWith('front-'))
      const expected = doors.reduce((sum, d) => sum + hingeCount(d.length), 0)
      expect(qtyOf(scene, 'hinge-overlay')).toBe(expected)
    },
  )

  // Tall 600's leaf is 1997 mm, so the table gives 4 — reading the CABINET's 2100 would give 5.
  it('counts by the leaf, not by the cabinet', () => {
    const tall = CARCASE_PRESETS.find((p) => p.name.startsWith('Tall'))!
    expect(qtyOf(sceneOf(tall.params), 'hinge-overlay')).toBe(8)
    expect(hingeCount(tall.params.height)).toBe(5) // the cabinet's own height would give 10
  })

  it('keys by the mount the cabinet is built to', () => {
    const inset = { ...CARCASE_PRESETS[0].params, frontMount: 'inset' as const }
    expect(qtyOf(sceneOf(inset), 'hinge-inset')).toBe(2)
    expect(qtyOf(sceneOf(inset), 'hinge-overlay')).toBe(0)
  })

  // `cupRow` returns null below CUP_DEPTH + MIN_FACE_BEHIND_CUP, so there is no cup to count and
  // no hinge to order. A parameter-driven count would order hinges for a door never bored for them.
  it('lists no hinge for a door too thin to bore a cup into', () => {
    // 10 mm leaves 1.5 mm behind a 12.5 mm cup, so `cupRow` returns null and nothing is bored.
    const thin = { ...CARCASE_PRESETS[0].params, frontMaterial: '10mm Ply' }
    const scene = sceneOf(thin, 'Thin', {
      ...PRESET_MATERIALS,
      '10mm Ply': { thickness: 10 },
    })
    expect(scene.parts.some((p) => p.role?.startsWith('front-'))).toBe(true)
    expect(qtyOf(scene, 'hinge-overlay')).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: FAIL — `Failed to resolve import "./carcaseHardware"`.

- [ ] **Step 3: Write the module, hinges only**

```ts
import { hingeKeyFor } from './hardwareCatalogue'
import type { CarcaseComponent, ComponentId, Scene } from './types'

// What a generated cabinet needs bought, counted off what its machining actually bored.
//
// The rule, stated once because four families follow it: **quantity comes from what the pipeline
// emitted; the variant comes from the cabinet.** Re-deriving counts from `CarcaseParams` would
// order hinges for a door too thin to bore and screws for a joint converted to a dado — the bores
// already know better.
//
// Nothing here is stored. This is a read over the scene, exactly as the cutting list and the dowel
// list are, which is why a hardware item needs no `driven` flag and no file-format version.

export interface HardwareLine {
  componentId: ComponentId | null
  cabinetLabel: string
  key: string
  qty: number
}

// Parts owned by no carcase still need their screws counted; a total that quietly omits them is
// worse than a group with an awkward name.
export const UNGROUPED_LABEL = 'Ungrouped'

export function carcaseHardware(scene: Scene): HardwareLine[] {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of scene.components) if (c.kind === 'carcase') carcases.set(c.id, c)

  const tally = new Map<string, number>()
  const cell = (id: ComponentId | null, key: string) => `${id ?? ''} ${key}`
  const add = (id: ComponentId | null, key: string, qty: number) =>
    tally.set(cell(id, key), (tally.get(cell(id, key)) ?? 0) + qty)

  for (const part of scene.parts) {
    if (part.kind !== 'board') continue
    const owner = part.parentId !== null && carcases.has(part.parentId) ? part.parentId : null
    const cabinet = owner === null ? undefined : carcases.get(owner)

    for (const cut of part.cuts) {
      if (cut.kind !== 'hole-array') continue

      if (cut.id.startsWith('cups_')) {
        // One hinge per cup, and the plate with it: they are sold as a set and their quantities
        // can never differ, so two rows would be two prices for one decision.
        if (cabinet === undefined) continue
        add(owner, hingeKeyFor(cabinet.params.frontMount), cut.count)
      }
    }
  }

  const lines: HardwareLine[] = []
  for (const [key, qty] of tally) {
    const [id, catalogueKey] = key.split(' ')
    if (qty <= 0) continue
    const componentId = id === '' ? null : id
    lines.push({
      componentId,
      cabinetLabel: componentId === null ? UNGROUPED_LABEL : (carcases.get(componentId)?.label ?? UNGROUPED_LABEL),
      key: catalogueKey,
      qty,
    })
  }
  return lines
}
```

Task 8 replaces that final loop with the stated ordering. It is written this way here so the module runs before ordering has a test to hold it.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: PASS, 6 tests (three presets from the `it.each` plus three).

- [ ] **Step 5: Mutation-test the doubling defect**

```bash
cp src/scene/carcaseHardware.ts "$SCRATCHPAD"/carcaseHardware.bak
```

Change `cut.id.startsWith('cups_')` to `cut.id.startsWith('cups_') || cut.id.startsWith('plate_')` — counting the plates as well as the cups, which is the obvious wrong reading of "a hinge c/w plate".

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: FAIL on all three presets — Base 600 gives 6 against 2 (two plate rows of 2, plus 2 cups).

```bash
cp "$SCRATCHPAD"/carcaseHardware.bak src/scene/carcaseHardware.ts
grep -n "startsWith('plate_')" src/scene/carcaseHardware.ts
```

Expected: no match — the mutation is gone.

- [ ] **Step 6: Commit**

```bash
git add src/scene/carcaseHardware.ts src/scene/carcaseHardware.test.ts
git commit -m "feat(scene): count a hinge for every cup the cabinet bores"
```

---

## Task 5: Runners

**Files:**
- Modify: `src/scene/carcaseHardware.ts`
- Test: `src/scene/carcaseHardware.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'

// No preset has a drawer bay, so every runner test builds its own. Two bays, the LEFT one a drawer
// front — a single-bay fixture cannot tell "the bay that asked" from "the first bay".
const withDrawerBays = (drawers: number): CarcaseParams => {
  const p = CARCASE_PRESETS[0].params
  let section = splitSection(p.section, p.section.id, 'vertical', 'panel', 2)
  const kids = section.content.kind === 'split' ? section.content.children : []
  for (let i = 0; i < drawers; i++) section = setFrontOn(section, kids[i].id, { kind: 'drawer-front' })
  return { ...p, section }
}

describe('carcaseHardware — runners', () => {
  it('lists one pair per drawer bay, not one per bored upright', () => {
    const scene = sceneOf(withDrawerBays(1))
    // Both uprights bounding the bay carry a slide row; the runner is one pair.
    const rows = scene.parts.filter(
      (p) => p.kind === 'board' && p.cuts.some((c) => c.id.startsWith('slide_')),
    )
    expect(rows.length).toBe(2)
    expect(qtyOf(scene, 'runner-500')).toBe(1)
  })

  it('counts a pair for each drawer bay', () => {
    expect(qtyOf(sceneOf(withDrawerBays(2)), 'runner-500')).toBe(2)
  })

  // The nominal follows the cabinet's clear depth, so a bay beside a division and a bay beside a
  // side panel take the same runner — those two uprights are 548 mm and 560 mm long.
  it('takes the nominal from the clear depth, so both bays agree', () => {
    const lines = carcaseHardware(sceneOf(withDrawerBays(2))).filter((l) =>
      l.key.startsWith('runner-'),
    )
    expect(lines.length).toBe(1)
    expect(lines[0].key).toBe('runner-500')
  })

  it('shortens the runner with the cabinet', () => {
    const shallow = { ...withDrawerBays(1), depth: 330 }
    expect(qtyOf(sceneOf(shallow), 'runner-300')).toBe(1)
  })

  it('lists no runner in a cabinet too shallow for the smallest one', () => {
    const tiny = { ...withDrawerBays(1), depth: 200 }
    expect(carcaseHardware(sceneOf(tiny)).filter((l) => l.key.startsWith('runner-'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t runners`
Expected: FAIL — every runner quantity is 0.

- [ ] **Step 3: Add the runner arm**

Add the imports:

```ts
import { clearDepth } from './carcaseRoles'
import { hingeKeyFor, runnerKeyFor } from './hardwareCatalogue'
```

Before the part loop, collect the back thicknesses (read off the emitted panel, not re-resolved):

```ts
  // The clear depth needs the back panel's own thickness, and the emitted panel already carries it.
  const backThickness = new Map<ComponentId, number>()
  for (const p of scene.parts) {
    if (p.kind === 'board' && p.role === 'back' && p.parentId !== null)
      backThickness.set(p.parentId, p.thickness)
  }

  // A slide row is bored into BOTH uprights of a bay and both carry the same cut id, because both
  // name the front the bay wears. Deduped by that id, the pair is counted once.
  const seenSlide = new Set<string>()
```

And inside the cut loop, after the cups arm:

```ts
      if (cut.id.startsWith('slide_')) {
        if (cabinet === undefined || owner === null) continue
        const seen = `${owner} ${cut.id}`
        if (seenSlide.has(seen)) continue
        seenSlide.add(seen)
        const key = runnerKeyFor(clearDepth(cabinet.params, backThickness.get(owner) ?? 0))
        if (key !== null) add(owner, key, 1)
        continue
      }
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Mutation-test the dedupe**

```bash
cp src/scene/carcaseHardware.ts "$SCRATCHPAD"/carcaseHardware.bak
```

Delete the two `seenSlide` lines so every bored row counts a pair.

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t runners`
Expected: FAIL — one bay lists 2 pairs.

```bash
cp "$SCRATCHPAD"/carcaseHardware.bak src/scene/carcaseHardware.ts
grep -c "seenSlide" src/scene/carcaseHardware.ts
```

Expected: `4`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/carcaseHardware.ts src/scene/carcaseHardware.test.ts
git commit -m "feat(scene): a runner pair per drawer bay, sized by the clear depth"
```

---

## Task 6: Shelf pins

A shelf sits on one pin per bored row, and the rows come from its own section: `carcaseHoleArrays` bores `[setback, length − backSetback].slice(0, rows)` into **each** of the two uprights bounding it. So the default `rows: 2` gives four pins and `rows: 1` gives two. A flat four would order pins with no hole to sit in.

**Files:**
- Modify: `src/scene/carcaseHardware.ts`
- Test: `src/scene/carcaseHardware.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { defaultInterior, setInterior } from './sectionInterior'

const withShelves = (shelves: number, rows: 1 | 2): CarcaseParams => {
  const p = CARCASE_PRESETS[0].params
  const base = defaultInterior(shelves)
  const section = setInterior(p.section, p.section.id, {
    ...base,
    adjustable: { ...base.adjustable, rows },
  })
  return { ...p, section }
}

describe('carcaseHardware — shelf pins', () => {
  // Side A is what the section ASKED for, seated; side B is the pass counting emitted boards and
  // bored rows.
  it('gives every seated shelf one pin per bored row', () => {
    const scene = sceneOf(withShelves(2, 2))
    const seated = scene.parts.filter(
      (p) => p.kind === 'board' && p.role?.startsWith('adj-shelf-'),
    ).length
    expect(seated).toBe(2)
    expect(qtyOf(scene, 'shelf-pin-5mm')).toBe(seated * 4)
  })

  it('halves the pins when the section bores one row a side', () => {
    expect(qtyOf(sceneOf(withShelves(2, 1)), 'shelf-pin-5mm')).toBe(4)
    expect(qtyOf(sceneOf(withShelves(2, 2)), 'shelf-pin-5mm')).toBe(8)
  })

  it('counts the shelves the cabinet seated, not the shelves it was asked for', () => {
    // `shelfPins` seats what the pin row can hold; asking for more does not make more boards.
    const scene = sceneOf(withShelves(40, 2))
    const seated = scene.parts.filter(
      (p) => p.kind === 'board' && p.role?.startsWith('adj-shelf-'),
    ).length
    expect(seated).toBeLessThan(40)
    expect(qtyOf(scene, 'shelf-pin-5mm')).toBe(seated * 4)
  })

  it('lists no pins for a cabinet whose shelves are all fixed', () => {
    const tall = CARCASE_PRESETS.find((p) => p.name.startsWith('Tall'))!
    expect(qtyOf(sceneOf(tall.params), 'shelf-pin-5mm')).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t "shelf pins"`
Expected: FAIL — every pin quantity is 0.

- [ ] **Step 3: Add the pin pass**

Import:

```ts
import { resolveCarcase } from './carcaseOpenings'
import { hingeKeyFor, runnerKeyFor, SHELF_PIN_KEY } from './hardwareCatalogue'
```

After the part loop, before the lines are built:

```ts
  // A pin row belongs to the section that asked for it, so the pins do too: `resolveCarcase` says
  // which opening owns which shelf, and the opening's own spec says how many rows were bored
  // around it. Two uprights bound a section, each bored `rows` rows, and a shelf takes one pin from
  // each — four at the default, two when a section asks for a single row.
  for (const cabinet of carcases.values()) {
    const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
    if (resolved === null) continue
    for (const opening of resolved.openings) {
      const rows = opening.spec?.adjustable.rows
      if (rows === undefined) continue
      const owned = resolved.nodes.find((n) => n.sectionId === opening.sectionId)
      const shelves = owned?.parts.filter((p) => p.role?.startsWith('adj-shelf-')).length ?? 0
      if (shelves > 0) add(cabinet.id, SHELF_PIN_KEY, shelves * 2 * rows)
    }
  }
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Mutation-test the flat four**

```bash
cp src/scene/carcaseHardware.ts "$SCRATCHPAD"/carcaseHardware.bak
```

Change `shelves * 2 * rows` to `shelves * 4`.

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t "shelf pins"`
Expected: FAIL on "halves the pins when the section bores one row a side" — 8 against 4. The other three pin tests still pass, because every one of them uses `rows: 2`. That is the whole point of the `rows: 1` case.

Then restore and run the spec's second pin mutation — `shelves * 2` (one pin a side, ignoring rows):

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t "shelf pins"`
Expected: FAIL on "gives every seated shelf one pin per bored row" — 4 against 8.

```bash
cp "$SCRATCHPAD"/carcaseHardware.bak src/scene/carcaseHardware.ts
grep -n "shelves \* 2 \* rows" src/scene/carcaseHardware.ts
```

Expected: the original line is back.

- [ ] **Step 6: Commit**

```bash
git add src/scene/carcaseHardware.ts src/scene/carcaseHardware.test.ts
git commit -m "feat(scene): one shelf pin per bored row, per seated shelf"
```

---

## Task 7: Assembly screws, and the ungrouped case

**Files:**
- Modify: `src/scene/carcaseHardware.ts`
- Test: `src/scene/carcaseHardware.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { reconcileJoints } from './reconcileJoints'
import { defaultScrewJoint } from './defaultJoint'
import type { BoardPart, Joint } from './types'

const piped = (params: CarcaseParams, label = 'Cabinet'): Scene =>
  reconcileJoints(sceneOf(params, label))

describe('carcaseHardware — screws', () => {
  // Side A is `screwCount` summed over the cabinet's screw joints; side B is the pass counting
  // clearance bores. Both are derived; neither is a number anyone typed.
  it.each(CARCASE_PRESETS.map((p) => [p.name, p] as const))(
    '%s lists one screw per clearance hole',
    (_name, preset: CarcasePreset) => {
      const scene = piped(preset.params, preset.name)
      const expected = scene.joints
        .filter((j) => j.kind === 'screw')
        .reduce((sum, j) => sum + (j.kind === 'screw' ? j.screwCount : 0), 0)
      expect(expected).toBeGreaterThan(0)
      expect(qtyOf(scene, 'screw-8x40')).toBe(expected)
    },
  )

  it('matches the figures measured for the presets', () => {
    expect(qtyOf(piped(CARCASE_PRESETS[0].params), 'screw-8x40')).toBe(32)
    expect(qtyOf(piped(CARCASE_PRESETS[1].params), 'screw-8x40')).toBe(28)
    expect(qtyOf(piped(CARCASE_PRESETS[2].params), 'screw-8x40')).toBe(66)
  })

  // A screw joint the USER added inside a cabinet still needs screws; it carries no
  // sourceComponentId, so attributing by that would drop it.
  it('counts a user-added joint into the cabinet whose panels it joins', () => {
    const scene = piped(CARCASE_PRESETS[0].params)
    const left = scene.parts.find((p) => p.role === 'left-side') as BoardPart
    const shelf = scene.parts.find((p) => p.role?.startsWith('adj-shelf-')) as BoardPart
    const mine: Joint = {
      ...defaultScrewJoint(left, shelf, '+X', '-X', 'joint_mine', 'Mine'),
      driven: false,
    }
    const before = qtyOf(scene, 'screw-8x40')
    const after = qtyOf(reconcileJoints({ ...scene, joints: [...scene.joints, mine] }), 'screw-8x40')
    expect(after).toBeGreaterThan(before)
    const lines = carcaseHardware(
      reconcileJoints({ ...scene, joints: [...scene.joints, mine] }),
    ).filter((l) => l.key === 'screw-8x40')
    expect(lines.map((l) => l.componentId)).toEqual(['cmp_1'])
  })

  // A joint between parts owned by no cabinet still needs its screws bought.
  it('files screws for parentless parts under Ungrouped', () => {
    const scene = piped(CARCASE_PRESETS[0].params)
    const a: BoardPart = {
      ...(scene.parts.find((p) => p.role === 'bottom') as BoardPart),
      id: 'board_loose_a',
      parentId: null,
      driven: false,
      role: undefined,
      cuts: [],
    }
    const b: BoardPart = { ...a, id: 'board_loose_b' }
    const loose: Joint = {
      ...defaultScrewJoint(a, b, '+Z', '-X', 'joint_loose', 'Loose'),
      driven: false,
    }
    const withLoose = reconcileJoints({
      ...scene,
      parts: [...scene.parts, a, b],
      joints: [...scene.joints, loose],
    })
    const ungrouped = carcaseHardware(withLoose).filter((l) => l.componentId === null)
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0].cabinetLabel).toBe('Ungrouped')
    expect(ungrouped[0].qty).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t screws`
Expected: FAIL — every screw quantity is 0.

- [ ] **Step 3: Add the screw arm**

Import `SCREW_KEY` alongside the others, and add inside the cut loop after the slide arm:

```ts
      // Clearance only. `deriveScrewJoint` emits a clearance array on the panel screwed THROUGH and
      // a pilot array into the panel receiving them, both at `screwCount`: the same screws seen
      // from two ends. Counting both doubles every figure in the quote.
      //
      // `_clearance` is unique to `screw.ts`, and `sourceJointId` is what makes it a joint's bore
      // rather than a component's.
      if (cut.sourceJointId !== undefined && cut.id.endsWith('_clearance')) {
        add(owner, SCREW_KEY, cut.count)
      }
```

Note the attribution: `owner` is the through panel's cabinet, because the clearance bore is on the through panel. A joint the user added carries no `sourceComponentId`, and this never reads one.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Mutation-test the double count and the attribution**

```bash
cp src/scene/carcaseHardware.ts "$SCRATCHPAD"/carcaseHardware.bak
```

Mutation A — drop `&& cut.id.endsWith('_clearance')` so pilots count too.
Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t screws`
Expected: FAIL — Base 600 gives 64 against 32.

Mutation B — restore, then attribute by the joint instead of the part: replace `add(owner, SCREW_KEY, cut.count)` with a lookup that skips any cut whose joint has no `sourceComponentId`:

```ts
        const j = scene.joints.find((x) => x.id === cut.sourceJointId)
        if (j?.sourceComponentId === undefined) continue
        add(j.sourceComponentId, SCREW_KEY, cut.count)
```

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t screws`
Expected: FAIL on "counts a user-added joint into the cabinet whose panels it joins" — the added joint contributes nothing.

```bash
cp "$SCRATCHPAD"/carcaseHardware.bak src/scene/carcaseHardware.ts
grep -n "endsWith('_clearance')" src/scene/carcaseHardware.ts
grep -c "sourceComponentId" src/scene/carcaseHardware.ts
```

Expected: the clearance line is back; `sourceComponentId` appears **0** times in the module.

- [ ] **Step 6: Commit**

```bash
git add src/scene/carcaseHardware.ts src/scene/carcaseHardware.test.ts
git commit -m "feat(scene): a screw per clearance hole, filed by the panel it passes through"
```

---

## Task 8: Ordering, aggregation and the stale-cabinet case

**Files:**
- Modify: `src/scene/carcaseHardware.ts` (replace the line-building loop)
- Test: `src/scene/carcaseHardware.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
describe('carcaseHardware — rows', () => {
  const twoCabinets = (): Scene => {
    const one = sceneOf(CARCASE_PRESETS[0].params, 'Base A')
    const other = sceneOf(CARCASE_PRESETS[1].params, 'Wall B')
    return regenerateComponents({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [
        one.components[0],
        { ...other.components[0], id: 'cmp_2', label: 'Wall B' },
      ],
    })
  }

  it('groups per cabinet rather than merging the job', () => {
    const lines = carcaseHardware(twoCabinets()).filter((l) => l.key === 'hinge-overlay')
    expect(lines.map((l) => [l.cabinetLabel, l.qty])).toEqual([
      ['Base A', 2],
      ['Wall B', 2],
    ])
  })

  it('orders cabinets as the scene holds them, then keys as the catalogue lists them', () => {
    const lines = carcaseHardware(reconcileJoints(twoCabinets()))
    expect(lines.map((l) => `${l.cabinetLabel}/${l.key}`)).toEqual([
      'Base A/hinge-overlay',
      'Base A/shelf-pin-5mm',
      'Base A/screw-8x40',
      'Wall B/hinge-overlay',
      'Wall B/shelf-pin-5mm',
      'Wall B/screw-8x40',
    ])
  })

  it('emits one line per cabinet and key, however many parts contributed', () => {
    const lines = carcaseHardware(reconcileJoints(sceneOf(CARCASE_PRESETS[0].params)))
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length)
  })

  // A cabinet mid-keystroke invalid keeps its last good parts, so it keeps its last good counts —
  // the same thing the scene tree and the 3D view show.
  it('keeps the last good counts for a cabinet whose parameters no longer build', () => {
    const good = reconcileJoints(sceneOf(CARCASE_PRESETS[0].params))
    const broken = regenerateComponents({
      ...good,
      components: good.components.map((c) =>
        c.kind === 'carcase' ? { ...c, params: { ...c.params, width: 0 } } : c,
      ),
    })
    expect(qtyOf(broken, 'hinge-overlay')).toBe(qtyOf(good, 'hinge-overlay'))
  })

  it('returns nothing for a scene with no cabinets', () => {
    expect(
      carcaseHardware({ parts: [], materials: {}, hardware: [], joints: [], components: [] }),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t rows`
Expected: FAIL on the ordering test — the tally's insertion order is whatever the parts happened to be in.

- [ ] **Step 3: Replace the line-building loop**

Import `CATALOGUE_ORDER`, and replace everything from `const lines: HardwareLine[] = []` to the `return` with:

```ts
  // Row order is stated, not incidental: cabinets as the scene holds them, then keys as the
  // catalogue lists them, with the ungrouped rows last. A CSV regenerated from an unchanged scene
  // is then byte-identical, which is what makes it diffable.
  const lines: HardwareLine[] = []
  const emit = (id: ComponentId | null, label: string) => {
    for (const key of CATALOGUE_ORDER) {
      const qty = tally.get(cell(id, key))
      if (qty !== undefined && qty > 0) lines.push({ componentId: id, cabinetLabel: label, key, qty })
    }
  }
  for (const c of scene.components) if (c.kind === 'carcase') emit(c.id, c.label)
  emit(null, UNGROUPED_LABEL)
  return lines
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts`
Expected: PASS, 26 tests.

- [ ] **Step 5: Mutation-test the grouping**

```bash
cp src/scene/carcaseHardware.ts "$SCRATCHPAD"/carcaseHardware.bak
```

Change `cell` to ignore the cabinet: `const cell = (id: ComponentId | null, key: string) => key` — the scene-wide grouping the user declined.

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t rows`
Expected: FAIL on "groups per cabinet rather than merging the job" — both cabinets report 4.

```bash
cp "$SCRATCHPAD"/carcaseHardware.bak src/scene/carcaseHardware.ts
grep -n "id ?? ''" src/scene/carcaseHardware.ts
```

Expected: the original `cell` is back.

- [ ] **Step 6: Commit**

```bash
git add src/scene/carcaseHardware.ts src/scene/carcaseHardware.test.ts
git commit -m "feat(scene): one hardware row per cabinet and key, in a stated order"
```

---

## Task 9: The hardware library store

**Files:**
- Modify: `src/scene/types.ts` (add `HardwareLibraryEntry` beside `MaterialDef`)
- Modify: `src/scene/idb.ts`
- Test: `src/scene/idb.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import {
  readHardwareLibrary,
  writeHardwareEntry,
  deleteHardwareEntry,
  readLibrary,
  writeLibraryEntry,
} from './idb'

describe('hardware library store', () => {
  it('round-trips an entry by catalogue key', async () => {
    await writeHardwareEntry('hinge-overlay', {
      supplier: 'Blum',
      partNumber: '71B3550',
      unitCost: 3.4,
    })
    expect(await readHardwareLibrary()).toEqual({
      'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
    })
  })

  it('deletes an entry', async () => {
    await writeHardwareEntry('screw-8x40', { supplier: '', partNumber: '', unitCost: 0.03 })
    await deleteHardwareEntry('screw-8x40')
    expect((await readHardwareLibrary())['screw-8x40']).toBeUndefined()
  })

  // The version bump only ever ADDS a store, but that is a claim until something reads an old
  // entry back across it.
  it('leaves the material library intact across the version bump', async () => {
    await writeLibraryEntry('18mm Ply', { thickness: 18, costPerM2: 42 })
    expect((await readLibrary())['18mm Ply']).toEqual({ thickness: 18, costPerM2: 42 })
    await writeHardwareEntry('shelf-pin-5mm', { supplier: '', partNumber: '', unitCost: 0.1 })
    expect((await readLibrary())['18mm Ply']).toEqual({ thickness: 18, costPerM2: 42 })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/idb.test.ts`
Expected: FAIL — `readHardwareLibrary is not exported`.

- [ ] **Step 3: Add the type, the store and the accessors**

In `src/scene/types.ts`, beside `MaterialDef`:

```ts
// What a shop knows about a catalogue item that the cabinet cannot: who sells it, under what
// number, for how much. Global rather than per project — a hinge is priced once, not per file —
// which is why it lives in the `hardware` IndexedDB store and never in `ZimmuFile`. The item's
// name and unit come from `hardwareCatalogue.ts`, never from here.
export interface HardwareLibraryEntry {
  supplier: string
  partNumber: string
  unitCost: number
}
```

In `src/scene/idb.ts`, bump the version and add the store:

```ts
const DB_VERSION = 4
const HARDWARE_STORE = 'hardware'
```

and inside `onupgradeneeded`, after the settings store:

```ts
      if (!db.objectStoreNames.contains(HARDWARE_STORE)) db.createObjectStore(HARDWARE_STORE)
```

Then the three accessors, modelled exactly on `readLibrary` / `writeLibraryEntry` / `deleteLibraryEntry`:

```ts
export async function readHardwareLibrary(): Promise<Record<string, HardwareLibraryEntry>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const result: Record<string, HardwareLibraryEntry> = {}
    const req = db.transaction(HARDWARE_STORE, 'readonly').objectStore(HARDWARE_STORE).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        result[cursor.key as string] = cursor.value as HardwareLibraryEntry
        cursor.continue()
      } else {
        db.close()
        resolve(result)
      }
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function writeHardwareEntry(key: string, entry: HardwareLibraryEntry): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(HARDWARE_STORE, 'readwrite')
      .objectStore(HARDWARE_STORE)
      .put(entry, key)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function deleteHardwareEntry(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(HARDWARE_STORE, 'readwrite').objectStore(HARDWARE_STORE).delete(key)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}
```

Import `HardwareLibraryEntry` at the top of `idb.ts` alongside `MaterialDef`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/idb.test.ts`
Expected: PASS — the three new tests and every existing one.

- [ ] **Step 5: Commit**

```bash
git add src/scene/types.ts src/scene/idb.ts src/scene/idb.test.ts
git commit -m "feat(scene): a hardware library store, keyed by catalogue key"
```

---

## Task 10: `useHardwareLibrary`

**Files:**
- Create: `src/scene/useHardwareLibrary.ts`
- Test: `src/scene/useHardwareLibrary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useHardwareLibrary } from './useHardwareLibrary'
import { readHardwareLibrary } from './idb'

describe('useHardwareLibrary', () => {
  it('saves an entry to state and to the store', async () => {
    const { result } = renderHook(() => useHardwareLibrary())
    act(() => {
      result.current.saveHardwareEntry('hinge-overlay', {
        supplier: 'Blum',
        partNumber: '71B3550',
        unitCost: 3.4,
      })
    })
    expect(result.current.hardwareLibrary['hinge-overlay'].unitCost).toBe(3.4)
    await waitFor(async () => {
      expect((await readHardwareLibrary())['hinge-overlay']?.unitCost).toBe(3.4)
    })
  })

  it('deletes an entry from state', async () => {
    const { result } = renderHook(() => useHardwareLibrary())
    act(() => {
      result.current.saveHardwareEntry('screw-8x40', {
        supplier: '',
        partNumber: '',
        unitCost: 0.03,
      })
    })
    act(() => {
      result.current.deleteHardwareEntry('screw-8x40')
    })
    expect(result.current.hardwareLibrary['screw-8x40']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/scene/useHardwareLibrary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

```ts
import { useState, useEffect, useCallback } from 'react'
import type { HardwareLibraryEntry } from './types'
import { readHardwareLibrary, writeHardwareEntry, deleteHardwareEntry } from './idb'

export interface UseHardwareLibraryResult {
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  saveHardwareEntry: (key: string, entry: HardwareLibraryEntry) => void
  deleteHardwareEntry: (key: string) => void
}

// The mirror of `useMaterialLibrary`, against the store beside it: a hinge is priced once and that
// price outlives the file it was first typed into.
export function useHardwareLibrary(): UseHardwareLibraryResult {
  const [hardwareLibrary, setHardwareLibrary] = useState<Record<string, HardwareLibraryEntry>>({})

  useEffect(() => {
    readHardwareLibrary()
      .then(setHardwareLibrary)
      .catch((err: unknown) => console.error('Failed to load hardware library:', err))
  }, [])

  const saveHardwareEntry = useCallback((key: string, entry: HardwareLibraryEntry) => {
    setHardwareLibrary((prev) => ({ ...prev, [key]: entry }))
    void writeHardwareEntry(key, entry).catch((err: unknown) =>
      console.error('Failed to save hardware library entry:', err),
    )
  }, [])

  const removeEntry = useCallback((key: string) => {
    setHardwareLibrary((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    void deleteHardwareEntry(key).catch((err: unknown) =>
      console.error('Failed to delete hardware library entry:', err),
    )
  }, [])

  return { hardwareLibrary, saveHardwareEntry, deleteHardwareEntry: removeEntry }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/scene/useHardwareLibrary.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useHardwareLibrary.ts src/scene/useHardwareLibrary.test.ts
git commit -m "feat(scene): useHardwareLibrary, mirroring the material one"
```

---

## Task 11: `groupHardware` — the pricing join

**Files:**
- Create: `src/ui/groupHardware.ts`
- Test: `src/ui/groupHardware.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { groupHardware } from './groupHardware'
import type { HardwareLine } from '../scene/carcaseHardware'

const lines: HardwareLine[] = [
  { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
  { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'screw-8x40', qty: 32 },
]

describe('groupHardware', () => {
  it('names and prices a line from the catalogue and the library', () => {
    const rows = groupHardware(lines, {
      'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
    })
    expect(rows[0]).toEqual({
      key: 'hinge-overlay',
      cabinetLabel: 'Base A',
      name: '110° hinge c/w plate',
      qty: 2,
      unit: 'pcs',
      supplier: 'Blum',
      partNumber: '71B3550',
      unitCost: 3.4,
      totalCost: 6.8,
    })
  })

  // An unpriced job must never read as a free one: no entry means no cost, not a cost of zero.
  it('leaves an unpriced key blank rather than free', () => {
    const rows = groupHardware(lines, {})
    expect(rows.every((r) => r.unitCost === null && r.totalCost === null)).toBe(true)
  })

  it('keeps a deliberate zero as a price', () => {
    const rows = groupHardware(lines.slice(0, 1), {
      'hinge-overlay': { supplier: '', partNumber: '', unitCost: 0 },
    })
    expect(rows[0].unitCost).toBe(0)
    expect(rows[0].totalCost).toBe(0)
  })

  it('preserves the order the lines arrived in', () => {
    expect(groupHardware(lines, {}).map((r) => r.key)).toEqual(['hinge-overlay', 'screw-8x40'])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/ui/groupHardware.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
import { HARDWARE_CATALOGUE } from '../scene/hardwareCatalogue'
import type { HardwareLine } from '../scene/carcaseHardware'
import type { HardwareLibraryEntry } from '../scene/types'

export interface HardwareRow {
  key: string
  cabinetLabel: string
  name: string
  qty: number
  unit: string
  supplier: string
  partNumber: string
  unitCost: number | null
  totalCost: number | null
}

// Quantity from the cabinet, identity from the catalogue, price from the library — three sources,
// joined here and nowhere else.
//
// An unpriced key costs `null`, not 0, exactly as `groupDowels` treats a material with no rate: a
// job nobody has priced yet must not add up to nothing. A library entry that says 0 IS a price.
export function groupHardware(
  lines: HardwareLine[],
  library: Record<string, HardwareLibraryEntry>,
): HardwareRow[] {
  return lines.map((line) => {
    const def = HARDWARE_CATALOGUE[line.key]
    const entry = library[line.key]
    const unitCost = entry === undefined ? null : entry.unitCost
    return {
      key: line.key,
      cabinetLabel: line.cabinetLabel,
      name: def.name,
      qty: line.qty,
      unit: def.unit,
      supplier: entry?.supplier ?? '',
      partNumber: entry?.partNumber ?? '',
      unitCost,
      totalCost: unitCost === null ? null : unitCost * line.qty,
    }
  })
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/ui/groupHardware.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mutation-test the unpriced case**

```bash
cp src/ui/groupHardware.ts "$SCRATCHPAD"/groupHardware.bak
```

Change `const unitCost = entry === undefined ? null : entry.unitCost` to `const unitCost = entry?.unitCost ?? 0`.

Run: `pnpm vitest run src/ui/groupHardware.test.ts`
Expected: FAIL on "leaves an unpriced key blank rather than free".

```bash
cp "$SCRATCHPAD"/groupHardware.bak src/ui/groupHardware.ts
grep -n "entry === undefined" src/ui/groupHardware.ts
```

Expected: the original line is back.

- [ ] **Step 6: Commit**

```bash
git add src/ui/groupHardware.ts src/ui/groupHardware.test.ts
git commit -m "feat(ui): price a hardware line from the library, blank when unpriced"
```

---

## Task 12: The CSV

**Files:**
- Modify: `src/ui/buildCsv.ts` (`buildHardwareCsv`, at the end of the file)
- Test: `src/ui/buildCsv.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { buildHardwareCsv } from './buildCsv'
import type { HardwareRow } from './groupHardware'

const derived: HardwareRow[] = [
  {
    key: 'hinge-overlay',
    cabinetLabel: 'Base A',
    name: '110° hinge c/w plate',
    qty: 2,
    unit: 'pcs',
    supplier: 'Blum',
    partNumber: '71B3550',
    unitCost: 3.4,
    totalCost: 6.8,
  },
]

const manual = [
  {
    id: 'h1',
    name: 'Handle',
    qty: 4,
    unit: 'pcs',
    supplier: 'Ironmongery',
    partNumber: 'H-12',
    unitCost: 5,
    notes: '',
    linkedPartIds: [],
    linkedComponentIds: [],
  },
]

describe('buildHardwareCsv', () => {
  it('names the cabinet on a derived row and leaves it blank on a typed one', () => {
    const rows = buildHardwareCsv(manual, derived).split('\n')
    expect(rows[0]).toBe('Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes')
    expect(rows[1]).toBe('Base A,110° hinge c/w plate,2,pcs,Blum,71B3550,3.40,6.80,')
    expect(rows[2]).toBe(',Handle,4,pcs,Ironmongery,H-12,5.00,20.00,')
  })

  it('carries three totals, so a user can see which half is generated', () => {
    const rows = buildHardwareCsv(manual, derived).split('\n')
    expect(rows.slice(-3)).toEqual([
      ',,,,,,Generated total,6.80,',
      ',,,,,,Hand-entered total,20.00,',
      ',,,,,,Hardware total,26.80,',
    ])
  })

  it('leaves an unpriced derived row blank and out of the total', () => {
    const unpriced = [{ ...derived[0], unitCost: null, totalCost: null }]
    const rows = buildHardwareCsv([], unpriced).split('\n')
    expect(rows[1]).toBe('Base A,110° hinge c/w plate,2,pcs,Blum,71B3550,,,')
    expect(rows.at(-1)).toBe(',,,,,,Hardware total,0.00,')
  })

  it('still builds a header for an empty job', () => {
    expect(buildHardwareCsv([], [])).toBe(
      'Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes',
    )
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/ui/buildCsv.test.ts -t buildHardwareCsv`
Expected: FAIL — the header has no `Cabinet` column.

- [ ] **Step 3: Rewrite `buildHardwareCsv`**

Replace the existing function at the bottom of `src/ui/buildCsv.ts`:

```ts
export function buildHardwareCsv(items: HardwareItem[], derived: HardwareRow[] = []): string {
  const header = 'Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes'
  if (items.length === 0 && derived.length === 0) return header

  const money = (n: number | null): string => (n === null ? '' : n.toFixed(2))

  // Generated rows first, in the order carcaseHardware stated; then what the user typed.
  const derivedRows = derived.map(
    (r) =>
      `${quoteField(r.cabinetLabel)},${quoteField(r.name)},${r.qty},${quoteField(r.unit)},` +
      `${quoteField(r.supplier)},${quoteField(r.partNumber)},${money(r.unitCost)},${money(r.totalCost)},`,
  )
  const manualRows = items.map(
    (item) =>
      `,${quoteField(item.name)},${item.qty},${quoteField(item.unit)},${quoteField(item.supplier)},` +
      `${quoteField(item.partNumber)},${item.unitCost.toFixed(2)},${(item.qty * item.unitCost).toFixed(2)},` +
      `${quoteField(item.notes)}`,
  )

  // Three figures rather than one: which half of the quote the app generated is worth seeing.
  const generatedTotal = derived.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const manualTotal = items.reduce((sum, i) => sum + i.qty * i.unitCost, 0)

  return [
    header,
    ...derivedRows,
    ...manualRows,
    `,,,,,,Generated total,${generatedTotal.toFixed(2)},`,
    `,,,,,,Hand-entered total,${manualTotal.toFixed(2)},`,
    `,,,,,,Hardware total,${(generatedTotal + manualTotal).toFixed(2)},`,
  ].join('\n')
}
```

Add `import type { HardwareRow } from './groupHardware'` at the top of `buildCsv.ts`.

The third test expects only the grand total on its last line, which this produces; check the two subtotal lines are above it when you run it.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: PASS, 4 tests. The third test reads `rows.at(-1)`, which is the grand total — the two subtotals sit above it.

- [ ] **Step 5: Commit**

```bash
git add src/ui/buildCsv.ts src/ui/buildCsv.test.ts
git commit -m "feat(ui): the hardware CSV carries generated rows and three totals"
```

---

## Task 13: The Hardware tab

**Files:**
- Modify: `src/ui/HardwareTab.tsx`
- Test: `src/ui/HardwareTab.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HardwareTab } from './HardwareTab'
import type { HardwareRow } from './groupHardware'

const derived: HardwareRow[] = [
  {
    key: 'hinge-overlay',
    cabinetLabel: 'Base A',
    name: '110° hinge c/w plate',
    qty: 2,
    unit: 'pcs',
    supplier: '',
    partNumber: '',
    unitCost: null,
    totalCost: null,
  },
]

const props = {
  hardware: [],
  parts: [],
  components: [],
  onUpdateHardware: vi.fn(),
  derived,
  onSaveHardwareEntry: vi.fn(),
}

describe('HardwareTab', () => {
  it('shows a generated row with its cabinet and quantity', () => {
    render(<HardwareTab {...props} />)
    expect(screen.getByText('110° hinge c/w plate')).toBeDefined()
    expect(screen.getByText('Base A')).toBeDefined()
  })

  it('does not tell the user the job is free when nothing is priced', () => {
    render(<HardwareTab {...props} />)
    expect(screen.queryByText('$0.00')).toBeNull()
  })

  it('writes a typed unit cost into the library, keyed by the catalogue key', async () => {
    const onSaveHardwareEntry = vi.fn()
    render(<HardwareTab {...props} onSaveHardwareEntry={onSaveHardwareEntry} />)
    const input = screen.getByLabelText('Unit cost for 110° hinge c/w plate')
    // `type` fires a change per keystroke, so the settled value is the last call, not the only one.
    await userEvent.type(input, '3.4')
    expect(onSaveHardwareEntry).toHaveBeenLastCalledWith('hinge-overlay', {
      supplier: '',
      partNumber: '',
      unitCost: 3.4,
    })
  })

  it('still offers the hand-typed list beneath', () => {
    render(<HardwareTab {...props} />)
    expect(screen.getByText('Add item')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/ui/HardwareTab.test.tsx`
Expected: FAIL — `HardwareTab` takes no `derived` prop.

- [ ] **Step 3: Add the derived section**

Widen the props:

```tsx
import type { HardwareRow } from './groupHardware'
import type { HardwareLibraryEntry } from '../scene/types'

interface HardwareTabProps {
  hardware: HardwareItem[]
  parts: Part[]
  components: Component[]
  onUpdateHardware: (items: HardwareItem[]) => void
  derived: HardwareRow[]
  onSaveHardwareEntry: (key: string, entry: HardwareLibraryEntry) => void
}
```

and render this block immediately inside `<div className="flex flex-col flex-1 min-w-0">`, above the existing table:

```tsx
        {derived.length > 0 && (
          <>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Generated by the cabinets
            </h3>
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 pr-2 font-medium text-xs">Cabinet</th>
                  <th className="pb-2 px-2 font-medium text-xs">Item</th>
                  <th className="pb-2 px-2 font-medium text-xs">Qty</th>
                  <th className="pb-2 px-2 font-medium text-xs">Unit</th>
                  <th className="pb-2 px-2 font-medium text-xs">Unit cost</th>
                  <th className="pb-2 px-2 font-medium text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {derived.map((row) => (
                  <tr key={`${row.cabinetLabel}/${row.key}`} className="border-b border-border/30">
                    <td className="py-1.5 pr-2 text-xs">{row.cabinetLabel}</td>
                    <td className="py-1.5 px-2 text-xs">{row.name}</td>
                    <td className="py-1.5 px-2 text-xs">{row.qty}</td>
                    <td className="py-1.5 px-2 text-xs">{row.unit}</td>
                    <td className="py-1.5 px-2 text-xs">
                      <input
                        type="number"
                        step="0.01"
                        aria-label={`Unit cost for ${row.name}`}
                        className="w-20 bg-transparent border border-border rounded px-1"
                        defaultValue={row.unitCost ?? ''}
                        onChange={(e) =>
                          onSaveHardwareEntry(row.key, {
                            supplier: row.supplier,
                            partNumber: row.partNumber,
                            unitCost: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    {/* Blank, never $0.00: an unpriced job must not read as a free one. */}
                    <td className="py-1.5 px-2 text-xs">
                      {row.totalCost === null ? '—' : `$${row.totalCost.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
```

Quantity carries no input: the cabinet decides it, and an editable one would imply otherwise.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/ui/HardwareTab.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/HardwareTab.tsx src/ui/HardwareTab.test.tsx
git commit -m "feat(ui): the Hardware tab shows what the cabinets generated"
```

---

## Task 14: Wire it through `BomModal` and `App`

`BomModal` does **not** gain a `joints` prop. `App` holds the whole `Scene` and already computes `nestReports` outside the modal and passes them in; the hardware lines follow that path. This keeps the modal presentational and avoids assembling a `Scene` from five props inside it.

**Files:**
- Modify: `src/ui/BomModal.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/BomModal.test.tsx` (append; create if absent)

- [ ] **Step 1: Write the failing test**

```tsx
it('prices the generated rows against the hardware library', () => {
  render(
    <BomModal
      {...baseProps}
      hardwareLines={[
        { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
      ]}
      hardwareLibrary={{
        'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
      }}
      onSaveHardwareEntry={vi.fn()}
      onDeleteHardwareEntry={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('Hardware'))
  expect(screen.getByText('110° hinge c/w plate')).toBeDefined()
  expect(screen.getByText('$6.80')).toBeDefined()
})
```

Build `baseProps` from the modal's existing required props (`parts`, `components`, `materials`, `hardware`, `projectName`, the callbacks, `library`, `clearance`, `nestReports`, `nestPending`, `onSheetsTabChange`) — copy them from an existing `BomModal` render in the repo's tests, or from `App.tsx:630`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/ui/BomModal.test.tsx`
Expected: FAIL — `BomModal` takes no `hardwareLines`.

- [ ] **Step 3: Wire the modal**

In `src/ui/BomModal.tsx`, add to `BomModalProps`:

```ts
  hardwareLines: HardwareLine[]
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  onSaveHardwareEntry: (key: string, entry: HardwareLibraryEntry) => void
  onDeleteHardwareEntry: (key: string) => void
```

with `import { groupHardware } from './groupHardware'`, `import type { HardwareLine } from '../scene/carcaseHardware'` and `HardwareLibraryEntry` added to the `../scene/types` import. Inside the component:

```ts
  const derivedHardware = useMemo(
    () => groupHardware(hardwareLines, hardwareLibrary),
    [hardwareLines, hardwareLibrary],
  )
```

Pass `derived={derivedHardware}` and `onSaveHardwareEntry={onSaveHardwareEntry}` to `<HardwareTab …>`, and pass the derived rows to the hardware CSV call: `buildHardwareCsv(hardware, derivedHardware)`.

In `src/App.tsx`:

```ts
import { carcaseHardware } from './scene/carcaseHardware'
import { useHardwareLibrary } from './scene/useHardwareLibrary'
```

```ts
  const { hardwareLibrary, saveHardwareEntry, deleteHardwareEntry: deleteHardwareLibraryEntry } =
    useHardwareLibrary()
  // Derived, never stored — the same relationship the cutting list has to the parts.
  const hardwareLines = useMemo(() => carcaseHardware(scene), [scene])
```

and on the `<BomModal>` element:

```tsx
          hardwareLines={hardwareLines}
          hardwareLibrary={hardwareLibrary}
          onSaveHardwareEntry={saveHardwareEntry}
          onDeleteHardwareEntry={deleteHardwareLibraryEntry}
```

Note the rename on the destructure: `App` already binds `deleteEntry` from `useMaterialLibrary`, so the hardware one needs its own name.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm typecheck && pnpm vitest run src/ui/ src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/BomModal.tsx src/ui/BomModal.test.tsx src/App.tsx
git commit -m "feat(ui): App derives the hardware lines and the modal prices them"
```

---

## Task 15: The Library tab lists hardware too

**Files:**
- Modify: `src/ui/BomModal.tsx` (`LibraryTab`)
- Test: `src/ui/BomModal.test.tsx` (append)

- [ ] **Step 1: Write the failing test**

```tsx
it('lists a priced hardware item in the library, and can forget it', async () => {
  const onDeleteHardwareEntry = vi.fn()
  render(
    <BomModal
      {...baseProps}
      hardwareLines={[]}
      hardwareLibrary={{
        'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
      }}
      onSaveHardwareEntry={vi.fn()}
      onDeleteHardwareEntry={onDeleteHardwareEntry}
    />,
  )
  fireEvent.click(screen.getByText('Library'))
  expect(screen.getByText('110° hinge c/w plate')).toBeDefined()
  expect(screen.getByText('Blum')).toBeDefined()
  await userEvent.click(screen.getByLabelText('Forget 110° hinge c/w plate'))
  expect(onDeleteHardwareEntry).toHaveBeenCalledWith('hinge-overlay')
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/ui/BomModal.test.tsx -t library`
Expected: FAIL — the Library tab renders materials only.

- [ ] **Step 3: Add the section**

Give `LibraryTab` three more props (`hardwareLibrary`, `onSaveHardwareEntry`, `onDeleteHardwareEntry`) and render below the existing materials table:

```tsx
      <h3 className="text-xs font-medium text-muted-foreground mt-6 mb-2">Hardware</h3>
      {Object.keys(hardwareLibrary).length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No hardware priced yet. Set a unit cost in the Hardware tab to build your library.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-2 font-medium text-xs">Item</th>
              <th className="pb-2 px-2 font-medium text-xs">Supplier</th>
              <th className="pb-2 px-2 font-medium text-xs">Part #</th>
              <th className="pb-2 px-2 font-medium text-xs">Unit cost</th>
              <th className="pb-2 px-2 font-medium text-xs" />
            </tr>
          </thead>
          <tbody>
            {Object.entries(hardwareLibrary)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, entry]) => (
                <tr key={key} className="border-b border-border/30">
                  {/* The name is the catalogue's, never the library's: one statement of what an
                      item is called, so a renamed catalogue entry renames every priced row. */}
                  <td className="py-1.5 pr-2 text-xs">{HARDWARE_CATALOGUE[key]?.name ?? key}</td>
                  <td className="py-1.5 px-2 text-xs">{entry.supplier || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">{entry.partNumber || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">${entry.unitCost.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-xs">
                    <button
                      aria-label={`Forget ${HARDWARE_CATALOGUE[key]?.name ?? key}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => onDeleteHardwareEntry(key)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
```

Import `HARDWARE_CATALOGUE` from `../scene/hardwareCatalogue`, and pass the three props where `<LibraryTab …>` is rendered.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm vitest run src/ui/BomModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/BomModal.tsx src/ui/BomModal.test.tsx
git commit -m "feat(ui): the Library tab prices hardware beside materials"
```

---

## Task 16: Documentation, and the whole suite

**Files:**
- Modify: `CLAUDE.md`
- Modify: `project-structure.html`
- Modify: `docs/superpowers/notes/2026-09-06-driven-hardware-notes.md`
- Modify: `docs/superpowers/specs/2026-09-06-driven-hardware-design.md` (Status line)

- [ ] **Step 1: Add the invariant to CLAUDE.md**

In the `src/scene/` file tree, after the `carcaseOpenings.ts` row:

```
│   ├── hardwareCatalogue.ts  Stated key → {name, unit} for every hardware item, plus runnerKeyFor
│   │                    and hingeKeyFor. Data only — the frontMachining.ts of the BOM
│   ├── carcaseHardware.ts  carcaseHardware(scene) → HardwareLine[] — what the cabinets need
│   │                    bought, counted off the bores they already emitted
│   ├── useHardwareLibrary.ts  Loads/persists hardware prices via the idb hardware store
```

and in **Key Invariants**:

```
- **Hardware quantity comes from the bores, and only the variant comes from the cabinet.**
  `carcaseHardware` counts cups for hinges, deduped `slide_` rows for runner pairs, seated
  `adj-shelf-` boards × `2 × rows` for pins, and `_clearance` arrays for screws — never a figure
  re-derived from `CarcaseParams`. That is what makes a door too thin to bore list no hinge, and a
  joint converted to a dado drop its screws. Only `frontMount` (which hinge) and the clear internal
  depth (which runner) are read from the cabinet, because no bore can distinguish an overlay hinge
  from an inset one. The pilot array is the same screws seen from the other end: counting both
  doubles the quote.
- **A hardware row is derived, never stored.** `scene.hardware` stays the user's hand-typed items;
  the generated rows are computed in `App` and priced in `BomModal`, the way the cutting list and
  the dowel list already are. So a hardware item needs no `driven` flag, no reconciliation and no
  file-format version — and a per-cabinet hardware choice, when it lands, belongs in an override bag
  on `CarcaseParams` rather than in a detached row.
```

Also update the IndexedDB line: schema is **version 4** with four stores — `handles`, `library`, `settings` and `hardware`.

- [ ] **Step 2: Regenerate the architecture page**

```bash
node scripts/update-structure-html.mjs
```

Then by hand: add `hardwareCatalogue.ts`, `carcaseHardware.ts`, `useHardwareLibrary.ts` and `ui/groupHardware.ts` to the module tables, and add a roadmap row — *Hardware the cabinets generate* — with status **Done**, naming `scene/carcaseHardware.ts`, `scene/hardwareCatalogue.ts`, `ui/groupHardware.ts`. Update the measured test-count sentence with the real figures from Step 4.

- [ ] **Step 3: Close the notes and the spec**

Append a `### 2026-09-06 — shipped` entry to the notes recording: the real unit test count before and after; every mutation that was run and whether any survived; whether `groupHardware` staying out of `buildCsv.ts` still looks right after seeing both; and what the `Ungrouped` group looked like against a real scene.

Set the spec's `**Status:**` line to `**Complete.**` with the same counts.

- [ ] **Step 4: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm test
PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test
pnpm build
```

Record the **real** numbers, not the ones this plan predicts.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md project-structure.html docs/
git commit -m "docs: the hardware BOM's invariants, and close the stage"
```

---

## Acceptance

- [ ] Every preset lists hinges equal to `hingeCount` summed over its own door leaves — 2, 2, 8
- [ ] Every preset lists screws equal to `Σ screwCount` over its screw joints — 32, 28, 66
- [ ] A door under 15.5 mm thick lists **no** hinge
- [ ] A drawer bay lists **one** runner pair, though two uprights are bored
- [ ] Two bays in one cabinet take the same runner nominal, though their uprights differ by 12 mm
- [ ] A section with `rows: 1` lists half the pins of the same section with `rows: 2`
- [ ] A screw joint the user added inside a cabinet counts into that cabinet
- [ ] Two cabinets produce two groups, never one merged total
- [ ] An unpriced job shows blanks and a zero total, never `$0.00` per row
- [ ] `FILE_FORMAT_VERSION` is unchanged at 17; `DB_VERSION` is 4
- [ ] `regenerateComponents.ts`, `reconcileJoints.ts`, `useScene.ts` and `useFile.ts` are untouched
- [ ] Every mutation in every task was run, and no survivor was left unresolved
