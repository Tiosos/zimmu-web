# Scene Model + Parameterized Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `buildBox(100, 100, 50)` call with a JSON-serializable scene model, a `useScene` hook driving a geometry pipeline, and a sidebar UI for adding, removing, duplicating, and editing multiple boards.

**Architecture:** `useScene` (`src/scene/useScene.ts`) owns all scene state, geometry pipeline, and mutations. The viewport is rewritten to maintain `Map<PartId, THREE.Mesh>` and `Map<PartId, THREE.LineSegments>` refs synced to incoming props. The sidebar is a new component with collapsible edit groups and a debounced dimension hook. `App.tsx` is reduced to layout + composition.

**Tech Stack:** React 19, TypeScript strict, Three.js, Comlink, Vitest + happy-dom, @testing-library/react

---

### Task 1: Scene types + shape key utility

**Files:**
- Create: `src/scene/types.ts`
- Create: `src/scene/utils.ts`
- Create: `src/scene/utils.test.ts`

- [ ] **Step 1: Create `src/scene/types.ts`**

```typescript
export type PartId = string

export interface Vec3 { x: number; y: number; z: number }

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number         // mm, local X axis
  width: number          // mm, local Y axis
  thickness: number      // mm, local Z axis
  color: string          // CSS hex e.g. "#d4a373"
  position: Vec3         // mm, world space — corner at board's local origin
  rotation: Vec3         // degrees, Euler XYZ order (Three.js convention)
  rotationOrder: 'XYZ'
}

export type Part = BoardPart

export interface Scene {
  parts: Part[]
}
```

- [ ] **Step 2: Write the failing test for `shapeKey`**

Create `src/scene/utils.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { BoardPart } from './types'
import { shapeKey } from './utils'

const board: BoardPart = {
  kind: 'board', id: 'board_test', label: 'Test',
  length: 200, width: 100, thickness: 25, color: '#d4a373',
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ',
}

describe('shapeKey', () => {
  it('encodes kind and dimensions', () => {
    expect(shapeKey(board)).toBe('board|200|100|25')
  })

  it('changes when length changes', () => {
    expect(shapeKey({ ...board, length: 300 })).not.toBe(shapeKey(board))
  })

  it('does not change when position changes', () => {
    expect(shapeKey({ ...board, position: { x: 10, y: 20, z: 30 } })).toBe(shapeKey(board))
  })

  it('does not change when label or color changes', () => {
    expect(shapeKey({ ...board, label: 'X', color: '#fff' })).toBe(shapeKey(board))
  })
})
```

- [ ] **Step 3: Run — confirm FAIL**

```bash
pnpm test src/scene/utils.test.ts
```

Expected: FAIL — `Cannot find module './utils'`

- [ ] **Step 4: Create `src/scene/utils.ts`**

```typescript
import type { Part } from './types'

export function shapeKey(part: Part): string {
  if (part.kind === 'board')
    return `board|${part.length}|${part.width}|${part.thickness}`
  const _: never = part
  throw new Error(`unknown kind: ${(_ as Part).kind}`)
}
```

- [ ] **Step 5: Run — confirm PASS**

```bash
pnpm test src/scene/utils.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/scene/types.ts src/scene/utils.ts src/scene/utils.test.ts
git commit -m "Add scene types and shapeKey utility"
```

---

### Task 2: `useDebouncedCallback` hook

**Files:**
- Create: `src/ui/useDebouncedCallback.ts`
- Create: `src/ui/useDebouncedCallback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/useDebouncedCallback.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedCallback } from './useDebouncedCallback'

describe('useDebouncedCallback', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('does not call the callback immediately', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 150))
    act(() => { result.current('hello') })
    expect(cb).not.toHaveBeenCalled()
  })

  it('calls the callback after the delay', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 150))
    act(() => { result.current('hello') })
    act(() => { vi.advanceTimersByTime(150) })
    expect(cb).toHaveBeenCalledWith('hello')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('cancels earlier call on rapid re-calls', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 150))
    act(() => { result.current('first') })
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { result.current('second') })
    act(() => { vi.advanceTimersByTime(150) })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('second')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
pnpm test src/ui/useDebouncedCallback.test.ts
```

Expected: FAIL — `Cannot find module './useDebouncedCallback'`

- [ ] **Step 3: Create `src/ui/useDebouncedCallback.ts`**

