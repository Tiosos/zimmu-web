# Dimensioned Wall Elevations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plain Room-panel wall elevation into a dimensioned drawing that is also an exportable deck sheet (SVG, DXF, PDF), both fed by one pure function.

**Architecture:** A new pure builder `src/geom/wallElevation.ts` wraps the existing `wallElevation()` span logic and adds `AssemblyDim` dimension chains and wall-length provenance, in unscaled millimetres. `drawing.ts` gains an `'elevation'` sheet kind that picks a scale and places the view; each renderer draws it through the existing `assemblyDimLine`. The Room panel embeds `buildSvg(sheet)` of the same sheet, so panel and export cannot disagree.

**Tech Stack:** TypeScript strict, React 19, Vitest + happy-dom, pdf-lib. No scene-data, file-format or IndexedDB change.

**Spec:** `docs/superpowers/specs/2026-09-30-wall-elevations-design.md`. **Notes:** `docs/superpowers/notes/2026-09-30-wall-elevations-notes.md`.

**Spec refinements decided while planning** (record in the notes file in Task 8):

- `wallElevation()` stays in `roomAssessment.ts` as the span source, and the new builder calls it. The spec said it moves; keeping it is the surgical choice and changes no behaviour. `ElevationSpan` gains a `kind: 'opening' | 'cabinet'`.
- `STANDARD_SCALES` stops at 1:20, so a 4 m wall would already overflow. The elevation sheet uses its own list, `[...STANDARD_SCALES, 0.02, 0.01, 0.005]`, leaving board and assembly sheets untouched.
- A span hanging past a wall end widens `bounds`; `originX` says where the wall start sits in view space (0 in the normal case).
- The ring width is sized from the **vertical** labels only. The long horizontal provenance label would otherwise reserve about 50 mm a side for nothing.
- Vertical dimensions: cabinet heights on the left, opening sill/height on the right. A dimension that would overlap one already on ring 1 goes to ring 2. Identical dimensions are emitted once.
- The Room panel needs `roomName` and `projectName` props. `ProjectPanel` (its only caller) passes them.

**Commands used throughout:** `pnpm vitest run <file>`, then before each commit `pnpm typecheck && pnpm lint && pnpm test` (Task 8 runs the full set; intermediate commits run the touched test files plus `pnpm typecheck`).

---

## File structure

| File | Responsibility |
|---|---|
| `src/scene/roomAssessment.ts` (modify) | `ElevationSpan` gains `kind`; `wallElevation` sets it |
| `src/geom/wallElevation.ts` (create) | `buildWallElevation`, `lengthLabel`, `WallElevationView`: spans + dims + provenance, unscaled mm |
| `src/geom/wallElevation.test.ts` (create) | Pure-builder tests |
| `src/geom/__fixtures__/wallElevation.ts` (create) | Shared kitchen-wall fixture for every test below |
| `src/geom/drawing.ts` (modify) | `'elevation'` sheet kind, ring, scale, `buildWallElevationSheet(s)`, `buildDrawingSheets` 6th param |
| `src/geom/drawing.test.ts` (modify) | Sheet layout tests |
| `src/ui/sheetFilename.ts` (modify) | Name an elevation file |
| `src/ui/buildSvg.ts`, `buildDxf.ts`, `buildPdf.ts` (modify) | `'elevation'` case each |
| `src/ui/buildSvg.test.ts`, `buildDxf.test.ts`, `buildPdf.test.ts` (modify) | Renderer tests |
| `src/ui/DrawingViewer.tsx` (modify) | Sheet label for an elevation |
| `src/ui/RoomAssessmentPanel.tsx` (+ test) (modify) | Embed the sheet; per-wall SVG/DXF export |
| `src/ui/ProjectPanel.tsx`, `src/App.tsx` (modify) | Pass names; build deck inputs |
| `CLAUDE.md`, notes file (modify) | Architecture entry, invariants, decisions |

---

### Task 1: Shared fixture and `ElevationSpan.kind`

**Files:**
- Create: `src/geom/__fixtures__/wallElevation.ts`
- Modify: `src/scene/roomAssessment.ts:147-162`
- Test: `src/scene/roomAssessment.test.ts` (existing elevation test, extended)

- [ ] **Step 1: Write the fixture**

```ts
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../../scene/carcasePresets'
import { setFrontOn } from '../../scene/sectionInterior'
import {
  emptyRoomGeometry,
  type RoomGeometry,
  type SiteMeasurement,
} from '../../scene/projectStructure'
import type { CarcaseComponent, Scene } from '../../scene/types'

export function wallCabinet(
  id: string,
  x = 0,
  params: Partial<CarcaseComponent['params']> = {},
): CarcaseComponent {
  const base = CARCASE_PRESETS[0].params
  return {
    kind: 'carcase',
    id,
    label: id,
    parentId: null,
    visible: true,
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    params: {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'door', leaves: 1, hinge: 'left' }),
      ...params,
    },
  }
}

export function wallScene(components: CarcaseComponent[]): Scene {
  return { parts: [], materials: PRESET_MATERIALS, hardware: [], joints: [], components }
}

export const SITE: SiteMeasurement = {
  value: 3983,
  uncertainty: 5,
  source: 'Laser',
  recordedAt: '2026-09-30',
}

// A 3983 mm straight wall: a Base 600 at x = 1000 and a window from 1800 to 3000. The cabinet is
// deliberately not at the wall start, so a wall-start/wall-end flip or a dropped offset shows up.
export function kitchenWall(measuredLength?: SiteMeasurement) {
  const cabinet = wallCabinet('kitchen', 1000)
  const room: RoomGeometry = {
    ...emptyRoomGeometry(),
    walls: [
      {
        id: 'long',
        name: 'Kitchen',
        start: { x: 0, y: 0 },
        end: { x: 3983, y: 0 },
        ...(measuredLength ? { measuredLength } : {}),
      },
    ],
    openings: [
      { id: 'window', wallId: 'long', kind: 'window', offset: 1800, width: 1200, sill: 900, height: 1100 },
    ],
    placements: [
      { cabinetId: cabinet.id, wallId: 'long', offset: 1000, setback: 0, manualOffset: { x: 0, y: 0 } },
    ],
  }
  return { room, cabinet, scene: wallScene([cabinet]), cabinetIds: new Set([cabinet.id]) }
}
```

- [ ] **Step 2: Extend the existing elevation test so it fails**

In `src/scene/roomAssessment.test.ts`, inside `'projects a two-wall room opening and wall-linked cabinet into a dimensioned elevation'`, after the `spans.find((span) => span.id === 'kitchen')?.x1` line add:

```ts
    expect(spans.find((span) => span.id === 'window')?.kind).toBe('opening')
    expect(spans.find((span) => span.id === 'kitchen')?.kind).toBe('cabinet')
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/scene/roomAssessment.test.ts`
Expected: FAIL (`kind` is `undefined`; `expected undefined to be 'opening'`). The TypeScript error on `.kind` does not stop vitest.

- [ ] **Step 4: Add `kind`**

In `src/scene/roomAssessment.ts` change the interface and the two push sites:

```ts
export interface ElevationSpan { id: string; kind: 'opening' | 'cabinet'; label: string; x0: number; x1: number; z0: number; z1: number }
```

Opening map gets `kind: 'opening' as const,` after `id: o.id,`. The cabinet push becomes:

```ts
    spans.push({ id: cabinet.id, kind: 'cabinet', label: cabinet.label,
      x0: Math.min(...projected), x1: Math.max(...projected), z0: bounds.z0, z1: bounds.z1 })
```

