# Half-Lap Joint (JP4) — Design Spec

**Date:** 2026-07-21
**Status:** Approved design, ready for implementation planning
**Topic:** Add a **half-lap joint** — the first joint *type* beyond the dado family. Two equal-thickness
boards overlap coplanar; each loses the complementary half of its thickness over the shared footprint
so they nest flush. This is the slice where the joint framework goes **polymorphic** (`deriveJoint`
dispatches on `joint.kind`).

**Depends on:** JP1/JP2/JP3, which built the first-class `Joint`, `deriveJoint` (returns
`{ cuts, seat }`), the joint-agnostic `reconcileJoints` distributor, `src/geom/dado.ts`, the
`useAddJoint` gesture, and the sidebar `JointsPanel`.

---

## 1. Purpose & context

Every joint so far has been a dado (plain / rabbeted / stopped) — a housing board grooved to seat a
housed board. The half-lap is fundamentally different: **symmetric**. Two boards lap over each other
(cross-lap, tee-lap, corner/end-lap) and each is notched to half thickness at the overlap, so the
assembly finishes flush and one board's thickness. There is no housing/housed asymmetry and **no
repositioning** — the boards already lie coplanar; the joint only removes material.

Building it forces the framework to become polymorphic: `deriveJoint` must dispatch on `joint.kind`,
and `DeriveResult.seat` must become optional (a half-lap seats nothing). That polymorphism is the
point of this slice — it is what "a framework built to grow into other joint types" was pointing at.

### Decisions locked during brainstorming

1. **New joint *type*** (not a dado variant). `Joint = DadoJoint | HalfLapJoint`.
2. **Auto-derive the overlap from placement** — the lap region is the geometric intersection of the
   two boards' footprints at their current world positions (mirrors the dado deriving groove width
   from the housed board). No manual region fields.
3. **Parametric `split`** (default `0.5` = true half-lap) — fraction of thickness board A keeps; plus
   `clearance` (default `0`) for fit.
4. **Two-click gesture** — click a broad face on board A, then a broad face on board B.
5. **Equal-thickness, coplanar, axis-aligned only** for v1 (see §3).

---

## 2. Framework: polymorphism (the core of this slice)

Two framework changes, both minimal:

### 2.1 `deriveJoint` dispatches on kind (`src/geom/dado.ts`)

Today `deriveJoint` *is* the dado derivation. Refactor: rename the current body to
`deriveDadoJoint(joint: DadoJoint, parts)` (unchanged logic), and make `deriveJoint` a dispatcher:

```ts
export function deriveJoint(joint: Joint, parts: Part[]): DeriveResult | null {
  switch (joint.kind) {
    case 'dado':
      return deriveDadoJoint(joint, parts)
    case 'halflap':
      return deriveHalfLap(joint, parts)
  }
}
```

`deriveJoint` stays exported from `dado.ts`, so `reconcileJoints`'s import is unchanged. `dado.ts`
imports `deriveHalfLap` from `./halflap` (one-directional: `dado.ts → halflap.ts`; `halflap.ts` must
**not** import runtime values from `dado.ts`, only the `DeriveResult`/`DerivedCut` **types** via
`import type`, to avoid a cycle).

### 2.2 `DeriveResult.seat` becomes optional (`src/geom/dado.ts` + `src/scene/reconcileJoints.ts`)

A half-lap does not reposition either board, so it returns no seat. Change the type:

```ts
export type DeriveResult = { cuts: DerivedCut[]; seat?: { partId: PartId; position: Vec3 } }
```

and guard the one place in `reconcileJoints` that applies it (currently lines 42-44):

```ts
    const seat = result.seat
    if (seat) {
      parts = parts.map((p) => (p.id === seat.partId ? { ...p, position: seat.position } : p))
    }
```

`deriveDadoJoint` still returns a seat (required for it); `deriveHalfLap` omits it. This is the **only**
change to `reconcileJoints` — the strip/scatter of cuts is untouched, so it still distributes any
number of cuts across any parts. (Alternative rejected: returning a no-op seat `{ partId: A, position:
A.position }` keeps `reconcileJoints` byte-identical but bakes in a semantic lie; the optional seat is
the honest framework shape for seatless joints.)

---

## 3. Scope & assumptions

**In scope:** a half-lap between two **equal-thickness** boards that are **coplanar** (their thickness
ranges coincide along a shared world axis) and **overlap** in-plane, axis-aligned. Each board gets one
derived `BoxCut` removing the overlap footprint over the complementary half of its thickness. Edited
from the sidebar (`split`, `clearance`), created by a two-click gesture, with undo/redo and file
persistence inherited from the framework.