```typescript
import { useRef, useCallback } from 'react'

export function useDebouncedCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback(
    (...args: T) => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => { callbackRef.current(...args) }, delay)
    },
    [delay],
  )
}
```

- [ ] **Step 4: Run — confirm PASS**

```bash
pnpm test src/ui/useDebouncedCallback.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/useDebouncedCallback.ts src/ui/useDebouncedCallback.test.ts
git commit -m "Add useDebouncedCallback hook"
```

---

### Task 3: Worker `buildPart` method

**Files:**
- Modify: `src/geom/occt.worker.ts`
- Modify: `src/geom/occt.test.ts`

- [ ] **Step 1: Replace `src/geom/occt.worker.ts`**

```typescript
import { expose, transfer } from 'comlink'
import { initOCCT, makeBox } from './occt'
import { shapeToMeshData } from './mesh'

const api = {
  async buildBox(dx: number, dy: number, dz: number) {
    const oc = await initOCCT()
    const shape = makeBox(oc, dx, dy, dz)
    const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
    shape.delete()
    return transfer(data, [data.positions.buffer, data.normals.buffer])
  },

  async buildPart(
    kind: 'board',
    dims: { length: number; width: number; thickness: number },
  ) {
    const oc = await initOCCT()
    if (kind === 'board') {
      const shape = makeBox(oc, dims.length, dims.width, dims.thickness)
      const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
      shape.delete()
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
```

- [ ] **Step 2: Add smoke test to `src/geom/occt.test.ts`**

Add after the existing `it('exports initOCCT and makeBox', ...)` test:

```typescript
it.skip('buildPart: board produces mesh data (browser-only)', () => {
  // Full integration verified manually: pnpm dev → add a board → geometry renders
  // Playwright E2E arrives in weekend 11.
})
```

- [ ] **Step 3: Run typecheck + tests**

```bash
pnpm typecheck && pnpm test src/geom/occt.test.ts
```

Expected: no type errors; tests pass (skipped shown as skipped)

- [ ] **Step 4: Commit**

```bash
git add src/geom/occt.worker.ts src/geom/occt.test.ts
git commit -m "Add buildPart to OCCT worker"
```

---

### Task 4: `useScene` hook

**Files:**
- Create: `src/scene/useScene.ts`

- [ ] **Step 1: Create `src/scene/useScene.ts`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { wrap } from 'comlink'
import type { OcctWorkerApi } from '../geom/occt.worker'
import type { BoardPart, Part, PartId, Scene } from './types'
import { shapeKey } from './utils'

const PART_COLORS = [
  '#d4a373', '#8ecae6', '#95d5b2', '#ffb703',
  '#cdb4db', '#a8dadc', '#f4a261', '#b7b7a4',
]

// Lazy singleton — not instantiated at module load so vi.stubGlobal('Worker') works in tests
let _occt: ReturnType<typeof wrap<OcctWorkerApi>> | null = null
function getOcct() {
  if (!_occt) {
    const w = new Worker(new URL('../geom/occt.worker.ts', import.meta.url), { type: 'module' })
    _occt = wrap<OcctWorkerApi>(w)
  }
  return _occt
}

function buildGeometry(data: { positions: Float32Array; normals: Float32Array }): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3))
  return geo
}

function makeDefaultBoard(): BoardPart {
  return {
    kind: 'board',
    id: `board_${crypto.randomUUID()}`,
    label: 'Board 1',
    length: 200, width: 100, thickness: 25,
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
  }
}

export interface UseSceneResult {
  scene: Scene
  geometries: Map<PartId, THREE.BufferGeometry>
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  selectedId: PartId | null
  occtReady: boolean
  nextLabel: string
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (part: Part) => void
  onSelect: (id: PartId | null) => void
}

