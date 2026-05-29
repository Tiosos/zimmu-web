# Scene Model + Parameterized Boards — Design Spec

**Date:** 2026-05-29
**Status:** Approved — v3 (post L99 review)
**Scope:** Weekend 2 — replaces the hardcoded box with a live multi-part scene

---

## Goal

Replace the single hardcoded `buildBox(100, 100, 50)` call with a JSON-serializable scene model, a parameterized board primitive, and a sidebar UI that lets the user add, remove, duplicate, and edit multiple boards in real time.

---

## 1. Data Model

New directory: `src/scene/types.ts` — pure types, no logic, no imports from `geom/` or `render/`.

```typescript
export type PartId = string  // `board_${crypto.randomUUID()}` — kind prefix aids debugging

export interface Vec3 { x: number; y: number; z: number }

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number         // mm, local X axis
  width: number          // mm, local Y axis
  thickness: number      // mm, local Z axis
  color: string          // CSS hex e.g. "#d4a373" — human-readable in saved JSON
  position: Vec3         // mm, world space — corner at board's local origin
  rotation: Vec3         // degrees, Euler XYZ order (Three.js convention)
  rotationOrder: 'XYZ'   // locked for now; field exists so any future change is a visible migration
}

export type Part = BoardPart  // | CylinderPart etc. in future weekends

export interface Scene {
  parts: Part[]      // room for metadata (name, units, version) later
}
```

**Key decisions:**
- `color` is a CSS hex string (`"#d4a373"`) not a Three.js hex number. Human-readable in JSON, safe against hand-editing, and `new THREE.Color(part.color)` accepts strings directly.
- `position` is the world-space location of the board's corner (matches OCCT's `BRepPrimAPI_MakeBox` default — corner at origin). Three.js applies this as a mesh transform, not inside OCCT.
- `rotation` is Euler XYZ in degrees. `rotationOrder: 'XYZ'` is explicit so future order changes are a visible model migration, not a silent reinterpretation.
- All fields are plain JSON-safe types — no class instances, no `THREE.Vector3`.
- `visible` and `locked` flags are out of scope for Weekend 2.

### Color Palette

8 muted colors assigned round-robin at part creation. Lives in `App.tsx` (runtime constant, not a type):

```typescript
const PART_COLORS = [
  '#d4a373', '#8ecae6', '#95d5b2', '#ffb703',
  '#cdb4db', '#a8dadc', '#f4a261', '#b7b7a4',
]
```

### First-run Experience

The app starts with one default board pre-added (`Board 1`, `200 × 100 × 25 mm`, origin, `PART_COLORS[0]`) so the viewport is never blank on first load. `useScene` creates this as the initial `scene` state value.

---

## 2. Worker API

`occt.worker.ts` is kept thin — it receives only what OCCT needs, no scene metadata.

`buildBox` (existing) is left in place. Removing it is unrelated cleanup.

### `buildPart` (new)

```typescript
async buildPart(
  kind: Part['kind'],
  dims: { length: number; width: number; thickness: number }
): Promise<MeshData>
```

Dispatches on `kind`. For `'board'`, calls `makeBox(oc, dims.length, dims.width, dims.thickness)`. Shape built at OCCT origin — position and rotation are **not** applied inside OCCT. Three.js handles placement.

The worker does **not** import `Part` from `src/scene/types.ts`. Only the minimal dims cross the boundary; adding fields to `Part` (label, joints, material) never widens the worker interface.

### Shape key

A pure function in `src/scene/utils.ts`. Uses `|` as separator (not `:`) to avoid collisions with future kind names. Exhaustively handles all Part kinds so TypeScript catches unhandled cases at compile time:

```typescript
export function shapeKey(part: Part): string {
  if (part.kind === 'board')
    return `board|${part.length}|${part.width}|${part.thickness}`
  const _: never = part
  throw new Error(`unknown kind: ${(_ as Part).kind}`)
}
```

---

## 3. App State & Geometry Pipeline

A `useScene` custom hook (`src/scene/useScene.ts`) encapsulates all scene state and mutation logic. `App.tsx` calls `useScene()` and passes the results to `<Sidebar>` and `<Viewport>`. This keeps `App.tsx` focused on layout and composition only.

### State owned by `useScene`

