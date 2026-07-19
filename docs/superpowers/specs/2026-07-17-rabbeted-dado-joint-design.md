# Rabbeted (Tongue-and-Dado) Joint (JP2) — Design Spec

**Date:** 2026-07-17
**Status:** Approved design, ready for implementation planning
**Topic:** Add the **rabbeted** profile to the dado joint — the first joint that derives
geometry on *both* parts — by generalizing `reconcileJoints` into a joint-agnostic
distributor fed by a pure `deriveJoint`.

**Depends on:** JP1 (`docs/superpowers/specs/2026-07-16-parametric-dado-joint-design.md`),
which introduced the first-class `Joint`, `reconcileJoints`, `src/geom/dado.ts`, the
two-click `useAddJoint` gesture, and the sidebar `JointsPanel`.

---

## 1. Purpose & context

JP1's dado cuts **one** part (a groove on the housing) and seats the other uncut. The
rabbeted (tongue-and-dado) profile cuts **both**: a narrower groove on the housing, and a
rabbet on the housed board's end that leaves a **tongue** which seats in that groove. This is
the first joint to exercise two-sided derivation, so it is the real test of the JP1
framework's extensibility — and it converts the reconciler from "one hardcoded groove" into a
generic distributor that future joint variants (stopped dado, etc.) extend by touching only
`deriveJoint`.

### Decisions locked during brainstorming

1. **`profile` field on the existing `DadoJoint`** (not a new `RabbetedDadoJoint` kind). One
   joint type, "upgrade in place" UX, minimal duplication.
2. **One-sided offset tongue** (classic tongue-and-dado), parameterized by `tongueThickness`;
   `tongueLength` is **derived** = the joint's `depth` (tongue bottoms as the shoulder seats).
3. **Generic `deriveJoint` distributor** (Approach 1): a pure function returns a *list* of
   `{partId, cut}` plus a seat; `reconcileJoints` just scatters them. All joint-specific
   geometry stays in `deriveJoint`.
4. **No new gesture:** create a plain dado with `J`, then flip **Profile → Rabbeted** in the
   sidebar.

---

## 2. Scope & assumptions

**In scope:** the rabbeted profile for a board-to-board dado — a narrower housing groove plus a
one-sided rabbet/tongue on the housed end, kept in sync by the generalized reconciler, edited
from the sidebar, with undo/redo and file persistence inherited from JP1.

