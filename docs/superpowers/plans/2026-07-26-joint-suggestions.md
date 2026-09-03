# Joint Suggestions Plan

> **Consolidated plan.** This file merges the six joint-suggestion plans, previously separate files, in date order. Each section below is the original plan verbatim, its headings demoted one level to nest under this document.

**Sections:**
- **Auto-Suggest Joints** — spec `docs/superpowers/specs/2026-07-26-auto-suggest-joints-design.md`, notes `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- **Finger-Joint Suggestions** — spec `docs/superpowers/specs/2026-07-27-finger-joint-suggestions-design.md`, notes `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- **Suggestion Face Highlight** — spec `docs/superpowers/specs/2026-07-27-suggestion-face-highlight-design.md`, notes `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- **Suggestion Hover Highlight** — spec `docs/superpowers/specs/2026-07-27-suggestion-hover-highlight-design.md`, notes `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- **Scene Suggestions Pair Grouping** — spec `docs/superpowers/specs/2026-08-09-scene-suggestions-pair-grouping-design.md`, notes `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md`
- **Joint Checklist** — spec `docs/superpowers/specs/2026-08-17-joint-checklist-design.md`, notes `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md`

**Related spec without its own plan:** `docs/superpowers/specs/2026-08-07-scene-wide-suggestions-design.md` (scene-wide suggestions, 2026-08-07) — the increment that moved suggestions from the selected board to the whole scene. It had no dedicated plan file; its work was carried by the Pair Grouping and Joint Checklist sections above. Thread: `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md`.


---

## Auto-Suggest Joints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete — the feature is shipped and carries a **Done** badge in `project-structure.html`'s roadmap. Step checkboxes in this file were never ticked as the work went; the record of what landed and why is the Notes file named above.**

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

#### Task 1: `JointSuggestion` type + `synthHit`

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

#### Task 2: `contactPair` — infer the physically-meeting faces

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

#### Task 3: `suggestJointsFor` — the suggestion engine

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

#### Task 4: `SuggestionsPanel` component

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

#### Task 5: Wire suggestions into App + Sidebar

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

#### Task 6: Docs

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

### Self-Review (completed by plan author)

**Spec coverage:** engine (`suggestJointsFor`) → Task 3; `contactPair` → Task 2; `synthHit` + type → Task 1; classification/validation (dado+M&T tee, T&G edge, half-lap) → Task 3; ordering/cap → Task 3; apply dispatcher → Task 5; `SuggestionsPanel` → Task 4; wiring → Task 5; tests (contact, per-type, already-joined, negatives, round-trip, panel) → Tasks 2–4; docs → Task 6. Finger explicitly deferred (Non-Goal) — no task, by design.

**Placeholder scan:** none — every code step is complete and runnable.

**Type consistency:** `JointSuggestion` variant fields (`housingPartId`/`housingFace`/`housedPartId`/`housedEnd`, `mortisePartId`/`mortiseFace`/`tenonPartId`/`tenonEnd`, `groovePartId`/`grooveEdge`/`tonguePartId`/`tongueEdge`, `partAId`/`partBId`, `neighborId`) are identical across the type definition (Task 1), the engine (Task 3), the panel (Task 4), and the apply dispatcher (Task 5). `synthHit`, `contactPair`, `suggestJointsFor` signatures match their call sites. Gate signatures (`isValidDadoSeat(housing, housingFace, housed, housedEnd)`, `isValidMortiseTenon(mortise, mortiseFace, tenon, tenonEnd)`, `isValidTongueGroove(groove, grooveEdge, tongue, tongueEdge)`, `isValidHalfLap(a, b)`) match `src/geom/*`. `onAdd*` signatures (`onAddHalfLap(aId, bId)`, `onAddJoint(housingHit, housedHit)`, `onAddMortiseTenon(mortiseHit, tenonHit)`, `onAddTongueGroove(grooveHit, tongueHit)`) match `useScene`.


---

## Finger-Joint Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest finger (box) joints for boards forming a right-angle corner, completing the auto-suggest-joints feature's fifth and final joint type.

**Architecture:** A new `cornerPair(a, b)` detector in `src/scene/suggestJoints.ts` finds the corner: world-AABB adjacency, then each board's end face pointing toward the other, then a proximity gate requiring the two end-face centres to actually meet. All joint-specific validation delegates to the existing `isValidFingerJoint`. A fifth `JointSuggestion` variant and one engine branch emit it; one dispatcher arm replays it through the existing `onAddFingerJoint` creator. No geometry-kernel, worker, file-format, or `Joint` data-model change.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Vitest + happy-dom, Tailwind v4. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-07-27-finger-joint-suggestions-design.md`
**Notes:** `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` (this feature's existing thread)

**Conventions (every task):**
- Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).
- `import type { … }` for type-only imports. No `any`. Named exports.
- Commit messages: short imperative summary. Do **not** include model identifiers.
- Prettier auto-formats on save via a hook; its reformatting is not a deviation.

**Verified fixture geometry (used across Tasks 1–2).** These were derived by hand from `composeWorldMatrix`; do **not** substitute fixtures from `fingerjoint.test.ts`, which are geometrically arbitrary because the creator seats the boards.

With rotation `Ry = -90°`, a board's local axes map to world as: local X → world **+Z**, local Y → world **+Y**, local Z → world **−X**. So a board at position `p` with dims `L×W×T` occupies world `x ∈ [p.x − T, p.x]`, `y ∈ [p.y, p.y + W]`, `z ∈ [p.z, p.z + L]`.

| Fixture | World AABB | Centre |
| --- | --- | --- |
| `cornerA` (200×100×18, no rotation, origin) | x[0,200] y[0,100] z[0,18] | (100, 50, 9) |
| `cornerB` (150×100×18, Ry=−90, pos (200,0,18)) | x[182,200] y[0,100] z[18,168] | (191, 50, 93) |
| `faceStandB` (150×100×18, Ry=−90, pos (138,0,18)) | x[120,138] y[0,100] z[18,168] | (129, 50, 93) |

- `cornerA`/`cornerB` form a flush corner: A's `+X` end plane is x=200, and B's outer face is exactly x=200 while B rests on A's `+Z` face. End centres (200,50,9) and (191,50,18) are **12.73 mm** apart; threshold is (18+18)/2+1 = **19** → accepted.
- `faceStandB` is the false-positive case: same orientation and widths, but standing mid-face. End centres (200,50,9) and (129,50,18) are **71.6 mm** apart → rejected by the proximity gate only. `isValidFingerJoint` passes for it, so this test genuinely protects the gate.

---

#### Task 1: `cornerPair` corner detector

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

This task adds only the detector. No type change, so the build stays green throughout.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/suggestJoints.test.ts`. Add `cornerPair` to the **existing** `import { … } from './suggestJoints'` line rather than a duplicate import.

```ts
// Flush box corner: cornerA's +X end meets cornerB's -X end; shared edge runs along world Y.
const cornerA = board({ id: 'CA', length: 200, width: 100, thickness: 18 })
const cornerB = board({
  id: 'CB',
  length: 150,
  width: 100,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 200, y: 0, z: 18 },
})

// Same orientation and widths, but standing on cornerA's broad face mid-span rather than at its end.
const faceStandB = board({
  id: 'FS',
  length: 150,
  width: 100,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 138, y: 0, z: 18 },
})

test('cornerPair finds the two end faces of a flush right-angle corner', () => {
  expect(cornerPair(cornerA, cornerB)).toEqual({ endA: '+X', endB: '-X' })
})

test('cornerPair returns null for separated boards', () => {
  expect(cornerPair(farA, farB)).toBeNull()
})