export function useScene(): UseSceneResult {
  const [scene, setScene]           = useState<Scene>(() => ({ parts: [makeDefaultBoard()] }))
  const [geometries, setGeometries] = useState<Map<PartId, THREE.BufferGeometry>>(new Map())
  const [errors, setErrors]         = useState<Map<PartId, string>>(new Map())
  const [pendingIds, setPendingIds] = useState<Set<PartId>>(new Set())
  const [selectedId, setSelectedId] = useState<PartId | null>(null)
  const [occtReady, setOcctReady]   = useState(false)

  const prevShapeKeys  = useRef<Map<PartId, string>>(new Map())
  const buildSeq       = useRef<Map<PartId, number>>(new Map())
  const geometriesRef  = useRef<Map<PartId, THREE.BufferGeometry>>(new Map())
  const isMounted      = useRef(true)
  const occtReadyRef   = useRef(false)
  const labelCounter   = useRef(1)
  const colorIndex     = useRef(0)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      geometriesRef.current.forEach(geo => geo.dispose())
      geometriesRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const partIds = new Set(scene.parts.map(p => p.id))

    for (const part of scene.parts) {
      const key = shapeKey(part)
      if (key === prevShapeKeys.current.get(part.id)) continue

      const seq = (buildSeq.current.get(part.id) ?? 0) + 1
      buildSeq.current.set(part.id, seq)
      prevShapeKeys.current.set(part.id, key)
      setPendingIds(prev => new Set(prev).add(part.id))

      getOcct()
        .buildPart(part.kind, { length: part.length, width: part.width, thickness: part.thickness })
        .then(data => {
          if (!isMounted.current) return
          if (buildSeq.current.get(part.id) !== seq) return
          const geo = buildGeometry(data)
          geometriesRef.current.set(part.id, geo)
          if (!occtReadyRef.current) { occtReadyRef.current = true; setOcctReady(true) }
          setErrors(prev => { const m = new Map(prev); m.delete(part.id); return m })
          setPendingIds(prev => { const s = new Set(prev); s.delete(part.id); return s })
          setGeometries(new Map(geometriesRef.current))
        })
        .catch((err: unknown) => {
          if (!isMounted.current || buildSeq.current.get(part.id) !== seq) return
          setPendingIds(prev => { const s = new Set(prev); s.delete(part.id); return s })
          setErrors(prev => new Map(prev).set(part.id, err instanceof Error ? err.message : String(err)))
        })
    }

    const removed: PartId[] = []
    for (const [id] of geometriesRef.current) {
      if (!partIds.has(id)) removed.push(id)
    }
    for (const id of removed) {
      geometriesRef.current.get(id)?.dispose()
      geometriesRef.current.delete(id)
      prevShapeKeys.current.delete(id)
      buildSeq.current.delete(id)
    }
    if (removed.length > 0) setGeometries(new Map(geometriesRef.current))
  }, [scene])

  const onAdd = useCallback(() => {
    if (!occtReady) return
    labelCounter.current += 1
    colorIndex.current += 1
    const id: PartId = `board_${crypto.randomUUID()}`
    const part: BoardPart = {
      kind: 'board', id,
      label: `Board ${labelCounter.current}`,
      length: 200, width: 100, thickness: 25,
      color: PART_COLORS[colorIndex.current % PART_COLORS.length],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
    }
    setScene(prev => ({ parts: [...prev.parts, part] }))
    setSelectedId(id)
  }, [occtReady])

  const onRemove = useCallback((id: PartId) => {
    geometriesRef.current.get(id)?.dispose()
    geometriesRef.current.delete(id)
    prevShapeKeys.current.delete(id)
    buildSeq.current.delete(id)
    setGeometries(new Map(geometriesRef.current))
    setScene(prev => ({ parts: prev.parts.filter(p => p.id !== id) }))
    setSelectedId(prev => (prev === id ? null : prev))
  }, [])

  const onDuplicate = useCallback((id: PartId) => {
    setScene(prev => {
      const idx = prev.parts.findIndex(p => p.id === id)
      if (idx === -1) return prev
      const orig = prev.parts[idx] as BoardPart
      colorIndex.current += 1
      const clone: BoardPart = {
        ...orig,
        id: `board_${crypto.randomUUID()}`,
        color: PART_COLORS[colorIndex.current % PART_COLORS.length],
        position: { ...orig.position, x: orig.position.x + orig.length + 10 },
        rotation: { x: 0, y: 0, z: 0 },
      }
      const parts = [...prev.parts]
      parts.splice(idx + 1, 0, clone)
      return { parts }
    })
  }, [])

  const onUpdate = useCallback((part: Part) => {
    setScene(prev => ({ parts: prev.parts.map(p => (p.id === part.id ? part : p)) }))
  }, [])

  const onSelect = useCallback((id: PartId | null) => { setSelectedId(id) }, [])

  return {
    scene, geometries, errors, pendingIds, selectedId, occtReady,
    nextLabel: `Board ${labelCounter.current + 1}`,
    onAdd, onRemove, onDuplicate, onUpdate, onSelect,
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/scene/useScene.ts
git commit -m "Add useScene hook with geometry pipeline and mutations"
```

---

### Task 5: `useScene` tests

**Files:**
- Create: `src/scene/useScene.test.ts`

- [ ] **Step 1: Create `src/scene/useScene.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockBuildPart = vi.fn()

vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart, buildBox: vi.fn() }),
  expose: vi.fn(),
  transfer: vi.fn((data: unknown) => data),
}))

