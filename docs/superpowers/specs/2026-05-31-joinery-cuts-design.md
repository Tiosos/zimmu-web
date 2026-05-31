# Joinery Cuts — Design Spec

**Date:** 2026-05-31
**Status:** Draft — pending user review
**Scope:** Non-destructive rectangular Boolean cuts on board parts — dado, rabbet, half-lap, mortise & tenon with optional pairing

---

## Goal

Let the user cut rectangular voids into boards using OCCT Boolean subtraction. Cuts are non-destructive: stored as data on the board, rebuilt live whenever dimensions change, and fully undoable. The first version supports all rectangular cuts (dado, rabbet, half-lap, bridle joint, mortise, tenon). Mortise and tenon halves can optionally be linked so editing one syncs the other's non-depth dimensions.

---

## 1. Architecture

### New files

| File | Role |
|---|---|
| `src/scene/useAddCut.ts` | Hook: cut placement state machine. Single-click flow. |
| `src/scene/useAddCut.test.ts` | State machine tests via `renderHook`. |

### Modified files

| File | Change |
|---|---|
| `src/scene/types.ts` | Add `CutId`, `CutDef`. Add `cuts: CutDef[]` to `BoardPart`. Extend `FaceHit` with `localHitPoint`. |
| `src/scene/snapMath.ts` | Add `faceAxes`, `defaultCutSize` exports. |
| `src/scene/snapMath.test.ts` | Tests for `faceAxes` and `defaultCutSize`. |
| `src/scene/utils.ts` | Extend `shapeKey` to serialise cuts. |
| `src/scene/useScene.ts` | Add `onRemoveCut`, `onUpdateCut` to hook and `UseSceneResult`. |
| `src/scene/useScene.test.ts` | Tests for both new operations (remove clears paired refs; paired update single undo). |
| `src/geom/occt.ts` | Add `makeCut` primitive. |
| `src/geom/occt.worker.ts` | Extend `buildPart` dims with `cuts`; chain Boolean subtracts. |
| `src/render/viewport.tsx` | Extend `buildFaceHit` with `localHitPoint`; add cut mode routing. |
| `src/ui/sidebar.tsx` | Add Cuts section to `EditPanel`; Add Cut button. |
| `src/App.tsx` | Compose `useAddCut`; wire `C`/Escape shortcuts; mutual exclusion with snap. |
| `src/scene/useFile.ts` | Default `cuts: []` when loading files without cut data. |

### Dependency direction

```
snapMath.ts  ← useAddCut.ts ← App.tsx → Viewport
                                       → Sidebar
occt.ts      ← occt.worker.ts
types.ts     ← useAddCut.ts
              ← useScene.ts
useScene.ts  ← App.tsx
```

`Viewport` does not import `useAddCut` directly — receives cut state as props. `useAddCut` has no Three.js imports — geometry is pre-computed in `buildFaceHit`.

---

## 2. Data Model

### New types in `src/scene/types.ts`

```typescript
export type CutId = string  // globally unique UUID, same pattern as PartId

export interface CutDef {
  id: CutId
  label: string
  face: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'  // entry face (UI metadata; not sent to worker)
  position: Vec3   // corner of cut box in board local space (minimum x/y/z of bounding box)
  size: Vec3       // dx, dy, dz of box to subtract
  pairedCutId?: string  // "{partId}:{cutId}" — optional reference to a mating cut
}
```

**`position` convention:** corner at minimum x/y/z of the cut bounding box, consistent with how boards are defined (corner at local origin). A dado 10mm deep from the `+Z` face of a 25mm board: `position.z = 15`, `size.z = 10`.

**`pairedCutId` format:** `"{partId}:{cutId}"`. Separator `:` is safe — UUIDs never contain `:`. Parse with `ref.split(':')` → `[pairedPartId, pairedCutId]`. `CutId` is globally unique; scanning uses only the `cutId` portion.

**`face` excluded from OCCT:** stored for UI purposes (face-relative labels, cut placement) only. Not sent to the worker; not included in `shapeKey`.

---

### `BoardPart` extension

```typescript
export interface BoardPart {
  // ... existing fields unchanged ...
  cuts: CutDef[]  // empty array when no cuts; defaults to [] on file load
}
```

---

### `FaceHit` extension

```typescript
export interface FaceHit {
  partId: PartId
  faceNormal: Vec3
  faceCenter: Vec3
  localFaceNormal: Vec3
  localHitPoint: Vec3  // intersection point in board local space (new)
}
```

`buildFaceHit` in `viewport.tsx` computes it: `intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())`. Computed from last-rendered `matrixWorld` — consistent with what the user sees. Snap uses `faceCenter`; cut placement uses `localHitPoint`.

