# Auto-Suggest Joints — Design Spec

**Date:** 2026-07-26
**Status:** approved (brainstorm) → revised during planning (contact-based detection; finger deferred) → ready for implementation plan

## Overview

Add a **joint-suggestion** feature: when a single board is selected, Zimmu inspects the boards
touching it and offers the joint types that would actually work between them, each with a one-click
**Add**. It answers "what can I join here?" without the user hunting through the joint gestures and
discovering only after two clicks that the geometry is stale.

This is **not** a new joint type and touches **no** kernel, mesh, worker, export, drawing, file
format, or `Joint` data model. It is a thin, pure read-over of the scene plus a UI panel that
replays a suggestion through the **existing** `onAdd*` creators. Applying a suggestion produces
exactly the same joint (cuts + optional seat + single undo entry) as performing the two-click
gesture by hand.

Two forks were settled during the brainstorm:

- **Trigger: selection-driven.** Suggestions are computed for the one currently-selected board
  against its neighbours — not a continuous global scan of every pair.
- **Surface: a sidebar panel.** A "Suggested joints" section in the selected part's `EditPanel`,
  not an in-viewport chip. No Three.js screen-projection plumbing; fully testable.

## Revision note (why this differs from the brainstorm)

The brainstorm's plan was "enumerate the six faces of each board, run each joint's `isValid*` gate,
take the first pair that passes." Verification against the real gates during planning showed this is
**geometrically wrong for four of the five joints**: only `isValidHalfLap` is position-aware. The
dado, mortise-tenon, tongue-groove, and finger gates check **orientation only** (anti-parallel or
perpendicular face normals), because the two-click UI depends on the *human* clicking the actually
touching faces. Blind enumeration would pick the first *orientation*-passing pair — e.g. two edge
faces far apart — and emit a joint on the wrong faces.

Two consequences, both folded into this revision:

1. **Detection must be contact-based.** A `contactPair()` helper infers the faces that physically
   meet (from world AABBs), and the existing gates validate *that* pair. See Core Algorithm.
2. **Finger joints are deferred.** A finger/box joint is a *perpendicular interlocking corner* —
   a different geometry from the anti-parallel face contacts `contactPair` models. It needs its own
   corner detector; bolting a second heuristic on now would bloat the MVP. The MVP ships the four
   joints that share the contact/coplanar model: **half-lap, dado, mortise-tenon, tongue-groove**.

## Goals

- A pure, browser-free engine `src/scene/suggestJoints.ts`:
  - `suggestJointsFor(selectedId, parts, joints): JointSuggestion[]` — the applicable joints for the
    selected board vs. each neighbouring board.
  - `contactPair(a, b)` — infers the physically-meeting face on each board (or `null`).
  - `synthHit(partId, face): FaceHit` — synthesises the minimal `FaceHit` an `onAdd*` creator reads.
- A `JointSuggestion` discriminated union (in-memory only; **never serialised**).
- A `src/ui/SuggestionsPanel.tsx` component: one row per suggestion (`<joint type> with <neighbour>`)
  plus an **Add** button; renders nothing when empty.
- Wiring: an `App.tsx` `useMemo` computing `suggestions` for `selectedId`, an `applySuggestion`
  dispatcher routing each suggestion to the matching existing `onAdd*`, and the prop threading
  through `Sidebar → EditPanel → SuggestionsPanel`.
- Tests on the engine seam (contact detection, per-type applicability, already-joined exclusion, a
  **round-trip** guarantee) and the panel (row rendering + Add wiring).
- Docs: notes file + `project-structure.html`.

## Non-Goals

- **Finger / box joints** — deferred (see Revision note). A follow-up spec adds a perpendicular-corner
  detector and a fifth `JointSuggestion` variant.
- **No continuous / global scanning.** Only the selected board is considered. A hidden board, or an
  empty/non-board selection, yields no suggestions.
