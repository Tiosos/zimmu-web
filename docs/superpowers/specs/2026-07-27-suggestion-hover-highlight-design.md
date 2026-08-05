# Suggestion Hover Highlight — Design Spec

**Date:** 2026-07-27
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Hovering a row in the sidebar's **Suggested joints** list highlights that suggestion's neighbouring
board in the 3D viewport, so a row like "Dado with Rail 2" becomes self-explanatory without hunting
for which board *Rail 2* is.

This matters more since finger joints landed: a single box corner can now list three suggestions
(Dado, Mortise & tenon, Finger joint), and the parts list alone gives no clue which physical board
each row refers to.

Small, additive, UI-only. No geometry, kernel, worker, file-format, or data-model change.

## Goals

- `hoveredNeighborId: PartId | null` state in `App.tsx`.
- `onHoverSuggestion(id: PartId | null)` prop on `SuggestionsPanel`, wired to each row's
  `onMouseEnter` / `onMouseLeave`, threaded through the existing
  App → Sidebar → EditPanel → SuggestionsPanel path.
- A new `highlightedId?: PartId | null` prop on `Viewport` that colours that part's edge lines.
- A panel test covering hover-enter and hover-leave.

## Non-Goals

- **No face-level highlighting.** Outlining the specific faces a joint would use was considered and
  deliberately deferred (see Alternatives). This slice highlights the neighbour *board* only.
- **No highlight for the selected board** — it already has its selection highlight.
- **No new interaction mode, keyboard shortcut, or viewport gesture.**
- **No change to the emissive channel** — see the Flash Collision section; this is a correctness
  decision, not an oversight.
- **No change to suggestion generation.** `suggestJointsFor`, `cornerPair`, `contactPair`, and the
  `JointSuggestion` type are untouched.
- **No viewport unit test.** No test file exists for `viewport.tsx`, matching the repo convention of
  testing the geom seam rather than Three.js internals.

## Architecture

### State

A single `PartId | null` in `App.tsx`. The panel only needs to communicate *which board to light up*,
so the state is the neighbour's id — not the hovered suggestion object. This keeps `Viewport`'s new
prop a plain id and avoids leaking the `JointSuggestion` type into the render layer.

```ts
const [hoveredNeighborId, setHoveredNeighborId] = useState<PartId | null>(null)
```

### Panel

Each suggestion row gains hover handlers; the rest of the row is unchanged.

```tsx
<div
  key={i}
  className="flex items-center gap-1 py-0.5 border-t border-border/30"
  onMouseEnter={() => onHoverSuggestion(s.neighborId)}
  onMouseLeave={() => onHoverSuggestion(null)}
>
```

`SuggestionsPanel`'s props gain `onHoverSuggestion: (id: PartId | null) => void`.

### Threading

`suggestions` and `onApplySuggestion` already travel App → Sidebar → EditPanel → SuggestionsPanel.
`onHoverSuggestion` follows the identical path: `SidebarProps`, the `Sidebar` destructure,
`EditPanel`'s inline prop type and destructure, and the `<EditPanel>` render site.

### Viewport

A new optional prop, defaulting to nothing:

```ts
highlightedId?: PartId | null
```

The mesh-management effect already colours every part's edge line. Today
(`src/render/viewport.tsx:479-483`):

```ts
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : 0x1a1a1d,
      )
    }
```

becomes three-state, with `highlightedId` added to the effect's dependency array (currently
`[parts, geometries, selectedId]` at line 490):

```ts
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : id === highlightedId ? 0xfbbf24 : 0x1a1a1d,
      )
    }
```

Selection takes precedence over highlight in the ternary. That ordering is defensive only — a
suggestion's neighbour is never the selected board, because `suggestJointsFor` skips
`t.id === s.id` — so the branch is unreachable in practice and needs no separate handling.

Amber `0xfbbf24` is already in the viewport's palette (the snap source-face highlight) and is clearly
distinct from selection cyan `0x4fc3f7`.

## Flash Collision — why the emissive channel is left alone

Selection highlights via **both** edge colour and mesh emissive, so mirroring it for hover is the
obvious instinct. It is wrong here.

The flash animation (used for rotation snap) stores per-part timestamps in `flashMap` and, on
completion, resets that mesh's emissive to a hardcoded two-state value
(`src/render/viewport.tsx:271-277`):

```ts
            ;(m.material as THREE.MeshStandardMaterial).emissive.setHex(
              id === selectedIdRef.current ? 0x222244 : 0x000000,
            )
```

This runs inside the animation loop and knows nothing about a highlight. An emissive-based hover
highlight on a part that then finished a flash would be silently wiped — and would *stay* wiped,
because the mesh effect that would restore it only re-runs when `parts`, `geometries`, `selectedId`
(or, after this change, `highlightedId`) change. Merely keeping the mouse still would leave the board
un-highlighted with no way to recover.

Two fixes were possible: make the flash reset highlight-aware (a third state plus a new ref read
inside the render loop), or keep the highlight on a channel the flash never touches. **This spec
chooses the latter** — edge colour only. It sidesteps the collision entirely, touches no
already-working animation code, and the edge-colour treatment is what makes selection legible today,
so it is visually sufficient on its own.

