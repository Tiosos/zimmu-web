# Stopped (Blind) Dado Joint (JP3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a composable stopped/blind dado — the groove stops short of one or both run-axis edges (`stopStart`/`stopEnd`, mm), and the housed board is auto-notched at each stopped end to seat flush.

**Architecture:** Extend the existing first-class `Joint` framework. `DadoJoint` gains two `number` fields (default `0` = through, byte-identical to today). `computeDadoGroove` shortens the groove along its run axis; a new pure `computeNotch` derives a full-thickness corner box on the housed board per nonzero stop; `deriveJoint` pushes 0–2 notches (gated to length/width housed ends); the unchanged `reconcileJoints` distributor scatters them. No OCCT/mesh/export/drawing changes.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + happy-dom, Three.js math (in pure `dado.ts` helpers), pnpm.

**Spec:** `docs/superpowers/specs/2026-07-19-stopped-dado-joint-design.md`

**Commit conventions (every commit):** sign with `-S`; author `Claude <noreply@anthropic.com>`; end the message body with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LZYYj3iGa4yi5RjEfizDJC
```
Do **not** put any model identifier in commit messages or code. Develop on branch `claude/next-step-suggestion-i0qjjd`. Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/scene/types.ts` | `DadoJoint` interface | Add `stopStart` / `stopEnd` (required `number`) |
| `src/scene/useFile.ts` | file format + `parseFile` | `FILE_FORMAT_VERSION` `5 → 6`; default stops on legacy joints; migration comment |
| `src/scene/useScene.ts` | `onAddJoint` | Set `stopStart: 0, stopEnd: 0` on new joints |
| `src/geom/dado.ts` | pure geometry | `computeDadoGroove` run-axis inset; new `computeNotch`; `deriveJoint` `notchable` gate + notch pushes |
| `src/ui/JointsPanel.tsx` | joint editor | Two always-visible `Stop A` / `Stop B` inputs |
| Test fixtures | — | Add the two fields to the three typed `DadoJoint` literals |

**Unchanged:** `reconcileJoints.ts`, `useScene.ts` (logic beyond `onAddJoint`), `computeDadoSeat`, `computeRabbet`, `useAddJoint.ts`, `viewport.tsx`, `App.tsx`, `occt.ts`, `occt.worker.ts`, `mesh.ts`, STL/STEP export, `drawing.ts`, `sidebar.tsx` (notch rows already render read-only via `sourceJointId`).

---

## Task 1: Data model, defaults & file format

Adds two **required** fields to `DadoJoint`. Because they are required, three typed `DadoJoint` literals in tests and the `onAddJoint` constructor must gain them, or `tsc` fails. This task also bumps the file format and defaults legacy files.

**Files:**
- Modify: `src/scene/types.ts:125-139` (`DadoJoint`)
- Modify: `src/scene/useFile.ts:5` (version) and `:73-84` (parseFile joint defaulting)
- Modify: `src/scene/useScene.ts:891-905` (`onAddJoint` joint literal)
- Modify (fixtures): `src/geom/dado.test.ts:48-62`, `src/scene/reconcileJoints.test.ts:37-51`, `src/ui/sidebar.test.tsx:568-583`
- Test: `src/scene/useFile.test.ts` (new v5→v6 migration test)

- [ ] **Step 1: Add the fields to `DadoJoint`**

In `src/scene/types.ts`, add two lines to the `DadoJoint` interface after `rabbetFace`:

```ts
export interface DadoJoint {
  kind: 'dado'
  id: string // "joint_<uuid>"
  label: string // "Dado 1"
  housingPartId: PartId // board that carries the groove
  housingFace: Face // face the groove is cut into
  housedPartId: PartId // board that seats into the groove
  housedEnd: Face // the housed board's end face that seats in
  offset: number // mm — groove center along the housing face's narrow axis (housing-local)
  depth: number // mm — groove depth into the housing board
  clearance: number // mm — added to groove width (housedThickness + clearance)
  profile: 'plain' | 'rabbeted' // 'plain' = groove only; 'rabbeted' = groove + tongue
  tongueThickness: number // mm — tongue/groove width when rabbeted
  rabbetFace: '+Z' | '-Z' // housed-board local thickness face the rabbet removes from
  stopStart: number // mm the groove is inset from the run-axis 0 end (0 = through)
  stopEnd: number // mm the groove is inset from the run-axis far end (0 = through)
}
```

