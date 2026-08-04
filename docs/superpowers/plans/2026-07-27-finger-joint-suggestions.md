# Finger-Joint Suggestions Implementation Plan

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

### Task 1: `cornerPair` corner detector

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

### Task 2: Fifth suggestion variant + engine branch

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

### Task 3: Apply dispatcher arm

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

### Task 4: Docs

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

## Self-Review (completed by plan author)

**Spec coverage:** `cornerPair` + `aabbCenter` + `endTowardPoint` + `endFaceCenterWorld` + `NON_BROAD_FACES` → Task 1; the `aabbCenterDist` cleanup → Task 1; fifth variant + engine branch + `KIND_PRIORITY` → Task 2; `KIND_LABEL` → Task 2 (moved from its own task because the type makes it a compile error); dispatcher arm + dependency → Task 3; tests (corner, far-apart, false-positive, engine emit, round-trip extension) → Tasks 1–2; the spec's "additive regression" requirement → satisfied by the existing `toEqual` fixtures, verified in Task 2 Step 4 rather than duplicated; docs → Task 4.

**Placeholder scan:** none — every step contains runnable code or an exact command.

**Type consistency:** the variant's fields (`partAId`, `endA`, `partBId`, `endB`) are identical across the union (Task 2 3a), the engine push (3d), the round-trip test (Task 2 Step 1), and the dispatcher (Task 3) — and match `FingerJoint` in `types.ts:170-180`. `cornerPair`'s return shape `{ endA, endB }` matches all three call sites. Verified signatures against source: `isValidFingerJoint(a, endA, b, endB)` (`fingerjoint.ts:60`), `computeLocalFaceCenter(localFaceNormal, part)` (`snapMath.ts:40`), `applyMatrixToPoint(m, x, y, z)` (`transform.ts:50`), `onAddFingerJoint(hitA, hitB)` (`useScene.ts:978`), `worldAabb(b) → { min, max }` (`halflap.ts:17`).

**Fixture arithmetic:** hand-derived and cross-checked against the three shipped fixtures — `cornerPair` returns `null` for the crossing pair (coincident centres ⇒ no positive dot), and the tee (91.5 mm apart) and edge (anti-parallel ends) pairs are rejected, so no existing assertion changes.
</content>
