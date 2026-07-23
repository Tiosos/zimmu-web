# Mortise & Tenon Joint (JP5) — Design Spec

**Date:** 2026-07-23
**Status:** Approved design, ready for implementation planning
**Topic:** Add a **mortise & tenon** joint — a mortise board carries a blind (or through) rectangular
pocket; the mating board's end becomes a **4-shoulder centered tenon** that seats into the pocket.

**Depends on:** JP1–JP4, which built the first-class `Joint`, the polymorphic `deriveJoint`
(`switch (joint.kind)`), optional `DeriveResult.seat`, the joint-agnostic `reconcileJoints`, the
per-joint-type two-click add-modes, and the polymorphic `JointsPanel`.

---

## 1. Purpose & context

The mortise & tenon is the marquee woodworking joint and the fifth in the library (after plain,
rabbeted, and stopped dados, and the half-lap). It is **asymmetric** — like the dado — so it mirrors
the dado's housing/housed structure closely and reuses its seat/orientation math:

- A **mortise board** carries a rectangular pocket cut into one **face**.
- A **tenon board**'s **end** is reduced on all four sides to a central rectangular tongue that seats
  into the pocket; the tenon **shoulders** sit flush against the mortise face.

It exercises geometry the framework hasn't yet: a **fully-internal blind pocket** and a **multi-cut
tenon** (up to four shoulder strips). It reuses `isValidDadoSeat` directly and mirrors
`deriveDadoAxes` / `computeDadoOffset` / `computeDadoSeat` (extended from 1-axis to 2-axis centering).

### Decisions locked during brainstorming

1. **4-shoulder centered tenon** (canonical) — a central `tenonThickness × tenonWidth` tongue inset
   from the end cross-section on all four sides. Full-width/full-thickness degrade gracefully (a
   shoulder strip vanishes when its margin is 0).
2. **Default formulas:** `tenonThickness = round(tenon.thickness / 3)`,
   `tenonWidth = tenon.width − 2·tenonThickness`, `tenonLength = round(mortise.thickness · 2/3)`.
3. **Blind by default**, with a `through` toggle (pocket spans the full mortise-board thickness).
4. **Auto-derived, editable 2-D mortise position** (`offsetU` / `offsetV` on the face's two in-plane
   axes) — derived at creation from the tenon board's placement, like the dado's 1-D `offset`.
5. **Mirror the existing add-mode pattern** for a 5th viewport mode (shortcut `m`) — *not* the
   `activeMode` refactor JP4's review floated (left as a separate future cleanup).

---

## 2. Scope & assumptions

**In scope:** a mortise & tenon between two boards — a blind/through pocket on the mortise board and a
4-shoulder centered tenon on the tenon board's end, kept in sync by the existing distributor, edited
from the sidebar, created by a two-click gesture, with undo/redo and file persistence inherited from
the framework.

**v1 boundaries:**
- **Axis-aligned** boards (world image of each local axis within EPS of a world axis) — like the
  half-lap, enforced so out-of-scope placements go stale rather than producing garbage.
- The tenon is on a **length/width end** (`faceAxes(tenonEnd).depth !== 'z'`) so its cross-section is
  `width × thickness`; a thickness-end (broad-face) tenon is out of scope → stale (same gate the
  rabbet/notch use).
- The seat is **perpendicular** (`isValidDadoSeat`): the tenon end opposes the mortise face.
- **Centered tenon only** (symmetric shoulders); clamped so the tongue and every shoulder stay ≥ 0.1 mm.

**Non-goals:** haunched / wedged / draw-bored / angled tenons, offset (non-centered) tenons,
twin/double tenons, dovetailed or round mortises, cylinders.

**Size note:** the biggest slice yet (~8–9 tasks): new geometry file, dispatch case, scene method,
gesture hook, a 5th exclusive viewport mode, polymorphic panel branch, format bump, docs. Still one
coherent, independently-shippable feature.

---

## 3. Framework changes

Minimal, following the half-lap precedent:

- **`Joint` union:** `Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint` (`src/scene/types.ts`).
- **`deriveJoint` dispatch** (`src/geom/dado.ts`): add `case 'mortise-tenon': return deriveMortiseTenon(joint, parts)`,
  importing `deriveMortiseTenon` from `./mortisetenon` (one-directional import; `mortisetenon.ts`
  type-imports `DeriveResult`/`DerivedCut` from `dado.ts`, no runtime cycle). The switch stays
  exhaustive (compile error if a 4th kind is added without a case).
