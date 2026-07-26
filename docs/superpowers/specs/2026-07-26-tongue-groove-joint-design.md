# Tongue & Groove Joint (JP7) — Design Spec

**Date:** 2026-07-26
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Add a **tongue & groove joint** — an edge-to-edge glue-up joint. Two equal-thickness boards lie
coplanar and meet along a **long edge** (`±Y` face); one edge carries a full-length groove and the
mating edge carries a matching **centered tongue** that seats into it. This is the canonical T&G used
in panel glue-ups, cladding, and flooring — geometrically distinct from every joint shipped so far
(all of which meet at an end or a corner).

This is the **seventh** joint type and the **first edge-to-edge** joint. It reuses the entire `Joint`
framework unchanged: the discriminated-union `Joint`, the exhaustive `deriveJoint` dispatcher, the
generic `reconcileJoints` distributor (scatters cuts to both boards + applies one optional seat), the
`useInteractionMode` coordinator (adding a mode is now: one gesture hook + one registry entry + a
keyboard case + Sidebar props — **Viewport needs zero changes**), and a `JointsPanel` editor branch.
**No OCCT / mesh / export / drawing change** — every cut is an ordinary axis-aligned `BoxCut`, so it
flows through meshing, STL, STEP, and the 2D drawings unchanged.

## Goals

- A `TongueGrooveJoint` type; the seventh `Joint` union member.
- Pure geometry (`src/geom/tonguegroove.ts`) computing a groove cut on one board and two symmetric
  shoulder cuts (leaving a centered tongue) on the other, plus an edge seat, gated by a validity check.
- A two-click creation gesture wired as the **7th exclusive viewport mode** (shortcut `t`).
- A `JointsPanel` branch: `Thk` / `Depth` / `Clear` inputs on the groove board, a read-only hint on
  the tongue board, and a stale banner.
- Docs (notes, keyboard-shortcuts, README, project-structure.html).

## Non-Goals

- **Unequal thickness.** The joint requires **equal thickness** (within `THICK_EPS`); otherwise it is
  stale. A centered tongue can only meet a centered groove when the mid-planes coincide.
- **Off-center tongue.** No `offset` parameter — the tongue is always centered in thickness. (The
  dado's `offset` exists because a housed board can sit anywhere across a wide housing; a T&G tongue
  is symmetric by construction.)
- **Stopped / blind T&G.** The groove always runs the full length (through). No stop parameters.
- **End-grain tongue (panel-into-frame).** That overlaps the existing rabbeted dado and is explicitly
  out of scope (resolved during brainstorming).
- **Any new cut primitive or kernel change.** `BoxCut` only. No `shapeKey()` change.

## Data Model

Add to `src/scene/types.ts`, after `FingerJoint`:

```ts
export interface TongueGrooveJoint {
  kind: 'tongue-groove'
  id: string             // "joint_<uuid>"
  label: string          // "Tongue & groove 1"
  groovePartId: PartId   // board carrying the groove — stays put (first click)
  grooveEdge: Face       // the long edge (±Y) the groove is cut into
  tonguePartId: PartId   // board carrying the centered tongue — auto-seats (second click)
  tongueEdge: Face       // the long edge (±Y) the tongue is formed on
  tongueThickness: number // mm — tongue thickness = groove width (before clearance)
  tongueDepth: number     // mm — tongue projection = groove depth
  clearance: number       // mm — added to groove width for fit (default 0)
}
```

Extend the union:

```ts
export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint | TongueGrooveJoint
```

**File format:** bump `FILE_FORMAT_VERSION` `9 → 10` in `useFile.ts`. Add a `tongue-groove` arm to the
`parseFile` joint-defaulting map (inert backfill; real v10 T&G joints carry every field via `...j`),
as the **first** branch of the chain:

```ts
j.kind === 'tongue-groove'
  ? ({ tongueThickness: 6, tongueDepth: 8, clearance: 0, ...j } as unknown as Joint)
  : j.kind === 'finger'
    ? /* … existing arms unchanged … */
```

**`jointInvolves`** (`src/scene/jointInvolves.ts`): the current fallthrough assumes `partAId`/`partBId`
(finger/halflap). T&G uses `groovePartId`/`tonguePartId`, so add an **explicit arm before the
fallthrough**:

```ts
if (joint.kind === 'tongue-groove')
  return joint.groovePartId === partId || joint.tonguePartId === partId
```

## Frame Conventions

A board's local box is `[0,length] × [0,width] × [0,thickness]` = X (length) × Y (width) × Z
(thickness). Thickness is always local Z. A **long edge** is a length×thickness face — its outward
normal is along ±width, so `grooveEdge`/`tongueEdge ∈ {'+Y','-Y'}` and `faceAxes(edge).depth === 'y'`.