test('cornerPair rejects a board standing mid-face, not at an end', () => {
  expect(cornerPair(cornerA, faceStandB)).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `cornerPair is not a function` / not exported.

- [ ] **Step 3: Write the implementation**

In `src/scene/suggestJoints.ts`, extend two existing import lines (do not add duplicates):

```ts
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { faceAxes, computeLocalFaceCenter } from './snapMath'
```

Then add below `contactPair` (which ends with `return faceA && faceB ? { faceA, faceB } : null`) and above `const KIND_PRIORITY`:

```ts
const NON_BROAD_FACES: Face[] = ['+X', '-X', '+Y', '-Y']

function aabbCenter(box: { min: Vec3; max: Vec3 }): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  }
}

function endTowardPoint(b: BoardPart, selfCenter: Vec3, target: Vec3): Face | null {
  const d = {
    x: target.x - selfCenter.x,
    y: target.y - selfCenter.y,
    z: target.z - selfCenter.z,
  }
  let best: Face | null = null
  let bestDot = 0 // strictly positive: the end must actually face the other board
  for (const f of NON_BROAD_FACES) {
    const n = worldFaceNormal(b, f)
    const dot = n.x * d.x + n.y * d.y + n.z * d.z
    if (dot > bestDot) {
      bestDot = dot
      best = f
    }
  }
  return best
}

function endFaceCenterWorld(b: BoardPart, f: Face): Vec3 {
  const local = computeLocalFaceCenter(FACE_NORMALS[f], b)
  const [x, y, z] = applyMatrixToPoint(composeWorldMatrix(b), local.x, local.y, local.z)
  return { x, y, z }
}

export function cornerPair(a: BoardPart, b: BoardPart): { endA: Face; endB: Face } | null {
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null
  }
  const ca = aabbCenter(A)
  const cb = aabbCenter(B)
  const endA = endTowardPoint(a, ca, cb)
  const endB = endTowardPoint(b, cb, ca)
  if (!endA || !endB) return null

  // Orientation alone is not enough: a board standing on A's broad face, merely off-centre toward
  // A's +X, would otherwise be reported as being at A's +X end. In a flush corner the two end
  // centres are offset by about (Ta/2, Tb/2), so their distance never exceeds (Ta + Tb) / 2.
  const pa = endFaceCenterWorld(a, endA)
  const pb = endFaceCenterWorld(b, endB)
  const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)
  if (d > (a.thickness + b.thickness) / 2 + TOUCH_TOL) return null

  return { endA, endB }
}
```

Also change the existing `aabbCenterDist` to reuse the new helper instead of duplicating the centre arithmetic (the **only** modification to existing logic in this plan; behaviour-preserving, covered by the existing sort-order test):

```ts
function aabbCenterDist(a: BoardPart, b: BoardPart): number {
  const ca = aabbCenter(worldAabb(a))
  const cb = aabbCenter(worldAabb(b))
  let sum = 0
  for (const ax of WORLD_AXES) sum += (ca[ax] - cb[ax]) * (ca[ax] - cb[ax])
  return Math.sqrt(sum)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS — the 3 new tests plus all 12 pre-existing ones (15 total).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "feat: cornerPair right-angle corner detection for finger joints"
```

---

#### Task 2: Fifth suggestion variant + engine branch

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Modify: `src/ui/SuggestionsPanel.tsx`
- Test: `src/scene/suggestJoints.test.ts`

**Why the panel is in this task:** `KIND_LABEL` is typed `Record<JointSuggestion['kind'], string>`, so adding the fifth variant is a **compile error** until the label exists. Splitting them would leave the build red at a commit boundary.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/suggestJoints.test.ts`:

```ts
test('a right-angle corner suggests a finger joint', () => {
  expect(kinds([cornerA, cornerB], 'CA')).toContain('finger')
})

test('a board standing mid-face does not suggest a finger joint', () => {
  expect(kinds([cornerA, faceStandB], 'CA')).not.toContain('finger')
})
```

Then extend the **existing** round-trip test (`every emitted suggestion round-trips through its validity gate`) so the corner scene is covered and the new kind is asserted. Add the corner scene to its `scenes` array:

```ts
    { parts: [cornerA, cornerB], sel: 'CA' },
```

and add a `finger` arm to its `if/else` chain, before the final `else` (which handles tongue-groove):

```ts
      } else if (s.kind === 'finger') {
        expect(
          isValidFingerJoint(
            asBoard(parts, s.partAId),
            s.endA,
            asBoard(parts, s.partBId),
            s.endB,
          ),
        ).toBe(true)
      } else if (s.kind === 'tongue-groove') {
```

> The existing chain's final `else` (at `suggestJoints.test.ts:158`) assumes tongue-groove. Convert it into `else if (s.kind === 'tongue-groove')` as shown so the new kind cannot fall into it. This change is **compile-forced**: once the `finger` variant exists, `s` in the bare `else` narrows to `finger | tongue-groove`, and `s.groovePartId` stops type-checking — so it cannot be silently skipped.

Add `isValidFingerJoint` to the test file's imports:

```ts
import { isValidFingerJoint } from '../geom/fingerjoint'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — the corner scene yields no `'finger'` kind (`toContain` fails).

- [ ] **Step 3: Add the variant, label, engine branch, and priority**

3a. In `src/scene/suggestJoints.ts`, add a fifth member to the `JointSuggestion` union (after the `tongue-groove` member, inside the same parenthesised union):

```ts
    | { kind: 'finger'; partAId: PartId; endA: Face; partBId: PartId; endB: Face }
```

3b. Add the import for the gate, alongside the other `isValid*` imports:

```ts
import { isValidFingerJoint } from '../geom/fingerjoint'
```

3c. Add `'finger'` to `KIND_PRIORITY`, between `'mortise-tenon'` and `'tongue-groove'`:

```ts
const KIND_PRIORITY: JointSuggestion['kind'][] = [
  'halflap',
  'dado',
  'mortise-tenon',
  'finger',
  'tongue-groove',
]
```

3d. In `suggestJointsFor`, insert the corner branch **after** the `isValidHalfLap` block and **before** `const pair = contactPair(s, t)`. Placement matters: `contactPair` is followed by `if (!pair) continue`, so a corner must be detected before that early return.

```ts
    // A right-angle corner is neither an anti-parallel face contact nor a coplanar cross, so it is
    // detected on its own rather than through the contactPair classification below.
    const corner = cornerPair(s, t)
    if (corner && isValidFingerJoint(s, corner.endA, t, corner.endB)) {
      out.push({
        kind: 'finger',
        neighborId: t.id,
        partAId: s.id, // lead board — stays put, so it must be the selected one
        endA: corner.endA,
        partBId: t.id, // mating board — auto-seats into the corner
        endB: corner.endB,
      })
    }
```

3e. In `src/ui/SuggestionsPanel.tsx`, add the label to `KIND_LABEL`:

```ts
  finger: 'Finger joint',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts && pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: PASS — 17 tests in the engine file, 3 in the panel file.

Then confirm the three shipped fixtures are undisturbed — the existing `toEqual` assertions for the tee (`['dado','mortise-tenon']`), edge (`['tongue-groove']`), and crossing (`['halflap']`) scenes must still pass unchanged. They are the regression guard for this branch being purely additive; if `'finger'` leaked into any of them, those tests fail. **Do not add duplicate regression tests** — these already cover it.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts src/ui/SuggestionsPanel.tsx
git commit -m "feat: emit finger-joint suggestions for right-angle corners"
```

---

#### Task 3: Apply dispatcher arm

**Files:**
- Modify: `src/App.tsx`

**Highest-risk step in this plan.** `applySuggestion`'s `switch` has no `never` exhaustiveness guard, so a missing `case 'finger'` **compiles cleanly and silently does nothing** when the user clicks Add. There is no test that catches it. Verify by reading the committed diff.

- [ ] **Step 1: Add the dispatcher arm**

In `src/App.tsx`, inside `applySuggestion`'s `switch (s.kind)`, add after the `'tongue-groove'` case:

```ts
        case 'finger':
          return onAddFingerJoint(synthHit(s.partAId, s.endA), synthHit(s.partBId, s.endB))
```

`onAddFingerJoint` is already destructured from `useScene()` in this file — do not re-destructure it.

- [ ] **Step 2: Add the dependency**

Extend `applySuggestion`'s `useCallback` dependency array to include it:

```ts
    [onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddTongueGroove, onAddFingerJoint],
```

- [ ] **Step 3: Verify the arm exists and the full gate is green**

Run: `grep -n "case 'finger'" src/App.tsx`
Expected: exactly one match inside `applySuggestion`.

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `pnpm build` produces `dist/` with no TypeScript errors. (Do not attempt to run the dev server or a browser.)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: apply finger-joint suggestions through onAddFingerJoint"
```

---

#### Task 4: Docs

**Files:**
- Modify: `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Append to the notes file**

Keep one thread for this feature — append to the existing notes file rather than starting a second. Add:

```markdown
## 2026-07-27 — finger joints added (feature now covers all five joint types)

- `cornerPair` detects the right-angle corner `contactPair` cannot model: world-AABB adjacency, then
  each board's end face pointing toward the other, then a proximity gate.
- The proximity gate was **not** in the approved spec — planning found that without it, a board
  standing on another's broad face, off-centre toward one end, is reported as being at that end and
  passes `isValidFingerJoint` (which checks orientation and widths, never position). Threshold is
  `(Ta + Tb) / 2 + TOUCH_TOL`, derived from the flush-corner offset, not tuned. Same class of bug as
  the enumeration flaw recorded on 2026-07-26.
- Role assignment is load-bearing: `FingerJoint.partAId` stays put and `partBId` auto-seats, so the
  **selected** board is always A — clicking Add never moves the board the user selected.
- The dispatcher arm in `App.tsx` is not compile-enforced (the switch has no `never` guard), unlike
  `KIND_LABEL` which is. A missing arm would silently no-op.
```

- [ ] **Step 2: Update `project-structure.html`**

Read the file first and match its existing markup. Update the `suggestJoints.ts` row's description so it reflects corner detection and all five joint types — e.g. change "`contactPair` face detection + per-type validity" to "`contactPair` face + `cornerPair` corner detection + per-type validity". Change nothing else; leave the `AUTOGEN` blocks alone.

- [ ] **Step 3: Verify nothing else broke**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: still green (docs-only changes).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md project-structure.html
git commit -m "docs: record finger-joint corner detection in notes + structure"
```

---

### Self-Review (completed by plan author)

**Spec coverage:** `cornerPair` + `aabbCenter` + `endTowardPoint` + `endFaceCenterWorld` + `NON_BROAD_FACES` → Task 1; the `aabbCenterDist` cleanup → Task 1; fifth variant + engine branch + `KIND_PRIORITY` → Task 2; `KIND_LABEL` → Task 2 (moved from its own task because the type makes it a compile error); dispatcher arm + dependency → Task 3; tests (corner, far-apart, false-positive, engine emit, round-trip extension) → Tasks 1–2; the spec's "additive regression" requirement → satisfied by the existing `toEqual` fixtures, verified in Task 2 Step 4 rather than duplicated; docs → Task 4.

**Placeholder scan:** none — every step contains runnable code or an exact command.

**Type consistency:** the variant's fields (`partAId`, `endA`, `partBId`, `endB`) are identical across the union (Task 2 3a), the engine push (3d), the round-trip test (Task 2 Step 1), and the dispatcher (Task 3) — and match `FingerJoint` in `types.ts:170-180`. `cornerPair`'s return shape `{ endA, endB }` matches all three call sites. Verified signatures against source: `isValidFingerJoint(a, endA, b, endB)` (`fingerjoint.ts:60`), `computeLocalFaceCenter(localFaceNormal, part)` (`snapMath.ts:40`), `applyMatrixToPoint(m, x, y, z)` (`transform.ts:50`), `onAddFingerJoint(hitA, hitB)` (`useScene.ts:978`), `worldAabb(b) → { min, max }` (`halflap.ts:17`).

**Fixture arithmetic:** hand-derived and cross-checked against the three shipped fixtures — `cornerPair` returns `null` for the crossing pair (coincident centres ⇒ no positive dot), and the tee (91.5 mm apart) and edge (anti-parallel ends) pairs are rejected, so no existing assertion changes.
</content>


---

## Suggestion Face Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a joint suggestion outlines the two faces that joint would cut, so the three suggestions on a single corner become visually distinguishable.

**Architecture:** Two pure helpers in `src/scene/suggestJoints.ts` — `suggestionFaceRefs` maps a suggestion to the `(partId, face)` pairs it would cut, and `faceHitForDisplay` builds a render-ready `FaceHit` with a **world** `faceNormal` (which `synthHit` does not provide, and which the viewport's 1mm outline offset requires). `App.tsx` holds the hovered *suggestion* and derives both the existing board tint and the new outlines. `Viewport` draws them with two dedicated amber LineLoops, kept separate from the gesture-owned ones.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Three.js, Vitest + happy-dom + @testing-library/react. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-07-27-suggestion-face-highlight-design.md`
**Notes:** `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` (this feature's existing thread)

**Conventions (every task):**
- Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).
- `import type { … }` for type-only imports. No `any`.
- Commit messages: short imperative summary. Do **not** include model identifiers.
- Prettier auto-formats on save via a hook; its reformatting is not a deviation.

**The bug being fixed (context for every task).** `updateHighlight` in `src/render/viewport.tsx` builds an outline from `computeFaceCorners(face, part)` — which reads `face.localFaceNormal` — then offsets it 1mm clear of the surface along `face.faceNormal`, expecting a **world** normal. `synthHit` sets *both* fields to the same **local** vector. Harmless for the apply path (creators read only `localFaceNormal`), but for rendering it means outlines on rotated boards get pushed the wrong way and sink into the solid. **Do not "fix" `synthHit`** — its local/zeroed shape is what the `onAdd*` creators expect and the round-trip test asserts. Task 1 adds a separate display helper instead.

**Ordering note.** Task 2 changes `onHoverSuggestion`'s signature, which compile-couples `SuggestionsPanel` → `sidebar.tsx` → `App.tsx`; those must land in one commit or the build is red at a commit boundary. Task 1 (pure helpers) and Task 3 (viewport prop) are independently safe.

---

#### Task 1: Pure helpers — `suggestionFaceRefs` and `faceHitForDisplay`

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

Pure functions, no React, no Three.js. Nothing consumes them yet — that is Task 2, not a gap.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/suggestJoints.test.ts`. Add `suggestionFaceRefs` and `faceHitForDisplay` to the **existing** `import { … } from './suggestJoints'` line rather than a duplicate import. The `board()` factory already exists in this file — reuse it.

```ts
test('suggestionFaceRefs returns the faces each joint kind would cut', () => {
  expect(
    suggestionFaceRefs({ kind: 'halflap', neighborId: 'B', partAId: 'A', partBId: 'B' }),
  ).toEqual([])

  expect(
    suggestionFaceRefs({
      kind: 'dado',
      neighborId: 'B',
      housingPartId: 'A',
      housingFace: '+Z',
      housedPartId: 'B',
      housedEnd: '+X',
    }),
  ).toEqual([
    { partId: 'A', face: '+Z' },
    { partId: 'B', face: '+X' },
  ])

  expect(
    suggestionFaceRefs({
      kind: 'mortise-tenon',
      neighborId: 'B',
      mortisePartId: 'A',
      mortiseFace: '+Z',
      tenonPartId: 'B',
      tenonEnd: '-X',
    }),
  ).toEqual([
    { partId: 'A', face: '+Z' },
    { partId: 'B', face: '-X' },
  ])

  expect(
    suggestionFaceRefs({
      kind: 'tongue-groove',
      neighborId: 'B',
      groovePartId: 'A',
      grooveEdge: '+Y',
      tonguePartId: 'B',
      tongueEdge: '-Y',
    }),
  ).toEqual([
    { partId: 'A', face: '+Y' },
    { partId: 'B', face: '-Y' },
  ])

  expect(
    suggestionFaceRefs({
      kind: 'finger',
      neighborId: 'B',
      partAId: 'A',
      endA: '+X',
      partBId: 'B',
      endB: '-X',
    }),
  ).toEqual([
    { partId: 'A', face: '+X' },
    { partId: 'B', face: '-X' },
  ])
})

test('faceHitForDisplay keeps the local normal and adds the world normal', () => {
  // Unrotated: world normal equals local normal.
  const flat = board({ id: 'F' })
  const hFlat = faceHitForDisplay(flat, '+X')
  expect(hFlat.partId).toBe('F')
  expect(hFlat.localFaceNormal).toEqual({ x: 1, y: 0, z: 0 })
  expect(hFlat.faceNormal.x).toBeCloseTo(1)
  expect(hFlat.faceNormal.y).toBeCloseTo(0)
  expect(hFlat.faceNormal.z).toBeCloseTo(0)

  // Rotated Ry=-90: local +X maps to world +Z. This is the case that catches the bug —
  // an unrotated board cannot distinguish a world normal from a local one.
  const spun = board({ id: 'R', rotation: { x: 0, y: -90, z: 0 } })
  const hSpun = faceHitForDisplay(spun, '+X')
  expect(hSpun.localFaceNormal).toEqual({ x: 1, y: 0, z: 0 })
  expect(hSpun.faceNormal.x).toBeCloseTo(0)
  expect(hSpun.faceNormal.y).toBeCloseTo(0)
  expect(hSpun.faceNormal.z).toBeCloseTo(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `suggestionFaceRefs is not a function` / `faceHitForDisplay is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/scene/suggestJoints.ts`, add both functions immediately after `synthHit` (which ends around line 64, before `const EPS = 1e-4`). `worldFaceNormal` is defined further down in the same module and is hoisted, so calling it here is fine.

```ts
export function suggestionFaceRefs(s: JointSuggestion): Array<{ partId: PartId; face: Face }> {
  switch (s.kind) {
    case 'halflap':
      return [] // crossing overlap — no single pair of faces
    case 'dado':
      return [
        { partId: s.housingPartId, face: s.housingFace },
        { partId: s.housedPartId, face: s.housedEnd },
      ]
    case 'mortise-tenon':
      return [
        { partId: s.mortisePartId, face: s.mortiseFace },
        { partId: s.tenonPartId, face: s.tenonEnd },
      ]
    case 'tongue-groove':
      return [
        { partId: s.groovePartId, face: s.grooveEdge },
        { partId: s.tonguePartId, face: s.tongueEdge },
      ]
    case 'finger':
      return [
        { partId: s.partAId, face: s.endA },
        { partId: s.partBId, face: s.endB },
      ]
    default: {
      // A new suggestion kind must declare its faces here, not silently highlight nothing.
      const _exhaustive: never = s
      throw new Error(`unhandled suggestion kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

// Render-ready hit: computeFaceCorners reads localFaceNormal, while updateHighlight's 1mm
// clearance offset reads faceNormal and needs it in WORLD space. synthHit sets both to the
// local normal, which is correct for the onAdd* creators but wrong for drawing.
export function faceHitForDisplay(part: BoardPart, face: Face): FaceHit {
  return {
    partId: part.id,
    faceNormal: worldFaceNormal(part, face),
    faceCenter: ZERO,
    localFaceNormal: FACE_NORMALS[face],
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}
```

All of `worldFaceNormal`, `FACE_NORMALS`, `ZERO`, `BoardPart`, `Face`, `FaceHit`, `PartId` already exist in this file — no new imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS — the 2 new tests plus all 17 pre-existing ones (19 total).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "feat: suggestionFaceRefs + faceHitForDisplay helpers"
```

---

#### Task 2: Hover state carries the suggestion

**Files:**
- Modify: `src/ui/SuggestionsPanel.tsx`
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/SuggestionsPanel.test.tsx`

Must land as ONE commit: changing `onHoverSuggestion`'s signature compile-couples panel → sidebar → App.

`src/ui/sidebar.test.tsx` needs **no change** — its `props()` helper supplies `onHoverSuggestion: vi.fn()`, which satisfies the new signature too. Do not edit it.

- [ ] **Step 1: Update the failing tests**

In `src/ui/SuggestionsPanel.test.tsx`, the two hover tests currently assert on neighbour ids. Change the three assertions to assert on the suggestion objects themselves:

- In `each row reports its own neighbour on hover`, replace `expect(onHoverSuggestion).toHaveBeenLastCalledWith('B')` with:

```ts
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(twoNeighbors[0])
```

and replace `expect(onHoverSuggestion).toHaveBeenLastCalledWith('C')` with:

```ts
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(twoNeighbors[1])
```

- In `leaving a row clears the hover`, the existing `toHaveBeenLastCalledWith(null)` is already correct — leave it unchanged.

Also rename the first test so it still describes what it asserts:

```ts
test('each row reports its own suggestion on hover', () => {
```

Asserting on distinct suggestion objects preserves the property the distinct-neighbour fixture was added for: a row reporting the *wrong* row's suggestion still fails.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: FAIL — the panel still passes `s.neighborId` (a string), so the object assertions fail.

- [ ] **Step 3: Update the panel**

In `src/ui/SuggestionsPanel.tsx`, change the prop's type in the inline props type from
`onHoverSuggestion: (id: PartId | null) => void` to:

```ts
  onHoverSuggestion: (s: JointSuggestion | null) => void
```

and change the row's enter handler from `onHoverSuggestion(s.neighborId)` to:

```tsx
          onMouseEnter={() => onHoverSuggestion(s)}
```

Leave `onMouseLeave={() => onHoverSuggestion(null)}` as-is.

`PartId` is still used by `partLabel` in this file, so keep its import.

- [ ] **Step 4: Update the sidebar's type declarations**

In `src/ui/sidebar.tsx`, `onHoverSuggestion` is declared in two type positions — `interface SidebarProps` and `EditPanel`'s inline props type. Change **both** from `(id: PartId | null) => void` to:

```ts
  onHoverSuggestion: (s: JointSuggestion | null) => void
```

The two destructures and the two render sites pass the value straight through and need no edit. `JointSuggestion` is already imported as a type in this file. Locate the sites by matching the surrounding `onApplySuggestion` declarations rather than by line number.

- [ ] **Step 5: Update App's state**

In `src/App.tsx`:

5a. Change the state declaration (currently `const [hoveredNeighborId, setHoveredNeighborId] = useState<PartId | null>(null)`) to:

```ts
  const [hoveredSuggestion, setHoveredSuggestion] = useState<JointSuggestion | null>(null)
```

5b. In `applySuggestion`, change `setHoveredNeighborId(null)` to:

```ts
      setHoveredSuggestion(null)
```

5c. Change the `<Viewport>` prop from `highlightedId={hoveredNeighborId}` to:

```tsx
          highlightedId={hoveredSuggestion?.neighborId ?? null}
```

5d. Change the `<Sidebar>` prop from `onHoverSuggestion={setHoveredNeighborId}` to:

```tsx
          onHoverSuggestion={setHoveredSuggestion}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.test.tsx`
Expected: PASS — 5 tests in the panel file, plus the existing sidebar tests.

- [ ] **Step 7: Verify the gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `pnpm build` produces `dist/` with no TypeScript errors (pre-existing opencascade externalization notices and the >500kB chunk warning are fine).

The board tint must still work at this point — `highlightedId` now derives from the suggestion, so hovering still tints the neighbour exactly as before.

- [ ] **Step 8: Commit**

```bash
git add src/ui/SuggestionsPanel.tsx src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.tsx src/App.tsx
git commit -m "refactor: hover state carries the suggestion, not just its neighbour"
```

---

#### Task 3: Draw the face outlines

**Files:**
- Modify: `src/render/viewport.tsx`
- Modify: `src/App.tsx`

No test: `src/render/viewport.tsx` has no test file and the repo tests the geom seam rather than Three.js internals. Do **not** create one. Verification is the gate plus a manual check.

- [ ] **Step 1: Add the prop to `ViewportProps`**

In `src/render/viewport.tsx`, `interface ViewportProps` currently ends with `highlightedId?: PartId | null`. Add after it:

```ts
  suggestionFaces?: FaceHit[] | null
```

`FaceHit` is already imported as a type in this file.

- [ ] **Step 2: Add it to the destructure**

The `Viewport({ … })` destructure currently ends with `highlightedId,`. Add after it:

```ts
  suggestionFaces,
```

- [ ] **Step 3: Add a ref for the two loops**

Next to the existing `const hoverHighlightRef = useRef<THREE.LineLoop | null>(null)`, add:

```ts
  const suggestionHighlightRefs = useRef<(THREE.LineLoop | null)[]>([null, null])
```

- [ ] **Step 4: Create and register the loops**

In the scene-setup effect, the existing block reads:

```ts
    const sourceLoop = new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24))
    const hoverLoop = new THREE.LineLoop(emptyGeo(), snapMat(0x60a5fa))
    sourceLoop.renderOrder = 1
    hoverLoop.renderOrder = 1
    sourceLoop.visible = false
    hoverLoop.visible = false
    scene.add(sourceLoop)
    scene.add(hoverLoop)
    sourceHighlightRef.current = sourceLoop
    hoverHighlightRef.current = hoverLoop
```

Add immediately after it:

```ts
    const suggestionLoops = [
      new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24)),
      new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24)),
    ]
    for (const loop of suggestionLoops) {
      loop.renderOrder = 1
      loop.visible = false
      scene.add(loop)
    }
    suggestionHighlightRefs.current = suggestionLoops
```

Amber `0xfbbf24` matches the hovered board's edge tint, so tint and outlines read as one highlight.

- [ ] **Step 5: Dispose them**

The same effect's cleanup currently contains:

```ts
      sourceHighlightRef.current?.geometry.dispose()
      hoverHighlightRef.current?.geometry.dispose()
      scene.remove(sourceLoop)
      scene.remove(hoverLoop)
      sourceLoop.material.dispose()
      hoverLoop.material.dispose()
```

Add immediately after those lines:

```ts
      for (const loop of suggestionLoops) {
        loop.geometry.dispose()
        scene.remove(loop)
        loop.material.dispose()
      }
```

- [ ] **Step 6: Drive them from the highlight effect**

The highlight effect currently ends with:

```ts
    updateHighlight(sourceHighlightRef.current, sourceFace, 0xfbbf24)
    updateHighlight(hoverHighlightRef.current, hoveredFace, 0x60a5fa)
  }, [sourceFace, hoveredFace, snapPhase, parts])
