# Suggestion Face Highlight — Design Spec

**Date:** 2026-07-27
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Hovering a row in the sidebar's **Suggested joints** list currently tints the neighbouring board's
edges amber. This adds a second layer: outlining the **two faces the joint would actually use**.

The tint answers *which board*; the outlines answer *which joint*. That second question is real —
a single box corner can list Dado, Mortise & tenon and Finger joint against the same neighbour, and
today all three rows produce an identical highlight. Each uses different faces, so outlining them
finally makes the rows distinguishable.

UI-only. No geometry-kernel, worker, file-format, or `Joint` data-model change. Joint generation
(`suggestJointsFor`, `contactPair`, `cornerPair`) is untouched.

## The latent bug this must fix

`updateHighlight` in `src/render/viewport.tsx` builds an outline from `computeFaceCorners(face, part)`
— which reads `face.localFaceNormal` — and then pushes it 1mm clear of the surface along
**`face.faceNormal`**:

```ts
      const corners = computeFaceCorners(face, part)
      const OFFSET = 1.0
      corners.forEach((c, i) => {
        pos[i * 3] = c.x + face.faceNormal.x * OFFSET
        …
```

So it needs `localFaceNormal` in **local** space and `faceNormal` in **world** space. Real hits from
the raycaster satisfy this. But `synthHit` sets *both* to the same **local** vector:

```ts
export function synthHit(partId: PartId, face: Face): FaceHit {
  const n = FACE_NORMALS[face]
  return { partId, faceNormal: n, faceCenter: ZERO, localFaceNormal: n, localHitPoint: ZERO, hitPoint: ZERO }
}
```

This has been harmless because the apply path only ever reads `localFaceNormal`. For rendering it is
not: on a **rotated** board the outline would be offset 1mm in the wrong direction, sinking it into
the solid and z-fighting instead of floating clear.

`synthHit` is therefore **not** reusable here, and must not be changed — its zeroed/local shape is
exactly what the `onAdd*` creators expect, and it is covered by the existing round-trip test. This
spec adds a separate display-oriented helper instead.

## Goals

- `faceHitForDisplay(part: BoardPart, face: Face): FaceHit` — a `FaceHit` with `localFaceNormal` local
  and `faceNormal` in world space, suitable for `updateHighlight`.
- `suggestionFaceRefs(s: JointSuggestion): Array<{ partId: PartId; face: Face }>` — the faces a
  suggestion would cut; `[]` for half-lap, exactly two for every other kind.
- Hover state becomes the suggestion rather than its neighbour id.
- A new `suggestionFaces?: FaceHit[] | null` prop on `Viewport`, drawn with two new dedicated amber
  LineLoops.
- Tests for both pure helpers (including a **rotated** board) and the updated panel behaviour.

## Non-Goals

- **No change to `synthHit`** or to the apply path. See above.
- **No change to `updateHighlight`** — it is already generic and correct given a well-formed `FaceHit`;
  the fix belongs in what we hand it, not in it.
- **No reuse of the `sourceFace`/`hoveredFace` props or their LineLoops** — see Coexistence.
- **No removal of the board tint.** Tint and outlines are complementary; half-lap keeps the tint.
- **No change to suggestion generation, ordering, or the `JointSuggestion` variants.**
- **No viewport unit test** — `src/render/viewport.tsx` has no test file, matching the repo convention
  of testing the geom seam rather than Three.js internals.

## Data Flow

```
SuggestionsPanel row hover
  → onHoverSuggestion(s | null)
  → App: hoveredSuggestion: JointSuggestion | null
      ├─ highlightedId   = hoveredSuggestion?.neighborId ?? null      (existing board tint)
      └─ suggestionFaces = suggestionFaceRefs(hoveredSuggestion)
                             .map(r → faceHitForDisplay(part, r.face))  (new outlines)
  → Viewport
```

## Components