- **No in-viewport chip / overlay.** Sidebar list only.
- **No auto-apply, no settings, no "apply all".** Every joint is one explicit click.
- **No new ranking model.** A fixed neighbour-distance-then-kind ordering, capped to a small count.
- **No board↔dowel (cylinder) joints.** All gates are board↔board; cylinders are ignored.
- **No new joint parameters at suggest time.** Applying uses each creator's existing defaults (the
  same values the two-click gesture produces). The user tunes afterwards in the existing `JointsPanel`.
- **No suggestions for far-apart boards.** Detection requires the boards to be touching/near-touching
  (post-snap placement). Two boards the user intends to seat together from a distance are joined via
  the existing two-click gesture, not suggested. (Documented tradeoff — see Risks.)

## Why no data-model / file-format change

A `JointSuggestion` is transient derived state describing *how to call a creator* — not scene state,
never persisted. `FILE_FORMAT_VERSION` is unchanged, `types.ts` `Joint`/`Scene` are unchanged, and
`reconcileJoints`/`deriveJoint` are untouched. Applying a suggestion goes through the same `onAdd*`
path as a manual gesture, so the resulting `Joint` is indistinguishable from a hand-made one.

## Data Model (in-memory only — `src/scene/suggestJoints.ts`)

```ts
import type { Face, PartId } from './types'

interface SuggestionBase {
  neighborId: PartId // the OTHER board (≠ selected); for the row label
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
```

Each variant carries **exactly** the parts + faces its matching `onAdd*` creator needs — no display
strings (the panel derives labels from `scene.parts`). `kind` mirrors the corresponding `Joint`
union tags so the apply dispatcher and the panel's label map `switch` exhaustively.

## Core Algorithm — `suggestJointsFor(selectedId, parts, joints)`

**Preconditions.** Return `[]` if `selectedId == null`, the selected part is absent, or it is not a
**visible board** (`p.kind === 'board' && p.visible`).

Let `S` be the selected board. For each other part `T`:

1. **Skip** unless `T.kind === 'board' && T.visible && T.id !== S.id`.
2. **Already-joined gate.** Skip the pair if an existing joint already links both:
   `joints.some(j => jointInvolves(j, S.id) && jointInvolves(j, T.id))`.
3. **Half-lap** (position-aware gate, no faces): if `isValidHalfLap(S, T)` push
   `{ kind:'halflap', neighborId: T.id, partAId: S.id, partBId: T.id }`. (Half-lap boards cross and
   overlap on all axes, so they have no single contact face — detected on their own strong gate.)
4. **Contact-based joints.** Compute `pair = contactPair(S, T)`. If non-null, classify by the
   contact faces' local depth axes and validate against the existing gates (below).

### Contact detection — `contactPair(a, b)`

All joint gates require **axis-aligned** boards, so every face maps to a world ±axis and each face is
an axis-aligned rectangle at a known world coordinate. `worldAabb` (from `../geom/halflap`, already
exported + parity-tested) gives each board's world box.

```ts
type WorldAxis = 'x' | 'y' | 'z'
const WORLD_AXES: WorldAxis[] = ['x', 'y', 'z']
const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
const TOUCH_TOL = 1 // mm
const EPS = 1e-4

// Local face → world unit normal, via the rotation columns of composeWorldMatrix (THREE-free).
function worldFaceNormal(b: BoardPart, f: Face): Vec3 {
  const m = composeWorldMatrix(b) // Float64Array, column-major
  const col = f.includes('X') ? [m[0], m[1], m[2]] : f.includes('Y') ? [m[4], m[5], m[6]] : [m[8], m[9], m[10]]
  const s = f[0] === '+' ? 1 : -1
  return { x: col[0] * s, y: col[1] * s, z: col[2] * s }
}

// The board's local face whose world normal points along (ax, sign).
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
    if (gap > TOUCH_TOL) return null // separated on this axis → not adjacent at all
    if (gap > bestGap) {
      bestGap = gap
      contactAx = ax
    }
  }
  if (!contactAx) return null
  const aMid = (A.min[contactAx] + A.max[contactAx]) / 2
  const bMid = (B.min[contactAx] + B.max[contactAx]) / 2
  const sign = bMid >= aMid ? 1 : -1 // world direction from A toward B
  const faceA = faceTowardWorld(a, contactAx, sign)
  const faceB = faceTowardWorld(b, contactAx, -sign)
  return faceA && faceB ? { faceA, faceB } : null
}
```

