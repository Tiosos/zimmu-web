# Parametric Dado Joint (JP1) — Design Spec

**Date:** 2026-07-16
**Status:** Approved design, ready for implementation planning
**Topic:** First-class parametric `Joint` in the scene, with the plain through-dado as its first concrete kind.

---

## 1. Purpose & context

The strategic plan's core differentiator is "a parametric joint library that knows how
parts attach and updates geometry automatically when dimensions change." Today the app has
the raw ingredients — box/mitre/notch/bore cuts, and `CutDef.pairedCutId` linking — but a
joint is still assembled **manually**: add a box cut on board A, add a mating box cut on
board B, then link them by hand via the sidebar. `pairedCutId` only keeps the two cuts'
u/v **sizes** in sync; it generates no geometry and positions nothing.

This spec introduces the first **first-class `Joint`**: a scene-level object that references
two parts, owns the joint's parameters, **derives** the cut geometry on the housing part, and
**drives** the housed part's seated placement — re-deriving both whenever a participating
part's dimensions or the joint's parameters change. The plain **through dado** is the first
(and, for this slice, only) concrete kind; the framework is built to grow into stopped and
rabbeted variants later.

This is "JP1" — the first joint-platform slice, in the spirit of the dowel series (SP1–SP4).

### Decisions locked during brainstorming

1. **First-class `Joint` entity** in `Scene.joints` (not a `pairedCutId` extension).
2. **Plain through dado only** for v1; the `Joint` union is extensible to stopped/rabbeted.
3. **Joint drives the housed board's seating** (owns its translation, never its rotation).
4. **Two-click creation gesture**: click 1 = housing face, click 2 = housed board's end.
5. **Materialized derived cuts** (Approach 1): the joint authors a tagged `BoxCut` on the
   housing part; the entire existing `cuts → shapeKey → OCCT → mesh → drawings → export →
   cutting-list` pipeline consumes it unchanged.

---

## 2. Scope & assumptions

**In scope:** a plain through-dado joint between two **board** parts, created by a two-click
gesture, that materializes a groove on the housing board and seats the housed board into it,
staying in sync on dimension/parameter changes, with sidebar editing, undo/redo, cascade on
delete, and file persistence.

**v1 assumptions (explicit boundaries, enforced numerically — not silently wrong):**

- Both parts are **boards**. Cylinders are out of scope (no dowel-in-dado).
- Both parts are **axis-aligned** (world rotations at multiples of 90°) and the housed board
  stands **perpendicular** to the housing face, its clicked end facing the groove. Enforced
  by `isValidDadoSeat` (§5.B). Creation that fails it is **rejected** with a message; a later
  rotation that breaks it flags the joint **stale** (last-good geometry frozen, sidebar warns).
- The groove runs the **full width** across the housing board (through dado) — no stop, no tongue.
- The joint owns the housed board's **translation** only, never its rotation.

**Non-goals for v1:** stopped/blind dado, rabbeted/tongue-and-dado, board-to-board angle
solving, multi-joint constraint networks (a board in two joints just takes the last reconcile),
cylinders, non-orthogonal orientations.

---

## 3. Data model

New/changed types in `src/scene/types.ts`:

```ts
export interface DadoJoint {
  kind: 'dado'
  id: string              // "joint_<uuid>"
  label: string           // "Dado 1"
  housingPartId: PartId   // board that carries the groove
  housingFace: Face       // face the groove is cut into (e.g. '+Z')
  housedPartId: PartId    // board that seats into the groove
  housedEnd: Face         // the housed board's end face that seats in
  offset: number          // mm — groove center along the housing face's narrow axis (housing-local)
  depth: number           // mm — groove depth into the housing board
  clearance: number       // mm — added to groove width (housedThickness + clearance); default 0
}

export type Joint = DadoJoint   // union grows: | StoppedDadoJoint | RabbetedDadoJoint
```

- `Scene` gains `joints: Joint[]` alongside `parts` / `materials` / `hardware`.
- `BoxCut` gains optional `sourceJointId?: string`. A cut carrying this tag is **derived** —
  generated and owned by a joint, read-only in the sidebar.
- `sourceJointId` does **not** enter `shapeKey()` (it is not geometry), but the derived cut's
  `position` / `size` do — so when a joint updates its groove, `shapeKey` changes and OCCT
  rebuilds through the existing path.

**Why these fields:** everything the joint needs to regenerate deterministically without live
raycasting is stored. The groove's *run axis* vs. *narrow axis* is **derived** at reconcile
time from `housingFace` + the two parts' axis-aligned orientations — not stored — so it stays
correct if a part is flipped 90°. `offset` / `depth` / `clearance` are the three user-editable
parameters.