```

Change it to:

```ts
    updateHighlight(sourceHighlightRef.current, sourceFace, 0xfbbf24)
    updateHighlight(hoverHighlightRef.current, hoveredFace, 0x60a5fa)
    const sf = suggestionFaces ?? []
    updateHighlight(suggestionHighlightRefs.current[0], sf[0] ?? null, 0xfbbf24)
    updateHighlight(suggestionHighlightRefs.current[1], sf[1] ?? null, 0xfbbf24)
  }, [sourceFace, hoveredFace, snapPhase, parts, suggestionFaces])
```

Two loops is exactly right: `suggestionFaceRefs` returns 0 or 2 entries by construction. `updateHighlight` already hides a loop when passed `null`, so half-lap (`[]`) and no-hover (`null`) both clear with no extra branching. Do **not** modify `updateHighlight` itself.

- [ ] **Step 7: Derive the faces in App**

In `src/App.tsx`, add the imports to the **existing** `./scene/suggestJoints` import line (it currently brings in `suggestJointsFor, synthHit`):

```ts
import { suggestJointsFor, synthHit, suggestionFaceRefs, faceHitForDisplay } from './scene/suggestJoints'
```

Then add this memo immediately after the `hoveredSuggestion` state declaration:

```ts
  const suggestionFaces = useMemo(() => {
    if (!hoveredSuggestion) return null
    return suggestionFaceRefs(hoveredSuggestion).flatMap((r) => {
      const p = scene.parts.find((x) => x.id === r.partId)
      return p && p.kind === 'board' ? [faceHitForDisplay(p, r.face)] : []
    })
  }, [hoveredSuggestion, scene.parts])