- [ ] **Step 2: Run typecheck to see it fail**

Run: `pnpm typecheck`
Expected: FAIL — errors like "Property 'stopStart' is missing" at `src/scene/useScene.ts` (onAddJoint) and the three test fixtures.

- [ ] **Step 3: Set defaults in `onAddJoint`**

In `src/scene/useScene.ts`, in the `joint` literal (around `:891-905`), add the two defaults after `rabbetFace: '+Z',`:

```ts
        profile: 'plain',
        tongueThickness: Math.round(housed.thickness / 2),
        rabbetFace: '+Z',
        stopStart: 0,
        stopEnd: 0,
      }
```

- [ ] **Step 4: Fix the three typed fixtures**

`src/geom/dado.test.ts` (the `const joint: DadoJoint` at `:48`) — add after `rabbetFace: '+Z',`:

```ts
  profile: 'plain',
  tongueThickness: 8,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
}
```

`src/scene/reconcileJoints.test.ts` (the `const joint: DadoJoint` at `:37`) — add after `rabbetFace: '+Z',`:

```ts
  profile: 'plain',
  tongueThickness: 8,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
}
```

`src/ui/sidebar.test.tsx` (the `jointScene` literal at `:568-583`) — add after `rabbetFace: '+Z' as const,`:

```ts
        profile,
        tongueThickness: 8,
        rabbetFace: '+Z' as const,
        stopStart: 0,
        stopEnd: 0,
      },
```

- [ ] **Step 5: Bump the file format version**

In `src/scene/useFile.ts:5`:

```ts
export const FILE_FORMAT_VERSION = 6
```

- [ ] **Step 6: Default stops on legacy joints in `parseFile`**

In `src/scene/useFile.ts`, update the joint-defaulting block (`:73-84`). Change the comment and add the two defaults **before** the `...j` spread (defaults-first, so a stored value wins):

```ts
      // v4→v5: joints gained `profile` (+ tongueThickness/rabbetFace).
      // v5→v6: joints gained stopStart/stopEnd (blind-dado insets); legacy joints are through.
      joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>).map(
        (j) =>
          ({
            profile: 'plain' as const,
            // Inert placeholder while profile is 'plain'; re-derived to housedThickness/2
            // when a joint is first flipped to rabbeted (see onAddJoint) — not meant to track that formula here.
            tongueThickness: 6,
            rabbetFace: '+Z' as const,
            stopStart: 0,
            stopEnd: 0,
            ...j,
          }) as unknown as Joint,
      ),
```

- [ ] **Step 7: Write the v5→v6 migration test**

In `src/scene/useFile.test.ts`, add after the existing `v5: joint with profile fields already present…` test (near `:783`):

```ts
  it('v5→v6: legacy joint without stop fields defaults to through (stopStart/stopEnd = 0)', () => {
    const v5Json = JSON.stringify({
      version: 5,
      name: 'Test',
      appVersion: '0.0.0',
      units: 'mm',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      camera: CAMERA,
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [
          {
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
            tongueThickness: 6,
            rabbetFace: '+Z',
            // no stopStart/stopEnd — simulates a pre-v6 joint
          },
        ],
      },
    })
    const result = parseFile(v5Json)
    expect(result.scene.joints[0]).toMatchObject({ stopStart: 0, stopEnd: 0 })
  })
```

> Note: confirm `parseFile` and `CAMERA` are already imported/defined in this test file (they are used by the sibling v4/v5 tests). Reuse them; do not redefine.

- [ ] **Step 8: Run typecheck, lint, and the affected tests**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/scene/useFile.test.ts`
Expected: PASS (typecheck clean; the new migration test green).

- [ ] **Step 9: Commit**

```bash
git add src/scene/types.ts src/scene/useFile.ts src/scene/useScene.ts \
  src/geom/dado.test.ts src/scene/reconcileJoints.test.ts src/ui/sidebar.test.tsx \
  src/scene/useFile.test.ts
git commit -S -m "feat(joints): add stopStart/stopEnd to DadoJoint; file format 5→6

