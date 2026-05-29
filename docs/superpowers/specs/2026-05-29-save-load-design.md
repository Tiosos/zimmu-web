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
  projectName:  string         // envelope "name", editable in title bar
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

### Dirty tracking

A `lastSavedSceneRef` stores the scene snapshot at last save (as a JSON string). A `useEffect` watching `scene` sets `isDirty = true` when the snapshot diverges. On any successful save the ref is updated and `isDirty` resets to false. New files start clean; the initial scene — whether loaded from disk or the default board — is the baseline.

`createdAt` is captured in a ref on the first save and never overwritten on subsequent saves.

### Startup sequence

1. Read a `FileSystemFileHandle` from IndexedDB key `zimmu-last-file` via `idb.readHandle()`.
2. Call `handle.queryPermission({ mode: 'readwrite' })`. If `'prompt'`, call `handle.requestPermission`. If `'denied'`, skip to step 5.
3. Call `handle.getFile()` and `JSON.parse` the text.
4. On success: call `onFileLoaded(envelope)`. Set `fileName`, `projectName`, `createdAt`.
5. On any failure (file moved, permission denied, parse error): fall back silently — no error state.
6. Set `fileReady = true`.

### Unsaved-changes guard

Both `newFile` and `openFile` call `window.confirm("You have unsaved changes. Continue?")` when `isDirty` is true. If the user cancels, the operation is a no-op.

### IDB module

A small helper at `src/scene/idb.ts` keeps IndexedDB calls out of the hook and makes them mockable in tests:

```typescript
export async function readHandle():                    Promise<FileSystemFileHandle | null>
export async function writeHandle(h: FileSystemFileHandle): Promise<void>
export async function clearHandle():                   Promise<void>
```

Database name: `zimmu`, store name: `handles`, key: `last-file`.

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

Full-width bar across the top of the app (replaces the current floating header):

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

Implemented with a boolean `isOpen` state + `useEffect` that closes on `mousedown` outside a menu ref. No third-party dropdown library.

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

  // 2. Camera ref — owned here, shared with Viewport and useFile
  const cameraRef = useRef<CameraState>({
    position: { x: 250, y: -200, z: 150 },
    target:   { x: 0,   y: 0,    z: 0   },
  })

  // 3. Browser support check
  const supported = 'showOpenFilePicker' in window

  // 4. File state
  const { fileReady, fileName, projectName, isDirty, fileError, ...fileOps } = useFile({
    scene,
    getCameraState: () => cameraRef.current,
    onFileLoaded:   (envelope) => {
      replaceScene(envelope.scene)
      cameraRef.current = envelope.camera
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
        onNew={fileOps.newFile}
        onOpen={fileOps.openFile}
        onSave={fileOps.saveFile}
        onSaveAs={fileOps.saveAsFile}
        onProjectNameChange={fileOps.setProjectName}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Viewport ... cameraRef={cameraRef} />
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

`Viewport` gains a `cameraRef` prop. A `useEffect` in `Viewport` watches the ref value and imperatively sets `controls.object.position` and `controls.target` when a file loads. The animation loop writes the current camera position and target back to `cameraRef` on every frame so `getCameraState()` is always current at save time.

### Keyboard shortcuts

Single `useEffect` in App.tsx:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.shiftKey && e.key === 's') { e.preventDefault(); fileOps.saveFile() }
    if (mod &&  e.shiftKey && e.key === 's') { e.preventDefault(); fileOps.saveAsFile() }
    if (mod && !e.shiftKey && e.key === 'o') { e.preventDefault(); fileOps.openFile() }
    if (mod && !e.shiftKey && e.key === 'n') { e.preventDefault(); fileOps.newFile() }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [fileOps.saveFile, fileOps.saveAsFile, fileOps.openFile, fileOps.newFile])
```

`newFile`, `openFile`, `saveFile`, `saveAsFile` are wrapped in `useCallback` inside `useFile` so this dependency array is stable.

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

Create `vitest.setup.ts` at the project root:

```typescript
import 'fake-indexeddb/auto'
```

Add `setupFiles: ['./vitest.setup.ts']` to the `test` block in `vite.config.ts`.

Add `fake-indexeddb` as a dev dependency.

Mock `idb.ts` per test with `vi.mock('../scene/idb')` so tests don't touch IndexedDB directly.

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

### `replaceScene` test case (added to `useScene.test.ts`)

| # | Scenario | Assert |
|---|---|---|
| 13 | `replaceScene` called | `selectedId` null, new parts present, `labelCounter` reset |

---

## New files

| Path | Purpose |
|---|---|
| `src/scene/idb.ts` | IndexedDB read/write/clear for `FileSystemFileHandle` |
| `src/scene/useFile.ts` | File lifecycle hook |
| `src/ui/FileMenu.tsx` | Title bar + File dropdown component |

## Modified files

| Path | Change |
|---|---|
| `src/scene/types.ts` | Add `CameraState`, `ZimmuFile` types |
| `src/scene/useScene.ts` | Add `replaceScene` operation |
| `src/scene/useScene.test.ts` | Add `replaceScene` test |
| `src/render/viewport.tsx` | Add `cameraRef` prop; write camera to ref each frame; restore on ref change |
| `src/App.tsx` | Wire `useFile`, `FileMenu`, keyboard shortcuts; restructure layout |
| `vitest.setup.ts` | Add `fake-indexeddb/auto` import |
| `package.json` | Add `fake-indexeddb` dev dependency |