---

### File format migration

`FILE_FORMAT_VERSION` stays at 1 — adding `cuts` is backward-compatible. The file loader in `useFile.ts` defaults `cuts` to `[]` when the field is absent:

```typescript
parts: raw.parts.map(p => ({ cuts: [], ...p }))
```

---

## 3. Geometry Pipeline

### `faceAxes` and `defaultCutSize` in `snapMath.ts`

```typescript
type FaceAxis = 'x' | 'y' | 'z'

export function faceAxes(face: CutDef['face']): { depth: FaceAxis; u: FaceAxis; v: FaceAxis } {
  if (face === '+X' || face === '-X') return { depth: 'x', u: 'y', v: 'z' }
  if (face === '+Y' || face === '-Y') return { depth: 'y', u: 'x', v: 'z' }
  return { depth: 'z', u: 'x', v: 'y' }
}

export function defaultCutSize(face: CutDef['face']): Vec3 {
  if (face === '+X' || face === '-X') return { x: 10, y: 20, z: 20 }
  if (face === '+Y' || face === '-Y') return { x: 20, y: 10, z: 20 }
  return { x: 20, y: 20, z: 10 }  // ±Z
}
```

Both exported and tested in `snapMath.test.ts`.

---

### `shapeKey` extension in `utils.ts`

Cuts sorted by `id` before serialisation — stable key regardless of insertion order. Face and label excluded (geometry only):

```typescript
const cutKey = part.cuts
  .slice().sort((a, b) => a.id.localeCompare(b.id))
  .map(c =>
    `${c.position.x},${c.position.y},${c.position.z}|${c.size.x},${c.size.y},${c.size.z}`
  )
  .join(';')
return `board|${part.length}|${part.width}|${part.thickness}|${cutKey}`
```

---

### `makeCut` in `occt.ts`

Uses only `BRepPrimAPI_MakeBox_1` (proven constructor) plus `BRepBuilderAPI_Transform` for positioning — no unverified overloads. `Vec3` imported from `../scene/types` (pure interface, no circular dependency).

```typescript
export function makeCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  position: Vec3,
  size: Vec3,
): TopoDS_Shape {
  const builder = new oc.BRepPrimAPI_MakeBox_1(size.x, size.y, size.z)
  const toolShape = builder.Shape()
  builder.delete()

  const trsf = new oc.gp_Trsf_1()
  trsf.SetTranslation_1(new oc.gp_Vec_4(position.x, position.y, position.z))
  const xform = new oc.BRepBuilderAPI_Transform_2(toolShape, trsf, false)
  const movedTool = xform.Shape()

  const op = new oc.BRepAlgoAPI_Cut_3(shape, movedTool, new oc.Message_ProgressRange_1())
  op.Build(new oc.Message_ProgressRange_1())
  const result = op.Shape()

  // Do NOT delete op before result is consumed — result may reference op's memory.
  xform.delete()
  toolShape.delete()
  op.delete()
  movedTool.delete()

  return result
}
```

**Ownership contract:** `makeCut` does not delete its `shape` argument. The caller owns `shape` and must delete it after each iteration.

**Non-intersecting cut:** if the tool doesn't intersect the board, OCCT returns the original topology. The caller must not assume `result` is a distinct heap object from `shape` — a smoke test must verify this case and use `new oc.TopoDS_Shape(result)` to copy before deleting the input if the binding requires it.

**`op.Shape()` lifetime:** do not call `op.delete()` until the result has been passed to the next operation or consumed. The deletion order above (xform → toolShape → op → movedTool) ensures this.

---

### `buildPart` in `occt.worker.ts`

`dims` gains:

```typescript
cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
// face/label stripped by caller (useScene) before sending to worker
```

Execution — same sort order as `shapeKey` (by `id`):

```typescript
const sorted = cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
let current = makeBox(oc, length, width, thickness)

for (const cut of sorted) {
  if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
  const prev = current
  current = makeCut(oc, current, cut.position, cut.size)
  prev.delete()
}

const data = shapeToMeshData(oc, current, { linearDeflection: 0.1, angularDeflection: 0.5 })
current.delete()
return transfer(data, [data.positions.buffer, data.normals.buffer])
```

**Minimum cut dimension:** `<= 0.1mm` is treated as degenerate and skipped.

**Failed Boolean:** if `!op.IsDone()` inside `makeCut`, the function returns `shape` unchanged and emits `console.warn`. The chain continues with the uncut board for that step.

**Full rebuild on any cut change.** No incremental update. All N Boolean subtracts re-run from scratch on every geometry rebuild.

---

## 4. Click-to-Place UX