**v1 boundaries (in addition to JP1's axis-aligned / perpendicular / boards-only rules):**

- The rabbet reduces the housed board's **thickness** (local Z). `housedEnd` must therefore be
  a length/width end, not a thickness end. If `housedEnd` resolves to the local-Z axis,
  rabbeted is treated as **plain** (no tongue emitted) — documented, not silently wrong.
- **One-sided** rabbet only (tongue flush to one face). Centered tongue is out of scope.
- `tongueLength` is always `= depth` (not independently settable).

**Non-goals:** centered/two-sided tongues, stopped+rabbeted combinations, tongue chamfers,
non-orthogonal joints, cylinders.

---

## 3. Data model

`DadoJoint` gains three fields (`src/scene/types.ts`):

```ts
export interface DadoJoint {
  kind: 'dado'
  // existing: id, label, housingPartId, housingFace, housedPartId, housedEnd,
  //           offset, depth, clearance
  profile: 'plain' | 'rabbeted'   // NEW
  tongueThickness: number          // NEW — tongue/groove width when rabbeted
  rabbetFace: '+Z' | '-Z'          // NEW — housed-board local thickness face the rabbet
                                   //       removes from; tongue sits flush to the opposite face
}
```

The three new fields are **always present** (the accepted "looser type" of Option A) but only
affect geometry when `profile === 'rabbeted'`. A `plain` joint behaves byte-identically to
JP1.

**File format:** `FILE_FORMAT_VERSION` `4 → 5`. `parseFile` defaults `profile: 'plain'`,
`rabbetFace: '+Z'`, and `tongueThickness: 6` (a small positive value; it is dormant while
`profile === 'plain'` and re-defaulted to `housedThickness / 2` the moment the user first
flips to rabbeted, so the exact legacy value is immaterial) on any joint lacking them.
Existing (v4) files load as all-plain, unchanged.

**Creation defaults** (`onAddJoint`, unchanged gesture): `profile: 'plain'`,
`tongueThickness: round(housedThickness / 2)`, `rabbetFace: '+Z'`. The tongue values sit
dormant until the user flips the profile.

---

## 4. Geometry

New pure surface in `src/geom/dado.ts` — one entry point plus one new cut function. Existing
`isValidDadoSeat` / `deriveDadoAxes` / `computeDadoOffset` / `defaultDadoDepth` are unchanged.

```ts
type DerivedCut = { partId: PartId; cut: BoxCut }
type DeriveResult = { cuts: DerivedCut[]; seat: { partId: PartId; position: Vec3 } }

export function deriveJoint(joint: Joint, parts: Part[]): DeriveResult | null // null = invalid/stale
export function computeRabbet(housing: BoardPart, housed: BoardPart, joint: DadoJoint): BoxCut
```

### `deriveJoint` (dado)

1. Resolve `housing` / `housed` boards. If either is missing/non-board, or
   `!isValidDadoSeat(...)` → **return `null`** (the reconciler preserves last-good).
2. `cuts = [{ partId: housing.id, cut: computeDadoGroove(housing, housed, joint) }]`.
3. If `profile === 'rabbeted'` **and** `faceAxes(housedEnd).depth !== 'z'` (not a thickness
   end) → `cuts.push({ partId: housed.id, cut: computeRabbet(housing, housed, joint) })`.
4. `seat = { partId: housed.id, position: computeDadoSeat(housing, housed, joint).position }`.
5. Return `{ cuts, seat }`.

### `computeDadoGroove` change (one line)

Groove width along the narrow axis becomes:

```ts
const width = (joint.profile === 'rabbeted' ? joint.tongueThickness : housed.thickness) + joint.clearance
```

Everything else (depth, run-axis full span, `offset` centering, `±face` inset, derived id
`cut_${joint.id}`, `sourceJointId`) is unchanged.

### `computeDadoSeat` change (tongue-centering)

For a rabbeted joint the point seated on the groove is the **tongue center**, not the board
center. The existing seat computes the housed end-face center at local `(len, W/2, T/2)`;
for rabbeted, replace the **thickness** component (`T/2`) with the tongue center:

```
tongueCenterZ = rabbetFace === '+Z' ? tongueThickness / 2 : thickness - tongueThickness / 2
```

Only the thickness (→ narrow-axis) component changes; the end→groove-bottom shift along the
face normal and the center→`offset` shift along the narrow axis are otherwise identical. For
`plain`, the target stays `T/2` (JP1 behavior). Because the thickness axis maps to the world
narrow axis, this shift aligns the tongue with the groove; it does not affect the face-normal
(seating-depth) component.

### `computeRabbet` (housed local frame)

Let `dim = { x: length, y: width, z: thickness }` of the housed board,
`seatAx = faceAxes(joint.housedEnd).depth` (∈ `{x,y}` per the v1 boundary),
`widthAx` = the single axis in `{x,y}` that is neither `seatAx` nor `z`,
`T = housed.thickness`, `t = clamp(joint.tongueThickness, 0.1, T − 0.1)`,
`len = clamp(joint.depth, 0.1, dim[seatAx] − 0.1)`. Build a `BoxCut` that removes the corner
strip:

```
size[seatAx]  = len
size[widthAx] = dim[widthAx]                                // full span
size.z        = T − t                                       // removed thickness
position[seatAx]  = joint.housedEnd.startsWith('+') ? dim[seatAx] − len : 0
position[widthAx] = 0
position.z        = joint.rabbetFace === '+Z' ? t : 0       // remove from the chosen face
```

Return `{ kind:'box', id:`cut_${joint.id}_rabbet`, label:`${joint.label} tongue`,
face: joint.rabbetFace, position, size, sourceJointId: joint.id }`. `face` is cosmetic — the
geometry lives in `position`/`size`; `makeShape`'s `makeCut` subtracts `[position,
position+size]` exactly as for any box cut, so **no OCCT/mesh/export/drawing changes**.

**Determinism:** groove id `cut_${joint.id}`, rabbet id `cut_${joint.id}_rabbet`, both carry
`sourceJointId = joint.id` — so the reconciler strips both when regenerating, and every derive
is idempotent.

---

## 5. Reconciler generalization (`src/scene/reconcileJoints.ts`)

`reconcileJoints` stops importing `isValidDadoSeat`/`computeDadoGroove`/`computeDadoSeat`
directly and calls `deriveJoint` instead, distributing its output:

```
reconcileJoints(scene):
  jointIds = new Set(scene.joints.map(j => j.id))

  // 1. Strip orphan derived cuts (sourceJointId set, joint gone) — unchanged.
  parts = scene.parts.map(board => ({ ...board,
            cuts: board.cuts.filter(c => !(c.kind==='box' && c.sourceJointId && !jointIds.has(c.sourceJointId))) }))

  // 2. For each joint: derive → distribute, or preserve last-good.
  for (joint of scene.joints):
    result = deriveJoint(joint, parts)
    if (result == null) continue                          // stale/invalid → leave existing cuts + position
    // remove this joint's derived cuts from ALL boards, then scatter the fresh ones
    parts = parts.map(board => ({ ...board,
              cuts: board.cuts.filter(c => !(c.kind==='box' && c.sourceJointId === joint.id)) }))
    for ({partId, cut} of result.cuts):
      parts = parts.map(p => p.id===partId && p.kind==='board' ? { ...p, cuts:[...p.cuts, cut] } : p)
    parts = parts.map(p => p.id===result.seat.partId ? { ...p, position: result.seat.position } : p)

  return { ...scene, parts }
