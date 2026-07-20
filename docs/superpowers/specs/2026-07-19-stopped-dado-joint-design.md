# Stopped (Blind) Dado Joint (JP3) — Design Spec

**Date:** 2026-07-19
**Status:** Approved design, ready for implementation planning
**Topic:** Add a composable **stopped/blind dado** to the dado joint — the groove stops short of one or both run-axis edges (hidden from that edge), and the housed board is auto-notched to seat flush.

**Depends on:** JP1 (`2026-07-16-parametric-dado-joint-design.md`) and JP2
(`2026-07-17-rabbeted-dado-joint-design.md`), which introduced the first-class `Joint`,
`deriveJoint` (a list of `{partId, cut}` + seat), the joint-agnostic `reconcileJoints`
distributor, `src/geom/dado.ts`, and the sidebar `JointsPanel`.

---

## 1. Purpose & context

A through dado runs the groove edge-to-edge across the housing; a **stopped** (blind) dado
stops the groove short of the "show" edge so the joint is invisible from the front. The housed
board then needs a small **notch** at the stopped end so its front corner clears the un-grooved
solid housing and its front edge sits flush.

This is a composable modifier — orthogonal to `profile` (a stopped *rabbeted* dado is valid) —
and it is the third derivation the framework has grown: JP2 proved two-sided (groove + rabbet);
JP3 emits up to **four** cuts (groove + optional tongue + up to two notches), all distributed
by the unchanged `reconcileJoints`.

### Decisions locked during brainstorming

1. **Composable `stop` field** (not a third `profile` value) — stopped is independent of the tongue.
2. **Symmetric two-field model** `stopStart` / `stopEnd` (mm inset from each run-axis end) —
   covers through (both 0), single-stopped (one nonzero), and double-stopped (both nonzero).
3. **Auto-derive the notch(es)** — a stopped dado without them isn't buildable (the housed board
   would collide with the solid housing).
4. **No new gesture** — edit `stopStart`/`stopEnd` in `JointsPanel`, like JP2's tongue controls.

---

## 2. Scope & assumptions

**In scope:** a stopped dado between two boards — the groove shortened along its run axis by
`stopStart`/`stopEnd`, plus an auto-derived corner notch on the housed board for each nonzero
stop, kept in sync by the existing distributor, edited from the sidebar, with undo/redo and file
persistence inherited from JP1/JP2. Composable with `profile: 'rabbeted'`.

**v1 boundaries (in addition to JP1/JP2's axis-aligned / perpendicular / boards-only rules):**
- The notch removes the housed board's seating corner over the **full thickness** (so it composes
  with a rabbeted tongue by simply removing it too at that corner).
- `stopStart + stopEnd` is clamped to leave a **minimum groove length** (≥ 1 mm).
- The notch's stop width is measured on the housed board's width axis; it assumes the housed
  board's width spans the groove run (true for a normal perpendicular dado). A housed board whose
  width is much smaller/larger than the housing run is out of scope for exactness.

**Non-goals:** dovetailed/tapered stopped dados, stop measured from a chosen named edge (we use
the two run-axis ends), cylinders.

---

## 3. Data model

`DadoJoint` gains two fields (`src/scene/types.ts`):

```ts
export interface DadoJoint {
  kind: 'dado'
  // existing: id, label, housingPartId, housingFace, housedPartId, housedEnd, offset, depth,
  //           clearance, profile, tongueThickness, rabbetFace
  stopStart: number // NEW — mm the groove is inset from the run-axis 0 end (0 = runs to that edge)
  stopEnd: number   // NEW — mm the groove is inset from the run-axis far end
}
```

Both default `0` (through — byte-identical to today). Composable with any `profile`.

**File format:** `FILE_FORMAT_VERSION` `5 → 6`. `parseFile` defaults `stopStart: 0`, `stopEnd: 0`
on legacy joints via the existing defaults-first spread idiom. Existing (v5) files load as
all-through.

**Creation defaults** (`onAddJoint`, unchanged gesture): `stopStart: 0`, `stopEnd: 0`.