### `useAddCut` hook (`src/scene/useAddCut.ts`)

**Hook parameters:**

```typescript
useAddCut(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
  onSelect: (id: PartId) => void
})
```

`parts` is needed to look up `part.cuts.length` for the label. `onSelect` ensures `EditPanel` opens after placement.

**Returned state:**

```typescript
export interface AddCutState {
  cutActive: boolean
  lastPlacedCutId: CutId | null
  hoveredFace: FaceHit | null
  activateCut: () => void   // toggle; stays active after placement for chaining
  cancelCut: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}
```

**`onFaceClick`:**
1. Derives `face` from `hit.localFaceNormal`: the axis with the largest absolute component determines depth (`x`→`±X`, `y`→`±Y`, `z`→`±Z`); the sign of that component determines `+` vs `−`. Since board faces are axis-aligned, exactly one component is ±1. Example: `localFaceNormal = {x:0, y:0, z:1}` → `'+Z'`.
2. Computes `position`, `size` from `hit.localHitPoint` using the table below
2. Creates a new `CutDef` with a UUID, label `"Cut N"` (N = `part.cuts.length + 1`)
3. Calls `onUpdate(hit.partId, p => ({...p, cuts: [...p.cuts, newCut]}), 'Add cut')`
4. Calls `onSelect(hit.partId)` — ensures the board is selected so `EditPanel` opens
5. Sets `lastPlacedCutId = newCut.id`
6. `cutActive` stays `true` for chaining

`lastPlacedCutId` resets to `null` on `cancelCut()`. Empty-space click (`hits.length === 0`): no-op. No Three.js imports — all geometry is pre-computed in `localHitPoint`.

---

### Cut placement math

Default size from `defaultCutSize(face)`. Corner position from `localHitPoint` (already in board local space from `buildFaceHit`):

All `hit.*` references below are `hit.localHitPoint.*` (board-local space, from `buildFaceHit`):

| face | depth corner | U centring | V centring |
|---|---|---|---|
| `+X` | `pos.x = length − 10` | `pos.y = hit.localHitPoint.y − 10` | `pos.z = hit.localHitPoint.z − 10` |
| `−X` | `pos.x = 0` | `pos.y = hit.localHitPoint.y − 10` | `pos.z = hit.localHitPoint.z − 10` |
| `+Y` | `pos.y = width − 10` | `pos.x = hit.localHitPoint.x − 10` | `pos.z = hit.localHitPoint.z − 10` |
| `−Y` | `pos.y = 0` | `pos.x = hit.localHitPoint.x − 10` | `pos.z = hit.localHitPoint.z − 10` |
| `+Z` | `pos.z = thickness − 10` | `pos.x = hit.localHitPoint.x − 10` | `pos.y = hit.localHitPoint.y − 10` |
| `−Z` | `pos.z = 0` | `pos.x = hit.localHitPoint.x − 10` | `pos.y = hit.localHitPoint.y − 10` |

`−10` offsets are half the default 20mm U/V size — centres the cut on the click. These offsets must stay in sync with `defaultCutSize` values.

---

### Viewport routing and rAF guard

Priority: **cut mode → snap mode → normal select**. The rAF hover callback dispatches to exactly one handler per frame:

```typescript
if (cutActiveRef.current)       onFaceHoverCutRef.current(hit)
else if (snapActiveRef.current) onFaceHoverSnapRef.current(hit)
```

Prevents both modes writing to `hoverHighlightRef` in the same frame. Click handler follows the same priority order.

---

### Mode mutual exclusion — App.tsx

```typescript
const handleActivateCut  = () => { cancelSnap(); activateCut() }
const handleActivateSnap = () => { cancelCut();  activateSnap() }
```

Independent hooks; App.tsx owns the mutual exclusion. Silent cancel on mode switch — consistent with pressing Escape.

---

### Sidebar button and keyboard shortcut

Button below "Snap faces": **"Add Cut"** / **"Adding Cut"** — same visual pattern (active state: green tint). `C` key toggles; `Escape` cancels via the existing App.tsx handler. Both guarded by the existing `HTMLInputElement` / `HTMLTextAreaElement` check.

---

## 5. Cut Editing UI

### Cuts section in `EditPanel`

Always rendered when a part is selected — even with zero cuts. Below "Rotation". `lastPlacedCutId` auto-expands the matching row.

Each cut is a collapsible row with six fields using the existing debounced input pattern. Labels derived from `faceAxes(cut.face)`:

| UI label | Internal field |
|---|---|
| Depth | `size[axes.depth]` |
| Width | `size[axes.u]` |
| Height | `size[axes.v]` |
| U offset | `position[axes.u]` |
| V offset | `position[axes.v]` |
| Face | read-only chip (`+Z`, `−X`, etc.) |

