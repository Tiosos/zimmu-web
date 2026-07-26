# Auto-Suggest Joints — Design Spec

**Date:** 2026-07-26
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Add a **joint-suggestion** feature: when a single board is selected, Zimmu inspects the boards
touching it and offers the joint types that would actually work between them, each with a one-click
**Add**. It answers "what can I join here?" without the user hunting through the six two-click
joint gestures and discovering only after two clicks that the geometry is stale.

This is **not** a new joint type and touches **no** kernel, mesh, worker, export, drawing, file
format, or `Joint` data model. It is a thin, pure read-over of the existing joint validity gates
plus a UI panel that replays a suggestion through the **existing** `onAdd*` creators. Applying a
suggestion produces exactly the same joint (cuts + optional seat + single undo entry) as performing
the two-click gesture by hand.

The MVP is deliberately narrow (see Non-Goals). Two forks were settled during the brainstorm:

- **Trigger: selection-driven.** Suggestions are computed for the one currently-selected board
  against its neighbours — not a continuous global scan of every pair. Bounded, low-noise, and it
  reuses the app's existing single-selection model.
- **Surface: a sidebar panel.** A "Suggested joints" section in the selected part's `EditPanel`,
  not an in-viewport chip. No Three.js screen-projection plumbing; fully testable.

## Goals

- A pure, browser-free engine `src/scene/suggestJoints.ts`:
  - `suggestJointsFor(selectedId, parts, joints): JointSuggestion[]` — the applicable joints for the
    selected board vs. each neighbouring board.
  - `areAdjacent(a, b, tol)` — an AABB proximity gate.
  - `synthHit(partId, face): FaceHit` — synthesises the minimal `FaceHit` an `onAdd*` creator reads.
- A `JointSuggestion` discriminated union (in-memory only; **never serialised**).
- A `src/ui/SuggestionsPanel.tsx` component: one row per suggestion (`<joint type> with <neighbour>`)
  plus an **Add** button; renders nothing when empty.
- Wiring: an `App.tsx` `useMemo` computing `suggestions` for `selectedId`, an `applySuggestion`
  dispatcher that routes each suggestion to the matching existing `onAdd*`, and the prop threading
  through `Sidebar → EditPanel → SuggestionsPanel`.
- Tests on the engine seam (applicability, adjacency, already-joined exclusion, a **round-trip**
  guarantee) and the panel (row rendering + Add wiring).
- Docs: notes file + `project-structure.html`.

## Non-Goals

- **No continuous / global scanning.** Only the selected board is considered. A board that is
  hidden, or the selection being empty/non-board, yields no suggestions.
- **No in-viewport chip / overlay.** Sidebar list only. (The in-viewport affordance can come later.)
- **No auto-apply, no settings/preferences, no "apply all".** Every joint is one explicit click.
- **No new ranking model.** A fixed neighbour-distance-then-kind ordering, capped to a small count.
- **No board↔dowel (cylinder) joints.** All five joint gates are board↔board; cylinders are ignored.
- **No new joint parameters exposed at suggest time.** Applying uses each creator's existing
  defaults (the same values the two-click gesture would produce). The user tunes afterwards in the
  existing `JointsPanel`.
- **No contact-face inference.** Face/role assignment is chosen by bounded enumeration against the
  existing validity gates (see Algorithm); a smarter geometric picker is explicitly deferred.

## Why no data-model / file-format change

A `JointSuggestion` is a transient, recomputed-on-render value describing *how to call a creator*.
It is derived state, not scene state — nothing about it is persisted. `FILE_FORMAT_VERSION` is
unchanged, `types.ts` `Joint`/`Scene` are unchanged, and `reconcileJoints`/`deriveJoint` are
untouched. Applying a suggestion goes through the same `onAdd*` path as a manual gesture, so the
resulting `Joint` is indistinguishable from a hand-made one.

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
    | { kind: 'finger'; partAId: PartId; endA: Face; partBId: PartId; endB: Face }
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
union tags so the apply dispatcher and the panel's label map can `switch` exhaustively.

## Core Algorithm — `suggestJointsFor(selectedId, parts, joints)`