- **`jointInvolves`** (`src/scene/jointInvolves.ts`): add the `mortise-tenon` arm
  (`joint.mortisePartId === partId || joint.tenonPartId === partId`).
- **`reconcileJoints`** — **unchanged** (seatful path, like the dado; the generic distributor already
  scatters any number of cuts + applies the seat).

---

## 4. Data model

New interface (`src/scene/types.ts`):

```ts
export interface MortiseTenonJoint {
  kind: 'mortise-tenon'
  id: string // "joint_<uuid>"
  label: string // "Mortise & tenon 1"
  mortisePartId: PartId // board that carries the pocket
  mortiseFace: Face // face the pocket is cut into
  tenonPartId: PartId // board whose end becomes the tenon
  tenonEnd: Face // the tenon board's end that is reduced to the tongue
  tenonLength: number // mm — tongue projection = blind mortise depth
  tenonThickness: number // mm — tongue thickness (local Z of the tenon board)
  tenonWidth: number // mm — tongue width (the non-Z cross-section axis)
  clearance: number // mm — added to pocket cross-section + depth for fit (default 0)
  through: boolean // false = blind pocket (default); true = pocket spans the mortise thickness
  offsetU: number // mortise center along mortiseFace's u axis
  offsetV: number // mortise center along mortiseFace's v axis
}

export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint
```

**File format:** `FILE_FORMAT_VERSION` `7 → 8`. `parseFile` adds a `j.kind === 'mortise-tenon'` arm to
the existing kind-branch (defaults-first spread of the numeric fields + `through: false`). Old files
(≤ v7) contain no mortise-tenons and load unchanged.

**Creation defaults** (`onAddMortiseTenon`): the §1 formulas + `clearance: 0`, `through: false`, and
`offsetU`/`offsetV` from `computeMortiseOffset` (§5.4).

---

## 5. Geometry — new `src/geom/mortisetenon.ts`

Self-contained: it must **not** import any runtime value from `dado.ts` (which imports
`deriveMortiseTenon` back — a value import either direction would be a runtime cycle). It imports
`composeWorldMatrix` / `applyMatrixToPoint` from `./transform`, `faceAxes` / `computeLocalFaceCenter`
from `../scene/snapMath`, and (like `dado.ts`) `THREE` for the seat's vector projection; and defines
its own trivial `clamp` / `boardDims` / `unitVec` / `localDirToWorld` / `FACE_NORMALS` /
`isAxisAligned` / `isPerpendicularSeat` (the last two mirror `halflap.ts` and `dado.ts`'s
`isValidDadoSeat` respectively — a few lines each). It type-imports `DeriveResult` / `DerivedCut`
from `./dado` (type-only, no runtime cycle).

Throughout, for the **tenon** board: `seatAx = faceAxes(tenonEnd).depth` (∈ `{x,y}` by the §2 gate),
`widthAx = seatAx === 'x' ? 'y' : 'x'` (the non-Z cross-section axis), thickness = local `z`.

### 5.1 Validity