**v1 boundaries:**
- **Equal thickness + coplanar** is enforced by the validity check (coincident thickness ranges along
  the stack axis ⟺ equal thickness *and* coplanar). Unequal thickness or a Z-offset → the joint is
  **stale** and preserves last-good (exactly like `isValidDadoSeat`).
- **Axis-aligned** boards (local axes map to world axes). The overlap is computed as an
  axis-aligned-bounding-box intersection, which is exact for axis-aligned placement.
- The lap is on the **broad faces** (thickness stacking); the stacking axis is each board's thickness
  (local Z). Edge-lapping (on a narrow face) is out of scope.
- `split` is clamped to `[0.05, 0.95]` so both notches stay non-degenerate.

**Non-goals:** unequal-thickness laps, angled/dovetail/sliding laps, mitred half-laps, repositioning
boards to make them coplanar, cylinders.

**Size note:** this slice is larger than JP1–JP3 (the first new type adds new geometry *plus*
dispatch *plus* a new gesture *plus* polymorphic UI) — ~8–9 implementation tasks. It is still one
coherent, independently-shippable feature (a usable half-lap). If preferred it could split into
**JP4a** (data model + geometry + dispatch + reconciler + tests, joint created programmatically) and
**JP4b** (gesture + UI); the default is to ship it whole.

---

## 4. Data model

New interface in `src/scene/types.ts`:

```ts
export interface HalfLapJoint {
  kind: 'halflap'
  id: string // "joint_<uuid>"
  label: string // "Half-lap 1"
  partAId: PartId // the two lapping boards — A/B is just an ordering
  partBId: PartId
  split: number // 0..1 — fraction of thickness board A keeps (default 0.5 = true half-lap)
  clearance: number // mm added to each notch's thickness-depth for fit (default 0)
}

export type Joint = DadoJoint | HalfLapJoint
```

The stacking axis and overlap are **fully derived** from the two boards' placement — nothing about
geometry is stored on the joint (only the two part refs + the two knobs).

**File format:** `FILE_FORMAT_VERSION` `6 → 7`. `parseFile` branches on `j.kind`:
- `'dado'` (or a legacy joint with no `kind`) → the existing dado defaulting (profile / tongue /
  rabbet / stops), as today.
- `'halflap'` → defaults-first spread `{ split: 0.5, clearance: 0, ...j }`.

Old files (≤ v6) contain only dados and load unchanged. New joint kinds never appear in old files.

---

## 5. Geometry — new `src/geom/halflap.ts`

Self-contained (no runtime import from `dado.ts`). Uses `composeWorldMatrix` / `applyMatrixToPoint`
from `./transform` and defines its own trivial `clamp` / `boardDims` / `AXES`. Type-imports
`DeriveResult` / `DerivedCut` from `./dado`.

### 5.1 World AABB

```ts
function worldAabb(b: BoardPart): { min: Vec3; max: Vec3 }
```
Transform the 8 local corners `(0|L, 0|W, 0|T)` by `composeWorldMatrix(b)` via `applyMatrixToPoint`,
take per-axis min/max. Exact for axis-aligned boards.

### 5.2 Stacking axis

```ts
function stackAxis(b: BoardPart): Axis // world axis the board's thickness (local Z) lies along
```
The world axis with the largest `|component|` of the world image of local `+Z`
(`applyMatrixToPoint(composeWorldMatrix(b), 0,0,1)` minus the world origin image, i.e. the direction).

### 5.3 Validity

```ts
export function isValidHalfLap(a: BoardPart, b: BoardPart): boolean
```
- `stackAxis(a) === stackAxis(b)` =: `s`.
- `worldAabb(a)` and `worldAabb(b)` coincide on `s`: `|A.min[s]−B.min[s]| < EPS && |A.max[s]−B.max[s]| < EPS`
  (⟺ coplanar **and** equal thickness). `EPS = 1e-4`.
- On both in-plane axes `p, q` (the two axes ≠ `s`): overlap length `> EPS`, i.e.
  `min(A.max[ax],B.max[ax]) − max(A.min[ax],B.min[ax]) > EPS`.

Returns false ⇒ `deriveHalfLap` returns `null` (stale, last-good preserved).

### 5.4 The complementary lap cuts

