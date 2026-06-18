# Mitre End-Cut — Implementation Spec (L99)

Status: design approved 2026-06-18. Branch: `claude/mitre-end-cut` (off `main`).

## 1. Goal

Add a **mitre** joint to Zimmu: an *angled end-cut* that bevels one end of a board
across its width (flat mitre) or through its thickness (bevel), at a parametrized
angle (default 45°). One board, one angled plane — the classic face you butt
against another mitred board to form a corner.

Success criteria (verifiable):

1. A board can carry one or more `MitreCut`s; the 3D viewport shows the angled end.
2. STL and STEP export reflect the mitre (they re-mesh from the worker shape, so
   this falls out of the geometry change).
3. 2D shop drawings (SVG + DXF) render the angled outline + a mitre-angle dimension
   in the affected view.
4. `.zimmu` files round-trip; legacy files (no `kind` on cuts) load unchanged.
5. `pnpm typecheck && pnpm lint && pnpm test` pass.

Out of scope (explicitly deferred): compound mitres (two planes on one end),
auto frame-mitre pairing, mitre↔mitre cut-linking, a face-click placement flow,
and a handedness/direction control.

## 2. Data model — discriminated union

`src/scene/types.ts`. Turn `CutDef` into a discriminated union; the board keeps a
single `cuts: CutDef[]` array so every consumer iterates one list.

```ts
export interface BoxCut {
  kind: 'box'
  id: CutId
  label: string
  face: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
  position: Vec3
  size: Vec3
  pairedCutId?: string // "{partId}:{cutId}"
}

export interface MitreCut {
  kind: 'mitre'
  id: CutId
  label: string
  end: '+X' | '-X'   // which end face is bevelled
  axis: 'Z' | 'Y'    // 'Z' = flat mitre (tilt across width), 'Y' = bevel (tilt through thickness)
  angle: number      // degrees from a square cut; 0 = square (no-op), 45 = standard
}

export type CutDef = BoxCut | MitreCut
```

`BoxCut` is today's `CutDef` verbatim plus `kind: 'box'`. `BoardPart.cuts` stays
`CutDef[]`.

### Narrowing churn (the cost of the union)

Every place that reads `.face` / `.size` / `.position` / `.pairedCutId` off a cut
must narrow with `cut.kind === 'box'`. Audited consumers: `shapeKey` (utils.ts),
`useScene` (`onUpdateCut`, `onRemoveCut`, `onLinkCuts`, `onUnlinkCuts`, the
`buildPart` dims mapping, `exportStep` mapping, `onDuplicate` cut clone),
`drawing.ts` (`projectCut`, `buildView`), `sidebar.tsx` (`CutRow`, `cutLookup`,
`linkOptions`). Linking stays **box-only** — guard the pairing branches behind
`kind === 'box'`.

## 3. Geometry — coordinate recap & definitions

Board box: `x∈[0,L]`, `y∈[0,W]`, `z∈[0,T]`. Local axes **X=length, Y=width,
Z=thickness**. Ends are the `+X` (x=L) and `-X` (x=0) faces.

- **Flat mitre** (`axis:'Z'`): plane tilts in the XY plane, uniform through
  thickness. `drop = W * tan(angle)` measured along X.
- **Bevel** (`axis:'Y'`): plane tilts in the XZ plane, uniform across width.
  `drop = T * tan(angle)` measured along X.
- **Fixed hand:** the *long point* (full-length edge) is at the **min-coordinate
  edge** of the spanning axis — `y=0` for flat, `z=0` for bevel. The *short point*
  is at the max edge (`y=W` / `z=T`), pulled back by `drop`. Opposite hand =
  rotate the board 180° about its length (X) axis.

Angle convention: **0° = square**, drop grows with `tan(angle)`. Valid range
clamped in UI to `(0, 89)`. If `drop ≥ L` the end is fully consumed — allow it
(OCCT handles it) but the UI soft-warns.

### 3.1 Pure tool function (testable, no OCCT)

New module `src/geom/mitre.ts`. Single source of truth for the cutting tool,
consumed by `makeMitreCut` **and** the drawing layer, and unit-tested directly.

```ts
import type { Vec3 } from '../scene/types'
import type { MitreCut } from '../scene/types'

interface BoardDims { length: number; width: number; thickness: number }

export interface MitreTool {
  boxOrigin: Vec3   // axis-aligned oversized box min-corner, BEFORE rotation
  boxSize: Vec3     // oversized box dimensions
  pivot: Vec3       // rotation axis point (on the long-point end edge)
  axisDir: Vec3     // unit rotation axis ('Z' → (0,0,1); 'Y' → (0,1,0))
  angleRad: number  // signed rotation that tilts the box's inner face into the board
}

export function computeMitreTool(board: BoardDims, mitre: MitreCut): MitreTool
```

