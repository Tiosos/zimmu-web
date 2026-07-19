# Rabbeted (Tongue-and-Dado) Joint (JP2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `rabbeted` profile to the dado joint — a narrower housing groove plus a one-sided rabbet/tongue on the housed board's end — by generalizing `reconcileJoints` into a joint-agnostic distributor fed by a pure `deriveJoint` that returns a list of `{partId, cut}` + a seat.

**Architecture:** JP1 established the first-class `Joint`, `reconcileJoints`, `src/geom/dado.ts`, and the sidebar `JointsPanel`. JP2 adds three fields to `DadoJoint` (`profile`, `tongueThickness`, `rabbetFace`), a `computeRabbet` cut, tongue-aware tweaks to `computeDadoGroove`/`computeDadoSeat`, and a new `deriveJoint` entry point. `reconcileJoints` stops hardcoding one groove and instead distributes whatever `deriveJoint` emits — the first joint deriving geometry on **both** parts. No OCCT/mesh/export/drawing/Viewport/App changes.

**Tech Stack:** React 19 + TypeScript (strict), Three.js (math only, in `dado.ts`), Vitest + happy-dom + @testing-library/react.

**Reference spec:** `docs/superpowers/specs/2026-07-17-rabbeted-dado-joint-design.md`

**Conventions (unchanged from JP1):**
- Board local box `[0,length]×[0,width]×[0,thickness]` → X=length, Y=width, Z=thickness.
- `faceAxes(face)` → `{depth,u,v}` (`'x'|'y'|'z'`); a `BoxCut` subtracts `[position, position+size]` local.
- Run all three before every commit: `pnpm typecheck && pnpm lint && pnpm test`.
- All commits are SSH-signed: `git commit -S`.

---

## Task 1: Data model, defaults & file format

**Files:**
- Modify: `src/scene/types.ts` (`DadoJoint`)
- Modify: `src/scene/useScene.ts` (`onAddJoint` joint literal)
- Modify: `src/scene/useFile.ts` (`FILE_FORMAT_VERSION`, `parseFile`)
- Modify: `src/geom/dado.test.ts`, `src/scene/reconcileJoints.test.ts` (existing joint fixtures)

- [ ] **Step 1: Add the three fields to `DadoJoint`**

In `src/scene/types.ts`, extend `DadoJoint` (after `clearance`):

```ts
export interface DadoJoint {
  kind: 'dado'
  id: string
  label: string
  housingPartId: PartId
  housingFace: Face
  housedPartId: PartId
  housedEnd: Face
  offset: number
  depth: number
  clearance: number
  profile: 'plain' | 'rabbeted' // NEW
  tongueThickness: number // NEW — tongue/groove width when rabbeted
  rabbetFace: '+Z' | '-Z' // NEW — housed-board local thickness face the rabbet removes from
}
```

- [ ] **Step 2: Set the new defaults in `onAddJoint`**

In `src/scene/useScene.ts`, the `onAddJoint` joint literal — add three fields after `clearance: 0,`:

```ts
      const joint: Joint = {
        kind: 'dado',
        id: `joint_${crypto.randomUUID()}`,
        label: `Dado ${n}`,
        housingPartId: housing.id,
        housingFace,
        housedPartId: housed.id,
        housedEnd,
        offset: computeDadoOffset(housing, housed, housingFace),
        depth: defaultDadoDepth(housing, housingFace),
        clearance: 0,
        profile: 'plain',
        tongueThickness: Math.round(housed.thickness / 2),
        rabbetFace: '+Z',
      }
```

- [ ] **Step 3: Bump the file format and default the new fields on load**

In `src/scene/useFile.ts`, bump the version:

```ts
export const FILE_FORMAT_VERSION = 5
```

In `parseFile`, replace the `joints` line in the returned scene:

```ts
      joints: (raw.scene.joints ?? []).map((j) => ({
        profile: 'plain' as const,
        tongueThickness: 6,
        rabbetFace: '+Z' as const,
        ...j,
      })),
```

