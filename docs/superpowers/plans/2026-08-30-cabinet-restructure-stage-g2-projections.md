# Stage G2 — Cabinet projections (Front / Top / End) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the cabinet editor's Front / Top / End subtabs into dimensioned, exportable, clickable orthographic projections of the whole cabinet.

**Architecture:** One pure projector (`src/geom/assembly.ts`) returns unscaled-millimetre view data; two consumers read it — an interactive React pane and a new `DrawingSheet` variant that the existing SVG/DXF/PDF serializers learn. Occlusion is 1-D interval subtraction (`src/geom/hiddenLine.ts`) because every generated panel is an axis-aligned box in the cabinet's frame. Top and End cull their near half so they read as sections rather than as one solid rectangle.

**Tech Stack:** TypeScript strict (no `any`, `noUnusedLocals`, `verbatimModuleSyntax`), React 19, Vitest + happy-dom + @testing-library/react, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-30-cabinet-projections-design.md`
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`

---

## Read this before Task 1

**Two corrections to the spec, found while writing this plan. The plan is authoritative where they differ.**

1. **The projector cannot emit `DimLine`.** `renderDimLine(dim, px, py)` in `src/ui/buildSvg.ts:88`
   adds `dim.offset` to the _placement_ in sheet millimetres while `dim.start` / `dim.end` are
   already scaled. A projector that emits unscaled mm therefore cannot fill `offset`. The projector
   emits its own `AssemblyDim` carrying `side` and `ring`; each consumer converts. The spec's line
   "the renderers need no new primitive" is wrong.

2. **`sectionThickness` is not exported** (`src/scene/carcaseRoles.ts:105`). Build the
   `DivisionThickness` closure inline, exactly as `src/ui/SectionElevation.tsx:43` does.

**Standing rules for every task in this plan:**

- Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. **Never** pipe them through
  `tail` or `head` — read the exit code and the output directly.
- e2e: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`.
  **Never** run `playwright install`.
- **Mutation testing:** back the file up with `cp <file> "$SCRATCHPAD"/<name>.bak` first and restore
  from that copy. **Never `git checkout`** — the file carries uncommitted work. `grep` after applying
  the mutation _and_ after restoring it.
- Develop only on the branch `claude/next-step-suggestion-latrhv`.
- Never put a model identifier in a commit message or any pushed artifact.
- jest-dom is **not** set up in Vitest. Use `getAttribute()`, not `toHaveAttribute()`. Playwright
  _does_ have jest-dom matchers.

---

## File structure

| file                                          | responsibility                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/geom/hiddenLine.ts` **(new)**            | `Span`, `EPS`, `subtractIntervals`. The occlusion rule, stated once                    |
| `src/geom/hiddenLine.test.ts` **(new)**       | its interval cases                                                                     |
| `src/geom/assembly.ts` **(new)**              | `AssemblyView`, `AssemblyPart`, `AssemblyDim`, `buildAssemblyViews`. Pure, unscaled mm |
| `src/geom/assembly.test.ts` **(new)**         | projection, cull, occlusion, dimensions, cuts                                          |
| `src/geom/drawing.ts`                         | + `kind: 'assembly'` sheet variant, `selectAssemblyScale`, `buildAssemblySheet`        |
| `src/ui/CabinetProjection.tsx` **(new)**      | the interactive pane                                                                   |
| `src/ui/CabinetProjection.test.tsx` **(new)** | its rendering and click behaviour                                                      |
| `src/ui/sheetFilename.ts` **(new)**           | lifted out of `DrawingViewer`, shared with the tab                                     |
| `src/ui/buildSvg.ts`                          | + `renderAssemblySheet` at the dispatch on line 365                                    |
| `src/ui/buildDxf.ts`                          | + assembly branch at the dispatch on line 331                                          |
| `src/ui/buildPdf.ts`                          | + assembly branch at the dispatch on line 360                                          |
| `src/ui/DrawingViewer.tsx`                    | label derived from `kind`, not from index                                              |
| `src/ui/CabinetEditor.tsx`                    | Front / Top / End render `CabinetProjection`                                           |
| `src/ui/SectionElevation.tsx`                 | real overrides instead of `new Map()`                                                  |
| `src/ui/CarcasePanel.tsx`                     | real overrides instead of `new Map()`                                                  |
| `src/App.tsx`                                 | open cabinet from the selection's ancestry; assembly sheets                            |
| `e2e/carcase.spec.ts`                         | the two new browser proofs                                                             |

---

# Group A — the occlusion rule

## Task 1: `subtractIntervals`

**Files:**

- Create: `src/geom/hiddenLine.ts`
- Test: `src/geom/hiddenLine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/geom/hiddenLine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { subtractIntervals, type Span } from './hiddenLine'

const s = (a: number, b: number): Span => ({ a, b })

describe('subtractIntervals', () => {
  it('returns the whole span when nothing is subtracted', () => {
    expect(subtractIntervals(s(0, 10), [])).toEqual([s(0, 10)])
  })

  it('ignores a hole entirely outside the span', () => {
    expect(subtractIntervals(s(0, 10), [s(20, 30)])).toEqual([s(0, 10)])
    expect(subtractIntervals(s(0, 10), [s(-30, -20)])).toEqual([s(0, 10)])
  })

  // A butt joint puts an occluder's edge exactly on the span's. Emitting a zero-length span there
  // renders as a stray dot on every joint in the cabinet.
  it('emits nothing for a hole that only touches an endpoint', () => {
    expect(subtractIntervals(s(0, 10), [s(10, 20)])).toEqual([s(0, 10)])
    expect(subtractIntervals(s(0, 10), [s(-10, 0)])).toEqual([s(0, 10)])
  })

  it('returns empty when the hole covers the span exactly', () => {
    expect(subtractIntervals(s(0, 10), [s(0, 10)])).toEqual([])
  })

  it('returns empty when the hole covers more than the span', () => {
    expect(subtractIntervals(s(0, 10), [s(-5, 15)])).toEqual([])
  })

  it('splits into two when the hole is strictly inside', () => {
    expect(subtractIntervals(s(0, 10), [s(4, 6)])).toEqual([s(0, 4), s(6, 10)])
  })

  it('trims from the start and from the end', () => {
    expect(subtractIntervals(s(0, 10), [s(-5, 3)])).toEqual([s(3, 10)])
    expect(subtractIntervals(s(0, 10), [s(7, 15)])).toEqual([s(0, 7)])
  })

  it('merges overlapping holes rather than double-cutting', () => {
    expect(subtractIntervals(s(0, 10), [s(2, 5), s(4, 8)])).toEqual([s(0, 2), s(8, 10)])
  })

  // The caller collects occluders in whatever order it walks the parts. Sorting is the function's
  // job, not the caller's — a caller that forgot would get a silently wrong drawing.
  it('does not care what order the holes arrive in', () => {
    expect(subtractIntervals(s(0, 10), [s(7, 8), s(2, 3)])).toEqual([s(0, 2), s(3, 7), s(8, 10)])
  })

  // Panel edges come out of float arithmetic. Two that should coincide can differ by ~1e-13, and
  // without a tolerance that leaves a hairline sliver of "visible" edge along every butt joint.
  it('treats a sub-epsilon remainder as nothing', () => {
    expect(subtractIntervals(s(0, 10), [s(1e-13, 10)])).toEqual([])
    expect(subtractIntervals(s(0, 10), [s(0, 10 - 1e-13)])).toEqual([])
  })

  it('is the complement of itself, which is how hidden edges are found', () => {
    const span = s(0, 10)
    const visible = subtractIntervals(span, [s(4, 6)])
    expect(subtractIntervals(span, visible)).toEqual([s(4, 6)])
  })
})
```

- [ ] **Step 2: Run it and confirm the file does not import**

Run: `pnpm vitest run src/geom/hiddenLine.test.ts`
Expected: FAIL — `Failed to resolve import "./hiddenLine"`.

- [ ] **Step 3: Write `src/geom/hiddenLine.ts`**

```ts
// The occlusion rule, stated once. Every silhouette in a cabinet projection is an axis-aligned
// rectangle, so an occluder always covers a *contiguous run* of an edge — which makes hidden-line
// removal 1-D interval subtraction rather than polygon clipping.
//
// One function answers both questions the projector asks:
//
//   visible = subtractIntervals(edge, covered)
//   hidden  = subtractIntervals(edge, visible)
//
// A second implementation for the second question is a second thing to get wrong.

export interface Span {
  a: number
  b: number
}

// A nanometre: far below any dimension a cabinet has, far above the float noise in a coordinate
// computed through a few additions around 1000. Shared with assembly.ts so the occlusion comparator
// and the axis-alignment test cannot drift apart from this one.
export const EPS = 1e-6

export function subtractIntervals(span: Span, holes: Span[]): Span[] {
  const out: Span[] = []
  let cursor = span.a

  // Sorted here rather than trusted from the caller: the projector collects occluders by walking
  // parts in depth order, which says nothing about where they land along this particular edge.
  const sorted = [...holes].sort((p, q) => p.a - q.a)

  for (const h of sorted) {
    // `Math.min` clamps a hole that runs past the span's end, and `Math.max` ignores one that
    // ends behind the cursor — so no early-exit guard is needed for either case, and adding one
    // would be a branch no test could distinguish.
    if (h.a > cursor + EPS) out.push({ a: cursor, b: Math.min(h.a, span.b) })
    cursor = Math.max(cursor, h.b)
  }

  if (span.b > cursor + EPS) out.push({ a: cursor, b: span.b })
  return out
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/hiddenLine.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Mutation check — the zero-length guard**

```bash
cp src/geom/hiddenLine.ts "$SCRATCHPAD"/hiddenLine.bak
python3 - <<'PY'
p='src/geom/hiddenLine.ts'; s=open(p).read()
old="    if (h.a > cursor + EPS) out.push({ a: cursor, b: Math.min(h.a, span.b) })"
new="    if (h.a >= cursor) out.push({ a: cursor, b: Math.min(h.a, span.b) })"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "if (h.a >= cursor)" src/geom/hiddenLine.ts
```

Run: `pnpm vitest run src/geom/hiddenLine.test.ts`
Expected: **3 failures** — _returns empty when the hole covers the span exactly_, _treats a
sub-epsilon remainder as nothing_, and _is the complement of itself_.

The endpoint-touch test **survives** this mutation, and that is correct rather than a gap: a hole
touching an endpoint is handled by `Math.min(h.a, span.b)`, not by this comparison. (An earlier
draft of this plan predicted it would fail. It does not — measured.)

Restore and confirm:

```bash
cp "$SCRATCHPAD"/hiddenLine.bak src/geom/hiddenLine.ts
grep -n "if (h.a > cursor + EPS)" src/geom/hiddenLine.ts
```

Then prove every remaining line is load-bearing — this function is what the whole stage's
correctness rests on, so it must contain no branch a test cannot distinguish. Apply each of these
in turn, backing up and restoring from the copy each time:

| mutation | expected |
|---|---|
| `s/Math.min(h.a, span.b)/h.a/` | 1 failure |
| `s/cursor = Math.max(cursor, h.b)/cursor = h.b/` | 1 failure |
| `s/if (span.b > cursor + EPS)/if (span.b > cursor)/` | 1 failure |

If any of them survives, the function has a branch no test reaches — say so rather than proceeding.

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; test count up by 11.

```bash
git add src/geom/hiddenLine.ts src/geom/hiddenLine.test.ts
git commit -m "feat(geom): interval subtraction, the hidden-line rule

Every silhouette in a cabinet projection is an axis-aligned rectangle, so an
occluder covers a contiguous run of an edge. That makes hidden-line removal
interval subtraction rather than polygon clipping, and one function answers
both halves: visible edges, then the complement for the dashed ones.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

# Group B1 — the projector's geometry

## Task 2: parts into cabinet space

**Files:**

- Create: `src/geom/assembly.ts`
- Test: `src/geom/assembly.test.ts`

The projector's first job is to put every part in the _cabinet's_ frame and decide whether it is an
axis-aligned box. That decision is read off the corners, never off `rotation` — a part rotated 180°
about z is still an axis-aligned box, and a `rotation === 0` test would wrongly exempt it from
occlusion. This is the Stage E contact-rule failure repeating: the rule must follow the geometry it
describes, not the input that usually produces it.

- [ ] **Step 1: Write the failing test**

Create `src/geom/assembly.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cabinetSpaceBox } from './assembly'
import type { BoardPart, CarcaseComponent, Component, ComponentId } from '../scene/types'
import { CARCASE_PRESETS } from '../scene/carcasePresets'

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

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

function board(over: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'board_1',
    label: 'Left Side',
    length: 560,
    width: 720,
    thickness: 18,
    grain: 'length',
    material: '',
    color: '#c8a',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: cabinet.id,
    driven: true,
    ...over,
  }
}

describe('cabinetSpaceBox', () => {
  it('puts an unrotated board at its own position', () => {
    const b = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), byId, cabinet)
    expect(b.min).toEqual({ x: 10, y: 20, z: 30 })
    expect(b.max).toEqual({ x: 570, y: 740, z: 48 })
    expect(b.axisAligned).toBe(true)
  })

  // The carcase generator only ever emits rotations of 0 or ±90, so every driven panel is an
  // axis-aligned box in cabinet space even though most of them are "rotated".
  it('calls a 90-degree rotated board axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 90, z: 90 } }), byId, cabinet)
    expect(b.axisAligned).toBe(true)
  })

  // The mutation this exists for: a `rotation === 0` test would call this NOT axis-aligned and
  // silently exempt the part from occlusion, while its box is a perfectly ordinary rectangle.
  it('calls a 180-degree rotated board axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 0, z: 180 } }), byId, cabinet)
    expect(b.axisAligned).toBe(true)
    expect(b.max.x - b.min.x).toBeCloseTo(560, 6)
    expect(b.max.y - b.min.y).toBeCloseTo(720, 6)
  })

  it('calls a 30-degree rotated board not axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 0, z: 30 } }), byId, cabinet)
    expect(b.axisAligned).toBe(false)
  })

  // The cabinet may sit anywhere in the scene. Its own projection must not move when it does.
  it('is unchanged by moving and rotating the cabinet itself', () => {
    const moved: CarcaseComponent = {
      ...cabinet,
      position: { x: 1000, y: -400, z: 90 },
      rotation: { x: 0, y: 0, z: 90 },
    }
    const movedById = new Map<ComponentId, Component>([[moved.id, moved]])
    const a = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), byId, cabinet)
    const b = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), movedById, moved)
    expect(b.min.x).toBeCloseTo(a.min.x, 6)
    expect(b.min.y).toBeCloseTo(a.min.y, 6)
    expect(b.min.z).toBeCloseTo(a.min.z, 6)
    expect(b.max.x).toBeCloseTo(a.max.x, 6)
  })

  it('gives a cylinder the box its diameter and length imply', () => {
    const dowel = {
      kind: 'cylinder' as const,
      id: 'board_2',
      label: 'Dowel 1',
      diameter: 8,
      length: 40,
      material: '',
      color: '#ca8',
      position: { x: 100, y: 100, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: cabinet.id,
      driven: false,
    }
    const b = cabinetSpaceBox(dowel, byId, cabinet)
    expect(b.min).toEqual({ x: 96, y: 96, z: 0 })
    expect(b.max).toEqual({ x: 104, y: 104, z: 40 })
    // A cylinder is never an occluder: its box is not its shape.
    expect(b.axisAligned).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm the import fails**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL — `Failed to resolve import "./assembly"`.

- [ ] **Step 3: Write the first part of `src/geom/assembly.ts`**

```ts
import { applyInverseToPoint, applyMatrixToPoint, resolveWorldMatrix } from './transform'
import { EPS } from './hiddenLine'
import type { CarcaseComponent, Component, ComponentId, Part, Vec3 } from '../scene/types'

// Whole-cabinet orthographic projection. Pure, THREE-free, and in **unscaled millimetres** — two
// consumers read it (the interactive pane and the assembly sheet) and they scale differently, so a
// projector that scaled would have to be told a page size the pane does not have.

export interface CabinetBox {
  min: Vec3
  max: Vec3
  // True when the eight corners form an axis-aligned box in cabinet space. Read off the corners,
  // never off `rotation`: a board rotated 180 degrees is still an axis-aligned box, and only an
  // axis-aligned box may occlude — the rule has to follow the geometry it describes.
  axisAligned: boolean
  // The eight corners in cabinet space, kept for the non-axis-aligned outline.
  corners: Vec3[]
}

// A part's own extent in its local frame. A board occupies [0,L]x[0,W]x[0,T]; a cylinder's local
// origin lies on its axis at the base circle, so its box is centred in x and y.
function localExtent(part: Part): { min: Vec3; max: Vec3 } {
  if (part.kind === 'board') {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: part.length, y: part.width, z: part.thickness },
    }
  }
  const r = part.diameter / 2
  return { min: { x: -r, y: -r, z: 0 }, max: { x: r, y: r, z: part.length } }
}