vi.stubGlobal('Worker', vi.fn(() => ({})))

import { useScene } from './useScene'

describe('useScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  it('starts with one default board labelled "Board 1"', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.scene.parts[0].label).toBe('Board 1')
    expect(result.current.scene.parts[0].kind).toBe('board')
  })

  it('starts with occtReady false', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.occtReady).toBe(false)
  })

  it('sets occtReady true after first buildPart resolves', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
  })

  it('onAdd is a no-op when occtReady is false', () => {
    const { result } = renderHook(() => useScene())
    act(() => { result.current.onAdd() })
    expect(result.current.scene.parts).toHaveLength(1)
  })

  it('onAdd appends a new board when occtReady is true', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].label).toBe('Board 2')
  })

  it('onAdd auto-selects the new part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })
    const newId = result.current.scene.parts[1].id
    expect(result.current.selectedId).toBe(newId)
  })

  it('onRemove removes the part and clears selectedId when matched', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })
    const id = result.current.scene.parts[1].id
    act(() => { result.current.onRemove(id) })
    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.selectedId).toBeNull()
  })

  it('onUpdate replaces the matching part', () => {
    const { result } = renderHook(() => useScene())
    const original = result.current.scene.parts[0]
    act(() => { result.current.onUpdate({ ...original, label: 'Updated' }) })
    expect(result.current.scene.parts[0].label).toBe('Updated')
  })

  it('onDuplicate appends a clone after the original', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => { result.current.onDuplicate(id) })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].id).not.toBe(id)
  })

  it('onDuplicate resets rotation to zero', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const original = result.current.scene.parts[0]
    act(() => { result.current.onUpdate({ ...original, rotation: { x: 45, y: 0, z: 0 } }) })
    act(() => { result.current.onDuplicate(original.id) })
    expect(result.current.scene.parts[1].rotation).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('nextLabel increments with each add', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    expect(result.current.nextLabel).toBe('Board 2')
    act(() => { result.current.onAdd() })
    expect(result.current.nextLabel).toBe('Board 3')
  })
})
```

- [ ] **Step 2: Run tests — fix any failures before continuing**

```bash
pnpm test src/scene/useScene.test.ts
```

Expected: PASS — 11 tests

- [ ] **Step 3: Run all tests to confirm no regressions**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/scene/useScene.test.ts
git commit -m "Add useScene tests"
```

---

### Task 6: Viewport rewrite

**Files:**
- Modify: `src/render/viewport.tsx`