```typescript
// Refs — mutated without re-renders
const prevShapeKeys  = useRef<Map<PartId, string>>(new Map())
const buildSeq       = useRef<Map<PartId, number>>(new Map())  // race condition guard
const geometriesRef  = useRef<Map<PartId, THREE.BufferGeometry>>(new Map())
const isMounted      = useRef(true)
const labelCounter   = useRef(1)   // monotonically increasing; never resets on delete
const colorIndex     = useRef(0)   // monotonically increasing; never resets on delete

// State — triggers re-renders
const [scene, setScene]           = useState<Scene>({ parts: [defaultBoard()] })
const [geometries, setGeometries] = useState<Map<PartId, THREE.BufferGeometry>>(new Map())
const [errors, setErrors]         = useState<Map<PartId, string>>(new Map())
const [pendingIds, setPendingIds] = useState<Set<PartId>>(new Set())
const [selectedId, setSelectedId] = useState<PartId | null>(null)
const [occtReady, setOcctReady]   = useState(false)
```

**Geometry storage:** `geometriesRef` always holds the current Map (readable in closures without stale values). `geometries` state is a new Map copy updated to trigger `Viewport` re-renders. Cleanup logic always reads from `geometriesRef.current`.

**Map mutation rule:** `setGeometries` always produces a new Map reference. Never mutate the existing Map in place — React uses reference equality to detect changes.

### Geometry effect

`useEffect` watching `scene`. Rebuilds geometry only for parts whose shape key changed:

```
on scene change:
  for each part in scene.parts:
    if shapeKey(part) !== prevShapeKeys.current.get(part.id):
      seq = (buildSeq.current.get(part.id) ?? 0) + 1
      buildSeq.current.set(part.id, seq)
      prevShapeKeys.current.set(part.id, shapeKey(part))
      setPendingIds(prev => new Set(prev).add(part.id))

      occt.buildPart(part.kind, { length: part.length, width: part.width, thickness: part.thickness })
        .then(data => {
          if (!isMounted.current) return                          // unmounted — discard
          if (buildSeq.current.get(part.id) !== seq) return      // stale — discard
          const geo = buildGeometry(data)
          geometriesRef.current.set(part.id, geo)
          setErrors(prev => { const m = new Map(prev); m.delete(part.id); return m })
          setPendingIds(prev => { const s = new Set(prev); s.delete(part.id); return s })
          setGeometries(new Map(geometriesRef.current))
        })
        .catch(err => {
          if (!isMounted.current || buildSeq.current.get(part.id) !== seq) return
          setPendingIds(prev => { const s = new Set(prev); s.delete(part.id); return s })
          setErrors(prev => new Map(prev).set(part.id, err.message))
        })

  for each id in geometriesRef.current not in scene.parts:
    geometriesRef.current.get(id).dispose()
    geometriesRef.current.delete(id)
    prevShapeKeys.current.delete(id)
    buildSeq.current.delete(id)
    setGeometries(new Map(geometriesRef.current))

effect cleanup (on unmount):
  isMounted.current = false
  geometriesRef.current.forEach(geo => geo.dispose())
  geometriesRef.current.clear()
```

Position and rotation changes do **not** trigger this effect — Three.js applies them directly to the mesh transform, so no worker round-trip occurs.

### OCCT ready state

`useScene` initialises OCCT on mount and sets `occtReady = true` when the worker is ready. Passed to `<Sidebar>` to disable "Add board" until ready. The default board added on first-run queues its `buildPart` call via Comlink; it resolves once OCCT is ready.

### Scene mutations

| Callback | Behaviour |
|---|---|
| `onAdd` | Guard: no-op if `!occtReady`. Increment `labelCounter` and `colorIndex`. Append `BoardPart`: `200 × 100 × 25 mm`, origin, zero rotation, `rotationOrder: 'XYZ'`, `PART_COLORS[colorIndex.current % 8]`, id `board_${crypto.randomUUID()}`, label `Board ${labelCounter.current}`. Call `setScene` and `setSelectedId(newId)` — React 19 batches both. |
| `onRemove(id)` | Dispose `geometriesRef.current.get(id)`, remove from ref + state. Filter part from `scene.parts`. Clear `selectedId` if matched. |
| `onDuplicate(id)` | Increment `colorIndex`. Clone part, new id, `PART_COLORS[colorIndex.current % 8]`, position offset `+part.length + 10 mm` on world X, **rotation reset to zero** (offset is in world X; preserving rotation would produce a wrong gap). Append after original. |
| `onUpdate(part)` | Replace matching part in `scene.parts`. |