Derivation (for `+X`, flat `Z`): start with an oversized box covering everything
beyond the square end (`x∈[L, L+BIG]`, `y,z` spanning `±BIG`), pivot at the
long-point edge `(L, 0, 0)`, axis `+Z`, rotate by `+angle` so the inner face
sweeps to smaller `x` as `y` grows → removes the wedge at the `(x=L, y=W)` corner.
`-X` mirrors in x (pivot `(0,0,0)`, sign flips). Bevel `Y` is the same with the
spanning axis = thickness, pivot on the `z=0` edge, axis `±Y`. `BIG = 4*(L+W+T)`.

Also export, for the drawing layer:

```ts
// 2D outline of the bevelled face in the affected view's (u,v) mm coords,
// origin at the board's (0,0) corner of that view. Returns the polygon that
// REPLACES the rectangular board outline.
export function mitreFaceOutline(
  board: BoardDims,
  mitres: MitreCut[],          // mitres affecting THIS view (flat→Face, bevel→Edge)
  view: 'Face' | 'Edge',
): { x: number; y: number }[]   // in mm, NOT yet scaled
```

For the Face view (u=x length, v=y width): a `+X` flat mitre clips the polygon
corner from `(L, 0)` (long) to `(L - drop, W)` (short). Multiple mitres (one per
end) compose by clipping both ends. Bevel view (u=x, v=z) is analogous. The
**End view never changes** (the YZ cross-section silhouette is unaffected).

### 3.2 OCCT wrapper (browser-only, untested in Node)

`src/geom/occt.ts` — new `makeMitreCut`:

```ts
export function makeMitreCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  board: { length: number; width: number; thickness: number },
  mitre: MitreCut,
): TopoDS_Shape
```

Steps, mirroring `makeCut`'s allocation/cleanup discipline:
1. `const tool = computeMitreTool(board, mitre)` (pure).
2. `BRepPrimAPI_MakeBox` at `boxSize`; translate to `boxOrigin` via `gp_Trsf` +
   `BRepBuilderAPI_Transform`.
3. Rotate about `gp_Ax1(gp_Pnt(pivot), gp_Dir(axisDir))` by `angleRad`
   (`gp_Trsf.SetRotation_1`) via a second `BRepBuilderAPI_Transform`.
4. `BRepAlgoAPI_Cut_3` + `Build`; on `!IsDone()` warn and return input (same
   fallback as `makeCut`). Delete every intermediate.

> OCCT symbol overloads (`gp_Ax1`, `gp_Dir_4`, `gp_Pnt_3`, `SetRotation_1`,
> `BRepBuilderAPI_Transform_2`) are UNVERIFIED at runtime — OCCT is browser-only,
> untestable in Node. Same caveat class as `writeStep`. Verify with a manual
> `pnpm dev` smoke before claiming done.

### 3.3 `makeShape` dispatch

`makeShape` currently loops box cuts. Extend its `dims` to carry the full
discriminated cut list and dispatch by `kind` inside the single sorted loop:

```ts
dims: { length; width; thickness; cuts: CutDef[] }   // worker-serializable subset
...
for (const cut of sorted) {
  if (cut.kind === 'box') {
    if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
    current = makeCut(oc, current, cut.position, cut.size)
  } else {
    if (cut.angle <= 0) continue
    current = makeMitreCut(oc, current, dims, cut)
  }
  if (prev !== current) prev.delete()
}
```

Sort key stays `id.localeCompare` for determinism. Cuts commute, so mixing kinds
in one ordered loop is fine.

## 4. Worker + export plumbing

- `src/geom/occt.worker.ts` `buildPart` `dims.cuts` type → `CutDef[]` (carry
  `kind` + mitre fields). The DEV log `${dims.cuts.length} cut(s)` stays.
- `src/scene/useScene.ts` `buildPart` mapping: pass full cuts (not just
  `{id,position,size}`). `shapeKey` (below) still gates rebuilds.
- `ExportSpec.cuts` (occt.ts) → `CutDef[]`; `makeTransformedShape`/`writeStep`
  already call `makeShape`, so they inherit mitre support once the spec carries
  it. Update `exportStep` mapping in `useScene` to pass full cuts.
- `src/geom/stl.ts` — **no change** (re-meshes from worker geometry).

## 5. `shapeKey` (cache key)

`src/scene/utils.ts` — encode mitre fields so an angle/axis/end change triggers a
rebuild; box encoding unchanged:

```ts
.map((c) =>
  c.kind === 'box'
    ? `b:${c.position.x},${c.position.y},${c.position.z}|${c.size.x},${c.size.y},${c.size.z}`
    : `m:${c.end}|${c.axis}|${c.angle}`,
)
```

(Prefix `b:`/`m:` so a box and mitre with the same id never collide.)

## 6. File format — v3 migration

`src/scene/useFile.ts`:
- `FILE_FORMAT_VERSION = 3`.
- In `parseFile`, map each cut: legacy cuts have no `kind` → default `'box'`:
  ```ts
  cuts: (p.cuts ?? []).map((c) => ('kind' in c ? c : { ...c, kind: 'box' })),
  ```