```ts
export function deriveHalfLap(joint: HalfLapJoint, parts: Part[]): DeriveResult | null
```
- Resolve `a = partAId`, `b = partBId`; both boards else `null`. `!isValidHalfLap(a,b)` → `null`.
- `s = stackAxis(a)`; `p, q` = the other two axes. `A = worldAabb(a)`, `B = worldAabb(b)`.
- Shared thickness range `s0 = A.min[s]`, `s1 = A.max[s]`, `T = s1 − s0`.
- `mid = s0 + clamp(joint.split, 0.05, 0.95) * T`.
- In-plane overlap: `lo[ax] = max(A.min[ax],B.min[ax])`, `hi[ax] = min(A.max[ax],B.max[ax])` for `ax ∈ {p,q}`.
- **A keeps the low half, removes the high half.** A's removed world box:
  `[lo[p],hi[p]] × [lo[q],hi[q]] × [mid − clearance, s1]` on `s`.
- **B keeps the high half, removes the low half.** B's removed world box:
  `[lo[p],hi[p]] × [lo[q],hi[q]] × [s0, mid + clearance]` on `s`.
  (`clearance` deepens each notch past `mid`; `clearance = 0` ⇒ they meet exactly at `mid`. Outer faces
  `s0`/`s1` are untouched ⇒ the assembly stays flush at `T`.)
- Convert each removed world box to a local `BoxCut` via `worldBoxToLocalCut(board, wmin, wmax)`:
  transform the 8 world-box corners by `composeWorldMatrix(board).invert()`, take local min/max ⇒
  `position` = local min, `size` = local max − min. (Robust; exact for axis-aligned.)
- `BoxCut` per board: `{ kind:'box', id: \`cut_${joint.id}_lap${A|B}\`, label: \`${joint.label} lap\`,
  face: <board's ±Z toward its removed half>, position, size, sourceJointId: joint.id }`.
  `face` is cosmetic (geometry is in position/size); pick the local thickness face on the removed side
  by the sign of local `+Z` vs world-`s`.
- Return `{ cuts: [ { partId: a.id, cut: cutA }, { partId: b.id, cut: cutB } ] }` — **no `seat`**.

```
Section through the overlap along the stack axis s (clearance = 0):
   s1 ┌▓▓ cut ▓┐ ┌────────┐   A removes the HIGH half [mid,s1];
      ├────────┤ │   B    │   B keeps it.
  mid ┤   A    ├ ┼────────┤   they meet at mid and nest.
      │        │ │▓▓ cut ▓│   B removes the LOW half [s0,mid];
   s0 └────────┘ └────────┘   A keeps it. Outer faces s0/s1
        board A     board B    untouched ⇒ assembly stays T.
```

**Determinism:** ids `cut_${id}_lapA` / `cut_${id}_lapB`, `sourceJointId`-tagged, so `reconcileJoints`
strips/regenerates idempotently. No OCCT/mesh/export/drawing change — the laps are ordinary `BoxCut`s.

---

## 6. Creation gesture — `src/scene/useAddHalfLap.ts`

A two-click state machine mirroring `useAddJoint` (idle → awaiting-A → awaiting-B). Fed `FaceHit`s
from the Viewport raycaster (already wired for the other face interactions):
- First `FaceHit` → store as A (any board face; the broad-face requirement is validated at derive time
  via `isValidHalfLap`, not gated in the gesture).
- Second `FaceHit` on a **different** part → call `onAddHalfLap(hitA.partId, hitB.partId)`; reset.

`onAddHalfLap(aId, bId)` in `useScene` constructs a `HalfLapJoint` (`split: 0.5`, `clearance: 0`,
`label: \`Half-lap ${n}\``), appends it, reconciles, and pushes **one** undo entry (same pattern as
`onAddJoint`).

**App wiring:** compose `useAddHalfLap` alongside `useAddJoint` in `App.tsx`, and add a mode toggle so
the user picks which joint to place. The existing "add dado" affordance gains a sibling "add half-lap"
(a second button / segmented control in the same toolbar). Only one add-mode is active at a time;
mirror how `useAddJoint`'s mode is currently toggled.

---

## 7. UI — `src/ui/JointsPanel.tsx` (polymorphic)

The panel currently assumes dado semantics (housing/housed, `isValidDadoSeat`, dado controls). Make it
branch on `joint.kind`:

- **Joint filter / involvement:** replace the `housingPartId || housedPartId` membership test with a
  `jointInvolves(joint, partId)` helper: dado ⇒ housing/housed; half-lap ⇒ `partAId`/`partBId`.
