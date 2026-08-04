# Finger-Joint Suggestions — Design Spec

**Date:** 2026-07-27
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Add the fifth and final joint type to the joint-suggestion feature: **finger (box) joints**. When a
board is selected and a neighbouring board forms a right-angle corner with it, the sidebar offers
"Finger joint with …" alongside the existing suggestions, applied with one click.

This closes the fast-follow deferred by `2026-07-26-auto-suggest-joints-design.md`. That spec shipped
four joint types and explicitly excluded finger because a corner is **not** the anti-parallel face
contact that `contactPair` models — it needs its own detector. This spec adds exactly that detector
and nothing else.

Scope is deliberately narrow: no kernel, worker, mesh, export, drawing, file-format, or `Joint`
data-model change; no change to `contactPair` or to the four suggestion kinds already shipping.

## What the existing code already gives us

Two findings from exploration determine the whole design:

1. **`isValidFingerJoint(a, endA, b, endB)`** (`src/geom/fingerjoint.ts:60`) already enforces almost
   everything: both boards axis-aligned; neither end is a broad face (`faceAxes(end).depth !== 'z'`);
   the two end normals perpendicular (a 90° corner); the two finger axes parallel (a shared edge);
   and matching widths along the finger axis. The **only** thing it does not check is *position* —
   two boards at opposite ends of the model can satisfy all of it.
2. **`computeFingerSeat`** (`src/geom/fingerjoint.ts:121`) is documented as seating B so its end
   region "interpenetrates A's to a flush right-angle corner", picking the corner side nearest B's
   current end so the move is "minimal and idempotent once seated".

So the detector's entire job is: *are these two boards at the same corner, and which end of each is
in it?* Every joint-specific rule delegates to the existing gate.

Because seating is minimal and idempotent, one adjacency rule covers both layouts a user can have:
a **butt** corner (boards touching, gaps ≈ 0) and an **already-seated** corner (boards
interpenetrating, gaps negative). Both satisfy "all three world-AABB axis gaps ≤ `TOUCH_TOL`". No
special-casing, and applying is a small nudge in the first case and a no-op in the second.

## Goals

- `cornerPair(a, b): { endA: Face; endB: Face } | null` in `src/scene/suggestJoints.ts` — adjacency
  test plus "which end of each board faces the other".
- A fifth `JointSuggestion` variant, `{ kind: 'finger'; partAId; endA; partBId; endB }`.
- A new branch in `suggestJointsFor` emitting it when `isValidFingerJoint` passes.
- `KIND_LABEL.finger = 'Finger joint'`; `'finger'` added to `KIND_PRIORITY`.
- One dispatcher arm in `App.tsx` → `onAddFingerJoint`.
- Tests: `cornerPair` (corner + far-apart), the engine emitting `finger`, and the existing
  round-trip test extended to the new kind.
- Docs: notes entry + `project-structure.html` touch-up.

## Non-Goals

- **No geometry change.** `isValidFingerJoint`, `computeFingerCuts`, `computeFingerSeat`, and
  everything else in `src/geom/fingerjoint.ts` are used as-is, unmodified.
- **No change to `contactPair`** or to the tee/edge classification. The finger branch is independent
  and additive; the four shipped suggestion kinds must behave identically.
- **No new joint parameters at suggest time.** `onAddFingerJoint` computes `fingerCount` and
  `clearance` itself; the user tunes them afterwards in the existing `JointsPanel`.
- **No data-model or file-format change.** `JointSuggestion` remains in-memory only;
  `FILE_FORMAT_VERSION` and `types.ts` are untouched.
- **No mitre suggestions.** `mitre` is a cut (`EndCut`), not a member of the `Joint` union.
- **No board↔cylinder joints**; boards only, as before.
- **No suggestions for far-apart corners.** Two boards the user intends to bring together from a
  distance are joined with the existing two-click gesture, consistent with the shipped behaviour.

## Data Model (in-memory only)

Extend the union in `src/scene/suggestJoints.ts` with a fifth variant, mirroring `FingerJoint`'s
field names exactly as the other four variants mirror theirs:

```ts
| { kind: 'finger'; partAId: PartId; endA: Face; partBId: PartId; endB: Face }
```

**Role assignment is load-bearing.** `FingerJoint.partAId` is the lead board that *stays put*;
`partBId` *auto-seats into the corner* (`src/scene/types.ts:174-177`). Therefore
**`partAId` = the selected board**, `partBId` = the neighbour. Selecting a board and clicking Add
must never move the board you selected. This matches the tongue-groove precedent already shipping
(`groove` = selected, stays put; `tongue` = neighbour, seats).

## Core Algorithm

### `cornerPair(a, b)`