"U offset" / "V offset" are the v1 labels. Future: replace with "From left edge" / "From front edge" based on board orientation context.

Each row has a delete button (calls `onRemoveCut`).

---

### `onUpdateCut` in `useScene`

```typescript
onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
```

Added to `UseSceneResult`. History label: `"Edit cut"`.

**Paired propagation — unconditional.** Whenever `pairedCutId` is set, `size[axes(A).u]` and `size[axes(A).v]` are always copied to `size[axes(B).u]` and `size[axes(B).v]` — regardless of which field the user actually changed. No change-detection needed. Each cut's own `faceAxes` mapping determines which Vec3 component is u and which is v.

**Cross-face pairs:** propagation maps u→u and v→v using each cut's own face mapping. For mismatched face orientations (e.g., `+Z` mortise paired with `+X` tenon) the user may need to manually swap width and height after linking. Acknowledged v1 limitation.

**Undo closure for paired update** — captures before/after for both parts in a single `push()`:

```typescript
push({
  label: 'Edit cut',
  undo: () => setScene(prev => ({
    parts: prev.parts.map(p => {
      if (p.id === partIdA) return { ...p, cuts: p.cuts.map(c => c.id === cutIdA ? beforeA : c) }
      if (p.id === partIdB) return { ...p, cuts: p.cuts.map(c => c.id === cutIdB ? beforeB : c) }
      return p
    })
  })),
  redo: () => setScene(prev => ({
    parts: prev.parts.map(p => {
      if (p.id === partIdA) return { ...p, cuts: p.cuts.map(c => c.id === cutIdA ? afterA : c) }
      if (p.id === partIdB) return { ...p, cuts: p.cuts.map(c => c.id === cutIdB ? afterB : c) }
      return p
    })
  })),
})
```

When the cut has no pair, only `partIdA` is updated (standard single-part undo closure).

---

### `onRemoveCut` in `useScene`

```typescript
onRemoveCut: (partId: PartId, cutId: CutId) => void
```

Added to `UseSceneResult`. Atomically removes the cut and clears stale paired references across all parts — single `push()` entry, single undo. Scans using `ref.split(':')[1] === cutId` (safe because `CutId` is globally unique and `:` never appears in UUIDs).

---

### Pairing UI

Each cut row footer:
- **Unpaired:** "Link to cut…" button
- **Paired:** `"↔ Board B › Cut label"` chip + "Unlink" button
- **Stale:** `"Pair lost"` chip (muted red) + "Unlink" button

**Stale detection** — at render time in sidebar:

```typescript
const pairedEntry = cut.pairedCutId
  ? scene.parts
      .flatMap(p => p.cuts.map(c => ({ partId: p.id, cut: c })))
      .find(({ partId: pid, cut: c }) => `${pid}:${c.id}` === cut.pairedCutId)
  : null
const pairLost = !!cut.pairedCutId && !pairedEntry
```

**"Link to cut…" dropdown** — lists all cuts on all other boards as `"Board label › Cut label"` (display) with `"{partId}:{cutId}"` as the value. On selection:
1. Sets `pairedCutId` on both cuts (bidirectional) — one history entry labelled `'Link cuts'`
2. Copies initiating cut's `size[axes.u]` and `size[axes.v]` to target (immediate sync)

**v1 limitation:** boards with duplicate labels produce visually ambiguous dropdown entries. Underlying values remain unique.

**"Unlink"** — clears `pairedCutId` on both sides in a single history entry labelled `'Unlink cuts'`.

---

## 6. Testing

| File | What to test |
|---|---|
| `snapMath.test.ts` | `faceAxes`: all six faces map correctly. `defaultCutSize`: depth axis matches face for all six faces. |
| `occt.test.ts` | `makeCut` smoke test: board with one cut produces fewer triangles than bare board (WASM-only, skip in Node). Non-intersecting cut returns valid shape. |
| `useAddCut.test.ts` | Initial state. Toggle active/inactive. `onFaceClick` creates cut with correct `face`, `position`, `size`, `label`; calls `onUpdate` + `onSelect`. `lastPlacedCutId` set on click, cleared on `cancelCut`. Empty-space click is no-op. Mode stays active after placement. |
| `useScene.test.ts` | `onRemoveCut`: removes cut; clears `pairedCutId` on other parts in same undo entry. `onUpdateCut`: updates cut; propagates non-depth dims to paired cut; single undo restores both parts. |
| `sidebar.test.tsx` | Cuts section renders when part is selected (even with zero cuts). Cut row shows face-relative labels. Delete button calls `onRemoveCut`. |