- [ ] **Step 1: Replace `src/render/viewport.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'stats.js'
import type { Part, PartId } from '../scene/types'

interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
}

export function Viewport({ parts, geometries, selectedId, onPartClick }: ViewportProps) {
  const mountRef   = useRef<HTMLDivElement | null>(null)
  const sceneRef   = useRef<THREE.Scene | null>(null)
  const cameraRef  = useRef<THREE.PerspectiveCamera | null>(null)
  const meshes     = useRef<Map<PartId, THREE.Mesh>>(new Map())
  const edgeLines  = useRef<Map<PartId, THREE.LineSegments>>(new Map())
  const raycaster  = useRef(new THREE.Raycaster())
  const mouseDown  = useRef<{ x: number; y: number } | null>(null)
  const onClickRef = useRef(onPartClick)
  onClickRef.current = onPartClick

  // Scene setup — runs once
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1d)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 10000)
    camera.position.set(250, -200, 150)
    camera.up.set(0, 0, 1)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0)
    keyLight.position.set(200, 300, 400)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
    fillLight.position.set(-200, -100, -100)
    scene.add(fillLight)

    scene.add(new THREE.AxesHelper(50))
    const grid = new THREE.GridHelper(400, 20, 0x444444, 0x2a2a2d)
    grid.rotation.x = Math.PI / 2
    scene.add(grid)

    let stats: Stats | undefined
    if (import.meta.env.DEV) {
      stats = new Stats()
      stats.showPanel(0)
      stats.dom.style.cssText = 'position:absolute;top:0;left:0;cursor:pointer;opacity:0.9;z-index:20;'
      mount.appendChild(stats.dom)
    }

    let frame = 0
    const animate = () => {
      stats?.begin()
      controls.update()
      renderer.render(scene, camera)
      stats?.end()
      frame = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    const handleMouseDown = (e: MouseEvent) => {
      mouseDown.current = { x: e.clientX, y: e.clientY }
    }

    const handleClick = (e: MouseEvent) => {
      if (!mouseDown.current) return
      if (Math.hypot(e.clientX - mouseDown.current.x, e.clientY - mouseDown.current.y) > 4) return
      const rect = renderer.domElement.getBoundingClientRect()
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.current.setFromCamera({ x: nx, y: ny }, camera)
      const hits = raycaster.current.intersectObjects(Array.from(meshes.current.values()), false)
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh
        for (const [id, m] of meshes.current) {
          if (m === hit) { onClickRef.current(id); return }
        }
      }
      onClickRef.current(null)
    }

    renderer.domElement.addEventListener('mousedown', handleMouseDown)
    renderer.domElement.addEventListener('click', handleClick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousedown', handleMouseDown)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      renderer.dispose()
      if (stats && mount.contains(stats.dom)) mount.removeChild(stats.dom)
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [])

  // Mesh management — syncs Three.js scene to parts + geometries + selectedId
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const deg2rad = Math.PI / 180
    const partMap = new Map(parts.map(p => [p.id, p]))

    // Remove meshes for deleted parts
    for (const [id, mesh] of meshes.current) {
      if (!partMap.has(id)) {
        scene.remove(mesh)
        ;(mesh.material as THREE.Material).dispose()
        meshes.current.delete(id)
      }
    }
    for (const [id, el] of edgeLines.current) {
      if (!partMap.has(id)) {
        scene.remove(el)
        el.geometry.dispose()
        ;(el.material as THREE.Material).dispose()
        edgeLines.current.delete(id)
      }
    }

    // Add or update
    for (const part of parts) {
      const geo = geometries.get(part.id)
      if (!geo) continue

      const rx = part.rotation.x * deg2rad
      const ry = part.rotation.y * deg2rad
      const rz = part.rotation.z * deg2rad

      const existing = meshes.current.get(part.id)
      if (!existing) {
        const mat = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.7, metalness: 0.0, flatShading: true })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(part.position.x, part.position.y, part.position.z)
        mesh.rotation.set(rx, ry, rz, part.rotationOrder)
        scene.add(mesh)
        meshes.current.set(part.id, mesh)

        const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1d })
        const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat)
        el.position.copy(mesh.position)
        el.rotation.copy(mesh.rotation)
        scene.add(el)
        edgeLines.current.set(part.id, el)
      } else {
        if (existing.geometry !== geo) {
          existing.geometry = geo
          const el = edgeLines.current.get(part.id)!
          el.geometry.dispose()
          el.geometry = new THREE.EdgesGeometry(geo, 15)
        }
        existing.position.set(part.position.x, part.position.y, part.position.z)
        existing.rotation.set(rx, ry, rz, part.rotationOrder)
        const el = edgeLines.current.get(part.id)!
        el.position.copy(existing.position)
        el.rotation.copy(existing.rotation)
      }
    }

    // Selection highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(id === selectedId ? 0x4fc3f7 : 0x1a1a1d)
    }
    for (const [id, mesh] of meshes.current) {
      ;(mesh.material as THREE.MeshStandardMaterial).emissive.setHex(id === selectedId ? 0x222244 : 0x000000)
    }
  }, [parts, geometries, selectedId])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/render/viewport.tsx
git commit -m "Rewrite Viewport for multi-part scene with raycasting"
```

---

### Task 7: Sidebar UI

**Files:**
- Create: `src/ui/sidebar.tsx`

- [ ] **Step 1: Create `src/ui/sidebar.tsx`**

