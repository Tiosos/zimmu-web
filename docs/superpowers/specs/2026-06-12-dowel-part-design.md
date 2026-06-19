# Dowel Part — Sub-project 1: Primitive + BOM + Per-length Rate

**Date:** 2026-06-12
**Status:** Approved design

## Context

Zimmu's geometry kernel knows exactly one primitive, `BoardPart` (a box with
axis-aligned box cuts). The scene model was designed for more
(`Part = BoardPart // | CylinderPart etc.`). Dowels/round stock are the most
important missing joinery primitive.

"Full board parity" (cuts, snap-align, 2D drawings on a cylinder) is three
separate interaction-design problems, each ill-defined on a curved surface and
each its own cycle. This spec covers only the well-bounded, shippable first
unit. The remainder is decomposed and queued:

| Sub-project | Contents | Status |
|---|---|---|
| **1. Dowel primitive + BOM** | type, OCCT cylinder, mesh, viewport, add/duplicate, dims editor, STL/STEP, Dowels BOM + per-length rate | **This spec** |
| 2. Dowel cuts | end miters / cross-cuts; `useAddCut` for cylinder faces | Later cycle |
| 3. Dowel snap-align | cap-to-face snapping; `snapMath` cylinder variant | Later cycle |
| 4. Dowel 2D drawings | circle + rectangle orthographic views, Ø/length dims | Later cycle |

## Goal

A user can add a dowel, see it in the 3D viewport, edit its diameter/length,
position and rotate it, duplicate it, export it to STL/STEP, and see it costed
in the BOM by linear ($/m) rate — all participating in undo/redo and file
save/load.

## Blast radius (verified against current code)

Kind-agnostic, **no change needed**:
- `transform.ts` — `composeWorldMatrix` uses only position/rotation.
- `mesh.ts` — walks faces generically; a cylinder triangulates as-is.
- `stl.ts` — consumes already-built geometries + `composeWorldMatrix`.
- Cutting list `groupParts` — already guards `if (p.kind !== 'board') continue`.

Board-shaped, **must become kind-aware**:
- `useScene.ts:159` — `buildPart(part.kind, {length,width,thickness,cuts})`.
- `useScene.ts:768` — `exportStep` maps parts to board-shaped `ExportSpec`.
- `useScene.ts:329` — `onDuplicate` casts `as BoardPart`.
- `sidebar.tsx:396` — `EditPanel` returns `null` for non-board kinds.

## Design

### 1. Data model (`src/scene/types.ts`)

```ts
export interface CylinderPart {
  kind: 'cylinder'
  id: PartId
  label: string
  diameter: number   // mm
  length: number     // mm — extent along local +Z
  material: string   // "" means unspecified
  color: string
  position: Vec3     // base-circle center (local origin lies on the axis)
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
}

export type Part = BoardPart | CylinderPart
```

- **Diameter, not radius** — dowels are specified by diameter (6/8/10 mm). OCCT
  takes radius; convert `diameter / 2` at the geometry seam only.
- **No `cuts` field** — cuts are SP2. Do not add a placeholder.
- **Local axis:** length runs along **+Z**, base circle centered at the local
  origin in the XY plane, extending to `z = length`. Matches the OCCT
  `BRepPrimAPI_MakeCylinder` default; least transform code. Note this differs
  from `BoardPart`'s corner-at-origin anchoring — a dowel's axis passes through
  its local origin. Intentional and natural for a cylinder.

`MaterialDef` gains an optional linear rate:

```ts
export interface MaterialDef {
  costPerM2: number
  costPerM?: number  // linear rate ($/m) for round/linear stock (dowels)
}
```

- Boards cost by `costPerM2`; dowels by `costPerM`.
- Optional and backward-compatible: **no `FILE_FORMAT_VERSION` bump.** v2 files
  load with `costPerM` undefined (= no dowel cost until the user sets a rate).
  The IndexedDB `library` store is a value store; the added field needs no
  schema bump.

### 2. Geometry seam (`src/geom/occt.ts` + `occt.worker.ts`)

`occt.ts` — new primitive:

```ts
export function makeCylinder(
  oc: OpenCascadeInstance,
  radius: number,
  height: number,
): TopoDS_Shape {
  const builder = new oc.BRepPrimAPI_MakeCylinder_2(radius, height)
  const shape = builder.Shape()
  builder.delete()
  return shape
}
```

- Exact overload (`_2(R, H)` = default axis, base at origin, +Z) confirmed via
  the `add-geometry` skill's live-spike step before relying on it.

`occt.worker.ts` — `buildPart` refactored from positional `(kind, dims)` to a
single **discriminated spec**:

```ts
type BuildSpec =
  | { kind: 'board'; length: number; width: number; thickness: number; cuts: Cut[] }
  | { kind: 'cylinder'; diameter: number; length: number }

async buildPart(spec: BuildSpec) {
  const oc = await initOCCT()
  switch (spec.kind) {
    case 'board': { /* makeShape */ }
    case 'cylinder': { /* makeCylinder(oc, spec.diameter / 2, spec.length) */ }
  }
}
```