<trailers per Commit conventions>"
```

---

## Task 2: Groove shortening (`computeDadoGroove` run-axis inset)

Shorten the groove along its run axis by `stopStart` (from the 0 end) and `stopEnd` (from the far end), clamped to leave ≥ 1 mm of groove. `ss = se = 0` reproduces today's full-span groove exactly.

**Files:**
- Modify: `src/geom/dado.ts:114-141` (`computeDadoGroove`)
- Test: `src/geom/dado.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/geom/dado.test.ts`, add after the existing `computeDadoGroove: depth clamps…` test (near `:90`). The fixture `joint` seats housed `+X` on housing `+Z`, so `deriveDadoAxes → { narrowAx: 'x', runAx: 'y' }`; the run axis is `y` with housing width `100`.

```ts
test('computeDadoGroove: stopStart insets the run-axis start; length shrinks', () => {
  const cut = computeDadoGroove(housing, housed, { ...joint, stopStart: 10 })
  expect(cut.position.y).toBe(10)
  expect(cut.size.y).toBe(90) // 100 − 10
  expect(cut.size.x).toBe(18) // narrow width unchanged
  expect(cut.position.z).toBe(17) // depth flush unchanged
})

test('computeDadoGroove: both stops inset both ends', () => {
  const cut = computeDadoGroove(housing, housed, { ...joint, stopStart: 10, stopEnd: 15 })
  expect(cut.position.y).toBe(10)
  expect(cut.size.y).toBe(75) // 100 − 10 − 15
})