```typescript
import { useState, useEffect } from 'react'
import type { Part, PartId, Scene } from '../scene/types'
import { useDebouncedCallback } from './useDebouncedCallback'

interface SidebarProps {
  scene: Scene
  occtReady: boolean
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  nextLabel: string
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (part: Part) => void
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
}

const s = {
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', cursor: 'pointer', userSelect: 'none' } as React.CSSProperties,
  iconBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 } as React.CSSProperties,
  inputRow: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 } as React.CSSProperties,
  input: { flex: 1, background: '#111', border: '1px solid #444', color: '#ccc', padding: '3px 6px', fontSize: 12, borderRadius: 2, minWidth: 0 } as React.CSSProperties,
  suffix: { fontSize: 11, color: '#666', flexShrink: 0 } as React.CSSProperties,
  groupHdr: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#888', cursor: 'pointer', padding: '6px 0 2px', userSelect: 'none' } as React.CSSProperties,
}

function DimInput({ value, onCommit, suffix, min = 1 }: { value: number; onCommit: (v: number) => void; suffix: string; min?: number }) {
  const debounced = useDebouncedCallback(onCommit, 150)
  return (
    <div style={s.inputRow}>
      <input type="number" step="any" style={s.input} defaultValue={value}
        onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= min) debounced(v) }}
        onBlur={e => { const v = parseFloat(e.target.value); if (!isFinite(v) || v < min) { e.target.value = String(min); onCommit(min) } }}
      />
      <span style={s.suffix}>{suffix}</span>
    </div>
  )
}

function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div style={s.inputRow}>
      <input type="number" step="any" style={s.input} defaultValue={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
      <span style={s.suffix}>{suffix}</span>
    </div>
  )
}

function EditPanel({ part, onUpdate, nextLabel }: { part: Part; onUpdate: (p: Part) => void; nextLabel: string }) {
  const [shapeOpen, setShapeOpen] = useState(true)
  const [posOpen, setPosOpen]     = useState(true)
  const [rotOpen, setRotOpen]     = useState(true)
  if (part.kind !== 'board') return null
  // `autoFocus` fires on mount. EditPanel is keyed by part.id in Sidebar,
  // so it remounts on every selection change — focusing the label each time.
  return (
    <div style={{ padding: 8, borderTop: '1px solid #333' }}>
      <div style={s.inputRow}>
        <input autoFocus style={{ ...s.input, flex: 1 }} defaultValue={part.label}
          onChange={e => onUpdate({ ...part, label: e.target.value })}
          onBlur={e => { if (!e.target.value.trim()) { e.target.value = nextLabel; onUpdate({ ...part, label: nextLabel }) } }}
        />
      </div>
      <div style={s.groupHdr} onClick={() => setShapeOpen(v => !v)}>{shapeOpen ? '▾' : '▸'} Shape</div>
      {shapeOpen && <>
        <DimInput value={part.length}    suffix="mm" onCommit={v => onUpdate({ ...part, length: v })} />
        <DimInput value={part.width}     suffix="mm" onCommit={v => onUpdate({ ...part, width: v })} />
        <DimInput value={part.thickness} suffix="mm" onCommit={v => onUpdate({ ...part, thickness: v })} />
      </>}
      <div style={s.groupHdr} onClick={() => setPosOpen(v => !v)}>{posOpen ? '▾' : '▸'} Position</div>
      {posOpen && <>
        <NumInput value={part.position.x} suffix="mm" onChange={v => onUpdate({ ...part, position: { ...part.position, x: v } })} />
        <NumInput value={part.position.y} suffix="mm" onChange={v => onUpdate({ ...part, position: { ...part.position, y: v } })} />
        <NumInput value={part.position.z} suffix="mm" onChange={v => onUpdate({ ...part, position: { ...part.position, z: v } })} />
      </>}
      <div style={s.groupHdr} onClick={() => setRotOpen(v => !v)}>{rotOpen ? '▾' : '▸'} Rotation</div>
      {rotOpen && <>
        <NumInput value={part.rotation.x} suffix="°" onChange={v => onUpdate({ ...part, rotation: { ...part.rotation, x: v } })} />
        <NumInput value={part.rotation.y} suffix="°" onChange={v => onUpdate({ ...part, rotation: { ...part.rotation, y: v } })} />
        <NumInput value={part.rotation.z} suffix="°" onChange={v => onUpdate({ ...part, rotation: { ...part.rotation, z: v } })} />
      </>}
    </div>
  )
}

export function Sidebar({ scene, occtReady, errors, pendingIds, nextLabel, onAdd, onRemove, onDuplicate, onUpdate, selectedId, onSelect }: SidebarProps) {
  const selectedPart = scene.parts.find(p => p.id === selectedId) ?? null

  // Inject keyframes for pending spinner animation
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  return (
    <div style={{ width: 240, height: '100%', background: '#1a1a1d', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {scene.parts.length === 0 ? (
          <div style={{ padding: 16, color: '#555', fontSize: 12, textAlign: 'center' }}>No parts — add a board to start</div>
        ) : scene.parts.map(part => {
          const isPending = pendingIds.has(part.id)
          const error = errors.get(part.id)
          return (
            <div key={part.id} style={{ ...s.row, background: part.id === selectedId ? '#2a2a2d' : 'transparent' }} onClick={() => onSelect(part.id)}>
              {error
                ? <span title={error} style={{ fontSize: 12, color: '#e74c3c' }}>⚠</span>
                : isPending
                  ? <span style={{ fontSize: 12, color: '#888', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                  : <div style={{ width: 12, height: 12, borderRadius: 2, flexShrink: 0, background: part.color }} />
              }
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#ccc' }}>
                {part.label}
              </span>
              <button style={s.iconBtn} title="Duplicate" onClick={e => { e.stopPropagation(); onDuplicate(part.id) }}>⧉</button>
              <button style={s.iconBtn} title="Delete" onClick={e => { e.stopPropagation(); onRemove(part.id) }}>✕</button>
            </div>
          )
        })}
      </div>
      {selectedPart && <EditPanel key={selectedPart.id} part={selectedPart} onUpdate={onUpdate} nextLabel={nextLabel} />}
      <div style={{ padding: 8, borderTop: '1px solid #333' }}>
        <button onClick={onAdd} disabled={!occtReady} title={!occtReady ? 'Loading geometry engine…' : undefined}
          style={{ width: '100%', padding: '7px 0', background: occtReady ? '#2a2a4a' : '#222', color: occtReady ? '#ccc' : '#555', border: '1px solid #444', borderRadius: 3, cursor: occtReady ? 'pointer' : 'not-allowed', fontSize: 12 }}>
          + Add board
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/sidebar.tsx
git commit -m "Add Sidebar UI component"
```