export function cabinetSpaceBox(
  part: Part,
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
): CabinetBox {
  const mPart = resolveWorldMatrix(part, byId)
  const mCabinet = resolveWorldMatrix(cabinet, byId)
  const { min: lo, max: hi } = localExtent(part)

  const corners: Vec3[] = []
  for (const x of [lo.x, hi.x]) {
    for (const y of [lo.y, hi.y]) {
      for (const z of [lo.z, hi.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(mPart, x, y, z)
        const [cx, cy, cz] = applyInverseToPoint(mCabinet, wx, wy, wz)
        corners.push({ x: cx, y: cy, z: cz })
      }
    }
  }

  const min = {
    x: Math.min(...corners.map((c) => c.x)),
    y: Math.min(...corners.map((c) => c.y)),
    z: Math.min(...corners.map((c) => c.z)),
  }
  const max = {
    x: Math.max(...corners.map((c) => c.x)),
    y: Math.max(...corners.map((c) => c.y)),
    z: Math.max(...corners.map((c) => c.z)),
  }

  // Axis-aligned exactly when every corner sits on the bounding box's own surface in all three
  // axes — which is what "the box IS the shape" means. A cylinder fails it by construction, since
  // its box is a prism around a round shape and must never occlude.
  const onFace = (v: number, a: number, b: number) => Math.abs(v - a) < EPS || Math.abs(v - b) < EPS
  const axisAligned =
    part.kind === 'board' &&
    corners.every(
      (c) => onFace(c.x, min.x, max.x) && onFace(c.y, min.y, max.y) && onFace(c.z, min.z, max.z),
    )

  return { min, max, axisAligned, corners }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation check — axis-alignment read from `rotation`**

```bash
cp src/geom/assembly.ts "$SCRATCHPAD"/assembly-t2.bak
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="""  const axisAligned =
    part.kind === 'board' &&
    corners.every(
      (c) =>
        onFace(c.x, min.x, max.x) && onFace(c.y, min.y, max.y) && onFace(c.z, min.z, max.z),
    )"""
new="""  const axisAligned =
    part.kind === 'board' &&
    part.rotation.x === 0 && part.rotation.y === 0 && part.rotation.z === 0"""
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "part.rotation.x === 0" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _calls a 90-degree rotated board axis-aligned_ and on _calls a 180-degree rotated
board axis-aligned_. The 180 case is the one that matters: it looks rotated and is not.

Restore and confirm:

```bash
cp "$SCRATCHPAD"/assembly-t2.bak src/geom/assembly.ts
grep -n "corners.every" src/geom/assembly.ts
```

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/geom/assembly.ts src/geom/assembly.test.ts
git commit -m "feat(geom): parts into cabinet space, axis-alignment from the corners

resolveWorldMatrix out to world, applyInverseToPoint back into the cabinet's
frame, so a cabinet placed or rotated anywhere in the scene projects the same.

Whether a part is an axis-aligned box is read off its eight corners, never off
its rotation: a board turned 180 degrees is still a rectangle, and only an
axis-aligned box may occlude.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 3: the three planes, and the near-half cull

**Files:**

- Modify: `src/geom/assembly.ts`
- Test: `src/geom/assembly.test.ts`

Pure hidden-line removal of a closed box gives one solid rectangle. Measured on a Base 600 End view,
**six of seven parts are completely hidden by `left-side`**. So Top and End are section views: a cut
plane at the parameter midpoint, and parts lying entirely on the near side are omitted. Parts
_crossing_ the plane are drawn whole, so no partial-cutting geometry is needed. **Front is not
culled** — a front elevation must show its doors.

`End` looks from **+x**, matching `buildBoardSheet`, which builds its End view from `['+X','-X']` and
places it to the right. Looking from +x with +z up puts screen-right at −y, so the cabinet's front
appears on the right of that view.

- [ ] **Step 1: Write the failing tests**

These test `projectBox` and `culled` **directly**, with explicit boxes rather than through a whole
cabinet. That keeps Task 3 self-contained and green on its own commit: `buildAssemblyViews` does not
exist until Task 4, so a view-level test here could not pass. The view-level assertions (labels,
bounds, cull by part label) live in Task 4, where that function arrives.

Append to `src/geom/assembly.test.ts`, adding `VIEWS`, `projectBox`, `culled` and `type CabinetBox`
to the import from `./assembly`:

```ts
// A Base 600's real dimensions, so the numbers below are the ones a cabinet actually produces.
const params = CARCASE_PRESETS[0].params // 600 wide, 720 high, 560 deep

const box = (
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
): CabinetBox => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
  axisAligned: true,
  corners: [],
})

// The real roles, so a mistake shows up as a cabinet part in the wrong place rather than as an
// abstract number.
const LEFT_SIDE = box(0, 18, 0, 560, 0, 720)
const RIGHT_SIDE = box(582, 600, 0, 560, 0, 720)
const BACK = box(18, 582, 548, 560, 118, 702)
const TOP_PANEL = box(18, 582, 0, 560, 702, 720)
const BOTTOM = box(18, 582, 0, 560, 100, 118)

const view = (label: 'Front' | 'Top' | 'End') => VIEWS.find((v) => v.label === label)!

describe('the three planes', () => {
  it('names the views Front, Top and End in that order', () => {
    expect(VIEWS.map((v) => v.label)).toEqual(['Front', 'Top', 'End'])
  })

  // W != D != H, so a view that took the wrong axis for u or v is visible in the extent alone.
  it('maps each view to its own two axes', () => {
    expect(projectBox(LEFT_SIDE, view('Front'), params).rect).toEqual({ x: 0, y: 0, w: 18, h: 720 })
    expect(projectBox(LEFT_SIDE, view('Top'), params).rect).toEqual({ x: 0, y: 0, w: 18, h: 560 })
  })

  // End looks from +x, so screen-right is -y and the cabinet's FRONT lands on the right. The back
  // panel is the clearest witness: it sits at the far left of the view, not the far right.
  it('puts the cabinet’s front on the right of the End view', () => {
    const back = projectBox(BACK, view('End'), params).rect
    expect(back.x).toBeCloseTo(0, 6)
    expect(back.w).toBeCloseTo(12, 6)
  })

  // Depth is emitted pre-oriented so smaller always means nearer. Top looks DOWN, so a high part
  // must come out with a smaller depth than a low one — the inversion is resolved here, once, and
  // no consumer carries a per-view sign.
  it('orients depth so that smaller is nearer in every view', () => {
    const frontNear = projectBox(box(0, 600, -18, 0, 0, 720), view('Front'), params)
    const frontFar = projectBox(LEFT_SIDE, view('Front'), params)
    expect(frontNear.depthMin).toBeLessThan(frontFar.depthMin)

    expect(projectBox(TOP_PANEL, view('Top'), params).depthMin).toBeLessThan(
      projectBox(BOTTOM, view('Top'), params).depthMin,
    )

    expect(projectBox(RIGHT_SIDE, view('End'), params).depthMin).toBeLessThan(
      projectBox(LEFT_SIDE, view('End'), params).depthMin,
    )
  })
})

describe('the near-half cull', () => {
  // Pure hidden-line removal of a closed box is one solid rectangle: measured on a Base 600's End
  // view, six of seven parts are completely hidden by the near side. Top and End are therefore
  // sections, cut at the parameter midpoint.
  it('culls the near side from End and keeps the far one', () => {
    expect(culled(RIGHT_SIDE, view('End'), params)).toBe(true)
    expect(culled(LEFT_SIDE, view('End'), params)).toBe(false)
  })

  it('culls the top panel from Top and keeps the bottom', () => {
    expect(culled(TOP_PANEL, view('Top'), params)).toBe(true)
    expect(culled(BOTTOM, view('Top'), params)).toBe(false)
  })

  // A part crossing the plane is drawn whole — that is what makes the section need no
  // partial-cutting geometry.
  it('keeps a part that straddles the cut plane', () => {
    expect(culled(LEFT_SIDE, view('Top'), params)).toBe(false) // z 0..720 spans the H/2 plane
    expect(culled(BACK, view('End'), params)).toBe(false) // x 18..582 spans the W/2 plane
  })

  // Front is a view, not a section. An elevation that dropped its door would be useless, and the
  // door is the nearest thing in it.
  it('never culls anything from Front', () => {
    for (const b of [LEFT_SIDE, RIGHT_SIDE, BACK, TOP_PANEL, BOTTOM]) {
      expect(culled(b, view('Front'), params)).toBe(false)
    }
    expect(culled(box(0, 600, -18, 0, 100, 718), view('Front'), params)).toBe(false)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL — `VIEWS`, `projectBox` and `culled` are not exported.

- [ ] **Step 3: Implement the planes and the cull**

Append to `src/geom/assembly.ts`:

```ts
import type { Rect2D } from './drawing'

export type Axis = 'x' | 'y' | 'z'

export interface ViewSpec {
  label: 'Front' | 'Top' | 'End'
  u: Axis
  v: Axis
  depth: Axis
  // -1 when larger means nearer. Applied once here so no consumer carries a per-view sign: every
  // emitted depth reads "smaller is nearer".
  depthSign: 1 | -1
  uSign: 1 | -1
  // Front is a view; Top and End are sections. A closed box under hidden-line removal is one solid
  // rectangle, so the two that look at a closed face cull their near half.
  cull: boolean
}

// End looks from +x, matching buildBoardSheet's End view (built from ['+X','-X'] and placed to the
// right). Looking from +x with +z up puts screen-right at -y, so the cabinet's front lands on the
// right of that view.
export const VIEWS: [ViewSpec, ViewSpec, ViewSpec] = [
  { label: 'Front', u: 'x', v: 'z', depth: 'y', depthSign: 1, uSign: 1, cull: false },
  { label: 'Top', u: 'x', v: 'y', depth: 'z', depthSign: -1, uSign: 1, cull: true },
  { label: 'End', u: 'y', v: 'z', depth: 'x', depthSign: -1, uSign: -1, cull: true },
]

// The cabinet's own extent along an axis, from its parameters rather than from the parts. A stray
// detached part must not move the cut plane and cull a shelf with it.
function cabinetExtent(p: CarcaseParams, axis: Axis): { lo: number; hi: number } {
  if (axis === 'x') return { lo: 0, hi: p.width }
  if (axis === 'z') return { lo: 0, hi: p.height }
  return { lo: 0, hi: p.depth }
}

export interface ProjectedBox {
  rect: Rect2D
  depthMin: number
  depthMax: number
}

// A cabinet-space box seen through one view spec, with depth already oriented so smaller is nearer.
export function projectBox(box: CabinetBox, view: ViewSpec, p: CarcaseParams): ProjectedBox {
  const uLo = view.uSign === 1 ? box.min[view.u] : -box.max[view.u]
  const uHi = view.uSign === 1 ? box.max[view.u] : -box.min[view.u]
  const uOrigin = view.uSign === 1 ? 0 : -cabinetExtent(p, view.u).hi
  const d0 = view.depthSign * box.min[view.depth]
  const d1 = view.depthSign * box.max[view.depth]
  return {
    rect: {
      x: uLo - uOrigin,
      y: box.min[view.v],
      w: uHi - uLo,
      h: box.max[view.v] - box.min[view.v],
    },
    depthMin: Math.min(d0, d1),
    depthMax: Math.max(d0, d1),
  }
}

// Parts lying entirely on the near side of the cut plane are omitted; a part crossing it is drawn
// whole. That keeps the section honest to read without any partial-cutting geometry, and everything
// crossing the plane is what you want to see in elevation anyway.
export function culled(box: CabinetBox, view: ViewSpec, p: CarcaseParams): boolean {
  if (!view.cull) return false
  const { lo, hi } = cabinetExtent(p, view.depth)
  const mid = (lo + hi) / 2
  return view.depthSign === 1 ? box.max[view.depth] <= mid + EPS : box.min[view.depth] >= mid - EPS
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: PASS — 7 from Task 2 plus 8 here, 15 in the file.

- [ ] **Step 5: Mutation check — cull direction, and cull at all**

```bash
cp src/geom/assembly.ts "$SCRATCHPAD"/assembly-t3.bak

# (a) never cull
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="  if (!view.cull) return false"
new="  if (true) return false"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "if (true) return false" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _culls the near side from End and keeps the far one_ and on _culls the top panel
from Top and keeps the bottom_.

```bash
cp "$SCRATCHPAD"/assembly-t3.bak src/geom/assembly.ts
grep -n "if (!view.cull) return false" src/geom/assembly.ts

# (b) cull Front as well
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="  { label: 'Front', u: 'x', v: 'z', depth: 'y', depthSign: 1, uSign: 1, cull: false },"
new="  { label: 'Front', u: 'x', v: 'z', depth: 'y', depthSign: 1, uSign: 1, cull: true },"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "label: 'Front'" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _never culls anything from Front_ — the door would go missing from the elevation.

```bash
cp "$SCRATCHPAD"/assembly-t3.bak src/geom/assembly.ts
grep -n "cull: false" src/geom/assembly.ts

# (c) End looks from -x instead of +x
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="  { label: 'End', u: 'y', v: 'z', depth: 'x', depthSign: -1, uSign: -1, cull: true },"
new="  { label: 'End', u: 'y', v: 'z', depth: 'x', depthSign: 1, uSign: 1, cull: true },"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "label: 'End'" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: **3 failures** — _puts the cabinet's front on the right of the End view_, _orients depth so
that smaller is nearer in every view_, and _culls the near side from End and keeps the far one_.

End's `depthSign`/`uSign` pair is load-bearing for three separate claims, not two: the view flips,
the near/far ordering inverts, and the cull then takes the far side. (Measured twice, independently.
An earlier draft of this plan predicted two.)

```bash
cp "$SCRATCHPAD"/assembly-t3.bak src/geom/assembly.ts
grep -n "depthSign: -1, uSign: -1" src/geom/assembly.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/geom/assembly.ts src/geom/assembly.test.ts
git commit -m "feat(geom): three projection planes, and the near-half cull

Pure hidden-line removal of a closed box is one solid rectangle: on a Base 600
End view, six of seven parts are completely hidden. Top and End therefore cull
their near half at the parameter midpoint, so they read as sections; a part
crossing the plane is drawn whole, so no partial-cutting geometry is needed.

Front is deliberately not culled — an elevation that dropped its door would be
useless. End looks from +x, matching the End view on every part sheet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 4: occlusion, and `buildAssemblyViews`

**Files:**

- Modify: `src/geom/assembly.ts`
- Test: `src/geom/assembly.test.ts`

**Q occludes P iff `Q.depthMax <= P.depthMin + EPS` and their view rects overlap in area.** Verified
against real cabinets: an overlay door `y ∈ [−18,0]` hides the side `y ∈ [0,560]` (`0 <= 0`); an
inset door `y ∈ [0,18]` does not (`18 > 0`) and its rect does not overlap the side anyway; an inset
door does hide the shelf behind it at `y ∈ [20,537]` (`18 <= 20`), where the 20 comes from Stage E's
`max(SHELF_FRONT_SETBACK, insetFrontThickness + SHELF_CLEARANCE)`.

- [ ] **Step 1: Add the whole-cabinet fixture**

Task 3 tested `projectBox` and `culled` directly, with explicit boxes. `buildAssemblyViews` needs a
real cabinet, so add the fixture here. Append to the imports:

```ts
import { buildAssemblyViews } from './assembly'
import { carcaseRoles } from '../scene/carcaseRoles'
import { roleThicknessFor } from '../scene/resolveThickness'
import { jointKindFor } from '../scene/resolveJointKind'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type { CarcaseParams, Part } from '../scene/types'
```

Then the fixture:

```ts
// A cabinet asymmetric in every axis. G1 taught this twice: a symmetric fixture passes every
// mutation. W != D != H separates the three planes from each other.
function lopsided(over: Partial<CarcaseParams> = {}): CarcaseParams {
  return { ...CARCASE_PRESETS[0].params, width: 600, height: 720, depth: 560, ...over }
}

// The parts a cabinet's parameters imply, built the way regenerateComponents builds them, so the
// projector is tested against what the app actually holds.
function partsOf(params: CarcaseParams): Part[] {
  const thicknessOf = roleThicknessFor(params, PRESET_MATERIALS, new Map())
  return carcaseRoles(params, thicknessOf, jointKindFor([], cabinet.id)).map((r, i) => ({
    kind: 'board',
    id: `board_${i}`,
    label: r.label,
    length: r.panel.length,
    width: r.panel.width,
    thickness: r.panel.thickness,
    grain: r.grain,
    material: '',
    color: '#888',
    position: r.panel.position,
    rotation: r.panel.rotation,
    rotationOrder: r.panel.rotationOrder,
    cuts: [],
    visible: true,
    parentId: cabinet.id,
    driven: true,
    role: r.role,
  }))
}

const withParams = (params: CarcaseParams): CarcaseComponent => ({ ...cabinet, params })

function viewsOf(params: CarcaseParams, materials = PRESET_MATERIALS) {
  const c = withParams(params)
  const ids = new Map<ComponentId, Component>([[c.id, c]])
  const [front, top, end] = buildAssemblyViews(partsOf(params), ids, c, materials)
  return { front, top, end }
}

const labels = (v: { parts: { label: string }[] }) => v.parts.map((p) => p.label)
```

- [ ] **Step 2: Write the failing tests**

Append to `src/geom/assembly.test.ts`:

```ts
describe('the assembled views', () => {
  it('gives each view the extent its own two axes imply', () => {
    const { front, top, end } = viewsOf(lopsided())
    expect([front.bounds.w, front.bounds.h]).toEqual([600, 720]) // W x H
    expect([top.bounds.w, top.bounds.h]).toEqual([600, 560]) // W x D
    expect([end.bounds.w, end.bounds.h]).toEqual([560, 720]) // D x H
  })

  // The whole reason the cull exists. Without it this count is 1.
  it('leaves more than one part visible in the End view', () => {
    expect(labels(viewsOf(lopsided()).end).length).toBeGreaterThan(1)
  })

  it('drops the near side from End and the top panel from Top, and nothing from Front', () => {
    const { front, top, end } = viewsOf(lopsided())
    expect(labels(end)).toContain('Left Side')
    expect(labels(end)).not.toContain('Right Side')
    expect(labels(top)).toContain('Bottom')
    expect(labels(top)).not.toContain('Top')
    expect(labels(front).sort()).toEqual(partsOf(lopsided()).map((p) => p.label).sort())
  })

  // Task 2's quality review asked for this at the seam that consumes `corners`, which is the
  // outline path below.
  it('keeps eight corners per part', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    for (const part of partsOf(p)) {
      expect(cabinetSpaceBox(part, ids, c).corners).toHaveLength(8)
    }
  })
})

describe('occlusion', () => {
  const partNamed = (v: { parts: { label: string }[] }, label: string) =>
    v.parts.find((p) => p.label === label)!

  // An overlay door lands ON the carcase face, so it hides what is behind it. That is what overlay
  // means, and it is the case the whole hidden-line machinery exists for.
  it('hides the carcase behind an overlay door in the Front view', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'overlay' }))
    // The shelf, not the bottom panel. A Base 600's door spans z[101.5, 718.5] while its bottom
    // spans z[100, 118], so 1.5 mm of the bottom genuinely shows below the door and asserting it
    // fully hidden would be asserting a cabinet that does not exist. The shelf at z[310, 328],
    // x[20, 580] sits wholly inside the door's rectangle and wholly behind it.
    const shelf = front.parts.find((q) => q.label.startsWith('Adj Shelf'))!
    expect(shelf.hidden.length).toBeGreaterThan(0)
    expect(shelf.solid).toEqual([])
  })

  // …and the sliver that does show is itself worth pinning: an occluder must not swallow an edge
  // it only partly covers.
  it('leaves the strip of the bottom panel that shows below the door', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'overlay' }))
    const bottom = partNamed(front, 'Bottom')
    expect(bottom.hidden.length).toBeGreaterThan(0)
    expect(bottom.solid.length).toBeGreaterThan(0)
  })

  // An inset door sits BETWEEN the sides, so it hides neither of them — and their rectangles do not
  // even overlap. A comparator that read "nearer" as "overlapping in depth" would hide them.
  it('does not hide the sides behind an inset door', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'inset' }))
    expect(partNamed(front, 'Left Side').solid.length).toBeGreaterThan(0)
  })

  // Nothing is in front of the frontmost part, so every edge of it is solid.
  it('leaves the nearest part entirely solid', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'overlay' }))
    const door = front.parts.find((p) => p.label.startsWith('Door'))!
    expect(door.hidden).toEqual([])
    expect(door.solid.length).toBe(4)
  })

  // Top looks DOWN, so nearer is larger z. Dropping that inversion makes the bottom panel occlude
  // the top one instead of the other way round.
  it('orders Top by height, nearest first', () => {
    const { top } = viewsOf(lopsided())
    const zs = top.parts.map((p) => p.depthMin)
    expect([...zs].sort((a, b) => a - b)).toEqual(zs)
  })

  // Handed to this task by Task 3's quality review: `Math.min(d0,d1)`/`Math.max(d0,d1)` were not
  // pinned to the near and far edge of *this* box — plain `d0`/`d1` passed, because the only depth
  // test compared two well-separated boxes, where either endpoint preserves the ordering.
  it('reports a single box’s own near and far edges, not an arbitrary endpoint', () => {
    const { top } = viewsOf(lopsided())
    const bottom = top.parts.find((q) => q.label === 'Bottom')!
    // Top looks down, so oriented depth is -z and the bottom panel z[100,118] comes out [-118,-100].
    expect(bottom.depthMin).toBeCloseTo(-118, 6)
    expect(bottom.depthMax).toBeCloseTo(-100, 6)
  })

  // The one rule this task is about, and no fixture above falsifies its DIRECTION: every pair in a
  // real cabinet either fails the rect-overlap test or is cleanly separated in depth, so
  // `Q.depthMax <= P.depthMin` and its reverse agree on all of them. Two slabs driven through each
  // other tell them apart, and the answer is the stated one — genuine interpenetration is reachable
  // only by moving a detached part by hand, and neither part then occludes the other.
  it('lets two interpenetrating parts occlude each other in neither direction', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const near = board({ id: 'board_a', label: 'Slab A', length: 100, width: 100, thickness: 10, position: { x: 0, y: 0, z: 0 } })
    const far = board({ id: 'board_b', label: 'Slab B', length: 100, width: 100, thickness: 10, position: { x: 0, y: 50, z: 0 } })
    // Identical Front rectangles, depths [0,100] and [50,150] — overlapping, not separated.
    const [front] = buildAssemblyViews([near, far], ids, c, PRESET_MATERIALS)
    for (const part of front.parts) {
      expect(part.hidden).toEqual([])
      expect(part.solid).toHaveLength(4)
    }
  })

  // hullOf and the whole non-axis-aligned path are unreached by every other fixture here, because
  // carcaseRoles only ever emits axis-aligned boards. A skewed part is reachable — a user can
  // rotate a detached one — and the rule has two halves: it is drawn as its own outline, and it
  // takes no part in occlusion in either direction. A 100x100x10 board turned 30 degrees about z at
  // (200,200,200) spans x[150, 286.6], y[200, 336.6], z[200,210], so `Behind` sits inside its Front
  // rect and past its depth — without which the second assertion would prove nothing.
  it('draws a skewed part as its own outline and lets it occlude nothing', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const skew = board({
      id: 'board_skew', label: 'Skew',
      length: 100, width: 100, thickness: 10,
      rotation: { x: 0, y: 0, z: 30 },
      position: { x: 200, y: 200, z: 200 },
    })
    const behind = board({
      id: 'board_behind', label: 'Behind',
      length: 50, width: 50, thickness: 5,
      position: { x: 200, y: 400, z: 202 },
    })
    const [front] = buildAssemblyViews([skew, behind], ids, c, PRESET_MATERIALS)

    const s = front.parts.find((q) => q.label === 'Skew')!
    expect(s.outline).toBeDefined()
    expect(s.outline!.length).toBeGreaterThan(2)
    expect(s.hidden).toEqual([])

    expect(front.parts.find((q) => q.label === 'Behind')!.hidden).toEqual([])
  })

  it('reports every part solid plus hidden equal to its whole perimeter', () => {
    const { front } = viewsOf(lopsided())
    for (const p of front.parts) {
      const total = [...p.solid, ...p.hidden].reduce(
        (n, s) => n + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1),
        0,
      )
      const perimeter = p.rects.reduce((n, r) => n + 2 * (r.w + r.h), 0)
      expect(total).toBeCloseTo(perimeter, 4)
    }
  })
})
```

- [ ] **Step 3: Run and confirm failure**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL — `buildAssemblyViews` is not exported.

- [ ] **Step 4: Implement**

Append to `src/geom/assembly.ts`:

```ts
import { subtractIntervals, type Span } from './hiddenLine'
import type { DrawCircle, DrawRect, Point2D } from './drawing'
import type { PartId } from '../scene/types'

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface AssemblyPart {
  partId: PartId
  label: string
  color: string
  // The silhouette, after through-cuts have been taken out of it. Also the occluder set and the
  // hit shape: one list answers all three, so a click can never land somewhere the drawing says is
  // empty.
  rects: Rect2D[]
  // Replaces `rects` for a part that is not an axis-aligned box. Such a part is drawn solid and
  // takes no part in occlusion in either direction.
  outline?: Point2D[]
  solid: Segment[]
  hidden: Segment[]
  circles: DrawCircle[]
  cutRects: DrawRect[]
  depthMin: number
  depthMax: number
}

