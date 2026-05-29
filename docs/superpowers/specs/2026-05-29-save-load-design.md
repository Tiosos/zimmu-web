# Save / Load — Design Spec

**Date:** 2026-05-29  
**Status:** Approved  

---

## Goal

Wire the existing JSON-serializable scene to the filesystem so work survives a page refresh. Add a title bar with filename and dirty-state indicator.

**In scope:** Save, Save As, Open, New, reopen-last-file on startup, unsaved-changes guard.  
**Out of scope:** Auto-save, export (STL/STEP), cloud sync, multi-file workspace, undo/redo.

---

## Section 1: File Format

Extension: `.zimmu`, MIME: `application/json`.  
Pretty-printed with 2-space indent. Floats rounded to 6 decimal places on write.

```json
{
  "version": 1,
  "name": "Garden Shelf",
  "appVersion": "0.1.0",
  "units": "mm",
  "createdAt": "2026-05-29T06:00:00.000Z",
  "updatedAt": "2026-05-29T14:32:11.000Z",
  "camera": {
    "position": { "x": 250, "y": -200, "z": 150 },
    "target":   { "x": 0,   "y": 0,    "z": 0   }
  },
  "scene": {
    "parts": [...]
  }
}
```

**Field notes:**
- `version` drives migration logic. Forward compatibility: if `version > CURRENT_VERSION`, log a warning but attempt to parse.
- `name` is the human-readable project name, editable in the title bar. Defaults to `"Untitled"`. Independent from the OS filename.
- `appVersion` records the build version for debugging; read from `package.json` at build time via Vite's `import.meta.env`.
- `units` is hardcoded to `"mm"` for now; field is reserved for future unit support.
- `createdAt` is captured once on the first save and never overwritten. `updatedAt` is set on every save.
- `camera` saves the viewport state so reopening restores the user's view.
- Unknown `part.kind` values are filtered out with `console.warn` — the rest of the scene loads normally.

---

## Section 2: `useFile` Hook

**Location:** `src/scene/useFile.ts`

### Inputs

```typescript
useFile({
  scene:          Scene,                          // for dirty tracking via useEffect
  getCameraState: () => CameraState,              // called at save time — avoids stale closure
  onFileLoaded:   (envelope: ZimmuFile) => void,  // called on open and startup restore
})
```

`scene` is also stored in a `sceneRef` via `useLayoutEffect` so async save operations always read the latest value without stale closures. `onFileLoaded` and `getCameraState` are stored in refs the same way so the caller doesn't need to memoize them.

### Returns

```typescript
{
  fileReady:    boolean        // true once startup load attempt completes
  fileName:     string | null  // handle.name; null = new/unsaved
  projectName:  string         // envelope "name"; initialises to "Untitled"
  isDirty:      boolean        // scene changed since last save
  fileError:    string | null  // user-facing error message; clears after 5 s or next success

  newFile():     Promise<void>
  openFile():    Promise<void>
  saveFile():    Promise<void>  // falls through to saveAsFile if no handle
  saveAsFile():  Promise<void>
  setProjectName(name: string): void  // also marks isDirty true
}
```

### Types (add to `src/scene/types.ts`)

```typescript
export interface CameraState {
  position: Vec3
  target:   Vec3
}

export interface ZimmuFile {
  version:    number
  name:       string
  appVersion: string
  units:      'mm'
  createdAt:  string
  updatedAt:  string
  camera:     CameraState
  scene:      Scene
}
```

### Version constant

Define in `src/scene/useFile.ts`:

```typescript
export const FILE_FORMAT_VERSION = 1
```

Used in forward-compat check on open (`version > FILE_FORMAT_VERSION`) and written to every saved file.

### Dirty tracking

A `lastSavedSceneRef` stores the scene snapshot at last save (as a JSON string). A `useEffect` watching `scene` sets `isDirty = true` when the snapshot diverges. On any successful save the ref is updated and `isDirty` resets to false. New files start clean; the initial scene — whether loaded from disk or the default board — is the baseline.

**Critical:** When a file is loaded, set `lastSavedSceneRef.current = JSON.stringify(envelope.scene)` *before* calling `onFileLoaded`. This ensures the snapshot matches the incoming scene before React re-renders, preventing a false-dirty state immediately after open.

`createdAt` is captured in a ref on the first save and never overwritten on subsequent saves.

### Startup sequence