**`nextLabel`** — `useScene` exposes `nextLabel: string` computed as `` `Board ${labelCounter.current + 1}` `` so `<Sidebar>` can reset an empty label input on blur without accessing App-level refs.

**Geometry disposal ownership:** `useScene` disposes `BufferGeometry` on part removal and on unmount. `Viewport` disposes materials and edge geometries it creates; it never disposes `BufferGeometry` passed in via props.

---

## 4. Viewport

### Props

```typescript
interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
}
```

(`errors` and `pendingIds` are displayed in the sidebar, not the viewport.)

### Internal refs

```typescript
const meshes    = useRef<Map<PartId, THREE.Mesh>>(new Map())
const edgeLines = useRef<Map<PartId, THREE.LineSegments>>(new Map())  // parallel Map, not mesh children
const raycaster = useRef(new THREE.Raycaster())
const mouseDown = useRef<{ x: number; y: number } | null>(null)
```

`LineSegments` stored in a parallel ref (not as `mesh.children[0]`) avoids fragile child-index assumptions if a mesh gains other children in future.

### Mesh management

`useEffect` watching `parts` and `geometries` syncs the Three.js scene:

- **New part + geometry ready** → create `MeshStandardMaterial({ color: part.color, roughness: 0.7, metalness: 0.0, flatShading: true })`, create `Mesh`; create `LineSegments` from `EdgesGeometry` (threshold 15°, `LineBasicMaterial` color `0x1a1a1d`); add both to scene as separate objects (not parent/child — keeps raycasting clean); store in refs
- **Geometry updated** (dimension change) → swap `mesh.geometry`; dispose old edge geometry; create new `LineSegments`; update `edgeLines` ref
- **Position/rotation changed** → set `mesh.position` and `edgeLines.position` from `part.position`; set `mesh.rotation` and `edgeLines.rotation` from `part.rotation` (degrees × π/180, Euler XYZ); keep both in sync
- **Part removed** → remove mesh + edgeLines from scene; dispose material, edge geometry, edge material (BufferGeometry disposed by `useScene`)
- **Selection changed** → iterate all edgeLines: selected id → `LineBasicMaterial.color.set(0x4fc3f7)`; all others → `0x1a1a1d`; selected mesh → `emissive.set(0x222244)`; all others → `emissive.set(0x000000)`

### Raycasting

Event listeners on `renderer.domElement` (not `window`):

```
on 'mousedown':
  record mouseDown.current = { x: e.clientX, y: e.clientY }

on 'click':
  if Math.hypot(e.clientX - mouseDown.x, e.clientY - mouseDown.y) > 4: return  // orbit drag
  update raycaster from camera + mouse position
  intersect Array.from(meshes.current.values()), recursive: false  // critical: skip LineSegments children
  on hit: onPartClick(id looked up from mesh → meshes map)
  on miss: onPartClick(null)
```

`raycaster` ref is created once (scene-setup effect), not per click.

### Scene setup changes

- `camera.position.set(250, -200, 150)` — 3/4 view of boards near origin with +Z-up (X-right, Y-into-scene in CAD convention)
- `controls.target.set(0, 0, 0)`
- Lights, grid, renderer, OrbitControls: untouched

---

## 5. Sidebar UI

New file: `src/ui/sidebar.tsx`. Plain React with inline styles. Dark theme: `#1a1a1d` background, `#333` borders, `#ccc` text.

### Props

```typescript
interface SidebarProps {
  scene: Scene
  occtReady: boolean
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  nextLabel: string              // computed in useScene, e.g. "Board 3"
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (part: Part) => void
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
}
```

### Layout

Flex column, `width: 240px`, `height: 100%`, `flexDirection: 'column'`. Three stacked regions:

1. **List region** — `flex: 1`, `overflowY: 'auto'`
2. **Edit panel** — `flexShrink: 0`, rendered only when `selectedId` is set
3. **"Add board" button** — `flexShrink: 0`, always visible

**Minimum supported width:** 800px total (560px viewport + 240px sidebar). Narrower widths are out of scope.

### List region

Each row:
```
[indicator 12×12px] [label, overflow: ellipsis] [⧉] [✕]
```