export interface AssemblyView {
  label: 'Front' | 'Top' | 'End'
  bounds: Rect2D
  // Nearest first. Consumers read this order for hit-testing and for painting.
  parts: AssemblyPart[]
  dims: AssemblyDim[]
}

const overlaps = (a: Rect2D, b: Rect2D): boolean =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS

// The four edges of a rectangle, each as a span along its own axis at a fixed other coordinate.
function edgesOf(r: Rect2D): { horizontal: boolean; at: number; span: Span }[] {
  return [
    { horizontal: true, at: r.y, span: { a: r.x, b: r.x + r.w } },
    { horizontal: true, at: r.y + r.h, span: { a: r.x, b: r.x + r.w } },
    { horizontal: false, at: r.x, span: { a: r.y, b: r.y + r.h } },
    { horizontal: false, at: r.x + r.w, span: { a: r.y, b: r.y + r.h } },
  ]
}

// Splits one edge against the occluders in front of it. `hidden` is the complement of `visible`
// within the same span, from the same function — a second implementation is a second thing to get
// wrong.
function splitEdge(
  edge: { horizontal: boolean; at: number; span: Span },
  occluders: Rect2D[],
): { solid: Segment[]; hidden: Segment[] } {
  const holes: Span[] = []
  for (const o of occluders) {
    const across = edge.horizontal ? { lo: o.y, hi: o.y + o.h } : { lo: o.x, hi: o.x + o.w }
    if (edge.at < across.lo - EPS || edge.at > across.hi + EPS) continue
    holes.push(edge.horizontal ? { a: o.x, b: o.x + o.w } : { a: o.y, b: o.y + o.h })
  }
  const visible = subtractIntervals(edge.span, holes)
  const covered = subtractIntervals(edge.span, visible)
  const seg = (s: Span): Segment =>
    edge.horizontal
      ? { x1: s.a, y1: edge.at, x2: s.b, y2: edge.at }
      : { x1: edge.at, y1: s.a, x2: edge.at, y2: s.b }
  return { solid: visible.map(seg), hidden: covered.map(seg) }
}
```

Then the entry point, at the end of the file:

```ts
export function buildAssemblyViews(
  parts: Part[],
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): [AssemblyView, AssemblyView, AssemblyView] {
  const p = cabinet.params
  const boxes = parts
    .filter((part) => part.visible)
    .map((part) => ({ part, box: cabinetSpaceBox(part, byId, cabinet) }))

  const views = VIEWS.map((view): AssemblyView => {
    const kept = boxes.filter(({ box }) => !culled(box, view, p))
    const projected = kept
      .map(({ part, box }) => ({ part, box, proj: projectBox(box, view, p) }))
      .sort((a, b) => a.proj.depthMin - b.proj.depthMin)

    const assembled = projected.map(({ part, box, proj }, i): AssemblyPart => {
      // Only an axis-aligned box occludes or is occluded. A part that is neither draws solid.
      const occluders = box.axisAligned
        ? projected
            .slice(0, i)
            .filter((q) => q.box.axisAligned && q.proj.depthMax <= proj.depthMin + EPS)
            .filter((q) => overlaps(q.proj.rect, proj.rect))
            .map((q) => q.proj.rect)
        : []

      const rects = [proj.rect]
      const solid: Segment[] = []
      const hidden: Segment[] = []
      for (const r of rects) {
        for (const e of edgesOf(r)) {
          const split = splitEdge(e, occluders)
          solid.push(...split.solid)
          hidden.push(...split.hidden)
        }
      }

      return {
        partId: part.id,
        label: part.label,
        color: part.color,
        // For a part that is not an axis-aligned box, `rects` is its bounding rectangle and serves
        // only as the hit shape; `outline` is what gets drawn. Its `hidden` comes out empty on its
        // own, because it has no occluders — no branch needed to force it.
        rects,
        outline: box.axisAligned ? undefined : hullOf(box, view, p),
        solid,
        hidden,
        circles: [],
        cutRects: [],
        depthMin: proj.depthMin,
        depthMax: proj.depthMax,
      }
    })

    const eu = cabinetExtent(p, view.u)
    const ev = cabinetExtent(p, view.v)
    return {
      label: view.label,
      bounds: { x: 0, y: 0, w: eu.hi - eu.lo, h: ev.hi - ev.lo },
      parts: assembled,
      dims: buildDims(),
    }
  })

  return [views[0], views[1], views[2]]
}

