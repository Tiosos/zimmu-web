# Cabinet Placement — Stage 1: the placement primitive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a carcase a position you can actually set, and an optional anchor that derives that
position from a neighbour's face.

**Architecture:** A new `anchor?: Anchor` on `CarcaseComponent` names a target cabinet, one of its
four side faces, a gap along that face's normal and a 2-vector offset within it. A new pure pass
`resolvePlacement` leads the regeneration pipeline and rewrites the position of every anchored
carcase from its target's world bounds. Bounds come from `carcaseBounds`, which reports what a
cabinet **occupies** — including an applied back, an overlay front and a toe kick — not its
structural shell.

**Tech Stack:** TypeScript (strict, no `any`), React 19, Vitest + happy-dom +
@testing-library/react. Package manager is **pnpm**, never npm.

**Spec:** `docs/superpowers/specs/2026-09-14-cabinet-placement-design.md`
**Notes:** `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`

---

## Background the engineer needs

Read this before Task 1. Everything below was verified against the code, not assumed.

**The carcase local frame** (`src/scene/carcaseRoles.ts:364-376`):

```
x ∈ [0, W]   left  → right
y ∈ [0, D]   front → back      ← y = 0 is the FRONT face
z ∈ [0, H]   floor → top
```

**A component's transform** is `translate(position) ∘ rotate(Euler XYZ)` about its **local origin**,
not its centre (`src/geom/transform.ts:8-47`).

**Three things fall outside the structural shell**, which is why bounds are "occupied" not "shell":

| | Extent | Source |
|---|---|---|
| Applied back | `y ∈ [D, D + BT]` | `carcaseRoles.ts:399` |
| Overlay front | `y ∈ [−FT, 0]` | CLAUDE.md, front mount rule |
| Toe kick | `z ∈ [0, toeKickHeight]`, below the carcase floor | `carcaseRoles.ts:432` |

**The implementation realises the spec's rule as AABB adjacency.** The spec states the rule
semantically — *the anchored cabinet meets the target with the face whose outward normal most
directly opposes the target face's normal*. In code that becomes: place the anchored cabinet's
axis-aligned bounding box adjacent to the target's, on the outward side of the named face. For
rotations that are multiples of 90° the two are identical, and the AABB form needs no special case
for a turned cabinet — which is exactly what makes the corner work. At other angles the AABB is
larger than the cabinet, so placement is conservative rather than exact; that is a documented
limitation, not a bug to fix here.

**Commands** (run from the repo root):

```bash
pnpm vitest run src/scene/anchor.test.ts   # one file
pnpm typecheck                              # tsc -b --noEmit
pnpm lint                                   # eslint .
pnpm test                                   # everything
```