```ts
export function isValidMortiseTenon(mortise, mortiseFace, tenon, tenonEnd): boolean
```
- `isAxisAligned(mortise) && isAxisAligned(tenon)` (else stale), AND
- `isPerpendicularSeat(mortise, mortiseFace, tenon, tenonEnd)` — the local copy of the dado's
  perpendicular-seat check (`localDirToWorld(mortise, FACE_NORMALS[mortiseFace]).dot(localDirToWorld(
  tenon, FACE_NORMALS[tenonEnd])) < -0.99`), defined in `mortisetenon.ts` to keep it cycle-free
  (the gesture/creation code in §6/§7 imports the exported `isValidDadoSeat` directly — those modules
  aren't imported by `dado.ts`, so no cycle), AND
- `faceAxes(tenonEnd).depth !== 'z'` (tenon on a length/width end).

(`deriveMortiseTenon` returns `null` when false → last-good preserved.)

### 5.2 Tenon shoulders — `computeTenonShoulders(tenon, joint): BoxCut[]`

`dim = boardDims(tenon)`. `d = clamp(joint.tenonLength, 0.1, dim[seatAx] - 0.1)`,
`tt = clamp(joint.tenonThickness, 0.1, dim.z - 0.1)`, `tw = clamp(joint.tenonWidth, 0.1, dim[widthAx] - 0.1)`.
The tenon region on the seat axis is `[dim[seatAx] − d, dim[seatAx]]` when `tenonEnd.startsWith('+')`,
else `[0, d]`; call its start `s0` and extent `d`.

Central tongue is centered: on `z` it spans `[dim.z/2 − tt/2, dim.z/2 + tt/2]`; on `widthAx`
`[dim[widthAx]/2 − tw/2, dim[widthAx]/2 + tw/2]`. Emit up to **four** shoulder strips over the tenon
region (each a `BoxCut`; strips overlap at corners — fine). Let `zMargin = (dim.z − tt)/2`,
`wMargin = (dim[widthAx] − tw)/2`:

- If `zMargin > EPS`: **`_shoulderZhi`** — `z ∈ [dim.z/2 + tt/2, dim.z]`, full `widthAx`, seat-region;
  **`_shoulderZlo`** — `z ∈ [0, dim.z/2 − tt/2]`, full `widthAx`, seat-region.
- If `wMargin > EPS`: **`_shoulderWhi`** — `widthAx ∈ [center + tw/2, dim[widthAx]]`, full `z`,
  seat-region; **`_shoulderWlo`** — `widthAx ∈ [0, center − tw/2]`, full `z`, seat-region.

Each cut: `position[seatAx] = s0`, `size[seatAx] = d`; the other two axes per the ranges above;
`face: joint.tenonEnd` (cosmetic); `sourceJointId: joint.id`; ids `cut_${joint.id}_shoulder{Zhi|Zlo|Whi|Wlo}`.
For a normal centered tenon all four are present (2 when full-width or full-thickness).

```
Tenon board end, 4-shoulder centered tenon (looking at the end, seat axis into the page):
  widthAx →
  ┌───────────────┐   ▓ = shoulder (removed over tenonLength)
  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   □ = central tongue (tenonWidth × tenonThickness)
  │▓▓┌─────────┐▓▓│      remaining; seats into the pocket.
  │▓▓│   □□□   │▓▓│
  │▓▓└─────────┘▓▓│
  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
  └───────────────┘
       ↑ z
```

### 5.3 Mortise pocket — `computeMortisePocket(mortise, tenon, joint): BoxCut`

`dAx = faceAxes(mortiseFace).depth`, `{u, v} = faceAxes(mortiseFace)`, `dim = boardDims(mortise)`.
Orient the pocket cross-section to the tenon's thickness/width via a `deriveDadoAxes`-style world-axis
alignment: `thicknessWorld = localDirToWorld(tenon, unitVec('z'))`,
`uWorld = localDirToWorld(mortise, unitVec(u))`, `vWorld = localDirToWorld(mortise, unitVec(v))`;
`thkAx = |thicknessWorld·uWorld| >= |thicknessWorld·vWorld| ? u : v`, `wAx =` the other face axis.

Extents: `size[dAx] = joint.through ? dim[dAx] : clamp(joint.tenonLength + joint.clearance, 0.1, dim[dAx])`;
`size[thkAx] = clamp(joint.tenonThickness + joint.clearance, 0.1, dim[thkAx])`;
`size[wAx] = clamp(joint.tenonWidth + joint.clearance, 0.1, dim[wAx])`.
Position: `position[dAx] = mortiseFace.startsWith('+') ? dim[dAx] − size[dAx] : 0`;
`position[u] = clamp(joint.offsetU − uExtent/2, 0, dim[u] − uExtent)` and likewise `position[v]`
(where `uExtent`/`vExtent` are the pocket's u/v sizes). `face: joint.mortiseFace`,
`id: cut_${joint.id}_mortise`, `sourceJointId: joint.id`.

### 5.4 Mortise offset (creation default) — `computeMortiseOffset(mortise, tenon, joint): { offsetU; offsetV }`

Mirror `computeDadoOffset` for both face axes: project the tenon board's center
(`applyMatrixToPoint(composeWorldMatrix(tenon), tenon.length/2, tenon.width/2, tenon.thickness/2)`
minus `mortise.position`) onto `localDirToWorld(mortise, unitVec(u))` and `…unitVec(v)`; clamp each
into the board's face extent. Used only by `onAddMortiseTenon` to seed editable defaults.

### 5.5 Seat — `computeMortiseTenonSeat(mortise, tenon, joint): { position: Vec3 }`

Mirror `computeDadoSeat` with `depth = tenonLength` and **2-axis centering**:
- `endLocal = computeLocalFaceCenter(FACE_NORMALS[tenonEnd], tenon)` → `endWorld` (the tongue tip
  center; no tongue-shift since the tenon is centered).
- `faceCenter = computeLocalFaceCenter(FACE_NORMALS[mortiseFace], mortise)`.
- `bottomLocal = { ...faceCenter, [dAx]: mortiseFace.startsWith('+') ? dim[dAx] − tenonLength : tenonLength }`
  → `bottomWorld` (pocket-bottom plane center).
- `centerLocal = { ...faceCenter, [u]: joint.offsetU, [v]: joint.offsetV }` → `centerWorld`.
- `faceN = localDirToWorld(mortise, FACE_NORMALS[mortiseFace])`, `uDir`, `vDir`.
- `desired = endWorld + faceN·((bottom−end)·faceN) + uDir·((center−end)·uDir) + vDir·((center−end)·vDir)`.
- `position = tenon.position + (desired − endWorld)`.

This drops the tongue tip onto the pocket bottom and aligns the tongue center to the pocket center in
both in-face axes; the shoulders land flush on the mortise face.

### 5.6 Derivation — `deriveMortiseTenon(joint, parts): DeriveResult | null`

```ts
  const mortise = find(mortisePartId); const tenon = find(tenonPartId)
  if (mortise?.kind !== 'board' || tenon?.kind !== 'board') return null
  if (!isValidMortiseTenon(mortise, joint.mortiseFace, tenon, joint.tenonEnd)) return null
  const cuts: DerivedCut[] = [
    ...computeTenonShoulders(tenon, joint).map((cut) => ({ partId: tenon.id, cut })),
    { partId: mortise.id, cut: computeMortisePocket(mortise, tenon, joint) },
  ]
  const seat = { partId: tenon.id, position: computeMortiseTenonSeat(mortise, tenon, joint).position }
  return { cuts, seat }
```
2–5 cuts (0/2/4 shoulders + 1 pocket) + a seat, all `sourceJointId`-tagged → the reconciler strips/
regenerates idempotently. **No OCCT/mesh/export/drawing change** — everything is ordinary `BoxCut`s.

---

## 6. Scene method — `onAddMortiseTenon` (`src/scene/useScene.ts`)

Mirror `onAddJoint` (the dado creator): given `(mortiseHit, tenonHit)`, resolve both boards, require
`isValidDadoSeat`, then construct the joint with the §1 default formulas + `computeMortiseOffset`,
append, reconcile, and push **one** undo entry (`'Add mortise & tenon'`). Selects the mortise board.
`onUpdateJoint` (already `(j: Joint) => Joint`) and `onRemoveJoint` (kind-aware label — add a
`'Remove mortise & tenon'` arm) need no structural change.

---

## 7. Gesture & the 5th mode

`src/scene/useAddMortiseTenon.ts` — a two-click state machine mirroring `useAddJoint` (click the
mortise face, then the tenon end; validate `isValidDadoSeat` before firing `onAddMortiseTenon`).

`App.tsx` / `viewport.tsx` / `sidebar.tsx` gain a **5th exclusive mode** (shortcut `m`), mirroring the
half-lap mode wiring exactly: compose the hook; `handleActivateMortiseTenon` cancels the other four
(and each existing `handleActivate*` gains `cancelMortiseTenon()`); Escape / `h` / Delete guards and
the keydown deps extend with the new mode; Viewport gets its props + refs + first-branch click/hover
routing + highlight/cursor; Sidebar gets a "Mortise & tenon" toggle button. (JP4's suggested
`activeMode` refactor is intentionally deferred — see §1.5.)

---

## 8. UI — `src/ui/JointsPanel.tsx`

Add a `j.kind === 'mortise-tenon'` branch (alongside the dado and half-lap branches), rendered on the
**mortise** side, with the joint label + "mortise & tenon" tag + remove button + a "→ {tenon board}"
line + a stale warning (via `isValidMortiseTenon`). Controls: `Length` (`tenonLength`), `Thk`
(`tenonThickness`), `Width` (`tenonWidth`), `Clear` (`clearance`) `JointNumInput`s (each `Math.max(0.1, v)`
except `Clear` = `Math.max(0, v)`), and a `Through` toggle (a `Select` or checkbox committing
`through`). The **tenon** side shows a read-only "Edit from {mortise board}." hint (like the dado's
housed side). All `onUpdateJoint` calls stay inside the `j.kind === 'mortise-tenon'` narrow (the
type-hole invariant from JP4). Both boards' derived cuts render read-only via `sourceJointId`.

---

## 9. Testing (seam-first)

- **`src/geom/mortisetenon.test.ts`** (the bulk): `isValidMortiseTenon` (perpendicular + axis-aligned +
  length/width-end valid; a thickness-end tenon, a non-axis-aligned board, and a non-perpendicular seat
  invalid); `computeTenonShoulders` (4 strips for a centered tenon with correct central-tongue bounds;
  2 strips when full-width; 0 when full-width + full-thickness; seat-region placement for `+`/`−` ends);
  `computeMortisePocket` (blind depth = `tenonLength + clearance`; `through` = full thickness; cross-section
  oriented to thickness/width; centered on `offsetU/offsetV`); `computeMortiseTenonSeat` (tongue tip on
  the pocket bottom, shoulders flush on the face — assert via `applyMatrixToPoint` on the seated board,
  including a rotated tenon board); stale → `null`.
- **`src/geom/dado.test.ts`**: `deriveJoint` dispatches a `mortise-tenon` to the M&T deriver (returns
  shoulders + pocket + seat).
- **`src/scene/reconcileJoints.test.ts`**: an M&T materializes the tenon strips (tenon board) + pocket
  (mortise board) + seats the tenon board; removal strips all; dado/half-lap tests still pass.
- **`src/scene/useScene.test.ts`**: `onAddMortiseTenon` creates the joint + cuts + seat in one undo entry;
  `onUpdateJoint` changing `tenonThickness` re-derives; undo restores.
- **`src/scene/useAddMortiseTenon.test.ts`**: two clicks (mortise face, perpendicular tenon end) create
  an M&T; a non-perpendicular second hit does not.
- **`src/ui/sidebar.test.tsx`**: a selected mortise board shows `Length`/`Thk`/`Width`/`Through`; a dado
  and a half-lap board still show their own controls (polymorphic panel doesn't regress).

---

## 10. Files touched

**Created:**
- `src/geom/mortisetenon.ts` — `isValidMortiseTenon`, `computeTenonShoulders`, `computeMortisePocket`,
  `computeMortiseOffset`, `computeMortiseTenonSeat`, `deriveMortiseTenon`; `+ mortisetenon.test.ts`.
- `src/scene/useAddMortiseTenon.ts` — two-click gesture; `+ useAddMortiseTenon.test.ts`.

**Modified:**
- `src/scene/types.ts` — `MortiseTenonJoint`; `Joint` union.
- `src/scene/useFile.ts` — `FILE_FORMAT_VERSION` `7 → 8`; `parseFile` mortise-tenon arm.
- `src/geom/dado.ts` — `deriveJoint` `mortise-tenon` case + import.
- `src/scene/jointInvolves.ts` — mortise-tenon arm.
- `src/scene/useScene.ts` — `onAddMortiseTenon`; `onRemoveJoint` label arm.
- `src/App.tsx` / `src/render/viewport.tsx` / `src/ui/sidebar.tsx` — 5th mode (shortcut `m`).
- `src/ui/JointsPanel.tsx` — mortise-tenon controls branch.
- Tests as in §9; `README.md`, `docs/keyboard-shortcuts.md` (the `m` shortcut), `project-structure.html`,
  `docs/superpowers/notes/2026-07-23-mortise-tenon-joint-notes.md`.

**Unchanged:** `reconcileJoints.ts`, `computeDado*`/`computeRabbet`/`computeNotch`, `halflap.ts`,
`useAddJoint.ts`/`useAddHalfLap.ts`, `occt.*`, `mesh.ts`, STL/STEP export, `drawing.ts`.