### File format

`FILE_FORMAT_VERSION` 2 → 3 (`useFile.ts`). Loading a v2 file defaults `scene.joints` to `[]`.
Derived cuts are persisted like any cut (they carry `sourceJointId`); after load the scene is
reconciled once (§5) for consistency. Floats round to 6 dp as today.

---

## 4. Geometry & placement math

Lives in a new pure module `src/geom/dado.ts` — THREE-typed but browser-free, unit-tested
directly (same pattern as `snapMath.ts` / `mitre.ts` / `dowelCut.ts`). The OCCT worker never
sees a `Joint`; it only ever sees the materialized `BoxCut`.

**Conventions recap.** A board's local box is `[0,length] × [0,width] × [0,thickness]`
→ X=length, Y=width, Z=thickness. `faceAxes(face)` → `{depth, u, v}` axis labels
(`'x'|'y'|'z'`). A `BoxCut` subtracts a box spanning `[position, position+size]` in local
coords. World placement is `composeWorldMatrix(part)` (Euler XYZ). `computeLocalFaceCenter`
gives a face's local center.

### A. Creation inputs (from the two `FaceHit`s)

- Housing click → `housingPartId`, `housingFace` (axis-round of `localFaceNormal`), the
  housing-local hit point.
- Housed click → `housedPartId`, `housedEnd` (axis-round of its `localFaceNormal`).

### B. Validity condition (perpendicular seat)

In world space the housed end must face into the housing face:

```
dot(housedEndNormal_world, housingFaceNormal_world) ≈ -1     (tolerance ~0.01)
```

Fail → creation rejected with a message ("housed board must be perpendicular to the housing
face"); a later rotation that breaks it → joint flagged stale.

### C. Run axis vs. narrow axis

Let `{depth: dAx, u, v} = faceAxes(housingFace)`. The housed board's two in-plane axes (its
local Y = width, Z = thickness) are, under axis-alignment, each parallel to the housing's `u`
or `v`. The **narrow axis** = whichever of `{u, v}` (world) is parallel to the housed board's
**thickness** direction (local Z rotated to world); the **run axis** is the other. Narrow
width = `housedThickness + clearance`; the groove spans the run axis fully.

### D. Groove `BoxCut` (housing local)

With `dim = {x: length, y: width, z: thickness}`:

```
size[dAx]      = depth
size[narrowAx] = housedThickness + clearance
size[runAx]    = dim[runAx]                                            // full span → through dado
position[dAx]      = housingFace.startsWith('+') ? dim[dAx] - depth : 0   // flush at face, inward
position[runAx]    = 0
position[narrowAx] = offset - size[narrowAx] / 2
```

**Worked example — housing `+Z` face, housed board standing along X:** `dAx=z, u=x, v=y`.
Board thickness (world) lands on the housing's `x` axis → `narrowAx=x, runAx=y`. Groove =
`size {x: thk+clr, y: width, z: depth}`, `position {x: offset−(thk+clr)/2, y: 0, z: thickness−depth}`
— a channel across the full width, `depth` deep from the top, `thk` wide, centered at `offset`
along the length. This is exactly a `BoxCut` tagged `sourceJointId`.

### E. `offset` (stored parameter)

At creation = the housed board's centroid transformed into the housing's local frame,
`narrowAx` component, clamped to `[size[narrowAx]/2, dim[narrowAx] − size[narrowAx]/2]` so the
groove stays inside the board. Editable in the sidebar to slide the joint along the housing board.

### F. Housed-board seating (world placement output)

Mirrors `computeSnapTransform`'s translate-by-face-center-delta; rotation untouched.