**Contact axis = the axis with the largest (least-negative) gap** among the three — i.e. the axis on
which the boards are only just touching while overlapping on the others. That is the axis they *meet*
on. `contactPair` returns `null` if the boards are separated on any axis (beyond `TOUCH_TOL`), so it
doubles as the adjacency gate. By construction `faceA` and `faceB` have exactly opposite world
normals (they face each other).

*Assumption:* shallow, post-snap contact — the seat axis has the smallest overlap. Deep penetration
could flip the argmax; out of scope (documented in Risks).

### Classification & validation (contact pair `faceA` on `S`, `faceB` on `T`)

Let `dS = faceAxes(faceA).depth`, `dT = faceAxes(faceB).depth` (each `'x' | 'y' | 'z'` — the local
axis of the face normal: `'z'` = broad thickness face, `'y'` = long edge, `'x'` = end).

- **Perpendicular tee → dado + mortise-tenon** — when **exactly one** contact face is a broad face
  (`dS === 'z'` XOR `dT === 'z'`). The broad-face board is the housing/mortise; the other is the
  housed/tenon (its contact face is an end/edge). Then:
  - if `isValidDadoSeat(housing, housingFace, housed, housedEnd)` → push a `dado` suggestion;
  - if `isValidMortiseTenon(mortise, mortiseFace, tenon, tenonEnd)` → push a `mortise-tenon`
    suggestion.

  Both use the same role assignment (`mortise = housing`, `tenon = housed`). A perpendicular tee is
  genuinely joinable either way, so offering both is correct.

- **Coplanar edge glue-up → tongue-groove** — when **both** contact faces are long edges
  (`dS === 'y' && dT === 'y'`). Role: `groove = S` (stays put), `tongue = T`. If
  `isValidTongueGroove(S, faceA, T, faceB)` → push a `tongue-groove` suggestion. (`isValidTongueGroove`
  additionally enforces coplanarity + equal thickness, so a perpendicular L of two edges is rejected.)

- **Otherwise** (two broad faces = lamination; two ends = butt/corner) → no MVP suggestion.

This classification-first approach means each contact pair yields at most a dado+M&T pair *or* a T&G,
never spurious cross-type noise (e.g. it does **not** offer M&T for a coplanar edge glue-up, which the
raw orientation gate would wrongly accept).

### Ordering & cap

Sort by **(neighbour distance ascending, then a fixed `KIND_PRIORITY`)** so the nearest neighbour's
options group together. Neighbour distance = world-AABB-centre distance `S↔T`.
`KIND_PRIORITY = ['halflap', 'dado', 'mortise-tenon', 'tongue-groove']`. Cap at `MAX_SUGGESTIONS = 8`.

### Complexity

Per selection: `(N−1)` neighbours × O(1) contact detection + a few gate calls — trivial. Recomputed
via `useMemo` keyed on `selectedId`, `scene.parts`, `scene.joints`.

## Apply Path

The `onAdd*` creators (in `useScene`) read only `partId` and `localFaceNormal` from a `FaceHit`
(verified: each does `localNormalToFaceString(hit.localFaceNormal)` + a part lookup). A suggestion is
replayed by synthesising minimal hits — identical in shape to the `hit()` helper the `useScene` tests
already use:

```ts
const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
// Private FACE_NORMALS: Record<Face, Vec3>, matching the per-file convention already used in
// geom/{dado,mortisetenon,tonguegroove,fingerjoint}.ts (each keeps its own local copy).
export function synthHit(partId: PartId, face: Face): FaceHit {
  const n = FACE_NORMALS[face]
  return { partId, faceNormal: n, faceCenter: ZERO, localFaceNormal: n, localHitPoint: ZERO, hitPoint: ZERO }
}
```

`localNormalToFaceString(FACE_NORMALS[face]) === face` round-trips, so the creator decodes the exact
face the engine chose (asserted in tests).

The dispatcher lives in `App.tsx` (which already holds every `onAdd*` from `useScene`):

```ts
const applySuggestion = useCallback(
  (s: JointSuggestion) => {
    switch (s.kind) {
      case 'halflap':
        return onAddHalfLap(s.partAId, s.partBId)
      case 'dado':
        return onAddJoint(synthHit(s.housingPartId, s.housingFace), synthHit(s.housedPartId, s.housedEnd))
      case 'mortise-tenon':
        return onAddMortiseTenon(synthHit(s.mortisePartId, s.mortiseFace), synthHit(s.tenonPartId, s.tenonEnd))
      case 'tongue-groove':
        return onAddTongueGroove(synthHit(s.groovePartId, s.grooveEdge), synthHit(s.tonguePartId, s.tongueEdge))
    }
  },
  [onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddTongueGroove],
)
```

Because it goes through `onAdd*`, apply participates in undo/redo and cut derivation for free. The
creators **re-validate** internally, so a stale suggestion (parts moved between render and click)
fails safely with no joint created.

## UI — `src/ui/SuggestionsPanel.tsx`

Mirrors `JointsPanel`'s structure/styling. Rendered inside `EditPanel` **immediately above** the
existing `<JointsPanel>` (suggestions to *add*, then joints that *exist*).