1. Read a `FileSystemFileHandle` from IndexedDB key `zimmu-last-file` via `idb.readHandle()`.
2. Call `handle.queryPermission({ mode: 'readwrite' })`. Only proceed if result is `'granted'`. If `'prompt'` or `'denied'`, skip to step 5 — `requestPermission` cannot be called without a user gesture and will be ignored from a mount effect.
3. Call `handle.getFile()` and `JSON.parse` the text.
4. On success: set `lastSavedSceneRef.current = JSON.stringify(envelope.scene)`, then call `onFileLoaded(envelope)`. Set `fileName`, `projectName`, `createdAt`.
5. On any failure (file moved, permission not granted, parse error): fall back silently — no error state.
6. Set `fileReady = true`.

### Unsaved-changes guard

Both `newFile` and `openFile` call `window.confirm("You have unsaved changes. Continue?")` when `isDirty` is true. If the user cancels, the operation is a no-op. `newFile` also calls `idb.clearHandle()` after proceeding so the next startup starts fresh rather than reopening the previous file.

### IDB module

A small helper at `src/scene/idb.ts` keeps IndexedDB calls out of the hook and makes them mockable in tests:

```typescript
export async function readHandle():                    Promise<FileSystemFileHandle | null>
export async function writeHandle(h: FileSystemFileHandle): Promise<void>
export async function clearHandle():                   Promise<void>
```

Database name: `zimmu`, store name: `handles`, key: `last-file`.

### File write sequence

The File System Access API requires three steps to write:

```typescript
const writable = await handle.createWritable()
await writable.write(content)
await writable.close()  // flushes to disk — must complete before IDB is updated
```

`idb.writeHandle(handle)` is called **only after `writable.close()` resolves**. If `close()` throws (disk full, permission revoked), the handle is not stored and `fileError` is set. `fileName` and `isDirty` are only updated after a successful close.

Both `showSaveFilePicker` and `showOpenFilePicker` must specify file type options to filter and suggest `.zimmu` files:

```typescript
{ types: [{ description: 'Zimmu Project', accept: { 'application/json': ['.zimmu'] } }] }
```

### `appVersion` Vite wiring

`appVersion` is written on every save from `import.meta.env.VITE_APP_VERSION`. This requires two changes:

In `vite.config.ts`:
```typescript
import pkg from './package.json'
// inside defineConfig:
define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) }
```

In `tsconfig.json` (or `tsconfig.app.json`): add `"resolveJsonModule": true`.

---

## Section 3: `FileMenu` Component + Title Bar

**Location:** `src/ui/FileMenu.tsx`

### Props

```typescript
interface FileMenuProps {
  fileName:            string | null
  projectName:         string
  isDirty:             boolean
  fileError:           string | null
  onNew:               () => void
  onOpen:              () => void
  onSave:              () => void
  onSaveAs:            () => void
  onProjectNameChange: (name: string) => void
  partsCount:          number
  supported:           boolean  // File System Access API available
}
```

### Layout

Full-width bar across the top of the app (replaces the current floating header). Fixed height: `40px`.

```
[ Zimmu ]  [ File ▾ ]    ● Garden Shelf  ·  garden-shelf.zimmu    2 parts
```

- **Left:** "Zimmu" wordmark + "File" menu button.
- **Center:** dirty indicator (`●` prefix when dirty, nothing when clean) + project name (inline editable) + OS filename in muted text. If `!supported`: show "Save/Load requires Chrome or Edge" instead of the filename.
- **Right:** parts count.

### File dropdown

```
┌─────────────────────────┐
│  New               ⌘N   │
│  Open…             ⌘O   │
│  ─────────────────────  │
│  Save              ⌘S   │
│  Save As…        ⌘⇧S    │
└─────────────────────────┘
```

Implemented with a boolean `isOpen` state + `useEffect` that closes on `mousedown` outside a menu ref or on `Escape` keydown. No third-party dropdown library.

Save is greyed out (pointer-events none, reduced opacity) when `!isDirty && fileName !== null`.  
All items are disabled when `!supported`.

### Project name inline editing

The project name renders as a `<span>` that swaps to an uncontrolled `<input>` on click. On `Enter` or `blur`: commit via `onProjectNameChange`. On `Escape`: revert to the previous value and exit edit mode. Empty input reverts to `"Untitled"`.

### Browser tab title

Set via `useEffect` in `FileMenu`:

```typescript
document.title = `${isDirty ? '● ' : ''}${projectName} — Zimmu`
```

### `fileError` display

If `fileError` is set, show it inline in the title area (replacing the filename) in a muted red. Clears automatically after 5 seconds (managed inside `useFile` with a `setTimeout` ref).

---

## Section 4: App.tsx Integration

### Hook call order

