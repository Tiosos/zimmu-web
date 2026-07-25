# Box / Finger Joint (JP6) — Design Spec

**Date:** 2026-07-24
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Add a **box / finger joint** — an interlocking right-angle corner joint. Two equal-width boards
meet end-to-end at 90°; each joined end is cut into a comb of fingers running across the shared
edge, and the two combs mesh (board A's fingers fill board B's gaps and vice versa). Each finger
cuts to a depth equal to the *mating* board's thickness, so the corner closes flush.

This is the sixth joint type and the first with a **variable integer count** parameter. It reuses
the entire `Joint` framework introduced in JP4 and extended through JP5 — a discriminated-union
`Joint`, an exhaustive `deriveJoint` dispatcher, the generic `reconcileJoints` distributor (which
already scatters cuts to multiple boards and applies one optional seat), a two-click gesture as an
exclusive viewport mode, and a `JointsPanel` editor branch. No OCCT / mesh / export / drawing change
— every cut is an ordinary axis-aligned `BoxCut`.

## Goals

- A `FingerJoint` type; the sixth `Joint` union member.
- Pure geometry (`src/geom/fingerjoint.ts`) computing the finger cuts on **both** boards plus a
  corner seat, gated by a validity check.
- A two-click creation gesture wired as the **6th exclusive viewport mode** (shortcut `f`).
- A `JointsPanel` branch: a `Fingers` count stepper + a `Clearance` input on the lead board, a
  read-only hint on the mating board, and a stale banner.
- Docs (notes, keyboard-shortcuts, README, project-structure.html).

## Non-Goals

- Non-perpendicular / mitred finger joints. Strictly a 90° corner.
- Unequal-width boards (spanning the overlap). The joint requires **equal joint widths**; otherwise
  it is stale.
- Variable finger *widths* or per-finger control. Fingers are `N` equal segments.
- A depth parameter. Finger depth is always the mating board's thickness (a flush corner). This
  follows from the auto-seat decision.
- Any new cut primitive or kernel change. `BoxCut` only.

## Data Model

Add to `src/scene/types.ts`, after `MortiseTenonJoint`:

```ts
export interface FingerJoint {
  kind: 'finger'
  id: string           // "joint_<uuid>"
  label: string        // "Finger joint 1"
  partAId: PartId      // lead board — keeps EVEN width-segments; stays put
  endA: Face           // A's joined end (a non-thickness end)
  partBId: PartId      // mating board — keeps ODD segments; auto-seats into the corner
  endB: Face           // B's joined end
  fingerCount: number  // N — the shared joint width split into N equal segments
  clearance: number    // mm — widens each cut slot for fit (default 0)
}
```

Extend the union:

```ts
export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint
```

**File format:** bump `FILE_FORMAT_VERSION` `8 → 9` in `useFile.ts`. Add a `finger` arm to the
`parseFile` joint-defaulting map (inert backfill; real v9 finger joints carry every field via
`...j`):

```ts
j.kind === 'finger'
  ? ({ fingerCount: 0, clearance: 0, ...j } as unknown as Joint)
  : /* mortise-tenon / halflap / dado arms unchanged */
```

## Frame Conventions

A board's local box is `[0,length] × [0,width] × [0,thickness]` = X (length) × Y (width) × Z
(thickness). Thickness is always local Z.

For a finger joint on a board:

- The **joined end** is a *non-thickness* end (its depth axis is `x` or `y`, never `z`) — the same
  admissibility rule as the M&T tenon end.
- `seatAx = faceAxes(end).depth` — the cut-depth direction (from the end into the board).
- `fingerAxis` = the end face's in-plane axis that is **not** thickness (i.e. the non-`z` in-plane
  axis). This is the direction along the shared corner edge; fingers alternate along it. For a
  length-end (`±X`) `fingerAxis = 'y'` (width); for a width-end (`±Y`) `fingerAxis = 'x'` (length).
- Each finger cut spans the **full thickness** (local `z`), one segment along `fingerAxis`, and a
  **depth = the mating board's thickness** along `seatAx` measured from the end.

The **joint width** of a board is `dim[fingerAxis]`. The two boards must have equal joint widths.

