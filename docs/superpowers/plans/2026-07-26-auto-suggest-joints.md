# Auto-Suggest Joints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a single board is selected, show a sidebar list of the joints that would actually work between it and its touching neighbours, each applied with one click.

**Architecture:** A pure engine (`src/scene/suggestJoints.ts`) detects the physically-meeting face pair between the selected board and each neighbour (`contactPair`, from world AABBs), classifies it, and validates against the existing joint gates — emitting `JointSuggestion`s for half-lap, dado, mortise-tenon, and tongue-groove. A `SuggestionsPanel` renders them; clicking **Add** replays a suggestion through the existing `useScene` `onAdd*` creators via a synthesised `FaceHit`, so joint creation, cut derivation, and undo/redo are reused unchanged. No data-model, file-format, or kernel change. Finger joints are deferred (they need a separate perpendicular-corner detector).

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn/Radix UI primitives. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-07-26-auto-suggest-joints-design.md`
**Notes:** `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`

**Conventions (every task):**
- Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).
- `import type { … }` for type-only imports (strict `verbatimModuleSyntax`).
- No `any`. Named exports. Test files auto-run on save via a Claude hook.
- Commit messages: short imperative summary. Do **not** include model identifiers.

---

### Task 1: `JointSuggestion` type + `synthHit`

**Files:**
- Create: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/suggestJoints.test.ts`:

```ts
import { test, expect } from 'vitest'
import type { Face } from './types'
import { localNormalToFaceString } from './snapMath'
import { synthHit } from './suggestJoints'

const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']

test('synthHit produces a FaceHit whose local normal round-trips to the same face', () => {
  for (const f of FACES) {
    const h = synthHit('P1', f)
    expect(h.partId).toBe('P1')
    expect(localNormalToFaceString(h.localFaceNormal)).toBe(f)
    expect(h.faceNormal).toEqual(h.localFaceNormal)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `synthHit` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/scene/suggestJoints.ts`:

```ts
import type { Face, FaceHit, PartId, Vec3 } from './types'

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

// Private copy, matching the per-file convention in geom/{dado,mortisetenon,tonguegroove}.ts.
const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 },
  '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 },
  '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 },
  '-Z': { x: 0, y: 0, z: -1 },
}

interface SuggestionBase {
  neighborId: PartId
}

export type JointSuggestion = SuggestionBase &
  (
    | { kind: 'halflap'; partAId: PartId; partBId: PartId }
    | { kind: 'dado'; housingPartId: PartId; housingFace: Face; housedPartId: PartId; housedEnd: Face }
    | {
        kind: 'mortise-tenon'
        mortisePartId: PartId
        mortiseFace: Face
        tenonPartId: PartId
        tenonEnd: Face
      }
    | {
        kind: 'tongue-groove'
        groovePartId: PartId
        grooveEdge: Face
        tonguePartId: PartId
        tongueEdge: Face
      }
  )

export function synthHit(partId: PartId, face: Face): FaceHit {
  const n = FACE_NORMALS[face]
  return {
    partId,
    faceNormal: n,
    faceCenter: ZERO,
    localFaceNormal: n,
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "feat: JointSuggestion type + synthHit for joint suggestions"
```

---

### Task 2: `contactPair` — infer the physically-meeting faces

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/suggestJoints.test.ts`. First add these fixtures near the top (after the imports — you will reuse them in Task 3), then the test:

```ts
import type { BoardPart } from './types'
import { contactPair } from './suggestJoints'

function board(over: Partial<BoardPart>): BoardPart {
  return {
    kind: 'board',
    id: 'X',
    label: 'X',
    length: 100,
    width: 40,
    thickness: 18,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...over,
  }
}

// Perpendicular tee: D stands on H's +Z face (Ry=-90 → local +X points to world +Z).
const teeH = board({ id: 'H', length: 200, width: 100, thickness: 20 })
const teeD = board({
  id: 'D',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 100, y: 30, z: 20 },
})

// Coplanar edge glue-up: G and E meet along y = 40.
const edgeG = board({ id: 'G', length: 200, width: 40, thickness: 18 })
const edgeE = board({ id: 'E', length: 200, width: 40, thickness: 18, position: { x: 0, y: 40, z: 0 } })