```

`useMemo` is already imported. `scene.parts` is in the deps so outlines follow a board that moves while hovered.

- [ ] **Step 8: Pass it to `<Viewport>`**

Add after `highlightedId={hoveredSuggestion?.neighborId ?? null}`:

```tsx
          suggestionFaces={suggestionFaces}
```

- [ ] **Step 9: Verify**

Run: `grep -n "suggestionFaces" src/App.tsx src/render/viewport.tsx`
Expected: the memo, the prop pass, the interface entry, the destructure, and the two `updateHighlight` calls — the prop is optional, so a missing wire-up would compile silently.

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `dist/` produced with no TypeScript errors.

Manual check (needs a browser, recommended): `pnpm dev`, build two boards that produce a dado or finger suggestion, select one, hover the row. The neighbour's edges should tint amber **and** two face outlines should appear floating just clear of each board's surface. Rotate a board and re-check that the outlines still sit *outside* the solid rather than z-fighting — that is the bug this slice fixes. Hovering a half-lap row should tint only, with no outlines.

- [ ] **Step 10: Commit**

```bash
git add src/render/viewport.tsx src/App.tsx
git commit -m "feat: outline the faces a hovered suggestion would cut"
```

---

#### Task 4: Docs

**Files:**
- Modify: `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Append to the notes file**

Keep one thread for this feature — append to the existing notes file. Read it first to match its style (dated `##` headings, bullets), then append:

```markdown
## 2026-07-27 — suggestion face outlines

- Hovering a suggestion now outlines the two faces the joint would cut, in addition to tinting the
  neighbour board. This is what makes the three suggestions on one box corner distinguishable —
  Dado, Mortise & tenon and Finger joint all point at the same board but use different faces.
- **Latent bug fixed on the way.** `updateHighlight` builds the outline from `localFaceNormal` but
  offsets it 1mm clear of the surface along `faceNormal`, expecting a WORLD normal. `synthHit` sets
  both to the same LOCAL vector — harmless for the apply path (creators read only `localFaceNormal`)
  but wrong for drawing: on a rotated board the outline was pushed the wrong way, into the solid.
  Added `faceHitForDisplay` rather than changing `synthHit`, whose local/zeroed shape the `onAdd*`
  creators depend on and the round-trip test asserts. The test that pins this uses a ROTATED board;
  an unrotated one cannot tell the two apart.
- `suggestionFaceRefs` carries a `never` guard, so a sixth joint kind is a compile error rather than
  a row that silently highlights nothing.
- Dedicated LineLoops rather than reusing `sourceFace`/`hoveredFace`: those belong to the snap and
  add-joint gestures, and the sidebar stays live during a gesture, so the two would contend.
- Half-lap has no faces, so it degrades to the board tint alone — deliberate, not a gap.
- Hover state changed from `hoveredNeighborId: PartId | null` to `hoveredSuggestion: JointSuggestion
  | null` one slice after landing; the tint now derives `neighborId` from it. The feature needs the
  whole suggestion, and a second parallel callback would have been worse.
```

- [ ] **Step 2: Update `project-structure.html`**

Read the file and match its existing markup. Update the `src/ui/` row for `SuggestionsPanel.tsx` so the hover description mentions the outlines — its `<td>` currently ends with something like "hovering a row highlights the neighbour board via `onHoverSuggestion`". Extend that to note it also outlines the joint's faces. Keep the `<tr><td><code>…</code></td><td>…</td></tr>` structure and the `<code>` tags around identifiers.

Change nothing else — leave the `AUTOGEN` blocks, date stamps, and all other rows untouched.

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: still green (docs-only). Confirm with `git status --porcelain` that only the two doc files are modified.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md project-structure.html
git commit -m "docs: record suggestion face outlines"
```

---

### Self-Review (completed by plan author)

**Spec coverage:** `faceHitForDisplay` → Task 1; `suggestionFaceRefs` (with `never` guard) → Task 1; hover state becomes the suggestion → Task 2; `suggestionFaces` prop + two dedicated amber LineLoops + effect wiring → Task 3; the App memo deriving display hits → Task 3 Step 7; tint preserved via `hoveredSuggestion?.neighborId ?? null` → Task 2 Step 5c; tests for both helpers including the **rotated-board** case → Task 1; panel assertions updated to suggestion objects → Task 2 Step 1; "no viewport test" → stated in Task 3; "`sidebar.test.tsx` needs no change" → stated in Task 2; docs → Task 4. Spec Non-Goals respected: no task modifies `synthHit`, `updateHighlight`, the `sourceFace`/`hoveredFace` props, or any joint-generation logic.

**Placeholder scan:** none — every step carries literal code or an exact command.

**Type consistency:** `suggestionFaceRefs(s: JointSuggestion): Array<{ partId: PartId; face: Face }>` is written identically in Task 1's implementation, Task 1's tests, and Task 3's memo. `faceHitForDisplay(part: BoardPart, face: Face): FaceHit` likewise. `onHoverSuggestion: (s: JointSuggestion | null) => void` matches across the panel (Task 2 Step 3), both sidebar declaration sites (Step 4), and App's setter (Step 5d). `suggestionFaces?: FaceHit[] | null` matches between the interface (Task 3 Step 1), destructure (Step 2), the `updateHighlight` calls (Step 6), and the value passed from App (Step 8). State is `hoveredSuggestion`/`setHoveredSuggestion` in every reference.

**Verified against live code:** `synthHit` ends at line 64 with `const EPS` following; `worldFaceNormal`, `FACE_NORMALS`, `ZERO` are module-private in `suggestJoints.ts`; the viewport's LineLoop creation block and its cleanup (`sourceHighlightRef.current?.geometry.dispose()` … `hoverLoop.material.dispose()`) match the quoted text; the highlight effect's deps are `[sourceFace, hoveredFace, snapPhase, parts]`; the panel test's hover assertions currently read `toHaveBeenLastCalledWith('B')` / `('C')` / `(null)` against a `twoNeighbors` fixture.

**Ordering check:** Task 1 is pure and consumed by nothing, so it is safe alone. Task 2 must be one commit (signature change compile-couples three files). Task 3 depends on Task 1's helpers and Task 2's state, and its optional prop means a missing wire-up compiles silently — hence the explicit `grep` verification in Step 9.


---

## Suggestion Hover Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a row in the sidebar's "Suggested joints" list highlights that suggestion's neighbouring board in the 3D viewport.

**Architecture:** `App.tsx` holds a single `hoveredNeighborId: PartId | null`. `SuggestionsPanel` rows report hover in/out through a new `onHoverSuggestion` prop, threaded along the same App → Sidebar → EditPanel → SuggestionsPanel path the existing suggestion props already take. `App` passes the id to `Viewport` as a new optional `highlightedId` prop, which makes the existing edge-line colour ternary three-state. The highlight deliberately uses the edge-colour channel only — never emissive — because the flash animation's completion handler resets emissive to a hardcoded selected-or-black and would silently wipe it.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Three.js, Vitest + happy-dom + @testing-library/react, Tailwind v4. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-07-27-suggestion-hover-highlight-design.md`
**Notes:** `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` (this feature's existing thread)

**Conventions (every task):**
- Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).
- `import type { … }` for type-only imports. No `any`.
- Commit messages: short imperative summary. Do **not** include model identifiers.
- Prettier auto-formats on save via a hook; its reformatting is not a deviation.

**Why only three tasks.** Making `onHoverSuggestion` a *required* prop compile-couples the whole chain: the moment `SuggestionsPanel` requires it, `sidebar.tsx` fails to typecheck until it passes it, and the moment `SidebarProps` requires it, `App.tsx` fails until it does too. Splitting that chain across commits would leave the build red at a commit boundary, so Task 2 lands the panel, the threading, and the App wiring together. A required prop is preferred over an optional one here precisely because it makes a missing wire-up a compile error rather than a silent no-op.

---

#### Task 1: `Viewport` highlight prop

**Files:**
- Modify: `src/render/viewport.tsx`

Self-contained: the prop is optional, so no caller changes are needed and nothing breaks. It is intentionally unused until Task 2 — that is not a gap.

There is no test for this task. `src/render/viewport.tsx` has no test file; the repo tests the geom seam rather than Three.js internals (see CLAUDE.md). Verification is `pnpm build` plus the manual check in Task 2.

- [ ] **Step 1: Add the prop to the interface**

In `src/render/viewport.tsx`, `interface ViewportProps` currently ends with `flashTarget?: { id: PartId; seq: number } | null`. Add one line after it:

```ts
  highlightedId?: PartId | null
```

- [ ] **Step 2: Add it to the destructure**

The `export function Viewport({ … })` destructure currently ends with `flashTarget,`. Add after it:

```ts
  highlightedId,
```

- [ ] **Step 3: Make the edge-line colour three-state**

Find this block (currently at `src/render/viewport.tsx:478-483`), inside the mesh-management effect:

```ts
    // Selection highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : 0x1a1a1d,
      )
    }
```

Replace it with:

```ts
    // Selection + suggestion-hover highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : id === highlightedId ? 0xfbbf24 : 0x1a1a1d,
      )
    }
```

Selection is checked first so it wins; that branch is unreachable in practice because a suggestion's neighbour is never the selected board, but the ordering makes the intent explicit. Amber `0xfbbf24` already exists in this file's palette (the snap source-face highlight).

**Do NOT touch the emissive loop** immediately below it (`for (const [id, mesh] of meshes.current)`), and **do NOT touch the flash handling** in the animation loop (around `src/render/viewport.tsx:259-280`). The highlight stays off the emissive channel on purpose — see the plan header.

- [ ] **Step 4: Add the dependency**

The same effect's dependency array is currently `}, [parts, geometries, selectedId])` (at `src/render/viewport.tsx:490`). Change it to:

```ts
  }, [parts, geometries, selectedId, highlightedId])
```

Without this the edge colour would not update when the hovered row changes.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean; `pnpm build` produces `dist/` with no TypeScript errors. Pre-existing warnings are fine (opencascade.js Node-module externalization notices, and a >500kB chunk-size warning). Do not run the dev server or a browser.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/render/viewport.tsx
git commit -m "feat: highlightedId prop tints a board's edges in the viewport"
```

---

#### Task 2: Panel hover handlers and full wiring

**Files:**
- Modify: `src/ui/SuggestionsPanel.tsx`
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/SuggestionsPanel.test.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/ui/SuggestionsPanel.test.tsx`, append these two tests. `fireEvent` and `vi` are already imported at the top of the file — do not add duplicate imports.

```tsx
test('hovering a row reports that row’s neighbour', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={suggestions}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  const row = screen.getByText('Dado with Rail 2').closest('div')!
  fireEvent.mouseEnter(row)
  expect(onHoverSuggestion).toHaveBeenCalledWith('B')
})

test('leaving a row clears the hover', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={suggestions}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  const row = screen.getByText('Dado with Rail 2').closest('div')!
  fireEvent.mouseLeave(row)
  expect(onHoverSuggestion).toHaveBeenCalledWith(null)
})
```