// The convex hull of a non-axis-aligned part's projected corners, as a closed polygon. Monotone
// chain: eight points at most, so the simplest correct algorithm is the right one.
function hullOf(box: CabinetBox, view: ViewSpec, p: CarcaseParams): Point2D[] {
  const uOrigin = view.uSign === 1 ? 0 : -cabinetExtent(p, view.u).hi
  const pts = box.corners
    .map((c) => ({ x: view.uSign * c[view.u] - uOrigin, y: c[view.v] }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (source: Point2D[]): Point2D[] => {
    const out: Point2D[] = []
    for (const q of source) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop()
      out.push(q)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half([...pts].reverse())]
}
```

Task 4 also declares the dimension type and a stub, because `AssemblyView.dims` needs a type to
exist now. **Task 5 fills in the body — do not write the chains here:**

```ts
// A dimension in unscaled millimetres, placed by which side of the view it sits on and which ring
// out from it. Never a page offset: `renderDimLine` reads `offset` in sheet millimetres while it
// reads start/end as already scaled, so only a consumer that knows the scale can fill that in.
export interface AssemblyDim {
  axis: 'h' | 'v'
  side: 'above' | 'below' | 'left' | 'right'
  ring: 1 | 2
  start: number
  end: number
  label: string
}

// Task 5 gives this its body. A view with no dimensions is a legitimate intermediate state — the
// projector's geometry is what this task is for.
function buildDims(): AssemblyDim[] {
  return []
}
```

and the view returns `dims: buildDims()`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: PASS — Task 2's and Task 3's tests included.

- [ ] **Step 6: Mutation check — the comparator, and Top's inversion**

```bash
cp src/geom/assembly.ts "$SCRATCHPAD"/assembly-t4.bak

# (a) flip the occlusion comparator
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="            .filter((q) => q.box.axisAligned && q.proj.depthMax <= proj.depthMin + EPS)"
new="            .filter((q) => q.box.axisAligned && q.proj.depthMin <= proj.depthMax + EPS)"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "q.proj.depthMin <= proj.depthMax" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _lets two interpenetrating parts occlude each other in neither direction_ — and on
that test **only**.

An earlier draft of this plan predicted _does not hide the sides behind an inset door_. That is
wrong, measured twice: an inset door's rect never overlaps a side's rect, so `overlaps()` rejects
the pair before the depth comparator is consulted at all, and the test passes whichever way the
inequality points. The same is true of every other pair in a real cabinet — each is either
rect-disjoint or cleanly separated in depth, so both directions agree on all of them.

**So the comparator's direction is pinned by exactly one test, and it is the interpenetration test
below.** Without it, a flipped inequality ships green. If you are ever tempted to drop that test as
artificial, this is why it is not.

```bash
cp "$SCRATCHPAD"/assembly-t4.bak src/geom/assembly.ts
grep -n "q.proj.depthMax <= proj.depthMin" src/geom/assembly.ts

# (b) drop Top's depth inversion
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="  { label: 'Top', u: 'x', v: 'y', depth: 'z', depthSign: -1, uSign: 1, cull: true },"
new="  { label: 'Top', u: 'x', v: 'y', depth: 'z', depthSign: 1, uSign: 1, cull: true },"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "label: 'Top'" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _culls the top panel from the Top view and keeps the bottom_ — the cull now takes
the bottom.

```bash
cp "$SCRATCHPAD"/assembly-t4.bak src/geom/assembly.ts
grep -n "depthSign: -1, uSign: 1" src/geom/assembly.ts
```

**(c) let skewed parts occlude** — drop the `q.box.axisAligned &&` conjunct from the occluders
filter *and* the `box.axisAligned ?` guard beside it.

Expected: FAIL on _draws a skewed part as its own outline and lets it occlude nothing_, and
specifically on its **`Behind`** assertion. The two halves of that rule fail separately: replacing
`hullOf` with a throw breaks the *drawn as an outline* half, this breaks the *occludes nothing* half.
If only the outline assertion fails here, the second half is still unpinned — say so.

- [ ] **Step 7: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/geom/assembly.ts src/geom/assembly.test.ts
git commit -m "feat(geom): hidden-line occlusion between cabinet parts

Q occludes P when Q is entirely nearer and their view rectangles overlap in
area. Verified against real cabinets: an overlay door hides the side it lands
on, an inset door hides neither side but does hide the shelf behind it — the
setback Stage E gives that shelf is what guarantees the non-interpenetration
the comparator needs.

Only an axis-aligned box occludes or is occluded; anything else draws solid as
its own convex hull.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 5: dimension chains, and the override fix in the projector

**Files:**

- Modify: `src/geom/assembly.ts`
- Test: `src/geom/assembly.test.ts`

Collision is prevented **by construction**: each dimension family gets its own side of the view and
its own ring, so no two can share both. The projector emits `side` + `ring`, never a page offset —
`renderDimLine` treats `offset` as sheet millimetres while `start`/`end` are scaled, so an unscaled
projector cannot fill it.

- [ ] **Step 1: Write the failing tests**

Append to `src/geom/assembly.test.ts`:

```ts
import { legacyToSection } from '../scene/migrateSections'
import { splitSection } from '../scene/editSection'

describe('dimensions', () => {
  const dim = (v: { dims: { side: string; ring: number; label: string }[] }, side: string) =>
    v.dims.filter((d) => d.side === side)

  it('dimensions the whole cabinet on every view', () => {
    const { front, top, end } = viewsOf(lopsided())
    expect(dim(front, 'below')[0].label).toBe('600')
    expect(dim(front, 'right')[0].label).toBe('720')
    expect(dim(top, 'below')[0].label).toBe('600')
    expect(dim(top, 'right')[0].label).toBe('560')
    expect(dim(end, 'below')[0].label).toBe('560')
    expect(dim(end, 'right')[0].label).toBe('720')
  })

  // Two bays of a 600 on 18 mm stock: 600 - 2*18 = 564 clear, less an 18 mm partition, halved.
  it('chains the openings across the top of the Front view', () => {
    const p = lopsided({ section: legacyToSection([0.5], 0, 600, 18) })
    expect(dim(viewsOf(p).front, 'above').map((d) => d.label)).toEqual(['273', '273'])
  })

  // An uneven tree is what separates "read the resolved rectangles" from "read the tree's
  // percentages": with equal bays the two agree.
  it('chains uneven bays at their resolved sizes', () => {
    const p = lopsided({ section: legacyToSection([0.25], 0, 600, 18) })
    const chain = dim(viewsOf(p).front, 'above').map((d) => Number(d.label))
    expect(chain).toHaveLength(2)
    expect(chain[0]).toBeLessThan(chain[1])
    expect(chain[0] + chain[1] + 18).toBe(564)
  })

  // Two leaves stacked in one bay share that bay's x-span. Without the dedupe the chain would
  // dimension the same 564 mm twice, one line on top of the other.
  it('dimensions a shared span once, however many leaves sit in it', () => {
    const root = legacyToSection([], 0, 600, 18)
    const split = splitSection(root, root.id, 'horizontal', 'panel', 2)
    const across = dim(viewsOf(lopsided({ section: split })).front, 'above')
    expect(across).toHaveLength(1)
    expect(across[0].label).toBe('564')
  })

  it('puts the toe kick on its own ring so it cannot collide with the opening chain', () => {
    const { front } = viewsOf(lopsided())
    const left = dim(front, 'left')
    const kick = left.find((d) => d.label === '100')
    expect(kick).toBeDefined()
    expect(kick!.ring).toBe(2)
    expect(left.filter((d) => d.ring === 1).every((d) => d.label !== '100')).toBe(true)
  })

  it('never gives two dimensions the same side and ring twice over', () => {
    for (const v of Object.values(viewsOf(lopsided()))) {
      const seen = new Set<string>()
      for (const d of v.dims) {
        const key = `${d.side}:${d.ring}:${d.start}:${d.end}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })

  // The override-before-layout rule: a 25 mm left side makes the clear opening 564 - 7 = 557 wide.
  // Passing an empty override map instead reads 564 and draws an opening the boards do not have.
  it('reads per-part thickness overrides in the opening chain', () => {
    const p = lopsided()
    const base = partsOf(p)
    const parts = base.map((part) =>
      part.kind === 'board' && part.role === 'left-side'
        ? { ...part, overrides: { thickness: 25 } }
        : part,
    )
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    // PRESET_MATERIALS, not a thicker fixture: `roleThicknessFor` returns an explicit override
    // before it ever consults the materials map, so the override alone is what this asserts.
    const [front] = buildAssemblyViews(parts, ids, c, PRESET_MATERIALS)
    expect(front.dims.filter((d) => d.side === 'above')[0].label).toBe('557')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL — `buildDims` returns `[]`.

- [ ] **Step 3: Implement**

Replace Task 4's `buildDims` stub in `src/geom/assembly.ts` (keep the `AssemblyDim` interface it
declared) and change the call to `buildDims(view, p, thicknessOf)`:

```ts
import { openingRect } from '../scene/carcaseRoles'
import { overridesOf, roleThicknessFor } from '../scene/resolveThickness'
import { resolveSections } from '../scene/sectionTree'
import { sectionOpenings } from '../scene/sectionInterior'

// Collision is prevented by construction — no two families share a side AND a ring — so nothing
// here needs a placement search, which is most of what drawing.ts's complexity actually is.

const mm = (n: number): string => String(Math.round(n * 100) / 100)

function buildDims(view: ViewSpec, p: CarcaseParams, thicknessOf: RoleThickness): AssemblyDim[] {
  const eu = cabinetExtent(p, view.u)
  const ev = cabinetExtent(p, view.v)
  const dims: AssemblyDim[] = [
    { axis: 'h', side: 'below', ring: 1, start: 0, end: eu.hi - eu.lo, label: mm(eu.hi - eu.lo) },
    { axis: 'v', side: 'right', ring: 1, start: 0, end: ev.hi - ev.lo, label: mm(ev.hi - ev.lo) },
  ]

  if (p.baseMode !== 'none') {
    dims.push({
      axis: 'v',
      side: 'left',
      ring: 2,
      start: 0,
      end: p.toeKickHeight,
      label: mm(p.toeKickHeight),
    })
  }

  // Openings are chained only where they divide along one of this view's own axes: nothing divides
  // in y, so the Top view carries overall figures alone.
  if (view.label === 'Front') {
    const tree = resolveSections(p.section, openingRect(p, thicknessOf), (parentId, index) =>
      thicknessOf(`division-${parentId}-${index}`),
    )
    const leaves = sectionOpenings(p.section, tree)
    // Read off the RESOLVED rectangles, never re-walked from the tree's percentages: a chain
    // derived from the same rectangles the elevation draws cannot disagree with it.
    //
    // The chain lists the OPENINGS themselves, deduped — two leaves stacked inside one bay share
    // that bay's x-span and must not dimension it twice. Deliberately it does not sum to the
    // overall: the panels between openings are a material spec, not a dimension. Taking gaps
    // between every distinct edge instead would emit those panels too, giving `273 | 18 | 273`
    // for a two-bay cabinet.
    const chain = (
      pick: (r: { x0: number; x1: number; z0: number; z1: number }) => [number, number],
    ): [number, number][] => {
      const seen = new Map<string, [number, number]>()
      for (const l of leaves) {
        const span = pick(l.rect)
        seen.set(span.map((n) => Math.round(n * 1e6)).join(':'), span)
      }
      return [...seen.values()].sort((a, b) => a[0] - b[0])
    }

    for (const [a, b] of chain((r) => [r.x0, r.x1])) {
      dims.push({ axis: 'h', side: 'above', ring: 1, start: a, end: b, label: mm(b - a) })
    }
    for (const [a, b] of chain((r) => [r.z0, r.z1])) {
      dims.push({ axis: 'v', side: 'left', ring: 1, start: a, end: b, label: mm(b - a) })
    }
  }

  return dims
}
```

And in `buildAssemblyViews`, resolve thickness once from the parts and pass it down:

```ts
// Overrides are read BEFORE the layout resolves, exactly as the generator does. A drawing that
// used the cabinet's nominal thickness would show openings the boards it dimensions do not have.
const thicknessOf = roleThicknessFor(p, materials, overridesOf(parts, cabinet.id))
```

then `dims: buildDims(view, p, thicknessOf)`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation check — the chain source, and the overrides**

```bash
cp src/geom/assembly.ts "$SCRATCHPAD"/assembly-t5.bak

# (a) empty override map
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="roleThicknessFor(p, materials, overridesOf(parts, cabinet.id))"
new="roleThicknessFor(p, materials, new Map())"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "new Map())" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _reads per-part thickness overrides in the opening chain_ — 564 instead of 557.

```bash
cp "$SCRATCHPAD"/assembly-t5.bak src/geom/assembly.ts
grep -n "overridesOf(parts, cabinet.id)" src/geom/assembly.ts

# (b) toe kick on ring 1, colliding with the opening chain
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="""      side: 'left',
      ring: 2,"""
new="""      side: 'left',
      ring: 1,"""
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "ring: 1," src/geom/assembly.ts | head -3
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _puts the toe kick on its own ring_.

```bash
cp "$SCRATCHPAD"/assembly-t5.bak src/geom/assembly.ts
grep -n "ring: 2," src/geom/assembly.ts
```

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/geom/assembly.ts src/geom/assembly.test.ts
git commit -m "feat(geom): dimension chains, placed by side and ring

Overall figures per view plus one opening chain per axis, read off the
resolved section rectangles rather than re-walked from the tree's percentages
so a chain cannot disagree with the elevation drawn from the same numbers.

Each family owns a side and a ring, so no two dimensions can collide and no
placement search is needed. Thickness overrides are read before the layout
resolves, as everywhere else: a 25 mm side makes the clear opening 557, not
564.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

# Group B2 — cuts

## Task 6: through-cuts shape the silhouette

**Files:**

- Modify: `src/geom/assembly.ts`
- Test: `src/geom/assembly.test.ts`

**The headline claim of this stage.** A cut is _through_ in a given view when its span along **that
view's** depth axis covers the part's span. Asked per view, not once per cut — and the toe-kick notch
is what proves it:

| view  | depth | notch                                   | side        | verdict                                                             |
| ----- | ----- | --------------------------------------- | ----------- | ------------------------------------------------------------------- |
| End   | x     | full thickness (built at `−T/2 … 3T/2`) | `x0 … x0+T` | **through** — the silhouette becomes an L                           |
| Front | y     | `0 … setback`                           | `0 … D`     | **not through** — material behind it; the full rectangle is correct |

Any implementation that classifies a cut once gets one of these two wrong.

Cuts also routinely **overshoot** the part on purpose, so OCCT resolves a through-cut without a
coplanar face. A cut rectangle must be clipped to the silhouette or the Front view shows a dashed box
hanging 9 mm past an 18 mm side on both sides.

- [ ] **Step 1: Write the failing tests**

Append to `src/geom/assembly.test.ts`:

```ts
describe('cuts', () => {
  const sideIn = (v: { parts: AssemblyPart[] }, label: string) =>
    v.parts.find((q) => q.label === label)!

  // A Base 600 with the toe-kick notch actually cut into its sides. `partsOf` builds parts with no
  // cuts, so the notch has to be attached here, from the same `carcaseCuts` the generator uses.
  const notched = () => {
    const p = lopsided({ baseMode: 'toe-kick' })
    const thicknessOf = roleThicknessFor(p, PRESET_MATERIALS, new Map())
    const parts = partsOf(p).map((part) =>
      part.kind === 'board' && part.role === 'left-side'
        ? { ...part, cuts: carcaseCuts(p, thicknessOf, 'left-side') }
        : part,
    )
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const [front, top, end] = buildAssemblyViews(parts, ids, c, PRESET_MATERIALS)
    return { front, top, end }
  }

  // The stage's headline test. One cut, two views, two different answers.
  it('makes the toe-kick notch through in End and internal in Front', () => {
    const { front, end } = notched()

    // End: the notch is taken out of the silhouette, so the side is no longer one rectangle.
    expect(sideIn(end, 'Left Side').rects.length).toBeGreaterThan(1)
    expect(sideIn(end, 'Left Side').cutRects).toEqual([])

    // Front: still one rectangle, and the notch shows as dashed internal detail.
    expect(sideIn(front, 'Left Side').rects).toHaveLength(1)
    expect(sideIn(front, 'Left Side').cutRects.length).toBe(1)
  })

  // A cut is built oversize on purpose (position.z = -T/2, size.z = 2T) so OCCT sees an
  // unambiguous through-cut. Drawn unclipped that is a dashed box 9 mm outside an 18 mm panel.
  it('clips a cut rectangle to its own part', () => {
    const side = sideIn(notched().front, 'Left Side')
    const box = side.rects[0]
    for (const cut of side.cutRects) {
      expect(cut.rect.x).toBeGreaterThanOrEqual(box.x - 1e-6)
      expect(cut.rect.x + cut.rect.w).toBeLessThanOrEqual(box.x + box.w + 1e-6)
      expect(cut.rect.y).toBeGreaterThanOrEqual(box.y - 1e-6)
      expect(cut.rect.y + cut.rect.h).toBeLessThanOrEqual(box.y + box.h + 1e-6)
    }
  })

  // A part with a through-cut stops occluding through the hole — which is why an occluder is a
  // LIST of rectangles rather than one. No real cabinet can witness this, and it is worth saying
  // why rather than writing a test that passes for the wrong reason:
  //
  //   * the toe-kick notch is the only through-cut a generated cabinet has, and it is through in
  //     the End view alone (in Front it spans 60 of 560, in Top 100 of 720);
  //   * in End, nearer is larger x, so the notched left side at x[0,18] is the FARTHEST part and
  //     occludes nothing at all. Its notch cannot reveal anything because nothing is behind it.
  //
  // An earlier draft asserted that the toe kick "shows through the recess". It does not: the toe
  // kick spans x[18,582] and is *nearer* than the side, so it was never occluded and the assertion
  // passed without touching the rule. Two synthetic boards are the honest witness — and the case
  // is reachable, since a user can cut a hole in a panel.
  it('stops occluding through a through-cut', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])

    // Front view: u = x, v = z, depth = y. A 200x200 panel 10 deep, with a 100x100 hole clean
    // through it — the cut oversized in y exactly as `carcaseCuts` oversizes the notch.
    const holed = board({
      id: 'board_holed',
      label: 'Holed',
      length: 200,
      width: 10,
      thickness: 200,
      position: { x: 0, y: 0, z: 0 },
      cuts: [
        {
          kind: 'box',
          id: 'cut_hole',
          label: 'Hole',
          face: '-Z',
          position: { x: 50, y: -5, z: 50 },
          size: { x: 100, y: 20, z: 100 },
        },
      ],
    })
    // Squarely inside the hole (x 75..125, z 75..125 against the hole's 50..150) and well behind
    // the panel in depth, so it would be wholly hidden if the hole did not open the occluder.
    const behind = board({
      id: 'board_behind_hole',
      label: 'Seen Through',
      length: 50,
      width: 10,
      thickness: 50,
      position: { x: 75, y: 100, z: 75 },
    })

    const [front] = buildAssemblyViews([holed, behind], ids, c, PRESET_MATERIALS)
    const seen = sideIn(front, 'Seen Through')
    expect(seen.hidden).toEqual([])
    expect(seen.solid).toHaveLength(4)
  })
})
```

Add `carcaseCuts` and `AssemblyPart` to the test file's imports.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL — `rects` is always one rectangle and `cutRects` is always empty.

- [ ] **Step 3: Implement**

Add to `src/geom/assembly.ts`:

```ts
import type { BoxCut, CutDef } from '../scene/types'

// A cut's box in cabinet space. Cuts live in BOARD axes — `position` is the min corner, `size` the
// extent — so each goes through the same matrices the silhouette does.
function boxFromLocal(
  lo: Vec3,
  hi: Vec3,
  part: Part,
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
): CabinetBox {
  const mPart = resolveWorldMatrix(part, byId)
  const mCabinet = resolveWorldMatrix(cabinet, byId)
  const corners: Vec3[] = []
  for (const x of [lo.x, hi.x])
    for (const y of [lo.y, hi.y])
      for (const z of [lo.z, hi.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(mPart, x, y, z)
        const [cx, cy, cz] = applyInverseToPoint(mCabinet, wx, wy, wz)
        corners.push({ x: cx, y: cy, z: cz })
      }
  const min = {
    x: Math.min(...corners.map((c) => c.x)),
    y: Math.min(...corners.map((c) => c.y)),
    z: Math.min(...corners.map((c) => c.z)),
  }
  const max = {
    x: Math.max(...corners.map((c) => c.x)),
    y: Math.max(...corners.map((c) => c.y)),
    z: Math.max(...corners.map((c) => c.z)),
  }
  return { min, max, axisAligned: true, corners }
}

// Asked PER VIEW, never once per cut. The toe-kick notch is through in End (it spans the side's
// whole thickness) and internal in Front (there is still material behind it) — one cut, two
// answers, and an implementation that decides once gets one of them wrong.
function isThrough(cut: CabinetBox, part: CabinetBox, view: ViewSpec): boolean {
  return (
    cut.min[view.depth] <= part.min[view.depth] + EPS &&
    cut.max[view.depth] >= part.max[view.depth] - EPS
  )
}

const clip = (r: Rect2D, to: Rect2D): Rect2D | null => {
  const x = Math.max(r.x, to.x)
  const y = Math.max(r.y, to.y)
  const w = Math.min(r.x + r.w, to.x + to.w) - x
  const h = Math.min(r.y + r.h, to.y + to.h) - y
  return w > EPS && h > EPS ? { x, y, w, h } : null
}

// A rectangle minus a list of rectangles, as a list of rectangles. Horizontal bands split by the
// same interval subtraction the edges use — an occluder is a list, so this is all it takes for a
// notched part to stop occluding through its notch.
function subtractRects(base: Rect2D, holes: Rect2D[]): Rect2D[] {
  const ys = new Set<number>([base.y, base.y + base.h])
  for (const h of holes) {
    if (h.y > base.y + EPS && h.y < base.y + base.h - EPS) ys.add(h.y)
    if (h.y + h.h > base.y + EPS && h.y + h.h < base.y + base.h - EPS) ys.add(h.y + h.h)
  }
  const rows = [...ys].sort((a, b) => a - b)
  const out: Rect2D[] = []
  for (let i = 0; i + 1 < rows.length; i++) {
    const y = rows[i]
    const h = rows[i + 1] - y
    const mid = y + h / 2
    const spans = holes
      .filter((q) => q.y <= mid && q.y + q.h >= mid)
      .map((q): Span => ({ a: q.x, b: q.x + q.w }))
    for (const s of subtractIntervals({ a: base.x, b: base.x + base.w }, spans)) {
      out.push({ x: s.a, y, w: s.b - s.a, h })
    }
  }
  return out
}
```

Then, inside `buildAssemblyViews`'s per-part map, replace `const rects = [proj.rect]` with:

```ts
const boxCuts = part.kind === 'board' ? part.cuts.filter(isBoxCut) : []
const projectedCuts = boxCuts.map((cut) => ({
  cut,
  cabinet: boxFromLocal(
    cut.position,
    {
      x: cut.position.x + cut.size.x,
      y: cut.position.y + cut.size.y,
      z: cut.position.z + cut.size.z,
    },
    part,
    byId,
    cabinet,
  ),
}))
const through = projectedCuts
  .filter((c) => isThrough(c.cabinet, box, view))
  .map((c) => projectBox(c.cabinet, view, p).rect)
const internal = projectedCuts
  .filter((c) => !isThrough(c.cabinet, box, view))
  .map((c) => projectBox(c.cabinet, view, p).rect)

const rects = box.axisAligned ? subtractRects(proj.rect, through) : [proj.rect]
// Clipped on the way IN. A consumer that had to clip would be a second place the rule lived.
const cutRects: DrawRect[] = internal
  .map((r) => clip(r, proj.rect))
  .filter((r): r is Rect2D => r !== null)
  .map((rect) => ({ rect, dashed: true }))
```

and add the guard used above near the other helpers:

```ts
// Named rather than inlined so the exhaustive switch in Task 7 is the only place cut kinds are
// enumerated.
const isBoxCut = (c: CutDef): c is BoxCut => c.kind === 'box'
```

Set `cutRects` on the returned `AssemblyPart` instead of `[]`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation check — through decided once, and the clip**

```bash
cp src/geom/assembly.ts "$SCRATCHPAD"/assembly-t6.bak

# (a) decide "through" once, not per view — the classic error
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="""  return (
    cut.min[view.depth] <= part.min[view.depth] + EPS &&
    cut.max[view.depth] >= part.max[view.depth] - EPS
  )"""
new="""  return (
    cut.min.x <= part.min.x + EPS && cut.max.x >= part.max.x - EPS
  )"""
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "cut.min.x <= part.min.x" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _makes the toe-kick notch through in End and internal in Front_ — Front now takes
the notch out of the silhouette, which is wrong: there is material behind it.

```bash
cp "$SCRATCHPAD"/assembly-t6.bak src/geom/assembly.ts
grep -n "cut.min\[view.depth\]" src/geom/assembly.ts

# (b) don't clip
python3 - <<'PY'
p='src/geom/assembly.ts'; s=open(p).read()
old="""        .map((r) => clip(r, proj.rect))
        .filter((r): r is Rect2D => r !== null)"""
new="""        .map((r) => r)"""
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n ".map((r) => r)" src/geom/assembly.ts
```

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL on _clips a cut rectangle to its own part_ — the notch runs 9 mm past both faces.

```bash
cp "$SCRATCHPAD"/assembly-t6.bak src/geom/assembly.ts
grep -n "clip(r, proj.rect)" src/geom/assembly.ts
```

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/geom/assembly.ts src/geom/assembly.test.ts
git commit -m "feat(geom): through-cuts shape the silhouette, per view

A cut is through in a given view when it spans the part along THAT view's
depth axis. The toe-kick notch proves the question must be asked per view: it
is through in End, where it clears the side's whole thickness and turns the
silhouette into an L, and internal in Front, where there is still material
behind it and the full rectangle is correct.

Cuts are built oversize on purpose so OCCT resolves them without a coplanar
face, so a cut rectangle is clipped to its part on the way in.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 7: hole arrays, mitres, and the exhaustive switch

**Files:**

- Modify: `src/geom/assembly.ts`
- Test: `src/geom/assembly.test.ts`

Measured machining, so the volume is known rather than feared: Base 600 **46 bores**, Wall 600 **46**,
Tall 600 **64**. Worst single view is 28 dashed circles on a Tall side seen face-on — a normal
drawing. A bore seen **edge-on draws nothing**, matching the convention `drawing.ts` already states.

> **Six corrections to this task's first draft**, all found by reading the real generators rather
> than the plan. Each one is a mutation the draft's own two tests could not see, because every hole
> array a preset emits lands on a `±Z` face — the one face for which each mistake is a no-op.
>
> 1. The draft's `squareOn` built its drill direction as `start.z + depth`, hardcoding board **+Z**.
>    The drill axis is `faceAxes(h.face).depth`. `screw.ts` emits pilots on `joint.receivingEnd`
>    (an end face — `±X`/`±Y`), so this is wrong on any cabinet with a screw joint.
> 2. The draft's `boreCircles` stepped `step.x` for `axis: 'U'` and `step.y` otherwise, hardcoding
>    face `±Z`'s in-face axes. The row marches along `faceAxes(h.face).u` or `.v` — `drawing.ts`
>    already does exactly this.
> 3. The draft's `marches` guard tested a box built from `boxFromLocal(centre, centre, …)`. That box
>    is degenerate in **all three** axes, so both comparisons were `0 < EPS` and the guard was dead.
>    The test is live only when applied to the *drill direction's* span.
> 4. The draft asked `squareOn(holes[0], …)` once per part. A left side carries pin rows through its
>    face **and** plate screws through its face **and**, once a screw joint exists, pilots into its
>    end — one answer for all of them is wrong for at least one. Asked per array, `squareOn`
>    collapses into `boreCircles`'s own loop and stops being a function.
> 5. The draft's `squareOn` returned "the drill span has extent along `view.depth`". For a skewed
>    part the drill axis has extent along *every* axis, so that says square-on in all three views.
>    The right test is that the span is **flat in the view's own two axes**, which rejects skew.
> 6. The draft said mitres "take the non-axis-aligned path already written" and then named
>    `mitreFaceOutline` to build the outline. Those contradict each other: `mitreFaceOutline` returns
>    **board-local 2-D** points for a Face or Edge view of that board, which mean nothing in cabinet
>    space. The intent was right and the mechanism wrong — take the path already written, and import
>    nothing.

- [ ] **Step 1: Write the failing tests**

Add to the test imports: `carcaseHoleArrays` from `../scene/carcaseRoles`, and `Vec3` and `CutDef`
from `../scene/types`.

```ts
describe('machining', () => {
  const withBores = (p: CarcaseParams): Part[] => {
    const thicknessOf = roleThicknessFor(p, PRESET_MATERIALS, new Map())
    const kindOf = jointKindFor([], cabinet.id)
    return partsOf(p).map((part) =>
      part.kind === 'board' && part.role !== undefined
        ? { ...part, cuts: carcaseHoleArrays(p, thicknessOf, kindOf, part.role) }
        : part,
    )
  }

  const boredViews = (p: CarcaseParams) => {
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const [front, top, end] = buildAssemblyViews(withBores(p), ids, c, PRESET_MATERIALS)
    return { front, top, end }
  }

  // One board, alone in the cabinet, carrying exactly the arrays a test hands it. Every fixture
  // below is unrotated, so board axes ARE cabinet axes and the expected view can be read off the
  // face letter directly.
  const bored = (cuts: CutDef[], over: Partial<BoardPart> = {}) => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const part = board({ label: 'Bored', cuts, ...over })
    const [front, top, end] = buildAssemblyViews([part], ids, c, PRESET_MATERIALS)
    const of = (v: AssemblyView) => v.parts.find((q) => q.label === 'Bored')!
    return { front: of(front), top: of(top), end: of(end) }
  }

  const holes = (over: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
    kind: 'hole-array',
    id: 'cut_h1',
    label: 'Row',
    face: '+Y',
    axis: 'V',
    start: { x: 100, y: 720, z: 9 },
    pitch: 5,
    count: 3,
    diameter: 8,
    depth: 10,
    ...over,
  })

  // Counted against what the generator actually emitted, never against a number typed here: a
  // circle-per-array implementation and a circle-per-bore one both pass `length > 0`.
  it('draws every pin bore as a circle in the view drilled square to it', () => {
    const p = lopsided()
    const side = withBores(p).find((q) => q.label === 'Left Side') as BoardPart
    const expected = side.cuts.reduce((n, c) => n + (c.kind === 'hole-array' ? c.count : 0), 0)
    expect(expected).toBeGreaterThan(0)
    expect(boredViews(p).end.parts.find((q) => q.label === 'Left Side')!.circles.length).toBe(
      expected,
    )
  })

  // Edge-on a bore is a slot, not a circle. drawing.ts draws nothing for it and so does this.
  it('draws nothing for a bore seen edge-on', () => {
    const { front, top } = boredViews(lopsided())
    expect(front.parts.find((q) => q.label === 'Left Side')!.circles).toEqual([])
    expect(top.parts.find((q) => q.label === 'Left Side')!.circles).toEqual([])
  })

  // The drill axis comes from the FACE. A `+Y` row is square-on to Front and to nothing else; code
  // that hardcodes board +Z puts it in Top instead.
  it('takes the drill axis from the face, not from board +Z', () => {
    const v = bored([holes()])
    expect(v.front.circles.length).toBe(3)
    expect(v.top.circles).toEqual([])
    expect(v.end.circles).toEqual([])
  })

  // The row marches along one of the FACE's two in-face axes. On `+Y` that is board z for 'V' —
  // code that hardcodes board y for 'V' stacks all three bores on one spot in Front.
  it('marches the row along the face axis its `axis` names', () => {
    const v = bored([holes()])
    expect(v.front.circles.map((c) => [c.cx, c.cy])).toEqual([
      [100, 9],
      [100, 14],
      [100, 19],
    ])
    expect(v.front.circles.map((c) => c.r)).toEqual([4, 4, 4])
  })

  // Two rows on two faces. Asking `holes[0]` once for the whole part answers for both, which puts
  // three circles in Front and none in Top.
  it('asks each array its own question, not the first array once', () => {
    const v = bored([holes(), holes({ id: 'cut_h2', face: '+Z', axis: 'U', count: 2 })])
    expect(v.front.circles.length).toBe(3)
    expect(v.top.circles.length).toBe(2)
  })

  // A tilted part's drill axis points at no view at all. A square-on test that only asks for extent
  // along the view's depth says yes to Front AND Top here.
  it('draws no circle on a part tilted out of every view', () => {
    const v = bored([holes({ face: '+Z', start: { x: 100, y: 100, z: 18 } })], {
      rotation: { x: 30, y: 0, z: 0 },
    })
    expect([v.front.circles, v.top.circles, v.end.circles]).toEqual([[], [], []])
  })

  // A mitre bevels the silhouette away from the bounding box, so the box stops being the shape.
  it('draws a mitred board as an outline and lets it occlude nothing', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const mitre: CutDef = {
      kind: 'mitre',
      id: 'cut_m1',
      label: 'Mitre',
      end: '+X',
      axis: 'Z',
      angle: 45,
    }
    const far = board({ id: 'board_far', label: 'Far', position: { x: 0, y: 300, z: 0 } })
    const near = board({ id: 'board_near', label: 'Near', position: { x: 0, y: 0, z: 0 } })
    const plain = buildAssemblyViews([far, near], ids, c, PRESET_MATERIALS)[0]
    const cut = buildAssemblyViews([far, { ...near, cuts: [mitre] }], ids, c, PRESET_MATERIALS)[0]

    // Without the mitre the near board hides the far one; the fixture is only evidence if it does.
    expect(plain.parts.find((q) => q.label === 'Far')!.hidden.length).toBeGreaterThan(0)
    expect(cut.parts.find((q) => q.label === 'Far')!.hidden).toEqual([])
    expect(cut.parts.find((q) => q.label === 'Near')!.outline).not.toBeUndefined()
    expect(plain.parts.find((q) => q.label === 'Near')!.outline).toBeUndefined()
  })

  // The never guard is what forces a future CutDef member to be classified deliberately instead of
  // vanishing from every drawing. Reaching it requires defeating the type system, which is the point.
  it('throws on an unknown cut kind rather than dropping it silently', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const bogus = board({ cuts: [{ kind: 'chamfer', id: 'cut_x', label: 'x' }] as unknown as CutDef[] })
    expect(() => buildAssemblyViews([bogus], ids, c, PRESET_MATERIALS)).toThrow(/unknown cut kind/)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: FAIL — `circles` is always `[]`, a mitred board still occludes, and nothing throws.

- [ ] **Step 3: Implement**

Imports to add to `src/geom/assembly.ts`: `faceAxes` from `../scene/snapMath`, and `HoleArrayCut`
and `MitreCut` to the type import from `../scene/types`.

```ts
// Every cut kind, named. The `never` check makes a new CutDef member a COMPILE error rather than a
// shape that silently vanishes from every drawing — the same discipline buildBoardSheet uses.
interface SortedCuts {
  boxes: BoxCut[]
  holes: HoleArrayCut[]
  mitres: MitreCut[]
}

function sortCuts(cuts: CutDef[]): SortedCuts {
  const out: SortedCuts = { boxes: [], holes: [], mitres: [] }
  for (const c of cuts) {
    switch (c.kind) {
      case 'box':
        out.boxes.push(c)
        break
      case 'hole-array':
        out.holes.push(c)
        break
      case 'mitre':
        out.mitres.push(c)
        break
      default: {
        const exhaustive: never = c
        throw new Error(`unknown cut kind: ${(exhaustive as { kind: string }).kind}`)
      }
    }
  }
  return out
}

// A row of bores reads as circles only in the view whose depth axis IS the drill axis; the other two
// see it edge-on and draw nothing, the convention drawing.ts already states. Asked per array rather
// than once per part: a side panel carries pin rows drilled through its face and, wherever a screw
// joint lands, pilots drilled into its end — one answer for both is wrong for one of them.
//
// Every bore is dashed. In a whole-cabinet projection machining is interior detail whichever face it
// is on; the through/blind distinction buildBoardSheet draws is about one board seen alone.
function boreCircles(
  holes: HoleArrayCut[],
  part: Part,
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
  view: ViewSpec,
  p: CarcaseParams,
): DrawCircle[] {
  const out: DrawCircle[] = []
  for (const h of holes) {
    const ax = faceAxes(h.face)
    // A unit step along the drill axis, carried into cabinet space. Square-on exactly when that step
    // is flat in BOTH of the view's own axes — which is also what rejects a skewed part, whose drill
    // axis has extent along all three and so points at no view at all.
    const tip: Vec3 = { ...h.start }
    tip[ax.depth] += 1
    const drill = boxFromLocal(h.start, tip, part, byId, cabinet)
    const flat = (a: Axis) => Math.abs(drill.max[a] - drill.min[a]) < EPS
    if (!flat(view.u) || !flat(view.v)) continue

    const along = h.axis === 'U' ? ax.u : ax.v
    for (let i = 0; i < h.count; i++) {
      const centre: Vec3 = { ...h.start }
      centre[along] += h.pitch * i
      const proj = projectBox(boxFromLocal(centre, centre, part, byId, cabinet), view, p)
      out.push({ cx: proj.rect.x, cy: proj.rect.y, r: h.diameter / 2, dashed: true })
    }
  }
  return out
}
```

In `buildAssemblyViews`, replace the `isBoxCut` filter with the sort, and derive a local
`axisAligned` from it:

```ts
const withCuts = projected.map(({ part, box, proj }) => {
  const sorted = part.kind === 'board' ? sortCuts(part.cuts) : { boxes: [], holes: [], mitres: [] }
  // A mitre bevels the silhouette away from its bounding box, so a mitred board is no longer "the
  // box is the shape": it draws as its hull and takes no part in occlusion, exactly like a
  // cylinder. The hull still overstates it — the bevel itself is not drawn — but it can never hide
  // a part it does not really cover.
  const axisAligned = box.axisAligned && sorted.mitres.length === 0
  const projectedCuts = sorted.boxes.map(/* unchanged */)
  …
  const rects = axisAligned ? subtractRects(proj.rect, through) : [proj.rect]
  …
  return { part, box, proj, axisAligned, rects, cutRects,
           circles: boreCircles(sorted.holes, part, byId, cabinet, view, p) }
})
```

and thread it through `assembled`: the occluder gate becomes `axisAligned ? … .filter((q) =>
q.axisAligned && …) : []`, `outline` becomes `axisAligned ? undefined : hullOf(box, view, p)`, and
`circles: []` becomes `circles`.

`isBoxCut` is now unused — delete it. Its own comment says why it existed: "so the exhaustive switch
in Task 7 is the only place cut kinds are enumerated."

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/assembly.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-test the new rules**

Back the file up with `cp` first and restore from that copy — never `git checkout`. Grep after
applying and again after restoring. Predicted victims, to be checked against what actually fails:

| # | Mutation | Predicted to fail |
|---|---|---|
| 1 | `tip[ax.depth]` → `tip.z` | takes the drill axis from the face |
| 2 | `h.axis === 'U' ? ax.u : ax.v` → `h.axis === 'U' ? 'x' : 'y'` | marches the row along the face axis |
| 3 | `if (!flat(view.u) \|\| !flat(view.v)) continue` → `if (flat(view.depth)) continue` | takes the drill axis from the face; draws nothing edge-on |
| 4 | drop the `flat` guard entirely | draws nothing for a bore seen edge-on |
| 5 | `centre[along] += h.pitch * i` → `+= 0` | marches the row along the face axis |
| 6 | `sorted.mitres.length === 0` → `true` | draws a mitred board as an outline |
| 7 | `h.diameter / 2` → `h.diameter` | marches the row along the face axis (the `r` assertion) |

A mutation that survives is a gap in the tests, not a licence to skip it: add the test that kills it
or delete the line it proves is dead.

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Commit with `git commit -F -` and a heredoc (the message carries backticks):

```
feat(geom): bores and mitres in a cabinet projection

Pin rows, screw pilots and hinge cups draw as dashed circles in the view they
are drilled square to and nothing in the other two, matching the convention
drawing.ts already states. Measured volume: 46 bores on a Base 600, 64 on a
Tall, worst single view 28 circles.

The drill axis comes from the cut's face and the row marches along that face's
own in-plane axis, both asked per array. A side panel carries pin rows through
its face and screw pilots into its end; one answer for the whole part is wrong
for one of them.

A mitre bevels the silhouette away from its bounding box, so a mitred board
stops being an axis-aligned box: it draws as its hull and occludes nothing.

Cut kinds go through one exhaustive switch with a never check, so a new
CutDef member is a compile error rather than a shape that silently vanishes
from every drawing.
```

---

# Group C — the pane, the selection, the override fixes

## Before Task 8: the shared carcase-parts fixture

Three test files need "the parts a carcase's parameters imply, built the way `regenerateComponents`
builds them": `assembly.test.ts` already has it as a local `partsOf`, Task 8 needs it, and Tasks
11-14 all need it again. That is three copies of one twenty-line block, each free to drift from
`regenerateComponents` independently. Create `src/geom/__fixtures__/cabinetSheet.ts` **first** and
import from it everywhere, `assembly.test.ts` included - parameterized, because `assembly.test.ts`
builds lopsided cabinets while the sheet tasks only ever want a Base 600.

```ts
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../../scene/carcasePresets'
import { carcaseRoles } from '../../scene/carcaseRoles'
import { roleThicknessFor } from '../../scene/resolveThickness'
import { jointKindFor } from '../../scene/resolveJointKind'
import type { CarcaseComponent, CarcaseParams, ComponentId, Part } from '../../scene/types'

export const cabinet: CarcaseComponent = {
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

// The parts a carcase's parameters imply, built the way regenerateComponents builds them, so every
// consumer of the projector is tested against what the app actually holds.
export function partsOfCarcase(params: CarcaseParams, parentId: ComponentId = cabinet.id): Part[] {
  return carcaseRoles(
    params,
    roleThicknessFor(params, PRESET_MATERIALS, new Map()),
    jointKindFor([], parentId),
  ).map((r, i) => ({
    kind: 'board',
    id: `board_${i}`,
    label: r.label,
    length: r.panel.length,
    width: r.panel.width,
    thickness: r.panel.thickness,
    grain: r.grain,
    material: '',
    color: '#888',
    position: r.panel.position,
    rotation: r.panel.rotation,
    rotationOrder: r.panel.rotationOrder,
    cuts: [],
    visible: true,
    parentId,
    driven: true,
    role: r.role,
  }))
}

export const partsOfBase600 = (): Part[] => partsOfCarcase(cabinet.params)
```

Then delete `partsOf` from `src/geom/assembly.test.ts` and import `partsOfCarcase` in its place.
The full suite is the check that the swap changed nothing: 1573 tests must still pass.

## Task 8: `CabinetProjection.tsx`

**Files:**

- Create: `src/ui/CabinetProjection.tsx`
- Test: `src/ui/CabinetProjection.test.tsx`

Fit-to-pane via a millimetre `viewBox`, like `SectionElevation`. **Unlike** the elevation this draws
text, so labels are sized as a fraction of the view extent and strokes carry
`vector-effect="non-scaling-stroke"` — otherwise a 3 mm label on a 720 mm cabinet renders at under
two pixels.

- [ ] **Step 1: Write the failing test**

Create `src/ui/CabinetProjection.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CabinetProjection } from './CabinetProjection'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type { Component, ComponentId, Part } from '../scene/types'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

const parts: Part[] = partsOfBase600()

const draw = (
  view: 'Front' | 'Top' | 'End' = 'Front',
  onSelect = vi.fn(),
  selectedId: string | null = null,
) => {
  render(
    <CabinetProjection
      view={view}
      parts={parts}
      byId={byId}
      cabinet={cabinet}
      materials={PRESET_MATERIALS}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  )
  return onSelect
}

describe('CabinetProjection', () => {
  afterEach(cleanup)

  it('draws one clickable shape per visible part', () => {
    draw()
    expect(screen.getAllByTestId(/^projection-part-/).length).toBe(parts.length)
  })

  it('selects the part a shape stands for', async () => {
    const onSelect = draw()
    await userEvent.click(screen.getByTestId(`projection-part-${parts[0].id}`))
    expect(onSelect).toHaveBeenCalledWith(parts[0].id)
  })

  it('marks the selected part and no other', () => {
    draw('Front', vi.fn(), parts[1].id)
    const marked = screen
      .getAllByTestId(/^projection-part-/)
      .filter((el) => el.getAttribute('data-selected') === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-testid')).toBe(`projection-part-${parts[1].id}`)
  })

  // The cull is the projector's, and the pane must show its result rather than re-deriving one.
  it('draws fewer parts in End than in Front, because End is a section', () => {
    draw('End')
    const end = screen.getAllByTestId(/^projection-part-/).length
    cleanup()
    draw('Front')
    expect(end).toBeLessThan(screen.getAllByTestId(/^projection-part-/).length)
  })

  // getAllByText, not getByText: an opening-chain label is free to equal an overall figure on some
  // future preset, and a duplicate should not turn this into a confusing failure about the wrong
  // thing. What is asserted is that the overall figures are labelled at all.
  it('labels the overall dimensions', () => {
    draw()
    expect(screen.getAllByText('600').length).toBeGreaterThan(0)
    expect(screen.getAllByText('720').length).toBeGreaterThan(0)
  })

  // A part that is not an axis-aligned box carries `outline` — its real silhouette — while `rects`
  // is only the bounding rectangle it is hit-tested by. Drawing `solid` for such a part puts a box
  // around a tilted dowel, which is what this catches. Mutation: render `solid` unconditionally.
  it('draws a non-axis-aligned part as its outline, not as a box', () => {
    const dowel = {
      kind: 'cylinder' as const,
      id: 'board_dowel',
      label: 'Dowel 1',
      diameter: 8,
      length: 40,
      material: '',
      color: '#ca8',
      position: { x: 100, y: 100, z: 100 },
      rotation: { x: 0, y: 30, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: cabinet.id,
      driven: false,
    }
    render(
      <CabinetProjection
        view="Front"
        parts={[dowel]}
        byId={byId}
        cabinet={cabinet}
        materials={PRESET_MATERIALS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )
    const g = screen.getByTestId('projection-part-board_dowel')
    expect(g.querySelectorAll('polygon')).toHaveLength(1)
    expect(g.querySelectorAll('line')).toHaveLength(0)
  })

  it('renders a message rather than throwing for a cabinet that does not build', () => {
    render(
      <CabinetProjection
        view="Front"
        parts={[]}
        byId={byId}
        cabinet={{ ...cabinet, params: { ...cabinet.params, width: 5 } }}
        materials={PRESET_MATERIALS}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(/do not build/i)).toBeTruthy()
    expect(screen.queryAllByTestId(/^projection-part-/)).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/CabinetProjection.test.tsx`
Expected: FAIL — `Failed to resolve import "./CabinetProjection"`.

- [ ] **Step 3: Write `src/ui/CabinetProjection.tsx`**

```tsx
import { buildAssemblyViews, type AssemblyDim, type AssemblyView } from '../geom/assembly'
import { validateCarcaseParams } from '../scene/carcaseRoles'
import { overridesOf, roleThicknessFor } from '../scene/resolveThickness'
import type {
  CarcaseComponent,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
} from '../scene/types'

// One orthographic view of a cabinet, drawn from the projector's unscaled millimetres and fitted to
// whatever size the pane happens to be. The sheet builder reads the same data and scales it
// differently — which is why the projector emits neither a scale nor a page offset.
//
// Unlike SectionElevation this draws text, so label size is a fraction of the view's own extent and
// strokes are non-scaling: a 3 mm label on a 720 mm cabinet would otherwise render at under two
// pixels once the viewBox is fitted to the pane.

const PADDING = 60
// Indexed by `AssemblyDim.ring`, which is 1 or 2 — index 0 is never read and is here so the
// index IS the ring number rather than one less than it.
const DIM_RING = [0, 18, 36]

export function CabinetProjection({
  view,
  parts,
  byId,
  cabinet,
  materials,
  selectedId,
  onSelect,
}: {
  view: 'Front' | 'Top' | 'End'
  parts: Part[]
  byId: Map<ComponentId, Component>
  cabinet: CarcaseComponent
  materials: Record<string, MaterialDef>
  selectedId: PartId | null
  onSelect: (id: PartId) => void
}) {
  const thicknessOf = roleThicknessFor(cabinet.params, materials, overridesOf(parts, cabinet.id))
  const buildable = validateCarcaseParams(cabinet.params, thicknessOf).length === 0

  // Not memoised. `parts`, `byId`, `cabinet` and `materials` are all rebuilt by App on every
  // render, so a useMemo over them would recompute every time anyway while reading as though it
  // did not. A whole-cabinet projection is a few hundred rectangles; measure before adding one.
  const views = buildable ? buildAssemblyViews(parts, byId, cabinet, materials) : null

  if (views === null) {
    return (
      <p className="text-[11px] text-muted-foreground">
        This cabinet’s parameters do not build, so it has no projection to draw.
      </p>
    )
  }

  const v: AssemblyView = views.find((x) => x.label === view)!
  const W = v.bounds.w
  const H = v.bounds.h
  const font = Math.max(W, H) / 45

  // Carcase v runs up and SVG y runs down. Written once, exactly as SectionElevation does it.
  const flip = (y: number, h: number) => H - y - h

  const dimAt = (
    d: AssemblyDim,
  ): { x1: number; y1: number; x2: number; y2: number; tx: number; ty: number } => {
    const off = DIM_RING[d.ring]
    if (d.axis === 'h') {
      const y = d.side === 'below' ? H + off + 8 : -off - 8
      return { x1: d.start, y1: y, x2: d.end, y2: y, tx: (d.start + d.end) / 2, ty: y - 2 }
    }
    const x = d.side === 'right' ? W + off + 8 : -off - 8
    const y1 = flip(d.start, 0)
    const y2 = flip(d.end, 0)
    return { x1: x, y1, x2: x, y2, tx: x + 2, ty: (y1 + y2) / 2 }
  }

  return (
    <svg
      viewBox={`${-PADDING} ${-PADDING} ${W + PADDING * 2} ${H + PADDING * 2}`}
      role="img"
      aria-label={`Cabinet ${view} view`}
      className="w-full h-full max-h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Farthest first so the nearest part paints last and takes the click. */}
      {[...v.parts].reverse().map((part) => {
        const selected = part.partId === selectedId
        return (
          <g
            key={part.partId}
            data-testid={`projection-part-${part.partId}`}
            data-selected={selected}
            onClick={() => onSelect(part.partId)}
            className="cursor-pointer"
          >
            {part.rects.map((r, i) => (
              <rect
                key={i}
                x={r.x}
                y={flip(r.y, r.h)}
                width={r.w}
                height={r.h}
                className={selected ? 'fill-primary/25' : 'fill-transparent hover:fill-accent/40'}
              />
            ))}
            {/* A part that is not an axis-aligned box has `outline` — its real silhouette — while
                its `rects` is only the bounding rectangle it is hit-tested by. Drawing `solid` for
                one would draw a box around a tilted dowel, so the two are alternatives, never
                both. */}
            {part.outline === undefined ? (
              part.solid.map((s, i) => (
                <line
                  key={`s${i}`}
                  x1={s.x1}
                  y1={flip(s.y1, 0)}
                  x2={s.x2}
                  y2={flip(s.y2, 0)}
                  stroke={selected ? 'currentColor' : '#333'}
                  strokeWidth={selected ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              ))
            ) : (
              <polygon
                points={part.outline.map((q) => `${q.x},${flip(q.y, 0)}`).join(' ')}
                fill="none"
                stroke={selected ? 'currentColor' : '#333'}
                strokeWidth={selected ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {part.hidden.map((s, i) => (
              <line
                key={`h${i}`}
                x1={s.x1}
                y1={flip(s.y1, 0)}
                x2={s.x2}
                y2={flip(s.y2, 0)}
                stroke="#999"
                strokeDasharray="4 3"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {part.cutRects.map((c, i) => (
              <rect
                key={`c${i}`}
                x={c.rect.x}
                y={flip(c.rect.y, c.rect.h)}
                width={c.rect.w}
                height={c.rect.h}
                fill="none"
                stroke="#999"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {part.circles.map((c, i) => (
              <circle
                key={`o${i}`}
                cx={c.cx}
                cy={flip(c.cy, 0)}
                r={c.r}
                fill="none"
                stroke="#999"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )
      })}

      {v.dims.map((d, i) => {
        const g = dimAt(d)
        return (
          <g key={i}>
            <line
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
              stroke="#666"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={g.tx}
              y={g.ty}
              fontSize={font}
              fill="#666"
              textAnchor={d.axis === 'h' ? 'middle' : 'start'}
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/CabinetProjection.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/CabinetProjection.tsx src/ui/CabinetProjection.test.tsx
git commit -m "feat(ui): the cabinet projection pane

One orthographic view drawn from the projector's unscaled millimetres, fitted
to the pane. Text is sized as a fraction of the view's own extent and strokes
are non-scaling, because a 3 mm label on a 720 mm cabinet renders at under two
pixels once the viewBox is fitted.

Farthest part painted first so the nearest takes the click, which is the same
order the projector already sorts by.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 9: the open cabinet comes from the selection's ancestry

**Files:**

- Modify: `src/App.tsx:82-88`
- Modify: `src/ui/CabinetEditor.tsx`
- Test: `src/ui/CabinetEditor.test.tsx`

`App.tsx:82` reads `selection?.kind !== 'component' ? null : …`, so selecting a **part** nulls
`selectedCarcase`, unmounts `CabinetEditor` and reveals the viewport. Clicking a part in a projection
would destroy the surface it was clicked in. The open cabinet becomes the cabinet _containing_ the
selection.

> **STOP — this task has an unresolved fork. Do not execute it without the answer.**
>
> The rule as drafted has a side effect neither its tests nor `CabinetEditor.test.tsx` can see,
> because they render the editor rather than `App`:
>
> - `App.tsx:461` shows the viewport when `selectedCarcase === null || cabinetTab === '3d'`.
> - Once the ancestry rule lands, clicking a part **inside a cabinet** makes `selectedCarcase`
>   non-null, and `cabinetTab` defaults to `'section'` — so **clicking a part in the 3D viewport
>   replaces the viewport with the Section elevation.**
> - Separately, `cabinetParts` (`App.tsx:114`) returns the whole scene only while
>   `selectedCarcase === null`, so selecting any part silently filters 3D to one cabinet.
>
> Options:
>
> 1. **Narrow the rule to its purpose.** Keep the *currently open* cabinet when the new selection
>    lies inside it; otherwise fall back to today's component-only rule. This is exactly the stated
>    goal — "clicking a part in a projection must not close the projection" — and nothing more.
>    Costs one piece of state (the open cabinet id) or a ref to the previous value.
> 2. **Force `cabinetTab` to `'3d'`** when a part is selected with no cabinet open. Keeps the
>    viewport visible, but moves the tab under the user.
> 3. **Accept it.** Selecting a part anywhere opens its cabinet's editor on the Section tab —
>    the "cabinet is the edit level" model taken literally.
> 4. **Split the two questions.** `openCabinet` (explicit, mounts the editor) and
>    `selectionCabinet` (derived, highlights only). Each answer then serves exactly one consumer.
>
> Whichever is chosen, this task needs a test that renders `App` — the regression is invisible at
> the `CabinetEditor` level, which is why the draft did not see it.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/CabinetEditor.test.tsx`:

```tsx
describe('the projection tabs', () => {
  afterEach(cleanup)

  it.each(['Front', 'Top', 'End'])('renders a projection for %s', (name) => {
    const tab = name.toLowerCase() as CabinetTab
    render(<CabinetEditor {...props({ tab, parts: [] })} />)
    expect(screen.queryByText(/not built yet/i)).toBeNull()
    expect(screen.getByRole('img', { name: new RegExp(`${name} view`, 'i') })).toBeTruthy()
  })
})
```

Add `parts` and `onSelectPart` to `props()` in that file:

```tsx
  parts: [],
  selectedPartId: null,
  onSelectPart: vi.fn(),
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/CabinetEditor.test.tsx`
Expected: FAIL — "not built yet" is still rendered, and there is no `img` role for the view.

- [ ] **Step 3: Wire `CabinetEditor`**

In `src/ui/CabinetEditor.tsx`, add to the props:

```tsx
  parts: Part[]
  byId: Map<ComponentId, Component>
  selectedPartId: PartId | null
  onSelectPart: (id: PartId) => void
```

and replace the `not built yet` branch:

```tsx
          ) : (
            <CabinetProjection
              view={LABELS[tab] as 'Front' | 'Top' | 'End'}
              parts={parts}
              byId={byId}
              cabinet={component}
              materials={materials}
              selectedId={selectedPartId}
              onSelect={onSelectPart}
            />
          )}
```

- [ ] **Step 4: Change the selection derivation in `src/App.tsx`**

Replace lines 82–88:

```tsx
// The cabinet CONTAINING the selection, not only a selected cabinet. Selecting a part used to
// null this, which unmounted the editor and revealed the viewport — so clicking a part inside a
// projection destroyed the surface it was clicked in. Deriving it from the ancestry means the
// scene tree and the projection cannot disagree about which cabinet is open, and it costs no new
// state to keep in step.
const selectedCarcase = useMemo(() => {
  if (selection === null) return null
  if (selection.kind === 'component') {
    const c = scene.components.find((x) => x.id === selection.id)
    if (c?.kind === 'carcase') return c
  }
  const node =
    selection.kind === 'part'
      ? scene.parts.find((p) => p.id === selection.id)
      : scene.components.find((c) => c.id === selection.id)
  if (node === undefined) return null
  for (const ancestor of ancestorsOf(node, componentMap)) {
    if (ancestor.kind === 'carcase') return ancestor
  }
  return null
}, [selection, scene.components, scene.parts, componentMap])
```

Add `ancestorsOf` to the `componentTree` import on line 7, and pass the new props to
`<CabinetEditor>`:

```tsx
            parts={cabinetParts}
            byId={componentMap}
            selectedPartId={selection?.kind === 'part' ? selection.id : null}
            onSelectPart={(id) => onSelect({ kind: 'part', id })}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/ui/CabinetEditor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/App.tsx src/ui/CabinetEditor.tsx src/ui/CabinetEditor.test.tsx
git commit -m "feat(ui): the open cabinet is the one containing the selection

Selecting a part used to null selectedCarcase, unmounting the editor and
revealing the viewport — so clicking a part in a projection would have
destroyed the surface it was clicked in. The open cabinet now comes from the
selection's ancestry, which costs no new state and means the scene tree and
the projection cannot disagree about which cabinet is open.

Front, Top and End render the projection instead of saying they are not built.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 10: the elevation and the panel read real overrides

**Files:**

- Modify: `src/ui/SectionElevation.tsx:29`
- Modify: `src/ui/CarcasePanel.tsx:70`
- Modify: `src/ui/CabinetEditor.tsx`, `src/ui/sidebar.tsx`, `src/App.tsx` (thread `parts` through)
- Test: `src/ui/SectionElevation.test.tsx`

Both pass `new Map()` today, so a cabinet with a 25 mm side draws openings its boards do not have.
The projector already reads real overrides (Task 5); leaving these two wrong would make the Section
tab and the Front tab disagree about the same cabinet, which is worse than one wrong tab.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/SectionElevation.test.tsx`:

```tsx
// A 25 mm left side beside an 18 mm right one makes the clear opening 600 - 25 - 18 = 557. Drawn
// from an empty override map it reads 564, and the elevation shows an opening the boards do not
// have.
it('draws the opening the overrides actually produce', () => {
  const p = { ...base, carcaseMaterial: 'Ply 18mm' }
  const parts = [
    {
      kind: 'board' as const,
      id: 'board_1',
      label: 'Left Side',
      length: 560,
      width: 720,
      thickness: 25,
      grain: 'length' as const,
      material: 'Ply 18mm',
      color: '#888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: 'cmp_1',
      driven: true,
      role: 'left-side',
      overrides: { thickness: 25 },
    },
  ]
  render(
    <SectionElevation
      params={p}
      materials={PRESET_MATERIALS}
      parts={parts}
      componentId="cmp_1"
      selected={null}
      onSelect={vi.fn()}
    />,
  )
  const cell = screen.getAllByTestId(/^section-cell-/)[0]
  expect(Number(cell.getAttribute('width'))).toBeCloseTo(557, 3)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/SectionElevation.test.tsx`
Expected: FAIL — width is 564, and the new props do not exist.

- [ ] **Step 3: Fix both call sites**

`src/ui/SectionElevation.tsx` — add `parts: Part[]` and `componentId: ComponentId` to the props, and
replace line 29:

```tsx
const thicknessOf = roleThicknessFor(params, materials, overridesOf(parts, componentId))
```

`src/ui/CarcasePanel.tsx` — `panelThickness` takes the same two arguments:

```tsx
function panelThickness(
  p: CarcaseParams,
  materials: Record<string, MaterialDef>,
  parts: Part[],
  componentId: ComponentId,
): RoleThickness {
  const resolve = roleThicknessFor(p, materials, overridesOf(parts, componentId))
  return (role) => {
    try {
      return resolve(role)
    } catch {
      return 0
    }
  }
}
```

Thread `parts` from `App` → `Sidebar` → `CarcasePanel`, and `App` → `CabinetEditor` →
`SectionElevation`. `App` already has `cabinetParts`.

`src/scene/__fixtures__/resolve.ts` keeps its empty map: a fixture states its own inputs.

**`parts` is a required prop, so two existing test files stop compiling** — `CarcasePanel.test.tsx`
and `sidebar.test.tsx` both construct `CarcasePanel` without it. Add `parts: []` to their prop
builders. An empty array is the honest value there: neither file is testing overrides, and
`overridesOf([], id)` is an empty map, which is exactly what they resolve with today.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/SectionElevation.test.tsx src/ui/CarcasePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mutation check**

```bash
cp src/ui/SectionElevation.tsx "$SCRATCHPAD"/se-t10.bak
python3 - <<'PY'
p='src/ui/SectionElevation.tsx'; s=open(p).read()
old="overridesOf(parts, componentId)"
new="new Map()"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "new Map()" src/ui/SectionElevation.tsx
```

Run: `pnpm vitest run src/ui/SectionElevation.test.tsx`
Expected: FAIL on _draws the opening the overrides actually produce_.

```bash
cp "$SCRATCHPAD"/se-t10.bak src/ui/SectionElevation.tsx
grep -n "overridesOf(parts, componentId)" src/ui/SectionElevation.tsx
```

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/SectionElevation.tsx src/ui/SectionElevation.test.tsx src/ui/CarcasePanel.tsx src/ui/CabinetEditor.tsx src/ui/sidebar.tsx src/App.tsx
git commit -m "fix(ui): the elevation and the panel read per-part thickness overrides

Both resolved thickness from an empty override map, so a cabinet with a 25 mm
side drew openings 564 wide where its boards make 557. Found while building
the projector, which faces the identical choice: leaving these would have made
the Section tab and the Front tab disagree about the same cabinet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

# Group D — the sheet

## Task 11: the `assembly` sheet variant

**Files:**

- Modify: `src/geom/drawing.ts`
- Test: `src/geom/drawing.test.ts`

Three views **in a row**, not stacked. Measured: stacked puts a Base 600 at 1:20 / 30 × 36 mm —
smaller than its own dimension labels — because `H + D` is 1280 mm against 120 mm of usable height. A
row gives 1:10 / 60 × 72 mm and keeps Front and End aligned horizontally, which is the alignment that
matters for reading heights across two views.

- [ ] **Step 1: Write the failing test**

Append to `src/geom/drawing.test.ts`:

```ts
describe('assembly sheets', () => {
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

  it('inserts one assembly sheet per cabinet, after the cover', () => {
    const sheets = buildDrawingSheets([], 'Job', [
      { cabinet, parts: [], materials: PRESET_MATERIALS },
    ])
    expect(sheets.map((s) => s.kind)).toEqual(['cover', 'assembly'])
  })

  it('leaves the deck alone when there are no cabinets', () => {
    const sheets = buildDrawingSheets([], 'Job')
    expect(sheets.map((s) => s.kind)).toEqual(['cover'])
  })

  it('carries three views, Front End Top, left to right', () => {
    const [, sheet] = buildDrawingSheets([], 'Job', [
      { cabinet, parts: [], materials: PRESET_MATERIALS },
    ])
    if (sheet.kind !== 'assembly') throw new Error('expected an assembly sheet')
    expect(sheet.views.map((v) => v.label)).toEqual(['Front', 'End', 'Top'])
    const xs = sheet.views.map((v) => v.placement.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    // In a row, so every view shares a top edge.
    expect(new Set(sheet.views.map((v) => v.placement.y)).size).toBe(1)
  })

  // Stacked this preset comes out at 1:20 and 30 x 36 mm on the page.
  it('reaches 1:10 for a Base 600 rather than 1:20', () => {
    const [, sheet] = buildDrawingSheets([], 'Job', [
      { cabinet, parts: [], materials: PRESET_MATERIALS },
    ])
    if (sheet.kind !== 'assembly') throw new Error('expected an assembly sheet')
    expect(sheet.scaleLabel).toBe('1:10')
  })

  it('names the sheet after the cabinet', () => {
    const [, sheet] = buildDrawingSheets([], 'Job', [
      { cabinet, parts: [], materials: PRESET_MATERIALS },
    ])
    if (sheet.kind !== 'assembly') throw new Error('expected an assembly sheet')
    expect(sheet.cabinetLabel).toBe('Base 600')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/geom/drawing.test.ts`
Expected: FAIL — `buildDrawingSheets` takes two arguments.

- [ ] **Step 3: Implement in `src/geom/drawing.ts`**

```ts
import { buildAssemblyViews, type AssemblyView } from './assembly'
import type { CarcaseComponent, Component, ComponentId, MaterialDef } from '../scene/types'

export interface CabinetSheetInput {
  cabinet: CarcaseComponent
  parts: Part[]
  materials: Record<string, MaterialDef>
  byId?: Map<ComponentId, Component>
}
```

Add the variant to the `DrawingSheet` union:

```ts
  | {
      kind: 'assembly'
      cabinetLabel: string
      date: string
      scaleLabel: string
      scale: number
      views: [PlacedAssemblyView, PlacedAssemblyView, PlacedAssemblyView]
    }

export interface PlacedAssemblyView extends AssemblyView {
  placement: Point2D
}
```

And the scale selector plus the builder:

```ts
// selectScale is board-shaped: it assumes the third dimension is a thickness. A cabinet's is
// 560 mm, and stacking Front over Top costs H + D against 120 mm of usable height — which puts a
// Base 600 at 1:20 and 30 x 36 mm on the page. Three views in a ROW is bound by width instead and
// reaches 1:10.
function selectAssemblyScale(W: number, H: number, D: number): number {
  const raw = Math.min((AREA_W - 2 * GAP) / (W + D + W), AREA_H / Math.max(H, D))
  return STANDARD_SCALES.find((s) => s <= raw) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

function buildAssemblySheet(input: CabinetSheetInput, date: string): DrawingSheet {
  const p = input.cabinet.params
  const byId = input.byId ?? new Map<ComponentId, Component>([[input.cabinet.id, input.cabinet]])
  const [front, top, end] = buildAssemblyViews(input.parts, byId, input.cabinet, input.materials)
  const scale = selectAssemblyScale(p.width, p.height, p.depth)

  // Front, End, Top left to right — Front and End share a top edge, so heights read straight
  // across between them.
  const y = MARGIN
  const x0 = MARGIN
  const x1 = x0 + front.bounds.w * scale + GAP
  const x2 = x1 + end.bounds.w * scale + GAP

  return {
    kind: 'assembly',
    cabinetLabel: input.cabinet.label,
    date,
    scale,
    scaleLabel: toScaleLabel(scale),
    views: [
      { ...front, placement: { x: x0, y } },
      { ...end, placement: { x: x1, y } },
      { ...top, placement: { x: x2, y } },
    ],
  }
}
```

Widen the entry point — **optional**, because there are 52 existing call sites across five test files
plus `App.tsx` all passing two arguments, and a required parameter would spend a commit on churn:

```ts
export function buildDrawingSheets(
  parts: Part[],
  projectName: string,
  cabinets: CabinetSheetInput[] = [],
): DrawingSheet[] {
  // …existing cover + partSheets…
  return [cover, ...cabinets.map((c) => buildAssemblySheet(c, date)), ...partSheets]
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/geom/drawing.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation check — the row layout**

```bash
cp src/geom/drawing.ts "$SCRATCHPAD"/drawing-t11.bak
python3 - <<'PY'
p='src/geom/drawing.ts'; s=open(p).read()
old="  const raw = Math.min((AREA_W - 2 * GAP) / (W + D + W), AREA_H / Math.max(H, D))"
new="  const raw = Math.min((AREA_W - GAP) / (W + D), (AREA_H - GAP) / (H + D))"
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
PY
grep -n "AREA_H - GAP" src/geom/drawing.ts
```

Run: `pnpm vitest run src/geom/drawing.test.ts`
Expected: FAIL on _reaches 1:10 for a Base 600 rather than 1:20_.

```bash
cp "$SCRATCHPAD"/drawing-t11.bak src/geom/drawing.ts
grep -n "W + D + W" src/geom/drawing.ts
```

- [ ] **Step 6: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/geom/drawing.ts src/geom/drawing.test.ts
git commit -m "feat(geom): an assembly sheet variant, three views in a row

selectScale is board-shaped and assumes the third dimension is a thickness; a
cabinet's is 560 mm. Stacked, a Base 600 assembly drawing comes out at 1:20
and 30 x 36 mm, smaller than its own dimension labels. In a row it reaches
1:10 at 60 x 72, and Front and End still share a top edge so heights read
straight across.

buildDrawingSheets takes the cabinets as an optional third argument: 52 call
sites pass two, and a required parameter would spend a commit on churn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 12: `buildSvg` renders an assembly sheet

**Files:**

- Modify: `src/ui/buildSvg.ts:365`
- Test: `src/ui/buildSvg.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('renders an assembly sheet with its three views and its dimensions', () => {
  const [, sheet] = buildDrawingSheets([], 'Job', [
    { cabinet, parts: [], materials: PRESET_MATERIALS },
  ])
  const svg = buildSvg(sheet)
  expect(svg).toContain('<svg')
  expect(svg).toContain('Base 600')
  expect(svg).toContain('1:10')
  // The overall width of the cabinet, dimensioned on the Front view.
  expect(svg).toContain('>600<')
})

it('dashes an assembly sheet’s hidden edges', () => {
  const [, sheet] = buildDrawingSheets([], 'Job', [
    { cabinet, parts: partsOfBase600(), materials: PRESET_MATERIALS },
  ])
  expect(buildSvg(sheet)).toContain('stroke-dasharray')
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/buildSvg.test.ts`
Expected: FAIL — the dispatch falls into the board branch and reads `sheet.views` as `DrawingView[]`.

- [ ] **Step 3: Implement**

Add to `src/ui/buildSvg.ts`:

```ts
function renderAssemblyView(view: PlacedAssemblyView, scale: number): string {
  const out: string[] = []
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  // Carcase v runs up and SVG y runs down; the flip is written once, here, exactly as the pane
  // writes it once in CabinetProjection.
  const fy = (v: number) => py + (H - v) * scale

  for (const part of [...view.parts].reverse()) {
    for (const s of part.solid) {
      out.push(
        svgLine(px + s.x1 * scale, fy(s.y1), px + s.x2 * scale, fy(s.y2), {
          stroke: '#000',
          'stroke-width': '0.3',
        }),
      )
    }
    for (const s of part.hidden) {
      out.push(
        svgLine(px + s.x1 * scale, fy(s.y1), px + s.x2 * scale, fy(s.y2), {
          stroke: '#888',
          'stroke-width': '0.2',
          'stroke-dasharray': '1.5 1',
        }),
      )
    }
    for (const c of part.cutRects) {
      out.push(
        svgRect(
          px + c.rect.x * scale,
          fy(c.rect.y + c.rect.h),
          c.rect.w * scale,
          c.rect.h * scale,
          {
            fill: 'none',
            stroke: '#888',
            'stroke-width': '0.2',
            'stroke-dasharray': '1.5 1',
          },
        ),
      )
    }
    for (const o of part.circles) {
      out.push(
        `<circle cx="${px + o.cx * scale}" cy="${fy(o.cy)}" r="${o.r * scale}" fill="none" stroke="#888" stroke-width="0.15" stroke-dasharray="0.8 0.8"/>`,
      )
    }
  }

  // The projector emits side + ring, never a page offset: renderDimLine reads `offset` in sheet
  // millimetres while start/end are already scaled, so only a consumer that knows the scale can
  // convert. This is that consumer.
  const RING = [0, 8, 16]
  for (const d of view.dims) {
    const off = RING[d.ring]
    const line: DimLine =
      d.axis === 'h'
        ? {
            axis: 'h',
            start: d.start * scale,
            end: d.end * scale,
            offset: d.side === 'below' ? view.bounds.h * scale + off : -off,
            label: d.label,
          }
        : {
            axis: 'v',
            start: (H - d.end) * scale,
            end: (H - d.start) * scale,
            offset: d.side === 'right' ? view.bounds.w * scale + off : -off,
            label: d.label,
          }
    out.push(renderDimLine(line, px, py))
  }

  return out.join('')
}

function renderAssemblyTitleBlock(sheet: Extract<DrawingSheet, { kind: 'assembly' }>): string {
  const tbY = SHEET_H - MARGIN - TITLE_H
  const tbX = MARGIN
  return [
    svgRect(tbX, tbY, 297 - 2 * MARGIN, TITLE_H, {
      stroke: '#000',
      fill: 'none',
      'stroke-width': '0.3',
    }),
    svgText(tbX + 4, tbY + 8, sheet.cabinetLabel, {
      'font-size': '7',
      'font-weight': 'bold',
      fill: '#000',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 4, tbY + 16, 'Assembly', {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 8, `Scale: ${sheet.scaleLabel}`, {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 16, `Date: ${sheet.date}`, {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
  ].join('')
}
```

and the branch at line 365:

```ts
  if (sheet.kind === 'cover') {
    body = renderCoverSheet(sheet)
  } else if (sheet.kind === 'assembly') {
    body =
      sheet.views.map((v) => renderAssemblyView(v, sheet.scale)).join('') +
      renderAssemblyTitleBlock(sheet)
  } else if (sheet.shape === 'dowel') {
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/buildSvg.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/buildSvg.ts src/ui/buildSvg.test.ts
git commit -m "feat(ui): SVG for an assembly sheet

Solid edges, dashed hidden edges and dashed machining, plus the dimension
lines. The projector emits a side and a ring rather than a page offset,
because renderDimLine reads offset in sheet millimetres while start and end
are already scaled — so the conversion belongs to whichever consumer knows the
scale, and this is that consumer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 13: `buildDxf` and `buildPdf` learn the variant

**Files:**

- Modify: `src/ui/buildDxf.ts:331`, `src/ui/buildPdf.ts:360`
- Test: `src/ui/buildDxf.test.ts`, `src/ui/buildPdf.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/ui/buildDxf.test.ts`:

```ts
it('emits LINE entities for an assembly sheet', () => {
  const [, sheet] = buildDrawingSheets([], 'Job', [
    { cabinet, parts: partsOfBase600(), materials: PRESET_MATERIALS },
  ])
  const dxf = buildDxf(sheet)
  expect(dxf).toContain('SECTION')
  expect(dxf).toContain('LINE')
  expect(dxf.split('LINE').length - 1).toBeGreaterThan(4)
})
```

`src/ui/buildPdf.test.ts`:

```ts
it('renders an assembly sheet as one landscape page', async () => {
  const sheets = buildDrawingSheets([], 'Job', [
    { cabinet, parts: partsOfBase600(), materials: PRESET_MATERIALS },
  ])
  const bytes = await buildPdf(sheets)
  expect(bytes.byteLength).toBeGreaterThan(1000)
  const doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount()).toBe(sheets.length)
  const [w, h] = [doc.getPage(1).getWidth(), doc.getPage(1).getHeight()]
  expect(w).toBeGreaterThan(h)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/buildDxf.test.ts src/ui/buildPdf.test.ts`
Expected: FAIL — both dispatches fall through to the board branch.

- [ ] **Step 3: Implement**

`src/ui/buildDxf.ts` — add before the cover branch:

```ts
if (sheet.kind === 'assembly') {
  const out: string[] = [dxfHeader()]
  for (const view of sheet.views) {
    const H = view.bounds.h
    const fy = (v: number) => 210 - (view.placement.y + (H - v) * sheet.scale)
    for (const part of view.parts) {
      // DXF has no dash style here, so hidden edges go on their own layer and the CAD tool
      // styles them. A solid line for a hidden edge would be a lie the file cannot undo.
      for (const s of part.solid) {
        out.push(
          dxfLine(
            view.placement.x + s.x1 * sheet.scale,
            fy(s.y1),
            view.placement.x + s.x2 * sheet.scale,
            fy(s.y2),
            'OUTLINE',
          ),
        )
      }
      for (const s of part.hidden) {
        out.push(
          dxfLine(
            view.placement.x + s.x1 * sheet.scale,
            fy(s.y1),
            view.placement.x + s.x2 * sheet.scale,
            fy(s.y2),
            'HIDDEN',
          ),
        )
      }
    }
  }
  out.push(dxfFooter())
  return out.join('\n')
}
```

`src/ui/buildPdf.ts` — add before the cover branch, reusing the module's existing `pt` / `yflip` /
`C_BLACK` / `C_GRAY` helpers and `page.drawLine`:

```ts
if (sheet.kind === 'assembly') {
  for (const view of sheet.views) {
    const H = view.bounds.h
    const fy = (v: number) => yflip(view.placement.y + (H - v) * sheet.scale)
    for (const part of [...view.parts].reverse()) {
      for (const s of part.solid) {
        page.drawLine({
          start: { x: pt(view.placement.x + s.x1 * sheet.scale), y: fy(s.y1) },
          end: { x: pt(view.placement.x + s.x2 * sheet.scale), y: fy(s.y2) },
          thickness: 0.8,
          color: C_BLACK,
        })
      }
      for (const s of part.hidden) {
        page.drawLine({
          start: { x: pt(view.placement.x + s.x1 * sheet.scale), y: fy(s.y1) },
          end: { x: pt(view.placement.x + s.x2 * sheet.scale), y: fy(s.y2) },
          thickness: 0.5,
          color: C_GRAY,
          dashArray: [3, 2],
        })
      }
    }
    for (const d of view.dims) drawAssemblyDim(page, font, view, d, sheet.scale)
  }
  continue
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/buildDxf.test.ts src/ui/buildPdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/buildDxf.ts src/ui/buildDxf.test.ts src/ui/buildPdf.ts src/ui/buildPdf.test.ts
git commit -m "feat(ui): DXF and PDF for an assembly sheet

Hidden edges go on their own DXF layer rather than being drawn solid — the
format has no dash style at this level, and a solid line for a hidden edge is
a lie the file cannot undo. The PDF dashes them directly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 14: both export paths

**Files:**

- Create: `src/ui/sheetFilename.ts`
- Modify: `src/ui/DrawingViewer.tsx`, `src/ui/CabinetEditor.tsx`, `src/App.tsx`
- Test: `src/ui/DrawingViewer.test.tsx`, `src/ui/CabinetEditor.test.tsx`

`DrawingViewer`'s label is `Part ${idx} of ${sheets.length - 1}`, which assumes sheet 0 is the cover
and every other sheet is a part. Assembly sheets in between make that lie.

- [ ] **Step 1: Write the failing tests**

`src/ui/DrawingViewer.test.tsx`:

```tsx
it('names an assembly sheet as an assembly, not as a part', async () => {
  const sheets = buildDrawingSheets([makeBoard()], 'Job', [
    { cabinet, parts: [], materials: PRESET_MATERIALS },
  ])
  render(<DrawingViewer open onClose={vi.fn()} sheets={sheets} projectName="Job" />)
  await userEvent.click(screen.getByLabelText('→'))
  expect(screen.getByText(/Assembly — Base 600/)).toBeTruthy()
})

it('still numbers the part sheets from one', async () => {
  const sheets = buildDrawingSheets([makeBoard()], 'Job', [
    { cabinet, parts: [], materials: PRESET_MATERIALS },
  ])
  render(<DrawingViewer open onClose={vi.fn()} sheets={sheets} projectName="Job" />)
  await userEvent.click(screen.getByLabelText('→'))
  await userEvent.click(screen.getByLabelText('→'))
  expect(screen.getByText(/Part 1 of 1/)).toBeTruthy()
})
```

`src/ui/CabinetEditor.test.tsx`:

```tsx
it('offers SVG and DXF export from a projection tab', () => {
  render(<CabinetEditor {...props({ tab: 'front' })} />)
  expect(screen.getByRole('button', { name: 'SVG' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'DXF' })).toBeTruthy()
})

it('offers no export from the Section tab, which is not a drawing', () => {
  render(<CabinetEditor {...props({ tab: 'section' })} />)
  expect(screen.queryByRole('button', { name: 'SVG' })).toBeNull()
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run src/ui/DrawingViewer.test.tsx src/ui/CabinetEditor.test.tsx`
Expected: FAIL on all four.

- [ ] **Step 3: Implement**

Create `src/ui/sheetFilename.ts`:

```ts
import type { DrawingSheet } from '../geom/drawing'

// Lifted out of DrawingViewer so the cabinet editor's own export buttons name their files the same
// way. An assembly sheet has no partLabel, so it is named after its cabinet.
export function sheetFilename(sheet: DrawingSheet, projectName: string, ext: string): string {
  const base =
    sheet.kind === 'cover'
      ? `${projectName}-cover`
      : sheet.kind === 'assembly'
        ? `${projectName}-${sheet.cabinetLabel}-assembly`
        : `${projectName}-${sheet.partLabel}`
  return base.toLowerCase().replace(/\s+/g, '-') + '.' + ext
}
```

In `src/ui/DrawingViewer.tsx`, delete the local `sheetFilename`, import the shared one, and derive
the label from the sheet's own kind rather than from its index:

```tsx
const partSheets = sheets.filter((s) => s.kind === 'part')
const sheetLabel =
  sheet.kind === 'cover'
    ? 'Cover'
    : sheet.kind === 'assembly'
      ? `Assembly — ${sheet.cabinetLabel}`
      : `Part ${partSheets.indexOf(sheet) + 1} of ${partSheets.length} — ${sheet.partLabel}`
```

In `src/ui/CabinetEditor.tsx`, add the two buttons on a projection tab only, building the sheet from
the same projector the pane reads:

```tsx
{
  tab !== '3d' && tab !== 'section' && (
    <div className="flex gap-2 px-3 pb-2">
      <Button variant="outline" size="sm" onClick={() => exportSheet('svg')}>
        SVG
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportSheet('dxf')}>
        DXF
      </Button>
    </div>
  )
}
```

with

```tsx
// The same sheet object the drawings modal would show, so the two export paths cannot produce
// different files for the same cabinet.
const exportSheet = (ext: 'svg' | 'dxf') => {
  const [, sheet] = buildDrawingSheets([], projectName, [
    { cabinet: component, parts, materials, byId },
  ])
  downloadBlob(
    ext === 'svg' ? buildSvg(sheet) : buildDxf(sheet),
    sheetFilename(sheet, projectName, ext),
    ext === 'svg' ? 'image/svg+xml' : 'application/dxf',
  )
}
```

Pass `projectName` into `CabinetEditor` from `App`, and give `App`'s `handleOpenDrawings` the
cabinets:

```tsx
setDrawingSheets(
  buildDrawingSheets(
    visibleParts,
    projectName,
    carcases.map((cabinet) => ({
      cabinet,
      parts: scene.parts.filter((p) =>
        descendantIds(cabinet.id, scene.components, scene.parts).partIds.includes(p.id),
      ),
      materials: effectiveMaterials,
      byId: componentMap,
    })),
  ),
)
```

where `carcases` is `scene.components.filter((c) => c.kind === 'carcase')`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/ui/DrawingViewer.test.tsx src/ui/CabinetEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/ui/sheetFilename.ts src/ui/DrawingViewer.tsx src/ui/DrawingViewer.test.tsx src/ui/CabinetEditor.tsx src/ui/CabinetEditor.test.tsx src/App.tsx
git commit -m "feat(ui): export an assembly sheet from the deck and from the tab

sheetFilename moves out of DrawingViewer so both paths name files the same
way, and the viewer's sheet label is derived from the sheet's own kind — the
old 'Part N of len-1' assumed sheet 0 was the cover and everything else was a
part, which assembly sheets make untrue.

Both paths build the same sheet object, so they cannot produce different files
for the same cabinet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

# Group E — close the stage

## Task 15: the e2e

**Files:**

- Modify: `e2e/carcase.spec.ts`

- [ ] **Step 1: Write the tests**

Append to `e2e/carcase.spec.ts`:

```ts
// The regression the selection change exists to prevent. Before it, selecting a part nulled
// `selectedCarcase`, which unmounted the editor and revealed the viewport — so a click in a
// projection destroyed the surface it was clicked in. A unit test cannot see that; only the
// rendered tab can.
test('clicking a part in the Front view selects it without closing the editor', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  await page.getByRole('tab', { name: 'Front' }).click()
  const shapes = page.locator('[data-testid^="projection-part-"]')
  await expect(shapes.first()).toBeVisible()

  await shapes.first().click()

  // Still on Front, and the sidebar now shows a part rather than the carcase parameters.
  await expect(page.getByRole('tab', { name: 'Front' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('L', { exact: true }).first()).toBeVisible()
})

// The End view is a section. Without the cull it is one solid rectangle with everything dashed
// behind it — six of seven parts completely hidden on a Base 600.
test('the End view shows more than one part', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('tab', { name: 'End' }).click()

  await expect(page.locator('[data-testid^="projection-part-"]').first()).toBeVisible()
  expect(await page.locator('[data-testid^="projection-part-"]').count()).toBeGreaterThan(1)
})

// The assembly sheet reaches the deck, and the viewer names it correctly.
test('the drawings deck carries an assembly sheet for the cabinet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.getByRole('button', { name: /2D/ }).click()
  await page.getByLabel('→').click()
  await expect(page.getByText(/Assembly — Base 600/)).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e**

Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test e2e/carcase.spec.ts`
Expected: PASS, 9 tests (6 existing + 3 new).

If the "2D" button name does not match, read the label from `src/ui/FileMenu.tsx` and use the real
one — do not loosen the assertion to a substring that could match two buttons.

- [ ] **Step 3: Run the whole e2e suite**

Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`
Expected: 23 passed (20 existing + 3 new).

- [ ] **Step 4: Commit**

```bash
git add e2e/carcase.spec.ts
git commit -m "test(e2e): a projection click keeps the editor open, and End is a section

The first is the regression the selection change exists to prevent: selecting
a part used to unmount the cabinet editor, so a click in a projection
destroyed the surface it was clicked in. The second pins the cull — without
it the End view is one rectangle with six of seven parts dashed behind it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
```

---

## Task 16: documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `project-structure.html`
- Modify: `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`

- [ ] **Step 1: `CLAUDE.md` — the file tree**

Add under `src/geom/`:

```
│   ├── hiddenLine.ts    Span + subtractIntervals + EPS — the occlusion rule, stated once.
│   │                    Visible edges, then its own complement for the dashed ones
│   ├── assembly.ts      buildAssemblyViews(parts, byId, cabinet, materials) → three
│   │                    orthographic views in unscaled mm: silhouettes, hidden edges,
│   │                    the near-half cull, dimension chains
```

and under `src/ui/`:

```
│   ├── CabinetProjection.tsx  One orthographic view, fitted to the pane. Reads the same
│   │                    AssemblyView the assembly sheet does
│   ├── sheetFilename.ts  Names a drawing file; shared by the deck and the tab
```

- [ ] **Step 2: `CLAUDE.md` — four invariants**

```markdown
- **A cabinet projection is one pure function with two consumers.** `buildAssemblyViews` returns
  **unscaled millimetres**; the pane fits them to itself and the sheet picks a standard scale. A
  projector that scaled would need a page size the pane does not have at render time. `drawing.ts`
  stays a sheet builder in _board_ axes — the parent spec's instruction to generalise
  `buildDrawingSheet` was written before anyone read it, and merging the two would put an
  `if (kind === 'assembly')` through the middle of a module that does one thing.
- **Hidden-line removal here is interval subtraction, not polygon clipping.** Every generated panel
  is an axis-aligned box in the cabinet's frame, so an occluder covers a contiguous run of an edge.
  `subtractIntervals` answers both halves — `visible`, then its own complement for `hidden` — and a
  part is an occluder only if its eight **corners** say it is a box. Never read that off `rotation`:
  a board turned 180° is still axis-aligned, and a `rotation === 0` test silently exempts it.
- **Top and End are sections; Front is not.** Pure HLR of a closed box is one solid rectangle — six
  of seven parts are completely hidden in a Base 600's End view. So Top and End cull everything
  entirely nearer than the parameter midpoint, and a part crossing the plane is drawn whole. Front
  is never culled: an elevation that dropped its door would be useless. The cull lives in the
  projector, so the pane and the printed sheet cannot disagree about which parts exist.
- **A cut is through _per view_, never once per cut.** The toe-kick notch clears the side's whole
  thickness in End — the silhouette becomes an L — but has material behind it in Front, where the
  full rectangle is correct. Cuts are also built oversize on purpose (`position.z = −T/2`,
  `size.z = 2T`) so OCCT resolves them without a coplanar face, so a cut rectangle is clipped to its
  part on the way in.
```

Also correct the existing G1 wording where `CabinetEditor` "renders nothing but a not-built-yet
message" for Front/Top/End.

- [ ] **Step 3: the architecture page**

```bash
node scripts/update-structure-html.mjs
```

Then update by hand: the `src/geom/` and `src/ui/` tables, a Features row for the projections, and
the test/e2e counts sentence at `project-structure.html:1270`. Move the roadmap row _Front / Top /
End projections in the cabinet editor_ from **Next** to **Done**, and put G3 (the scene tree
mirroring the section tree) in its place.

- [ ] **Step 4: notes**

Append to `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`:

```markdown
### 2026-08-30 — Stage G2: correct hidden-line output is a useless drawing

The design was approved with hidden-line removal and would have shipped a tab nobody would open.
Pure HLR of a closed box is one solid rectangle: measured on a Base 600's End view, **six of seven
parts are completely hidden by `left-side`**. The Front view is fine — the door is solid, the toe
kick shows below it, slivers of both sides show past its edges — because a front elevation looks at
a face that is mostly door. The defect is specific to the two views that look at a closed face.

The fix is the standard drafting one: Top and End are sections. A cut plane at the parameter
midpoint, parts entirely nearer omitted, parts crossing drawn whole — so no partial-cutting geometry
is needed and everything crossing the plane is what you want to read anyway. Front is deliberately
exempt. That asymmetry is the point: a front elevation is a view, a plan and an end are sections.

Worth recording that this was found by _running the numbers_, not by reasoning. The design read
correctly at every step.

### 2026-08-30 — the same cut is through in one view and internal in another

The toe-kick notch is a `BoxCut` on the side panels, not a change to any box, and it is the stage's
best test:

- **End** (depth = x): the notch clears the side's whole thickness → through → the silhouette
  becomes an L and the side stops occluding through the recess.
- **Front** (depth = y): the notch spans `y ∈ [0, setback]` against a side spanning `y ∈ [0, D]`, so
  there is material behind it → not through → the full rectangle is correct.

Any implementation that classifies a cut once gets one of these wrong, and the naive intuition
("the notch is a hole, so draw a hole") gets Front wrong. It also has to be **clipped**: cuts are
built oversize on purpose (`position.z = −T/2`, `size.z = 2T`) so OCCT resolves a through-cut
without a coplanar face, which unclipped is a dashed box 9 mm past an 18 mm panel on both sides.

### 2026-08-30 — three views stacked is a 30 mm drawing

`selectScale` is board-shaped: it assumes the third dimension is a thickness. A cabinet's is 560 mm,
and `buildBoardSheet`'s stacked arrangement costs `H + D` against 120 mm of usable height. Measured:
```

              stacked          in a row

Base 600 1:20 30x36 mm 1:10 60x72 mm
Wall 600 1:10 60x72 mm 1:10 60x72 mm
Tall 600 1:20 30x105 mm 1:20 30x105 mm

```

A Base 600 stacked is smaller than its own dimension labels. Three in a row is width-bound instead
and doubles the commonest preset; Front and End still share a top edge, so heights read straight
across. A *fitted* non-standard scale was rejected on the numbers — 1:10.7 at 56 × 68 is worse than
the row layout's rounded 1:10 at 60 × 72.

### 2026-08-30 — two defects found next door

- **Selecting a part unmounted the cabinet editor.** `App.tsx` derived `selectedCarcase` only from
  a *component* selection, so clicking a part in a projection would have destroyed the surface it
  was clicked in. Now derived from the selection's ancestry, which costs no new state.
- **The elevation ignored thickness overrides.** `SectionElevation.tsx` and `CarcasePanel.tsx` both
  passed an empty map to `roleThicknessFor`, so a cabinet with a 25 mm side drew 564 mm openings
  where its boards make 557. Pre-existing since Stage B; fixed here because the projector faces the
  identical choice and two tabs disagreeing about one cabinet is worse than one wrong tab.

### 2026-08-30 — Stage G2 closed

- Twelve mutations, each with a predicted victim. Two needed an **x-asymmetric** fixture to
  separate: "never cull" and "cull the far half" look identical when both sides are 18 mm.
- Still owed, unchanged from Stage F: a woodworker's eye on the hardware figures, and now also on
  the opening-chain convention (openings listed, not summing to the overall).
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Run: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test`

```bash
git add CLAUDE.md project-structure.html docs/
git commit -m "docs: close Stage G2 — cabinet projections

CLAUDE.md gains hiddenLine.ts, assembly.ts, CabinetProjection.tsx and
sheetFilename.ts plus four invariants: one projector with two consumers,
occlusion as interval subtraction with axis-alignment read off the corners,
Top and End as sections while Front is not, and a cut classified per view.

Notes record that correct hidden-line output is a useless drawing, that the
same cut is through in one view and internal in another, and the two defects
found next door.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hrvw5zNsyymkFSh8gmtGVs"
git push -u origin claude/next-step-suggestion-latrhv
```

---

## Acceptance

- [ ] Front, Top and End draw the cabinet, dimensioned, with hidden edges dashed
- [ ] The End view shows more than one part — the cull works
- [ ] Front shows its door — the cull does **not** apply there
- [ ] Clicking a part selects it, opens its properties, and **leaves the tab open**
- [ ] The toe-kick notch is an L in End and a dashed rectangle in Front
- [ ] A cut rectangle never extends past its own part
- [ ] The opening chain reads 557 for a 25 mm side, in the projector _and_ in the elevation
- [ ] An assembly sheet reaches the deck, prints, and exports as SVG, DXF and PDF
- [ ] The same sheet exports from the tab's own buttons with the same filename
- [ ] A Base 600 assembly sheet is at 1:10
- [ ] All twelve mutations were run and reported

## What this stage deliberately does not do

- **No per-part dimensions.** Twenty chains on a tall unit is unreadable; per-part sizes have a sheet
  each already.
- **No user-positioned cut plane, and nothing drawn cut.** A part crossing the plane is drawn whole.
- **No exploded or isometric view.** A different projector.
- **No scene-wide assembly sheet.** One per cabinet.
- **No dimension editing from the drawing.** Sizes are typed in the panel.