1. `endCenterWorld = worldMatrix(housed) · computeLocalFaceCenter(housedEndLocalNormal, housed)`.
2. The orthonormal world basis `(housingFaceNormal, narrowAxisWorld, runAxisWorld)` decomposes
   any world point. Build `desiredEndCenter` from `endCenterWorld` by replacing two components:
   - **along `housingFaceNormal`:** land on the groove-bottom plane (through the housing
     groove-bottom point, i.e. `depth` inside the face);
   - **along `narrowAxisWorld`:** set to the groove center (world point at housing-local
     `narrowAx = offset`);
   - **along `runAxisWorld`:** unchanged (through dado — board slides freely; preserve the
     user's position).
3. `housed.position += (desiredEndCenter − endCenterWorld)`.

### G. Defaults at creation

`depth = clamp(round(dim[dAx] / 3), 3, dim[dAx] − 1)`; `clearance = 0`; `label = "Dado {n}"`.

### H. Pure function surface (testable seam)

```ts
isValidDadoSeat(housing, housingFace, housed, housedEnd): boolean
deriveDadoAxes(housing, housed, housingFace): { narrowAx: 'x'|'y'|'z'; runAx: 'x'|'y'|'z' }
computeDadoGroove(housing, housed, joint): BoxCut     // the derived cut (with sourceJointId)
computeDadoSeat(housing, housed, joint): { position: Vec3 }   // housed world placement
```

Both `computeDadoGroove` and `computeDadoSeat` take the **housed part** (not just its
thickness): deriving the narrow/run axes needs the housed board's orientation, and
`computeDadoGroove` internally calls `deriveDadoAxes`. `useScene` calls both during
reconciliation.

---

## 5. Interaction — `useAddJoint`

A third face-click state machine in `src/scene/useAddJoint.ts`, mirroring `useSnap` / `useAddCut`:

```ts
interface AddJointState {
  jointActive: boolean
  pendingHousing: FaceHit | null   // set after click 1
  statusMessage: string | null     // rejection reason, shown transiently
  hoveredFace: FaceHit | null
  activateJoint(): void            // toggle mode
  cancelJoint(): void
  onFaceClick(hit: FaceHit): void
  onFaceHover(hit: FaceHit | null): void
}
```

- **Click 1** — must be a **board** face → store as `pendingHousing`. (Cylinder face → ignore.)
- **Click 2** — must be a board, **not the same part**, and pass
  `isValidDadoSeat(housing, housingFace, housed, housedEnd)`. Valid → call
  `onAddJoint(housingHit, housedHit)`, reset `pendingHousing`, exit mode. Invalid (same part /
  off-axis / not perpendicular) → set `statusMessage`, clear `pendingHousing` so the user
  retries click 1.
- **`App.tsx` wiring:** new `J` shortcut + a `handleActivateJoint` that cancels snap *and* cut
  (matching the existing mutual-exclusion pattern in `handleActivateCut` / `handleActivateSnap`);
  `Escape` also cancels joint mode. `Viewport` gets `jointActive` + `onFaceClickJoint` /
  `onFaceHoverJoint` and highlights the hovered face like cut mode. Toolbar button in the
  sidebar next to Snap / Cut.

---

## 6. State lifecycle & reconciliation — `useScene`

One **pure, idempotent** reconciler is the heart of "materialized derived cuts":

```ts
reconcileJoints(scene: Scene): Scene
```

For each part it removes derived cuts (`sourceJointId`) whose joint no longer exists (orphans).
For each joint: if `isValidDadoSeat` holds, it computes `computeDadoGroove` and
**replaces-or-inserts** that cut (keyed by `sourceJointId`) on the housing part, and sets the
housed part's `position` via `computeDadoSeat`. If **invalid** (stale), it leaves that joint's
existing derived cut and the housed position **untouched** (last-good preserved).

Every joint-affecting mutation flows through one helper that keeps undo single-entry and atomic:

```
before = sceneRef.current
after  = reconcileJoints( mutate(before) )
setScene(after)
push({ label, coalesceKey?, undo: () => setScene(before), redo: () => setScene(after) })
```

New `UseSceneResult` methods (all via that helper):

- **`onAddJoint(housingHit, housedHit)`** — builds the `DadoJoint` with §4.G defaults, appends
  to `scene.joints`, reconciles. Label `"Add dado"`.
- **`onUpdateJoint(jointId, updater)`** — edits `depth` / `clearance` / `offset`; reconciles.
  Label `"Edit dado"`, `coalesceKey: 'joint-{id}'` (matches dimension-input coalescing feel).
- **`onRemoveJoint(jointId)`** — drops the joint; reconcile removes its orphaned groove. The
  housed part keeps its seated position. Label `"Remove dado"`.
- **`onRemove(partId)` (modified)** — also removes any joint referencing that part (cascade),
  then reconciles. Whole-scene snapshot for undo.
- **`onUpdate(partId, …)` (modified)** — if the part participates in a joint, route through the
  reconcile helper (whole-scene snapshot) so a resize/move re-derives the groove + re-seats;
  otherwise keep today's single-part fast path unchanged.
- **`replaceScene` (modified)** — reconcile once after load (idempotent safety).

Because derived cuts are real cuts on parts, the geometry effect (`shapeKey`) rebuilds the
housing automatically; the housed part's new `position` is applied by the Viewport with no
OCCT rebuild. `undo` / `redo` restore pre-reconciled whole-scene snapshots, so there are no
double-steps.

**Coalescing correctness:** the helper reads `before = sceneRef.current` fresh each call. When
`push` coalesces (same `coalesceKey` as the previous entry), it keeps the *first* entry's
`undo` and takes the *latest* `redo`/`label` — so consecutive joint-parameter edits collapse
into one undo step exactly as board dimension edits do today.

---

## 7. Sidebar UI

In the selected part's `EditPanel`, a new **Joints** subsection listing every joint the part
participates in:

- Role label ("Housing" / "Housed") + the mating part's name.
- **Housing side:** numeric inputs for **Depth**, **Clearance**, **Offset** (debounced, via
  `onUpdateJoint`, matching existing dimension inputs).
- **Housed side:** read-only summary — params are edited from the housing side (single source
  of truth).
- A **Remove joint** button.
- **Stale banner** when `isValidDadoSeat` currently fails ("Joint stale — housed board is no
  longer perpendicular").

The derived groove appears in the housing's **Cuts** list but **read-only** — greyed, no
size/position inputs, labeled "Dado N (joint-controlled)". `onRemoveCut` / `onLinkCuts` /
`onUpdateCut` reject cuts carrying `sourceJointId` (guard at the top), so a derived cut can't
be hand-edited, unlinked, or paired.

---

## 8. Edge cases

- **Delete a participating part** → cascade-removes the joint + groove (§6). Undo restores both.
- **Off-axis rotation** → stale; last-good geometry frozen; banner shown. Rotating back
  re-validates and regenerates.
- **Offset / depth out of range** → clamped in `computeDadoGroove` (groove stays inside the
  board; `depth ≤ thickness − 1`).
- **Two joints on one board** → each owns its own `sourceJointId` cut; independent. No
  constraint network — if two joints fight over the same housed part's position, the last
  reconcile wins. Documented v1 limitation.
- **Load a v2 file** → `joints` defaults to `[]`; nothing derived, behaves as today.
- **Duplicate a part** (`onDuplicate`) → joints are **not** cloned (a joint references two
  specific parts); the clone's copied derived cuts are stripped (drop cuts with
  `sourceJointId`), same spirit as the existing `pairedCutId: undefined` reset.

---

## 9. Testing (seam-first, per repo convention)

- **`dado.test.ts`** (pure, no OCCT): `isValidDadoSeat` (perpendicular pass / off-axis fail),
  `deriveDadoAxes` (narrow = thickness for each housing face), `computeDadoGroove` (size /
  position incl. clamps and ± face inset), `computeDadoSeat` (end lands on groove-bottom plane,
  centered on offset, run-axis preserved).
- **`reconcileJoints` tests**: idempotence (`reconcile(reconcile(s))` equals `reconcile(s)`),
  orphan cleanup, stale-preserves-last-good, valid-regenerates.
- **`useScene` tests** (mock worker, per repo pattern): add / update / remove joint each = one
  undo entry; resize housing re-derives groove in one entry; delete participating part
  cascades + single undo restores; derived-cut read-only guards.
- **`useAddJoint` tests** (pure state machine): click 1 → pending; click 2 valid → `onAddJoint`;
  click 2 invalid → `statusMessage`, pending cleared.

---

## 10. Files touched

**New:**
- `src/geom/dado.ts` + `src/geom/dado.test.ts` — pure geometry/placement math.
- `src/scene/useAddJoint.ts` + `src/scene/useAddJoint.test.ts` — creation state machine.

**Modified:**
- `src/scene/types.ts` — `DadoJoint`, `Joint`, `Scene.joints`, `BoxCut.sourceJointId`.
- `src/scene/useScene.ts` — `reconcileJoints`, reconcile-commit helper, `onAddJoint` /
  `onUpdateJoint` / `onRemoveJoint`, cascade in `onRemove`, joint-aware `onUpdate`, reconcile
  in `replaceScene`; `+ src/scene/useScene.test.ts`.
- `src/scene/utils.ts` — confirm `shapeKey` ignores `sourceJointId` (no change expected;
  covered by test).
- `src/scene/useFile.ts` — `FILE_FORMAT_VERSION` 2 → 3; v2 → `joints: []` default.
- `src/App.tsx` — `useAddJoint` wiring, `J` shortcut, mode mutual-exclusion, Viewport/Sidebar props.
- `src/render/viewport.tsx` — `jointActive` + joint face click/hover + hover highlight.
- `src/ui/sidebar.tsx` — Joints subsection, joint toolbar button, read-only derived-cut rows.
- `docs/keyboard-shortcuts.md` — add `J`.
- `README.md`, `project-structure.html` — reflect joints.
- `docs/superpowers/notes/2026-07-16-parametric-dado-joint-notes.md` — living implementation notes.