---

## 4. Geometry

Existing `isValidDadoSeat` / `deriveDadoAxes` / `computeDadoOffset` / `defaultDadoDepth` /
`computeDadoSeat` / `computeRabbet` / `hasTongue` are unchanged. `computeDadoSeat` is **unchanged**
— the board still seats end-at-groove-bottom over the grooved region; the notch is purely
additive.

### 4.1 Groove shortening — extend `computeDadoGroove` (run axis only)

Replace the current full-span run-axis lines
(`size[runAx] = dim[runAx]`, `position[runAx] = 0`) with a stop-inset span:

```ts
  const ss = clamp(joint.stopStart, 0, dim[runAx] - 1)
  const se = clamp(joint.stopEnd, 0, dim[runAx] - 1 - ss) // leave ≥ 1 mm of groove
  size[runAx] = dim[runAx] - ss - se
  position[runAx] = ss
```

Everything else in `computeDadoGroove` (depth, narrow width incl. the JP2 tongue clamp, offset
centering, ± face inset, id, `sourceJointId`) is unchanged. A through joint (`ss = se = 0`) is
identical to today.

### 4.2 Notch — new `computeNotch(housing, housed, joint, end)`

`end: 'start' | 'end'`. Returns the corner `BoxCut` on the housed board for one stopped end.
In housed-local coords: `dim = boardDims(housed)`, `seatAx = faceAxes(joint.housedEnd).depth`
(∈ `{x,y}`), `widthAx: Axis = seatAx === 'x' ? 'y' : 'x'`, thickness = `z`,
`d = clamp(joint.depth, 0.1, dim[seatAx] - 0.1)` (notch-back distance = groove depth),
`stop = clamp(end === 'start' ? joint.stopStart : joint.stopEnd, 0.1, dim[widthAx] - 0.1)`.

Resolve which housed-width end this stop maps to (the groove's `'start'` insets from the
housing-local `runAx = 0` end):

```ts
  const { runAx } = deriveDadoAxes(housing, housed, joint.housingFace)
  const aligned =
    localDirToWorld(housed, unitVec(widthAx)).dot(localDirToWorld(housing, unitVec(runAx))) > 0
  const atLow = (end === 'start') === aligned // notch sits at housed widthAx 0 vs the far end
```

Build the box:

```ts
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[seatAx] = d
  size[widthAx] = stop
  size.z = housed.thickness // full thickness — removes the tongue too if rabbeted
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[seatAx] = joint.housedEnd.startsWith('+') ? dim[seatAx] - d : 0
  position[widthAx] = atLow ? 0 : dim[widthAx] - stop
  position.z = 0
```

Return the corner box:

```ts
  return {
    kind: 'box',
    id: `cut_${joint.id}_notch${end === 'start' ? 0 : 1}` as CutId,
    label: `${joint.label} notch`,
    face: joint.housedEnd,
    position,
    size,
    sourceJointId: joint.id,
  }
```

`face` is cosmetic; geometry lives in `position`/`size`; `makeShape`'s `makeCut` subtracts
`[position, position+size]` as for any box cut — **no OCCT/mesh/export/drawing change**.

```
 Housed seating end, one stopped end (looking along thickness):
   width →
   ┌───┬───────────┐    notch = corner box: d deep (into the end),
   │▓▓▓│ seats in  │      stop wide (over the un-grooved width),
   │▓▓▓│ the groove│      full thickness.
   └───┴───────────┘
```

**Determinism:** groove id `cut_${joint.id}`, rabbet `_rabbet`, notches `_notch0`/`_notch1`, all
`sourceJointId`-tagged — so the reconciler strips a joint's cuts across both boards and every
derive is idempotent.

---

## 5. `deriveJoint` & reconciler

`reconcileJoints` is **unchanged** (the generic distributor already scatters any number of cuts).
`deriveJoint` grows two conditional pushes after the groove (+ rabbet):