- The exhaustiveness `never` check is preserved in the `default` branch.
- `mesh.ts` is unchanged. The curved lateral surface renders as flat-shaded
  facets (tessellation governed by `angularDeflection: 0.5`), consistent with
  current rendering. Smooth normals remain deferred.

### 3. Export seam (`src/geom/occt.ts` + `src/scene/useScene.ts`)

`ExportSpec` becomes a discriminated union, both arms carrying `label` +
`matrix`:

```ts
export type ExportSpec =
  | { kind: 'board'; label; length; width; thickness; cuts; matrix }
  | { kind: 'cylinder'; label; diameter; length; matrix }
```

- `makeTransformedShape` branches: board → `makeShape`, cylinder →
  `makeCylinder`.
- `useScene.exportStep` builds the kind-appropriate arm from each part.
- **STL** (`buildBinaryStl`) is unchanged.

### 4. Scene operations (`src/scene/useScene.ts`)

- `onAdd(kind: 'board' | 'cylinder')` via `makeDefaultPart(kind)`. Dowel
  defaults: **Ø8 × 100 mm**, label `Dowel N` (label counter computed per kind,
  mirroring the existing `Board N` logic).
- `onDuplicate` — remove the `as BoardPart` cast; duplicate generically (new id,
  new label, offset position). The board branch keeps cut-id regeneration;
  cylinder has none.
- `buildPart` call site (`:159`) builds a `BuildSpec` from `part`.

### 5. UI

**Add control (`src/ui/sidebar.tsx`):** two buttons — **`+ Board`** and
**`+ Dowel`**. Simplest and discoverable; no dropdown. Each calls
`onAdd('board' | 'cylinder')`.

**`EditPanel`:** stop returning `null` for non-board. Restructure into:
- Shared header: label, material, color.
- **Kind-specific dimensions block** — board: Length/Width/Thickness; dowel:
  Diameter/Length.
- Shared: position, rotation, visible toggle, linked-hardware section.
- Cuts panel: **board-only** (no cuts on a dowel in v1).

**2D drawings guard:** `buildDrawingSheet`/`DrawingViewer` assume a board. The
shop-drawings entry is **disabled when the selected part is a dowel** in v1
(drawings are SP4).

### 6. BOM (per-length cost + Dowels section)

`src/ui/buildCsv.ts`:

```ts
export interface DowelRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string
  diameter: number
  length: number
  costPerUnit: number | null  // null = no costPerM rate for this material
  totalCost: number | null
}

export function groupDowels(
  parts: Part[],
  materials: Record<string, MaterialDef>,
): DowelRow[]
```

- Group key: `Ø|length|material|color`. `costPerUnit = (length / 1000) *
  costPerM` when `costPerM` is set, else `null`.
- New CSV block header: `Qty,Labels,Material,Color,Diameter (mm),Length (mm),Cost/unit,Total`
  with a `Dowel total` subtotal row (mirroring the board/hardware subtotal
  pattern and column alignment).

`src/ui/BomModal.tsx`: **gains a 4th tab, "Dowels"**, mirroring the Boards tab —
a small `DowelList` table component with a per-row `costPerM` rate popover and
its own CSV export. (Alternative considered: a second table inside the Boards
tab — rejected for symmetry with the existing Boards / Hardware / Library tab
structure.)

`Library` tab: gains a `costPerM` ($/m) input column alongside `costPerM2`, so
one material can carry both rates. `useMaterialLibrary.saveRate` already takes a
full `MaterialDef`; the input writes `{ costPerM2, costPerM }`. The
`effectiveMaterials` merge in `App.tsx` carries both fields.

### 7. Testing

- `shapeKey` — cylinder key (`cylinder|{diameter}|{length}`); position/rotation
  do not change it.
- `occt.test.ts` — `makeCylinder` smoke test (`it.skip` when WASM unavailable).
- worker `buildPart` cylinder branch (mocked OCCT).
- `ExportSpec` cylinder mapping in `exportStep`.
- `groupDowels` + dowel CSV (rate set / rate unset / grouping / subtotal).
- `EditPanel` renders dowel dimension inputs (Ø, length) for a cylinder part.
- `useScene` — `onAdd('cylinder')` adds a dowel; `onDuplicate` of a dowel.
- App integration — adding a dowel renders and appears in the Dowels BOM tab.

### 8. Out of scope (later cycles)

Dowel cuts (SP2), snap-align (SP3), 2D drawings (SP4), curved-surface smooth
shading. A single material name carrying both board (`costPerM2`) and dowel
(`costPerM`) use is allowed — both rates coexist on `MaterialDef`.

## Open decisions resolved with the user

- Scope: SP1 only (primitive + BOM + per-length rate); cuts/snap/drawings queued.
- Cost: per-length ($/m) via new optional `MaterialDef.costPerM`.
- BOM layout: separate **Dowels** tab.
- Orientation: length along **+Z**, base at local origin.
- No file-format version bump (optional backward-compatible field).
- 2D drawings disabled for dowels in v1.