// Far apart.
const farA = board({ id: 'FA' })
const farB = board({ id: 'FB', position: { x: 500, y: 0, z: 0 } })

test('contactPair finds the broad/end faces of a perpendicular tee', () => {
  expect(contactPair(teeH, teeD)).toEqual({ faceA: '+Z', faceB: '-X' })
})

test('contactPair finds the long-edge faces of a coplanar edge joint', () => {
  expect(contactPair(edgeG, edgeE)).toEqual({ faceA: '+Y', faceB: '-Y' })
})

test('contactPair returns null for separated boards', () => {
  expect(contactPair(farA, farB)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `contactPair` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the top imports of `src/scene/suggestJoints.ts`:

```ts
import type { BoardPart } from './types'
import { composeWorldMatrix } from '../geom/transform'
import { worldAabb } from '../geom/halflap'
```

Add below `synthHit`:

```ts
const EPS = 1e-4
const TOUCH_TOL = 1 // mm
const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
type WorldAxis = 'x' | 'y' | 'z'
const WORLD_AXES: WorldAxis[] = ['x', 'y', 'z']

function worldFaceNormal(b: BoardPart, f: Face): Vec3 {
  const m = composeWorldMatrix(b)
  const col = f.includes('X')
    ? [m[0], m[1], m[2]]
    : f.includes('Y')
      ? [m[4], m[5], m[6]]
      : [m[8], m[9], m[10]]
  const s = f[0] === '+' ? 1 : -1
  return { x: col[0] * s, y: col[1] * s, z: col[2] * s }
}

function faceTowardWorld(b: BoardPart, ax: WorldAxis, sign: number): Face | null {
  for (const f of FACES) {
    const n = worldFaceNormal(b, f)
    if (n[ax] * sign > 1 - EPS) return f
  }
  return null
}

export function contactPair(a: BoardPart, b: BoardPart): { faceA: Face; faceB: Face } | null {
  const A = worldAabb(a)
  const B = worldAabb(b)
  let contactAx: WorldAxis | null = null
  let bestGap = -Infinity
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null // separated on this axis
    if (gap > bestGap) {
      bestGap = gap
      contactAx = ax
    }
  }
  if (!contactAx) return null
  const aMid = (A.min[contactAx] + A.max[contactAx]) / 2
  const bMid = (B.min[contactAx] + B.max[contactAx]) / 2
  const sign = bMid >= aMid ? 1 : -1
  const faceA = faceTowardWorld(a, contactAx, sign)
  const faceB = faceTowardWorld(b, contactAx, -sign)
  return faceA && faceB ? { faceA, faceB } : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS (all three `contactPair` tests + the Task 1 test).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "feat: contactPair contact-face detection for joint suggestions"
```

---

### Task 3: `suggestJointsFor` — the suggestion engine

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/suggestJoints.test.ts` (reuses the fixtures from Task 2):

```ts
import type { Joint, Part } from './types'
import { isValidHalfLap } from '../geom/halflap'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { suggestJointsFor } from './suggestJoints'

// Two crossing coplanar equal-thickness boards → half-lap.
const lapA = board({ id: 'LA', length: 200, width: 40, thickness: 20 })
const lapB = board({ id: 'LB', length: 40, width: 200, thickness: 20, position: { x: 80, y: -80, z: 0 } })

// A cylinder + a hidden board for the negative cases.
const cyl = { ...board({ id: 'CY' }), kind: 'cylinder' as const, diameter: 10 } as unknown as Part
const hidden = board({ id: 'HID', visible: false })

function kinds(parts: Part[], selectedId: string, joints: Joint[] = []): string[] {
  return suggestJointsFor(selectedId, parts, joints)
    .map((s) => s.kind)
    .sort()
}

test('perpendicular tee suggests both dado and mortise-tenon', () => {
  expect(kinds([teeH, teeD], 'H')).toEqual(['dado', 'mortise-tenon'])
})

test('coplanar edge joint suggests tongue-groove only (no mortise-tenon)', () => {
  expect(kinds([edgeG, edgeE], 'G')).toEqual(['tongue-groove'])
})

test('crossing coplanar boards suggest half-lap', () => {
  expect(kinds([lapA, lapB], 'LA')).toEqual(['halflap'])
})

test('separated boards yield no suggestions', () => {
  expect(suggestJointsFor('FA', [farA, farB], [])).toEqual([])
})

test('an already-joined pair yields no suggestion for that pair', () => {
  const joint = {
    kind: 'dado',
    id: 'j1',
    housingPartId: 'H',
    housedPartId: 'D',
  } as unknown as Joint
  expect(suggestJointsFor('H', [teeH, teeD], [joint])).toEqual([])
})

test('null selection, a cylinder, or a hidden board yield no suggestions', () => {
  expect(suggestJointsFor(null, [teeH, teeD], [])).toEqual([])
  expect(suggestJointsFor('CY', [cyl, teeD], [])).toEqual([])
  expect(suggestJointsFor('HID', [hidden, teeD], [])).toEqual([])
})

test('every emitted suggestion round-trips through its validity gate', () => {
  const scenes: Array<{ parts: Part[]; sel: string }> = [
    { parts: [teeH, teeD], sel: 'H' },
    { parts: [edgeG, edgeE], sel: 'G' },
    { parts: [lapA, lapB], sel: 'LA' },
  ]
  const asBoard = (parts: Part[], id: string) => parts.find((p) => p.id === id) as BoardPart
  for (const { parts, sel } of scenes) {
    for (const s of suggestJointsFor(sel, parts, [])) {
      if (s.kind === 'halflap') {
        expect(isValidHalfLap(asBoard(parts, s.partAId), asBoard(parts, s.partBId))).toBe(true)
      } else if (s.kind === 'dado') {
        expect(
          isValidDadoSeat(
            asBoard(parts, s.housingPartId),
            s.housingFace,
            asBoard(parts, s.housedPartId),
            s.housedEnd,
          ),
        ).toBe(true)
      } else if (s.kind === 'mortise-tenon') {
        expect(
          isValidMortiseTenon(
            asBoard(parts, s.mortisePartId),
            s.mortiseFace,
            asBoard(parts, s.tenonPartId),
            s.tenonEnd,
          ),
        ).toBe(true)
      } else {
        expect(
          isValidTongueGroove(
            asBoard(parts, s.groovePartId),
            s.grooveEdge,
            asBoard(parts, s.tonguePartId),
            s.tongueEdge,
          ),
        ).toBe(true)
      }
    }
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `suggestJointsFor` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the imports of `src/scene/suggestJoints.ts`:

```ts
import type { Joint, Part } from './types'
import { isValidHalfLap } from '../geom/halflap'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { faceAxes } from './snapMath'
import { jointInvolves } from './jointInvolves'
```

> Note: keep `worldAabb` in the existing `../geom/halflap` import from Task 2 and add `isValidHalfLap` to that same import line, e.g. `import { worldAabb, isValidHalfLap } from '../geom/halflap'`.

Add below `contactPair`:

```ts
const KIND_PRIORITY: JointSuggestion['kind'][] = ['halflap', 'dado', 'mortise-tenon', 'tongue-groove']
const MAX_SUGGESTIONS = 8

function aabbCenterDist(a: BoardPart, b: BoardPart): number {
  const A = worldAabb(a)
  const B = worldAabb(b)
  let sum = 0
  for (const ax of WORLD_AXES) {
    const ca = (A.min[ax] + A.max[ax]) / 2
    const cb = (B.min[ax] + B.max[ax]) / 2
    sum += (ca - cb) * (ca - cb)
  }
  return Math.sqrt(sum)
}

export function suggestJointsFor(
  selectedId: PartId | null,
  parts: Part[],
  joints: Joint[],
): JointSuggestion[] {
  if (selectedId == null) return []
  const s = parts.find((p) => p.id === selectedId)
  if (!s || s.kind !== 'board' || !s.visible) return []

  const out: JointSuggestion[] = []
  for (const t of parts) {
    if (t.id === s.id || t.kind !== 'board' || !t.visible) continue
    if (joints.some((j) => jointInvolves(j, s.id) && jointInvolves(j, t.id))) continue

    if (isValidHalfLap(s, t)) {
      out.push({ kind: 'halflap', neighborId: t.id, partAId: s.id, partBId: t.id })
    }

    const pair = contactPair(s, t)
    if (!pair) continue
    const { faceA, faceB } = pair
    const dS = faceAxes(faceA).depth
    const dT = faceAxes(faceB).depth
    const sBroad = dS === 'z'
    const tBroad = dT === 'z'

    if (sBroad !== tBroad) {
      const housing = sBroad ? s : t
      const housingFace = sBroad ? faceA : faceB
      const housed = sBroad ? t : s
      const housedEnd = sBroad ? faceB : faceA
      if (isValidDadoSeat(housing, housingFace, housed, housedEnd)) {
        out.push({
          kind: 'dado',
          neighborId: t.id,
          housingPartId: housing.id,
          housingFace,
          housedPartId: housed.id,
          housedEnd,
        })
      }
      if (isValidMortiseTenon(housing, housingFace, housed, housedEnd)) {
        out.push({
          kind: 'mortise-tenon',
          neighborId: t.id,
          mortisePartId: housing.id,
          mortiseFace: housingFace,
          tenonPartId: housed.id,
          tenonEnd: housedEnd,
        })
      }
    } else if (dS === 'y' && dT === 'y') {
      if (isValidTongueGroove(s, faceA, t, faceB)) {
        out.push({
          kind: 'tongue-groove',
          neighborId: t.id,
          groovePartId: s.id,
          grooveEdge: faceA,
          tonguePartId: t.id,
          tongueEdge: faceB,
        })
      }
    }
  }

  const distOf = (id: PartId) => {
    const t = parts.find((p) => p.id === id)
    return t && t.kind === 'board' ? aabbCenterDist(s, t) : Infinity
  }
  out.sort((a, b) => {
    const d = distOf(a.neighborId) - distOf(b.neighborId)
    if (Math.abs(d) > EPS) return d
    return KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
  })
  return out.slice(0, MAX_SUGGESTIONS)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS (all Task 1–3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "feat: suggestJointsFor engine (halflap, dado, M&T, tongue-groove)"
```

---

### Task 4: `SuggestionsPanel` component

**Files:**
- Create: `src/ui/SuggestionsPanel.tsx`
- Test: `src/ui/SuggestionsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ui/SuggestionsPanel.test.tsx`:

```tsx
import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { SuggestionsPanel } from './SuggestionsPanel'

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
      { ...base, id: 'A', label: 'Rail 1' },
      { ...base, id: 'B', label: 'Rail 2' },
    ],
    materials: {},
    hardware: [],
    joints: [],
  }
}

const suggestions: JointSuggestion[] = [
  { kind: 'halflap', neighborId: 'B', partAId: 'A', partBId: 'B' },
  { kind: 'dado', neighborId: 'B', housingPartId: 'A', housingFace: '+Z', housedPartId: 'B', housedEnd: '+X' },
]

test('renders a row per suggestion with the neighbour label', () => {
  render(<SuggestionsPanel suggestions={suggestions} scene={scene()} onApply={vi.fn()} />)
  expect(screen.getByText('Half-lap with Rail 2')).toBeTruthy()
  expect(screen.getByText('Dado with Rail 2')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(2)
})

test('clicking Add calls onApply with that suggestion', () => {
  const onApply = vi.fn()
  render(<SuggestionsPanel suggestions={suggestions} scene={scene()} onApply={onApply} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])
  expect(onApply).toHaveBeenCalledWith(suggestions[1])
})

test('renders nothing when there are no suggestions', () => {
  const { container } = render(<SuggestionsPanel suggestions={[]} scene={scene()} onApply={vi.fn()} />)
  expect(container.textContent).toBe('')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: FAIL — `SuggestionsPanel` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/SuggestionsPanel.tsx`:

```tsx
import type { PartId, Scene } from '../scene/types'
import type { JointSuggestion } from '../scene/suggestJoints'
import { Button } from '@/components/ui/button'

const KIND_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'Mortise & tenon',
  'tongue-groove': 'Tongue & groove',
}

function partLabel(scene: Scene, id: PartId): string {
  return scene.parts.find((p) => p.id === id)?.label ?? '(deleted)'
}

export function SuggestionsPanel({
  suggestions,
  scene,
  onApply,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">
        ▾ Suggested joints
      </p>
      {suggestions.map((s, i) => (
        <div key={i} className="flex items-center gap-1 py-0.5 border-t border-border/30">
          <span className="flex-1 text-[11px] text-foreground">
            {KIND_LABEL[s.kind]} with {partLabel(scene, s.neighborId)}
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => onApply(s)}>
            Add
          </Button>
        </div>
      ))}
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/ui/SuggestionsPanel.tsx src/ui/SuggestionsPanel.test.tsx
git commit -m "feat: SuggestionsPanel sidebar component"
```

---

### Task 5: Wire suggestions into App + Sidebar

**Files:**
- Modify: `src/App.tsx` (imports; after the `useScene()` destructure ~line 56; `<Sidebar>` props ~line 307)
- Modify: `src/ui/sidebar.tsx` (imports ~line 15; `SidebarProps` ~line 35; `Sidebar` destructure ~line 794; `EditPanel` props ~line 486; `EditPanel` render ~line 1033; `<JointsPanel>` render ~line 771)

No new unit test — this is prop threading; correctness is covered by Tasks 1–4 plus the build. Verified by `pnpm build` and a manual smoke described in Step 4.

- [ ] **Step 1: `App.tsx` — compute suggestions + apply dispatcher**

Add to the imports at the top of `src/App.tsx`:

```ts
import { useMemo } from 'react'
import { suggestJointsFor, synthHit } from './scene/suggestJoints'
import type { JointSuggestion } from './scene/suggestJoints'
```

> `useState, useRef, useEffect, useCallback` are already imported from `'react'` on line 1 — add `useMemo` to that existing import instead of a duplicate line if you prefer; either compiles.

Immediately after the `useMaterialLibrary()` line (`const { library, saveRate, deleteEntry } = useMaterialLibrary()`, ~line 58), add:

```ts
  const suggestions = useMemo(
    () => suggestJointsFor(selectedId, scene.parts, scene.joints),
    [selectedId, scene.parts, scene.joints],
  )

  const applySuggestion = useCallback(
    (s: JointSuggestion) => {
      switch (s.kind) {
        case 'halflap':
          return onAddHalfLap(s.partAId, s.partBId)
        case 'dado':
          return onAddJoint(synthHit(s.housingPartId, s.housingFace), synthHit(s.housedPartId, s.housedEnd))
        case 'mortise-tenon':
          return onAddMortiseTenon(
            synthHit(s.mortisePartId, s.mortiseFace),
            synthHit(s.tenonPartId, s.tenonEnd),
          )
        case 'tongue-groove':
          return onAddTongueGroove(
            synthHit(s.groovePartId, s.grooveEdge),
            synthHit(s.tonguePartId, s.tongueEdge),
          )
      }
    },
    [onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddTongueGroove],
  )
```

- [ ] **Step 2: `App.tsx` — pass props to `<Sidebar>`**

In the `<Sidebar … />` JSX (~line 307), add two props (next to `selectedId={selectedId}`):

```tsx
          suggestions={suggestions}
          onApplySuggestion={applySuggestion}
```

- [ ] **Step 3: `sidebar.tsx` — thread through to `SuggestionsPanel`**

3a. Add the import (near the `JointsPanel` import, ~line 15):

```ts
import { SuggestionsPanel } from './SuggestionsPanel'
import type { JointSuggestion } from '../scene/suggestJoints'
```

3b. Add to `interface SidebarProps` (~line 35, e.g. after `onRemoveJoint`):

```ts
  suggestions: JointSuggestion[]
  onApplySuggestion: (s: JointSuggestion) => void
```

3c. Add to the `Sidebar({ … })` destructure (~line 794, e.g. after `onRemoveJoint,`):

```ts
  suggestions,
  onApplySuggestion,
```

3d. Add to `EditPanel`'s props destructure (~line 486, after `onRemoveJoint,`) **and** its inline type (~line 516, after `onRemoveJoint: (…) => void`):

```ts
  suggestions,
  onApplySuggestion,
```

```ts
  suggestions: JointSuggestion[]
  onApplySuggestion: (s: JointSuggestion) => void
```

3e. In `EditPanel`'s JSX, render the panel immediately **above** `<JointsPanel …>` (~line 771):

```tsx
      <SuggestionsPanel suggestions={suggestions} scene={scene} onApply={onApplySuggestion} />

      <JointsPanel
        part={part}
        scene={scene}
        onUpdateJoint={onUpdateJoint}
        onRemoveJoint={onRemoveJoint}
      />
```

3f. In the `<EditPanel … />` render inside `Sidebar` (~line 1033), pass the two props (after `onRemoveJoint={onRemoveJoint}`):

```tsx
            suggestions={suggestions}
            onApplySuggestion={onApplySuggestion}
```

- [ ] **Step 4: Verify the whole suite + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `dist/` builds with no TypeScript errors.

Manual smoke (optional but recommended): `pnpm dev`, add two boards, snap one perpendicular onto another's face, select it — the sidebar shows "Suggested joints" with "Dado with …" and "Mortise & tenon with …"; clicking **Add** creates the joint and it appears in the "▾ Joints" section below; **Undo** removes it.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui/sidebar.tsx
git commit -m "feat: wire joint suggestions into sidebar EditPanel"
```

---

### Task 6: Docs

**Files:**
- Modify: `project-structure.html`
- (Notes file `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` already exists — update only if implementation surfaced anything new.)

- [ ] **Step 1: Update `project-structure.html`**

Locate the `src/scene/` file listing and add an entry for `suggestJoints.ts`, and the `src/ui/` listing and add `SuggestionsPanel.tsx`. Match the surrounding markup exactly. Suggested descriptions:

- `suggestJoints.ts` — "Selection-driven joint suggestions: contactPair face detection + per-type validity → JointSuggestion[]; synthHit replays through onAdd* creators."
- `SuggestionsPanel.tsx` — "Sidebar 'Suggested joints' list with one-click Add (calls onApplySuggestion)."

If the file has a data-flow section, add one line: selected board → `suggestJointsFor` → `SuggestionsPanel` → `applySuggestion` → existing `onAdd*`.

- [ ] **Step 2: Append any implementation surprises to the notes file**

If nothing deviated from this plan, add a dated one-liner confirming completion. Otherwise record what changed and why.

- [ ] **Step 3: Verify docs build nothing / no code touched**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: still green (docs-only changes).

- [ ] **Step 4: Commit**

```bash
git add project-structure.html docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md
git commit -m "docs: record joint-suggestions module in project structure + notes"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** engine (`suggestJointsFor`) → Task 3; `contactPair` → Task 2; `synthHit` + type → Task 1; classification/validation (dado+M&T tee, T&G edge, half-lap) → Task 3; ordering/cap → Task 3; apply dispatcher → Task 5; `SuggestionsPanel` → Task 4; wiring → Task 5; tests (contact, per-type, already-joined, negatives, round-trip, panel) → Tasks 2–4; docs → Task 6. Finger explicitly deferred (Non-Goal) — no task, by design.

**Placeholder scan:** none — every code step is complete and runnable.

**Type consistency:** `JointSuggestion` variant fields (`housingPartId`/`housingFace`/`housedPartId`/`housedEnd`, `mortisePartId`/`mortiseFace`/`tenonPartId`/`tenonEnd`, `groovePartId`/`grooveEdge`/`tonguePartId`/`tongueEdge`, `partAId`/`partBId`, `neighborId`) are identical across the type definition (Task 1), the engine (Task 3), the panel (Task 4), and the apply dispatcher (Task 5). `synthHit`, `contactPair`, `suggestJointsFor` signatures match their call sites. Gate signatures (`isValidDadoSeat(housing, housingFace, housed, housedEnd)`, `isValidMortiseTenon(mortise, mortiseFace, tenon, tenonEnd)`, `isValidTongueGroove(groove, grooveEdge, tongue, tongueEdge)`, `isValidHalfLap(a, b)`) match `src/geom/*`. `onAdd*` signatures (`onAddHalfLap(aId, bId)`, `onAddJoint(housingHit, housedHit)`, `onAddMortiseTenon(mortiseHit, tenonHit)`, `onAddTongueGroove(grooveHit, tongueHit)`) match `useScene`.