```ts
  const cuts: DerivedCut[] = [{ partId: housing.id, cut: computeDadoGroove(housing, housed, joint) }]
  if (hasTongue(joint)) cuts.push({ partId: housed.id, cut: computeRabbet(housing, housed, joint) })
  if (joint.stopStart > 0)
    cuts.push({ partId: housed.id, cut: computeNotch(housing, housed, joint, 'start') })
  if (joint.stopEnd > 0)
    cuts.push({ partId: housed.id, cut: computeNotch(housing, housed, joint, 'end') })
  const seat = { partId: housed.id, position: computeDadoSeat(housing, housed, joint).position }
  return { cuts, seat }
```

Plain-through = 1 cut; stopped-plain = 2–3 cuts; stopped-rabbeted = 3–4 cuts — all distributed
identically, all preserved-last-good on a `null` (stale) derive.

---

## 6. UI (`src/ui/JointsPanel.tsx`)

Two `JointNumInput`s on the **housing** side, added below Offset and **always visible** (stops
apply to plain and rabbeted alike):

- **`Stop A`** → `stopStart`, mm, committed via `onUpdateJoint(j.id, jt => ({ ...jt, stopStart: Math.max(0, v) }))`.
- **`Stop B`** → `stopEnd`, mm, `Math.max(0, v)`.

(The geometry clamps the combined total against the run length.) No new gesture/mode button. The
housed notch cut(s) render read-only as `"{label} notch (joint)"` rows in the housed board's Cuts
list — JP1's `sourceJointId` read-only rendering already covers them, so the housed side needs
**no new UI code**.

---

## 7. Testing (seam-first)

- **`src/geom/dado.test.ts`**:
  - `computeDadoGroove` insets the run-axis span for `stopStart`/`stopEnd` (asserts
    `position[runAx]` and `size[runAx]`; through = unchanged; combined stops clamp to ≥ 1 mm groove).
  - `computeNotch` geometry for each end: corner box `d` deep (`size[seatAx]`), `stop` wide
    (`size[widthAx]`), full thickness (`size.z`), at the correct width end (`position[widthAx]`
    0 vs `width − stop`) via the `aligned` sign mapping, and flush at the housed end.
  - `deriveJoint`: emits groove + 0/1/2 notches by stop count; composes with rabbeted
    (through-rabbeted = 2 cuts; stopped-rabbeted with both stops = 4 cuts, partIds correct).
- **`src/scene/reconcileJoints.test.ts`**: a stopped joint materializes groove (housing) + notch(es)
  (housed); zeroing both stops removes the notches; JP1/JP2 tests still pass.
- **`src/scene/useScene.test.ts`**: setting a stop via `onUpdateJoint` adds the notch in a single
  undo entry; undo restores.
- **`src/ui/sidebar.test.tsx`**: `Stop A`/`Stop B` inputs render for a selected housing part.

---

## 8. Files touched

**Modified:**
- `src/scene/types.ts` — `stopStart` / `stopEnd` on `DadoJoint`.
- `src/scene/useFile.ts` — `FILE_FORMAT_VERSION` `5 → 6`; `parseFile` stop defaults.
- `src/geom/dado.ts` — `computeNotch`, `computeDadoGroove` run-axis inset, `deriveJoint` pushes;
  `+ dado.test.ts`.
- `src/scene/reconcileJoints.test.ts` — stopped-joint distribution tests (production reconciler
  unchanged).
- `src/scene/useScene.test.ts` — stop-flip single-undo test (production `useScene` unchanged;
  `onAddJoint` sets the two defaults).
- `src/ui/JointsPanel.tsx` — Stop A / Stop B inputs; `+ sidebar.test.tsx`.
- `docs/keyboard-shortcuts.md` (no change expected), `README.md`, `project-structure.html`,
  `docs/superpowers/notes/2026-07-19-stopped-dado-joint-notes.md`.

**Unchanged:** `reconcileJoints.ts`, `useScene.ts` logic, `computeDadoSeat`, `computeRabbet`,
`useAddJoint.ts`, `viewport.tsx`, `App.tsx`, `occt.ts`, `occt.worker.ts`, `mesh.ts`, STL/STEP
export, `drawing.ts`.
