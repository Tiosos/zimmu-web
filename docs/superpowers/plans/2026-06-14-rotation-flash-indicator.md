# Rotation Flash Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a face-to-face snap that changes the source part's rotation, briefly flash that part's mesh emissive from blue (`#60a5fa`) to black over 400 ms; pure-translation snaps do not flash.

**Architecture:** `useSnap.ts` detects when rotation changed and fires an optional callback; `App.tsx` converts that callback into a `flashTarget` state value and passes it to `<Viewport>`; `viewport.tsx` watches `flashTarget` in a `useEffect`, records flash start times in a ref-backed `Map`, and lerps the mesh emissive in the existing `animate()` loop every frame.

**Tech Stack:** React 19 hooks (`useState`, `useEffect`, `useRef`), Three.js `MeshStandardMaterial.emissive`, TypeScript strict mode.

**Spec:** `docs/superpowers/specs/2026-06-14-rotation-flash-indicator-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/scene/useSnap.ts` | Add `onRotationSnap?: (id: PartId) => void` param; compute `rotationChanged`; call callback after `onUpdate` |
| `src/App.tsx` | Import `PartId`; add `flashTarget` state; wire `onRotationSnap`; pass `flashTarget` to `<Viewport>` |
| `src/render/viewport.tsx` | Add `flashTarget` prop to interface + destructure; add `flashMap` ref; add `useEffect` to register flash start; add emissive lerp loop in `animate()` |

---

### Task 1: Add `onRotationSnap` callback to `useSnap.ts`

**Files:**
- Modify: `src/scene/useSnap.ts`

- [ ] **Step 1: Read the current file**

Read `src/scene/useSnap.ts` to locate the exact lines you'll edit. Key landmarks:
- `export function useSnap(params: {` — the params type block
- `const { parts, onUpdate } = params` — the destructure line
- The `onUpdate(srcFace.partId, ...)` call near the end of `onFaceClick` — insert detection after this

- [ ] **Step 2: Add `onRotationSnap` to the params type**

Find the params type block:
```ts
export function useSnap(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
}): SnapState {
```

Replace with:
```ts
export function useSnap(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
  onRotationSnap?: (id: PartId) => void
}): SnapState {
```

- [ ] **Step 3: Destructure `onRotationSnap` from params**

Find:
```ts
  const { parts, onUpdate } = params
```

Replace with:
```ts
  const { parts, onUpdate, onRotationSnap } = params
```

- [ ] **Step 4: Add rotation-change detection and callback after `onUpdate`**