```typescript
function App() {
  // 1. Scene — always starts with default board
  const { scene, replaceScene, ...sceneApi } = useScene()

  // 2a. Camera state ref — written by Viewport's animation loop each frame;
  //     read by useFile at save time (avoids stale closure, no re-renders)
  const cameraStateRef = useRef<CameraState>({
    position: { x: 250, y: -200, z: 150 },
    target:   { x: 0,   y: 0,    z: 0   },
  })
  // 2b. Loaded camera state — React state so Viewport's useEffect detects the change
  const [loadedCamera, setLoadedCamera] = useState<CameraState | null>(null)

  // 3. Browser support check
  const supported = 'showOpenFilePicker' in window

  // 4. File state — destructure operations directly for stable keyboard shortcut deps
  const {
    fileReady, fileName, projectName, isDirty, fileError,
    newFile, openFile, saveFile, saveAsFile, setProjectName,
  } = useFile({
    scene,
    getCameraState: () => cameraStateRef.current,
    onFileLoaded:   (envelope) => {
      replaceScene(envelope.scene)
      cameraStateRef.current = envelope.camera  // immediate read
      setLoadedCamera(envelope.camera)           // triggers Viewport restore
    },
  })

  // 5. Gate: don't render until startup load attempt completes
  if (!fileReady) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <FileMenu
        fileName={fileName}
        projectName={projectName}
        isDirty={isDirty}
        fileError={fileError}
        partsCount={scene.parts.length}
        supported={supported}
        onNew={newFile}
        onOpen={openFile}
        onSave={saveFile}
        onSaveAs={saveAsFile}
        onProjectNameChange={setProjectName}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Viewport ... cameraStateRef={cameraStateRef} loadedCamera={loadedCamera} />
        <Sidebar ... />
      </div>
    </div>
  )
}
```

### `replaceScene` on `useScene`

New operation added to `useScene`:

```typescript
replaceScene(scene: Scene): void
```

Replaces `parts`, clears `selectedId`, clears `pendingIds`, triggers geometry rebuilds for all new parts. Resets `labelCounter` by scanning part labels for the `Board N` pattern (`/Board (\d+)/`) and setting the counter to `max + 1`; defaults to `parts.length + 1` for user-renamed parts.

New file → `replaceScene({ parts: [] })` (blank canvas, not a default board).

### Camera integration

`Viewport` gains two new props:
- `cameraStateRef: React.RefObject<CameraState>` — the animation loop writes to this every frame so `getCameraState()` in `useFile` always reads the current position without triggering re-renders.
- `loadedCamera: CameraState | null` — React state owned by App.tsx, set to a non-null value when a file is opened. Because it is state (not a ref), React re-renders Viewport when it changes, and a `useEffect([loadedCamera])` inside Viewport fires and imperatively restores the camera.

Internally, Viewport adds `const controlsRef = useRef<OrbitControls | null>(null)` and assigns `controlsRef.current = controls` during setup. The camera-restore effect uses `controlsRef.current` to call `controls.object.position.set(...)` and `controls.target.set(...)`.

The existing internal `cameraRef` in Viewport (`useRef<THREE.PerspectiveCamera | null>`) is unaffected — the new `cameraStateRef` prop has a distinct name to avoid collision.

### Keyboard shortcuts

Single `useEffect` in App.tsx:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.shiftKey && e.key === 's') { e.preventDefault(); saveFile() }
    if (mod &&  e.shiftKey && e.key === 's') { e.preventDefault(); saveAsFile() }
    if (mod && !e.shiftKey && e.key === 'o') { e.preventDefault(); openFile() }
    if (mod && !e.shiftKey && e.key === 'n') { e.preventDefault(); newFile() }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [saveFile, saveAsFile, openFile, newFile])