`pnpm typecheck && pnpm lint && pnpm test` must pass before every commit; a pre-commit hook runs
typecheck automatically. Writing a `*.test.ts` file triggers that file's tests automatically via a
Claude Code hook.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scene/types.ts` | **Modify** — add `Anchor`, add `anchor?: Anchor` to `CarcaseComponent` |
| `src/scene/sectionTree.ts` | **Modify** — add `hasAnyFront`, a pure tree predicate |
| `src/geom/transform.ts` | **Modify** — widen `composeWorldMatrix`'s parameter, add `rotateVector` |
| `src/scene/carcaseBounds.ts` | **Create** — `Bounds3`, `carcaseBounds`. The one statement of a cabinet's occupied box |
| `src/scene/anchor.ts` | **Create** — `rotatedBounds`, `translatedBounds`, `anchoredPosition`. Pure, THREE-free |
| `src/scene/resolvePlacement.ts` | **Create** — `Scene → Scene`. Detach, break cycles, resolve |
| `src/scene/useScene.ts` | **Modify** — `applyPipeline` gains a fourth stage |
| `src/scene/useFile.ts` | **Modify** — `FILE_FORMAT_VERSION` 18 → 19 |
| `src/scene/fileValidation.ts` | **Modify** — an anchor's `to` must name a live component |
| `src/ui/NumberField.tsx` | **Modify** — add a `disabled` prop |
| `src/ui/PlacementPanel.tsx` | **Create** — position, rotation and the anchor as fields |
| `src/ui/CarcasePanel.tsx` | **Modify** — render `PlacementPanel`, thread `components` |

`carcaseBounds` gets its own module rather than living in `carcaseRoles.ts` as the spec suggested:
it needs nothing private from that file (`z0` is always 0, so `floorZ` is not required), and
`carcaseRoles.ts` is already the largest module under `src/scene/`. Record this deviation in the
notes file in Task 9.

---

### Task 1: `hasAnyFront` — does this cabinet wear a front at all?

An overlay front only pushes the occupied bounds forward if the cabinet actually has one. This is a
pure question about the section tree, so it belongs beside the other tree helpers.

**Files:**
- Modify: `src/scene/sectionTree.ts`
- Test: `src/scene/sectionTree.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/sectionTree.test.ts`. Add `hasAnyFront` to the existing import from
`./sectionTree` at the top of that file.

```ts
describe('hasAnyFront', () => {
  const leaf = (front?: FrontSpec): Section => ({
    id: 'sec_a' as SectionId,
    size: { kind: 'equal' },
    content: { kind: 'leaf' },
    ...(front === undefined ? {} : { front }),
  })

  it('is false for a bare leaf', () => {
    expect(hasAnyFront(leaf())).toBe(false)
  })

  it('is true for a leaf carrying a door', () => {
    expect(hasAnyFront(leaf({ kind: 'door', leaves: 1, hinge: 'left' }))).toBe(true)
  })

  // A split clears its own front onto its children, so the answer has to come from the leaves.
  it('finds a front on a child of a split', () => {
    const root: Section = {
      id: 'sec_root' as SectionId,
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf(), leaf({ kind: 'drawer-front' })],
      },
    }
    expect(hasAnyFront(root)).toBe(true)
  })

  it('is false when no leaf under a split carries one', () => {
    const root: Section = {
      id: 'sec_root' as SectionId,
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf(), leaf()],
      },
    }
    expect(hasAnyFront(root)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: FAIL — `hasAnyFront is not a function` (or a TypeScript import error).

- [ ] **Step 3: Implement `hasAnyFront`**

Add to `src/scene/sectionTree.ts`, after the `Section` interface and `newSectionId`:

```ts
// Whether any leaf under this section wears a front. Asked by `carcaseBounds`, because an overlay
// front only reaches in front of y = 0 if the cabinet actually has one — a doorless carcase and a
// doored one occupy different boxes.
export function hasAnyFront(root: Section): boolean {
  if (root.front !== undefined) return true
  if (root.content.kind === 'split') return root.content.children.some(hasAnyFront)
  return false
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/sectionTree.test.ts`
Expected: PASS, all four new tests green.

- [ ] **Step 5: Commit**

```bash
git add src/scene/sectionTree.ts src/scene/sectionTree.test.ts
git commit -m "feat(scene): ask the section tree whether a cabinet wears a front"
```

---

### Task 2: `carcaseBounds` — what a cabinet occupies

**Files:**
- Create: `src/scene/carcaseBounds.ts`
- Test: `src/scene/carcaseBounds.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/carcaseBounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { carcaseBounds } from './carcaseBounds'
import type { CarcaseParams, MaterialDef } from './types'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'
import type { Section } from './sectionTree'
import { newSectionId } from './sectionTree'

const MATERIALS: Record<string, MaterialDef> = {
  Ply18: { name: 'Ply18', costPerM2: 40, thickness: 18 },
  Ply6: { name: 'Ply6', costPerM2: 20, thickness: 6 },
  Oak20: { name: 'Oak20', costPerM2: 90, thickness: 20 },
}

const NO_OVERRIDES = new Map<string, PartOverrides>()

const bareLeaf = (): Section => ({
  id: newSectionId(),
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
})

const doorLeaf = (): Section => ({
  id: newSectionId(),
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
  front: { kind: 'door', leaves: 1, hinge: 'left' },
})

// Deliberately asymmetric: width, depth and height all differ, so a rule that reads one dimension
// where it means another cannot pass.
const params = (over: Partial<CarcaseParams> = {}): CarcaseParams => ({
  width: 600,
  height: 720,
  depth: 560,
  carcaseMaterial: 'Ply18',
  backMaterial: 'Ply6',
  frontMaterial: 'Oak20',
  hasTop: true,
  backMode: 'captured',
  baseMode: 'none',
  toeKickHeight: 100,
  toeKickSetback: 50,
  frontMount: 'overlay',
  frontReveal: 3,
  section: bareLeaf(),
  jointMethod: 'butt-screw',
  ...over,
})

const boundsOf = (p: CarcaseParams) => carcaseBounds(p, roleThicknessFor(p, MATERIALS, NO_OVERRIDES))

describe('carcaseBounds', () => {
  it('is the plain box when nothing protrudes', () => {
    expect(boundsOf(params())).toEqual({ x0: 0, x1: 600, y0: 0, y1: 560, z0: 0, z1: 720 })
  })

  it('an applied back reaches behind the carcase depth', () => {
    // Ply6 back, applied: the box grows by exactly the back's own thickness, at the back only.
    expect(boundsOf(params({ backMode: 'applied' })).y1).toBe(566)
  })

  it('a captured back does not', () => {
    expect(boundsOf(params({ backMode: 'captured' })).y1).toBe(560)
  })

  it('an overlay front reaches in front of y = 0', () => {
    expect(boundsOf(params({ section: doorLeaf() })).y0).toBe(-20)
  })

  it('an inset front does not — it sits inside the carcase', () => {
    expect(boundsOf(params({ section: doorLeaf(), frontMount: 'inset' })).y0).toBe(0)
  })

  // The overlay rule is about material, not about the mount setting: a cabinet with no fronts has
  // nothing in front of y = 0 however it is mounted.
  it('an overlay cabinet with no fronts reaches nowhere in front', () => {
    expect(boundsOf(params({ section: bareLeaf(), frontMount: 'overlay' })).y0).toBe(0)
  })

  // The case that rules out anchoring on the structural shell. The shell starts at floorZ = 100;
  // the toe kick fills the 100 mm below it, so the cabinet reaches the ground.
  it('a toe-kick cabinet reaches the floor, not its carcase bottom', () => {
    expect(boundsOf(params({ baseMode: 'toe-kick', toeKickHeight: 100 })).z0).toBe(0)
  })

  it('a ladder base reaches the floor too', () => {
    expect(boundsOf(params({ baseMode: 'ladder', toeKickHeight: 120 })).z0).toBe(0)
  })

  it('width and height are the params, untouched', () => {
    const b = boundsOf(params({ width: 900, height: 2100 }))
    expect([b.x0, b.x1, b.z1]).toEqual([0, 900, 2100])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/carcaseBounds.test.ts`
Expected: FAIL — cannot resolve `./carcaseBounds`.

- [ ] **Step 3: Implement `carcaseBounds`**

Create `src/scene/carcaseBounds.ts`:

```ts
import type { CarcaseParams } from './types'
import type { RoleThickness } from './resolveThickness'
import { hasAnyFront } from './sectionTree'

// Axis-aligned box in a carcase's own frame. Named `Bounds3` rather than reusing `LocalBox` because
// this is a whole cabinet's envelope, not a panel's box, and the two must not be swapped by accident.
export interface Bounds3 {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

// Any role in the `front-` family resolves to the front material slot — `materialForRole` reads the
// family, never the section id — so this stands in for whichever front the cabinet actually has.
const FRONT_ROLE = 'front-bounds-0'

// What a cabinet OCCUPIES, not its structural shell. Three things fall outside the shell and every
// one of them matters when two cabinets are butted together:
//
//   - an applied back reaches behind y = D,
//   - an overlay front reaches in front of y = 0,
//   - a toe kick fills the floor-to-carcase gap, so the box reaches z = 0 in every base mode.
//
// The last is decisive: anchoring on the shell would leave every toe-kick cabinet floating its own
// kick height off the floor.
//
// Reads the cabinet's material SLOTS only, never its parts' overrides. Overrides live on emitted
// parts, and placement runs before they are emitted — reading them would turn this pass into a
// fixed-point iteration. The deliberate consequence: a per-part override that thickens one back
// does not shove the neighbour.
export function carcaseBounds(p: CarcaseParams, thicknessOf: RoleThickness): Bounds3 {
  const front = p.frontMount === 'overlay' && hasAnyFront(p.section) ? thicknessOf(FRONT_ROLE) : 0
  const back = p.backMode === 'applied' ? thicknessOf('back') : 0
  return {
    x0: 0,
    x1: p.width,
    y0: -front,
    y1: p.depth + back,
    z0: 0,
    z1: p.height,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/carcaseBounds.test.ts`
Expected: PASS, all nine tests green.

- [ ] **Step 5: Commit**

```bash
git add src/scene/carcaseBounds.ts src/scene/carcaseBounds.test.ts
git commit -m "feat(scene): state what a cabinet occupies, toe kick and all"
```

---

### Task 3: `rotateVector` — the rotation convention, reused not copied

`anchor.ts` needs to rotate a box's corners. The Euler XYZ convention is already stated exactly once
in `composeWorldMatrix`; a second copy would be a bug waiting to happen. Widening that function's
parameter type to the two fields it actually reads lets it be called with a bare rotation.

**Files:**
- Modify: `src/geom/transform.ts`
- Test: `src/geom/transform.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/geom/transform.test.ts`. Add `rotateVector` to the existing import from
`./transform`.

```ts
describe('rotateVector', () => {
  it('leaves a vector alone at zero rotation', () => {
    expect(rotateVector({ x: 0, y: 0, z: 0 }, 1, 2, 3)).toEqual([1, 2, 3])
  })

  // +90° about z sends local +x to world +y. This is the pairing the corner case depends on.
  it('sends +x to +y at 90 degrees about z', () => {
    const [x, y, z] = rotateVector({ x: 0, y: 0, z: 90 }, 1, 0, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(1)
    expect(z).toBeCloseTo(0)
  })

  // ...and local +y to world −x, which is what puts a return run's backs against the side wall.
  it('sends +y to -x at 90 degrees about z', () => {
    const [x, y, z] = rotateVector({ x: 0, y: 0, z: 90 }, 0, 1, 0)
    expect(x).toBeCloseTo(-1)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
  })

  it('ignores translation entirely — it is a direction, not a point', () => {
    expect(rotateVector({ x: 0, y: 0, z: 180 }, 0, 0, 5)[2]).toBeCloseTo(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/geom/transform.test.ts`
Expected: FAIL — `rotateVector is not a function`.

- [ ] **Step 3: Widen `composeWorldMatrix` and add `rotateVector`**

In `src/geom/transform.ts`, replace the signature line of `composeWorldMatrix` — currently
`export function composeWorldMatrix(part: Part | Component): Float64Array {` — with the two
declarations below, leaving the function body exactly as it is:

```ts
// The two fields the matrix is built from. `Part` and `Component` both satisfy it structurally, so
// every existing call site is unaffected; naming it lets a bare rotation be composed without
// fabricating a whole part.
export interface Placed {
  position: Vec3
  rotation: Vec3
}

export function composeWorldMatrix(part: Placed): Float64Array {
```

Then add, immediately after `applyMatrixToPoint`:

```ts
// Rotate a direction or an offset by an Euler XYZ rotation, with no translation. Delegates to
// composeWorldMatrix so the rotation convention stays stated in exactly one place.
export function rotateVector(
  rotation: Vec3,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return applyMatrixToPoint(composeWorldMatrix({ position: { x: 0, y: 0, z: 0 }, rotation }), x, y, z)
}
```

`Vec3` is already imported at the top of `transform.ts`. `Part` and `Component` remain imported for
the other functions.

- [ ] **Step 4: Run the tests and the typechecker**

Run: `pnpm vitest run src/geom/transform.test.ts && pnpm typecheck`
Expected: tests PASS; typecheck clean — the widened parameter must not break any existing caller.

- [ ] **Step 5: Commit**

```bash
git add src/geom/transform.ts src/geom/transform.test.ts
git commit -m "feat(geom): rotate a direction without fabricating a part"
```

---

### Task 4: `anchor.ts` — where an anchored cabinet lands

**Files:**
- Modify: `src/scene/types.ts`
- Create: `src/scene/anchor.ts`
- Test: `src/scene/anchor.test.ts`

- [ ] **Step 1: Add the `Anchor` type**

In `src/scene/types.ts`, add immediately before `export interface CarcaseComponent`:

```ts
// Where a cabinet stands relative to another. The position it implies is DERIVED; a carcase with no
// anchor is free-placed and its `position` is the user's. Presence or absence says which, so no
// `driven` flag is needed — the same distinction `driven: false` draws for a part.
export interface Anchor {
  to: ComponentId
  // A face of the TARGET, in the target's own frame.
  face: 'left' | 'right' | 'front' | 'back'
  // Clearance along that face's normal. 0 butts the two cabinets together.
  gap: number
  // Offset within the face's plane, measured from the target's minimum corner on each of the two
  // axes the normal is not, taken in x < y < z order. {0, 0} is flush — and because the local frame
  // runs front→back and floor→top, flush means front-flush and floor-flush.
  offset: { u: number; v: number }
}
```

Then add the field to `CarcaseComponent`, after `params`:

```ts
  params: CarcaseParams
  anchor?: Anchor
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/scene/anchor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rotatedBounds, translatedBounds, anchoredPosition } from './anchor'
import type { Bounds3 } from './carcaseBounds'
import type { Anchor } from './types'

const NO_ROT = { x: 0, y: 0, z: 0 }
const TURNED = { x: 0, y: 0, z: 90 }

// A Base 600: 600 wide, 560 deep, 720 high. Asymmetric on every axis on purpose.
const base = (w = 600, d = 560, h = 720): Bounds3 => ({ x0: 0, x1: w, y0: 0, y1: d, z0: 0, z1: h })

const close = (b: Bounds3): number[] =>
  [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].map((n) => Math.round(n * 1e6) / 1e6)

describe('rotatedBounds', () => {
  it('is the box itself at zero rotation', () => {
    expect(close(rotatedBounds(base(), NO_ROT))).toEqual([0, 600, 0, 560, 0, 720])
  })

  // Turned 90° about z the footprint transposes AND moves: local +y goes to world −x, so the box
  // now hangs off the negative x side of its own origin.
  it('transposes and shifts the footprint at 90 degrees', () => {
    expect(close(rotatedBounds(base(), TURNED))).toEqual([-560, 0, 0, 600, 0, 720])
  })

  it('leaves height alone under a z rotation', () => {
    const b = rotatedBounds(base(), TURNED)
    expect([b.z0, b.z1]).toEqual([0, 720])
  })
})

describe('translatedBounds', () => {
  it('shifts every edge by the position', () => {
    expect(close(translatedBounds(base(), { x: 10, y: -20, z: 5 }))).toEqual([
      10, 610, -20, 540, 5, 725,
    ])
  })
})

describe('anchoredPosition', () => {
  const anchor = (over: Partial<Anchor> = {}): Anchor => ({
    to: 'cmp_target',
    face: 'right',
    gap: 0,
    offset: { u: 0, v: 0 },
    ...over,
  })

  it('butts a cabinet against the target right side', () => {
    const target = base()
    const own = rotatedBounds(base(800), NO_ROT)
    expect(anchoredPosition(anchor(), target, own)).toEqual({ x: 600, y: 0, z: 0 })
  })

  it('a gap pushes it further out along the normal', () => {
    const p = anchoredPosition(anchor({ gap: 12 }), base(), rotatedBounds(base(), NO_ROT))
    expect(p.x).toBe(612)
  })

  it('the left face puts it on the other side, clear of the target', () => {
    // Its own far edge lands on the target's near edge, so an 800-wide cabinet starts at -800.
    const p = anchoredPosition(anchor({ face: 'left' }), base(), rotatedBounds(base(800), NO_ROT))
    expect(p.x).toBe(-800)
  })

  it('offsets slide it within the face, from the target minimum corner', () => {
    const p = anchoredPosition(
      anchor({ offset: { u: 25, v: 1400 } }),
      base(),
      rotatedBounds(base(), NO_ROT),
    )
    // u is depth (y) and v is height (z) for a left/right face.
    expect(p).toEqual({ x: 600, y: 25, z: 1400 })
  })

  // THE CORNER. A blind cabinet 900 wide; a 600 return cabinet turned 90° anchored to its FRONT.
  // Reproduces the arithmetic in the spec exactly: the return run lands at x = 560, y = -600, so it
  // occupies world x ∈ [0, 560] with its back on the side wall and y ∈ [-600, 0] clear of the blind
  // unit. A rule that met the target's front with the anchored cabinet's own BACK cannot produce
  // this — the two planes are perpendicular.
  it('lands a turned cabinet against a blind unit front', () => {
    const blind = base(900)
    const own = rotatedBounds(base(600), TURNED)
    const p = anchoredPosition(anchor({ face: 'front' }), blind, own)
    expect(p.x).toBeCloseTo(560)
    expect(p.y).toBeCloseTo(-600)
    expect(p.z).toBeCloseTo(0)
  })

  it('and the turned cabinet then occupies the space the corner arithmetic predicts', () => {
    const own = rotatedBounds(base(600), TURNED)
    const p = anchoredPosition(anchor({ face: 'front' }), base(900), own)
    expect(close(translatedBounds(own, p))).toEqual([0, 560, -600, 0, 0, 720])
  })

  it('puts a back-to-back island behind the target', () => {
    const p = anchoredPosition(anchor({ face: 'back' }), base(), rotatedBounds(base(), NO_ROT))
    expect(p.y).toBe(560)
  })

  // Occupied bounds in, occupied bounds out: an applied back is already inside the target box, so
  // the neighbour clears the back rather than interpenetrating it.
  it('clears a target applied back because the bounds already carry it', () => {
    const withBack: Bounds3 = { ...base(), y1: 566 }
    const p = anchoredPosition(anchor({ face: 'back' }), withBack, rotatedBounds(base(), NO_ROT))
    expect(p.y).toBe(566)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/anchor.test.ts`
Expected: FAIL — cannot resolve `./anchor`.

- [ ] **Step 4: Implement `anchor.ts`**

Create `src/scene/anchor.ts`:

```ts
import type { Anchor, Vec3 } from './types'
import type { Bounds3 } from './carcaseBounds'
import { rotateVector } from '../geom/transform'

type Axis = 'x' | 'y' | 'z'

// Which axis a face's outward normal runs along, and which way it points.
const FACE_NORMAL: Record<Anchor['face'], { axis: Axis; positive: boolean }> = {
  left: { axis: 'x', positive: false },
  right: { axis: 'x', positive: true },
  front: { axis: 'y', positive: false },
  back: { axis: 'y', positive: true },
}

// The two axes of a face's plane, in x < y < z order — the order `Anchor.offset` is stated in.
const IN_PLANE: Record<Axis, [Axis, Axis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
}

const lo = (b: Bounds3, a: Axis): number => (a === 'x' ? b.x0 : a === 'y' ? b.y0 : b.z0)
const hi = (b: Bounds3, a: Axis): number => (a === 'x' ? b.x1 : a === 'y' ? b.y1 : b.z1)

// The axis-aligned envelope of a box after rotation about the origin, before any translation. Built
// from the eight corners rather than from the rotation angles, the way hiddenLine.ts asks its
// corners whether a part is a box: it is exact for the quarter turns a cabinet actually uses and
// merely conservative for anything else.
export function rotatedBounds(b: Bounds3, rotation: Vec3): Bounds3 {
  const corners: [number, number, number][] = []
  for (const x of [b.x0, b.x1])
    for (const y of [b.y0, b.y1])
      for (const z of [b.z0, b.z1]) corners.push(rotateVector(rotation, x, y, z))
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const zs = corners.map((c) => c[2])
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  }
}

export function translatedBounds(b: Bounds3, p: Vec3): Bounds3 {
  return {
    x0: b.x0 + p.x,
    x1: b.x1 + p.x,
    y0: b.y0 + p.y,
    y1: b.y1 + p.y,
    z0: b.z0 + p.z,
    z1: b.z1 + p.z,
  }
}

// Where an anchored cabinet's origin goes.
//
// `target` is the target's bounds already rotated and translated into the shared parent frame;
// `own` is the anchored cabinet's bounds rotated but NOT translated, so its world envelope is
// exactly `own + position` and the position falls straight out.
//
// On the normal axis the anchored box sits outside the named face, `gap` clear of it — which edge
// of it lands there follows from the face's direction alone. That is what lets a cabinet turned 90°
// meet a corner with its side without any special case: its envelope simply presents a different
// edge on that axis.
export function anchoredPosition(anchor: Anchor, target: Bounds3, own: Bounds3): Vec3 {
  const { axis, positive } = FACE_NORMAL[anchor.face]
  const [u, v] = IN_PLANE[axis]

  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[axis] = positive
    ? hi(target, axis) + anchor.gap - lo(own, axis)
    : lo(target, axis) - anchor.gap - hi(own, axis)
  position[u] = lo(target, u) + anchor.offset.u - lo(own, u)
  position[v] = lo(target, v) + anchor.offset.v - lo(own, v)
  return position
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/anchor.test.ts`
Expected: PASS, all twelve tests green.

- [ ] **Step 6: Commit**

```bash
git add src/scene/types.ts src/scene/anchor.ts src/scene/anchor.test.ts
git commit -m "feat(scene): an anchor, and where it puts a cabinet"
```

---

### Task 5: `resolvePlacement` — the pass

**Files:**
- Create: `src/scene/resolvePlacement.ts`
- Test: `src/scene/resolvePlacement.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/resolvePlacement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolvePlacement } from './resolvePlacement'
import type { Anchor, CarcaseComponent, ComponentId, MaterialDef, Scene } from './types'
import { newSectionId } from './sectionTree'

const MATERIALS: Record<string, MaterialDef> = {
  Ply18: { name: 'Ply18', costPerM2: 40, thickness: 18 },
  Ply6: { name: 'Ply6', costPerM2: 20, thickness: 6 },
  Oak20: { name: 'Oak20', costPerM2: 90, thickness: 20 },
}

const cabinet = (
  id: string,
  over: Partial<CarcaseComponent> = {},
  width = 600,
  depth = 560,
): CarcaseComponent => ({
  kind: 'carcase',
  id: id as ComponentId,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: {
    width,
    height: 720,
    depth,
    carcaseMaterial: 'Ply18',
    backMaterial: 'Ply6',
    frontMaterial: 'Oak20',
    hasTop: true,
    backMode: 'captured',
    baseMode: 'none',
    toeKickHeight: 100,
    toeKickSetback: 50,
    frontMount: 'overlay',
    frontReveal: 3,
    section: { id: newSectionId(), size: { kind: 'equal' }, content: { kind: 'leaf' } },
    jointMethod: 'butt-screw',
  },
  ...over,
})

const anchorTo = (to: string, over: Partial<Anchor> = {}): Anchor => ({
  to: to as ComponentId,
  face: 'right',
  gap: 0,
  offset: { u: 0, v: 0 },
  ...over,
})

const scene = (components: CarcaseComponent[]): Scene => ({
  parts: [],
  materials: MATERIALS,
  hardware: [],
  joints: [],
  components,
})

const at = (s: Scene, id: string) => s.components.find((c) => c.id === id)

describe('resolvePlacement', () => {
  it('leaves a free-placed cabinet exactly where it is', () => {
    const a = cabinet('a', { position: { x: 123, y: -45, z: 6 } })
    const out = resolvePlacement(scene([a]))
    expect(at(out, 'a')?.position).toEqual({ x: 123, y: -45, z: 6 })
  })

  it('returns the same component objects when nothing moves', () => {
    const a = cabinet('a')
    const out = resolvePlacement(scene([a]))
    expect(at(out, 'a')).toBe(a)
  })

  it('places an anchored cabinet against its target', () => {
    const a = cabinet('a')
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position).toEqual({ x: 600, y: 0, z: 0 })
  })

  it('follows a chain of three, each against the last', () => {
    const a = cabinet('a', {}, 600)
    const b = cabinet('b', { anchor: anchorTo('a') }, 400)
    const c = cabinet('c', { anchor: anchorTo('b') }, 800)
    const out = resolvePlacement(scene([a, b, c]))
    expect(at(out, 'b')?.position.x).toBe(600)
    expect(at(out, 'c')?.position.x).toBe(1000)
  })

  // The mutation guard: a fixture that stores the chain in order survives resolving in array order.
  // This one stores the dependants FIRST, so only a topological walk gets it right.
  it('resolves a chain stored back to front', () => {
    const c = cabinet('c', { anchor: anchorTo('b') }, 800)
    const b = cabinet('b', { anchor: anchorTo('a') }, 400)
    const a = cabinet('a', {}, 600)
    const out = resolvePlacement(scene([c, b, a]))
    expect(at(out, 'b')?.position.x).toBe(600)
    expect(at(out, 'c')?.position.x).toBe(1000)
  })

  it('moves the dependant when the target grows', () => {
    const a = cabinet('a', {}, 900)
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position.x).toBe(900)
  })

  it('detaches an anchor naming a component that does not exist, leaving it in place', () => {
    const b = cabinet('b', { position: { x: 777, y: 0, z: 0 }, anchor: anchorTo('ghost') })
    const out = resolvePlacement(scene([b]))
    expect(at(out, 'b')?.anchor).toBeUndefined()
    expect(at(out, 'b')?.position).toEqual({ x: 777, y: 0, z: 0 })
  })

  it('detaches an anchor to itself', () => {
    const a = cabinet('a', { position: { x: 50, y: 0, z: 0 }, anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a]))
    expect(at(out, 'a')?.anchor).toBeUndefined()
    expect(at(out, 'a')?.position).toEqual({ x: 50, y: 0, z: 0 })
  })

  it('breaks a two-cabinet cycle rather than looping forever', () => {
    const a = cabinet('a', { anchor: anchorTo('b') })
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'a')?.anchor).toBeUndefined()
    expect(at(out, 'b')?.anchor).toBeUndefined()
  })

  it('detaches an anchor across a different parent', () => {
    const a = cabinet('a')
    const b = cabinet('b', { parentId: 'cmp_group' as ComponentId, anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.anchor).toBeUndefined()
  })

  it('is idempotent — running it twice changes nothing more', () => {
    const a = cabinet('a')
    const b = cabinet('b', { anchor: anchorTo('a') })
    const once = resolvePlacement(scene([a, b]))
    const twice = resolvePlacement(once)
    expect(twice.components).toEqual(once.components)
  })

  // The corner, end to end through the pass.
  it('places a turned return run against a blind unit front', () => {
    const blind = cabinet('blind', {}, 900)
    const ret = cabinet(
      'ret',
      { rotation: { x: 0, y: 0, z: 90 }, anchor: anchorTo('blind', { face: 'front' }) },
      600,
    )
    const out = resolvePlacement(scene([blind, ret]))
    expect(at(out, 'ret')?.position.x).toBeCloseTo(560)
    expect(at(out, 'ret')?.position.y).toBeCloseTo(-600)
  })

  it('a toe kick under the target does not lift the neighbour off the floor', () => {
    const a = cabinet('a')
    a.params.baseMode = 'toe-kick'
    const b = cabinet('b', { anchor: anchorTo('a') })
    const out = resolvePlacement(scene([a, b]))
    expect(at(out, 'b')?.position.z).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/resolvePlacement.test.ts`
Expected: FAIL — cannot resolve `./resolvePlacement`.

- [ ] **Step 3: Implement `resolvePlacement`**

Create `src/scene/resolvePlacement.ts`:

```ts
import type { CarcaseComponent, ComponentId, MaterialDef, Scene, Vec3 } from './types'
import { carcaseBounds, type Bounds3 } from './carcaseBounds'
import { anchoredPosition, rotatedBounds, translatedBounds } from './anchor'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'

// Slots only. Overrides live on emitted parts and this pass runs before they exist; see
// carcaseBounds for why reading them would make the pipeline a fixed-point iteration.
const NO_OVERRIDES = new Map<string, PartOverrides>()

function boundsOf(c: CarcaseComponent, materials: Record<string, MaterialDef>): Bounds3 {
  return carcaseBounds(c.params, roleThicknessFor(c.params, materials, NO_OVERRIDES))
}

// Derives the position of every anchored carcase from its target's. Pure and idempotent, like the
// three regeneration passes it runs beside.
//
// An anchor is honoured only if it names a live carcase other than itself with the same parent: a
// cross-frame anchor would have to compose through two different ancestor chains, and nothing asks
// for one. Anything else is DETACHED — the cabinet keeps the position it last had rather than
// snapping to the origin, which is the difference between a cabinet you can find again and one you
// cannot.
export function resolvePlacement(scene: Scene): Scene {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of scene.components) if (c.kind === 'carcase') carcases.set(c.id, c)

  const targetOf = (c: CarcaseComponent): CarcaseComponent | undefined => {
    if (c.anchor === undefined) return undefined
    const t = carcases.get(c.anchor.to)
    if (t === undefined || t.id === c.id || t.parentId !== c.parentId) return undefined
    return t
  }

  // A cycle among anchors is a second graph over the same components — componentTree's guards watch
  // parentId, not this. Detach every member of a chain that revisits an id, rather than guessing
  // which link the user meant.
  const detached = new Set<ComponentId>()
  for (const c of carcases.values()) {
    if (c.anchor === undefined) continue
    if (targetOf(c) === undefined) {
      detached.add(c.id)
      continue
    }
    const seen = new Set<ComponentId>([c.id])
    let cur = targetOf(c)
    while (cur !== undefined) {
      if (seen.has(cur.id)) {
        detached.add(c.id)
        break
      }
      seen.add(cur.id)
      cur = targetOf(cur)
    }
  }

  const resolved = new Map<ComponentId, Vec3>()
  const positionOf = (c: CarcaseComponent): Vec3 => {
    const memo = resolved.get(c.id)
    if (memo !== undefined) return memo
    const anchor = c.anchor
    const target = targetOf(c)
    if (anchor === undefined || target === undefined || detached.has(c.id)) {
      resolved.set(c.id, c.position)
      return c.position
    }
    // Cycles are already detached, so this recursion terminates.
    const targetWorld = translatedBounds(
      rotatedBounds(boundsOf(target, scene.materials), target.rotation),
      positionOf(target),
    )
    const own = rotatedBounds(boundsOf(c, scene.materials), c.rotation)
    const next = anchoredPosition(anchor, targetWorld, own)
    resolved.set(c.id, next)
    return next
  }

  return {
    ...scene,
    components: scene.components.map((c) => {
      if (c.kind !== 'carcase') return c
      const next = positionOf(c)
      const drop = detached.has(c.id)
      const moved = next.x !== c.position.x || next.y !== c.position.y || next.z !== c.position.z
      // Referential identity when nothing changed: the "leaves everything else alone" tests read it,
      // and React re-renders on it.
      if (!drop && !moved) return c
      // `anchor: undefined` rather than a rest-destructure: the key is dropped by JSON.stringify on
      // save, every read site tests for undefined, and the shape stays legible at the call site.
      return drop ? { ...c, anchor: undefined, position: next } : { ...c, position: next }
    }),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/resolvePlacement.test.ts`
Expected: PASS, all thirteen tests green.

- [ ] **Step 5: Commit**

```bash
git add src/scene/resolvePlacement.ts src/scene/resolvePlacement.test.ts
git commit -m "feat(scene): resolve every anchored cabinet's position"
```

---

### Task 6: The pipeline gains a fourth stage

**Files:**
- Modify: `src/scene/useScene.ts:65-67`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/useScene.test.ts`. Add `applyPipeline` to the existing import from `./useScene`
if it is not already there, and reuse that file's existing scene fixtures where they fit; the test
below builds its own so it can be read on its own.

```ts
describe('applyPipeline placement stage', () => {
  it('resolves an anchored cabinet as part of one pipeline pass', () => {
    const a: CarcaseComponent = {
      kind: 'carcase',
      id: 'cmp_a' as ComponentId,
      label: 'A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: {
        width: 600,
        height: 720,
        depth: 560,
        carcaseMaterial: 'Ply18',
        backMaterial: 'Ply18',
        frontMaterial: 'Ply18',
        hasTop: true,
        backMode: 'captured',
        baseMode: 'none',
        toeKickHeight: 100,
        toeKickSetback: 50,
        frontMount: 'overlay',
        frontReveal: 3,
        section: { id: newSectionId(), size: { kind: 'equal' }, content: { kind: 'leaf' } },
        jointMethod: 'butt-screw',
      },
    }
    const b: CarcaseComponent = {
      ...a,
      id: 'cmp_b' as ComponentId,
      label: 'B',
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    }
    const out = applyPipeline({
      parts: [],
      materials: { Ply18: { name: 'Ply18', costPerM2: 40, thickness: 18 } },
      hardware: [],
      joints: [],
      components: [a, b],
    })
    const placed = out.components.find((c) => c.id === 'cmp_b')
    expect(placed?.position.x).toBe(600)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/useScene.test.ts -t "placement stage"`
Expected: FAIL — `expected 0 to be 600`, because nothing resolves the anchor yet.

- [ ] **Step 3: Add the stage**

In `src/scene/useScene.ts`, add the import beside the other pipeline imports:

```ts
import { resolvePlacement } from './resolvePlacement'
```

Replace `applyPipeline` (currently at `src/scene/useScene.ts:65-67`) with:

```ts
// Four stages. Placement leads because it reads only parameters and materials — but unlike the
// drawers-before-carcase ordering, this one is a convention rather than a constraint: no other stage
// reads a component's position at all, because regenerateComponents writes part positions local to
// the component and resolveWorldMatrix composes the world placement later.
export function applyPipeline(scene: Scene): Scene {
  return reconcileJoints(regenerateComponents(regenerateDrawers(resolvePlacement(scene))))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: PASS — the new test green and every existing `useScene` test still green.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(scene): the regeneration pipeline gains a placement stage"
```

---

### Task 7: File format v19

**Files:**
- Modify: `src/scene/useFile.ts:26`
- Modify: `src/scene/fileValidation.ts` (around the `parentId` check at line 254)
- Test: `src/scene/useFile.test.ts`
- Test: `src/scene/fileValidation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/useFile.test.ts`:

```ts
describe('v19 anchors', () => {
  it('states the current file format version', () => {
    expect(FILE_FORMAT_VERSION).toBe(19)
  })

  it('round-trips an anchor through parseFile', () => {
    const anchored = {
      kind: 'carcase',
      id: 'cmp_b',
      label: 'B',
      parentId: null,
      position: { x: 600, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      visible: true,
      params: BASE_PARAMS,
      anchor: { to: 'cmp_a', face: 'right', gap: 3, offset: { u: 10, v: 20 } },
    }
    const parsed = parseFile(
      JSON.stringify({
        version: 19,
        scene: { parts: [], materials: {}, hardware: [], joints: [], components: [anchored] },
      }),
    )
    const b = parsed.scene.components.find((c) => c.id === 'cmp_b')
    expect(b?.kind === 'carcase' ? b.anchor : undefined).toEqual({
      to: 'cmp_a',
      face: 'right',
      gap: 3,
      offset: { u: 10, v: 20 },
    })
  })

  // A v18 file has no anchors at all, and must load with every cabinet free-placed rather than
  // failing or acquiring a default.
  it('loads a v18 file with every cabinet free-placed', () => {
    const parsed = parseFile(
      JSON.stringify({
        version: 18,
        scene: {
          parts: [],
          materials: {},
          hardware: [],
          joints: [],
          components: [
            {
              kind: 'carcase',
              id: 'cmp_a',
              label: 'A',
              parentId: null,
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              visible: true,
              params: BASE_PARAMS,
            },
          ],
        },
      }),
    )
    const a = parsed.scene.components.find((c) => c.id === 'cmp_a')
    expect(a?.kind === 'carcase' ? a.anchor : 'not-a-carcase').toBeUndefined()
  })
})
```

`BASE_PARAMS` is a `CarcaseParams` literal. If `useFile.test.ts` already defines an equivalent
fixture, use that one instead of adding a second; otherwise add this above the new `describe`:

```ts
const BASE_PARAMS = {
  width: 600,
  height: 720,
  depth: 560,
  carcaseMaterial: 'Ply18',
  backMaterial: 'Ply18',
  frontMaterial: 'Ply18',
  hasTop: true,
  backMode: 'captured',
  baseMode: 'none',
  toeKickHeight: 100,
  toeKickSetback: 50,
  frontMount: 'overlay',
  frontReveal: 3,
  section: { id: 'sec_1', size: { kind: 'equal' }, content: { kind: 'leaf' } },
  jointMethod: 'butt-screw',
}
```

Append to `src/scene/fileValidation.test.ts`:

```ts
describe('anchor validation', () => {
  const withComponents = (components: unknown[]) => ({
    version: 19,
    scene: { parts: [], materials: {}, hardware: [], joints: [], components },
  })

  const carcase = (id: string, anchor?: unknown) => ({
    kind: 'carcase',
    id,
    label: id,
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    visible: true,
    ...(anchor === undefined ? {} : { anchor }),
  })

  it('rejects an anchor naming a component that is not in the file', () => {
    expect(() =>
      validateCurrentFile(
        withComponents([carcase('cmp_a', { to: 'cmp_ghost', face: 'right', gap: 0, offset: { u: 0, v: 0 } })]),
      ),
    ).toThrow(/anchor\.to/)
  })

  it('accepts an anchor naming a live component', () => {
    expect(() =>
      validateCurrentFile(
        withComponents([
          carcase('cmp_a'),
          carcase('cmp_b', { to: 'cmp_a', face: 'left', gap: 0, offset: { u: 0, v: 0 } }),
        ]),
      ),
    ).not.toThrow()
  })
})
```

Match the import and call shape of the existing tests in `fileValidation.test.ts` — if that file
wraps `validateCurrentFile` in a helper, use the helper.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/useFile.test.ts src/scene/fileValidation.test.ts`
Expected: FAIL — `expected 18 to be 19`, and the anchor-validation test does not throw.

- [ ] **Step 3: Bump the version and validate the anchor**

In `src/scene/useFile.ts:26`:

```ts
export const FILE_FORMAT_VERSION = 19
```

Update the version history comment in `CLAUDE.md` in Task 9, not here.

In `src/scene/fileValidation.ts`, directly after the existing `parentId` check (the block ending
`'must name a live component or be null'`), add:

```ts
    // An anchor's target is the same kind of reference parentId is, over a different graph. A
    // dangling one is detached at resolve time, but a file that names a component it does not carry
    // is malformed, not merely stale.
    const anchor = component.anchor
    if (anchor !== undefined && anchor !== null) {
      if (typeof anchor !== 'object') {
        throw new ZimmuFileValidationError(`${path}.anchor`, 'must be an object')
      }
      const to = (anchor as { to?: unknown }).to
      if (typeof to !== 'string' || !componentIds.has(to)) {
        throw new ZimmuFileValidationError(`${path}.anchor.to`, 'must name a live component')
      }
    }
```

If `component` is typed such that `.anchor` is not accessible, read it as
`(component as { anchor?: unknown }).anchor` — match how the surrounding code reaches its fields.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/useFile.test.ts src/scene/fileValidation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useFile.ts src/scene/fileValidation.ts src/scene/useFile.test.ts src/scene/fileValidation.test.ts
git commit -m "feat(scene): file format v19 carries a cabinet's anchor"
```

---

### Task 8: The Placement panel

**Files:**
- Modify: `src/ui/NumberField.tsx`
- Create: `src/ui/PlacementPanel.tsx`
- Modify: `src/ui/CarcasePanel.tsx`
- Test: `src/ui/PlacementPanel.test.tsx`

- [ ] **Step 1: Add a `disabled` prop to `NumberField`**

An anchored cabinet's position is derived, so its fields must read as not-yours — the same signal a
driven part's dimensions already give. In `src/ui/NumberField.tsx`, add `disabled = false` to the
destructured props and to the prop type, and pass it to the `Input`:

```tsx
export function NumberField({
  id,
  label,
  value,
  onCommit,
  disabled = false,
}: {
  id: string
  label: string
  value: number
  onCommit: (v: number) => void
  disabled?: boolean
}) {
```

and on the `<Input …>` element add:

```tsx
        disabled={disabled}
```

- [ ] **Step 2: Write the failing tests**

Create `src/ui/PlacementPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlacementPanel } from './PlacementPanel'
import type { CarcaseComponent, ComponentId } from '../scene/types'
import { newSectionId } from '../scene/sectionTree'

const cabinet = (id: string, over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id: id as ComponentId,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: {
    width: 600,
    height: 720,
    depth: 560,
    carcaseMaterial: 'Ply18',
    backMaterial: 'Ply18',
    frontMaterial: 'Ply18',
    hasTop: true,
    backMode: 'captured',
    baseMode: 'none',
    toeKickHeight: 100,
    toeKickSetback: 50,
    frontMount: 'overlay',
    frontReveal: 3,
    section: { id: newSectionId(), size: { kind: 'equal' }, content: { kind: 'leaf' } },
    jointMethod: 'butt-screw',
  },
  ...over,
})

describe('PlacementPanel', () => {
  it('commits a typed X position', () => {
    const onUpdate = vi.fn()
    render(<PlacementPanel component={cabinet('a')} components={[cabinet('a')]} onUpdate={onUpdate} />)
    const x = screen.getByLabelText('X')
    fireEvent.change(x, { target: { value: '1800' } })
    fireEvent.blur(x)
    expect(onUpdate).toHaveBeenCalledWith({ position: { x: 1800, y: 0, z: 0 } })
  })

  // Negative coordinates are ordinary: a return run sits at negative y.
  it('accepts a negative position', () => {
    const onUpdate = vi.fn()
    render(<PlacementPanel component={cabinet('a')} components={[cabinet('a')]} onUpdate={onUpdate} />)
    const y = screen.getByLabelText('Y')
    fireEvent.change(y, { target: { value: '-600' } })
    fireEvent.blur(y)
    expect(onUpdate).toHaveBeenCalledWith({ position: { x: 0, y: -600, z: 0 } })
  })

  it('commits a rotation about Z', () => {
    const onUpdate = vi.fn()
    render(<PlacementPanel component={cabinet('a')} components={[cabinet('a')]} onUpdate={onUpdate} />)
    const rot = screen.getByLabelText('Rotation Z')
    fireEvent.change(rot, { target: { value: '90' } })
    fireEvent.blur(rot)
    expect(onUpdate).toHaveBeenCalledWith({ rotation: { x: 0, y: 0, z: 90 } })
  })

  it('disables the position fields when the cabinet is anchored', () => {
    const anchored = cabinet('b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    render(
      <PlacementPanel component={anchored} components={[cabinet('cmp_a'), anchored]} onUpdate={vi.fn()} />,
    )
    expect(screen.getByLabelText('X')).toBeDisabled()
  })

  it('leaves rotation editable while anchored — rotation is never derived', () => {
    const anchored = cabinet('b', {
      anchor: { to: 'cmp_a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    render(
      <PlacementPanel component={anchored} components={[cabinet('cmp_a'), anchored]} onUpdate={vi.fn()} />,
    )
    expect(screen.getByLabelText('Rotation Z')).not.toBeDisabled()
  })

  it('does not offer the cabinet itself as an anchor target', () => {
    render(
      <PlacementPanel
        component={cabinet('a')}
        components={[cabinet('a'), cabinet('b')]}
        onUpdate={vi.fn()}
      />,
    )
    const options = Array.from(screen.getByLabelText('Anchored to').querySelectorAll('option')).map(
      (o) => o.textContent,
    )
    expect(options).not.toContain('a')
    expect(options).toContain('b')
  })

  it('creates an anchor when a target is chosen', () => {
    const onUpdate = vi.fn()
    render(
      <PlacementPanel
        component={cabinet('a')}
        components={[cabinet('a'), cabinet('b')]}
        onUpdate={onUpdate}
      />,
    )
    fireEvent.change(screen.getByLabelText('Anchored to'), { target: { value: 'b' } })
    expect(onUpdate).toHaveBeenCalledWith({
      anchor: { to: 'b', face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
  })

  it('detaches, and says nothing about position — the pass freezes it', () => {
    const onUpdate = vi.fn()
    const anchored = cabinet('b', {
      anchor: { to: 'a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    render(<PlacementPanel component={anchored} components={[cabinet('a'), anchored]} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Detach' }))
    expect(onUpdate).toHaveBeenCalledWith({ anchor: undefined })
  })

  // The offset axes depend on which face was named, so hardcoded labels would be wrong half the time.
  it('labels the offsets by the axes the chosen face leaves free', () => {
    const anchored = cabinet('b', {
      anchor: { to: 'a' as ComponentId, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    })
    render(<PlacementPanel component={anchored} components={[cabinet('a'), anchored]} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText('Depth')).toBeInTheDocument()
    expect(screen.getByLabelText('Height')).toBeInTheDocument()
  })

  it('labels them differently for a front face', () => {
    const anchored = cabinet('b', {
      anchor: { to: 'a' as ComponentId, face: 'front', gap: 0, offset: { u: 0, v: 0 } },
    })
    render(<PlacementPanel component={anchored} components={[cabinet('a'), anchored]} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText('Across')).toBeInTheDocument()
    expect(screen.getByLabelText('Height')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/ui/PlacementPanel.test.tsx`
Expected: FAIL — cannot resolve `./PlacementPanel`.

- [ ] **Step 4: Implement `PlacementPanel`**

Create `src/ui/PlacementPanel.tsx`:

```tsx
import type { Anchor, CarcaseComponent, Component, ComponentId } from '../scene/types'
import { NumberField } from './NumberField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// The two axes a face leaves free, named for a woodworker rather than for the frame. Mirrors
// anchor.ts's IN_PLANE table: a left/right face leaves depth and height, a front/back face leaves
// the cross-cabinet direction and height.
const OFFSET_LABELS: Record<Anchor['face'], [string, string]> = {
  left: ['Depth', 'Height'],
  right: ['Depth', 'Height'],
  front: ['Across', 'Height'],
  back: ['Across', 'Height'],
}

const FACES: Anchor['face'][] = ['left', 'right', 'front', 'back']

const DEFAULT_ANCHOR = (to: ComponentId): Anchor => ({
  to,
  face: 'right',
  gap: 0,
  offset: { u: 0, v: 0 },
})

export function PlacementPanel({
  component,
  components,
  onUpdate,
}: {
  component: CarcaseComponent
  components: Component[]
  onUpdate: (patch: Partial<CarcaseComponent>) => void
}) {
  const anchor = component.anchor
  const anchored = anchor !== undefined
  const [uLabel, vLabel] = OFFSET_LABELS[anchor?.face ?? 'right']

  // Only cabinets in the same frame can be anchored to — resolvePlacement detaches anything else, so
  // offering it here would be offering a choice the pass undoes.
  const targets = components.filter(
    (c): c is CarcaseComponent =>
      c.kind === 'carcase' && c.id !== component.id && c.parentId === component.parentId,
  )

  const setAnchor = (patch: Partial<Anchor>): void => {
    if (anchor === undefined) return
    onUpdate({ anchor: { ...anchor, ...patch } })
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="grid grid-cols-3 gap-2">
        <NumberField
          id={`pos-x-${component.id}`}
          label="X"
          value={component.position.x}
          disabled={anchored}
          onCommit={(v) => onUpdate({ position: { ...component.position, x: v } })}
        />
        <NumberField
          id={`pos-y-${component.id}`}
          label="Y"
          value={component.position.y}
          disabled={anchored}
          onCommit={(v) => onUpdate({ position: { ...component.position, y: v } })}
        />
        <NumberField
          id={`pos-z-${component.id}`}
          label="Z"
          value={component.position.z}
          disabled={anchored}
          onCommit={(v) => onUpdate({ position: { ...component.position, z: v } })}
        />
      </div>

      {/* Never disabled: an anchor derives position and nothing else. A corner IS a cabinet that is
          both turned and anchored, so turning one while anchored has to stay possible. */}
      <NumberField
        id={`rot-z-${component.id}`}
        label="Rotation Z"
        value={component.rotation.z}
        onCommit={(v) => onUpdate({ rotation: { ...component.rotation, z: v } })}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor={`anchor-to-${component.id}`} className="text-xs">
          Anchored to
        </Label>
        <select
          id={`anchor-to-${component.id}`}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={anchor?.to ?? ''}
          onChange={(e) =>
            onUpdate(
              e.target.value === ''
                ? { anchor: undefined }
                : { anchor: DEFAULT_ANCHOR(e.target.value as ComponentId) },
            )
          }
        >
          <option value="">Nothing — free placed</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {anchor !== undefined && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`anchor-face-${component.id}`} className="text-xs">
              Face
            </Label>
            <select
              id={`anchor-face-${component.id}`}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={anchor.face}
              onChange={(e) => setAnchor({ face: e.target.value as Anchor['face'] })}
            >
              {FACES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NumberField
              id={`anchor-gap-${component.id}`}
              label="Gap"
              value={anchor.gap}
              onCommit={(v) => setAnchor({ gap: v })}
            />
            <NumberField
              id={`anchor-u-${component.id}`}
              label={uLabel}
              value={anchor.offset.u}
              onCommit={(v) => setAnchor({ offset: { ...anchor.offset, u: v } })}
            />
            <NumberField
              id={`anchor-v-${component.id}`}
              label={vLabel}
              value={anchor.offset.v}
              onCommit={(v) => setAnchor({ offset: { ...anchor.offset, v: v } })}
            />
          </div>

          {/* Detaching says nothing about position: resolvePlacement freezes the cabinet where it
              last resolved, so it stays where the user can see it. */}
          <Button variant="outline" size="sm" onClick={() => onUpdate({ anchor: undefined })}>
            Detach
          </Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/ui/PlacementPanel.test.tsx`
Expected: PASS, all eleven tests green.

- [ ] **Step 6: Render it from `CarcasePanel`**

In `src/ui/CarcasePanel.tsx`, add the import:

```ts
import { PlacementPanel } from './PlacementPanel'
```

`CarcasePanel` already receives `components: Component[]` and
`onUpdate: (updater: (c: Component) => Component) => void`. Add a collapsible Placement section as
the **first** section in its returned markup, following the shape of the sections already there
(`SectionHeader` inside a `Collapsible`, with a `useState` for the open flag beside the others):

```tsx
      <Collapsible open={placementOpen} onOpenChange={setPlacementOpen}>
        <SectionHeader open={placementOpen} label="Placement" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <PlacementPanel
            component={component}
            components={components}
            onUpdate={(patch) => onUpdate((c) => (c.kind === 'carcase' ? { ...c, ...patch } : c))}
          />
        </CollapsibleContent>
      </Collapsible>
```

and beside the other `useState` calls at the top of the component:

```tsx
  const [placementOpen, setPlacementOpen] = useState(true)
```

- [ ] **Step 7: Run the full suite, typecheck and lint**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. If `CarcasePanel.test.tsx` asserts a section count or ordering, update those
assertions to account for the new first section.

- [ ] **Step 8: Commit**

```bash
git add src/ui/NumberField.tsx src/ui/PlacementPanel.tsx src/ui/PlacementPanel.test.tsx src/ui/CarcasePanel.tsx src/ui/CarcasePanel.test.tsx
git commit -m "feat(ui): put a cabinet somewhere, and anchor it to another"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`
- Modify: `project-structure.html` (regenerated, not hand-edited)

- [ ] **Step 1: Add the new modules to the CLAUDE.md architecture tree**

Under `src/scene/`, in alphabetical position:

```
│   ├── anchor.ts        rotatedBounds + translatedBounds + anchoredPosition — where an anchored
│   │                    cabinet's origin goes. The AABB form of the meeting-face rule, so a turned
│   │                    cabinet needs no special case
│   ├── carcaseBounds.ts carcaseBounds(params, thicknessOf) — what a cabinet OCCUPIES: applied back,
│   │                    overlay front and toe kick included. Material slots only, never overrides
│   ├── resolvePlacement.ts  Pure Scene → Scene; derives every anchored carcase's position, detaches
│   │                    a dangling or cyclic anchor, freezing the cabinet where it was
```

- [ ] **Step 2: Add the invariants**

Append to the **Key Invariants** section of `CLAUDE.md`:

```markdown
- **A cabinet's box is what it occupies, not its shell.** `carcaseBounds` is the one statement of it,
  and three things fall outside the shell: an applied back reaches behind `y = D`, an overlay front
  in front of `y = 0`, and a toe kick fills `z ∈ [0, toeKickHeight]` below the carcase floor.
  Anchoring on the shell floats every toe-kick cabinet its own kick height off the ground. It reads
  the cabinet's material **slots** only — never a part's overrides, which live on emitted parts and
  would make placement a fixed-point iteration.
- **An anchor derives position; rotation is always the user's.** A corner is a cabinet that is both
  turned *and* anchored, and those are two separate facts. The meeting face is the one whose outward
  normal most opposes the target face's — realised as AABB adjacency, which needs no special case for
  a turned cabinet. The tempting rule, "the opposite face meets it", is wrong and **every
  straight-run fixture passes it**: only a corner fixture catches it, because the return cabinet's
  back is a plane of constant world x while the target's front is a plane of constant world y.
- **`anchor === undefined` is the detached state.** No `driven` flag exists on a carcase, because
  presence or absence already draws the line `driven: false` draws for a part. A dangling or cyclic
  anchor is detached by `resolvePlacement`, which **freezes the cabinet where it last resolved** —
  snapping it to the origin loses it.
- **The anchor graph is a second graph over the same components.** `wouldCycle` and
  `breakComponentCycles` guard `parentId`; they are the model for the anchor guard, never its
  implementation. An anchor may only name a cabinet with the same `parentId`, so both sit in one
  frame and no ancestor composition is needed.
- **The pipeline is four stages**, `resolvePlacement` → `regenerateDrawers` → `regenerateComponents`
  → `reconcileJoints`. Placement leads by **convention, not constraint**: no stage reads a
  component's position at all, because `regenerateComponents` writes part positions local to the
  component and `resolveWorldMatrix` composes world placement later.
```

Update the `ZimmuFile` serialization invariant's version list, appending to the parenthetical:

```
; v19 added the carcase anchor
```

and change `FILE_FORMAT_VERSION = 18` to `FILE_FORMAT_VERSION = 19` in that same bullet.

- [ ] **Step 3: Record the deviations in the notes file**

Append to `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`:

```markdown
## Stage 1 — implementation notes

- **`carcaseBounds` got its own module**, not a home in `carcaseRoles.ts` as the spec suggested. It
  needs nothing private from that file — `z0` is always 0, so `floorZ` is not required — and
  `carcaseRoles.ts` is already the largest module under `src/scene/`.
- **The meeting-face rule is implemented as AABB adjacency.** The spec states it semantically (the
  face whose outward normal most opposes the target's); in code, placing the anchored cabinet's
  bounding box on the outward side of the named face produces exactly that, with no special case for
  a turned cabinet. The two are identical for quarter turns. At other angles the AABB is larger than
  the cabinet, so placement is conservative rather than exact — documented, not a defect to chase.
- **An anchor may only name a cabinet with the same `parentId`.** Not in the spec; added because a
  cross-frame anchor would have to compose through two ancestor chains for no use case anyone asked
  for. `resolvePlacement` detaches one, and `PlacementPanel` does not offer it.
- **`composeWorldMatrix`'s parameter was widened** to a new `Placed` interface (`position` +
  `rotation`) so `rotateVector` could reuse the Euler XYZ convention instead of copying it. `Part`
  and `Component` both satisfy it structurally, so no call site changed.
```

- [ ] **Step 4: Regenerate `project-structure.html`**

Run: `node scripts/update-structure-html.mjs`
Expected: the `AUTOGEN` blocks pick up the three new source files, the three new test files and the
new test count. Do not hand-edit inside the markers.

- [ ] **Step 5: Run the full check suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md project-structure.html
git commit -m "docs: the placement primitive's invariants, and close the stage"
```

---

### Task 10: Mutation testing

Every rule added above should be broken deliberately, watched to fail, and restored. **Back the file
up first and restore from that copy — never `git checkout`**, which throws away uncommitted work in
the same file.

- [ ] **Step 1: Set up a scratch directory**

```bash
mkdir -p "$SCRATCHPAD" && cp src/scene/anchor.ts "$SCRATCHPAD/anchor.bak" && cp src/scene/carcaseBounds.ts "$SCRATCHPAD/carcaseBounds.bak" && cp src/scene/resolvePlacement.ts "$SCRATCHPAD/resolvePlacement.bak"
```

If `$SCRATCHPAD` is unset, use the scratchpad path this session was given.

- [ ] **Step 2: Mutation 1 — the opposite-face rule**

In `src/scene/anchor.ts`, replace the `position[axis] = …` ternary with the positive branch only:

```ts
  position[axis] = hi(target, axis) + anchor.gap - lo(own, axis)
```

Run: `grep -n "positive$" src/scene/anchor.ts` — expect no match, confirming the edit landed.
Run: `pnpm vitest run src/scene/anchor.test.ts src/scene/resolvePlacement.test.ts`
**Predict before running:** the `left` face test, both corner tests and the back-to-back test fail;
the straight-run tests all pass. If fewer fail than predicted, the gap is real — a straight-run-only
fixture cannot see this rule.

Restore: `cp "$SCRATCHPAD/anchor.bak" src/scene/anchor.ts` then
`grep -n "positive$" src/scene/anchor.ts` to confirm it is back.

- [ ] **Step 3: Mutation 2 — shell bounds instead of occupied**

In `src/scene/carcaseBounds.ts`, change `z0: 0` to `z0: p.baseMode === 'toe-kick' ? p.toeKickHeight : 0`.

Run: `pnpm vitest run src/scene/carcaseBounds.test.ts src/scene/resolvePlacement.test.ts`
**Predict:** the toe-kick bounds test and the toe-kick placement test fail; nothing else does.

Restore: `cp "$SCRATCHPAD/carcaseBounds.bak" src/scene/carcaseBounds.ts` and grep to confirm.

- [ ] **Step 4: Mutation 3 — resolve in array order**

In `src/scene/resolvePlacement.ts`, change `positionOf(target)` inside the `translatedBounds` call to
`target.position`.

Run: `pnpm vitest run src/scene/resolvePlacement.test.ts`
**Predict:** only "resolves a chain stored back to front" fails. The in-order chain test passes,
which is the whole point of storing that fixture backwards.

Restore: `cp "$SCRATCHPAD/resolvePlacement.bak" src/scene/resolvePlacement.ts` and grep to confirm.

- [ ] **Step 5: Mutation 4 — ignore the offset**

In `src/scene/anchor.ts`, change both in-plane lines to drop the offset:

```ts
  position[u] = lo(target, u) - lo(own, u)
  position[v] = lo(target, v) - lo(own, v)
```

Run: `pnpm vitest run src/scene/anchor.test.ts`
**Predict:** only "offsets slide it within the face" fails.

Restore: `cp "$SCRATCHPAD/anchor.bak" src/scene/anchor.ts` and grep to confirm.

- [ ] **Step 6: Mutation 5 — a dangling anchor falls back to the origin**

In `src/scene/resolvePlacement.ts`, in the early return of `positionOf`, replace
`resolved.set(c.id, c.position); return c.position` with a zero vector:

```ts
      const origin = { x: 0, y: 0, z: 0 }
      resolved.set(c.id, origin)
      return origin
```

Run: `pnpm vitest run src/scene/resolvePlacement.test.ts`
**Predict:** "detaches an anchor naming a component that does not exist", "detaches an anchor to
itself" and "leaves a free-placed cabinet exactly where it is" all fail.

Restore: `cp "$SCRATCHPAD/resolvePlacement.bak" src/scene/resolvePlacement.ts` and grep to confirm.

- [ ] **Step 7: Confirm the tree is clean and green**

Run: `git status --short && pnpm typecheck && pnpm lint && pnpm test`
Expected: no modified files, everything green. If `git status` shows a modified file, a restore was
missed — restore it from the backup before continuing.

- [ ] **Step 8: Record the results**

Append a short table to `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md` listing each
mutation, which tests failed, and whether that matched the prediction. Note any mutation where fewer
tests failed than predicted — that gap is a missing test, not a curiosity.

```bash
git add docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md
git commit -m "test(scene): mutation-test the placement rules"
```

---

## Self-Review

**Spec coverage.** Every Stage 1 item in the spec maps to a task: `Anchor` (Task 4), `carcaseBounds`
(Task 2), `resolvePlacement` (Task 5), the pipeline (Task 6), v19 (Task 7), surface A (Task 8). The
spec's testing table is covered by Task 10's five mutations plus the idempotence, v18-load and
v19-round-trip tests in Tasks 5 and 7. `runsOf`, the plan view, corners and the gizmo are Stages 2-4
and deliberately absent.

**Two additions the spec did not name**, both recorded in Task 9's notes: `hasAnyFront` (Task 1),
needed because an overlay front only moves the bounds if the cabinet has one; and the same-`parentId`
restriction on anchors, which keeps both cabinets in one frame.

**Type consistency.** `Bounds3` is defined in Task 2 and used under that name in Tasks 4, 5 and 10.
`Anchor` is defined in Task 4 Step 1 and used unchanged in Tasks 5, 7 and 8. `rotateVector`'s
signature in Task 3 matches its call in Task 4. `carcaseBounds(p, thicknessOf)` matches its call in
Task 5. `anchoredPosition(anchor, target, own)` matches its call in Task 5. `NumberField`'s new
`disabled` prop is added in Task 8 Step 1 before it is used in Step 4.