**Preconditions.** Return `[]` immediately if `selectedId == null`, if the selected part is absent,
or if it is not a **visible board** (`p.kind === 'board' && p.visible`).

Let `S` be the selected board. For each other part `T` in `parts`:

1. **Skip** unless `T.kind === 'board' && T.visible` and `T.id !== S.id`.
2. **Adjacency gate.** Skip unless `areAdjacent(S, T, TOUCH_TOL)` (below). This is essential:
   several validity gates (dado, M&T, finger, T&G) check only *orientation*, so without a proximity
   gate they pass for correctly-oriented but distant boards.
3. **Already-joined gate.** Skip the pair entirely if an existing joint already links both:
   `joints.some(j => jointInvolves(j, S.id) && jointInvolves(j, T.id))`. (One pair may still carry
   at most one existing joint in the app, but this is the honest test and is future-proof.)
4. **Per-type applicability** (below). Each type that passes yields **one** `JointSuggestion` for
   this pair (so a single neighbour can produce several rows — e.g. both a dado and an M&T for a
   perpendicular tee, which is correct woodworking).

### Adjacency — `areAdjacent(a, b, tol)`

Reuse `worldAabb(board): { min, max }` from `../geom/halflap` (already exported, parity-tested).
Two boards are adjacent when their world AABBs **intersect after expanding by `tol` on every axis**:

```ts
const A = worldAabb(a)
const B = worldAabb(b)
return (['x', 'y', 'z'] as const).every(
  (ax) => A.min[ax] - tol <= B.max[ax] && B.min[ax] - tol <= A.max[ax],
)
```

`TOUCH_TOL` = **1 mm** (module const, documented tunable). This covers every joint geometry: dado /
M&T tees **overlap** (the housed/tenon end penetrates), while finger corners and T&G glue-ups
**touch** within tolerance. Distant-but-parallel boards fail it.

### Per-type applicability

Faces enumerated in a fixed order: `const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']`.
All gates operate in **world space** (via `composeWorldMatrix`), so board rotations are already
accounted for — no extra transform work. For each type, take the **first** gate-passing assignment
in deterministic enumeration order and stop (≤ one suggestion per pair per kind).

- **half-lap** — symmetric, no faces:
  `isValidHalfLap(S, T)` → `{ kind:'halflap', partAId: S.id, partBId: T.id, neighborId: T.id }`.

- **dado** — enumerate `housing ∈ [S, T]` (in that order), `housed` = the other; over
  `(hf, he) ∈ FACES × FACES` require **both**:
  - `faceAxes(he).depth !== 'z'` — the housed end must be a genuine *end*, not a broad thickness
    face. **This guard is the fix for `isValidDadoSeat`'s weakness:** the raw gate only tests that
    the two chosen face normals are anti-parallel, which two flat-stacked (laminated) boards also
    satisfy via their ±Z faces. Excluding `depth === 'z'` ends rules that false positive out and
    matches the guard `isValidMortiseTenon` already applies to its tenon end.
  - `isValidDadoSeat(housing, hf, housed, he)`.
  → `{ kind:'dado', housingPartId, housingFace: hf, housedPartId, housedEnd: he, neighborId: T.id }`.

- **mortise-tenon** — enumerate `mortise ∈ [S, T]`, `tenon` = the other; over `(mf, te)`:
  `isValidMortiseTenon(mortise, mf, tenon, te)` (self-guards: axis-aligned + perpendicular seat +
  `tenonEnd` not a thickness face) →
  `{ kind:'mortise-tenon', mortisePartId, mortiseFace: mf, tenonPartId, tenonEnd: te, neighborId }`.

- **finger** — `a = S, b = T` (S is the lead board that stays put); over `(ea, eb)`:
  `isValidFingerJoint(S, ea, T, eb)` →
  `{ kind:'finger', partAId: S.id, endA: ea, partBId: T.id, endB: eb, neighborId: T.id }`.

- **tongue-groove** — enumerate `groove ∈ [S, T]`, `tongue` = the other; over `(ge, tf)`:
  `isValidTongueGroove(groove, ge, tongue, tf)` →
  `{ kind:'tongue-groove', groovePartId, grooveEdge: ge, tonguePartId, tongueEdge: tf, neighborId }`.