The row `<div>` has no role or test id, and React's `onMouseEnter`/`onMouseLeave` do not bubble, so the events must fire on the row itself. The label `<span>`'s parent is the row `<div>`, so `.closest('div')` resolves to it.

**Also update the three existing tests in this file.** `onHoverSuggestion` is a required prop, so every existing `<SuggestionsPanel … />` render call must pass it or the file will not typecheck. Add `onHoverSuggestion={vi.fn()}` to each of the three existing renders.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: FAIL — the two new tests fail because no hover handler is wired (`onHoverSuggestion` is never called).

- [ ] **Step 3: Add the prop and row handlers to the panel**

In `src/ui/SuggestionsPanel.tsx`, add `onHoverSuggestion` to the component's props (both the destructure and the inline type):

```tsx
export function SuggestionsPanel({
  suggestions,
  scene,
  onApply,
  onHoverSuggestion,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (id: PartId | null) => void
}) {
```

`PartId` is already imported as a type on line 1 of this file — no import change needed.

Then add the two handlers to the row `<div>` (currently line 33):

```tsx
        <div
          key={i}
          className="flex items-center gap-1 py-0.5 border-t border-border/30"
          onMouseEnter={() => onHoverSuggestion(s.neighborId)}
          onMouseLeave={() => onHoverSuggestion(null)}
        >
```

- [ ] **Step 4: Thread the prop through the sidebar**

In `src/ui/sidebar.tsx`, add `onHoverSuggestion: (id: PartId | null) => void` in the four places `onApplySuggestion` already appears, mirroring it exactly:

1. `interface SidebarProps` — after `onApplySuggestion: (s: JointSuggestion) => void` (around line 81).
2. The `EditPanel` inline props type — after its `onApplySuggestion` entry (around line 525).
3. The `EditPanel` destructure — after `onApplySuggestion,` (around line 507).
4. The `Sidebar` destructure — after `onApplySuggestion,` (around line 848).

Then pass it at the two render sites:

- The `<SuggestionsPanel … />` inside `EditPanel` (around line 779) becomes:

```tsx
      <SuggestionsPanel
        suggestions={suggestions}
        scene={scene}
        onApply={onApplySuggestion}
        onHoverSuggestion={onHoverSuggestion}
      />
```

- The `<EditPanel … />` render inside `Sidebar` (around line 1062) gains, after `onApplySuggestion={onApplySuggestion}`:

```tsx
            onHoverSuggestion={onHoverSuggestion}
```

`PartId` is already imported as a type in `sidebar.tsx`. Locate each site by matching the surrounding `onApplySuggestion` content rather than trusting the line numbers, which will have drifted.

- [ ] **Step 5: Add the state and wiring in App**

In `src/App.tsx`:

5a. Declare the state **immediately before** `const applySuggestion = useCallback(` (currently around line 65). It must be declared before `applySuggestion` because that callback references the setter:

```ts
  const [hoveredNeighborId, setHoveredNeighborId] = useState<PartId | null>(null)
```

`useState` and the `PartId` type are already imported in this file.

5b. Clear the hover at the very top of `applySuggestion`'s body, before the `switch` — each `case` returns, so clearing before the switch is the only place it runs for every kind:

```ts
    (s: JointSuggestion) => {
      setHoveredNeighborId(null)
      switch (s.kind) {
```

Do **not** add `setHoveredNeighborId` to that `useCallback`'s dependency array. `useState` setters are stable and React's `exhaustive-deps` rule exempts them.

5c. Pass the id to `<Viewport>`, after `flashTarget={flashTarget}` (around line 339):

```tsx
          highlightedId={hoveredNeighborId}
```

5d. Pass the setter to `<Sidebar>`, after `onApplySuggestion={applySuggestion}` (around line 383):

```tsx
          onHoverSuggestion={setHoveredNeighborId}
```

The setter's type is `Dispatch<SetStateAction<PartId | null>>`, which accepts `PartId | null`; passing it where `(id: PartId | null) => void` is expected is sound under parameter contravariance, so no wrapper lambda is needed.

- [ ] **Step 6: Fix the sidebar test's props helper**

`SidebarProps` gained a required field, so `src/ui/sidebar.test.tsx`'s `props()` helper no longer typechecks. It already contains `suggestions: []` and `onApplySuggestion: vi.fn()` (around lines 100-101). Add after them:

```ts
    onHoverSuggestion: vi.fn(),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.test.tsx`
Expected: PASS — 5 tests in `SuggestionsPanel.test.tsx` (3 existing + 2 new), plus the existing sidebar tests.

- [ ] **Step 8: Verify the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `pnpm build` produces `dist/` with no TypeScript errors.

Manual check (recommended, not required — needs a browser): `pnpm dev`, add two boards positioned so a suggestion appears, select one, then hover the suggestion row. The neighbouring board's edges should turn amber and return to normal when the mouse leaves. Clicking **Add** should clear the highlight as the row disappears.

- [ ] **Step 9: Commit**

```bash
git add src/ui/SuggestionsPanel.tsx src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.tsx src/ui/sidebar.test.tsx src/App.tsx
git commit -m "feat: hovering a joint suggestion highlights the neighbour board"
```

---

#### Task 3: Docs

**Files:**
- Modify: `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Append to the notes file**

Keep one thread for this feature — append to the existing notes file rather than starting a new one. Read it first to match its style (dated `##` headings, bullet entries), then append:

```markdown
## 2026-07-27 — suggestion hover highlight

- Hovering a Suggested joints row lights the neighbouring board's edges amber (`0xfbbf24`) in the
  viewport, so "Dado with Rail 2" is self-explanatory. Matters more now that one box corner can list
  Dado, Mortise & tenon and Finger joint together.
- **Edge colour only, never emissive.** Selection uses both channels, so mirroring it is the
  instinct — but the flash animation's completion handler (`viewport.tsx`, animation loop) resets a
  mesh's emissive to a hardcoded `selected ? 0x222244 : 0x000000`. An emissive-based highlight would
  be silently wiped when a flash finished on that board, and stay wiped until `parts`/`geometries`/
  `selectedId`/`highlightedId` next changed. Staying on the edge channel sidesteps it without
  touching working animation code.
- `applySuggestion` clears the hover: applying makes the row unmount, and `onMouseLeave` never fires
  on an unmounted element, which would otherwise leave the board lit indefinitely.
- `onHoverSuggestion` is deliberately a **required** prop through the whole chain, so a missing
  wire-up is a compile error. `Viewport.highlightedId` is optional (matching the existing
  `flashTarget?` convention), so that one is not compile-enforced.
- Face-level highlighting (outlining the two faces a joint would use) was considered and deferred.
  The groundwork exists: `computeFaceCorners` reads only `localFaceNormal`, which `synthHit` sets, so
  suggestion faces feed the existing `updateHighlight` LineLoops directly. Blockers were half-lap
  carrying no faces and the two LineLoops being owned by the snap/gesture modes.
```

- [ ] **Step 2: Update `project-structure.html`**

Read the file first and match its existing markup. Find the `src/ui/` table row for `SuggestionsPanel.tsx`; its description currently reads roughly "Sidebar 'Suggested joints' list with one-click Add (calls `onApplySuggestion`)." Update only that description to mention hover, e.g. append "; hovering a row highlights the neighbour board via `onHoverSuggestion`".