```ts
const NON_BROAD_FACES: Face[] = ['+X', '-X', '+Y', '-Y']

function aabbCenter(box: { min: Vec3; max: Vec3 }): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  }
}

// The board's end face whose world normal points most toward `target`; null if none points toward it.
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

export function cornerPair(a: BoardPart, b: BoardPart): { endA: Face; endB: Face } | null {
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null // separated ⇒ not a corner
  }
  const ca = aabbCenter(A)
  const cb = aabbCenter(B)
  const endA = endTowardPoint(a, ca, cb)
  const endB = endTowardPoint(b, cb, ca)
  return endA && endB ? { endA, endB } : null
}
```

Notes:

- `NON_BROAD_FACES` are the four local faces with depth `'x'` or `'y'` — exactly the ends
  `isValidFingerJoint` accepts. Iterating only these means a broad face can never be proposed.
- `worldFaceNormal`, `worldAabb`, `WORLD_AXES`, and `TOUCH_TOL` all already exist in the file from
  the shipped work; nothing new is introduced beyond `NON_BROAD_FACES`, `aabbCenter`, and
  `endTowardPoint`.
- `bestDot` starts at `0`, so a face is only chosen if it genuinely points toward the other board.
- **Deliberate small cleanup:** the existing `aabbCenterDist` computes AABB centres inline with the
  same arithmetic `aabbCenter` now encapsulates. Rather than leave two copies in one file, it should
  become:

  ```ts
  function aabbCenterDist(a: BoardPart, b: BoardPart): number {
    const ca = aabbCenter(worldAabb(a))
    const cb = aabbCenter(worldAabb(b))
    let sum = 0
    for (const ax of WORLD_AXES) sum += (ca[ax] - cb[ax]) * (ca[ax] - cb[ax])
    return Math.sqrt(sum)
  }
  ```

  This is the **only** modification to existing logic in this spec, it is behaviour-preserving, and
  the existing sort-order test covers it. Nothing else in the shipped code is to be refactored.

### Engine branch in `suggestJointsFor`

The finger check is independent of the `contactPair` classification and must be placed **before**
the existing `if (!pair) continue` guard, so a corner is never skipped by an unrelated early return:

```ts
if (isValidHalfLap(s, t)) {
  out.push({ kind: 'halflap', ... })          // existing
}

// A right-angle corner is neither an anti-parallel face contact nor a coplanar cross, so it is
// detected on its own and does not participate in the contactPair classification below.
const corner = cornerPair(s, t)
if (corner && isValidFingerJoint(s, corner.endA, t, corner.endB)) {
  out.push({
    kind: 'finger',
    neighborId: t.id,
    partAId: s.id,       // selected board stays put
    endA: corner.endA,
    partBId: t.id,       // neighbour auto-seats into the corner
    endB: corner.endB,
  })
}

const pair = contactPair(s, t)
if (!pair) continue
// … existing tee / edge classification, unchanged …
```

### Ordering

Add `'finger'` to `KIND_PRIORITY` between `'mortise-tenon'` and `'tongue-groove'`, keeping the
edge-glue-up last:

```ts
const KIND_PRIORITY = ['halflap', 'dado', 'mortise-tenon', 'finger', 'tongue-groove']
```

Sorting (neighbour distance, then kind priority) and `MAX_SUGGESTIONS = 8` are otherwise unchanged.

## Apply Path

One new arm in `applySuggestion` (`src/App.tsx`), replaying through the existing creator exactly as
the other four kinds do:

```ts
case 'finger':
  return onAddFingerJoint(synthHit(s.partAId, s.endA), synthHit(s.partBId, s.endB))
```

`onAddFingerJoint` (`src/scene/useScene.ts:978`) reads only `partId` and `localFaceNormal` from each
hit — the same contract `synthHit` already satisfies for the other kinds — re-validates with
`isValidFingerJoint`, and commits via `commitReconciled`, so undo/redo, cut derivation, and seating
come for free and a stale suggestion fails safely with no joint created.

`onAddFingerJoint` must be added to the `useCallback` dependency array of `applySuggestion`.

## UI

`KIND_LABEL.finger = 'Finger joint'` in `src/ui/SuggestionsPanel.tsx`. No other panel change: rows,
Add buttons, and the empty state are generic over the union.

`KIND_LABEL` is typed `Record<JointSuggestion['kind'], string>`, so **adding the variant without the
label is a compile error** — the type system enforces this one. The dispatcher arm is *not* similarly
enforced (the switch has no `never` exhaustiveness guard), so omitting it would silently no-op. See
Risks.

## Wiring

No new props, no new component, no new file. The change is confined to:
`suggestJoints.ts` (detector + variant + branch + priority), `SuggestionsPanel.tsx` (one label),
`App.tsx` (one dispatcher arm + one dep).