For a T&G edge, derived from the clicked `±Y` face via `faceAxes`:

- `depthAx = 'y'` (width) — the groove-depth / tongue-projection direction (into the board).
- `runAx = 'x'` (length) — the groove and tongue run the **full length** (through).
- `narrowAx = 'z'` (thickness) — the tongue is centered here; groove width and tongue thickness span a
  portion of Z.

## Geometry (`src/geom/tonguegroove.ts`)

Self-contained, mirroring `fingerjoint.ts`: it may `import type` from `dado.ts` (`DeriveResult`,
`DerivedCut`) but must **not** import any runtime value from it (avoids a cycle — `dado.ts`
runtime-imports `deriveTongueGroove` back). It reimplements the small helpers it needs locally
(`clamp`, `boardDims`, `unitVec`, `localDirToWorld`, `isAxisAligned`, `FACE_NORMALS`, `EPS`,
`THICK_EPS`), and imports `faceAxes` / `computeLocalFaceCenter` from `snapMath` and `applyMatrixToPoint`
/ `composeWorldMatrix` from `transform`.

### `isValidTongueGroove(groove, grooveEdge, tongue, tongueEdge): boolean`

Returns true iff **all** hold:

1. Both boards axis-aligned (`isAxisAligned`).
2. Both faces are long edges: `faceAxes(grooveEdge).depth === 'y'` **and** `faceAxes(tongueEdge).depth === 'y'`.
3. The edge world normals are **anti-parallel** (edges facing each other):
   `worldN(groove, grooveEdge) · worldN(tongue, tongueEdge) < -(1 − EPS)`.
4. **Equal thickness:** `|groove.thickness − tongue.thickness| < THICK_EPS` (e.g. 0.01 mm).

> Note: condition 3 (anti-parallel `±Y` normals) already forces the two length axes to be parallel for
> axis-aligned boards, so no separate length-parallel gate is needed. The `isAxisAligned` gate keeps
> the world-direction math (Euler XYZ) valid, exactly as in the finger joint.

### `computeGrooveCut(groove, joint): BoxCut`

A `computeDadoGroove`-shaped box on the `grooveEdge`, centered in thickness, through-length:

- `depthAx = 'y'`, `narrowAx = 'z'`, `runAx = 'x'`.
- `width = clamp(joint.tongueThickness, 0.1, groove.thickness − 0.1) + joint.clearance` (groove width
  across Z, widened by clearance for fit).
- `depth = clamp(joint.tongueDepth, 0.1, groove.width − 1)`.
- `size.y = depth`, `size.z = width`, `size.x = groove.length` (full length).
- `position.y = grooveEdge.startsWith('+') ? groove.width − depth : 0`.
- `position.z = groove.thickness / 2 − width / 2` (centered).
- `position.x = 0`.
- id `cut_${joint.id}_groove`; `face: grooveEdge`; `sourceJointId: joint.id`.

### `computeTongueShoulders(tongue, joint): BoxCut[]`

Two `computeRabbet`-shaped cuts on the `tongueEdge`, one per broad face, that recess the shoulders and
leave a centered tongue of thickness `tongueThickness` projecting `tongueDepth`:

- `t = clamp(joint.tongueThickness, 0.1, tongue.thickness − 0.1)`; `shoulder = (tongue.thickness − t) / 2`.
- `depth = clamp(joint.tongueDepth, 0.1, tongue.width − 1)` (recess back from the tongue edge along Y).
- Each cut: `size.y = depth`, `size.x = tongue.length` (full length), `size.z = shoulder`.
- `position.y = tongueEdge.startsWith('+') ? tongue.width − depth : 0`; `position.x = 0`.
- `+Z` shoulder: `position.z = tongue.thickness − shoulder`. `−Z` shoulder: `position.z = 0`.
- ids `cut_${joint.id}_shoulder0` (−Z) and `_shoulder1` (+Z); `face: tongueEdge`; `sourceJointId`.

> **Clearance is groove-only.** The groove is widened by `clearance`; the tongue keeps its nominal
> thickness `t`, so the assembled fit gap is `clearance` total (`clearance/2` per side). This matches
> the dado convention (clearance widens the groove, not the tenon/tongue). Default `clearance = 0`.

### `computeTongueGrooveSeat(groove, tongue, joint): { position: Vec3 }`

A direct analog of `computeDadoSeat` (which already generalizes over axes via `faceAxes`), with the
groove board fixed. Seats the **tongue** board so, in world space:

- Along **depthAx** (groove-edge normal): the tongue edge sits `tongueDepth` **inside** the groove
  board's edge plane — the tongue bottoms into the groove and the shoulders meet the groove board's
  edge face.
- Along **narrowAx** (thickness): the tongue-edge center aligns to the groove board's thickness
  mid-plane — mid-planes coincide (valid because thickness is equal), so the centered tongue meets the
  centered groove.
- Along **runAx** (length): **preserved** (not adjusted) — the boards keep their relative length
  offset. Minimal move, idempotent: re-deriving with unchanged params does not drift the tongue board
  (the reference point is the tongue-edge face center; no rabbet offset needed since the tongue is
  centered).

Returns the tongue board's new `position` as a delta applied to its current position (like
`computeDadoSeat` / `computeFingerSeat`).

### `deriveTongueGroove(joint, parts): DeriveResult | null`

Look up the groove and tongue boards; return `null` if either isn't a board or `isValidTongueGroove`
fails (stale → caller preserves last-good geometry). Otherwise:

```ts
const cuts: DerivedCut[] = [
  { partId: groove.id, cut: computeGrooveCut(groove, joint) },
  ...computeTongueShoulders(tongue, joint).map((cut) => ({ partId: tongue.id, cut })),
]
const seat = { partId: tongue.id, position: computeTongueGrooveSeat(groove, tongue, joint).position }
return { cuts, seat }
```

### Reference fixture (for the geometry tests)

Two equal-thickness boards, coplanar, meeting along a long edge:

- **Groove board** `800 × 150 × 18`, at origin, unrotated, `grooveEdge = '+Y'` (its +Y long edge, at
  world y = 150) → `depthAx = 'y'`, `runAx = 'x'`, `narrowAx = 'z'`.