Change nothing else — leave the `AUTOGEN` blocks, date stamps, and all other rows untouched.

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: still green (docs-only changes). Confirm with `git status --porcelain` that only the two doc files are modified.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md project-structure.html
git commit -m "docs: record suggestion hover highlight"
```

---

### Self-Review (completed by plan author)

**Spec coverage:** `hoveredNeighborId` state → Task 2 Step 5a; `onHoverSuggestion` prop + row handlers → Task 2 Steps 3; threading → Task 2 Step 4; `Viewport.highlightedId` + three-state edge colour + effect dependency → Task 1; clear-on-apply → Task 2 Step 5b; panel tests → Task 2 Step 1; `sidebar.test.tsx` props helper → Task 2 Step 6 (the spec lists this file, and it is required, not optional — adding a field to `SidebarProps` breaks the helper); "no viewport unit test" → stated explicitly in Task 1; docs → Task 3. The spec's Non-Goals (no face-level highlight, no emissive change, no engine change) are respected — no task touches `suggestJoints.ts`, the emissive loop, or the flash handler.

**Placeholder scan:** none — every step contains the literal code or an exact command.

**Type consistency:** `onHoverSuggestion: (id: PartId | null) => void` is written identically in the panel props (Task 2 Step 3), all four `sidebar.tsx` sites (Step 4), and the `sidebar.test.tsx` helper (Step 6). `highlightedId?: PartId | null` matches between the `ViewportProps` interface (Task 1 Step 1), the destructure (Step 2), its use in the ternary (Step 3), and the value passed from `App.tsx` (Task 2 Step 5c). The state variable is `hoveredNeighborId` and its setter `setHoveredNeighborId` in every reference. Verified against the live code: `SuggestionsPanel` currently takes exactly `{ suggestions, scene, onApply }` and imports `PartId` as a type on line 1; `sidebar.test.tsx` already has `suggestions`/`onApplySuggestion` in its helper at lines 100-101; `fireEvent` is already imported in `SuggestionsPanel.test.tsx` line 2; `<Viewport>` currently ends its props with `flashTarget={flashTarget}`.

**Ordering check:** Task 1 is safe alone because `highlightedId` is optional. Task 2 must land as one commit because a required `onHoverSuggestion` compile-couples panel → sidebar → App; splitting it would red the build at a commit boundary. This is stated in the plan header so an implementer does not "helpfully" split it.


---

## Scene Suggestions Pair Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the scene-wide joint suggestion list from one row per candidate joint to one row per board pair — 40 rows to 14 on an 8-board carcase — with every option still reachable as a chip on its row.

**Architecture:** A new pure module `src/scene/groupSuggestions.ts` turns the engine's flat `JointSuggestion[]` into `PairGroup[]`. `SceneSuggestionsPanel` renders one row per group with a chip per option. The engine, the apply path and the outline preview are untouched — hover and apply already take a single `JointSuggestion`, and a chip hands back the same object a flat row does today. The scene cap moves from suggestions to pairs so a rendered row is never partial.

**Tech Stack:** TypeScript (strict), React 19, Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn-style Radix primitives.

**Spec:** `docs/superpowers/specs/2026-08-09-scene-suggestions-pair-grouping-design.md`
**Notes:** `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` (this feature's existing thread)

---

### Background the engineer needs

`JointSuggestion` is a discriminated union on `kind` (`src/scene/suggestJoints.ts:27`). Every variant also carries `neighborId`, which means "the other board relative to the selection" and is **meaningless scene-wide** — do not use it here. Use `pairIdsOf(s)` (`suggestJoints.ts:396`), which returns the two board ids for any kind.

Two facts drive the whole design:

1. **`pairIdsOf` returns role order, not a canonical order.** A dado gives `[housingPartId, housedPartId]`; a finger joint gives `[partAId, partBId]`. The same two boards can come back in either order depending on kind and direction. So the group key must be order-independent.

2. **A pair's suggestions are not contiguous.** `suggestJointsForScene` sorts by pair distance and tiebreaks on `KIND_PRIORITY` (`suggestJoints.ts:386-390`), so equidistant pairs interleave. On a real carcase, Left Side + Bottom and Left Side + Top are both 525 mm apart and come back as `dado(LS+Bottom), dado(LS+Top), …, mortise-tenon(LS+Bottom), …`. **Grouping must key a map, not collapse adjacent runs.** An adjacency implementation passes a two-board fixture and silently splits every real pair.

Run the full check suite before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

### File Structure

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

#### Task 1: `groupByPair` — one group per board pair

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

#### Task 2: Cap rows, not suggestions

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

#### Task 3: Remove the flat cap from the engine

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

#### Task 4: `orientationArrow` — disambiguate the two-orientation kinds

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

#### Task 5: Render one row per pair with a chip per option

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

#### Task 6: Pin the chip arrows and tooltips

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

#### Task 7: Verify in the browser

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

#### Task 8: Update the architecture reference

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

### Done when

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass
- [ ] The scene panel shows one row per pair; the header counts pairs
- [ ] Chips carry arrows only where a kind is duplicated for that pair
- [ ] Hover and apply behave exactly as before, per chip
- [ ] `MAX_SCENE_SUGGESTIONS` no longer exists; `MAX_SCENE_PAIRS` caps rows
- [ ] Notes and `project-structure.html` updated


---

## Joint Checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the scene suggestions panel into a checklist. Every touching board pair keeps a row in one of three states — jointed (`✓`), open (chips), or no-offer (muted, its own collapsed section) — so the panel answers "have I jointed everything?" rather than only "what can I do next?".

**Architecture:** A new pure module `src/scene/jointChecklist.ts` joins three inputs — the touching-pair set (re-derived from the engine's own adjacency predicate), `scene.joints`, and the engine's suggestions — into `ChecklistRow[]`. The scoring engine is untouched: `suggestJointsForScene` keeps discarding jointed pairs. All rows sort on pair centre distance so a row holds its slot when it flips open → jointed.

**Tech Stack:** TypeScript (strict), React 19, Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn-style Radix primitives.

**Spec:** `docs/superpowers/specs/2026-08-17-joint-checklist-design.md`
**Notes:** `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md`

---

### Background the engineer needs

Four facts drive the whole implementation. Getting any of them wrong produces a checklist that looks right on a two-board fixture and is wrong on a carcase.

1. **An existing joint admits a row on its own — adjacency is the weaker source of truth.** `reconcileJoints.ts:27-29` preserves a joint whose `deriveJoint` returns `null` (it keeps the last-good cuts and position rather than deleting). So a joint outlives its boards being moved apart. Gating rows on `boardsTouch` alone drops that row and silently decrements `jointedCount`. Row admission is `boardsTouch(a, b) || pairHasJoint`.

2. **`groupByPair` currently truncates, and that is a correctness bug once something classifies by it.** `groupSuggestions.ts:36` ends `.slice(0, MAX_SCENE_PAIRS)`. Harmless while the only consumer rendered the groups; fatal here, because "no group for this pair" would become a positive claim of "no joint available". The cap moves up to `buildJointChecklist`. **Task 2 must land before Task 3.**

3. **`PairGroup.aId` is role order, not sorted order.** `groupSuggestions.ts:13-16` warns that `orientationArrow` reads `aId` to decide arrow direction, so "tidying" the ids would silently invert every arrow on real data. Open rows must inherit `aId`/`bId` from the group verbatim; jointed and no-offer rows take board-iteration order.

4. **Distance is computed for every row, not inherited from the suggestion list.** This is the one property that makes the checklist usable — a row that jumps position the moment you joint it loses your place mid-carcase. Task 4 exists solely to pin it.

Run the full check suite before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

### File Structure

| File | Responsibility |
|---|---|
| `src/scene/suggestJoints.ts` | Export `boardsTouch` (extracted) and `aabbCenterDist`; `cornerPair` delegates. |
| `src/scene/suggestJoints.test.ts` | `boardsTouch` cases. |
| `src/scene/groupSuggestions.ts` | Drop the `.slice`. Pure grouping; `MAX_SCENE_PAIRS` stays exported from here. |
| `src/scene/groupSuggestions.test.ts` | Cap test moves out; add a no-truncation test. |
| `src/scene/jointChecklist.ts` | **new.** `buildJointChecklist`, `ChecklistRow`, `PairState`, `JointChecklist`. No React. |
| `src/scene/jointChecklist.test.ts` | **new.** Unit tests for the above. |
| `src/ui/SceneSuggestionsPanel.tsx` | Counter header, `✓` rows, chips on open rows, nested no-offer section. |
| `src/ui/SceneSuggestionsPanel.test.tsx` | New state / counter / hover assertions. |
| `src/ui/sidebar.tsx` | Thread `onHoverPair` through to the panel. |
| `src/App.tsx` | `hoveredPair` state; `highlightedIds` falls back to it. |
| `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md` | Append the outcome. |
| `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` | Close the "Open" item. |
| `project-structure.html` | Add the new module. |

---

#### Task 1: `boardsTouch` — one adjacency predicate the checklist can share

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/suggestJoints.test.ts`. The file already imports `board` and defines `teeH` / `teeD` at lines 22-50:

```ts
// The checklist's denominator is this predicate, so it must agree with the engine's own idea of
// "these two boards meet" rather than being a third private copy.
test('boardsTouch: true for boards that meet, false for separated boards', () => {
  expect(boardsTouch(teeH, teeD)).toBe(true)
  const far = board({ id: 'F', position: { x: 5000, y: 0, z: 0 } })
  expect(boardsTouch(teeH, far)).toBe(false)
})

test('boardsTouch: true for boards touching broad face to broad face', () => {
  const lower = board({ id: 'L', length: 200, width: 100, thickness: 18 })
  const upper = board({
    id: 'U',
    length: 200,
    width: 100,
    thickness: 18,
    position: { x: 0, y: 0, z: 18 },
  })
  expect(boardsTouch(lower, upper)).toBe(true)
})
```

Add `boardsTouch` to the existing import from `./suggestJoints` at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `boardsTouch` is not exported, so the import errors.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/suggestJoints.ts`, insert immediately above `export function contactPair` (currently line 137):

```ts
// The adjacency predicate: do these two boards meet at all? Shared by cornerPair and the scene
// checklist (jointChecklist.ts), which needs exactly the engine's own notion of "touching" for its
// denominator. contactPair deliberately keeps its own fused copy — it derives contactAx and bestGap
// from the same iteration, so delegating here would walk the axes twice for no gain.
export function boardsTouch(a: BoardPart, b: BoardPart): boolean {
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    if (Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax]) > TOUCH_TOL) return false
  }
  return true
}
```

Then replace `cornerPair`'s opening lines (currently 198-203):

```ts
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null
  }
```

with:

```ts
  if (!boardsTouch(a, b)) return null
  const A = worldAabb(a)
  const B = worldAabb(b)
