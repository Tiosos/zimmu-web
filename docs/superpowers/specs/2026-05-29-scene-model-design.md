# Scene Model + Parameterized Boards — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Scope:** Weekend 2 — replaces the hardcoded box with a live multi-part scene

---

## Goal

Replace the single hardcoded `buildBox(100, 100, 50)` call with a JSON-serializable scene model, a parameterized board primitive, and a sidebar UI that lets the user add, remove, duplicate, and edit multiple boards in real time.

---

## 1. Data Model

New directory: `src/scene/types.ts` — pure types, no logic, no imports from `geom/` or `render/`.

```typescript
export type PartId = string  // crypto.randomUUID()

export interface Vec3 { x: number; y: number; z: number }

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number     // mm, local X axis
  width: number      // mm, local Y axis
  thickness: number  // mm, local Z axis
  color: number      // Three.js hex, assigned from palette at creation
  position: Vec3     // mm, world space — corner at board's local origin
  rotation: Vec3     // degrees, Euler XYZ order (Three.js convention)
}

export type Part = BoardPart  // | CylinderPart etc. in future weekends

export interface Scene {
  parts: Part[]      // room for metadata (name, units, version) later
}
```

**Key decisions:**
- `position` is the world-space location of the board's corner (matches OCCT's `BRepPrimAPI_MakeBox` default — one corner at origin). Three.js applies this as a mesh transform, not inside OCCT.
- `rotation` is Euler XYZ order in degrees, matching Three.js default Euler order. Conversion to radians happens at render time.
- `color` is stored on the Part so it survives serialization and is stable across edits.
- All fields are plain JSON-safe types — no class instances, no `THREE.Vector3`.

### Color Palette

8 muted colors assigned round-robin at part creation. The array lives in `App.tsx` (runtime constant, not a type):

```typescript
const PART_COLORS = [
  0xd4a373, 0x8ecae6, 0x95d5b2, 0xffb703,
  0xcdb4db, 0xa8dadc, 0xf4a261, 0xb7b7a4,
]
```

---

## 2. Worker API

Add one method to `occt.worker.ts` alongside the existing `buildBox`:

```typescript
async buildPart(part: Part): Promise<MeshData>
```

Dispatches on `part.kind`. For `'board'`, calls `makeBox(oc, part.length, part.width, part.thickness)`. The shape is built at the OCCT origin — position and rotation are **not** applied inside OCCT. Three.js handles placement.

`buildBox` is left in place (removing it is unrelated cleanup).

The worker imports `Part` from `src/scene/types.ts`. This is the only cross-boundary import from `scene/` into `geom/` — acceptable since `types.ts` has no logic or side-effects.

### Shape key

A pure function in `src/scene/utils.ts` used by App.tsx to detect dimension changes. Exhaustively handles all Part kinds so TypeScript catches unhandled cases at compile time:

```typescript
export function shapeKey(part: Part): string {
  if (part.kind === 'board') return `board:${part.length}:${part.width}:${part.thickness}`
  const _: never = part
  throw new Error(`unknown kind: ${(_ as Part).kind}`)
}
```

---

## 3. App State & Geometry Pipeline

`App.tsx` owns:

```typescript
const [scene, setScene] = useState<Scene>({ parts: [] })
const [geometries, setGeometries] = useState<Map<PartId, THREE.BufferGeometry>>(new Map())
const [selectedId, setSelectedId] = useState<PartId | null>(null)
const prevShapeKeys = useRef<Map<PartId, string>>(new Map())
const buildSeq = useRef<Map<PartId, number>>(new Map())  // race condition guard
const labelCounter = useRef(0)   // monotonically increasing; never resets on delete
const colorIndex = useRef(0)     // monotonically increasing; never resets on delete
```

### Geometry effect

A `useEffect` watching `scene` rebuilds geometry only for parts whose shape key changed.

**Map mutation rule:** `setGeometries` must always produce a new Map — never mutate the existing one. Use `setGeometries(prev => new Map(prev).set(id, geo))` or spread into a new Map. React uses reference equality to detect state changes.

**Race condition guard:** rapid dimension edits can put multiple `buildPart` calls in-flight for the same part. Use a per-part sequence number — only apply the result if it matches the current sequence:

```
on scene change:
  for each part in scene.parts:
    if shapeKey(part) !== prevShapeKeys.current.get(part.id):
      seq = (buildSeq.current.get(part.id) ?? 0) + 1
      buildSeq.current.set(part.id, seq)
      occt.buildPart(part).then(data => {
        if (buildSeq.current.get(part.id) !== seq) return  // stale result, discard
        geo = buildGeometry(data)
        setGeometries(prev => new Map(prev).set(part.id, geo))
      })
      prevShapeKeys.current.set(part.id, shapeKey(part))
  for each id in geometries not in scene.parts:
    geometries.get(id).dispose()   // caller disposes before removing
    setGeometries(prev => { const m = new Map(prev); m.delete(id); return m })
    prevShapeKeys.current.delete(id)
    buildSeq.current.delete(id)
```

Position and rotation changes do **not** trigger this effect — Three.js applies them directly to the mesh transform, so no worker round-trip occurs.

### Scene mutations (passed as callbacks to Sidebar)

| Callback | Behaviour |
|---|---|
| `onAdd` | Increment `labelCounter` and `colorIndex` refs; append new `BoardPart` with defaults `200 × 100 × 25 mm`, origin, zero rotation, `PART_COLORS[colorIndex % 8]`, label `Board ${labelCounter}`; auto-set `selectedId` to new part's id |
| `onRemove(id)` | Filter part from `scene.parts`; dispose `geometries.get(id)` then remove from map; clear `selectedId` if it matched |
| `onDuplicate(id)` | Increment `colorIndex`; clone part with new `crypto.randomUUID()` id, `PART_COLORS[colorIndex % 8]`, position offset `+part.length + 10 mm` on X so duplicate sits adjacent with a small gap; append after original |
| `onUpdate(part)` | Replace matching part in `scene.parts` |