## Stale Highlight on Apply

Clicking **Add** applies the joint, which changes `scene.joints`; the pair is then already-joined, so
`suggestJointsFor` stops emitting it and the row unmounts. `onMouseLeave` does **not** fire on an
unmounted element, so `hoveredNeighborId` would keep pointing at that board and leave it lit
indefinitely.

`applySuggestion` therefore clears the hover as part of applying:

```ts
setHoveredNeighborId(null)
```

Placed at the top of the callback, before the `switch`, so it clears regardless of which kind is
dispatched (each arm `return`s).

## Edge Cases

- **Mouse leaves a row normally** → `onHoverSuggestion(null)` → highlight clears.
- **Hovered board is hidden** (`visible: false`) → it has no edge line in the scene, so nothing
  lights up; harmless. Hidden boards are already excluded from suggestions anyway.
- **Suggestions recompute while hovering** (e.g. the user drags a part in another window pane) → a
  stale id could briefly highlight a board that is no longer a neighbour. It clears on the next
  mouse-leave or apply. Judged not worth a guard: transient, self-correcting, and only reachable by
  moving parts without moving the mouse.
- **Neighbour deleted while hovered** → the edge line is removed from the scene with the part; the id
  simply matches nothing.
- **Selected board equals highlighted board** → impossible (see Viewport); selection wins in the
  ternary regardless.

## Testing

**`src/ui/SuggestionsPanel.test.tsx`** (extend):

- Hovering a row calls `onHoverSuggestion` with that row's `neighborId`.
- Leaving a row calls `onHoverSuggestion` with `null`.

The row `<div>` carries no role or test id, and React's `onMouseEnter`/`onMouseLeave` do not bubble,
so the events must be fired on the row itself rather than on its label. Reach it from the label text:

```ts
const row = screen.getByText('Dado with Rail 2').closest('div')!
fireEvent.mouseEnter(row)
expect(onHoverSuggestion).toHaveBeenCalledWith('B')
fireEvent.mouseLeave(row)
expect(onHoverSuggestion).toHaveBeenCalledWith(null)
```

The label `<span>`'s parent is the row `<div>`, so `.closest('div')` resolves to it without adding
test-only markup to the component. The existing fixtures are reusable as-is; note both suggestions in
them share `neighborId: 'B'`, which is fine here since the assertion is on the id passed, not on
telling the rows apart.

**No viewport test.** `src/render/viewport.tsx` has no test file; the repo tests the geom seam rather
than Three.js internals. The viewport change is covered by `pnpm build` (type-level) and manual
verification.

**No new engine test** — `suggestJointsFor` is untouched.

## Alternatives Considered

- **Face-level highlight** — outline the two faces the joint would use, reusing the existing
  `updateHighlight` LineLoop machinery (`computeFaceCorners` reads only `localFaceNormal`, which
  `synthHit` sets, so suggestion faces feed it directly). Rejected for this slice: it distinguishes
  the three suggestions on a shared corner, but half-lap carries no faces and would need a fallback,
  and the two existing LineLoops are owned by the snap/gesture modes so coexistence needs care. The
  groundwork is genuinely there if this is wanted later.
- **Both board tint and face outlines** — the most informative and the largest surface area;
  deferred for the same reasons.
- **Emissive-based highlight** — rejected; see Flash Collision.

## Files Touched

| File | Change |
| --- | --- |
| `src/App.tsx` | `hoveredNeighborId` state; clear it in `applySuggestion`; pass `onHoverSuggestion` to `Sidebar` and `highlightedId` to `Viewport` |
| `src/ui/sidebar.tsx` | thread `onHoverSuggestion` → `EditPanel` → `SuggestionsPanel` |
| `src/ui/SuggestionsPanel.tsx` | `onHoverSuggestion` prop + row `onMouseEnter`/`onMouseLeave` |
| `src/ui/SuggestionsPanel.test.tsx` | hover-enter and hover-leave tests |
| `src/render/viewport.tsx` | `highlightedId` prop; three-state edge colour; effect dependency |
| `src/ui/sidebar.test.tsx` | add `onHoverSuggestion` to the existing props helper (required — `SidebarProps` gains a field) |
| `project-structure.html` | note the hover-highlight flow |
| `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` | appended entry |

Untouched: all of `src/geom/`, `useScene.ts`, `suggestJoints.ts`, `types.ts`, worker, mesh, export.

## Risks

- **`viewport.tsx` is the largest file being touched** and holds imperative Three.js code with a
  render loop. The change is confined to one ternary and one dependency array; nothing in the
  animation loop is modified. The flash-collision analysis above is the reason that confinement is
  safe rather than accidental.
- **`highlightedId` is optional** (`?:`), matching the existing `flashTarget?` convention, so
  forgetting to pass it degrades to today's behaviour rather than breaking the build. That also means
  a missing wire-up is **not** compile-enforced — it must be verified by inspection, the same class of
  risk as the `applySuggestion` dispatcher arm.
- **No automated coverage of the viewport behaviour**, by repo convention. The visible outcome
  (hovering a row lights the right board amber) needs a manual check.
