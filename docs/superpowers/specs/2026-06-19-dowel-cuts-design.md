# Dowel Cuts — Sub-project 2: End cuts, Notches, Bores

**Date:** 2026-06-19
**Status:** Approved design

## Context

Sub-project 1 (PR #6, `2026-06-12-dowel-part-design.md`) added the `CylinderPart`
primitive: a dowel a user can add, dimension (⌀ + length), place, rotate,
duplicate, export, and cost by linear rate. SP1 deliberately shipped **without
cuts** — joinery on a curved surface is its own interaction-design problem and
was queued as SP2.

This spec covers SP2: subtractive joinery cuts on dowels. The SP1 spec sketched
SP2 as "end miters / cross-cuts"; in design we expanded it (with the user) to
four cut operations covering the realistic dowel-joinery cases.

| Sub-project | Contents | Status |
|---|---|---|
| 1. Dowel primitive + BOM | type, OCCT cylinder, mesh, viewport, add/duplicate, dims, STL/STEP, Dowels BOM | Done (PR #6, unmerged) |
| **2. Dowel cuts** | end cuts, lateral notches, axial + transverse bores; click-to-seed + parametric edit | **This spec** |
| 3. Dowel snap-align | cap-to-face snapping; `snapMath` cylinder variant | Later cycle |
| 4. Dowel 2D drawings | circle + rectangle orthographic views | Later cycle |

### Implementation dependency

SP2 builds directly on SP1's code (`CylinderPart`, `makeCylinder`, the
kind-aware `BuildSpec`/`ExportSpec` seams, the dowel `EditPanel`), which lives
**only in unmerged PR #6** (branch `claude/exciting-bell-2jysqk`). None of it is
on `main`. **SP2 implementation must be branched from PR #6 or begin after it
merges.** This spec stands alone and can be written/reviewed now; only the
plan's code steps are gated on SP1 landing.

## Goal

A user can add four kinds of subtractive joinery cut to a dowel — square/angled
**end cuts**, lateral **notches** (incl. half-laps), and **bores** (coaxial and
crosswise holes) — by clicking the relevant surface to seed a cut and then
refining it numerically. Every cut participates in undo/redo, geometry rebuild,
STL/STEP export, and file save/load.

## Approach (chosen)

**Approach A — a separate `DowelCut` union plus a dedicated pure-math module,
mirroring the board cut patterns.** Dowel cuts are *axis/azimuth-relative* (the
dowel's local origin lies on its axis), fundamentally different from the board's
*corner-at-origin, face-aligned* `BoxCut`/`MitreCut`. Reusing the board cut
types (Approach B) would leak `kind` conditionals through the whole cut pipeline
and make both models harder to reason about. Narrowing to end-cuts-only
(Approach C) drops scope the user explicitly asked for; instead it becomes
Phase 1 of A's phasing.

All four cuts are boolean subtractions (`BRepAlgoAPI_Cut`), exactly like the
existing `makeCut`/`makeMitreCut`: pure math computes a tool's placement, OCCT
plumbing builds + orients + subtracts the tool.

## Design

### 1. Data model (`src/scene/types.ts`)

A new discriminated union, separate from the board's `CutDef`:

```ts
export interface DowelEndCut {
  kind: 'end'
  id: CutId
  label: string
  end: '+Z' | '-Z'    // which cap the cut acts on
  offset: number      // mm inward from that end where the cut plane crosses the axis
  angle: number       // degrees tilt from perpendicular; 0 = square trim
  azimuth: number     // degrees around the axis; direction the tilt faces (used when angle > 0)
}

export interface DowelNotch {
  kind: 'notch'
  id: CutId
  label: string
  position: number    // mm along axis — notch center
  width: number       // mm extent along axis
  depth: number       // mm radial depth (0..diameter); depth = radius ⇒ half-lap
  azimuth: number     // degrees around axis — which side the notch faces
}

export interface DowelBoreAxial {
  kind: 'bore-axial'
  id: CutId
  label: string
  end: '+Z' | '-Z'    // which end the hole is drilled from
  diameter: number    // mm
  depth: number       // mm; depth >= length ⇒ through
}

export interface DowelBoreTransverse {
  kind: 'bore-transverse'
  id: CutId
  label: string
  position: number    // mm along axis — hole center
  azimuth: number     // degrees around axis — direction the hole enters
  diameter: number    // mm
  depth: number       // mm; depth >= diameter ⇒ through
}

export type DowelCut = DowelEndCut | DowelNotch | DowelBoreAxial | DowelBoreTransverse
```

`CylinderPart` (from SP1) gains:

```ts
  cuts: DowelCut[]
```

Decisions baked in:

- **Unified `end` cut.** Square trim and mitre/bevel are the same geometry
  primitive — a planar half-space subtraction at one end. `angle = 0` ⇒ square
  trim positioned `offset` inward; `angle > 0` ⇒ wedge pivoting on the cap
  toward `azimuth`. One type, no lost capability.
- **Numeric `depth`, no `'through'` flag.** A "Through" button in the UI sets
  `depth` to the full extent; geometry oversizes the tool whenever
  `depth >= extent`. Avoids a union (YAGNI).
- **Azimuth in degrees around +Z** (CAD convention; +Z up). `0°` faces +X,
  measured `atan2(y, x)`.
- **No `pairedCutId`** on dowel cuts in SP2 (cut-linking deferred).
- **File format:** a dowel's missing `cuts` loads as `[]`. Backward-compatible;
  **no `FILE_FORMAT_VERSION` bump** — same call SP1 made for `costPerM`.

### 2. Geometry — pure math (`src/geom/dowelCut.ts`, new)

THREE-free, browser-free, unit-tested directly (like `mitre.ts`). One function
per cut type, each returning a plain tool descriptor; plus the hit→param seeding
helpers (Section 4). All coordinates are in the dowel's **local** frame (axis
along +Z, base circle centered at the local origin, extending to `z = length`).

- **`computeEndTool(dowel, cut: DowelEndCut)`** → an oversized box half-space
  descriptor `{ boxSize, boxOrigin, pivot, axisDir, angleRad }` — the **same
  shape `computeMitreTool` already returns**, so the OCCT side consumes it
  through the shared `makeBoxCutAt` helper (Section 3). With `angle = 0`
  the box is axis-perpendicular, positioned to remove the slab outboard of the
  plane `offset` from the chosen end (square trim). With `angle > 0` the box
  tilts about a `pivot` on that cap toward `azimuth`, removing a wedge. The box
  is oversized (≥ diameter on the cross-section, generous along the axis) so the
  subtraction fully clears the dowel.
- **`computeNotchTool(dowel, cut: DowelNotch)`** → an oversized radial box
  descriptor `{ boxSize, boxOrigin, axisDir(=+Z), angleRad(=azimuth) }`. Sized
  `width` along Z, centered at `position`; penetrates `depth` radially inward
  from the lateral surface on the `azimuth` side; oversized tangentially and
  radially-outward so only `depth` of penetration remains inside the dowel.
- **`computeAxialBoreTool(dowel, cut: DowelBoreAxial)`** → a cylinder-tool
  descriptor `{ radius, height, basePoint, dir(=±Z) }`. Radius `diameter / 2`,
  started at the chosen cap. `height = depth` for a blind hole; when
  `depth >= length`, `height` overshoots past the far cap (`length + margin`) so
  the through-cut clears cleanly and the boolean is robust at the boundary.
- **`computeTransverseBoreTool(dowel, cut: DowelBoreTransverse)`** → a
  cylinder-tool descriptor `{ radius, height, basePoint, dir(radial at azimuth) }`.
  Centered at `position`, axis radial at `azimuth`; `height` oversized past the
  far wall when `depth >= diameter` (through).

Each function returns a no-op signal (or the OCCT fold skips) for degenerate
inputs: end with `angle <= 0 && offset <= 0`; notch/bore with `depth <= 0` or
`diameter <= 0`.

### 3. Geometry — OCCT plumbing (`src/geom/occt.ts`)

Browser-only; mirrors `makeCut`/`makeMitreCut` (build tool → transform →
`BRepAlgoAPI_Cut_3` → `Build` → `IsDone` guard returning the input shape on
failure → cleanup all OCCT handles).

- **`makeBoxCutAt(oc, shape, descriptor)`** — new; rotate + translate + subtract
  an oversized box. Generalizes the body of `makeMitreCut` (which stays as-is for
  board mitres — surgical, no board-code change). Serves **both** the `end` cut
  (`computeEndTool` descriptor) and the `notch` (`computeNotchTool` descriptor),
  since both produce the same descriptor shape.
- **`makeCylinderCut(oc, shape, descriptor)`** — new; build
  `BRepPrimAPI_MakeCylinder`, orient via `gp_Ax2` (base point + direction),
  subtract. Serves both bore types.
- **`makeDowelShape(oc, { diameter, length, cuts })`** — new; mirrors
  `makeShape`. Start with `makeCylinder(oc, diameter / 2, length)`, fold each cut
  (sorted by `id.localeCompare`) through its subtraction, skipping no-ops, and
  `delete()` the superseded shape after each successful cut.

**Unverified OCCT overloads.** The `gp_Ax2` / `BRepPrimAPI_MakeCylinder_3`
(oriented-cylinder) overloads are this design's best read of the embind API and
are **UNVERIFIED at runtime** — they will be confirmed with a live OCCT spike
(per the `add-geometry` skill) before relying on them, and flagged in code
comments as `writeStep` does. `BRepAlgoAPI_Cut_3` and the box/transform overloads
are already proven by `makeCut`/`makeMitreCut`.

### 4. Click-to-seed interaction (`src/scene/useAddCut.ts`, `src/render/viewport.tsx`)

The dowel has three surfaces but four cut types, so a click alone is ambiguous
(lateral → notch *or* transverse bore; cap → end *or* axial bore). The user
**arms a tool first**, then clicks a compatible surface.

**Surface resolution** from the `FaceHit` (using the local face normal + local
hit point the raycaster already provides):

- `|nz| ~= 1` → **end cap** (`+Z`/`-Z` from the sign of `nz`). Valid for **End**
  and **Axial bore**.
- otherwise → **lateral surface**. Valid for **Notch** and **Transverse bore**.
- Tool/surface mismatch → the click is a no-op (optional brief hint); nothing is
  added.

**Hit→param seeding** (pure helpers in `dowelCut.ts`, tested directly):

- `position` (notch / transverse bore) = local hit `z`.
- `azimuth` (notch / transverse bore) = `atan2(hitLocal.y, hitLocal.x)` in degrees.
- `end` (end cut / axial bore) = sign of local `nz`.
- Remaining fields take sensible defaults: end `{ angle: 0, offset: 0 }`; notch
  `{ width: 20, depth: radius }`; bores `{ diameter: ⌀/3, depth: through }`.

**State machine:** mirror the board `useAddCut` — `idle → armed(tool) →
(compatible FaceHit) → emit cut → idle`. The new cut is applied through
`useScene.onUpdate`, so it participates in **undo/redo**. After placing, the tool
disarms (one cut per arm; matches the board flow). `snapMath.ts` / the snap state
machine are untouched (snap is SP3).

### 5. Worker + export seams

- **`occt.worker.ts`:** the SP1 `BuildSpec` cylinder arm gains `cuts: DowelCut[]`
  and routes to `makeDowelShape`. `mesh.ts` is **unchanged** — a cut cylinder
  triangulates the same way.
- **`occt.ts` `ExportSpec` + `useScene.exportStep`:** the cylinder `ExportSpec`
  arm gains `cuts`; `makeTransformedShape`'s cylinder branch calls
  `makeDowelShape`. **STL** (`buildBinaryStl`) is unchanged (it consumes the
  already-built geometry).

### 6. Sidebar editor (`src/ui/sidebar.tsx`)

The dowel `EditPanel` (SP1) gains a **Cuts panel** mirroring the board's. Above
the list: the four-tool arming control (**End · Notch · Axial bore · Transverse
bore**) that drives the Section 4 interaction. Each existing cut renders a
collapsible row with kind-specific, debounced numeric inputs and a delete control:

- **End** — `end` (+Z/−Z), `offset`, `angle`, `azimuth`; quick-sets **Square**
  (angle→0) and **45°**.
- **Notch** — `position`, `width`, `depth`; quick-set **Half-lap** (depth→radius).
- **Axial bore** — `end`, `diameter`, `depth`; **Through** (depth→length).
- **Transverse bore** — `position`, `azimuth`, `diameter`, `depth`; **Through**
  (depth→diameter).

All edits flow through `useScene.onUpdate` (undo/redo + rebuild on `shapeKey`
change). No cut-linking UI (deferred).

### 7. `shapeKey`, file load (`src/scene/utils.ts`, `src/scene/useFile.ts`)

- **`shapeKey`:** the SP1 cylinder key (`cylinder|⌀|length`) extends to append a
  stable serialization of `cuts` (sorted by `id`), so a cut change triggers a
  worker rebuild. Position/rotation remain excluded.
- **`parseFile`:** default a dowel's missing `cuts` to `[]` on load. No format
  bump.

### 8. Testing

- **`dowelCut.test.ts`** — pure tool-geometry math for all four cut types (incl.
  degenerate/no-op inputs and `depth >= extent` through-cuts) + the hit→param
  seeding helpers. This is the core of the spec; fully testable in Node.
- **`occt.test.ts`** — `makeDowelShape` smoke per cut type (`it.skip` when WASM
  unavailable).
- worker `buildPart` cylinder-with-cuts branch (mocked OCCT).
- `shapeKey` includes cuts; `exportStep` cylinder arm carries cuts.
- **`useAddCut`** cylinder branch: surface resolution, tool/surface-mismatch
  no-op, emitted cut shape.
- **`useScene`** — add/edit/delete a dowel cut; undo/redo; save/reopen round-trip
  (incl. a pre-SP2 dowel with no `cuts` field loading as `[]`).
- **`EditPanel`** renders each cut type's inputs for a cylinder part.

### 9. Phasing

One spec, shippable increments; each phase green (`typecheck && lint && test`)
before the next:

1. **End cuts** — data model + `cuts` field + `shapeKey`/load + `makeDowelShape`
   + `makeBoxCutAt` + `computeEndTool` + tool-selector skeleton + End tool
   UI/interaction + tests.
2. **Bores** — axial + transverse (`makeCylinderCut`, both seeding paths, UI,
   tests).
3. **Notch** — `computeNotchTool` (reusing the Phase-1 `makeBoxCutAt`), lateral
   seeding, UI, tests.

### 10. Out of scope (queued)

- Cut-linking / `pairedCutId` for dowel cuts.
- Snap-align for dowels (SP3).
- 2D shop drawings for dowels (SP4) — the drawings entry stays disabled for
  cylinders.
- Curved-surface smooth shading.

## Open decisions resolved with the user

- Scope: all four cut types (end, notch, axial bore, transverse bore).
- Authoring: click-face to seed + parametric numeric refine, for every type.
- Bores: both axial and transverse.
- Architecture: Approach A — separate `DowelCut` union + dedicated pure-math
  module; not a generalization of the board `CutDef`.
- Square + mitre unified into one `end` cut type (offset + angle + azimuth).
- `depth` is numeric; "through" is a UI button, not a data flag.
- Cut-linking, snap, and 2D drawings deferred.
- No file-format version bump (backward-compatible `cuts` defaulting to `[]`).