```

This recomputes `worldAabb` once more per call than before. Accepted: `cornerPair` is already the cheaper of the two paths and the alternative is keeping a third copy of the predicate. Do **not** "optimise" it back by inlining.

Finally, add `export` to `aabbCenterDist` (currently line 229) — the checklist needs it as its ordering key:

```ts
export function aabbCenterDist(a: BoardPart, b: BoardPart): number {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS — all tests in the file, including the existing `cornerPair` cases. Those are the parity guard on the extraction: if any of them break, `boardsTouch` does not match the prelude it replaced.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; test count up by 2.

- [ ] **Step 6: Commit**

```bash
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "refactor(scene): extract boardsTouch so the checklist shares the engine's adjacency test"
```

---

#### Task 2: `groupByPair` stops truncating

The cap must move **before** anything classifies by group presence, or beyond 100 pairs the checklist reports "no joint available" for pairs the engine has offers for.

**Files:**
- Modify: `src/scene/groupSuggestions.ts`
- Test: `src/scene/groupSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/groupSuggestions.test.ts`, **replace** the existing test `'caps the number of groups, and the last kept group is complete'` with:

```ts
// The cap moved to buildJointChecklist. It has to: the checklist classifies a pair by whether
// groupByPair returned a group for it, so a truncation here turns "absent because truncated" into
// a positive claim of "no joint available".
test('does not truncate — every pair survives grouping', () => {
  const many: JointSuggestion[] = []
  for (let i = 0; i < MAX_SCENE_PAIRS + 5; i++) {
    many.push(dado('A', `B${i}`))
    many.push(mortiseTenon('A', `B${i}`))
  }
  const groups = groupByPair(many)
  expect(groups).toHaveLength(MAX_SCENE_PAIRS + 5)
  expect(groups[groups.length - 1].options).toHaveLength(2)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: FAIL — `expected length 100 to be 105`.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/groupSuggestions.ts`, change the return of `groupByPair` from:

```ts
  return [...groups.values()].slice(0, MAX_SCENE_PAIRS)
```

to:

```ts
  return [...groups.values()]
```

Update the `MAX_SCENE_PAIRS` doc comment (currently lines 5-8) to say where the cap is now applied:

```ts
// Runaway guard on rows. Applied by buildJointChecklist (jointChecklist.ts), not here: the checklist
// classifies a pair by whether grouping produced a group for it, so truncating before that point
// would report "no joint available" for pairs that have offers. A row is one real decision — an
// 8-board carcase needs 14 and three of them need 42. Note it now bounds *touching* pairs, a
// strictly larger set than the offering pairs it used to bound.
export const MAX_SCENE_PAIRS = 100
```

`MAX_SCENE_PAIRS` stays exported from this module — moving the constant as well as its application would churn imports for no gain.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. `SceneSuggestionsPanel` still renders every group — it has no >100-pair test, so nothing else moves.

- [ ] **Step 6: Commit**

```bash
git add src/scene/groupSuggestions.ts src/scene/groupSuggestions.test.ts
git commit -m "fix(scene): stop truncating in groupByPair so a classifier cannot misread absence"
```

---

#### Task 3: `buildJointChecklist` — three states and the counts

**Files:**
- Create: `src/scene/jointChecklist.ts`
- Test: `src/scene/jointChecklist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/jointChecklist.test.ts`. Fixtures use the real engine rather than hand-built suggestion literals — both are pure and browser-free, and it is the join between them this module exists to make:

```ts
import { test, expect } from 'vitest'
import type { BoardPart, Part } from './types'
import { suggestJointsForScene } from './suggestJoints'
import { defaultDadoJoint } from './defaultJoint'
import { buildJointChecklist } from './jointChecklist'

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

// Perpendicular tee — the engine offers a dado and a mortise-tenon for this pair.
const teeH = board({ id: 'H', length: 200, width: 100, thickness: 20 })
const teeD = board({
  id: 'D',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 100, y: 30, z: 20 },
})

// Broad face on broad face: they touch, but no joint kind applies. Not a half-lap either —
// isValidHalfLap requires a shared stack axis with coincident spans, and these are stacked.
const stackLower = board({ id: 'L', length: 200, width: 100, thickness: 18 })
const stackUpper = board({
  id: 'U',
  length: 200,
  width: 100,
  thickness: 18,
  position: { x: 0, y: 0, z: 18 },
})

function build(parts: Part[], joints = [] as ReturnType<typeof defaultDadoJoint>[]) {
  return buildJointChecklist(parts, joints, suggestJointsForScene(parts, joints))
}

test('a touching pair with offers and no joint is open', () => {
  const c = build([teeH, teeD])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('open')
  expect(c.rows[0].options.length).toBeGreaterThan(0)
  expect(c.rows[0].joints).toEqual([])
})

test('a pair carrying a joint is jointed, and carries no options', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const c = build([teeH, teeD], [joint])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('jointed')
  expect(c.rows[0].joints).toEqual([joint])
  expect(c.rows[0].options).toEqual([])
})

test('a touching pair the engine has no offer for is no-offer, and is not a row', () => {
  const c = build([stackLower, stackUpper])
  expect(c.rows).toEqual([])
  expect(c.unresolved).toHaveLength(1)
  expect(c.unresolved[0].state).toBe('no-offer')
})

test('a non-touching pair produces no row at all', () => {
  const far = board({ id: 'F', position: { x: 5000, y: 0, z: 0 } })
  const c = build([teeH, teeD, far])
  expect([...c.rows, ...c.unresolved].map((r) => r.key)).toEqual(['D|H'])
})

// reconcileJoints preserves a joint whose deriveJoint returns null, so a joint outlives its boards
// being moved apart. Gating rows on adjacency alone would drop it and silently decrement the count.
test('a jointed pair whose boards no longer touch still produces a jointed row', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const moved = { ...teeD, position: { x: 5000, y: 0, z: 0 } }
  const c = build([teeH, moved], [joint])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('jointed')
  expect(c.jointedCount).toBe(1)
})

test('counts exclude no-offer rows so 100% stays reachable', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const c = build([teeH, teeD, stackLower, stackUpper], [joint])
  expect(c.jointedCount).toBe(1)
  expect(c.actionableTotal).toBe(1)
  expect(c.unresolved.length).toBeGreaterThan(0)
})

test('hidden and non-board parts produce no rows', () => {
  const hidden = { ...teeD, visible: false }
  expect(build([teeH, hidden]).rows).toEqual([])
  expect(build([teeH, hidden]).unresolved).toEqual([])
})

test('an empty scene produces empty arrays and zero counts', () => {
  const c = build([])
  expect(c).toEqual({ rows: [], unresolved: [], jointedCount: 0, actionableTotal: 0 })
})

// groupSuggestions.ts:13-16 warns that PairGroup.aId is role order, and that sorting the ids would
// invert every orientation arrow. Open rows must inherit it verbatim.
test('an open row inherits the group role order, not board-iteration order', () => {
  const c = build([teeH, teeD])
  const [x, y] = [c.rows[0].aId, c.rows[0].bId]
  const first = c.rows[0].options[0]
  expect(first.kind === 'dado' && first.housingPartId).toBe(x)
  expect(y).toBe('D')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: FAIL — `Failed to resolve import "./jointChecklist"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/scene/jointChecklist.ts`:

```ts
import type { BoardPart, Joint, Part, PartId } from './types'
import type { JointSuggestion } from './suggestJoints'
import { boardsTouch, aabbCenterDist } from './suggestJoints'
import { groupByPair, MAX_SCENE_PAIRS } from './groupSuggestions'

export type PairState = 'jointed' | 'open' | 'no-offer'

export interface ChecklistRow {
  key: string
  // Open rows preserve PairGroup role order, which orientationArrow reads to point its arrows;
  // jointed and no-offer rows take board-iteration order. See groupSuggestions.ts:13-16.
  aId: PartId
  bId: PartId
  state: PairState
  options: JointSuggestion[]
  joints: Joint[]
  dist: number
}

export interface JointChecklist {
  rows: ChecklistRow[]
  unresolved: ChecklistRow[]
  jointedCount: number
  actionableTotal: number
}

// Float noise must not decide row order: two pairs 525 mm apart can differ in the last bit, and
// falling through to the key tiebreak is what keeps the list stable across rebuilds.
const DIST_EPS = 1e-4

function pairKey(x: PartId, y: PartId): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

// Mirrors pairIdsOf for joints. Local to this module — one consumer, so no shared home until there
// is a second. The never guard makes a sixth joint kind a compile error rather than a pair silently
// reported as unjointed.
function jointPairIds(j: Joint): [PartId, PartId] {
  switch (j.kind) {
    case 'dado':
      return [j.housingPartId, j.housedPartId]
    case 'halflap':
      return [j.partAId, j.partBId]
    case 'mortise-tenon':
      return [j.mortisePartId, j.tenonPartId]
    case 'finger':
      return [j.partAId, j.partBId]
    case 'tongue-groove':
      return [j.groovePartId, j.tonguePartId]
    default: {
      const _exhaustive: never = j
      throw new Error(`unhandled joint kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export function buildJointChecklist(
  parts: Part[],
  joints: Joint[],
  suggestions: JointSuggestion[],
): JointChecklist {
  // The same filter suggestJointsForScene uses. Any divergence would produce rows for pairs the
  // engine never considered.
  const boards = parts.filter((p): p is BoardPart => p.kind === 'board' && p.visible)

  const groups = new Map(groupByPair(suggestions).map((g) => [g.key, g]))
  const jointsByKey = new Map<string, Joint[]>()
  for (const j of joints) {
    const [x, y] = jointPairIds(j)
    const k = pairKey(x, y)
    const existing = jointsByKey.get(k)
    if (existing) existing.push(j)
    else jointsByKey.set(k, [j])
  }

  const rows: ChecklistRow[] = []
  const unresolved: ChecklistRow[] = []

  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i]
      const b = boards[j]
      const key = pairKey(a.id, b.id)
      const js = jointsByKey.get(key)
      // A recorded joint admits the row on its own. reconcileJoints preserves a stale joint, so a
      // joint outlives its boards being moved apart; gating on adjacency alone would drop the row
      // and silently decrement jointedCount.
      if (!js && !boardsTouch(a, b)) continue
      const dist = aabbCenterDist(a, b)
      if (js) {
        rows.push({ key, aId: a.id, bId: b.id, state: 'jointed', options: [], joints: js, dist })
        continue
      }
      const g = groups.get(key)
      if (g) {
        rows.push({
          key,
          aId: g.aId,
          bId: g.bId,
          state: 'open',
          options: g.options,
          joints: [],
          dist,
        })
      } else {
        unresolved.push({
          key,
          aId: a.id,
          bId: b.id,
          state: 'no-offer',
          options: [],
          joints: [],
          dist,
        })
      }
    }
  }

  const capped = rows.slice(0, MAX_SCENE_PAIRS)
  return {
    rows: capped,
    unresolved: unresolved.slice(0, MAX_SCENE_PAIRS),
    // Counted from the capped rows, so the header can never claim more than is rendered.
    jointedCount: capped.filter((r) => r.state === 'jointed').length,
    actionableTotal: capped.length,
  }
}
```

Sorting is deliberately absent — Task 4 adds it against a failing test.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: PASS — 9 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/jointChecklist.ts src/scene/jointChecklist.test.ts
git commit -m "feat(scene): buildJointChecklist classifies every board pair as jointed, open or no-offer"
```

---

#### Task 4: Stable distance ordering

The single most important behavioural property of the feature, and the only one nothing else would catch.

**Files:**
- Modify: `src/scene/jointChecklist.ts`
- Test: `src/scene/jointChecklist.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/jointChecklist.test.ts`:

```ts
// Two uprights on one shelf, at different distances from it, so the row order is non-trivial.
const shelf = board({ id: 'S', length: 400, width: 100, thickness: 20 })
const upNear = board({
  id: 'N',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 180, y: 30, z: 20 },
})
const upFar = board({
  id: 'R',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 20, y: 30, z: 20 },
})

test('rows are ordered by pair centre distance, nearest first', () => {
  const c = build([shelf, upFar, upNear])
  expect(c.rows.map((r) => r.key)).toEqual(['N|S', 'R|S'])
})

// The whole point of computing distance for jointed rows too: joint the nearest pair and the row
// order must not move. Ordering off the suggestion list instead would make a row jump the moment
// you joint it, losing your place halfway through a carcase.
test('a row keeps its position when it flips from open to jointed', () => {
  const parts = [shelf, upFar, upNear]
  const before = build(parts)
  const joint = defaultDadoJoint(shelf, upNear, '+Z', '-X', 'joint_1', 'Dado 1')
  const after = build(parts, [joint])

  expect(after.rows.map((r) => r.key)).toEqual(before.rows.map((r) => r.key))
  expect(after.rows.find((r) => r.key === 'N|S')!.state).toBe('jointed')
  expect(after.rows.find((r) => r.key === 'R|S')!.state).toBe('open')
})

// Equidistant pairs otherwise fall back on board-iteration order and reshuffle as parts are added
// or reordered — the same interleaving trap groupSuggestions.ts:22-26 documents.
test('equidistant pairs come back in deterministic key order', () => {
  const mirrored = board({
    id: 'A',
    length: 80,
    width: 40,
    thickness: 18,
    rotation: { x: 0, y: -90, z: 0 },
    position: { x: 20, y: 30, z: 20 },
  })
  const alsoMirrored = { ...mirrored, id: 'Z' }
  const c = build([shelf, alsoMirrored, mirrored])
  expect(c.rows.map((r) => r.key)).toEqual(['A|S', 'S|Z'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: FAIL — `'rows are ordered by pair centre distance'` returns `['R|S', 'N|S']` (board-iteration order, since `upFar` precedes `upNear` in the array).

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/jointChecklist.ts`, insert immediately before `const capped = ...`:

```ts
  const byDistance = (x: ChecklistRow, y: ChecklistRow) => {
    const d = x.dist - y.dist
    if (Math.abs(d) > DIST_EPS) return d
    return x.key < y.key ? -1 : x.key > y.key ? 1 : 0
  }
  rows.sort(byDistance)
  unresolved.sort(byDistance)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: PASS — 12 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/jointChecklist.ts src/scene/jointChecklist.test.ts
git commit -m "feat(scene): order checklist rows by pair distance so a row holds its slot when jointed"
```

---

#### Task 5: Cap rows and no-offer rows independently

**Files:**
- Test: `src/scene/jointChecklist.test.ts`

Task 3 already wrote the two `.slice` calls. This task pins them, and pins that they are independent — a wall of no-offer rows must not starve the actionable list.

- [ ] **Step 1: Write the tests**

Add `MAX_SCENE_PAIRS` to the test file's imports:

```ts
import { MAX_SCENE_PAIRS } from './groupSuggestions'
```

Append:

```ts
test('caps rows and no-offer rows independently', () => {
  const parts: Part[] = [board({ id: 'B', length: 20000, width: 100, thickness: 20 })]
  // Stacked broad-face-on-broad-face pairs: touching, but no kind applies — all no-offer.
  for (let i = 0; i < MAX_SCENE_PAIRS + 5; i++) {
    parts.push(
      board({
        id: `P${i}`,
        length: 40,
        width: 100,
        thickness: 18,
        position: { x: i * 60, y: 0, z: 20 },
      }),
    )
  }
  const c = build(parts)
  expect(c.unresolved).toHaveLength(MAX_SCENE_PAIRS)
  // The actionable list is bounded by its own cap, not shortened by the no-offer flood.
  expect(c.rows.length).toBeLessThanOrEqual(MAX_SCENE_PAIRS)
  expect(c.actionableTotal).toBe(c.rows.length)
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: PASS — 13 passed. This is a guard test over Task 3's implementation, so it passes immediately. If it fails, the two `.slice` calls in Task 3 were written against one shared budget — fix `jointChecklist.ts`, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/scene/jointChecklist.test.ts
git commit -m "test(scene): pin independent caps on checklist rows and no-offer rows"
```

---

#### Task 6: Render the checklist

**Files:**
- Modify: `src/ui/SceneSuggestionsPanel.tsx`
- Modify: `src/ui/SceneSuggestionsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/ui/SceneSuggestionsPanel.test.tsx`, the existing `scene()` helper returns three boards at the origin with no joints. Those boards all touch (identical AABBs), which is what the existing tests need.

Add to the imports:

```tsx
import type { DadoJoint, PartId } from '../scene/types'
```

Every existing `render(...)` call in the file gains `onHoverPair={vi.fn()}`. Then **replace** the existing test `'the header counts pairs, not suggestions'` with:

```tsx
test('the header counts jointed against actionable', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  expect(screen.getByText(/Joints — 0 \/ 2/)).toBeTruthy()
})
```

and update the two `fireEvent.click(screen.getByText(/All possible joints/))` calls elsewhere in the file to `fireEvent.click(screen.getByText(/Joints —/))`.

Append:

```tsx
const dadoJoint = (housing: PartId, housed: PartId): DadoJoint => ({
  kind: 'dado',
  id: 'joint_1',
  label: 'Dado 1',
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
  offset: 0,
  depth: 6,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 9,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
})

function jointedScene() {
  return { ...scene(), joints: [dadoJoint('A', 'B')] }
}

test('a jointed pair renders a tick and its kind, with no chips', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={jointedScene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/Joints —/))
  expect(screen.getByText(/✓ Left Side \+ Bottom/)).toBeTruthy()
  expect(screen.getByText('Dado')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Dado' })).toBeNull()
})

test('the counter reads jointed over actionable', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[dado('A', 'C')]}
      scene={jointedScene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  expect(screen.getByText(/Joints — 1 \/ 2/)).toBeTruthy()
})

test('hovering a jointed row reports the pair, and leaving clears it', () => {
  const onHoverPair = vi.fn()
  render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={jointedScene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={onHoverPair}
    />,
  )
  fireEvent.click(screen.getByText(/Joints —/))
  const row = screen.getByText(/✓ Left Side \+ Bottom/)
  fireEvent.mouseEnter(row)
  expect(onHoverPair).toHaveBeenLastCalledWith(['A', 'B'])
  fireEvent.mouseLeave(row)
  expect(onHoverPair).toHaveBeenLastCalledWith(null)
})

// The no-offer group is muted, uncounted and closed by default: on a carcase it is noise most of
// the time, and inlining it would re-inflate the row count grouping brought down from 40 to 14.
test('no-offer pairs live in their own section, closed by default', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/Joints —/))
  expect(screen.getByText(/No joint available \(3\)/)).toBeTruthy()
  expect(screen.queryByText('Left Side + Bottom')).toBeNull()
  fireEvent.click(screen.getByText(/No joint available/))
  expect(screen.getByText('Left Side + Bottom')).toBeTruthy()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: FAIL — `Unable to find an element with the text: /Joints —/`. The panel still renders "All possible joints (N)".

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/SceneSuggestionsPanel.tsx`, keep `KIND_LABEL`, `CHIP_LABEL`, `label()` and `describe()` exactly as they are. `KIND_LABEL` is keyed by `JointSuggestion['kind']`, which is the same five-member union as `Joint['kind']`, so it indexes a joint without change.

Replace the `groupSuggestions` import with:

```tsx
import { orientationArrow } from '../scene/groupSuggestions'
import { buildJointChecklist } from '../scene/jointChecklist'
```

and add `PartId` to the type import from `../scene/types`.

Replace the whole `SceneSuggestionsPanel` function with:

```tsx
export function SceneSuggestionsPanel({
  suggestions,
  scene,
  onApply,
  onHoverSuggestion,
  onHoverPair,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
  onHoverPair: (ids: [PartId, PartId] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [unresolvedOpen, setUnresolvedOpen] = useState(false)
  const { rows, unresolved, jointedCount, actionableTotal } = useMemo(
    () => buildJointChecklist(scene.parts, scene.joints, suggestions),
    [scene.parts, scene.joints, suggestions],
  )
  if (rows.length === 0 && unresolved.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border px-2">
      <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
        {open ? '▾' : '▸'} Joints — {jointedCount} / {actionableTotal}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-1 py-0.5 border-t border-border/30"
            onMouseEnter={r.state === 'jointed' ? () => onHoverPair([r.aId, r.bId]) : undefined}
            onMouseLeave={r.state === 'jointed' ? () => onHoverPair(null) : undefined}
          >
            <span className="flex-1 text-[11px] text-foreground">
              {r.state === 'jointed' ? '✓ ' : ''}
              {label(scene, r.aId)} + {label(scene, r.bId)}
            </span>
            {r.state === 'jointed' ? (
              <span className="text-[11px] text-muted-foreground">
                {r.joints.map((j) => KIND_LABEL[j.kind]).join(', ')}
              </span>
            ) : (
              <div className="flex flex-wrap gap-1 justify-end">
                {r.options.map((s) => {
                  const arrow = orientationArrow(r, s)
                  return (
                    // Keyed by kind+arrow, not index: within a row only finger/tongue-groove repeat,
                    // and orientationArrow gives those two entries distinct arrows, so this is unique
                    // and — unlike an index — stable when the row's options change between renders.
                    <Button
                      key={`${s.kind}${arrow ?? ''}`}
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
            )}
          </div>
        ))}
        {unresolved.length > 0 && (
          <Collapsible
            open={unresolvedOpen}
            onOpenChange={setUnresolvedOpen}
            className="border-t border-border/30"
          >
            <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] text-muted-foreground/70 py-1 cursor-pointer select-none hover:text-muted-foreground transition-colors">
              {unresolvedOpen ? '▾' : '▸'} No joint available ({unresolved.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {unresolved.map((r) => (
                <div key={r.key} className="py-0.5 text-[11px] text-muted-foreground/70">
                  {label(scene, r.aId)} + {label(scene, r.bId)}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

`orientationArrow(r, s)` typechecks against `ChecklistRow` because its parameter is structurally `{ aId, options }` — if TypeScript objects, widen `orientationArrow`'s first parameter to `{ aId: PartId; options: JointSuggestion[] }` rather than casting at the call site.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: PASS — 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SceneSuggestionsPanel.tsx src/ui/SceneSuggestionsPanel.test.tsx
git commit -m "feat(ui): scene panel renders a joint checklist with a progress counter"
```

---

#### Task 7: Thread the pair-hover tint through

**Files:**
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`

`pnpm typecheck` is failing at this point — Task 6 added a required prop that nothing passes. That is the failing state this task resolves.

- [ ] **Step 1: Verify the failing state**

Run: `pnpm typecheck`
Expected: FAIL — `Property 'onHoverPair' is missing` at the `SceneSuggestionsPanel` usage in `sidebar.tsx:1082`.

- [ ] **Step 2: Thread the prop through the sidebar**

In `src/ui/sidebar.tsx`:

- add to `SidebarProps` (beside `onHoverSuggestion`, line 84):
  ```ts
  onHoverPair: (ids: [PartId, PartId] | null) => void
  ```
  `PartId` is already imported in this file.
- add `onHoverPair,` to the destructured parameter list (beside `onHoverSuggestion`, line 860)
- pass it at the `SceneSuggestionsPanel` call site (line 1082):
  ```tsx
  onHoverPair={onHoverPair}
  ```

- [ ] **Step 3: Add the state in App**

In `src/App.tsx`, add below `hoveredSuggestion` (line 71):

```tsx
// A done row has no suggestion to preview, so it tints both boards without drawing face outlines.
// That is the complete answer for a jointed pair, not a degraded one: there is no candidate
// geometry an outline could depict.
const [hoveredPair, setHoveredPair] = useState<[PartId, PartId] | null>(null)
```

Change `highlightedIds` (lines 75-78) to:

```tsx
const highlightedIds = useMemo(
  () => (hoveredSuggestion ? pairIdsOf(hoveredSuggestion) : hoveredPair),
  [hoveredSuggestion, hoveredPair],
)
```

Leave `hoveredOutlines` unchanged — it stays driven by `hoveredSuggestion` alone.

Pass the setter to `Sidebar` beside `onHoverSuggestion` (line 415):

```tsx
onHoverPair={setHoveredPair}
```

Add `PartId` to the type import from `./scene/types` if it is not already there.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidebar.tsx src/App.tsx
git commit -m "feat(ui): tint both boards when hovering a jointed checklist row"
```

---

#### Task 8: Verify in the browser

Unit tests use synthetic fixtures. This confirms the real engine, the real scene state and the real viewport agree.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Open `http://localhost:5173` in Chrome. Wait for the OCCT WASM to boot — `+ Board` becomes enabled.

- [ ] **Step 2: Build a two-board tee**

Click `+ Board` twice. Leave Board 1 at its defaults. Select Board 2 and set Rotation Y to `-90`, Position to X `100`, Y `30`, Z `20`.

- [ ] **Step 3: Check the open state**

Expand the `Joints` section. Expected: header reads `Joints — 0 / 1`, one row `Board 1 + Board 2` with `Dado` and `M&T` chips.

- [ ] **Step 4: Check the flip to done**

Click `Dado`. Expected: the row **stays**, now reading `✓ Board 1 + Board 2  Dado`, and the header reads `Joints — 1 / 1`. On `main` the row disappears entirely — that difference is the whole feature.

- [ ] **Step 5: Check hover on the done row**

Hover the `✓` row. Expected: both boards tint in the viewport; no face outlines are drawn. Move away: the tint clears.

- [ ] **Step 6: Check the no-offer section**

Add a third board and leave it at the defaults, overlapping Board 1. Expected: a `No joint available` section appears, closed, with its own count; the header count does **not** include it.

- [ ] **Step 7: Record the result**

Append to `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md` under a new `## <date> — shipped` heading: what the browser check showed, and anything that differed from the plan.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/notes/2026-08-17-joint-checklist-notes.md
git commit -m "docs: record joint checklist browser verification"
```

---

#### Task 9: Close the docs loop

**Files:**
- Modify: `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Close the open item on the older thread**

That file's `## Open` section ends with:

> The scene panel still shows only *unjointed* pairs (a pair drops out once jointed). If the checklist framing proves valuable, the migration is to keep jointed pairs listed as done — which needs the engine to report what it currently discards.

Replace that bullet with a pointer to this work, recording that the engine was **not** changed:

```markdown
- ~~The scene panel still shows only *unjointed* pairs.~~ Closed 2026-08-17 by the joint checklist
  (`docs/superpowers/specs/2026-08-17-joint-checklist-design.md`). The engine still discards jointed
  pairs — `jointChecklist.ts` re-derives the touching-pair set above it from the same `boardsTouch`
  predicate, so `suggestForOrderedPair` never had to report what it drops.
```

- [ ] **Step 2: Add the new module to the structure reference**

Run: `grep -n "groupSuggestions.ts" project-structure.html`
Expected: one hit at line 539, inside the `src/scene/` table.

Insert immediately after that row:

```html
          <tr><td><code>jointChecklist.ts</code></td><td>Joins touching pairs, <code>scene.joints</code> and suggestions into <code>ChecklistRow[]</code> — each pair <em>jointed</em>, <em>open</em> or <em>no-offer</em> — ordered by pair distance so a row keeps its slot when it flips to done.</td></tr>
```

Also update the `groupSuggestions.ts` row's trailing clause, since the cap no longer lives there: replace `<code>MAX_SCENE_PAIRS</code> caps rows, not suggestions.` with `<code>MAX_SCENE_PAIRS</code> is applied by <code>jointChecklist.ts</code>.`

- [ ] **Step 3: Verify**

Run: `grep -c "jointChecklist" project-structure.html`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md project-structure.html
git commit -m "docs: add jointChecklist to the structure reference and close the older open item"
```

---

### Done when

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass
- [ ] Every touching pair has a row; jointed pairs stay listed with a `✓`
- [ ] The header reads `Joints — {jointed} / {jointed + open}`, excluding no-offer rows
- [ ] No-offer pairs are in their own section, closed by default, with their own count
- [ ] A row keeps its position when it flips open → jointed (pinned by test, seen in the browser)
- [ ] Hovering a done row tints both boards and draws no outlines
- [ ] A joint whose boards were moved apart still shows as jointed
- [ ] `groupByPair` no longer truncates; `MAX_SCENE_PAIRS` is applied in `jointChecklist.ts`
- [ ] Notes, the 2026-08-07 open item, and `project-structure.html` updated