Find the `onUpdate` call in `onFaceClick` (it's a one-liner near the end of the callback):
```ts
onUpdate(srcFace.partId, (p) => ({ ...p, position, rotation }), `Snap ${sourceLabel} to ${targetLabel}`)
```

Replace with:
```ts
onUpdate(srcFace.partId, (p) => ({ ...p, position, rotation }), `Snap ${sourceLabel} to ${targetLabel}`)
const rotationChanged =
  Math.abs(rotation.x - srcPart.rotation.x) > 0.001 ||
  Math.abs(rotation.y - srcPart.rotation.y) > 0.001 ||
  Math.abs(rotation.z - srcPart.rotation.z) > 0.001
if (rotationChanged) onRotationSnap?.(srcFace.partId)
```

`srcPart.rotation` is the rotation **before** the snap (captured earlier in the same callback scope), so the comparison is always before vs after.

- [ ] **Step 5: Run typecheck and lint**

```bash
cd /home/user/zimmu-web && pnpm typecheck && pnpm lint
```

Expected: zero errors. `onRotationSnap` is optional (`?`) so callers that don't pass it (App.tsx currently) are still valid.

- [ ] **Step 6: Run tests**

```bash
cd /home/user/zimmu-web && pnpm test
```

Expected: all 385 tests pass (no test file for `useSnap`, existing suite is unaffected).

- [ ] **Step 7: Commit**

```bash
cd /home/user/zimmu-web && git add src/scene/useSnap.ts && git commit -m "feat(snap): add onRotationSnap callback to useSnap"
```

---

### Task 2: Wire `flashTarget` through `App.tsx` and animate in `viewport.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/render/viewport.tsx`

Both files change in this task because the prop flows directly from one to the other — splitting them would leave a TypeScript error between commits.

- [ ] **Step 1: Add `PartId` to the App.tsx type import**

Find in `src/App.tsx` (line 16):
```ts
import type { CameraState } from './scene/types'
```

Replace with:
```ts
import type { CameraState, PartId } from './scene/types'
```

- [ ] **Step 2: Add `flashTarget` state in `App.tsx`**

Find the existing state declarations near the top of the component body (around line 77):
```ts
  const [loadedCamera, setLoadedCamera] = useState<CameraState | null>(null)
```

Add immediately after:
```ts
  const [flashTarget, setFlashTarget] = useState<{ id: PartId; seq: number } | null>(null)
```

`seq: performance.now()` is a monotonically increasing timestamp that forces React to treat a second flash on the same part as a new value even if `id` is identical.

- [ ] **Step 3: Wire `onRotationSnap` into `useSnap` in `App.tsx`**

Find:
```ts
  } = useSnap({ parts: scene.parts, onUpdate })
```

Replace with:
```ts
  } = useSnap({
    parts: scene.parts,
    onUpdate,
    onRotationSnap: (id) => setFlashTarget({ id, seq: performance.now() }),
  })
```

- [ ] **Step 4: Pass `flashTarget` to `<Viewport>` in `App.tsx`**

Find the `<Viewport` JSX block (around line 275). Add `flashTarget` as the last prop before the closing `/>`:
```tsx
          onFaceHoverCut={onFaceHoverCut}
          flashTarget={flashTarget}
        />
```

- [ ] **Step 5: Add `flashTarget` to the `ViewportProps` interface in `viewport.tsx`**

Find the interface (lines 9–25):
```ts
interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
  cameraStateRef: { current: CameraState }
  loadedCamera: CameraState | null
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  cutActive: boolean
  onFaceClickCut: (hit: FaceHit) => void
  onFaceHoverCut: (hit: FaceHit | null) => void
}
```

Replace with:
```ts
interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
  cameraStateRef: { current: CameraState }
  loadedCamera: CameraState | null
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  cutActive: boolean
  onFaceClickCut: (hit: FaceHit) => void
  onFaceHoverCut: (hit: FaceHit | null) => void
  flashTarget?: { id: PartId; seq: number } | null
}
```

- [ ] **Step 6: Destructure `flashTarget` in the `Viewport` function signature**

Find the destructure block in `export function Viewport({`:
```ts
  onFaceHoverCut,
}: ViewportProps) {
```

Replace with:
```ts
  onFaceHoverCut,
  flashTarget,
}: ViewportProps) {
```

- [ ] **Step 7: Add `flashMap` ref in `viewport.tsx`**

Find the existing refs near the top of the `Viewport` component body (around line 48):
```ts
  const meshes = useRef<Map<PartId, THREE.Mesh>>(new Map())
  const edgeLines = useRef<Map<PartId, THREE.LineSegments>>(new Map())
```

Add immediately after:
```ts
  const flashMap = useRef<Map<PartId, number>>(new Map())
```

`flashMap` maps part id → flash start time (`performance.now()` ms). The animate loop reads it every frame.

- [ ] **Step 8: Add `useEffect` to register flash start time**

Add this `useEffect` anywhere after the `flashMap` ref declaration (keep it near the other viewport `useEffect`s, before the large mesh-management one):

```ts
  useEffect(() => {
    if (!flashTarget) return
    flashMap.current.set(flashTarget.id, performance.now())
  }, [flashTarget])
```

When `flashTarget` changes (new `{ id, seq }` object), this records the start time in `flashMap`. The `seq` field ensures the effect fires even if the same part id is flashed twice.

- [ ] **Step 9: Add emissive lerp to the `animate()` loop**

Find the `animate` function body (around line 220):
```ts
    const animate = () => {
      stats?.begin()
      controls.update()
      const src = sourceHighlightRef.current
      if (src?.visible) {
        ;(src.material as THREE.LineBasicMaterial).opacity =
          0.3 + 0.7 * (Math.sin(Date.now() / 300) * 0.5 + 0.5)
      }
      renderer.render(scene, camera)
```

Add the flash loop **after** the snap-pulse block and **before** `renderer.render(...)`:

```ts
    const animate = () => {
      stats?.begin()
      controls.update()
      const src = sourceHighlightRef.current
      if (src?.visible) {
        ;(src.material as THREE.LineBasicMaterial).opacity =
          0.3 + 0.7 * (Math.sin(Date.now() / 300) * 0.5 + 0.5)
      }
      const now = performance.now()
      for (const [id, startMs] of flashMap.current) {
        const t = Math.min(1, (now - startMs) / 400)
        const mesh = meshes.current.get(id)
        if (mesh) {
          const intensity = 1 - t
          ;(mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(
            (0x60 / 255) * intensity,
            (0xa5 / 255) * intensity,
            (0xfa / 255) * intensity,
          )
        }
        if (t >= 1) flashMap.current.delete(id)
      }
      renderer.render(scene, camera)
```

`#60a5fa` = RGB(0x60=96, 0xa5=165, 0xfa=250). At `t = 0`, emissive is full blue; at `t = 1` it's black and the entry is removed from the map.

- [ ] **Step 10: Run typecheck and lint**

```bash
cd /home/user/zimmu-web && pnpm typecheck && pnpm lint
```

Expected: zero errors. All three files compile cleanly with the new prop flowing `useSnap → App → Viewport`.

- [ ] **Step 11: Run tests**

```bash
cd /home/user/zimmu-web && pnpm test
```

Expected: all 385 tests pass. No viewport or App tests exist so this confirms no regressions in the rest of the suite.

- [ ] **Step 12: Commit**

```bash
cd /home/user/zimmu-web && git add src/App.tsx src/render/viewport.tsx && git commit -m "feat(snap): flash part mesh emissive blue on rotation snap"
```

---

## Done

After both tasks, test manually:
1. Run `pnpm dev`
2. Add two boards, enter snap mode (S key or snap button)
3. Click a face on board A, then click a non-anti-parallel face on board B — board A should snap and briefly flash blue
4. Click a face on board A, then click the directly opposing face on board B (anti-parallel) — board A translates with no flash