## Geometry (`src/geom/fingerjoint.ts`)

Self-contained, mirroring `mortisetenon.ts`: it may `import type` from `dado.ts` (`DeriveResult`,
`DerivedCut`) but must **not** import any runtime value from it (avoids a cycle — `dado.ts`
runtime-imports `deriveFingerJoint` back). It reimplements the small helpers it needs locally
(`clamp`, `boardDims`, `unitVec`, `localDirToWorld`, `isAxisAligned`, `FACE_NORMALS`), and imports
`faceAxes` / `computeLocalFaceCenter` from `snapMath` and `applyMatrixToPoint` /
`composeWorldMatrix` from `transform`.

### `isValidFingerJoint(a, endA, b, endB): boolean`

Returns true iff **all** hold:

1. `a` and `b` are both axis-aligned (`isAxisAligned`).
2. Both ends are non-thickness ends: `faceAxes(endA).depth !== 'z'` and `faceAxes(endB).depth !== 'z'`.
3. The end world normals are **perpendicular** (a 90° corner): `|worldN(a,endA) · worldN(b,endB)| < EPS`.
4. The two `fingerAxis` world directions are **parallel** (shared edge):
   `|worldDir(a, fingerAxisA) · worldDir(b, fingerAxisB)| > 1 − EPS`.
5. **Equal joint widths:** `|dim_a[fingerAxisA] − dim_b[fingerAxisB]| < WIDTH_EPS` (e.g. 0.01 mm).

### `computeFingerCuts(board, joint, matingThickness, removeParity, flip): BoxCut[]`

Split the joint width `W = dim[fingerAxis]` into `N = fingerCount` equal segments of size
`seg = W / N`. Local segment `i` spans `[i·seg, (i+1)·seg]` along `fingerAxis`.

**Removal is by WORLD segment parity, not local index** — this is essential. Because the seat aligns
the two boards' physical width spans, the *world* segment at a given position may correspond to a
*different* local index on each board when their `fingerAxis` directions are anti-parallel. Define
`worldIndex(i) = flip ? (N − 1 − i) : i`. A board removes local segment `i` iff
`worldIndex(i) % 2 === removeParity`.

- **A: `removeParity = 1` (world-odd), `flip = false`** (A is the world reference; local = world).
- **B: `removeParity = 0` (world-even), `flip` computed in `deriveFingerJoint`** (see below).
- This makes the two boards complementary at every world segment: exactly one has material. (Worked
  example, N=4, flipped B: A removes world-{1,3}=local-{1,3}; B removes world-{0,2}=local-{3,1} —
  disjoint in world → interlocks.)
- Each removed slot is a `BoxCut`:
  - along `seatAx`: from the end inward, depth = `clamp(matingThickness, 0.1, dim[seatAx])`; position
    = `end.startsWith('+') ? dim[seatAx] − depth : 0`.
  - along `fingerAxis`: `[i·seg, (i+1)·seg]`, then widened by `clearance/2` on each side (giving the
    mating finger a fit gap) and clamped to `[0, W]`. **Clearance note:** both boards widen their
    slots, so the physical per-side gap between a meshed finger and its slot wall is ≈ `clearance`
    (i.e. `clearance/2` from each board). Default `clearance = 0` → exact segments (a press fit).
  - along `z`: full thickness `[0, dim.z]`.
  - id `cut_{joint.id}_finger{i}`; `face: end`; `sourceJointId: joint.id`. (A and B live on different
    boards, so identical `finger{i}` ids across the two never collide in one cut list.)
- Guard `N < 2` → return `[]` (defensive; the panel enforces min 3 and creation clamps to ≥ 3, so
  `N < 2` only arises from a hand-edited/corrupt file).

### `computeFingerSeat(a, b, joint): { position: Vec3 }`

Positions **B** so its end-region interpenetrates A's to form a flush right-angle corner, using the
M&T "project the moving board's end onto the fixed board's axes" technique extended to three axes.
The assembled corner is the box where the two end-regions overlap: extent `Tb` (B's thickness) along
A's `seatAx`, `Ta` (A's thickness) along B's `seatAx`, and the shared joint width along `fingerAxis`.
The seat places B so that, in world space:

- **B's `endB` face is flush with A's outer thickness face** on the side B approaches from — i.e.
  B's fingers penetrate A to depth `Ta` (along A's thickness normal / B's `seatAx`).
- **A's `endA` face is flush with B's outer thickness face** — i.e. A's fingers penetrate B to depth
  `Tb` (along `endA`'s normal, which is parallel to B's thickness axis).
- **The two joint-width spans coincide** along `fingerAxis` (the physical `[0,W]` ranges overlap in
  world space; the `flip`-aware cut parity then guarantees interlock).

**Corner-side determinacy:** `endA`/`endB` fix the two meeting ends but not *which* of A's two
thickness faces the corner closes on, nor which way each body extends — up to four candidate poses.
The seat resolves this from **B's current position**: it picks the nearest valid corner (the side of
A that B is already closest to, and the width-span alignment nearest B's current span). This makes
auto-seat move B the short way and keeps it **idempotent** once seated — re-deriving with unchanged
params reselects the same pose (B is now at it), so B does not drift. Manually dragging B to the
opposite thickness side and re-deriving intentionally flips the corner to follow the user.

Returns B's new `position` (delta applied to B's current position, like `computeMortiseTenonSeat`).

### `deriveFingerJoint(joint, parts): DeriveResult | null`

Look up A and B; return `null` if either isn't a board or `isValidFingerJoint` fails. Otherwise
compute `flip` (whether B's `fingerAxis` runs opposite A's in world space), and split the cuts:

```ts
const flip = worldDir(a, fingerAxisA).dot(worldDir(b, fingerAxisB)) < 0
const cuts = [
  // A: world-odd, reference direction (flip=false)
  ...computeFingerCuts(a, joint, b.thickness, 1, false).map((cut) => ({ partId: a.id, cut })),
  // B: world-even, flip-aware
  ...computeFingerCuts(b, joint, a.thickness, 0, flip).map((cut) => ({ partId: b.id, cut })),
]
const seat = { partId: b.id, position: computeFingerSeat(a, b, joint).position }
return { cuts, seat }
```