```

`newFile`, `openFile`, `saveFile`, `saveAsFile` are wrapped in `useCallback` inside `useFile` so this dependency array is stable.

### First-launch vs New consistency

On first launch (no stored handle), `fileReady` becomes `true` with `useScene`'s default board already in place — the user sees a single board without any file action. File > New then produces a **blank** canvas (`replaceScene({ parts: [] })`). This is an intentional distinction: first launch gives something to look at; New is an explicit restart. The two paths are different by design and do not need to be unified.

---

## Section 5: Error Handling + Testing

### Error handling table

| Scenario | Behavior |
|---|---|
| File System Access API unavailable | File menu items disabled; note shown in title bar |
| User cancels picker | Catch `AbortError`, return silently, no error state |
| Malformed JSON on open | `fileError: "Could not read file — invalid format"` |
| `version > CURRENT_VERSION` | `console.warn`, attempt parse, continue |
| Unknown part `kind` | Filter out with `console.warn`, rest of scene loads |
| Write failure (disk full, permission revoked) | `fileError: "Save failed"` |
| Startup handle permission denied | Fall back silently, no error shown |

### Test setup

Two separate test surfaces with different setups:

**`useFile.test.ts`** — mock `idb.ts` entirely:
```typescript
vi.mock('../scene/idb', () => ({
  readHandle:  vi.fn(),
  writeHandle: vi.fn(),
  clearHandle: vi.fn(),
}))
```
No real IndexedDB needed. `onFileLoaded` is a `vi.fn()` spy passed as a prop.

**`idb.test.ts`** — test the IndexedDB module directly using a real in-memory IDB:
```typescript
import 'fake-indexeddb/auto'  // top of idb.test.ts, or in vitest.setup.ts
```
Create `vitest.setup.ts` at the project root with `import 'fake-indexeddb/auto'` and add `setupFiles: ['./vitest.setup.ts']` to the `test` block in `vite.config.ts`. Add `fake-indexeddb` as a dev dependency.

### `useFile` test cases

| # | Scenario | Assert |
|---|---|---|
| 1 | No stored handle | `fileReady` true, `onFileLoaded` not called |
| 2 | Valid stored handle | `onFileLoaded` called with parsed scene + camera |
| 3 | Stale handle (`getFile()` throws) | Falls back, `fileReady` true, no `fileError` |
| 4 | `saveFile` no handle | Picker called, IDB written, `isDirty` false |
| 5 | `saveFile` with handle | No picker, writes directly, `isDirty` false |
| 6 | `openFile` dirty + confirmed | Proceeds, `onFileLoaded` called |
| 7 | `openFile` dirty + cancelled | No-op, `onFileLoaded` not called |
| 8 | Picker cancelled (`AbortError`) | No `fileError`, no state change |
| 9 | Serialization | Floats rounded to 6 dp; output is 2-space-indented JSON |
| 10 | `version > CURRENT_VERSION` | `console.warn` called, parse succeeds |
| 11 | Unknown part `kind` | Filtered, rest of scene passed to `onFileLoaded` |
| 12 | `setProjectName` | Sets `isDirty` true |
| 13 | `newFile` when dirty + confirmed | `fileName` null, `isDirty` false, `clearHandle` called |
| 14 | `openFile` `AbortError` on picker | No `fileError`, `isDirty` unchanged, `fileName` unchanged |
| 15 | `saveFile` — `close()` throws | `fileError` set, `idb.writeHandle` NOT called, `isDirty` unchanged |
| 16 | `fileError` auto-clears | Set `fileError`, advance fake timers by 5 s, assert `fileError` null |
| 17 | Serialization — float precision | Scene with `position.x: 100.1234567` serializes to `100.123457` (6 dp) |

### `replaceScene` test cases (added to `useScene.test.ts`)

| # | Scenario | Assert |
|---|---|---|
| 18 | `replaceScene` with parts | `selectedId` null, new parts present, `labelCounter` reset from labels |
| 19 | `replaceScene({ parts: [] })` | Scene empty, `labelCounter` resets to 1, `nextLabel` = "Board 1" |

---

## New files

| Path | Purpose |
|---|---|
| `src/scene/idb.ts` | IndexedDB read/write/clear for `FileSystemFileHandle` |
| `src/scene/useFile.ts` | File lifecycle hook; exports `FILE_FORMAT_VERSION` |
| `src/scene/idb.test.ts` | Unit tests for the IDB module (uses `fake-indexeddb`) |
| `src/ui/FileMenu.tsx` | Title bar + File dropdown component |
| `vitest.setup.ts` | Global test setup: `import 'fake-indexeddb/auto'` |

## Modified files

| Path | Change |
|---|---|
| `src/scene/types.ts` | Add `CameraState`, `ZimmuFile` types |
| `src/scene/useScene.ts` | Add `replaceScene` operation |
| `src/scene/useScene.test.ts` | Add `replaceScene` tests (×2) |
| `src/render/viewport.tsx` | Add `cameraStateRef` + `loadedCamera` props; add `controlsRef`; write camera state to ref each frame; restore on `loadedCamera` change |
| `src/App.tsx` | Wire `useFile`, `FileMenu`, keyboard shortcuts; add `cameraStateRef` + `loadedCamera` state; restructure layout to flex column |
| `vite.config.ts` | Add `define: { 'import.meta.env.VITE_APP_VERSION': ... }`; add `setupFiles` to test block |
| `tsconfig.json` | Add `"resolveJsonModule": true` |
| `package.json` | Add `fake-indexeddb` dev dependency |