```tsx
const KIND_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'Mortise & tenon',
  'tongue-groove': 'Tongue & groove',
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

`partLabel(scene, id)` is the same one-liner `JointsPanel` uses (find part → `label` ?? `'(deleted)'`).
The `suggestions` array is already scoped to the selected board by the engine, so the panel needs no
extra filtering. Keys use array index (rows are ephemeral, carry no input state).

## Wiring

- **`App.tsx`:**
  - `const suggestions = useMemo(() => suggestJointsFor(selectedId, scene.parts, scene.joints), [selectedId, scene.parts, scene.joints])`.
  - Add the `applySuggestion` dispatcher above.
  - Pass `suggestions` and `onApplySuggestion={applySuggestion}` to `<Sidebar>`.
- **`sidebar.tsx`:** add `suggestions` + `onApplySuggestion` to `SidebarProps` and to `EditPanel`'s
  props; render `<SuggestionsPanel suggestions={suggestions} scene={scene} onApply={onApplySuggestion} />`
  just above `<JointsPanel …>` in `EditPanel`.

No viewport, worker, or geom-kernel change.

## Edge Cases

- **Selection empty / non-board / hidden** → `[]` (panel hidden).
- **Hidden neighbour / cylinder** → skipped.
- **Pair already joined** → no suggestion for that pair.
- **Perpendicular tee** → both dado and mortise-tenon rows.
- **Coplanar edge glue-up** → tongue-groove only (M&T *not* offered — classification excludes it).
- **Face-lamination / butt-corner** → nothing (no MVP joint fits).
- **Stale-at-click** → creator re-validates and no-ops; panel recomputes next render.

## Testing

**`src/scene/suggestJoints.test.ts`** (pure, no OCCT, no React). Fixtures are **physically coherent**
(boards actually touching at the declared faces — do *not* reuse the geometrically-arbitrary fixtures
from the joints' own derivation tests):

- `contactPair`: a board resting on another's broad face → contact axis + the broad/end faces; two
  boards edge-to-edge → the two long-edge faces; boards separated beyond `TOUCH_TOL` → `null`.
- `suggestJointsFor`:
  - Two crossing coplanar equal-thickness boards → a `halflap` suggestion.
  - A board standing perpendicular on another's broad face, touching → **both** `dado` and
    `mortise-tenon`.
  - Two coplanar equal-thickness boards abutting along a long edge → a `tongue-groove` suggestion,
    and **no** `mortise-tenon` (classification guard).
  - Boards separated beyond `TOUCH_TOL` → `[]`.
  - A pair already carrying a joint → no suggestion for that pair.
  - `selectedId` null / a cylinder / a hidden board → `[]`.
  - **Round-trip (key correctness test):** for every suggestion returned, feed its carried faces
    back through the matching `isValid*` gate and assert `true` — apply can never dead-end.
- `synthHit`: `localFaceNormal === FACE_NORMALS[face]`, and
  `localNormalToFaceString(synthHit(id, face).localFaceNormal) === face` for all six faces.

**`src/ui/SuggestionsPanel.test.tsx`** (happy-dom + testing-library):

- N suggestions → N rows with `<KIND_LABEL> with <neighbour label>` + an Add button.
- Clicking Add calls `onApply` with that exact suggestion.
- Empty suggestions → renders nothing.

The apply dispatch needs no new integration test: `synthHit`'s round-trip plus the existing
`useScene` `onAdd*` tests cover creator behaviour end-to-end.

## Docs

- `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` — living notes (record the
  enumeration-was-wrong discovery, contact-axis heuristic + its shallow-contact assumption,
  `TOUCH_TOL`, finger-deferral rationale, ranking heuristic).
- `project-structure.html` — add `src/scene/suggestJoints.ts` and `src/ui/SuggestionsPanel.tsx` and
  a line on the selection→suggestions→apply data flow.
- **No** `keyboard-shortcuts.md` change — the feature adds no shortcut/mode.

## Files Touched

| File | Change |
| --- | --- |
| `src/scene/suggestJoints.ts` | **new** — engine + `contactPair` + `synthHit` + `JointSuggestion` |
| `src/scene/suggestJoints.test.ts` | **new** — contact + engine + round-trip + `synthHit` tests |
| `src/ui/SuggestionsPanel.tsx` | **new** — the panel |
| `src/ui/SuggestionsPanel.test.tsx` | **new** — panel render + Add wiring |
| `src/App.tsx` | `suggestions` memo + `applySuggestion` dispatcher + props to `Sidebar` |
| `src/ui/sidebar.tsx` | thread `suggestions`/`onApplySuggestion` → `EditPanel` → `SuggestionsPanel` |
| `project-structure.html` | new files + data-flow note |
| `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` | **new** — notes |

Untouched: `types.ts`, `useFile.ts` (no format bump), `useScene.ts` (creators reused as-is),
`useInteractionMode.ts`, all `geom/*`, worker, mesh, drawing, export.

## Risks & Open Questions

- **Contact-axis heuristic** assumes shallow post-snap contact (the seat axis has the smallest
  overlap). Deep penetration could flip the argmax and mis-pick the contact axis. Acceptable for the
  MVP (users snap boards together before jointing); revisit if it misfires.
- **`TOUCH_TOL` = 1 mm** — too large invites noise, too small misses near-but-not-snapped placements.
  Tunable const.
- **No far-apart suggestions.** Boards the user places apart intending to auto-seat get no suggestion
  (they use the two-click gesture). Deliberate, to keep the list intent-scoped.
- **`KIND_PRIORITY`** ordering is a heuristic, not derived from joint strength; adjustable.
- **Finger deferred** — needs a perpendicular-corner detector (`contactPair` models anti-parallel
  contact only). Tracked as a fast-follow; adds a fifth `JointSuggestion` variant + an
  `onAddFingerJoint` dispatcher arm.
- **`FACE_NORMALS` duplication** — a fifth private copy, consistent with the existing per-file
  convention in `geom/*`. Consolidation is a separate refactor, out of scope.
</content>