(`fingerAxisA`/`fingerAxisB` are each board's non-thickness in-plane axis of its end; `worldDir`
rotates a local unit axis into world space via the board's rotation.)

### Reference fixture (for the geometry tests)

Two equal-width boards forming a right-angle corner:

- **A** `200 × 80 × 18`, at origin, unrotated, `endA = '+X'` → `seatAx = 'x'`, `fingerAxis = 'y'`
  (width 80), thickness world Z.
- **B** `200 × 80 × 18`, rotation `{ x:0, y:90, z:0 }` (local Y → world Y so its `fingerAxis` is
  parallel to A's; local X → world −Z so its length runs along world Z; local Z → world X),
  `endB = '+X'`.

With `fingerCount = 4, clearance = 0`: `seg = 20`. This is the **non-flip** case (B's `fingerAxis`
→ world +Y, same as A's), so `flip = false`: A removes segments 1,3 (`y ∈ [20,40], [60,80]`), each
depth = B.thickness 18 (`x ∈ [182,200]`), full z (`[0,18]`) → 2 cuts on A. B removes world-even = 0,2,
each depth = A.thickness 18, full z → 2 cuts on B. `deriveFingerJoint` → 4 cuts + a seat on B. The
implementation plan (T1) will hand-compute the exact seated `B.position` and the per-cut
positions/sizes as the test's expected values.

**Two additional required fixtures** (per the L99 review, finding I2):

- **Flip case** — B rotated so its `fingerAxis` maps to world **−Y** (e.g. an added `z:180` on top of
  the `y:90`). `deriveFingerJoint` must set `flip = true`, and B's removed *local* segments must still
  be **complementary to A in world space** (B removes world-even, which is now the reversed local
  indices). A test asserts B's world-space finger regions interlock with A's (no overlap, no gap).
- **Unequal-thickness case** — a valid corner where `Ta ≠ Tb` (equal widths still required). Asserts
  A's slot depth = `Tb` and B's slot depth = `Ta` (the asymmetric mating depths), and that the corner
  still closes flush.

## Interaction

### `onAddFingerJoint(hitA, hitB)` in `useScene.ts`

Mirrors `onAddMortiseTenon`. Resolve A (first hit) and B (second hit); bail if not two distinct
boards. Convert local normals via `localNormalToFaceString`; gate on
`isValidFingerJoint(a, endA, b, endB)`. Seed `fingerCount` proportionally to the material:
`clamp(Math.round(width / (2 * thickness)), 3, 15)` (`width` = A's `fingerAxis` dimension); `clearance
= 0`. Build the `FingerJoint`, `commitReconciled(..., 'Add finger joint')` (single undo entry),
`setSelectedId(a.id)`. Extend `onRemoveJoint`'s kind-aware label to include
`joint.kind === 'finger' ? 'Remove finger joint' : …`.

### `useAddFingerJoint` gesture (`src/scene/useAddFingerJoint.ts`)

Two-click state machine mirroring `useAddMortiseTenon`: first click sets `pendingA`; second click on
a **different** board validates via `isValidFingerJoint` and calls `onAddFingerJoint(pendingA, hit)`;
same-board and invalid-corner rejections set a status message (`'Pick a different board for the
second end'`, `'Both ends must form a right-angle corner of equal width'`). Exposes
`fingerJointActive`, `pendingA`, `statusMessage`, `hoveredFace`, `activateFingerJoint`,
`cancelFingerJoint`, `onFaceClick`, `onFaceHover`. It imports `isValidFingerJoint` directly (the
create gate must match the derive gate — the JP5 holistic-review lesson) — no import cycle, as this
module isn't imported by `dado.ts`/`fingerjoint.ts`.

### 6th exclusive viewport mode (shortcut `f`)

Wire through `App.tsx` / `src/render/viewport.tsx` / `src/ui/sidebar.tsx` exactly like the M&T
(`m`) mode: mutual exclusion against the other five modes (each existing `handleActivate*` cancels
finger mode and vice-versa), keyboard `f` case, Escape / `h` / Delete guards extended, Viewport
click/hover routing (finger as the leading branch), highlight + cursor effects, and a "Finger joint"
Sidebar toggle button. No new unit tests for the wiring; verification is typecheck + lint + the full
suite staying green.

## Panel (`src/ui/JointsPanel.tsx`)

A `j.kind === 'finger'` branch, mirroring the M&T branch's structure:

- `isLead = j.partAId === part.id`.
- `stale = both boards exist && !isValidFingerJoint(...) ? … : true`.
- Header (label + `isLead ? 'A' : 'B'` tag + remove ✕), a mate line, and a stale banner
  ("Joint stale — ends must form a right-angle corner of equal width").
- If `isLead`: a **`Fingers`** integer stepper (`fingerCount`, **min 3** — commit
  `Math.max(3, Math.round(v))`) and a **`Clear`** input (`clearance`, `Math.max(0, v)`).
- Else: a read-only "Edit from `<A label>`." hint.

All `onUpdateJoint` updater closures sit inside the `j.kind === 'finger'` narrow (the type-hole
invariant). A `Fingers` integer control may reuse the existing `JointNumInput` (rounding on commit)
or a minimal stepper — the plan will pick whichever matches the existing controls with least code.

## Documentation

- `docs/superpowers/notes/2026-07-24-box-finger-joint-notes.md` — living implementation notes.
- `docs/keyboard-shortcuts.md` — an `F` row after the `M` row.
- `README.md` — a "Finger joint mode (`F`)" bullet after the M&T bullet.
- `project-structure.html` — `fingerjoint.ts` next to `mortisetenon.ts` in `src/geom/`, and
  `useAddFingerJoint.ts` next to `useAddMortiseTenon.ts` in `src/scene/`.

## Testing Strategy

- **Geometry (`fingerjoint.test.ts`)** against the reference fixture: `isValidFingerJoint`
  (valid corner; invalid for non-axis-aligned, thickness-end, non-perpendicular, non-parallel
  widths, unequal widths); `computeFingerCuts` (A removes world-odd, B removes world-even; correct
  count, segment bounds, depth = mating thickness, full thickness, clearance widening);
  `computeFingerSeat` (B's end-region lands flush in the corner; idempotent — re-derive doesn't
  drift); `deriveFingerJoint` (cut split across both boards + seat; stale → null).
- **Flip coverage (required):** the flip fixture (B `fingerAxis` → world −Y) — assert `deriveFingerJoint`
  produces cuts that interlock in **world** space (A's and B's finger regions are disjoint and cover
  the full width), catching the C1 direction bug that the non-flip fixture cannot.
- **Unequal-thickness coverage (required):** the `Ta ≠ Tb` valid fixture — assert A's slot depth =
  `Tb` and B's slot depth = `Ta`.
- **Dispatch** (`dado.test.ts`): `deriveJoint` routes `finger` to `deriveFingerJoint`.
- **Scene** (`useScene.test.ts`): `onAddFingerJoint` creates joint + cuts on both boards + seat in
  one undo entry; undo reverses it.
- **Gesture** (`useAddFingerJoint.test.ts`): two-click create; same-board rejection; invalid-corner
  rejection (with status assertions).
- **Panel** (`sidebar.test.tsx`): lead board shows `Fingers`/`Clear`; mating board shows the hint.
- OCCT stays untouched; no live-kernel tests. Interactive 3D verification is a human step.

## Task Breakdown (for `writing-plans`)

1. **T1** — `FingerJoint` type (not yet in the union) + `fingerjoint.ts` geometry + tests (standalone).
2. **T2** — union flip + `deriveJoint` case + `jointInvolves` arm + `parseFile` v9 + `JointsPanel`
   stub + dispatch test.
3. **T3** — `onAddFingerJoint` + kind-aware remove label + scene test.
4. **T4** — `useAddFingerJoint` two-click gesture + tests.
5. **T5** — 6th exclusive viewport mode (shortcut `f`) across App / Viewport / Sidebar.
6. **T6** — `JointsPanel` finger controls (replace the T2 stub) + panel tests.
7. **T7** — docs + full verify + build + push.

## Key Invariants & Risks

- **`shapeKey()` unaffected:** finger cuts are ordinary `BoxCut`s already keyed by the cut list; no
  change to `src/scene/utils.ts`.
- **Create gate = derive gate:** the gesture and `onAddFingerJoint` both validate with
  `isValidFingerJoint` (not a weaker perpendicular-only check), so no dead/stale joints can be
  created — carrying forward the JP5 holistic-review fix.
- **No import cycle:** `fingerjoint.ts` type-only-imports from `dado.ts`; `dado.ts` runtime-imports
  `deriveFingerJoint`. The gesture/scene import the runtime `isValidFingerJoint` from
  `fingerjoint.ts` (neither is imported by `dado.ts`).
- **Seat idempotence:** `computeFingerSeat` returns an absolute position derived from A's fixed pose
  + joint params, applied as a delta from B's current end — re-deriving with unchanged params must
  not drift B (as with `computeMortiseTenonSeat`).
- **Euler XYZ assumption:** like the rest of the joint geometry, world-direction math assumes
  `rotationOrder === 'XYZ'`; non-axis-aligned boards are rejected by `isValidFingerJoint`.
- **World-parity interlock:** finger removal is by **world** segment index (`flip`-aware), not local
  index — the anti-parallel `fingerAxis` case (reachable by rotating B) otherwise self-collides. This
  is the C1 finding from the L99 review and is covered by the required flip fixture.
- **Risk — the corner seat is the meatiest new math** (3-axis flush placement, plus corner-side
  selection from B's current position). Mitigation: derive it against the reference fixture with
  hand-computed expected values in T1, exactly as M&T's seat was validated.

## Deferred (not JP6)

- **Mode-system refactor (D1):** JP6 makes six mutually-exclusive viewport modes; each new mode adds
  cross-cancellation wiring to every other (the `activeMode`-enum refactor deferred since JP4). Worth
  doing as its **own** slice — folding it into JP6 would break the lean cadence. Flagged in the L99
  review; raise it as a candidate after JP6 ships.
