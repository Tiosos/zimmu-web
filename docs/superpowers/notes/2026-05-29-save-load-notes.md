# Save / Load — Implementation Notes

## 2026-05-29

### False-dirty on startup — must set lastSavedSceneRef before calling onFileLoaded

On startup, the hook reads the last file from IDB and calls `onFileLoaded(envelope)`, which triggers `replaceScene(envelope.scene)` in App. This schedules a React re-render with the new scene. The dirty-tracking `useEffect([scene])` fires on that re-render and compares `JSON.stringify(scene)` against `lastSavedSceneRef.current`. If `lastSavedSceneRef` still holds the default-board snapshot (its initial value), the comparison would find a difference and mark the file dirty incorrectly.

Fix: set `lastSavedSceneRef.current = JSON.stringify(envelope.scene)` **before** calling `onFileLoadedRef.current(envelope)`. This way, when the dirty effect fires after `replaceScene`, the snapshots already match and `isDirty` stays false.

### requestPermission cannot be called at startup — no user gesture

`FileSystemFileHandle.requestPermission()` requires a user gesture (click/keypress). Calling it from a `useEffect` startup sequence throws a security error. We only auto-load the file if `queryPermission({ mode: 'readwrite' }) === 'granted'`. If the permission is `'prompt'`, the user must re-open the file manually. This is a known limitation of the File System Access API.

### IDB write order — only after writable.close()

`writable.close()` flushes the write buffer and may throw (e.g. disk full). If we stored the handle in IDB before close() completed and close() failed, we'd store a handle to a corrupt/incomplete file. The IDB write therefore happens strictly after `await writable.close()` resolves.

### Camera restore via React state, not ref

The camera position/target from the loaded file must trigger Viewport's `useEffect([loadedCamera])`. A plain ref change is invisible to React — effects only fire when state changes. So `loadedCamera` is `useState<CameraState | null>` in App, set on file load. This is slightly wasteful (causes a re-render) but is the correct React pattern for one-shot effects.

### cameraStateRef typed as { current: CameraState }, not React.RefObject<T>

`React.RefObject<T>` has `readonly current: T | null`. The animation loop writes to `cameraStateRef.current` on every frame, which requires a mutable ref. `useRef<CameraState>(initialValue)` returns `MutableRefObject<CameraState>` whose `current` is writable. The prop is typed as `{ current: CameraState }` (plain mutable object) to be explicit about this.

### setProjectName always marks dirty

Renaming a project always sets `isDirty = true`, even if the name is changed back to its saved value. The scene-based dirty effect won't correct this since it only watches `scene`. Accepted for v0.1 — low impact and complex to fix correctly without also tracking the last-saved project name.

### replaceScene disposes all geometries

`replaceScene` disposes every geometry in `geometriesRef.current` before clearing the map, rather than only those whose part IDs are absent from the incoming scene. Since `prevShapeKeys.current.clear()` forces the rebuild effect to recreate geometries for all incoming parts anyway, skipping disposal for "matching ID" parts would leak GPU memory. In practice, file-loaded scenes always have fresh UUIDs (no ID overlap with the current scene), but the code is now correct by construction regardless.

### vitest.setup.ts: jest alias for @testing-library fake-timer compat

`@testing-library/dom`'s `waitFor()` detects fake timers by checking `typeof jest !== 'undefined'`. Vitest uses `vi`, not `jest`, so without the alias, `waitFor()` would set up a `setInterval` that fake timers never advance, causing timeout cascades. The `vitest.setup.ts` exports `globalThis.jest = vi` to make the detection work.

### First-launch vs New file

Intentional distinction: on first launch (no IDB handle), the default board from `useScene`'s initial state is shown. `newFile()` explicitly calls `replaceScene({ parts: [] })` for a blank canvas. This means "New" from the File menu gives an empty scene, while first launch gives the default board. Consistent with typical CAD app behavior where "New" means explicitly starting fresh.