- Existing newer-version warning + part-kind filter unchanged. Numbers still
  round to 6 dp on serialize (angle is a plain number — fine).

## 7. Scene CRUD (`useScene`)

- **Add** `onAddMitre(partId: PartId)` — appends a `MitreCut` with defaults
  `{ kind:'mitre', end:'+X', axis:'Z', angle:45, label:'Mitre N' }`, new id
  `cut_${uuid}`, with undo/redo (mirror the part-add history pattern; no
  coalesce). Expose in `UseSceneResult` + return.
- **Edit** reuse `onUpdateCut` — its updater `(c: CutDef) => CutDef` already works
  for mitres; guard the pairing branch behind `afterA.kind === 'box' && afterA.pairedCutId`.
- **Remove** reuse `onRemoveCut` — narrow the `c.pairedCutId` scan to
  `c.kind === 'box'`.
- `onLinkCuts`/`onUnlinkCuts` — narrow `.face`/`.size` access to box; mitres never
  reach these (no link UI for them).
- `onDuplicate` cut clone — narrow `pairedCutId: undefined` reset to box cuts;
  mitres clone with a fresh id only.

## 8. UI (`sidebar.tsx`)

- Split `CutRow`: keep the box row as-is; add a `MitreRow` rendering `end`
  (`+X`/`-X` select), `axis` (Flat / Bevel select), `angle` (`NumInput`, °), and a
  delete button → `onRemoveCut`. Edits flow through `onUpdateCut`.
- In `EditPanel`, map `part.cuts`: dispatch `cut.kind === 'mitre' ? <MitreRow/> :
  <CutRow/>`. The list header stays "Cuts" (mitres are cuts).
- Add a small **"+ Mitre"** button beside the Cuts header → `onAddMitre(part.id)`.
- Thread `onAddMitre` through `SidebarProps` and `App.tsx`.

## 9. Drawings (`drawing.ts`, `buildSvg.ts`, `buildDxf.ts`)

- `DrawingView` gains `boardOutline?: Point2D[]` (mm-then-scaled polygon). When
  present, renderers draw the polygon instead of `boardRect`.
- `buildView`: accept the part's mitres affecting this view (flat→Face, bevel→
  Edge); if any, compute `mitreFaceOutline(...)`, scale + apply `flipV`, set
  `boardOutline`. Add a `DimLine`-style mitre **angle label** (e.g. `45°`) near the
  bevelled edge — reuse `cutLabels`/a new `noteLabels` array, or piggyback a text
  via `cutLabels`. Keep it minimal: one angle annotation per mitre.
- `buildDrawingSheets`: pass `p.cuts` filtered by kind into the right views.
  Cover-sheet `cutCount` = `p.cuts.length` (counts both kinds) — acceptable.
- `buildSvg.renderView` / `buildDxf.dxfView`: if `view.boardOutline`, emit an SVG
  `<polygon>` (or `<polyline>` closed) / a DXF `LINE` chain on the `OUTLINE` layer
  instead of the rect. Render the angle label like existing text.

## 10. Test plan (TDD where the seam is pure)

1. `src/geom/mitre.test.ts` — `computeMitreTool` (pivot/axisDir/angleRad/box for
   each end×axis; assert the rotated inner plane passes through expected long/short
   points) and `mitreFaceOutline` (polygon coords for flat `+X`, bevel `+X`,
   `-X`, and a both-ends case). Pure — no OCCT.
2. `src/scene/utils.test.ts` — `shapeKey` changes when angle/axis/end change;
   box-only keys unchanged (regression).
3. `src/scene/useFile.test.ts` — `parseFile` adds `kind:'box'` to legacy cuts;
   v3 round-trips a `MitreCut`.
4. `src/scene/useScene.test.ts` — `onAddMitre` adds a mitre + undo removes it;
   editing via `onUpdateCut` updates angle; `buildPart` receives the mitre in
   `dims.cuts` (assert on the mocked `buildPart`).
5. `src/geom/drawing.test.ts` — a part with a flat mitre yields a `boardOutline`
   on the Face view and none on End; angle label present.
6. `makeMitreCut` / live OCCT — `it.skip` (browser-only). Manual `pnpm dev` smoke.

## 11. Execution order (each step: typecheck + relevant test green)

1. types.ts union + `mitre.ts` pure module + `mitre.test.ts` (TDD). 
2. `shapeKey` + utils.test.
3. occt.ts `makeMitreCut` + `makeShape` dispatch + ExportSpec type.
4. worker + useScene dims/exportStep mapping; narrow union accesses across
   useScene; `onAddMitre`; useScene.test.
5. useFile v3 migration + useFile.test.
6. sidebar `MitreRow` + "+ Mitre" + App wiring.
7. drawing.ts outline + buildSvg/buildDxf polygon + drawing.test.
8. Full `pnpm typecheck && pnpm lint && pnpm test`; manual `pnpm dev` smoke of a
   45° flat mitre + bevel, STL/STEP/SVG/DXF export.