---

### Task 8: Sidebar tests

**Files:**
- Create: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Create `src/ui/sidebar.test.tsx`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from './sidebar'
import type { Part, PartId, Scene } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board', id: 'board_t1', label: 'Board 1',
    length: 200, width: 100, thickness: 25, color: '#d4a373',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ',
    ...overrides,
  }
}

function props(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return {
    scene: { parts: [makeBoard()] } as Scene,
    occtReady: true,
    errors: new Map<PartId, string>(),
    pendingIds: new Set<PartId>(),
    nextLabel: 'Board 2',
    onAdd: vi.fn(), onRemove: vi.fn(), onDuplicate: vi.fn(),
    onUpdate: vi.fn(), selectedId: null, onSelect: vi.fn(),
    ...overrides,
  }
}

describe('Sidebar', () => {
  it('renders part label', () => {
    render(<Sidebar {...props()} />)
    expect(screen.getByText('Board 1')).toBeTruthy()
  })

  it('shows empty state when no parts', () => {
    render(<Sidebar {...props({ scene: { parts: [] } })} />)
    expect(screen.getByText(/No parts/)).toBeTruthy()
  })

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn()
    render(<Sidebar {...props({ onSelect })} />)
    fireEvent.click(screen.getByText('Board 1'))
    expect(onSelect).toHaveBeenCalledWith('board_t1')
  })

  it('calls onAdd when Add board clicked', () => {
    const onAdd = vi.fn()
    render(<Sidebar {...props({ onAdd })} />)
    fireEvent.click(screen.getByText('+ Add board'))
    expect(onAdd).toHaveBeenCalled()
  })

  it('Add board button is disabled when occtReady is false', () => {
    render(<Sidebar {...props({ occtReady: false })} />)
    expect((screen.getByText('+ Add board').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onRemove when delete clicked', () => {
    const onRemove = vi.fn()
    render(<Sidebar {...props({ onRemove })} />)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onRemove).toHaveBeenCalledWith('board_t1')
  })

  it('calls onDuplicate when duplicate clicked', () => {
    const onDuplicate = vi.fn()
    render(<Sidebar {...props({ onDuplicate })} />)
    fireEvent.click(screen.getByTitle('Duplicate'))
    expect(onDuplicate).toHaveBeenCalledWith('board_t1')
  })

  it('shows edit panel when a part is selected', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/Shape/i)).toBeTruthy()
    expect(screen.getByText(/Position/i)).toBeTruthy()
    expect(screen.getByText(/Rotation/i)).toBeTruthy()
  })

  it('hides edit panel when nothing is selected', () => {
    render(<Sidebar {...props({ selectedId: null })} />)
    expect(screen.queryByText('▾ Shape')).toBeNull()
  })

  it('shows pending spinner for in-flight parts', () => {
    render(<Sidebar {...props({ pendingIds: new Set(['board_t1']) })} />)
    expect(screen.getByText('⟳')).toBeTruthy()
  })

  it('shows error indicator for failed parts', () => {
    render(<Sidebar {...props({ errors: new Map([['board_t1', 'OCCT failed']]) })} />)
    expect(screen.getByText('⚠')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — fix any failures**

```bash
pnpm test src/ui/sidebar.test.tsx
```

Expected: PASS — 11 tests

- [ ] **Step 3: Commit**

```bash
git add src/ui/sidebar.test.tsx
git commit -m "Add Sidebar tests"
```

---

### Task 9: App.tsx wiring + implementation notes

**Files:**
- Modify: `src/App.tsx`
- Create: `docs/superpowers/notes/2026-05-29-scene-model-notes.md`

- [ ] **Step 1: Replace `src/App.tsx`**

```typescript
import { useScene } from './scene/useScene'
import { Viewport } from './render/viewport'
import { Sidebar } from './ui/sidebar'

function App() {
  const {
    scene, geometries, errors, pendingIds, selectedId, occtReady, nextLabel,
    onAdd, onRemove, onDuplicate, onUpdate, onSelect,
  } = useScene()

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <header style={{ position: 'absolute', top: 12, left: 16, zIndex: 10, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', opacity: 0.75 }}>
          Zimmu · v0.1 · weekend 2
        </header>
        <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10, fontSize: 12, opacity: 0.65 }}>
          {scene.parts.length} {scene.parts.length === 1 ? 'part' : 'parts'}
        </div>
        <Viewport
          parts={scene.parts}
          geometries={geometries}
          selectedId={selectedId}
          onPartClick={onSelect}
        />
      </div>
      <Sidebar
        scene={scene}
        occtReady={occtReady}
        errors={errors}
        pendingIds={pendingIds}
        nextLabel={nextLabel}
        onAdd={onAdd}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        onUpdate={onUpdate}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  )
}

export default App
```

- [ ] **Step 2: Create `docs/superpowers/notes/2026-05-29-scene-model-notes.md`**

```markdown
# Scene Model Implementation Notes

- **PART_COLORS placement:** Spec said `App.tsx` but moved to `useScene.ts` — all part creation lives there. App.tsx has no mutation code.
- **`occtReady` detection:** Spec described a `buildBox` ping. Implementation sets ready on the first successful `buildPart` resolve instead — avoids a wasted call since the default board triggers one immediately.
- **`edgeLines` as separate scene objects:** LineSegments added directly to the scene (not as mesh children) so `recursive: false` raycasting stays clean. Both objects require position/rotation sync on every transform change.
- **`_occt` lazy singleton:** Worker not instantiated at module load — allows `vi.stubGlobal('Worker', ...)` to work in tests before any effect runs.
- **Uncontrolled dimension inputs:** `DimInput` uses `defaultValue` + `key` at the `EditPanel` level (via `key={part.id}`). Avoids cursor-jump during typing while still resetting when the selected part changes.
- **`occtReadyRef`:** A separate ref guards the `setOcctReady(true)` call inside async `.then()` to avoid stale closure over the `occtReady` state value.
```

- [ ] **Step 3: Run full check**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: no errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx docs/superpowers/notes/2026-05-29-scene-model-notes.md
git commit -m "Wire App.tsx to useScene, add implementation notes"
```

- [ ] **Step 5: Push**

```bash
git push -u origin claude/festive-rubin-z7biQ
```

- [ ] **Step 6: Verify minimum supported width**

Resize browser to ~800px total width. Sidebar (240px) + viewport (560px) should be usable. No code change needed — narrower widths are out of scope per spec.

- [ ] **Step 7: Smoke test in the browser**

```bash
pnpm dev
```

Open `http://localhost:5173`. Verify:
- One board renders in the viewport with a pending spinner in the sidebar
- After ~5s (OCCT loads), geometry appears and "Add board" enables
- Clicking "Add board" adds a new board with a different color
- Editing length/width/thickness rebuilds geometry (short delay)
- Editing position/rotation moves the mesh instantly
- Clicking a board in the viewport highlights it blue and selects its sidebar row
- Clicking empty viewport space deselects
- Duplicate creates an adjacent copy with reset rotation
- Delete removes the board from both viewport and sidebar
- Header shows correct part count