- **Tongue board** `800 × 150 × 18`, unrotated, placed on the +Y side with `tongueEdge = '-Y'`
  (its −Y long edge faces the groove board's +Y edge → normals anti-parallel).

With `tongueThickness = 6, tongueDepth = 8, clearance = 0`:

- Groove cut: `face '+Y'`, `size = {x:800, y:8, z:6}`, `position = {x:0, y:142, z:6}` (z centered:
  `18/2 − 6/2 = 6`).
- Shoulders (tongue board, `face '-Y'`): `shoulder = (18 − 6)/2 = 6`; each `size = {x:800, y:8, z:6}`;
  `−Z` at `position = {x:0, y:0, z:0}`, `+Z` at `position = {x:0, y:0, z:12}`. The remaining tongue is
  z ∈ [6,12] (thickness 6, centered), projecting y ∈ [0,8].
- Seat on the tongue board: T1 will hand-compute the exact seated `position` (tongue edge 8 mm into
  the groove board's +Y plane, thickness mid-planes aligned, length preserved).

**Additional required fixture — rotated tongue board (world-parity):** rotate the tongue board 180°
about Z (`rotation.z = 180`) so its local `-Y` edge still faces the groove board but its local length
runs anti-parallel to the groove board's. Assert the seat still closes the joint (tongue in groove,
mid-planes aligned) and the derived cuts still span the full shared length — catching any local-vs-world
axis assumption in the seat/cut math (the analog of the finger joint's flip fixture).

## Interaction

### `onAddTongueGroove(grooveHit, tongueHit)` in `useScene.ts`

Mirrors `onAddFingerJoint`. Resolve the groove board (first hit) and tongue board (second hit); bail if
not two distinct boards. Convert local normals via `localNormalToFaceString`; gate on
`isValidTongueGroove(groove, grooveEdge, tongue, tongueEdge)`. Seed defaults from the material:

```ts
const tongueThickness = clamp(Math.round(groove.thickness / 3), 3, groove.thickness - 2)
const tongueDepth = clamp(8, 3, Math.floor(Math.min(groove.width, tongue.width) / 2) - 1)
const clearance = 0
```

Label `Tongue & groove ${n}` (n = count of existing `tongue-groove` joints + 1). Build the
`TongueGrooveJoint`, `commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add
tongue & groove')` (single undo entry), `setSelectedId(groove.id)`. Extend `onRemoveJoint`'s kind-aware
label with `joint.kind === 'tongue-groove' ? 'Remove tongue & groove' : …`.

Also: add `onAddTongueGroove` to `UseSceneResult` (and the return object) so `App.tsx` can pass it to
`useInteractionMode`.

### `useAddTongueGroove` gesture (`src/scene/useAddTongueGroove.ts`)

Two-click state machine mirroring `useAddFingerJoint` exactly (same exported shape, renamed): first
click on a board sets `pendingA` (the groove board); second click on a **different** board validates via
`isValidTongueGroove` and calls `onAddTongueGroove(pendingA, hit)`. Same-board rejection →
`'Pick a different board for the tongue edge'`; invalid → `'Edges must be facing long edges of
equal-thickness boards'`. Exposes `tongueGrooveActive`, `pendingA`, `statusMessage`, `hoveredFace`,
`activateTongueGroove`, `cancelTongueGroove`, `onFaceClick`, `onFaceHover`. It imports
`isValidTongueGroove` directly from `tonguegroove.ts` (create gate === derive gate — the JP5/JP6
"no dead joints" lesson; no cycle, as this module isn't imported by `dado.ts`/`tonguegroove.ts`).

### 7th exclusive viewport mode (shortcut `t`) — via the coordinator

Post-refactor wiring, all in `useInteractionMode.ts` + two call sites:

- **`useInteractionMode.ts`:** add `'tongueGroove'` to the `InteractionMode` union; add
  `onAddTongueGroove` to `UseInteractionModeParams`; compose `const tongueGroove = useAddTongueGroove({
  parts, onAddTongueGroove: params.onAddTongueGroove })`; add it to the `activeMode` chain, the `setMode`
  cancel/activate lists (+ dep array), the `onFaceClick` / `onFaceHover` switches, the `sourceFace`
  (`tongueGroove.pendingA`) and `hoveredFace` chains, and `statuses.tongueGroove`.
- **`App.tsx`:** a keyboard `case e.key.toLowerCase() === 't'` → `setMode('tongueGroove')`; pass
  `onAddTongueGroove={onAddTongueGroove}` to `useInteractionMode`; pass Sidebar props
  `tongueGrooveActive={mode.activeMode === 'tongueGroove'}`, `onTongueGrooveToggle={() =>
  mode.setMode('tongueGroove')}`, `tongueGrooveStatus={mode.statuses.tongueGroove}`.
- **Viewport:** no change (routes through the coordinator's normalized bundle).

## Panel (`src/ui/sidebar.tsx` → `JointsPanel`)

A `j.kind === 'tongue-groove'` branch, mirroring the finger branch's structure:

- `isGroove = j.groovePartId === part.id`.
- `stale = groove?.kind === 'board' && tongue?.kind === 'board' ? !isValidTongueGroove(groove,
  j.grooveEdge, tongue, j.tongueEdge) : true` (import `isValidTongueGroove` at the top).
- Header (label + `isGroove ? 'Groove' : 'Tongue'` tag + remove ✕), a mate line, and a stale banner
  ("Joint stale — edges must be facing long edges of equal-thickness boards").
- If `isGroove`: `JointNumInput` **`Thk`** (`tongueThickness`, commit `Math.max(0.1, v)`),
  **`Depth`** (`tongueDepth`, `Math.max(0.1, v)`), **`Clear`** (`clearance`, `Math.max(0, v)`).
- Else: a read-only "Edit from `<groove label>`." hint.

All `onUpdateJoint` updater closures sit inside the `j.kind === 'tongue-groove'` narrow (the type-hole
invariant). Add the three toggle props (`tongueGrooveActive` / `onTongueGrooveToggle` /
`tongueGrooveStatus`) to `SidebarProps`, and a "Tongue & groove" toggle button after the Finger joint
button, following the identical `variant`/`className`/status-line pattern (prompt: "Click groove edge,
then tongue edge · Esc to cancel").

## Documentation

- `docs/superpowers/notes/2026-07-26-tongue-groove-joint-notes.md` — living implementation notes.
- `docs/keyboard-shortcuts.md` — a `T` row after the `B` row.
- `README.md` — a "Tongue & groove joint mode (`T`)" bullet after the Box/finger bullet.
- `project-structure.html` — `tonguegroove.ts` next to `fingerjoint.ts` in `src/geom/`, and
  `useAddTongueGroove.ts` next to `useAddFingerJoint.ts` in `src/scene/`.

## Testing Strategy

- **Geometry (`tonguegroove.test.ts`)** against the reference fixture:
  - `isValidTongueGroove`: valid edge pair; invalid for non-axis-aligned, a non-edge face
    (`±X` end / `±Z` broad face), non-facing edges (parallel not anti-parallel), and unequal thickness.
  - `computeGrooveCut`: dims/position, z-centering, clearance widens Z only, full length.
  - `computeTongueShoulders`: two cuts, symmetric `shoulder`, leaving a centered tongue of thickness
    `tongueThickness` and projection `tongueDepth`; full length.
  - `computeTongueGrooveSeat`: tongue seats `tongueDepth` into the groove, mid-planes align, length
    preserved; **idempotent** (re-derive → same position, no drift).
  - `deriveTongueGroove`: 3 cuts (1 groove + 2 shoulders) split across the two boards + a seat on the
    tongue board; stale → `null`.
  - **Rotated fixture** (tongue board `rotation.z = 180`): seat still closes the joint; cuts span the
    full shared length.
- **Dispatch** (`dado.test.ts`): `deriveJoint` routes `tongue-groove` to `deriveTongueGroove`.
- **Coordinator** (`useInteractionMode.test.ts`): a case asserting `setMode('tongueGroove')` activates
  it and cancels the others (mirroring the existing per-mode cases).
- **Scene** (`useScene.test.ts`): `onAddTongueGroove` creates the joint + cuts on both boards + seat in
  one undo entry; undo reverses it.
- **Gesture** (`useAddTongueGroove.test.ts`): two-click create; same-board rejection; invalid-edge
  rejection (with status assertions).
- **Panel** (`sidebar.test.tsx`): groove board shows `Thk`/`Depth`/`Clear`; tongue board shows the hint.
- OCCT stays untouched; no live-kernel tests. Interactive 3D verification is a human step (OCCT WASM
  doesn't boot headless).

## Task Breakdown (for `writing-plans`)

1. **T1** — `TongueGrooveJoint` type (not yet in the union) + `tonguegroove.ts` geometry + tests
   (standalone; hand-compute the seat + cut expected values against the reference & rotated fixtures).
2. **T2** — union extension + `deriveJoint` case + `jointInvolves` arm + `parseFile` v10 default +
   dispatch test.
3. **T3** — `onAddTongueGroove` + kind-aware remove label + scene test.
4. **T4** — `useAddTongueGroove` two-click gesture + tests.
5. **T5** — 7th mode in `useInteractionMode` (registry + `App.tsx` keyboard `t` + Sidebar prop
   pass-through) + coordinator test.
6. **T6** — `JointsPanel` tongue-groove branch + Sidebar toggle button + panel tests.
7. **T7** — docs + full verify (`typecheck && lint && test`) + build + push.

## Key Invariants & Risks

- **`shapeKey()` unaffected:** T&G cuts are ordinary `BoxCut`s already keyed by the cut list; no change
  to `src/scene/utils.ts`.
- **Create gate = derive gate:** the gesture and `onAddTongueGroove` both validate with
  `isValidTongueGroove`, so no dead/stale joints can be created — carrying forward the JP5/JP6 lesson.
- **No import cycle:** `tonguegroove.ts` type-only-imports from `dado.ts`; `dado.ts` runtime-imports
  `deriveTongueGroove`. The gesture/scene/panel import the runtime `isValidTongueGroove` from
  `tonguegroove.ts` (none of those is imported by `dado.ts`).
- **Seat idempotence:** `computeTongueGrooveSeat` returns an absolute position derived from the groove
  board's fixed pose + joint params, applied as a delta from the tongue board's current edge — re-deriving
  with unchanged params must not drift it (as with `computeDadoSeat` / `computeFingerSeat`).
- **Equal-thickness invariant:** the centered tongue only meets the centered groove when mid-planes
  coincide; `isValidTongueGroove` enforces equal thickness, so the seat's mid-plane alignment is always
  geometrically valid.
- **Euler XYZ assumption:** like the rest of the joint geometry, world-direction math assumes
  `rotationOrder === 'XYZ'`; non-axis-aligned boards are rejected by `isValidTongueGroove`.
- **`jointInvolves` fallthrough:** the existing final `return joint.partAId … || joint.partBId …`
  narrows to `FingerJoint`/`HalfLapJoint`; without the explicit `tongue-groove` arm the extended union
  would be a type error (T&G has no `partAId`). The arm is added in T2.
- **Risk — the edge seat is the only genuinely new math.** It is a strictly simpler case of
  `computeDadoSeat` (fixed axes: depth = Y, narrow = Z, run = X). Mitigation: derive it against the
  reference fixture with hand-computed expected values in T1, exactly as the dado/M&T/finger seats were
  validated, plus the rotated fixture for world-parity.

## Deferred (not JP7)

- **Stopped / blind T&G** (groove inset from the ends, like the dado's `stopStart`/`stopEnd`). Not
  needed for edge glue-ups; add as its own slice if a use case appears.
- **Off-center tongue** (`offset` param) and **unequal-thickness** handling. Both add parameters and
  cross-cases for no v1 benefit; revisit only on demand.