```

This preserves **all four JP1 invariants** — idempotence, orphan cleanup, stale-preserves-
last-good, user-cut passthrough — so the existing JP1 `reconcileJoints` tests remain a
regression guard (plain dado still yields one cut + a seat). The only behavioral change is
multi-cut distribution and stripping a joint's cuts across *both* boards.

---

## 6. UI (`src/ui/JointsPanel.tsx`)

On the **housing** side of a joint's panel, above the existing Depth / Clearance / Offset:

- **Profile** — a `Select` (`Plain` / `Rabbeted`) → `onUpdateJoint(id, j => ({ ...j, profile }))`.
- When `profile === 'rabbeted'`, two more controls render:
  - **Tongue** — numeric input for `tongueThickness` (debounced; committed value clamped to
    `[0.1, housedThickness − 0.1]` inside the updater).
  - **Rabbet side** — a `Select` (`Face +Z` / `Face −Z`) → `rabbetFace`.

No new gesture, no new mode button. The rabbet cut that now appears on the **housed** board
renders automatically as a read-only `"{label} tongue (joint)"` row in that board's Cuts list
— JP1's `sourceJointId` read-only rendering already covers it, so the housed board needs **no
new UI code**. `onUpdateCut`/`onRemoveCut`/`onLinkCuts` already reject `sourceJointId` cuts.

---

## 7. Testing (seam-first)

- **`src/geom/dado.test.ts`** (extend):
  - `computeDadoGroove` width = `tongueThickness + clearance` when rabbeted (narrower than plain).
  - `computeRabbet`: removes `T − t` on the correct face for both `rabbetFace` values, `len =
    depth`, flush at the `housedEnd` end, full width; `id` ends `_rabbet`, `sourceJointId` set.
  - `computeDadoSeat`: rabbeted target lands the **tongue center** on the groove center (not
    the board center); plain unchanged.
  - `deriveJoint`: 1 cut (plain) / 2 cuts (rabbeted) tagged to housing/housed / `null` (stale);
    thickness-end housedEnd → falls back to 1 cut (plain).
- **`src/scene/reconcileJoints.test.ts`** (extend): a rabbeted joint materializes a groove on
  the housing **and** a rabbet on the housed board (both `sourceJointId`), idempotent; flipping
  `profile` back to `plain` removes the rabbet cut; JP1 cases still pass.
- **`src/scene/useScene.test.ts`** (extend): `onUpdateJoint` flipping `profile` to `rabbeted`
  adds the housed rabbet cut in a single undo entry; undo restores.
- **`src/ui/sidebar.test.tsx`** (extend): a rabbeted joint shows Tongue + Rabbet-side controls;
  a plain joint hides them.

---

## 8. Files touched

**Modified:**
- `src/scene/types.ts` — `profile` / `tongueThickness` / `rabbetFace` on `DadoJoint`.
- `src/scene/useFile.ts` — `FILE_FORMAT_VERSION` `4 → 5`; `parseFile` joint-field defaults.
- `src/geom/dado.ts` — `deriveJoint`, `computeRabbet`, `computeDadoGroove` width branch,
  `computeDadoSeat` tongue-centering; `+ dado.test.ts`.
- `src/scene/reconcileJoints.ts` — generic distributor via `deriveJoint`; `+
  reconcileJoints.test.ts`.
- `src/scene/useScene.ts` — `onAddJoint` sets the new defaults; `+ useScene.test.ts`.
- `src/ui/JointsPanel.tsx` — profile + tongue controls; `+ sidebar.test.tsx`.
- `docs/keyboard-shortcuts.md` (no change expected), `README.md`, `project-structure.html`,
  `docs/superpowers/notes/2026-07-17-rabbeted-dado-joint-notes.md`.

**Unchanged:** `occt.ts`, `occt.worker.ts`, `mesh.ts`, STL/STEP export, `drawing.ts`,
`useAddJoint.ts`, `src/render/viewport.tsx`, `src/App.tsx`.