(The defaults come first so any value already present in `j` wins; a legacy joint that lacks these keys at runtime gets the defaults. `tongueThickness: 6` is a dormant placeholder — it's re-defaulted to `housedThickness/2` the moment the user flips to rabbeted, so the exact legacy value is immaterial.)

- [ ] **Step 4: Fix the existing pure-test joint fixtures (required — new fields are required)**

In `src/geom/dado.test.ts`, the `joint` fixture — add the three fields after `clearance: 0,`:

```ts
const joint: DadoJoint = {
  kind: 'dado',
  id: 'j1',
  label: 'Dado 1',
  housingPartId: 'H',
  housingFace: '+Z',
  housedPartId: 'D',
  housedEnd: '+X',
  offset: 50,
  depth: 8,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 8,
  rabbetFace: '+Z',
}
```

In `src/scene/reconcileJoints.test.ts`, the `joint` fixture — make the identical addition (same three lines after `clearance: 0,`).

- [ ] **Step 5: Verify the project builds (adding required fields ripples through fixtures)**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. If a `DadoJoint` literal anywhere else fails to compile, add the three fields (`profile: 'plain'`, `tongueThickness: <T/2>`, `rabbetFace: '+Z'`) to it. `useScene`/`sidebar` tests build joints via `onAddJoint`, so they need no change.

- [ ] **Step 6: Commit**

```bash
git add src/scene/types.ts src/scene/useScene.ts src/scene/useFile.ts src/geom/dado.test.ts src/scene/reconcileJoints.test.ts
git commit -S -m "feat(types): add rabbeted profile fields to DadoJoint; format 4→5"
```

---

## Task 2: Rabbeted geometry (`computeRabbet`, groove width, seat tongue-centering)

**Files:**
- Modify: `src/geom/dado.ts`
- Test: `src/geom/dado.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Append to `src/geom/dado.test.ts` (the `housing`/`housed`/`joint` fixtures already exist; `computeRabbet` is imported below):

```ts
import { computeRabbet } from './dado'

const rabbeted = { ...joint, profile: 'rabbeted' as const, tongueThickness: 8, rabbetFace: '+Z' as const }

test('computeDadoGroove: rabbeted groove width = tongueThickness (+clearance), narrower than plain', () => {
  expect(computeDadoGroove(housing, housed, rabbeted).size.x).toBe(8) // vs 18 for plain
})

test('computeRabbet: removes T−t from the +Z face over the last `depth` mm, full width', () => {
  const cut = computeRabbet(housing, housed, rabbeted)
  expect(cut.id.endsWith('_rabbet')).toBe(true)
  expect(cut.sourceJointId).toBe('j1')
  expect(cut.face).toBe('+Z')
  expect(cut.size).toEqual({ x: 8, y: 100, z: 10 }) // len=depth, full width, T−t=18−8
  expect(cut.position).toEqual({ x: 120 - 8, y: 0, z: 8 }) // flush at +X end, remove z∈[8,18]
})

test('computeRabbet: rabbetFace −Z removes the low face instead', () => {
  const cut = computeRabbet(housing, housed, { ...rabbeted, rabbetFace: '-Z' })
  expect(cut.position.z).toBe(0)
  expect(cut.size.z).toBe(10) // removes z∈[0,10], tongue at z∈[10,18]
})

test('computeDadoSeat: rabbeted centers the tongue (not the board) on the groove; seating depth unchanged', () => {
  const plainSeat = computeDadoSeat(housing, housed, { ...joint, profile: 'plain' })
  const rabSeat = computeDadoSeat(housing, housed, rabbeted)
  // narrow axis is world X here; shift = (T−t)/2 = (18−8)/2 = 5
  expect(Math.abs(rabSeat.position.x - plainSeat.position.x)).toBeCloseTo(5, 6)
  // face-normal (world Z) and run (world Y) components unchanged
  expect(rabSeat.position.z).toBeCloseTo(plainSeat.position.z, 6)
  expect(rabSeat.position.y).toBeCloseTo(plainSeat.position.y, 6)
})
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm vitest run src/geom/dado.test.ts`
Expected: FAIL (`computeRabbet` not exported; groove/seat assertions fail).

- [ ] **Step 3: Add the tongue-aware geometry to `src/geom/dado.ts`**

Extend the type import at the top of `src/geom/dado.ts` (it currently imports `BoardPart, BoxCut, CutId, DadoJoint, Face, Vec3`) — no change needed for this task; all names used here are already imported.

In `computeDadoGroove`, replace the width line:

```ts
  const width =
    (joint.profile === 'rabbeted' ? joint.tongueThickness : housed.thickness) + joint.clearance
```

In `computeDadoSeat`, right after `const endLocal = computeLocalFaceCenter(FACE_NORMALS[joint.housedEnd], housed)`, insert the tongue shift:

```ts
  if (joint.profile === 'rabbeted' && faceAxes(joint.housedEnd).depth !== 'z') {
    const t = clamp(joint.tongueThickness, 0.1, housed.thickness - 0.1)
    endLocal.z = joint.rabbetFace === '+Z' ? t / 2 : housed.thickness - t / 2
  }
```

Add `computeRabbet` at the end of the file:

```ts
export function computeRabbet(housing: BoardPart, housed: BoardPart, joint: DadoJoint): BoxCut {
  void housing
  const dim = boardDims(housed)
  const seatAx = faceAxes(joint.housedEnd).depth
  const widthAx: Axis = seatAx === 'x' ? 'y' : 'x'
  const T = housed.thickness
  const t = clamp(joint.tongueThickness, 0.1, T - 0.1)
  const len = clamp(joint.depth, 0.1, dim[seatAx] - 0.1)
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[seatAx] = len
  size[widthAx] = dim[widthAx]
  size.z = T - t
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[seatAx] = joint.housedEnd.startsWith('+') ? dim[seatAx] - len : 0
  position[widthAx] = 0
  position.z = joint.rabbetFace === '+Z' ? t : 0
  return {
    kind: 'box',
    id: `cut_${joint.id}_rabbet` as CutId,
    label: `${joint.label} tongue`,
    face: joint.rabbetFace,
    position,
    size,
    sourceJointId: joint.id,
  }
}
```

(`void housing` keeps the signature symmetric with `computeDadoGroove`/`computeDadoSeat` and future-proof for stopped rabbets that reference the housing, without tripping `noUnusedParameters`. If you prefer, drop the `housing` param and the `void` line — but then update the call in Task 3 to `computeRabbet(housed, joint)`.)

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run src/geom/dado.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Verify project**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geom/dado.ts src/geom/dado.test.ts
git commit -S -m "feat(geom): rabbet cut + tongue-aware groove width & seating"
```

---

## Task 3: `deriveJoint` + reconciler generalization

**Files:**
- Modify: `src/geom/dado.ts` (add `deriveJoint`)
- Modify: `src/scene/reconcileJoints.ts` (distribute)
- Test: `src/geom/dado.test.ts`, `src/scene/reconcileJoints.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/geom/dado.test.ts`:

```ts
import { deriveJoint } from './dado'
import type { Part } from '../scene/types'

const parts: Part[] = [housing, housed]

test('deriveJoint: plain returns one groove cut on the housing + a seat', () => {
  const r = deriveJoint({ ...joint, profile: 'plain' }, parts)
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(1)
  expect(r!.cuts[0].partId).toBe('H')
  expect(r!.seat.partId).toBe('D')
})

test('deriveJoint: rabbeted returns groove (housing) + rabbet (housed)', () => {
  const r = deriveJoint(rabbeted, parts)
  expect(r!.cuts).toHaveLength(2)
  expect(r!.cuts.map((c) => c.partId).sort()).toEqual(['D', 'H'])
  expect(r!.cuts.find((c) => c.partId === 'D')!.cut.id.endsWith('_rabbet')).toBe(true)
})

test('deriveJoint: invalid seat returns null (stale)', () => {
  const flat = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  expect(deriveJoint(rabbeted, [housing, flat])).toBeNull()
})
```

Append to `src/scene/reconcileJoints.test.ts` (extend the imports there with `DadoJoint` already present; the `housing`/`housed`/`joint`/`scene` helpers exist):

```ts
test('rabbeted joint materializes a groove on the housing AND a rabbet on the housed board', () => {
  const s = scene()
  s.joints = [{ ...s.joints[0], profile: 'rabbeted', tongueThickness: 8, rabbetFace: '+Z' }]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
  expect(D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
})

test('flipping rabbeted → plain removes the housed rabbet cut', () => {
  const s = scene()
  s.joints = [{ ...s.joints[0], profile: 'rabbeted', tongueThickness: 8, rabbetFace: '+Z' }]
  const rab = reconcileJoints(s)
  const plain = reconcileJoints({ ...rab, joints: [{ ...rab.joints[0], profile: 'plain' }] })
  const D = plain.parts.find((p) => p.id === 'D') as BoardPart
  expect(D.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(false)
})
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm vitest run src/geom/dado.test.ts src/scene/reconcileJoints.test.ts`
Expected: FAIL (`deriveJoint` not exported; reconcile still emits only the housing groove).

- [ ] **Step 3: Add `deriveJoint` to `src/geom/dado.ts`**

Extend the type import at the top of `src/geom/dado.ts`:

```ts
import type { BoardPart, BoxCut, CutId, DadoJoint, Face, Joint, Part, PartId, Vec3 } from '../scene/types'
```

Add near the top (after the `type Axis` line) the result types, and `deriveJoint` after `computeRabbet`:

```ts
export type DerivedCut = { partId: PartId; cut: BoxCut }
export type DeriveResult = { cuts: DerivedCut[]; seat: { partId: PartId; position: Vec3 } }
```

```ts
export function deriveJoint(joint: Joint, parts: Part[]): DeriveResult | null {
  const housing = parts.find((p) => p.id === joint.housingPartId)
  const housed = parts.find((p) => p.id === joint.housedPartId)
  if (housing?.kind !== 'board' || housed?.kind !== 'board') return null
  if (!isValidDadoSeat(housing, joint.housingFace, housed, joint.housedEnd)) return null

  const cuts: DerivedCut[] = [
    { partId: housing.id, cut: computeDadoGroove(housing, housed, joint) },
  ]
  if (joint.profile === 'rabbeted' && faceAxes(joint.housedEnd).depth !== 'z') {
    cuts.push({ partId: housed.id, cut: computeRabbet(housing, housed, joint) })
  }
  const seat = { partId: housed.id, position: computeDadoSeat(housing, housed, joint).position }
  return { cuts, seat }
}
```

- [ ] **Step 4: Generalize `src/scene/reconcileJoints.ts` to distribute `deriveJoint`**

Replace the whole file contents:

```ts
import type { Scene } from './types'
import { deriveJoint } from '../geom/dado'

// Regenerate every derived (joint-owned) cut and seated position from the joints.
// Joint-agnostic: it distributes whatever deriveJoint emits. Pure and idempotent.
export function reconcileJoints(scene: Scene): Scene {
  const jointIds = new Set(scene.joints.map((j) => j.id))

  // 1. Strip orphan derived cuts (owning joint gone).
  let parts = scene.parts.map((p) =>
    p.kind === 'board'
      ? {
          ...p,
          cuts: p.cuts.filter(
            (c) =>
              !(c.kind === 'box' && c.sourceJointId !== undefined && !jointIds.has(c.sourceJointId)),
          ),
        }
      : p,
  )

  // 2. For each joint: derive → distribute across parts, or preserve last-good.
  for (const joint of scene.joints) {
    const result = deriveJoint(joint, parts)
    if (result === null) continue // stale/invalid → leave existing cuts + position

    // Remove this joint's derived cuts from every board, then scatter the fresh ones.
    parts = parts.map((p) =>
      p.kind === 'board'
        ? { ...p, cuts: p.cuts.filter((c) => !(c.kind === 'box' && c.sourceJointId === joint.id)) }
        : p,
    )
    for (const { partId, cut } of result.cuts) {
      parts = parts.map((p) =>
        p.id === partId && p.kind === 'board' ? { ...p, cuts: [...p.cuts, cut] } : p,
      )
    }
    parts = parts.map((p) =>
      p.id === result.seat.partId ? { ...p, position: result.seat.position } : p,
    )
  }

  return { ...scene, parts }
}
```

- [ ] **Step 5: Run — verify pass (new tests + JP1 regression)**

Run: `pnpm vitest run src/geom/dado.test.ts src/scene/reconcileJoints.test.ts`
Expected: PASS — including the pre-existing JP1 reconcile tests (idempotence, orphan-strip, stale-preserve, passthrough), which now flow through `deriveJoint` unchanged.

- [ ] **Step 6: Verify project**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/geom/dado.ts src/geom/dado.test.ts src/scene/reconcileJoints.ts src/scene/reconcileJoints.test.ts
git commit -S -m "feat(scene): generic deriveJoint distributor; rabbeted emits two cuts"
```

---

## Task 4: `useScene` profile-flip integration test

**Files:**
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing/holding test**

In `src/scene/useScene.test.ts`, inside the existing `describe('useScene — joints', …)` block (which already has the `hit` and `twoBoards` helpers), add:

```ts
  it('flipping a joint to rabbeted adds the housed rabbet cut in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)
    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })
    const jointId = result.current.scene.joints[0].id
    const housedRabbets = () => {
      const D = result.current.scene.parts.find((p) => p.id === Did)!
      return D.kind === 'board'
        ? D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === jointId).length
        : 0
    }
    expect(housedRabbets()).toBe(0) // plain: no rabbet on the housed board

    await act(async () => {
      result.current.onUpdateJoint(jointId, (j) => ({ ...j, profile: 'rabbeted' }))
    })
    expect(housedRabbets()).toBe(1) // rabbeted: one derived cut on the housed board

    await act(async () => {
      result.current.undo()
    })
    expect(housedRabbets()).toBe(0) // single undo restores plain
    expect(result.current.scene.joints[0].profile).toBe('plain')
  })