test('computeDadoGroove: combined stops clamp to leave ≥ 1 mm of groove', () => {
  const cut = computeDadoGroove(housing, housed, { ...joint, stopStart: 200, stopEnd: 200 })
  expect(cut.position.y).toBe(99) // ss clamped to dim − 1
  expect(cut.size.y).toBe(1) // never below 1 mm
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/geom/dado.test.ts -t "stop"`
Expected: FAIL — groove `size.y` is still `100`, `position.y` still `0` (the inset isn't implemented).

- [ ] **Step 3: Implement the run-axis inset**

In `src/geom/dado.ts`, inside `computeDadoGroove`, add the inset computation right after the `width` const (after `:122`):

```ts
  const ss = clamp(joint.stopStart, 0, dim[runAx] - 1)
  const se = clamp(joint.stopEnd, 0, dim[runAx] - 1 - ss) // leave ≥ 1 mm of groove
```

Then replace the two full-span run-axis lines:

```ts
  size[runAx] = dim[runAx]
```
with
```ts
  size[runAx] = dim[runAx] - ss - se
```

and
```ts
  position[runAx] = 0
```
with
```ts
  position[runAx] = ss
```

- [ ] **Step 4: Run the whole file to verify (through case unchanged)**

Run: `pnpm vitest run src/geom/dado.test.ts`
Expected: PASS — the three new tests pass, and the existing `computeDadoGroove: full-width channel…` test (through, `size.y = 100`, `position.y = 0`) still passes, proving `ss = se = 0` is byte-identical.

- [ ] **Step 5: Commit**

```bash
git add src/geom/dado.ts src/geom/dado.test.ts
git commit -S -m "feat(geom): shorten dado groove along run axis for stopStart/stopEnd

<trailers per Commit conventions>"
```

---

## Task 3: `computeNotch` — housed corner box per stopped end

New pure function: the full-thickness corner box removed from the housed board at one stopped end so its front corner clears the un-grooved solid housing.

**Files:**
- Modify: `src/geom/dado.ts` (new export `computeNotch`, placed after `computeRabbet`, before `deriveJoint`)
- Test: `src/geom/dado.test.ts` (add `computeNotch` to the import list)

- [ ] **Step 1: Write the failing tests**

In `src/geom/dado.test.ts`, add `computeNotch` to the import from `./dado`:

```ts
import {
  isValidDadoSeat,
  deriveDadoAxes,
  computeDadoGroove,
  computeDadoSeat,
  defaultDadoDepth,
  computeRabbet,
  computeNotch,
  deriveJoint,
} from './dado'
```

Then add these tests (housed `dim = {x:120, y:100, z:18}`, `housedEnd '+X'` → `seatAx='x'`, `widthAx='y'`; both boards' +Y align → `aligned = true`; groove depth `8`):

```ts
test('computeNotch: start-end corner box — depth deep into the end, stop wide, full thickness', () => {
  const cut = computeNotch(housing, housed, { ...joint, stopStart: 10 }, 'start')
  expect(cut.size).toEqual({ x: 8, y: 10, z: 18 }) // d=depth, stop, full thickness
  expect(cut.position).toEqual({ x: 112, y: 0, z: 0 }) // flush at +X end, low width end
  expect(cut.id).toBe('cut_j1_notch0')
  expect(cut.label).toBe('Dado 1 notch')
  expect(cut.face).toBe('+X')
  expect(cut.sourceJointId).toBe('j1')
})

test('computeNotch: end-end corner box sits at the far width end', () => {
  const cut = computeNotch(housing, housed, { ...joint, stopEnd: 15 }, 'end')
  expect(cut.size).toEqual({ x: 8, y: 15, z: 18 })
  expect(cut.position).toEqual({ x: 112, y: 85, z: 0 }) // width − stop = 100 − 15
  expect(cut.id).toBe('cut_j1_notch1')
})

test('computeNotch: stop width clamps below the housed width', () => {
  const cut = computeNotch(housing, housed, { ...joint, stopStart: 999 }, 'start')
  expect(cut.size.y).toBeCloseTo(100 - 0.1, 6)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/geom/dado.test.ts -t "computeNotch"`
Expected: FAIL — `computeNotch` is not exported (import error / not a function).

- [ ] **Step 3: Implement `computeNotch`**

In `src/geom/dado.ts`, add after `computeRabbet` (after `:220`) and before `deriveJoint`:

```ts
// Corner box removed from the housed board at one stopped end so its front corner
// clears the un-grooved solid housing. Precondition (enforced by deriveJoint): the
// housed end is a length/width end (faceAxes(joint.housedEnd).depth !== 'z').
export function computeNotch(
  housing: BoardPart,
  housed: BoardPart,
  joint: DadoJoint,
  end: 'start' | 'end',
): BoxCut {
  const dim = boardDims(housed)
  const seatAx = faceAxes(joint.housedEnd).depth
  const widthAx: Axis = seatAx === 'x' ? 'y' : 'x'
  const d = clamp(joint.depth, 0.1, dim[seatAx] - 0.1) // notch-back distance = groove depth
  const stop = clamp(end === 'start' ? joint.stopStart : joint.stopEnd, 0.1, dim[widthAx] - 0.1)

  const { runAx } = deriveDadoAxes(housing, housed, joint.housingFace)
  const aligned =
    localDirToWorld(housed, unitVec(widthAx)).dot(localDirToWorld(housing, unitVec(runAx))) > 0
  const atLow = (end === 'start') === aligned

  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[seatAx] = d
  size[widthAx] = stop
  size.z = housed.thickness // full thickness — removes the tongue too if rabbeted
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[seatAx] = joint.housedEnd.startsWith('+') ? dim[seatAx] - d : 0
  position[widthAx] = atLow ? 0 : dim[widthAx] - stop
  position.z = 0

  return {
    kind: 'box',
    id: `cut_${joint.id}_notch${end === 'start' ? 0 : 1}` as CutId,
    label: `${joint.label} notch`,
    face: joint.housedEnd,
    position,
    size,
    sourceJointId: joint.id,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/geom/dado.test.ts -t "computeNotch"`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/geom/dado.ts src/geom/dado.test.ts
git commit -S -m "feat(geom): add computeNotch for stopped-dado housed corners

<trailers per Commit conventions>"
```

---

## Task 4: `deriveJoint` notch pushes + reconciler distribution

Gate the notch on a length/width housed end (`notchable`) and push one notch per nonzero stop. The generic `reconcileJoints` needs no change — verify it distributes the extra cuts.

**Files:**
- Modify: `src/geom/dado.ts:224-238` (`deriveJoint`)
- Test: `src/geom/dado.test.ts`, `src/scene/reconcileJoints.test.ts`

- [ ] **Step 1: Write the failing `deriveJoint` tests**

In `src/geom/dado.test.ts`, add after the existing `deriveJoint: rabbeted…` tests (near `:204`):

```ts
test('deriveJoint: one stop → groove (housing) + one notch (housed)', () => {
  const r = deriveJoint({ ...joint, stopStart: 10 }, parts)
  expect(r!.cuts).toHaveLength(2)
  expect(r!.cuts.map((c) => c.partId).sort()).toEqual(['D', 'H'])
  expect(r!.cuts.find((c) => c.partId === 'D')!.cut.id).toBe('cut_j1_notch0')
})

test('deriveJoint: both stops → groove + two notches', () => {
  const r = deriveJoint({ ...joint, stopStart: 10, stopEnd: 15 }, parts)
  expect(r!.cuts).toHaveLength(3)
  const dCutIds = r!.cuts.filter((c) => c.partId === 'D').map((c) => c.cut.id).sort()
  expect(dCutIds).toEqual(['cut_j1_notch0', 'cut_j1_notch1'])
})

test('deriveJoint: stopped-rabbeted emits groove + rabbet + two notches (4 cuts)', () => {
  const r = deriveJoint({ ...rabbeted, stopStart: 10, stopEnd: 15 }, parts)
  expect(r!.cuts).toHaveLength(4)
  const dCutIds = r!.cuts.filter((c) => c.partId === 'D').map((c) => c.cut.id).sort()
  expect(dCutIds).toEqual(['cut_j1_notch0', 'cut_j1_notch1', 'cut_j1_rabbet'])
})

test('deriveJoint: a thickness-seated housed end with a stop emits groove only (no notch)', () => {
  const flatHoused = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  const r = deriveJoint({ ...joint, housedEnd: '-Z' as const, stopStart: 10 }, [housing, flatHoused])
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(1)
  expect(r!.cuts[0].partId).toBe('H')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/geom/dado.test.ts -t "deriveJoint"`
Expected: FAIL — the stopped joints still return only the groove (+ rabbet); notch cuts are absent.

- [ ] **Step 3: Implement the notch pushes in `deriveJoint`**

In `src/geom/dado.ts`, replace the body of `deriveJoint` after the two guard `return null` lines with:

```ts
  const notchable = faceAxes(joint.housedEnd).depth !== 'z' // housed seats on a length/width end
  const cuts: DerivedCut[] = [
    { partId: housing.id, cut: computeDadoGroove(housing, housed, joint) },
  ]
  if (hasTongue(joint)) {
    cuts.push({ partId: housed.id, cut: computeRabbet(housing, housed, joint) })
  }
  if (notchable && joint.stopStart > 0) {
    cuts.push({ partId: housed.id, cut: computeNotch(housing, housed, joint, 'start') })
  }
  if (notchable && joint.stopEnd > 0) {
    cuts.push({ partId: housed.id, cut: computeNotch(housing, housed, joint, 'end') })
  }
  const seat = { partId: housed.id, position: computeDadoSeat(housing, housed, joint).position }
  return { cuts, seat }
```

- [ ] **Step 4: Run the `deriveJoint` tests to verify they pass**

Run: `pnpm vitest run src/geom/dado.test.ts -t "deriveJoint"`
Expected: PASS (all, including the pre-existing plain/rabbeted/stale cases).

- [ ] **Step 5: Write the failing reconciler tests**

In `src/scene/reconcileJoints.test.ts`, add after the `flipping rabbeted → plain…` test (near `:143`):

```ts
test('stopped joint materializes a groove on the housing AND a notch on the housed board', () => {
  const s = scene()
  s.joints = [{ ...s.joints[0], stopStart: 10 }]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
  const notch = D.cuts.find((c) => c.kind === 'box' && c.sourceJointId === 'j1')
  expect(notch && notch.id).toBe('cut_j1_notch0')
})

test('zeroing the stop removes the housed notch cut', () => {
  const s = scene()
  s.joints = [{ ...s.joints[0], stopStart: 10 }]
  const stopped = reconcileJoints(s)
  const through = reconcileJoints({ ...stopped, joints: [{ ...stopped.joints[0], stopStart: 0 }] })
  const D = through.parts.find((p) => p.id === 'D') as BoardPart
  expect(D.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(false)
})
```

- [ ] **Step 6: Run to verify they fail, then pass**

Run: `pnpm vitest run src/scene/reconcileJoints.test.ts`
Expected: PASS — `reconcileJoints` is unchanged and already distributes the extra housed cut; these tests confirm it (no production edit needed). If they fail, do **not** edit `reconcileJoints.ts` — the fault is in Task 4 Step 3; re-check `deriveJoint`.

- [ ] **Step 7: Commit**

```bash
git add src/geom/dado.ts src/geom/dado.test.ts src/scene/reconcileJoints.test.ts
git commit -S -m "feat(geom): derive stopped-dado notches; verify reconciler distribution

<trailers per Commit conventions>"
```

---

## Task 5: `useScene` — setting a stop adds the notch in one undo entry

Test-only (production `useScene`/`reconcileJoints` unchanged; the `onAddJoint` default was set in Task 1). Confirms a stop edit re-derives the housed notch and is a single undoable action.

**Files:**
- Test: `src/scene/useScene.test.ts` (in the `useScene — joints` describe block, after the rabbeted-flip test near `:1578`)

- [ ] **Step 1: Write the failing test**

```ts
  it('setting a stop adds the housed notch cut in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const { Hid, Did } = await twoBoards(result)
    await act(async () => {
      result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
    })
    const jointId = result.current.scene.joints[0].id
    const housedNotches = () => {
      const D = result.current.scene.parts.find((p) => p.id === Did)!
      return D.kind === 'board'
        ? D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === jointId).length
        : 0
    }
    expect(housedNotches()).toBe(0) // through: no notch on the housed board

    await act(async () => {
      result.current.onUpdateJoint(jointId, (j) => ({ ...j, stopStart: 20 }))
    })
    expect(housedNotches()).toBe(1) // stopped: one notch on the housed board

    await act(async () => {
      result.current.undo()
    })
    expect(housedNotches()).toBe(0) // single undo restores through
    expect(result.current.scene.joints[0].stopStart).toBe(0)
  })
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm vitest run src/scene/useScene.test.ts -t "setting a stop"`
Expected: PASS. (The behavior already works via `onUpdateJoint` → `reconcileJoints`; this test locks it in. If it fails at `housedNotches()` going 0→1, the fault is in Task 4, not here.)

- [ ] **Step 3: Commit**

```bash
git add src/scene/useScene.test.ts
git commit -S -m "test(scene): stop edit adds housed notch in a single undo entry

<trailers per Commit conventions>"
```

---

## Task 6: UI — always-visible `Stop A` / `Stop B` inputs

Two `JointNumInput`s on the housing side, below Offset, visible for both plain and rabbeted joints. Housed notch rows already render read-only via `sidebar.tsx`'s `sourceJointId` branch — no housed-side UI code.

**Files:**
- Modify: `src/ui/JointsPanel.tsx:143-148` (insert after the Offset input, before the `j.profile === 'rabbeted'` block)
- Test: `src/ui/sidebar.test.tsx` (in the `Sidebar joints panel — rabbeted` describe)

- [ ] **Step 1: Write the failing tests**

In `src/ui/sidebar.test.tsx`, add to the `Sidebar joints panel — rabbeted` describe (near `:596`):

```ts
  it('shows Stop A / Stop B inputs for the housing part (plain)', () => {
    render(<Sidebar {...props({ scene: jointScene('plain'), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Stop A')).toBeTruthy()
    expect(screen.getByText('Stop B')).toBeTruthy()
  })

  it('keeps Stop A / Stop B visible for a rabbeted joint too', () => {
    render(<Sidebar {...props({ scene: jointScene('rabbeted'), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Stop A')).toBeTruthy()
    expect(screen.getByText('Stop B')).toBeTruthy()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/ui/sidebar.test.tsx -t "Stop"`
Expected: FAIL — no `Stop A` / `Stop B` text in the DOM.

- [ ] **Step 3: Add the inputs to `JointsPanel`**

In `src/ui/JointsPanel.tsx`, immediately after the Offset `JointNumInput` (closes at `:148`) and before `{j.profile === 'rabbeted' && (`:

```tsx
                <JointNumInput
                  label="Stop A"
                  value={j.stopStart}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, stopStart: Math.max(0, v) }))
                  }
                />
                <JointNumInput
                  label="Stop B"
                  value={j.stopEnd}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, stopEnd: Math.max(0, v) }))
                  }
                />
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/ui/sidebar.test.tsx`
Expected: PASS (the two new tests, plus the existing plain/rabbeted panel tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): add Stop A/Stop B blind-dado inputs to JointsPanel

<trailers per Commit conventions>"
```

---

## Task 7: Documentation & final verification

**Files:**
- Create: `docs/superpowers/notes/2026-07-19-stopped-dado-joint-notes.md`
- Modify: `README.md` (joints/feature section, if present), `project-structure.html` (`dado.ts` responsibility line — add `computeNotch`)

- [ ] **Step 1: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-19-stopped-dado-joint-notes.md`:

```markdown
# Stopped (Blind) Dado Joint (JP3) — Implementation Notes

**Date:** 2026-07-19

- Composable `stopStart`/`stopEnd` on `DadoJoint` (default 0 = through, byte-identical to a
  through dado). Format 5→6; `parseFile` defaults both to 0 (defaults-first spread).
- Groove shortening lives entirely in `computeDadoGroove`'s run-axis lines; `ss = se = 0` is the
  identity, guarded by the pre-existing full-span groove test.
- The notch is a new pure `computeNotch` (full-thickness corner box, `depth` deep × `stop` wide),
  placed by the `atLow = (end === 'start') === aligned` world-direction sign mapping.
- **Notch is gated on a length/width housed end** (`faceAxes(housedEnd).depth !== 'z'`), mirroring
  how JP2's rabbet falls back to plain for thickness-seated ends. Without the gate a thickness-end
  notch degenerates (size.z assigned twice → zero-extent box). See spec §2/§5.
- Notch/groove clamp against different boards (housed width/length vs housing run/thickness):
  exact only for normal proportions; documented as out of scope for extreme stop/depth values.
- `reconcileJoints` needed no change — the generic distributor already scatters 1–4 cuts. Verified
  by test, not by editing production.
- No OCCT/mesh/export/drawing changes: the notch is an ordinary `BoxCut`.
```

- [ ] **Step 2: Update `project-structure.html`**

Find the `drawing.ts` / `dado.ts` description line and add `computeNotch` to the `dado.ts` helper list (search for `computeDadoGroove` or `deriveJoint`). If `dado.ts` is not itemized there, add a short line noting the blind-dado support. (If neither `README.md` nor `project-structure.html` mentions joints, skip that file and note it in the notes — do not invent a section.)

- [ ] **Step 3: Update `README.md` if it lists joint features**

Search `README.md` for "dado" / "joint". If a joints/features list exists, add "stopped/blind dado" alongside plain/rabbeted. If not, skip (do not add a new section speculatively).

- [ ] **Step 4: Full verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — typecheck clean, lint clean, all tests green (including every JP1/JP2 test).

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: PASS — `tsc + vite build` succeeds (`dist/` emitted).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/notes/2026-07-19-stopped-dado-joint-notes.md project-structure.html README.md
git commit -S -m "docs(joints): stopped/blind dado notes + structure/README updates

<trailers per Commit conventions>"
```

- [ ] **Step 7: Push**

```bash
git push -u origin claude/next-step-suggestion-i0qjjd
```

---

## Verification checklist (whole feature)

- [ ] `stopStart = stopEnd = 0` produces a groove byte-identical to today (through test green).
- [ ] `computeDadoGroove` insets the run axis; combined stops clamp to ≥ 1 mm.
- [ ] `computeNotch` corner box: `depth` deep, `stop` wide, full thickness, correct width end via `aligned`.
- [ ] `deriveJoint`: groove + 0/1/2 notches by stop count; composes with rabbeted (up to 4 cuts).
- [ ] Thickness-seated housed end: groove only, notch skipped (no degenerate box).
- [ ] `reconcileJoints` distributes the notch(es) unchanged; zeroing stops removes them.
- [ ] Stop edit is a single undo entry in `useScene`.
- [ ] `Stop A` / `Stop B` render for the housing part (plain and rabbeted); housed notch rows read-only.
- [ ] File format 6; v5 files load with both stops defaulted to 0.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