**Geometry disposal ownership:** App.tsx disposes `BufferGeometry` objects (calls `geo.dispose()`) before removing them from the geometries map — on part removal and on unmount. The viewport disposes materials and edge geometries it creates; it does not dispose the `BufferGeometry` passed in via props.

---

## 4. Viewport

### Props (replaces current `geometry: THREE.BufferGeometry | null`)

```typescript
interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
}
```

### Mesh management

A `meshes: Map<PartId, THREE.Mesh>` ref. A `useEffect` watching `parts` and `geometries` syncs the Three.js scene:

- **New part + geometry ready** → create `MeshStandardMaterial` using `part.color`, create `Mesh`, add `LineSegments` edges child (threshold 15°, default edge color `0x1a1a1d`), add to scene
- **Geometry updated** (dimension change) → swap `mesh.geometry`, remove old edges child and dispose its geometry, add new `LineSegments` child
- **Position/rotation changed** → set `mesh.position` from `part.position`, set `mesh.rotation` from `part.rotation` (degrees × π/180, Euler XYZ)
- **Part removed** → remove mesh from scene, dispose material + edge geometry + edge material (BufferGeometry disposed by App.tsx, not here)
- **Selection changed** → update edges color: selected part gets `0x4fc3f7` (highlight blue), all others get `0x1a1a1d`

### Raycasting

On canvas `mousedown` event, record the pointer position. On canvas `click` event, if the pointer moved more than 4px since mousedown (orbit drag), skip raycasting entirely. Otherwise cast a ray against all meshes in `meshes`. On hit, call `onPartClick(id)`. On miss, call `onPartClick(null)` to deselect.

### Scene setup changes

- `camera.position.set(250, -200, 150)` — good framing for boards placed near origin with +Z-up
- `controls.target` changes from `(50, 50, 25)` to `(0, 0, 0)`
- Everything else in the scene-setup `useEffect` (lights, grid, renderer, OrbitControls) is untouched

---

## 5. Sidebar UI

New file: `src/ui/sidebar.tsx`. Plain React with inline styles. Dark theme matching the existing viewport (`#1a1a1d` background, `#333` borders, `#ccc` text).

### Props

```typescript
interface SidebarProps {
  scene: Scene
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (part: Part) => void
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
}
```

### Layout

Fixed 240px right panel. Viewport fills remaining width. Sidebar is a flex column (`height: 100%`, `flexDirection: 'column'`) with three regions stacked vertically:

1. **List region** — `flex: 1`, `overflowY: 'auto'` — scrolls independently
2. **Edit panel** — `flexShrink: 0` — fixed height below list, only rendered when `selectedId` is set
3. **"Add board" button** — `flexShrink: 0` — always visible at the bottom

**List region:**
- Each row: `[color swatch 12px] [label] [duplicate icon] [delete icon]`
- Selected row: lighter background (`#2a2a2d`)
- Empty state (no parts): centered text — `"No parts — add a board to start"`

**Edit panel:**

| Group | Fields |
|---|---|
| — | Label (text input) |
| Shape | length `mm`, width `mm`, thickness `mm` |
| Position | x `mm`, y `mm`, z `mm` |
| Rotation | rx `°`, ry `°`, rz `°` |

### Input behaviour

- **Dimension inputs** (length/width/thickness): debounced 150ms before calling `onUpdate`. Clamped to min 1mm on blur (silent, no error). Allow fractional values (`step="any"`) — e.g. 25.4mm for 1 inch is valid in joinery.
- **Position/rotation inputs**: call `onUpdate` immediately on `onChange` — no debounce, no worker round-trip.
- **Label input**: auto-focused when part is first added. On blur, if empty, silently reset to the auto-generated label (`Board ${labelCounter.current}`).
- **Auto-focus**: when a new part is added via `onAdd`, the label input is focused automatically.
- **Units**: `mm` or `°` displayed as a non-interactive suffix label beside each input.

---

## 6. File Structure

```
src/
├── scene/
│   ├── types.ts          Part, Scene, PartId, Vec3
│   └── utils.ts          shapeKey (pure, no deps)
├── geom/
│   ├── occt.ts           (unchanged)
│   ├── occt.worker.ts    + buildPart(part: Part) → MeshData
│   ├── mesh.ts           (unchanged)
│   └── occt.test.ts      + smoke test for buildPart
├── render/
│   └── viewport.tsx      updated props, mesh map, raycasting
├── ui/
│   └── sidebar.tsx       new
├── App.tsx               scene state, geometry pipeline, callbacks
├── main.tsx              (unchanged)
└── vite-env.d.ts         (unchanged)
```

---

## 7. Testing

- `occt.test.ts` — add a smoke test for `buildPart` with a `BoardPart` fixture (skip in Node, same pattern as existing `buildBox` test)
- `sidebar.test.tsx` — unit tests for add/remove/duplicate/update callbacks using `@testing-library/react`; no OCCT involved
- `scene/types.ts` — no logic to test; types are verified by `tsc`

OCCT geometry correctness is verified visually in the browser.

---

## 8. Out of Scope (Weekend 2)

- File save/load (model is JSON-ready but not wired to disk)
- Smooth normals (curved surfaces)
- Boolean operations / joints
- Undo/redo
- Drag-to-reorder parts list
- shadcn/ui (Weekend 4)
- Free-rotation gizmo in viewport
- Board presets (1×4, 2×4 lumber sizes)
- Keyboard shortcuts (Delete to remove selected, Escape to deselect, Cmd+D to duplicate)