```

- [ ] **Step 2: Run — verify pass**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: PASS. `onUpdateJoint` already routes through the reconcile-commit helper, so flipping `profile` reconciles (adding the rabbet) as one undo entry — no `useScene` code change is required. If it FAILS, do not patch the test to pass; investigate whether `onUpdateJoint`/reconcile handles the multi-cut case (Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/scene/useScene.test.ts
git commit -S -m "test(scene): profile flip adds housed rabbet in a single undo entry"
```

---

## Task 5: Sidebar — profile & tongue controls

**Files:**
- Modify: `src/ui/JointsPanel.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Append to `src/ui/sidebar.test.tsx` (the `props`/`makeBoard` helpers and `render`/`screen` are already imported). These build a scene with a joint whose housing is the selected part:

```ts
describe('Sidebar joints panel — rabbeted', () => {
  afterEach(() => cleanup())

  const jointScene = (profile: 'plain' | 'rabbeted') => ({
    parts: [
      makeBoard(),
      makeBoard({ id: 'board_t2', label: 'Board 2', rotation: { x: 0, y: 90, z: 0 } }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'dado' as const,
        id: 'j1',
        label: 'Dado 1',
        housingPartId: 'board_t1',
        housingFace: '+Z' as const,
        housedPartId: 'board_t2',
        housedEnd: '+X' as const,
        offset: 100,
        depth: 8,
        clearance: 0,
        profile,
        tongueThickness: 8,
        rabbetFace: '+Z' as const,
      },
    ],
  })

  it('plain joint hides the tongue controls', () => {
    render(<Sidebar {...props({ scene: jointScene('plain'), selectedId: 'board_t1' })} />)
    expect(screen.queryByText('Tongue')).toBeNull()
  })

  it('rabbeted joint shows the tongue + rabbet-side controls', () => {
    render(<Sidebar {...props({ scene: jointScene('rabbeted'), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Tongue')).toBeTruthy()
    expect(screen.getByText('Rabbet')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — verify failure**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: FAIL (`Tongue`/`Rabbet` text not present).

- [ ] **Step 3: Add the Select import to `src/ui/JointsPanel.tsx`**

At the top of `src/ui/JointsPanel.tsx`, add after the existing `Label` import:

```ts
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
```

- [ ] **Step 4: Render the Profile dropdown + conditional tongue controls**

In `src/ui/JointsPanel.tsx`, the housing-side block currently renders Depth / Clearance / Offset inside `isHousing ? (<>…</>) : (…)`. Add the Profile select **above** the Depth input, and the tongue controls **below** Offset — replace the `isHousing ? ( … Depth/Clear/Offset … )` fragment's contents with:

```tsx
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <Label className="w-10 shrink-0 text-right">Profile</Label>
                  <Select
                    value={j.profile}
                    onValueChange={(v) =>
                      onUpdateJoint(j.id, (jt) => ({ ...jt, profile: v as 'plain' | 'rabbeted' }))
                    }
                  >
                    <SelectTrigger className="h-7 flex-1 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plain">Plain</SelectItem>
                      <SelectItem value="rabbeted">Rabbeted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <JointNumInput
                  label="Depth"
                  value={j.depth}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, depth: Math.max(0.1, v) }))
                  }
                />
                <JointNumInput
                  label="Clear"
                  value={j.clearance}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))
                  }
                />
                <JointNumInput
                  label="Offset"
                  value={j.offset}
                  suffix="mm"
                  onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, offset: v }))}
                />
                {j.profile === 'rabbeted' && (
                  <>
                    <JointNumInput
                      label="Tongue"
                      value={j.tongueThickness}
                      suffix="mm"
                      onCommit={(v) =>
                        onUpdateJoint(j.id, (jt) => ({
                          ...jt,
                          tongueThickness: Math.max(0.1, v),
                        }))
                      }
                    />
                    <div className="flex items-center gap-1.5 mb-1">
                      <Label className="w-10 shrink-0 text-right">Rabbet</Label>
                      <Select
                        value={j.rabbetFace}
                        onValueChange={(v) =>
                          onUpdateJoint(j.id, (jt) => ({ ...jt, rabbetFace: v as '+Z' | '-Z' }))
                        }
                      >
                        <SelectTrigger className="h-7 flex-1 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="+Z">Face +Z</SelectItem>
                          <SelectItem value="-Z">Face −Z</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </>
```

- [ ] **Step 5: Run — verify pass**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify project**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): joint Profile + tongue/rabbet-side controls in JointsPanel"
```

---

## Task 6: Documentation & final verification

**Files:**
- Modify: `README.md`, `project-structure.html`
- Create: `docs/superpowers/notes/2026-07-17-rabbeted-dado-joint-notes.md`

- [ ] **Step 1: Update the README joint bullet**

In `README.md`, replace the JP1 dado bullet with a version that mentions the profile:

```markdown
- **Dado joint mode** (`J`) — click a housing face then a housed board's end to create a parametric dado; the groove is generated on the housing and the housed board seated into it, staying in sync as dimensions change. Switch a joint's **Profile** to *rabbeted* (tongue-and-dado) in the sidebar to also cut a tongue on the housed end.
```

- [ ] **Step 2: Update project-structure.html data model**

In `project-structure.html`, in the `DadoJoint` interface block (added in JP1), add the three fields after `clearance`:

```
  profile: 'plain' | 'rabbeted'   // NEW in JP2
  tongueThickness: number         // tongue/groove width when rabbeted
  rabbetFace: '+Z' | '-Z'         // housed thickness face the rabbet removes from
```

And update the `dado.ts` module-table row to mention the new exports:

```html
          <tr><td><code>dado.ts</code></td><td>Pure dado-joint geometry — <code>isValidDadoSeat</code>, <code>deriveDadoAxes</code>, <code>computeDadoGroove</code>, <code>computeDadoSeat</code>, <code>computeRabbet</code>, and <code>deriveJoint</code> (the list of derived cuts + seat consumed by <code>reconcileJoints</code>). Three-typed but browser-free.</td></tr>
```

(Replace the existing `dado.ts` row.)

- [ ] **Step 3: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-17-rabbeted-dado-joint-notes.md` capturing: (a) `profile` field vs. a new kind (chose field — Option A); (b) `deriveJoint` as the generalization seam and how `reconcileJoints` became a distributor while keeping the four JP1 invariants; (c) tongue-centering in `computeDadoSeat` (shift the target's local-Z to the tongue center; only the narrow-axis component moves); (d) the thickness-end fallback (`faceAxes(housedEnd).depth === 'z'` → treated as plain); (e) the housed rabbet cut reusing JP1's read-only cut rendering for free; (f) any surprises found during implementation.

- [ ] **Step 4: Final full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS (all four). Test count should be ~JP1 + the new dado/reconcile/useScene/sidebar cases.

- [ ] **Step 5: Commit**

```bash
git add README.md project-structure.html docs/superpowers/notes/2026-07-17-rabbeted-dado-joint-notes.md
git commit -S -m "docs: rabbeted dado joint — README, structure, implementation notes"
```

---

## Self-review checklist (author ran before handing off)

- **Spec coverage:** data model + defaults + format (T1) · `computeRabbet` + groove width + seat centering (T2) · `deriveJoint` + reconciler generalization (T3) · profile-flip single-undo (T4) · sidebar Profile/Tongue/Rabbet controls + read-only housed cut inherited from JP1 (T5) · docs (T6). All spec sections mapped.
- **Type consistency:** `deriveJoint(joint, parts): DeriveResult | null`, `DerivedCut = {partId, cut}`, `computeRabbet(housing, housed, joint)` used identically across T2/T3, and `reconcileJoints` consumes exactly `{ cuts, seat }`. `profile`/`tongueThickness`/`rabbetFace` names match across types, defaults, geometry, and UI.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Regression guard:** T3 keeps the JP1 `reconcileJoints` tests unchanged as the safety net for the distributor refactor; run T3-S5 to confirm they still pass.
- **No OCCT/mesh/export/drawing/Viewport/App edits** — confirmed against the spec's "unchanged" list.