### `suggestionFaceRefs` (new, `src/scene/suggestJoints.ts`)

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
      const _exhaustive: never = s
      throw new Error(`unhandled suggestion kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
```

The `never` guard is deliberate: a sixth joint kind must be a compile error here rather than a row
that silently highlights nothing. (This mirrors the guard added to the round-trip test after review
found that converting a bare `else` had removed exhaustiveness.)

### `faceHitForDisplay` (new, `src/scene/suggestJoints.ts`)

```ts
export function faceHitForDisplay(part: BoardPart, face: Face): FaceHit {
  const local = FACE_NORMALS[face]
  return {
    partId: part.id,
    faceNormal: worldFaceNormal(part, face), // world — drives updateHighlight's 1mm offset
    faceCenter: ZERO,
    localFaceNormal: local, // local — drives computeFaceCorners
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}
```

`worldFaceNormal`, `FACE_NORMALS` and `ZERO` already exist privately in this file. `faceCenter`,
`localHitPoint` and `hitPoint` stay zeroed because `updateHighlight` reads none of them — verified
against its implementation.

**Placement rationale:** this lives beside `synthHit` in `suggestJoints.ts` because it is the display
counterpart to it and reuses that file's private normal machinery. `snapMath.ts` was considered
(it owns `computeFaceCorners` and `computeLocalFaceCenter`) but would require exporting
`worldFaceNormal` across modules for no gain.

### `SuggestionsPanel`

`onHoverSuggestion` changes signature from `(id: PartId | null) => void` to
`(s: JointSuggestion | null) => void`. The row handler becomes `onMouseEnter={() => onHoverSuggestion(s)}`;
leave still passes `null`. `sidebar.tsx` threading changes type only — the four declaration sites and
two render sites keep their existing shape.

### `App`

`const [hoveredSuggestion, setHoveredSuggestion] = useState<JointSuggestion | null>(null)` replaces
`hoveredNeighborId`. `applySuggestion` still clears it (`setHoveredSuggestion(null)`) for the same
reason as before: applying unmounts the row, and `onMouseLeave` never fires on an unmounted element.

The faces are derived in a `useMemo` keyed on `[hoveredSuggestion, scene.parts]`, mapping each ref to
a display hit and dropping refs whose part is missing or not a board:

```ts
const suggestionFaces = useMemo(() => {
  if (!hoveredSuggestion) return null
  return suggestionFaceRefs(hoveredSuggestion).flatMap((r) => {
    const p = scene.parts.find((x) => x.id === r.partId)
    return p && p.kind === 'board' ? [faceHitForDisplay(p, r.face)] : []
  })
}, [hoveredSuggestion, scene.parts])
```

`scene.parts` is in the deps so the outlines follow a board that moves while hovered.

### `Viewport`

New optional prop, mirroring the `flashTarget?` / `highlightedId?` convention:

```ts
  suggestionFaces?: FaceHit[] | null
```

Two new LineLoops are created, configured, added and disposed exactly alongside the existing
`sourceLoop`/`hoverLoop` (same `snapMat`/`emptyGeo` helpers, `renderOrder = 1`, `visible = false`),
held in `suggestionHighlightRefs: useRef<(THREE.LineLoop | null)[]>([null, null])`, and driven by
extending the existing highlight effect:

```ts
    updateHighlight(sourceHighlightRef.current, sourceFace, 0xfbbf24)
    updateHighlight(hoverHighlightRef.current, hoveredFace, 0x60a5fa)
    const sf = suggestionFaces ?? []
    updateHighlight(suggestionHighlightRefs.current[0], sf[0] ?? null, 0xfbbf24)
    updateHighlight(suggestionHighlightRefs.current[1], sf[1] ?? null, 0xfbbf24)
```

with `suggestionFaces` added to that effect's dependency array (currently
`[sourceFace, hoveredFace, snapPhase, parts]`).

Exactly two loops is sufficient and not arbitrary: `suggestionFaceRefs` returns 0 or 2 entries by
construction, enforced by its `never` guard. `updateHighlight` already hides a loop when passed
`null`, so half-lap (`[]`) and no-hover (`null`) both clear correctly with no extra branching.

## Coexistence — why not reuse the existing LineLoops

`sourceFace` and `hoveredFace` are owned by the snap and add-joint gesture state machines. The
sidebar remains visible and interactive while a gesture mode is active, so a user can hover a
suggestion row mid-gesture and both would want the same two loops — the suggestion outline would
fight the gesture's own source/hover highlight.

Dedicated loops and a dedicated prop avoid that entirely, cost two more objects in a scene that
already holds one mesh and one line-segments object per part, and match the precedent set by
`highlightedId` (a dedicated prop rather than overloading an existing one).

## Colour