- **Indicator states:** color swatch (idle) → spinning `⟳` (pending build, CSS `animation: spin 1s linear infinite`) → `⚠` in red with row tooltip showing error message (build failed)
- **Selected row:** background `#2a2a2d`
- **Label:** `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`, `flex: 1`, `minWidth: 0`
- **Icons:** Unicode `⧉` (duplicate) and `✕` (delete); no icon library dependency
- **Empty state:** centered `"No parts — add a board to start"`

### Edit panel

Label input always visible above three collapsible groups. All groups expanded by default; click group header to collapse.

**Group header style:** `fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#888', cursor: 'pointer'` — matches existing app header style.

| Group | Fields |
|---|---|
| Shape | length `mm`, width `mm`, thickness `mm` |
| Position | x `mm`, y `mm`, z `mm` |
| Rotation | rx `°`, ry `°`, rz `°` |

### Input behaviour

- **Label input:** auto-focused when a new part is added (`useEffect` on `selectedId` change + `ref.focus()`). On blur, if empty, silently resets to `nextLabel` prop.
- **Dimension inputs** (length/width/thickness): `useDebouncedCallback(onUpdate, 150)` from `src/ui/useDebouncedCallback.ts`. Clamped to min `1` on blur. `type="number"`, `step="any"` (fractional mm valid — 25.4mm = 1 inch).
- **Position/rotation inputs:** call `onUpdate` on `onChange` directly — no debounce, no worker round-trip. `type="number"`, `step="any"`.
- **Units:** non-interactive `<span>` suffix — `"mm"` or `"°"`.

### "Add board" button

- Disabled and visually muted (`opacity: 0.4`) when `!occtReady`
- `title="Loading geometry engine…"` tooltip when disabled

---

## 6. App.tsx changes

`App.tsx` calls `useScene()` and composes the layout. It no longer manages any state directly.

- Header updates: `"Zimmu · v0.1 · weekend 2"` + dynamic part count (e.g., `"3 parts"`)
- Layout: flex row — `<Viewport>` fills remaining width, `<Sidebar>` fixed 240px right

---

## 7. File Structure

```
src/
├── scene/
│   ├── types.ts                  Part, Scene, PartId, Vec3
│   ├── utils.ts                  shapeKey (pure, no deps)
│   └── useScene.ts               scene state + geometry pipeline hook
├── geom/
│   ├── occt.ts                   (unchanged)
│   ├── occt.worker.ts            + buildPart(kind, dims) → MeshData
│   ├── mesh.ts                   (unchanged)
│   └── occt.test.ts              + smoke test for buildPart
├── render/
│   └── viewport.tsx              updated props, mesh+edge maps, raycasting
├── ui/
│   ├── sidebar.tsx               new
│   └── useDebouncedCallback.ts   new — debounce hook for dimension inputs
├── App.tsx                       calls useScene(), composes layout + header
├── main.tsx                      (unchanged)
└── vite-env.d.ts                 (unchanged)
```

---

## 8. Testing

- **`scene/utils.test.ts`** — `shapeKey` for board case; `never` throw for unknown kind
- **`ui/useDebouncedCallback.test.ts`** — fires after delay, not before; cancels on rapid re-calls
- **`occt.test.ts`** — smoke test: `buildPart('board', { length: 100, width: 50, thickness: 25 })` (skip in Node, same guard as existing test)
- **`ui/sidebar.test.tsx`** — render with mock callbacks; simulate: add → `onAdd` called; delete → `onRemove(id)`; duplicate → `onDuplicate(id)`; row click → `onSelect(id)`; empty label blur → label resets to `nextLabel`; disabled state when `occtReady=false`
- **`scene/useScene.test.ts`** — shape-key comparison logic and sequence guard in isolation (mock OCCT worker)

OCCT geometry correctness is verified visually in the browser.

---

## 9. Out of Scope (Weekend 2)

- File save/load (model is JSON-ready but not wired to disk)
- Smooth normals (curved surfaces)
- Boolean operations / joints
- Undo/redo
- Drag-to-reorder parts list
- shadcn/ui (Weekend 4)
- Free-rotation gizmo in viewport
- Board presets (1×4, 2×4 lumber sizes)
- Keyboard shortcuts (Delete to remove selected, Escape to deselect, Cmd+D to duplicate)
- `visible` and `locked` part flags
- Mobile / viewport widths below 800px
