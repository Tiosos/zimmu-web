# Rotation Flash Indicator — Design Spec

**Date:** 2026-06-14
**Status:** Approved

## Goal

After a face-to-face snap that changes the source part's rotation, briefly flash that part's mesh emissive from blue (`#60a5fa`) to black over 400 ms. Pure-translation snaps (anti-parallel faces, no rotation change) do not flash. This tells the user "something rotated here" without requiring them to read the sidebar.

---

## Architecture

Three files change. No new files.

| File | Change |
|---|---|
| `src/scene/useSnap.ts` | Add optional `onRotationSnap?: (id: PartId) => void` param; call it after `onUpdate` when `rotationChanged` is true |
| `src/App.tsx` | Add `flashTarget` state (`{ id: PartId; seq: number } \| null`); wire `onRotationSnap` callback into `useSnap`; pass `flashTarget` to `<Viewport>` |
| `src/render/viewport.tsx` | Add `flashTarget` prop; add `flashMapRef`; animate emissive lerp in the existing `animate()` loop |

---

## Rotation detection in `useSnap.ts`

Add to `useSnap` params:

```ts
onRotationSnap?: (id: PartId) => void
```

Inside `onFaceClick`, immediately after the existing `noMove` early-return block, add a rotation-change check:

```ts
const rotationChanged =
  Math.abs(rotation.x - srcPart.rotation.x) > 0.001 ||
  Math.abs(rotation.y - srcPart.rotation.y) > 0.001 ||
  Math.abs(rotation.z - srcPart.rotation.z) > 0.001
```

Call `onRotationSnap?.(srcFace.partId)` immediately after calling `onUpdate(...)`, conditional on `rotationChanged`.

`SnapState` interface and `useSnap` return value are **unchanged** — `onRotationSnap` is params-only.

---

## Signal flow in `App.tsx`

Add state:

```ts
const [flashTarget, setFlashTarget] = useState<{ id: PartId; seq: number } | null>(null)
```

Pass to `useSnap`:

```ts
} = useSnap({
  parts: scene.parts,
  onUpdate,
  onRotationSnap: (id) => setFlashTarget({ id, seq: performance.now() }),
})
```

Pass to `<Viewport>`:

```tsx
flashTarget={flashTarget}
```

`seq` (a monotonically increasing timestamp) ensures React detects a new flash even if the same part is snapped twice in quick succession — `{ id: 'x', seq: 100 }` and `{ id: 'x', seq: 200 }` are different objects, triggering the `useEffect` both times.

---

## Flash animation in `viewport.tsx`

### New prop

```ts
interface ViewportProps {
  // ... existing props ...
  flashTarget?: { id: PartId; seq: number } | null
}
```

### Flash map ref (declare alongside existing refs)

```ts
const flashMap = useRef<Map<PartId, number>>(new Map())
```

Maps `PartId` → flash start time in ms (`performance.now()`).

### useEffect to start a flash

```ts
useEffect(() => {
  if (!flashTarget) return
  flashMap.current.set(flashTarget.id, performance.now())
}, [flashTarget])
```

### Animate loop addition (inside `animate()`, after the snap-pulse block)

```ts
for (const [id, startMs] of flashMap.current) {
  const t = Math.min(1, (performance.now() - startMs) / 400)
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
```

`#60a5fa` = RGB(96, 165, 250). At `t = 0` emissive is full blue; at `t = 1` emissive is black (`{0, 0, 0}`).

### Interaction with selection emissive

The mesh-management `useEffect` (around line 437) sets `emissive.setHex(id === selectedId ? 0x222244 : 0x000000)` whenever parts, geometries, or `selectedId` changes. This runs once when the snap fires (parts update → re-render). The flash then runs frame-by-frame in the animate loop and **overwrites** that emissive. After 400 ms the emissive is left at `{0,0,0}`.

Edge case: if the snapped part is also the selected part, the blue selection emissive (`0x222244`) is overwritten by the flash and not restored automatically (the `useEffect` won't re-run unless `selectedId` or parts change again). Accepted limitation — the visual difference is subtle (`0x222244` is near-black) and the case is unlikely during snap mode.

---

## Out of scope

- Flash for non-rotation snaps (pure-translation snaps are already familiar to the user)
- Multiple simultaneous flashes per part (last flash wins — `Map` key is `PartId`)
- Configurable duration or color
- Flash for undo/redo of snap operations