Both role directions are enumerated where a joint has asymmetric roles (dado, M&T, T&G); the first
passing `(role, faces)` wins, giving one deterministic suggestion per kind per pair.

### Ordering & cap

Collect all suggestions, then sort by **(neighbour distance ascending, then a fixed `KIND_PRIORITY`)**
so the nearest neighbour's options group together. Neighbour distance = world-AABB-centre distance
`S↔T`. `KIND_PRIORITY = ['halflap', 'dado', 'mortise-tenon', 'tongue-groove', 'finger']` (heuristic,
documented adjustable). Cap the result at `MAX_SUGGESTIONS = 8`.

### Complexity

Per selection: `(N−1)` neighbours × 5 types × ≤ 36 face pairs × O(1) gate — trivial for realistic
`N`. Recomputed via `useMemo` keyed on `selectedId`, `scene.parts`, `scene.joints`.

## Apply Path

The five `onAdd*` creators (in `useScene`) read only `partId` and `localFaceNormal` from a `FaceHit`
(verified: each does `localNormalToFaceString(hit.localFaceNormal)` + a part lookup). So a suggestion
is replayed by synthesising minimal hits — identical in shape to the `hit()` helper the `useScene`
tests already use:

```ts
const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
// Private FACE_NORMALS: Record<Face, Vec3>, matching the per-file convention already used in
// geom/{dado,mortisetenon,tonguegroove,fingerjoint}.ts (each keeps its own local copy).
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
      case 'finger':
        return onAddFingerJoint(synthHit(s.partAId, s.endA), synthHit(s.partBId, s.endB))
      case 'tongue-groove':
        return onAddTongueGroove(synthHit(s.groovePartId, s.grooveEdge), synthHit(s.tonguePartId, s.tongueEdge))
    }
  },
  [onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddFingerJoint, onAddTongueGroove],
)
```

Because it goes through `onAdd*`, apply participates in undo/redo and cut derivation for free. The
creators **re-validate** internally, so even a stale suggestion (parts moved between render and
click) fails safely with no joint created rather than producing a broken one.

## UI — `src/ui/SuggestionsPanel.tsx`

Mirrors `JointsPanel`'s structure/styling. Rendered inside `EditPanel` **immediately above** the
existing `<JointsPanel>` (suggestions to *add*, then joints that *exist*).