- [ ] **Step 5: Run and verify it passes**

Run: `pnpm vitest run src/scene/roomAssessment.test.ts && pnpm typecheck`
Expected: PASS. If typecheck flags `RoomAssessmentPanel.tsx` (it reads `ElevationSpan`), it does not: the field is additive.

- [ ] **Step 6: Commit**

```bash
git add src/geom/__fixtures__/wallElevation.ts src/scene/roomAssessment.ts src/scene/roomAssessment.test.ts
git commit -m "Tag elevation spans as opening or cabinet and add a kitchen-wall fixture

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 2: The pure builder

**Files:**
- Create: `src/geom/wallElevation.ts`
- Test: `src/geom/wallElevation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildWallElevation, lengthLabel } from './wallElevation'
import { kitchenWall, SITE, wallCabinet, wallScene } from './__fixtures__/wallElevation'
import type { RoomGeometry } from '../scene/projectStructure'

const build = (f = kitchenWall()) =>
  buildWallElevation(f.room, f.room.walls[0], f.scene, f.cabinetIds)
const chain = (view: ReturnType<typeof build>) =>
  view.dims.filter((d) => d.axis === 'h' && d.ring === 1).sort((a, b) => a.start - b.start)

describe('buildWallElevation', () => {
  it('breaks one chain at every cabinet and opening edge, and it sums to the wall', () => {
    const view = build()
    const segments = chain(view)
    expect(segments.map((s) => s.label)).toEqual(['1000', '600', '200', '1200', '983'])
    expect(segments[0].start).toBe(0)
    for (let i = 1; i < segments.length; i++) expect(segments[i].start).toBeCloseTo(segments[i - 1].end)
    expect(segments.reduce((sum, s) => sum + (s.end - s.start), 0)).toBeCloseTo(3983)
    expect(segments.every((s) => s.side === 'below')).toBe(true)
  })

  it('reads the first chain segment as the gap from the wall START', () => {
    // Lopsided on purpose: 1000 at the start and 983 at the end. A builder measuring from the far
    // end would label the first segment 983.
    expect(chain(build())[0].label).toBe('1000')
    expect(chain(build()).at(-1)?.label).toBe('983')
  })

  it('states the overall length once, on ring 2, with its provenance in the label', () => {
    const overall = build().dims.filter((d) => d.axis === 'h' && d.ring === 2)
    expect(overall).toHaveLength(1)
    expect(overall[0]).toMatchObject({ side: 'below', start: 0, end: 3983, label: '3983 drawn — unverified' })
  })

  it.each([
    ['measured, inside tolerance', { ...SITE, value: 3980 }, '3980 ±5 (site)', true],
    ['measured, outside tolerance', { ...SITE, value: 3950 }, 'drawn 3983 / site 3950 ±5', false],
    ['drawn only', undefined, '3983 drawn — unverified', false],
    ['fractional uncertainty', { ...SITE, value: 3983, uncertainty: 0.5 }, '3983 ±0.5 (site)', true],
  ])('labels the wall length when %s', (_name, measured, label, verified) => {
    const view = build(kitchenWall(measured))
    expect(lengthLabel(view.length)).toBe(label)
    expect(view.length.verified).toBe(verified)
    expect(view.dims.find((d) => d.ring === 2 && d.axis === 'h')?.label).toBe(label)
  })

  it('dimensions opening sill and height on the right, cabinet height on the left', () => {
    const view = build()
    const right = view.dims.filter((d) => d.side === 'right')
    expect(right).toEqual([
      expect.objectContaining({ axis: 'v', start: 0, end: 900, label: '900', ring: 1 }),
      expect.objectContaining({ axis: 'v', start: 900, end: 2000, label: '1100', ring: 1 }),
    ])
    const cabinet = view.spans.find((s) => s.kind === 'cabinet')!
    const left = view.dims.filter((d) => d.side === 'left')
    expect(left).toEqual([
      expect.objectContaining({
        axis: 'v',
        start: cabinet.z0,
        end: cabinet.z1,
        label: String(Math.round(cabinet.z1 - cabinet.z0)),
      }),
    ])
  })

  it('emits a repeated height once and stacks overlapping heights on ring 2', () => {
    const a = wallCabinet('a', 0)
    const b = wallCabinet('b', 700)
    const tall = wallCabinet('tall', 1400, { height: 2100 })
    const room: RoomGeometry = {
      ...kitchenWall().room,
      openings: [],
      placements: [a, b, tall].map((c) => ({
        cabinetId: c.id,
        wallId: 'long',
        offset: c.position.x,
        setback: 0,
        manualOffset: { x: 0, y: 0 },
      })),
    }
    const view = buildWallElevation(room, room.walls[0], wallScene([a, b, tall]), new Set(['a', 'b', 'tall']))
    const left = view.dims.filter((d) => d.side === 'left')
    expect(left).toHaveLength(2)
    expect(left.map((d) => d.ring).sort()).toEqual([1, 2])
  })

  it('projects onto the wall, not the world x axis (rotated wall, turned cabinet)', () => {
    const straight = build()
    const c = { ...wallCabinet('kitchen', 0), position: { x: 0, y: 1000, z: 0 }, rotation: { x: 0, y: 0, z: 90 } }
    const room: RoomGeometry = {
      ...kitchenWall().room,
      walls: [{ id: 'long', name: 'Kitchen', start: { x: 0, y: 0 }, end: { x: 0, y: 3983 } }],
      openings: [],
    }
    const view = buildWallElevation(room, room.walls[0], wallScene([c]), new Set(['kitchen']))
    const span = view.spans[0]
    const reference = straight.spans.find((s) => s.kind === 'cabinet')!
    expect(span.x0).toBeCloseTo(reference.x0, 6)
    expect(span.x1).toBeCloseTo(reference.x1, 6)
  })

  it('shows the real extent of a cabinet hanging past either wall end', () => {
    const over = wallCabinet('over', 3700)
    const room: RoomGeometry = {
      ...kitchenWall().room,
      openings: [],
      placements: [{ cabinetId: 'over', wallId: 'long', offset: 3700, setback: 0, manualOffset: { x: 0, y: 0 } }],
    }
    const end = buildWallElevation(room, room.walls[0], wallScene([over]), new Set(['over']))
    expect(end.bounds.w).toBeGreaterThan(3983)
    expect(end.length).toMatchObject({ drawn: 3983 })
    const overall = end.dims.find((d) => d.ring === 2 && d.axis === 'h')!
    expect([overall.start, overall.end]).toEqual([0, 3983])

    const before = wallCabinet('before', -200)
    const room2: RoomGeometry = {
      ...room,
      placements: [{ cabinetId: 'before', wallId: 'long', offset: -200, setback: 0, manualOffset: { x: 0, y: 0 } }],
    }
    const start = buildWallElevation(room2, room2.walls[0], wallScene([before]), new Set(['before']))
    const overall2 = start.dims.find((d) => d.ring === 2 && d.axis === 'h')!
    expect([overall2.start, overall2.end]).toEqual([200, 4183])
    expect(start.bounds.x).toBe(0)
    expect(start.bounds.w).toBeCloseTo(4183)
  })

  it('still draws an empty wall, with only its length', () => {
    const f = kitchenWall()
    const room = { ...f.room, openings: [], placements: [] }
    const view = buildWallElevation(room, room.walls[0], f.scene, f.cabinetIds)
    expect(view.spans).toEqual([])
    expect(view.bounds).toEqual({ x: 0, y: 0, w: 3983, h: 1 })
    expect(view.dims.map((d) => d.label)).toEqual(['3983', '3983 drawn — unverified'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/geom/wallElevation.test.ts`
Expected: FAIL: `Failed to resolve import "./wallElevation"`.

- [ ] **Step 3: Write the builder**

```ts
import type { RoomGeometry, SiteMeasurement, WallSegment } from '../scene/projectStructure'
import type { Scene } from '../scene/types'
import { wallElevation, type ElevationSpan } from '../scene/roomAssessment'
import { wallLength } from '../scene/roomGeometry'
import type { AssemblyDim } from './assembly'
import type { Rect2D } from './drawing'

// Below this two breakpoints are one. Sub-millimetre slivers would print a "0" chain segment.
const EPS = 0.5

export interface WallLength {
  drawn: number
  measured?: SiteMeasurement
  // True only when a site value exists AND agrees with the drawn length within its uncertainty.
  verified: boolean
}

// In unscaled millimetres: x runs along the wall from its start (shifted so the leftmost thing
// drawn is at 0), z runs up from the floor. Two consumers — the Room panel and the elevation sheet —
// scale it differently, so it carries no scale and no page offset.
export interface WallElevationView {
  wallId: string
  wallName: string
  bounds: Rect2D
  // Where the wall's own start sits in view space: 0 unless a span hangs out past the start.
  originX: number
  spans: ElevationSpan[]
  dims: AssemblyDim[]
  length: WallLength
}

const mm = (n: number): string => String(Math.round(n))
const fig = (n: number): string => String(Number(n.toFixed(1)))

// A drawn length is never presented as a site measurement: "drawn" is in the label itself.
export function lengthLabel(length: WallLength): string {
  const { drawn, measured } = length
  if (!measured) return `${mm(drawn)} drawn — unverified`
  const tolerance = `±${fig(measured.uncertainty)}`
  return length.verified
    ? `${fig(measured.value)} ${tolerance} (site)`
    : `drawn ${mm(drawn)} / site ${fig(measured.value)} ${tolerance}`
}

type FlatDim = Omit<AssemblyDim, 'ring'>

// Ring 1 where the dimension's range is free, ring 2 otherwise. There are only two rings; a third
// overlapping dimension shares ring 2.
function ringed(dims: FlatDim[]): AssemblyDim[] {
  const taken: FlatDim[][] = [[], []]
  return dims.map((d) => {
    const free = taken[0].every((t) => d.end <= t.start || d.start >= t.end)
    const ring: 1 | 2 = free ? 1 : 2
    taken[ring - 1].push(d)
    return { ...d, ring }
  })
}

function verticalDims(spans: ElevationSpan[], kind: ElevationSpan['kind'], side: 'left' | 'right'): AssemblyDim[] {
  const seen = new Set<string>()
  const flat: FlatDim[] = []
  const add = (start: number, end: number) => {
    const key = `${Math.round(start)}:${Math.round(end)}`
    if (seen.has(key)) return
    seen.add(key)
    flat.push({ axis: 'v', side, start, end, label: mm(end - start) })
  }
  for (const span of spans.filter((s) => s.kind === kind)) {
    if (span.z0 > EPS) add(0, span.z0)
    add(span.z0, span.z1)
  }
  return ringed(flat)
}

export function buildWallElevation(
  room: RoomGeometry,
  wall: WallSegment,
  scene: Scene,
  cabinetIds: ReadonlySet<string>,
): WallElevationView {
  const drawn = wallLength(wall)
  const raw = wallElevation(room, wall, scene, cabinetIds)
  const xMin = Math.min(0, ...raw.map((s) => s.x0))
  const xMax = Math.max(drawn, ...raw.map((s) => s.x1))
  const spans = raw.map((s) => ({ ...s, x0: s.x0 - xMin, x1: s.x1 - xMin }))
  const originX = -xMin

  const measured = wall.measuredLength
  const length: WallLength = {
    drawn,
    ...(measured ? { measured } : {}),
    verified: measured !== undefined && Math.abs(drawn - measured.value) <= measured.uncertainty,
  }

  const breaks = [originX, originX + drawn, ...spans.flatMap((s) => [s.x0, s.x1])].sort((a, b) => a - b)
  const unique = breaks.filter((x, i) => i === 0 || x - breaks[i - 1] > EPS)
  const chain: AssemblyDim[] = unique.slice(1).map((end, i) => ({
    axis: 'h',
    side: 'below',
    ring: 1,
    start: unique[i],
    end,
    label: mm(end - unique[i]),
  }))
  const overall: AssemblyDim = {
    axis: 'h',
    side: 'below',
    ring: 2,
    start: originX,
    end: originX + drawn,
    label: lengthLabel(length),
  }

  return {
    wallId: wall.id,
    wallName: wall.name,
    bounds: { x: 0, y: 0, w: xMax - xMin, h: Math.max(1, ...spans.map((s) => s.z1)) },
    originX,
    spans,
    dims: [...chain, overall, ...verticalDims(spans, 'cabinet', 'left'), ...verticalDims(spans, 'opening', 'right')],
    length,
  }
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm vitest run src/geom/wallElevation.test.ts`
Expected: PASS (9 tests: the four `it.each` rows count separately).

If `'1000', '600', '200', '1200', '983'` fails with a different cabinet width, read the span actually returned: the base cabinet's occupied width (overlay door included) is what `carcaseBounds` says. Fix the expectation to the measured figure, not the builder, and record the figure in the notes.

- [ ] **Step 5: Commit**

```bash
git add src/geom/wallElevation.ts src/geom/wallElevation.test.ts
git commit -m "Add the pure wall elevation builder

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 3: The sheet kind, ring, scale and deck entry

**Files:**
- Modify: `src/geom/drawing.ts` (imports at top; `DrawingSheet` union ~line 130; after `buildAssemblySheet` ~line 535; `buildDrawingSheets` ~line 539)
- Modify: `src/ui/sheetFilename.ts`
- Test: `src/geom/drawing.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `src/geom/drawing.test.ts`)

```ts
import { buildWallElevationSheet, buildWallElevationSheets, SHEET_FONT } from './drawing'
import { kitchenWall, SITE } from './__fixtures__/wallElevation'
import { sheetFilename } from '../ui/sheetFilename'

describe('wall elevation sheets', () => {
  const input = (measured = SITE) => {
    const f = kitchenWall(measured)
    return { roomName: 'Kitchenette', room: f.room, scene: f.scene, cabinetIds: f.cabinetIds }
  }

  it('builds one sheet per wall with something to show, placed inside its own ring', () => {
    const sheets = buildWallElevationSheets(input(), '2026-09-30')
    expect(sheets).toHaveLength(1)
    const sheet = sheets[0]
    if (sheet.kind !== 'elevation') throw new Error('expected an elevation sheet')
    expect(sheet).toMatchObject({ roomName: 'Kitchenette', wallName: 'Kitchen', scaleLabel: '1:20' })
    expect(sheet.view.placement).toEqual({ x: MARGIN + sheet.ring, y: MARGIN })
    expect(sheet.view.bounds.w * sheet.scale).toBeLessThanOrEqual(297 - 2 * MARGIN - 2 * sheet.ring + 1e-9)
  })

  it('sizes the ring from the vertical labels, not the long horizontal provenance label', () => {
    const sheet = buildWallElevationSheets(input({ ...SITE, value: 3950 }), 'd')[0]
    if (sheet.kind !== 'elevation') throw new Error('expected an elevation sheet')
    const widestVertical = Math.max(
      ...sheet.view.dims.filter((d) => d.axis === 'v').map((d) => d.label.length),
    )
    expect(sheet.ring).toBeCloseTo(SHEET_FONT * (1.8 + 0.4 + 0.3 + 0.65 * widestVertical))
    expect(sheet.ring).toBeLessThan(20)
  })

  it('drops to 1:50 for a wall too long for 1:20', () => {
    const f = kitchenWall()
    const room = { ...f.room, walls: [{ ...f.room.walls[0], end: { x: 6000, y: 0 } }] }
    const sheet = buildWallElevationSheets({ roomName: 'R', room, scene: f.scene, cabinetIds: f.cabinetIds }, 'd')[0]
    if (sheet.kind !== 'elevation') throw new Error('expected an elevation sheet')
    expect(sheet.scaleLabel).toBe('1:50')
  })

  it('skips a zero-length wall and a wall with neither a span nor a site length', () => {
    const f = kitchenWall()
    const room = {
      ...f.room,
      walls: [
        { id: 'zero', name: 'Zero', start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        { id: 'bare', name: 'Bare', start: { x: 0, y: 0 }, end: { x: 0, y: 2000 } },
      ],
    }
    expect(
      buildWallElevationSheets({ roomName: 'R', room, scene: f.scene, cabinetIds: f.cabinetIds }, 'd'),
    ).toEqual([])
  })

  it('keeps an empty wall that has a site length', () => {
    const f = kitchenWall(SITE)
    const room = { ...f.room, openings: [], placements: [] }
    expect(
      buildWallElevationSheet({ roomName: 'R', room, scene: f.scene, cabinetIds: f.cabinetIds }, room.walls[0], 'd'),
    ).not.toBeNull()
  })

  it('puts elevation sheets after the cover and before the assembly sheets', () => {
    const sheets = buildDrawingSheets([], 'Job', [], '2026-09-30', undefined, [input()])
    expect(sheets.map((s) => s.kind)).toEqual(['cover', 'elevation'])
  })

  it('names the file after the room and wall', () => {
    const sheet = buildWallElevationSheets(input(), 'd')[0]
    expect(sheetFilename(sheet, 'Job', 'svg')).toBe('job-kitchenette-kitchen-elevation.svg')
  })
})
```

If `MARGIN`, `buildDrawingSheets` are not already imported in that file, add them to its existing import from `'./drawing'`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/geom/drawing.test.ts`
Expected: FAIL: `buildWallElevationSheets is not a function` / not exported.

- [ ] **Step 3: Implement**

In `src/geom/drawing.ts` imports add:

```ts
import type { RoomGeometry, WallSegment } from '../scene/projectStructure'
import type { Scene } from '../scene/types'
import { wallLength } from '../scene/roomGeometry'
import { buildWallElevation, type WallElevationView } from './wallElevation'
```

(`Scene` may be added to the existing `'../scene/types'` import list instead of a new line.) Add after `PlacedAssemblyView`:

```ts
export interface PlacedWallElevationView extends WallElevationView {
  placement: Point2D
}

export interface RoomElevationInput {
  roomName: string
  room: RoomGeometry
  scene: Scene
  cabinetIds: ReadonlySet<string>
}
```

Add to the `DrawingSheet` union after the `'assembly'` member:

```ts
  | {
      kind: 'elevation'
      roomName: string
      wallName: string
      date: string
      scaleLabel: string
      scale: number
      // Sheet millimetres, like the assembly sheet's: measured once here and read by every renderer.
      ring: number
      verified: boolean
      view: PlacedWallElevationView
    }
```

Add after `buildAssemblySheet`:

```ts
// STANDARD_SCALES stops at 1:20, which a 4.9 m wall already overflows. Only elevation sheets need
// the smaller ones, so board and assembly sheets keep the scales they always had.
const ELEVATION_SCALES = [...STANDARD_SCALES, 0.02, 0.01, 0.005]

// Only the vertical labels set the side rings' width. The long horizontal provenance label lies
// along ring 2 and needs height, not width, so sizing from it would reserve ~50 mm a side for nothing.
function elevationRing(view: WallElevationView): number {
  const widest = Math.max(...view.dims.filter((d) => d.axis === 'v').map((d) => d.label.length), 1)
  return SHEET_FONT * (RING_EM[2] + TICK_EM + TEXT_GAP_EM + CHAR_EM * widest)
}

function selectElevationScale(w: number, h: number, ring: number): number {
  // A ring either side, one below; nothing above.
  const raw = Math.min((PAGE_W - 2 * ring) / w, (PAGE_H - ring) / h)
  return ELEVATION_SCALES.find((s) => s <= raw) ?? ELEVATION_SCALES[ELEVATION_SCALES.length - 1]
}

export function buildWallElevationSheet(
  input: RoomElevationInput,
  wall: WallSegment,
  date: string,
): Extract<DrawingSheet, { kind: 'elevation' }> | null {
  if (wallLength(wall) === 0) return null
  const view = buildWallElevation(input.room, wall, input.scene, input.cabinetIds)
  if (view.spans.length === 0 && !wall.measuredLength) return null
  const ring = elevationRing(view)
  const scale = selectElevationScale(view.bounds.w, view.bounds.h, ring)
  return {
    kind: 'elevation',
    roomName: input.roomName,
    wallName: wall.name,
    date,
    scale,
    scaleLabel: toScaleLabel(scale),
    ring,
    verified: view.length.verified,
    view: { ...view, placement: { x: MARGIN + ring, y: MARGIN } },
  }
}

export function buildWallElevationSheets(input: RoomElevationInput, date: string): DrawingSheet[] {
  return input.room.walls.flatMap((wall) => buildWallElevationSheet(input, wall, date) ?? [])
}
```

Change `buildDrawingSheets`: add a sixth parameter and the new sheets.

```ts
  installationCabinetIds?: ReadonlySet<string>,
  rooms: RoomElevationInput[] = [],
): DrawingSheet[] {
```

and the return:

```ts
  const elevationSheets = rooms.flatMap((r) => buildWallElevationSheets(r, date))
  return [cover, ...elevationSheets, ...assemblySheets, ...installationSheets, ...partSheets]
```

In `src/ui/sheetFilename.ts` add before the `'installation'` branch:

```ts
        : sheet.kind === 'elevation'
          ? `${projectName}-${sheet.roomName}-${sheet.wallName}-elevation`
```

(Place it so the ternary chain stays well-formed: `sheet.kind === 'assembly' ? … : sheet.kind === 'elevation' ? … : sheet.kind === 'installation' ? … : …`.)

- [ ] **Step 4: Run and verify it passes, then see what else the new kind breaks**

Run: `pnpm vitest run src/geom/drawing.test.ts && pnpm typecheck`
Expected: the drawing tests PASS. Typecheck reports errors in `buildSvg.ts`, `buildDxf.ts`, `buildPdf.ts` and `DrawingViewer.tsx` (the new member is not handled). That is expected, and Tasks 4–6 fix them. Do **not** commit a red typecheck: stage the files and continue to Task 4 before committing, or commit with `--no-verify` only if the repo's hook blocks it (prefer the former).

- [ ] **Step 5: Hold the commit until Task 4 is typechecking**

No commit here. Tasks 3 to 6 land as one commit series once `pnpm typecheck` is green (the pre-commit hook runs typecheck).

---

### Task 4: SVG renderer

**Files:**
- Modify: `src/ui/buildSvg.ts` (imports; new functions after `renderAssemblyTitleBlock`; `buildSvg` branch)
- Test: `src/ui/buildSvg.test.ts`

- [ ] **Step 1: Write the failing tests** (append)

```ts
import { buildWallElevationSheets } from '../geom/drawing'
import { kitchenWall, SITE } from '../geom/__fixtures__/wallElevation'

describe('buildSvg — elevation sheets', () => {
  const sheetFor = (measured?: typeof SITE) => {
    const f = kitchenWall(measured)
    const sheet = buildWallElevationSheets(
      { roomName: 'Kitchenette', room: f.room, scene: f.scene, cabinetIds: f.cabinetIds },
      '2026-09-30',
    )[0]
    if (sheet.kind !== 'elevation') throw new Error('expected an elevation sheet')
    return sheet
  }

  it('draws every dimension label, every span and the title block', () => {
    const sheet = sheetFor(SITE)
    const svg = buildSvg(sheet)
    for (const d of sheet.view.dims) expect(svg).toContain(`>${d.label}</text>`)
    for (const s of sheet.view.spans) expect(svg).toContain(`data-testid="elevation-${s.id}"`)
    expect(svg).toContain('Kitchenette — Kitchen')
    expect(svg).toContain('Scale: 1:20')
    expect(svg).not.toContain('not site-verified')
  })

  it('says so on the sheet when the wall length is unverified', () => {
    const svg = buildSvg(sheetFor(undefined))
    expect(svg).toContain('Wall length not site-verified')
    expect(svg).toContain('3983 drawn — unverified')
  })

  it('draws the floor at the bottom: the cabinet top is above the floor line in the page', () => {
    const sheet = sheetFor(SITE)
    const svg = buildSvg(sheet)
    const { x: px, y: py } = sheet.view.placement
    const floorY = py + sheet.view.bounds.h * sheet.scale
    const cabinet = sheet.view.spans.find((s) => s.kind === 'cabinet')!
    const top = floorY - cabinet.z1 * sheet.scale
    // The cabinet's rect has its top at y = top; a flipped z axis would put it below the floor.
    expect(svg).toMatch(new RegExp(`<rect x="${(px + cabinet.x0 * sheet.scale).toFixed(3)}" y="${top.toFixed(3)}"`))
    expect(top).toBeLessThan(floorY)
  })

  it('draws an opening dashed and a cabinet solid', () => {
    const svg = buildSvg(sheetFor(SITE))
    const group = (id: string) => svg.split(`data-testid="elevation-${id}"`)[1].split('</g>')[0]
    expect(group('window')).toContain('stroke-dasharray')
    expect(group('kitchen')).not.toContain('stroke-dasharray')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/ui/buildSvg.test.ts`
Expected: FAIL (the final `else` in `buildSvg` treats it as a part sheet and throws `Cannot read properties of undefined`).

- [ ] **Step 3: Implement**

In `buildSvg.ts` add `PlacedWallElevationView` to the type import from `'../geom/drawing'`. Add after `renderAssemblyTitleBlock`:

```ts
function renderElevationView(view: PlacedWallElevationView, scale: number): string {
  const out: string[] = []
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  // Wall z runs up and SVG y runs down; the flip is written once, here.
  const fx = (u: number) => px + u * scale
  const fy = (v: number) => py + (H - v) * scale

  out.push(svgText(px, py - 2, view.wallName, { 'font-size': '3', fill: '#888', 'font-family': 'sans-serif' }))
  out.push(svgLine(px, fy(0), fx(view.bounds.w), fy(0), { stroke: '#000', 'stroke-width': '0.5' }))

  for (const span of view.spans) {
    const opening = span.kind === 'opening'
    out.push(
      `<g data-testid="${escapeXml(`elevation-${span.id}`)}">`,
      svgRect(fx(span.x0), fy(span.z1), (span.x1 - span.x0) * scale, (span.z1 - span.z0) * scale, {
        fill: 'none',
        stroke: opening ? '#888' : '#000',
        'stroke-width': opening ? '0.25' : '0.3',
        ...(opening ? DASH : {}),
      }),
      svgText(fx((span.x0 + span.x1) / 2), fy((span.z0 + span.z1) / 2), span.label, {
        'font-size': '2',
        fill: '#444',
        'font-family': 'sans-serif',
        'text-anchor': 'middle',
      }),
      '</g>',
    )
  }

  for (const d of view.dims) {
    out.push(renderDimLine(assemblyDimLine(d, view.bounds, scale), px, py))
  }
  return out.join('')
}

function renderElevationTitleBlock(sheet: Extract<DrawingSheet, { kind: 'elevation' }>): string {
  const tbY = SHEET_H - MARGIN - TITLE_H
  const tbX = MARGIN
  const style = { 'font-size': '4', fill: '#444', 'font-family': 'sans-serif' }
  return [
    svgRect(tbX, tbY, 297 - 2 * MARGIN, TITLE_H, { stroke: '#000', fill: 'none', 'stroke-width': '0.3' }),
    svgText(tbX + 4, tbY + 8, `${sheet.roomName} — ${sheet.wallName}`, {
      'font-size': '7',
      'font-weight': 'bold',
      fill: '#000',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 4, tbY + 16, 'Wall elevation', style),
    ...(sheet.verified
      ? []
      : [svgText(tbX + 4, tbY + 22, 'Wall length not site-verified', { ...style, 'font-size': '3' })]),
    svgText(tbX + 140, tbY + 8, `Scale: ${sheet.scaleLabel}`, style),
    svgText(tbX + 140, tbY + 16, `Date: ${sheet.date}`, style),
  ].join('')
}
```

Add the branch in `buildSvg` directly before `sheet.kind === 'assembly'`:

```ts
  } else if (sheet.kind === 'elevation') {
    body = renderElevationView(sheet.view, sheet.scale) + renderElevationTitleBlock(sheet)
```

- [ ] **Step 5: Run and verify**

Run: `pnpm vitest run src/ui/buildSvg.test.ts`
Expected: PASS. If the rect regex fails on formatting, the test helper `fmt` is `toFixed(3)`; check `svgRect` uses `fmt` for x/y before changing the test.

---

### Task 5: DXF and PDF renderers

**Files:**
- Modify: `src/ui/buildDxf.ts`, `src/ui/buildPdf.ts`
- Test: `src/ui/buildDxf.test.ts`, `src/ui/buildPdf.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/buildDxf.test.ts`:

```ts
import { buildWallElevationSheets } from '../geom/drawing'
import { kitchenWall, SITE } from '../geom/__fixtures__/wallElevation'

describe('buildDxf — elevation sheets', () => {
  const sheet = () => {
    const f = kitchenWall(SITE)
    const s = buildWallElevationSheets(
      { roomName: 'Kitchenette', room: f.room, scene: f.scene, cabinetIds: f.cabinetIds },
      '2026-09-30',
    )[0]
    if (s.kind !== 'elevation') throw new Error('expected an elevation sheet')
    return s
  }

  it('carries every dimension label and the title, and goes through the shared tables', () => {
    const s = sheet()
    const dxf = buildDxf(s)
    for (const d of s.view.dims) expect(dxf).toContain(d.label)
    expect(dxf).toContain('Kitchenette — Kitchen')
    expect(dxf).toContain('2\nTABLES')
  })

  it('draws as many dimension lines as the view has dimensions', () => {
    const s = sheet()
    // dxfDimLine emits three DIM-layer lines per dimension: the line and two ticks.
    const dimLines = buildDxf(s).split('\n8\nDIM\n').length - 1
    expect(dimLines).toBe(s.view.dims.length * 3)
  })
})
```

Check the DXF layer marker in `dxfLine` first: `sed -n 44,67p src/ui/buildDxf.ts`. If the layer is written as `8\nDIM`, the split string above is right; if it differs, adjust the split string to the exact `8\n<layer>` text `dxfLine` produces. Do not guess.

Append to `src/ui/buildPdf.test.ts`, reusing its existing `contentOf` and `textsIn` helpers (they are declared inside the `'buildPdf — assembly sheets'` describe; lift them to file scope or add a sibling describe that declares the same two helpers, keeping the lifted copy unchanged):

```ts
describe('buildPdf — elevation sheets', () => {
  it('draws every dimension label on one landscape page', async () => {
    const f = kitchenWall(SITE)
    const sheets = buildWallElevationSheets(
      { roomName: 'Kitchenette', room: f.room, scene: f.scene, cabinetIds: f.cabinetIds },
      '2026-09-30',
    )
    const sheet = sheets[0]
    if (sheet.kind !== 'elevation') throw new Error('expected an elevation sheet')
    const doc = await PDFDocument.load(await buildPdf(sheets))
    expect(doc.getPageCount()).toBe(1)
    const labels = textsIn(await contentOf(doc, 0)).map((t) => t.label)
    for (const d of sheet.view.dims) expect(labels).toContain(d.label)
  })
})
```

with imports `buildWallElevationSheets` from `'../geom/drawing'` and `kitchenWall, SITE` from the fixture. The fixture's label `3983 ±5 (site)` uses ± (U+00B1), a single WinAnsi byte, so the hex read-back matches. An unverified label contains an em dash (WinAnsi 0x97) and will not round-trip through `textsIn`, which is why this test uses the measured fixture.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/ui/buildDxf.test.ts src/ui/buildPdf.test.ts`
Expected: FAIL (the elevation sheet falls into the part-sheet branch and throws).

- [ ] **Step 3: Implement DXF**

In `buildDxf.ts` add `PlacedWallElevationView` to the `'../geom/drawing'` type import. Add after `dxfAssemblyTitleBlock`:

```ts
function dxfElevationView(view: PlacedWallElevationView, scale: number): string {
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  // Sheet millimetres with y running DOWN, as every dxf* helper takes; the single flip is here.
  const fx = (u: number) => px + u * scale
  const fy = (v: number) => py + (H - v) * scale
  const out: string[] = [
    dxfText('TEXT', px, py - 2, 3, view.wallName),
    dxfLine('OUTLINE', px, fy(0), fx(view.bounds.w), fy(0)),
  ]
  for (const span of view.spans) {
    out.push(
      dxfRect(
        span.kind === 'opening' ? 'CUTS' : 'OUTLINE',
        fx(span.x0),
        fy(span.z1),
        (span.x1 - span.x0) * scale,
        (span.z1 - span.z0) * scale,
      ),
      dxfText('TEXT', fx((span.x0 + span.x1) / 2), fy((span.z0 + span.z1) / 2), 2, span.label),
    )
  }
  for (const d of view.dims) out.push(dxfDimLine(assemblyDimLine(d, view.bounds, scale), px, py))
  return out.join('')
}

function dxfElevationTitleBlock(sheet: Extract<DrawingSheet, { kind: 'elevation' }>): string {
  const MARGIN = 15
  const tbY = SHEET_H - MARGIN - 25
  const tbX = MARGIN
  return [
    dxfRect('TITLE', tbX, tbY, 297 - 2 * MARGIN, 25),
    dxfText('TITLE', tbX + 4, tbY + 8, 7, `${sheet.roomName} — ${sheet.wallName}`),
    dxfText('TEXT', tbX + 4, tbY + 16, 4, 'Wall elevation'),
    ...(sheet.verified ? [] : [dxfText('TEXT', tbX + 4, tbY + 22, 3, 'Wall length not site-verified')]),
    dxfText('TEXT', tbX + 140, tbY + 8, 4, `Scale: ${sheet.scaleLabel}`),
    dxfText('TEXT', tbX + 140, tbY + 16, 4, `Date: ${sheet.date}`),
  ].join('')
}
```

and in `buildDxf` before the `'assembly'` branch:

```ts
  } else if (sheet.kind === 'elevation') {
    entities = dxfElevationView(sheet.view, sheet.scale) + dxfElevationTitleBlock(sheet)
```

- [ ] **Step 4: Implement PDF**

In `buildPdf.ts` add `PlacedWallElevationView` to its drawing type import. Read `renderPdfAssemblyView` (it defines `fx`, `fy`, `line`, `pt`, `yflip`, `C_*`, `DASH_PT`) and follow its exact conventions. Add after `renderPdfAssemblyTitleBlock`:

```ts
function renderPdfElevationView(
  page: PDFPage,
  view: PlacedWallElevationView,
  scale: number,
  font: PDFFont,
): void {
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  const fx = (u: number) => px + u * scale
  const fy = (v: number) => py + (H - v) * scale
  const line = (x1: number, y1: number, x2: number, y2: number, dashed: boolean) =>
    page.drawLine({
      start: { x: pt(x1), y: yflip(y1) },
      end: { x: pt(x2), y: yflip(y2) },
      thickness: pt(dashed ? 0.25 : 0.3),
      color: dashed ? C_GRAY : C_BLACK,
      ...(dashed ? { dashArray: DASH_PT } : {}),
    })

  page.drawText(view.wallName, { x: pt(px), y: yflip(py - 2), size: pt(3), font, color: C_GRAY })
  page.drawLine({
    start: { x: pt(px), y: yflip(fy(0)) },
    end: { x: pt(fx(view.bounds.w)), y: yflip(fy(0)) },
    thickness: pt(0.5),
    color: C_BLACK,
  })
  for (const span of view.spans) {
    const dashed = span.kind === 'opening'
    const [x0, x1, y0, y1] = [fx(span.x0), fx(span.x1), fy(span.z1), fy(span.z0)]
    line(x0, y0, x1, y0, dashed)
    line(x1, y0, x1, y1, dashed)
    line(x1, y1, x0, y1, dashed)
    line(x0, y1, x0, y0, dashed)
    const label = pt(2)
    page.drawText(span.label, {
      x: pt(fx((span.x0 + span.x1) / 2)) - font.widthOfTextAtSize(span.label, label) / 2,
      y: yflip(fy((span.z0 + span.z1) / 2)),
      size: label,
      font,
      color: C_DARK_GRAY,
    })
  }
  for (const d of view.dims) renderPdfDimLine(page, assemblyDimLine(d, view.bounds, scale), px, py, font)
}

function renderPdfElevationTitleBlock(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'elevation' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const tbY = 170
  const tbX = 15
  page.drawRectangle({
    x: pt(tbX),
    y: PAGE_H_PT - pt(tbY + 25),
    width: pt(267),
    height: pt(25),
    borderColor: C_BLACK,
    borderWidth: pt(0.3),
  })
  const text = (s: string, x: number, y: number, size: number, f: PDFFont, color = C_DARK_GRAY) =>
    page.drawText(s, { x: pt(x), y: yflip(y), size: pt(size), font: f, color })
  text(`${sheet.roomName} — ${sheet.wallName}`, tbX + 4, tbY + 8, 7, fontBold, C_BLACK)
  text('Wall elevation', tbX + 4, tbY + 16, 4, font)
  if (!sheet.verified) text('Wall length not site-verified', tbX + 4, tbY + 22, 3, font)
  text(`Scale: ${sheet.scaleLabel}`, tbX + 140, tbY + 8, 4, font)
  text(`Date: ${sheet.date}`, tbX + 140, tbY + 16, 4, font)
}
```

and in `buildPdf`'s loop before the `'assembly'` branch:

```ts
    } else if (sheet.kind === 'elevation') {
      renderPdfElevationView(page, sheet.view, sheet.scale, font)
      renderPdfElevationTitleBlock(page, sheet, font, fontBold)
```

If `C_DARK_GRAY`, `C_GRAY`, `DASH_PT`, `PAGE_H_PT`, `pt` or `yflip` are named differently in this file, use the names `renderPdfAssemblyView` and `renderPdfAssemblyTitleBlock` actually use; do not invent them.

- [ ] **Step 5: Run and verify**

Run: `pnpm vitest run src/ui/buildDxf.test.ts src/ui/buildPdf.test.ts src/ui/buildSvg.test.ts src/geom/drawing.test.ts`
Expected: PASS.

---

### Task 6: Viewer label, Room panel and export buttons

**Files:**
- Modify: `src/ui/DrawingViewer.tsx:70-76`
- Modify: `src/ui/RoomAssessmentPanel.tsx` (props, imports, the `Wall elevations` block at the bottom)
- Modify: `src/ui/ProjectPanel.tsx` (prop + pass-through), `src/App.tsx` (pass `projectName`; build deck inputs)
- Test: `src/ui/DrawingViewer.test.tsx`, `src/ui/RoomAssessmentPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/DrawingViewer.test.tsx`:

```tsx
  it('labels an elevation sheet in the deck and previews it', () => {
    const f = kitchenWall()
    const sheets = buildDrawingSheets([], 'Job', [], '2026-09-30', undefined, [
      { roomName: 'Kitchenette', room: f.room, scene: f.scene, cabinetIds: f.cabinetIds },
    ])
    render(<DrawingViewer open sheets={sheets} projectName="Job" onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('→'))
    expect(screen.getByText('Elevation — Kitchenette / Kitchen')).toBeTruthy()
  })
```

(adopt the file's existing render props and imports; add `kitchenWall` from `'../geom/__fixtures__/wallElevation'`; if `DrawingViewer`'s props differ from the snippet, copy them from the neighbouring test.)

In `src/ui/RoomAssessmentPanel.test.tsx` replace every `<RoomAssessmentPanel ` with `<RoomAssessmentPanel roomName="Kitchenette" projectName="Job" ` and extend the existing `'shows dimensioned wall opening and site level evidence separately'` test (keep its existing asserts, including the `img` name and `elevation-window` hooks) with:

```tsx
    expect(screen.getByRole('button', { name: 'Export Kitchen elevation SVG' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export Kitchen elevation DXF' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Elevation of Kitchen' }).innerHTML).toContain('3983 drawn — unverified')
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/ui/DrawingViewer.test.tsx src/ui/RoomAssessmentPanel.test.tsx`
Expected: FAIL (label missing; buttons missing).

- [ ] **Step 3: Implement the viewer label**

In `DrawingViewer.tsx`, in the `sheetLabel` chain add after the `'assembly'` arm:

```tsx
        : sheet.kind === 'elevation'
          ? `Elevation — ${sheet.roomName} / ${sheet.wallName}`
```

- [ ] **Step 4: Implement the panel**

In `RoomAssessmentPanel.tsx`: update imports and props.

```tsx
import { clearanceIssues } from '../scene/roomAssessment'
import { wallLength } from '../scene/roomGeometry'
import { buildWallElevationSheet } from '../geom/drawing'
import { buildSvg } from './buildSvg'
import { buildDxf } from './buildDxf'
import { downloadBlob } from './download'
import { sheetFilename } from './sheetFilename'
```

```tsx
interface Props {
  room: RoomGeometry
  roomName: string
  projectName: string
  scene: Scene
  cabinetIds: ReadonlySet<string>
  onChange: (room: RoomGeometry) => void
}

export function RoomAssessmentPanel({ room, roomName, projectName, scene, cabinetIds, onChange }: Props) {
```

Replace the whole `Wall elevations (mm)` block (the `<div className="space-y-2">` holding `room.walls.map`) with:

```tsx
    <div className="space-y-2">
      <h4 className="font-medium">Wall elevations (mm)</h4>
      {room.walls.map((wall) => {
        const sheet = buildWallElevationSheet({ roomName, room, scene, cabinetIds }, wall,
          new Date().toISOString().slice(0, 10))
        return <div key={wall.id} className="overflow-x-auto border border-border rounded p-1">
          <div>{wall.name} — {Math.round(wallLength(wall))} mm drawn length</div>
          {sheet === null
            ? <p className="text-muted-foreground">Nothing placed on this wall and no site length recorded.</p>
            : <>
              <div role="img" aria-label={`Elevation of ${wall.name}`} className="min-w-[400px] bg-white"
                dangerouslySetInnerHTML={{ __html: buildSvg(sheet) }} />
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="outline" aria-label={`Export ${wall.name} elevation SVG`}
                  onClick={() => downloadBlob(buildSvg(sheet), sheetFilename(sheet, projectName, 'svg'), 'image/svg+xml')}>
                  Export SVG</Button>
                <Button size="sm" variant="outline" aria-label={`Export ${wall.name} elevation DXF`}
                  onClick={() => downloadBlob(buildDxf(sheet), sheetFilename(sheet, projectName, 'dxf'), 'application/dxf')}>
                  Export DXF</Button>
              </div>
            </>}
        </div>
      })}
    </div>
```

Note `role="img"` with `dangerouslySetInnerHTML` makes `getByRole('img', { name })` match the wrapper (the inner `<svg>` has no role here). `downloadBlob` takes `(data, filename, mime)`; confirm with `sed -n 1,20p src/ui/download.ts`.

- [ ] **Step 5: Wire `ProjectPanel` and `App`**

`ProjectPanel.tsx`: add `projectName: string` to `Props`, destructure it, and pass `roomName={room.name} projectName={projectName}` to `<RoomAssessmentPanel`. `App.tsx` line ~619: add `projectName={projectName}` to `<ProjectPanel`.

In `App.tsx` `handleOpenDrawings`, build the room inputs and pass them as the sixth argument. Add `roomComponentIds` to the existing `'./scene/projectStructure'` import if not present, then:

```tsx
    const rooms = project.areas.flatMap((area) => area.rooms).flatMap((room) =>
      room.geometry === undefined ? [] : [{
        roomName: room.name,
        room: room.geometry,
        scene,
        cabinetIds: roomComponentIds(room.items.flatMap((item) => item.rootComponentIds), scene),
      }])
    setDrawingSheets(buildDrawingSheets(visibleParts, projectName, cabinets, undefined, undefined, rooms))
```

Extend the `useCallback` dependency list with `project` and `scene`. `undefined` for the `date` parameter keeps its default.

- [ ] **Step 6: Run everything touched, then typecheck and lint**

Run: `pnpm vitest run src/ui src/geom src/scene/roomAssessment.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS and clean. If `ProjectPanel` has a test rendering it without `projectName`, typecheck will say so: add `projectName="Job"` there.

- [ ] **Step 7: Add an App-level check that the deck includes the elevation**

`App.test.tsx` already exists per CLAUDE.md. Find an existing test that opens the drawings deck (`grep -n "2D Drawings\|Open drawings\|handleOpenDrawings" src/App.test.tsx`); if one exists, add one assertion beside it that a project whose room has geometry with an opening shows an `Elevation —` sheet. If none exists, say so in the notes and skip: do not build a new App harness for one assertion.

- [ ] **Step 8: Commit Tasks 3 to 6**

```bash
git add -A src
git commit -m "Draw dimensioned wall elevations in the panel and the drawing deck

An elevation sheet per wall: chain dimensions from the wall start, sill and
height dimensions, and the overall length labelled drawn or site-measured.
The Room panel embeds the same sheet, so panel and export cannot disagree.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
```

---

### Task 7: Mutation-test the guards

Follow CLAUDE.md's four rules: back up first, grep after applying and after restoring, predict, confirm the unmutated run is green. Never `git checkout` to restore.

- [ ] **Step 1: Back up and confirm green**

```bash
mkdir -p "$SCRATCHPAD" 2>/dev/null; S=/tmp/claude-0/-home-user-zimmu-web/d892a957-ab28-595a-9015-059ca8990e98/scratchpad
cp src/geom/wallElevation.ts $S/wallElevation.bak && cp src/geom/drawing.ts $S/drawing.bak && cp src/ui/buildSvg.ts $S/buildSvg.bak
pnpm vitest run src/geom src/ui/buildSvg.test.ts src/ui/buildDxf.test.ts src/ui/buildPdf.test.ts
```
Expected: all PASS before mutating.

- [ ] **Step 2: Apply each mutation, predict, run, restore**

| # | Mutation (file) | Predicted failing test(s) |
|---|---|---|
| 1 | `verified` uses `<` instead of `<=` — use `sed` to make `<= measured.uncertainty` into `< measured.uncertainty` with a fixture of exactly ±5 difference; if no fixture sits on the boundary, **add one** (`value: 3978`, uncertainty 5) to the `it.each` table first | the boundary row |
| 2 | Chain measured from the far end: replace `originX + drawn` start with reversed sort (`sort((a, b) => b - a)`) | "reads the first chain segment as the gap from the wall START", "breaks one chain…" |
| 3 | Drop the de-dupe in `verticalDims` (remove the `seen.has` early return) | "emits a repeated height once…" |
| 4 | Ring assignment always 1 (`const ring: 1 \| 2 = 1`) | "emits a repeated height once and stacks…" |
| 5 | `xMin` fixed at 0 (`const xMin = 0`) | "shows the real extent of a cabinet hanging past either wall end" (start case) |
| 6 | Ring sized from all labels (`view.dims` without the `axis === 'v'` filter) in `elevationRing` | "sizes the ring from the vertical labels…" |
| 7 | `ELEVATION_SCALES = STANDARD_SCALES` | "drops to 1:50…" |
| 8 | Flip z in `renderElevationView` (`fy = py + v * scale`) | "draws the floor at the bottom…" |
| 9 | Drop the `opening ? DASH` spread | "draws an opening dashed and a cabinet solid" |
| 10 | Drop the `!sheet.verified` title-block line | "says so on the sheet when the wall length is unverified" |

For each: apply, `grep` that the change is present, run the named test file, confirm an `AssertionError` naming the rule (not a TypeError or `no tests`), restore from the `.bak`, `grep` that it is restored, re-run green. A mutation that survives is a missing test: add the test, then re-run the mutation.

- [ ] **Step 3: Record the results** in the notes file (Task 8), one line per mutation: predicted, observed, killed or survived and what was added.

---

### Task 8: Docs, full checks, push

**Files:**
- Modify: `docs/superpowers/notes/2026-09-30-wall-elevations-notes.md`
- Modify: `docs/superpowers/specs/2026-09-30-wall-elevations-design.md` (spec refinements)
- Modify: `CLAUDE.md` (architecture tree, one invariant)
- Modify: `project-structure.html` via `node scripts/update-structure-html.mjs`
- Modify: `docs/keyboard-shortcuts.md` — **not** touched (no shortcut added)

- [ ] **Step 1: Update the spec** with the refinements listed at the top of this plan (builder reuses `wallElevation()`; `ELEVATION_SCALES`; `originX`; ring from vertical labels; right-hand opening dims; panel embeds `buildSvg`).

- [ ] **Step 2: Extend the notes file** with: the same refinements and why; the mutation table with observed results; the known limitation that a very short chain segment's label can overlap its neighbour at small scale; that the PDF label test uses a measured fixture because an em dash is not a one-byte round trip through the text reader.

- [ ] **Step 3: Update `CLAUDE.md`.** In the architecture tree add under `geom/`:

```
│   ├── wallElevation.ts  buildWallElevation(room, wall, scene, cabinetIds) → WallElevationView in
│   │                    unscaled mm: spans (from roomAssessment's wallElevation), a chain of
│   │                    dimensions from the wall start, sill/height dimensions and the overall
│   │                    length labelled by provenance. assemblyDimLine places its dimensions
```

and in `drawing.ts`'s line mention the `elevation` sheet. Add one invariant under Key Invariants:

```
- **A wall's length is labelled by where it came from, and the word "drawn" is in the label.** `lengthLabel` in `wallElevation.ts` states the rule once: a site value inside its uncertainty reads `3980 ±5 (site)`; outside it, both figures; none, `3983 drawn — unverified`. The Stage 2 rule is that a drawn length is never presented as a site measurement, and a label that only implied it would be one edit from breaking it. The elevation sheet's ring is sized from its **vertical** labels only — the long horizontal provenance label lies along ring 2 and needs height, not width.
```

- [ ] **Step 4: Regenerate the structure page**

Run: `node scripts/update-structure-html.mjs`
Expected: `project-structure.html` AUTOGEN blocks updated (new files and test count).

- [ ] **Step 5: Full checks**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. Report the real test count.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "Document dimensioned wall elevations and record mutation results

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017T7J37DZaAPsvJMkwK8WZn"
git push -u origin claude/festive-brown-tdhoa9
```

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| `buildWallElevation` pure, unscaled mm, `AssemblyDim` | 2 |
| Ring 1 chain incl. gaps to wall ends, zero-width skipped | 2 (`EPS` de-dupe, `chain`) |
| Ring 2 overall length with provenance (3 forms + in-tolerance) | 2 (`lengthLabel`, `it.each`) |
| Left cabinet heights; opening sill + height; stack into rings | 2 |
| `'elevation'` sheet kind, one per wall, scale from list, ring in ems | 3 |
| 1:20 for ~3983, 1:50 past ~4900 | 3 (`ELEVATION_SCALES`, test) |
| Zero-length wall → none; empty wall with site length → kept | 3 |
| Deck order: cover, elevations, assemblies | 3 |
| Scoped by `cabinetIds` | 6 (`roomComponentIds`), 2 |
| SVG / DXF / PDF each draw floor, spans, labels, dims via `assemblyDimLine` | 4, 5 |
| "Wall length not site-verified" in title block | 4, 5 |
| Panel uses the same view, keeps `elevation-<id>` hooks, per-wall export | 6 |
| Offset past wall end shown, not clipped | 2 |
| Tests: kitchenette, rotated wall, sums, provenance, orientation, z flip, 1:50, cross-format, panel + deck | 2–6 |
| Mutation testing | 7 |
| No file-format / IDB change | none touched |

Type consistency: `ElevationSpan.kind` (Task 1) is read by Tasks 2, 4, 5. `WallElevationView`, `PlacedWallElevationView` and `RoomElevationInput` (Tasks 2–3) are what Tasks 4–6 import. `buildWallElevationSheet(input, wall, date)` returns `Extract<DrawingSheet, { kind: 'elevation' }> | null`, and the panel handles `null`. `buildDrawingSheets`' sixth parameter is `rooms`.