## Edge Cases

- **Far-apart boards** → `cornerPair` returns `null` (separated on some axis) → no suggestion.
- **Adjacent but not a corner** (e.g. a tee or an edge glue-up) → `cornerPair` may return a pair, but
  `isValidFingerJoint` rejects it (ends not perpendicular, or a broad face, or mismatched widths).
- **Mismatched widths** at a genuine corner → rejected by the gate; no suggestion. Correct: the
  finger geometry requires equal shared width.
- **Already-joined pair** → skipped by the existing `jointInvolves` guard before any detection.
- **Hidden board / cylinder / no selection** → skipped by the existing preconditions.
- **Butt corner** → now lists Finger joint *in addition to* the Dado and Mortise & tenon it already
  lists. All three are legitimate for that geometry; offering them together is consistent with the
  shipped decision to offer dado and M&T for a tee rather than guessing.
- **Already-seated corner** → suggested, and applying is an idempotent no-op move.

## Testing

**`src/scene/suggestJoints.test.ts`** (extend; pure, no OCCT, no React):

- `cornerPair` on a physically coherent box corner → the two expected end faces.
- `cornerPair` on the existing far-apart fixtures → `null`.
- `suggestJointsFor` on a box corner → the returned kinds include `'finger'`.
- The existing **round-trip test** extended with the corner scene, asserting every emitted `finger`
  suggestion re-passes `isValidFingerJoint(partA, endA, partB, endB)` — so apply can never dead-end.
- A regression assertion that the four shipped fixtures (tee, edge, crossing) return the **same**
  kinds as before, proving the new branch is purely additive.

**Fixtures:** build a real corner and verify it by computing world AABBs — two panels meeting at a
right angle along a shared edge, equal widths along the finger axis, one rotated so its end normal is
perpendicular to the other's. **Do not** reuse the fixtures from `fingerjoint.test.ts`: those exist to
test cut derivation and are geometrically arbitrary (the declared faces need not match the boards'
actual positions, because the creator seats them). This trap is already recorded in the
2026-07-26 notes and applies here verbatim.

**`src/ui/SuggestionsPanel.test.tsx`:** no new test required — the panel is generic and the label is
compile-enforced. (Adding `finger` to the existing fixture array is optional and harmless.)

## Docs

- Append to `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` (the feature's existing
  notes file — keep one thread rather than starting a second): the corner-detector approach,
  why `contactPair` could not be reused, the butt-plus-seated scope decision, and the role
  assignment (selected board = A, stays put).
- `project-structure.html`: update the `suggestJoints.ts` description to mention corner detection /
  all five joint types.
- **No** `keyboard-shortcuts.md` change — no shortcut or mode is added.

## Files Touched

| File | Change |
| --- | --- |
| `src/scene/suggestJoints.ts` | `cornerPair` + `aabbCenter` + `endTowardPoint` + `NON_BROAD_FACES`; fifth variant; engine branch; `KIND_PRIORITY`; `aabbCenterDist` reuses `aabbCenter` |
| `src/scene/suggestJoints.test.ts` | `cornerPair` tests, engine test, round-trip extension, additive-regression assertion |
| `src/ui/SuggestionsPanel.tsx` | one `KIND_LABEL` entry |
| `src/App.tsx` | one dispatcher arm + `onAddFingerJoint` dependency |
| `project-structure.html` | description touch-up |
| `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` | appended notes entry |

Untouched: all of `src/geom/`, `useScene.ts`, `sidebar.tsx`, `types.ts`, `useFile.ts`, worker, mesh,
drawing, export.

## Risks & Open Questions

- **Dispatcher arm is not compile-enforced.** Unlike `KIND_LABEL`, `applySuggestion`'s switch has no
  `never` exhaustiveness guard, so a missing `case 'finger'` would compile and silently do nothing on
  click. The plan must include the arm explicitly, and the round-trip test does not cover it.
  Mitigation: verify by inspection during review; adding an exhaustiveness guard is out of scope here
  (it would touch the shipped dispatcher's shape).
- **`endTowardPoint` uses AABB centres**, so for an L-shaped pair whose centres are oddly placed the
  argmax could pick an unintended end. `isValidFingerJoint` then rejects the pair, so the failure mode
  is a *missing* suggestion, not a wrong one — fail-closed, consistent with `contactPair`'s existing
  behaviour for non-axis-aligned boards.
- **Butt corners now produce three suggestions** (Dado, Mortise & tenon, Finger joint). Judged correct
  above, but it is the most visible behavioural change and worth confirming in the app.
- **`TOUCH_TOL` is reused** (1 mm). If it is ever retuned for `contactPair`, corner detection moves
  with it — intended, since both mean "these boards are adjacent".
</content>