```tsx
const KIND_LABEL: Record<JointSuggestion['kind'], string> = {
  halflap: 'Half-lap',
  dado: 'Dado',
  'mortise-tenon': 'Mortise & tenon',
  finger: 'Finger joint',
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
extra filtering. Keys use array index (order is stable per render; rows are ephemeral and carry no
input state).

## Wiring

- **`App.tsx`:**
  - `const suggestions = useMemo(() => suggestJointsFor(selectedId, scene.parts, scene.joints), [selectedId, scene.parts, scene.joints])`.
  - Add the `applySuggestion` dispatcher above.
  - Pass `suggestions={suggestions}` and `onApplySuggestion={applySuggestion}` to `<Sidebar>`.
- **`sidebar.tsx`:** add `suggestions` + `onApplySuggestion` to `Sidebar`'s props and to
  `EditPanel`'s props; render `<SuggestionsPanel suggestions={suggestions} scene={scene} onApply={onApplySuggestion} />`
  just above `<JointsPanel …>` in `EditPanel`.

No viewport, worker, or geom-kernel change.

## Edge Cases

- **Selection empty / non-board / hidden** → `[]` (panel hidden).
- **Hidden neighbour** → skipped.
- **Cylinder parts** → skipped (all gates require boards).
- **Pair already joined** → no suggestion for that pair.
- **Multiple types applicable to one neighbour** → multiple rows (intended).
- **Stale-at-click** (parts moved after render, before Add) → creator re-validates and no-ops; no
  broken joint. (Acceptable; the panel recomputes on the next render anyway.)
- **Flat laminated boards (±Z faces touching)** → *not* suggested as a dado, thanks to the
  `faceAxes(he).depth !== 'z'` end-guard.

## Testing

**`src/scene/suggestJoints.test.ts`** (pure, no OCCT, no React):

- `areAdjacent`: overlapping → true; touching within `TOUCH_TOL` → true; clearly separated → false.
- `suggestJointsFor` fixtures (construct `BoardPart`s directly with positions/rotations):
  - Two crossing coplanar equal-thickness boards → a `halflap` suggestion.
  - A board standing perpendicular into another's broad face → **both** `dado` and `mortise-tenon`.
  - Two equal-width boards meeting at a right-angle corner → a `finger` suggestion.
  - Two coplanar equal-thickness boards abutting along a long edge → a `tongue-groove` suggestion.
  - Correctly-oriented but **distant** boards → `[]` (adjacency gate).
  - A pair with a pre-existing joint between them → no suggestion for that pair.
  - `selectedId` null / a cylinder / a hidden board → `[]`.
  - **Round-trip (key correctness test):** for every suggestion returned across the fixtures, feed
    its carried faces back through the matching `isValid*` gate and assert `true` — proving apply can
    never dead-end on a suggestion the engine surfaced.
- `synthHit`: `localFaceNormal` equals `FACE_NORMALS[face]`, and
  `localNormalToFaceString(synthHit(id, face).localFaceNormal) === face` for all six faces.

**`src/ui/SuggestionsPanel.test.tsx`** (happy-dom + testing-library):

- Given N suggestions, renders N rows with `<KIND_LABEL> with <neighbour label>` and an Add button.
- Clicking Add calls `onApply` with that exact suggestion.
- Empty suggestions → renders nothing.

The apply dispatch itself needs no new integration test: `synthHit`'s round-trip plus the existing
`useScene` `onAdd*` tests already cover creator behaviour end-to-end.

## Docs

- `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` — the living notes file (record
  the dado end-guard rationale, `TOUCH_TOL` choice, ranking heuristic, deferred contact-face
  inference).
- `project-structure.html` — add `src/scene/suggestJoints.ts` and `src/ui/SuggestionsPanel.tsx` and
  a line on the selection→suggestions→apply data flow.
- **No** `keyboard-shortcuts.md` change — the feature adds no shortcut/mode (it's a panel, not a
  seventh exclusive viewport gesture).

## Files Touched

| File | Change |
| --- | --- |
| `src/scene/suggestJoints.ts` | **new** — engine + `areAdjacent` + `synthHit` + `JointSuggestion` |
| `src/scene/suggestJoints.test.ts` | **new** — engine + round-trip + `synthHit` tests |
| `src/ui/SuggestionsPanel.tsx` | **new** — the panel |
| `src/ui/SuggestionsPanel.test.tsx` | **new** — panel render + Add wiring |
| `src/App.tsx` | `suggestions` memo + `applySuggestion` dispatcher + props to `Sidebar` |
| `src/ui/sidebar.tsx` | thread `suggestions`/`onApplySuggestion` → `EditPanel` → `SuggestionsPanel` |
| `project-structure.html` | new files + data-flow note |
| `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` | **new** — notes |

Untouched: `types.ts`, `useFile.ts` (no format bump), `useScene.ts` (creators reused as-is),
`useInteractionMode.ts`, all `geom/*`, worker, mesh, drawing, export.

## Risks & Open Questions

- **Face-selection heuristic.** "First gate-passing assignment" can, on ambiguous geometry, pick a
  valid-but-not-ideal face. Mitigations: the adjacency gate narrows candidates, the dado end-guard
  removes the known false positive, and the round-trip test guarantees every surfaced suggestion is
  creatable. A geometric contact-face picker is deferred (Non-Goal).
- **`TOUCH_TOL` = 1 mm** is a judgement call; too large invites noise, too small misses
  near-but-not-snapped placements. Tunable const; revisit if suggestions feel noisy/sparse.
- **`KIND_PRIORITY` ordering** is a heuristic, not derived from joint strength; adjustable.
- **`FACE_NORMALS` duplication.** A fifth private copy is added, consistent with the existing
  per-file convention in `geom/*`. Consolidating into one shared export is a separate refactor and
  out of scope here (flagged, not done).
</content>
</invoke>