- **Staleness:** dado ⇒ `isValidDadoSeat`; half-lap ⇒ `isValidHalfLap`.
- **Controls:** dado ⇒ the existing Profile/Depth/Clear/Offset/Stop/Rabbet block. Half-lap ⇒ two
  `JointNumInput`s: **`Split`** (`split`, clamped `[0.05, 0.95]` on commit) and **`Clear`**
  (`clearance`, `Math.max(0, v)`). The half-lap is symmetric, so its controls render on **both**
  boards' panels (editing either edits the joint). Both boards' lap cuts already render read-only via
  `sidebar.tsx`'s `sourceJointId` branch — no housed-side UI work.

**`onUpdateJoint` generic:** change the signature from `(j: DadoJoint) => DadoJoint` to a generic
`<J extends Joint>(jointId: string, updater: (j: J) => J) => void`, so the dado panel calls it with
`J = DadoJoint` (narrowed by the panel's `j.kind === 'dado'` guard) and the half-lap panel with
`J = HalfLapJoint`. `useScene`'s implementation applies the updater to the matching joint and
reconciles, unchanged in behavior.

---

## 8. Testing (seam-first)

- **`src/geom/halflap.test.ts`** (the bulk):
  - `isValidHalfLap`: coplanar equal-thickness overlapping boards → valid; a Z-offset (non-coplanar),
    unequal thickness, or disjoint footprints → invalid.
  - `worldAabb` / `stackAxis` for an axis-aligned and a rotated board.
  - `deriveHalfLap`: two cuts (one per board), correct partIds, ids `_lapA`/`_lapB`, **no seat**.
  - Complementary halves: A's cut spans the shared footprint × the high thickness half, B's the low
    half; `split` shifts `mid`; `clearance` deepens both; through the local conversion the cut sits at
    the right local thickness range (test a rotated board so `worldBoxToLocalCut` is exercised).
  - Stale → `null`.
- **`src/geom/dado.test.ts`**: `deriveJoint` still dispatches dados correctly (existing tests pass
  unchanged; add one asserting `deriveJoint` on a `halflap` returns the half-lap result / on a dado the
  dado result).
- **`src/scene/reconcileJoints.test.ts`**: a half-lap materializes one cut on each board; removing the
  joint strips both; a seatless result does not move either board (position unchanged); dado tests
  still pass (optional-seat guard is backward-compatible).
- **`src/scene/useScene.test.ts`**: `onAddHalfLap` creates the joint + two cuts in one undo entry;
  `onUpdateJoint` changing `split` re-derives; undo restores.
- **`src/scene/useAddHalfLap.test.ts`**: two `FaceHit`s on different boards create a half-lap; a second
  hit on the same board does not.
- **`src/ui/sidebar.test.tsx`**: a selected board in a half-lap shows `Split` + `Clear`; a dado board
  still shows its Profile/Depth controls (polymorphic panel doesn't regress).

---

## 9. Files touched

**Created:**
- `src/geom/halflap.ts` — `isValidHalfLap`, `worldAabb`, `stackAxis`, `worldBoxToLocalCut`,
  `deriveHalfLap`; `+ halflap.test.ts`.
- `src/scene/useAddHalfLap.ts` — two-click gesture; `+ useAddHalfLap.test.ts`.

**Modified:**
- `src/scene/types.ts` — `HalfLapJoint`; `Joint = DadoJoint | HalfLapJoint`.
- `src/scene/useFile.ts` — `FILE_FORMAT_VERSION` `6 → 7`; `parseFile` kind-branch.
- `src/geom/dado.ts` — `deriveJoint` dispatcher + `deriveDadoJoint` extraction; `DeriveResult.seat`
  optional; import `deriveHalfLap`.
- `src/scene/reconcileJoints.ts` — guard the seat application (`if (result.seat)`).
- `src/scene/useScene.ts` — `onAddHalfLap`; `onUpdateJoint` generic over `Joint`.
- `src/App.tsx` — compose `useAddHalfLap`; half-lap add-mode toggle + button.
- `src/ui/JointsPanel.tsx` — kind-branch (`jointInvolves`, `isValidHalfLap`, Split/Clear controls).
- Tests as in §8; `README.md`, `project-structure.html`,
  `docs/superpowers/notes/2026-07-21-half-lap-joint-notes.md`.

**Unchanged:** `computeDado*`/`computeRabbet`/`computeNotch` (dado geometry), `useAddJoint.ts`,
`snapMath.ts`, `viewport.tsx` raycaster, `occt.ts`/`occt.worker.ts`/`mesh.ts`, STL/STEP export,
`drawing.ts`.