Amber `0xfbbf24`, matching the board tint shipped for hover, so tint and outlines read as one
highlight. This is the same hex the gesture *source* highlight uses, which is acceptable: that one is
only visible during an active snap gesture, and it is a different object in a different context.
Selection cyan `0x4fc3f7` and gesture-hover blue `0x60a5fa` remain distinct.

## Edge Cases

- **Half-lap hovered** → `suggestionFaceRefs` returns `[]` → both loops hidden; the board tint still
  shows. Deliberate graceful degradation.
- **No hover** → prop is `null` → both loops hidden.
- **Rotated board** → handled by `faceHitForDisplay`'s world normal; this is the bug above and is
  covered by a dedicated test.
- **Neighbour part deleted while hovered** → the `flatMap` drops refs whose part is missing or
  non-board, and `updateHighlight` independently hides the loop when it cannot find the part. Two
  layers, both fail closed.
- **Hidden board** → not a real case: `suggestJointsFor` already skips boards with `visible: false`,
  so no suggestion can reference one. Neither the memo nor `updateHighlight` checks `visible`, which
  matches the existing gesture highlights; no handling is added for a state that cannot occur.
- **Suggestion applied** → `applySuggestion` clears the hover, so tint and outlines both clear.

## Testing

**`src/scene/suggestJoints.test.ts`** (extend; pure, no OCCT, no React):

- `suggestionFaceRefs` for each of the five kinds — `[]` for half-lap, and the exact two
  `(partId, face)` pairs for dado, mortise-tenon, tongue-groove and finger.
- `faceHitForDisplay` on an **unrotated** board — `faceNormal` equals `localFaceNormal`.
- `faceHitForDisplay` on a **rotated** board (e.g. `Ry = -90`, where local `+X` maps to world `+Z`) —
  `faceNormal` is the world normal and therefore *differs* from `localFaceNormal`. This is the test
  that actually pins the bug; the unrotated case cannot distinguish correct from broken.

**`src/ui/SuggestionsPanel.test.tsx`** (update): the existing hover tests assert
`toHaveBeenLastCalledWith('B')` / `('C')`; they become `toHaveBeenLastCalledWith(twoNeighbors[0])` and
`(twoNeighbors[1])` respectively. The distinct-neighbour fixture added previously still does its job —
asserting on distinct suggestion objects keeps proving each row reports its own.

**No viewport test** — repo convention. Covered by `pnpm build` plus manual verification.

## Files Touched

| File | Change |
| --- | --- |
| `src/scene/suggestJoints.ts` | `suggestionFaceRefs` + `faceHitForDisplay` |
| `src/scene/suggestJoints.test.ts` | tests for both helpers, including the rotated-board case |
| `src/ui/SuggestionsPanel.tsx` | `onHoverSuggestion` signature → `JointSuggestion \| null`; row passes `s` |
| `src/ui/SuggestionsPanel.test.tsx` | hover assertions updated to suggestion objects |
| `src/ui/sidebar.tsx` | `onHoverSuggestion` type updated at its four declaration sites |
| `src/App.tsx` | `hoveredSuggestion` state; `suggestionFaces` memo; pass to `Viewport` |
| `src/render/viewport.tsx` | `suggestionFaces` prop; two dedicated LineLoops; effect + dependency |
| `src/ui/sidebar.test.tsx` | no change needed — `onHoverSuggestion: vi.fn()` still satisfies the new type |
| `project-structure.html`, `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` | docs |

Untouched: all of `src/geom/`, `useScene.ts`, `types.ts`, `synthHit`, `updateHighlight`, worker, mesh,
export, and all joint-generation logic.

## Risks

- **`suggestionFaces` is an optional prop**, so a missing wire-up degrades silently rather than
  failing the build — the same non-compile-enforced class as `highlightedId`. Must be verified by
  inspection.
- **Churn on just-shipped code.** The hover state and `onHoverSuggestion` signature both change one
  slice after landing. Accepted: the feature needs the suggestion, and threading a second parallel
  callback purely to avoid touching new code would be worse.
- **Two more scene objects.** Negligible next to per-part meshes and edge lines, and both stay
  `visible = false` until hovered.
- **No automated coverage of the visual result**, by repo convention — the outlines appearing in the
  right place, and clear of the surface on rotated boards, needs a manual check.
