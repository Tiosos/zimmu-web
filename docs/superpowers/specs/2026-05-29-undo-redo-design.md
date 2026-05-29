# Undo / Redo — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-05-29

---

## Overview

Add Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y for Safari) undo/redo for all scene mutations: add part, remove part, duplicate part, update part properties. History is limited to 50 steps. Consecutive property edits on the same part coalesce into one undo step.

---

## Scope

**In scope:** `onAdd`, `onRemove`, `onDuplicate`, `onUpdate` — all mutations on the `scene.parts` array.

**Out of scope:** Camera movement, selection changes (`selectedId`), project name changes, file open/save, geometry build errors, UI layout state.

---

## Section 1: State Shape

### 1.1 `HistoryEntry` interface

Defined locally inside `useScene.ts` (not exported — internal to the hook).

```typescript
interface HistoryEntry {
  label:        string
  undo:         () => void
  redo:         () => void
  coalesceKey?: string
}
```

`label` — human-readable name shown in File menu tooltip (e.g. `"Add Board 2"`, `"Remove Board 1"`, `"Duplicate Board 3"`, `"Update Board 1"`).

`coalesceKey` — when defined, consecutive pushes with the same key collapse into one undo step (preserves original `undo`, replaces `redo` and `label`). Used by `onUpdate` to merge rapid property edits.

### 1.2 History refs

```typescript
const MAX_HISTORY = 50
const pastRef   = useRef<HistoryEntry[]>([])
const futureRef = useRef<HistoryEntry[]>([])
```

Refs (not state) so undo/redo callbacks don't re-create on every scene change, which would cause keyboard event listeners to re-register on every render.

### 1.3 `undoState`

Single `useState` object for the three pieces of UI-reactive information:

```typescript
const [undoState, setUndoState] = useState({
  canUndo:   false,
  canRedo:   false,
  undoLabel: null as string | null,
  redoLabel: null as string | null,
})
```

`undoLabel` — label of the most recent past entry (shown in the Undo menu item tooltip).
`redoLabel` — label of the most recent future entry (shown in the Redo menu item tooltip).

### 1.4 `sceneRef`

Needed so `onRemove`, `onDuplicate`, `onUpdate` can read the current scene synchronously inside their callbacks without creating stale closures.

```typescript
const sceneRef = useRef<Scene>(scene)
useLayoutEffect(() => { sceneRef.current = scene }, [scene])
```

`useLayoutEffect` (not `useEffect`) so the ref is updated synchronously before any paint, guaranteeing callbacks always see the committed scene.

### 1.5 Effect-based `labelCounter`

Remove the explicit `setLabelCounter` calls from `onAdd` and `replaceScene`. Replace with an effect that recalculates from the scene. This ensures `labelCounter` stays correct after undo/redo without per-command counter snapshots.

```typescript
useEffect(() => {
  const max = scene.parts.reduce((m, p) => {
    const match = /Board (\d+)/.exec(p.label)
    return match ? Math.max(m, parseInt(match[1], 10)) : m
  }, 0)
  setLabelCounter(max > 0 ? max : scene.parts.length)
}, [scene])
```

Remove `setLabelCounter(newCount)` from `onAdd` and `setLabelCounter(max > 0 ? max : next.parts.length)` from `replaceScene`.

### 1.6 `push` helper

Internal callback used by each operation to push an entry onto the history stack.

```typescript
const push = useCallback((entry: HistoryEntry) => {
  const last = pastRef.current.at(-1)
  const coalescing =
    entry.coalesceKey !== undefined && last?.coalesceKey === entry.coalesceKey
  if (coalescing) {
    pastRef.current = [
      ...pastRef.current.slice(0, -1),
      { ...last!, redo: entry.redo, label: entry.label },
    ]
  } else {
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), entry]
  }
  futureRef.current = []
  setUndoState({
    canUndo:   true,
    canRedo:   false,
    undoLabel: entry.label,
    redoLabel: null,
  })
}, [])
```

Coalescing: if the new entry has the same `coalesceKey` as the top of `pastRef`, replace only `redo` and `label`. The original `undo` closure (which captured the very first `before` value) is preserved, so undoing jumps back to before the entire edit sequence began.

Capacity: `slice(-(MAX_HISTORY - 1))` ensures the array never exceeds `MAX_HISTORY` entries (50).

### 1.7 `undo` callback

```typescript
const undo = useCallback(() => {
  const entry = pastRef.current.at(-1)
  if (!entry) return
  pastRef.current = pastRef.current.slice(0, -1)
  futureRef.current = [...futureRef.current, entry]
  entry.undo()
  setUndoState({
    canUndo:   pastRef.current.length > 0,
    canRedo:   true,
    undoLabel: pastRef.current.at(-1)?.label ?? null,
    redoLabel: entry.label,
  })
}, [])
```

### 1.8 `redo` callback

```typescript
const redo = useCallback(() => {
  const entry = futureRef.current.at(-1)
  if (!entry) return
  futureRef.current = futureRef.current.slice(0, -1)
  pastRef.current = [...pastRef.current, entry]
  entry.redo()
  setUndoState({
    canUndo:   true,
    canRedo:   futureRef.current.length > 0,
    undoLabel: entry.label,
    redoLabel: futureRef.current.at(-1)?.label ?? null,
  })
}, [])
```

### 1.9 `replaceScene` update

Clear both history stacks when a new file is loaded or `newFile()` is called.

```typescript
const replaceScene = useCallback((next: Scene) => {
  for (const geo of geometriesRef.current.values()) geo.dispose()
  geometriesRef.current.clear()
  prevShapeKeys.current.clear()
  buildSeq.current.clear()
  pastRef.current = []
  futureRef.current = []
  setUndoState({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null })
  setScene(next)
  setSelectedId(null)
  setPendingIds(new Set())
  setGeometries(new Map())
}, [])
```

### 1.10 `UseSceneResult` new members

Add to the `UseSceneResult` interface and return statement:

```typescript
canUndo:   boolean
canRedo:   boolean
undoLabel: string | null
redoLabel: string | null
undo:      () => void
redo:      () => void
```

Returned from the hook:

```typescript
canUndo:   undoState.canUndo,
canRedo:   undoState.canRedo,
undoLabel: undoState.undoLabel,
redoLabel: undoState.redoLabel,
undo,
redo,
```

---

## Section 2: Operations

### 2.1 `onAdd`

```typescript
const onAdd = useCallback(() => {
  if (!occtReady) return
  const label = `Board ${labelCounter + 1}`
  colorIndex.current += 1
  const part: BoardPart = {
    kind: 'board',
    id: `board_${crypto.randomUUID()}` as PartId,
    label,
    length: 200,
    width: 100,
    thickness: 25,
    color: PART_COLORS[colorIndex.current % PART_COLORS.length],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
  }
  setScene(prev => ({ parts: [...prev.parts, part] }))
  setSelectedId(part.id)
  push({
    label: `Add ${part.label}`,
    undo: () => {
      setScene(prev => ({ parts: prev.parts.filter(p => p.id !== part.id) }))
      setSelectedId(prev => (prev === part.id ? null : prev))
    },
    redo: () => {
      setScene(prev => ({ parts: [...prev.parts, part] }))
      setSelectedId(part.id)
    },
  })
}, [occtReady, labelCounter, push])
```

The undo closure for `onAdd` must clear `selectedId` if it still points to the removed part. The redo closure re-appends the same `part` object (identical UUID). Note: `setLabelCounter` is no longer called explicitly — the effect in §1.5 handles it.

### 2.2 `onRemove`

```typescript
const onRemove = useCallback((id: PartId) => {
  const part = sceneRef.current.parts.find(p => p.id === id)
  if (!part) return
  const index = sceneRef.current.parts.findIndex(p => p.id === id)
  geometriesRef.current.get(id)?.dispose()
  geometriesRef.current.delete(id)
  prevShapeKeys.current.delete(id)
  buildSeq.current.delete(id)
  setGeometries(new Map(geometriesRef.current))
  setScene(prev => ({ parts: prev.parts.filter(p => p.id !== id) }))
  setSelectedId(prev => (prev === id ? null : prev))
  push({
    label: `Remove ${part.label}`,
    undo: () => setScene(prev => {
      const parts = [...prev.parts]
      parts.splice(index, 0, part)
      return { parts }
    }),
    redo: () => {
      setScene(prev => ({ parts: prev.parts.filter(p => p.id !== id) }))
      setSelectedId(prev => (prev === id ? null : prev))
    },
  })
}, [push])
```

`part` and `index` are captured from `sceneRef.current` before the mutation. The undo closure reinserts the part at its original index using `splice`. The redo closure uses the `setSelectedId` functional form to avoid stale closure bugs.

**Note on geometry on undo:** The undo closure does NOT call `geometriesRef.current.delete(id)` in reverse (i.e., it does not restore the geometry). Restoring the part to the scene is sufficient — the geometry rebuild effect (`useEffect([scene])`) will detect the part's ID in the scene and enqueue a build. This is the same path used when a part is first added.

### 2.3 `onDuplicate`

The clone must be created **outside** the `setScene` functional update so it is accessible to the undo/redo closures.

```typescript
const onDuplicate = useCallback((id: PartId) => {
  const orig = sceneRef.current.parts.find(p => p.id === id) as BoardPart | undefined
  if (!orig) return
  colorIndex.current += 1
  const clone: BoardPart = {
    ...orig,
    id: `board_${crypto.randomUUID()}` as PartId,
    color: PART_COLORS[colorIndex.current % PART_COLORS.length],
    position: { ...orig.position, x: orig.position.x + orig.length + 10 },
    rotation: { x: 0, y: 0, z: 0 },
  }
  setScene(prev => {
    const idx = prev.parts.findIndex(p => p.id === id)
    if (idx === -1) return prev
    const parts = [...prev.parts]
    parts.splice(idx + 1, 0, clone)
    return { parts }
  })
  push({
    label: `Duplicate ${orig.label}`,
    undo: () => {
      setScene(prev => ({ parts: prev.parts.filter(p => p.id !== clone.id) }))
      setSelectedId(prev => (prev === clone.id ? null : prev))
    },
    redo: () => setScene(prev => {
      const idx = prev.parts.findIndex(p => p.id === id)
      if (idx === -1) return prev
      const parts = [...prev.parts]
      parts.splice(idx + 1, 0, clone)
      return { parts }
    }),
  })
}, [push])
```

Previous implementation created the clone inside `setScene(prev => {...})` making it a local variable inaccessible to the push closures. This refactor fixes that. The undo closure clears `selectedId` if it points to the clone.

### 2.4 `onUpdate`

```typescript
const onUpdate = useCallback((id: PartId, updater: (p: Part) => Part) => {
  const before = sceneRef.current.parts.find(p => p.id === id)
  if (!before) return
  const after = updater(before)
  setScene(prev => ({ parts: prev.parts.map(p => p.id === id ? after : p) }))
  push({
    label: `Update ${after.label}`,
    coalesceKey: `update-${id}`,
    undo: () => setScene(prev => ({ parts: prev.parts.map(p => p.id === id ? before : p) })),
    redo: () => setScene(prev => ({ parts: prev.parts.map(p => p.id === id ? after : p) })),
  })
}, [push])
```

`before` is captured from `sceneRef.current` before the mutation. `after` is the result of calling `updater(before)`. The `coalesceKey` is `update-${id}`, so consecutive edits to the same part (e.g., dragging a slider or typing in an input) collapse into one undo step that jumps back to the `before` value of the first edit in the sequence.

**Sidebar input sync:** Sidebar numeric inputs must not use `defaultValue`. They must use controlled `value` props. If currently using `defaultValue`, add a `key={`${part.id}-${fieldName}`}` prop OR switch to controlled `value` + `onChange` with a `useEffect` sync from props. Without this, inputs show stale values after undo because the DOM input is not re-rendered when the scene is replaced from underneath.

---

## Section 3: UI

### 3.1 FileMenu new props

```typescript
interface FileMenuProps {
  // ...existing props...
  canUndo:   boolean
  canRedo:   boolean
  undoLabel: string | null
  redoLabel: string | null
  onUndo:    () => void
  onRedo:    () => void
}
```

### 3.2 FileMenu dropdown order

```
[Undo "Add Board 2"]      ← disabled when canUndo=false
[Redo "Duplicate Board 1"] ← disabled when canRedo=false
────────────────────────
[New]
[Open…]
────────────────────────
[Save]
[Save As…]
```

Undo and Redo appear at the top of the dropdown, above a divider. The item text includes the label in quotes when one is available:
- `canUndo && undoLabel` → `Undo "${undoLabel}"`
- `canUndo && !undoLabel` → `Undo`
- `canRedo && redoLabel` → `Redo "${redoLabel}"`
- `canRedo && !redoLabel` → `Redo`

### 3.3 `menuItem` `disabled` fix

The existing `menuItem` helper renders a `<button>` but does not pass `disabled` to the element. Fix:

```typescript
function menuItem(label: string, onClick: () => void, disabled = false) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      {label}
    </button>
  )
}
```

Both `disabled` and `aria-disabled` are required: `disabled` prevents click events on the native button; `aria-disabled` ensures screen readers announce the state for elements that may be styled differently.

### 3.4 App keyboard handler

Replace the existing keyboard `useEffect` in `App.tsx` with:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (!e.shiftKey && k === 's') { e.preventDefault(); void saveFile() }
    if ( e.shiftKey && k === 's') { e.preventDefault(); void saveAsFile() }
    if (!e.shiftKey && k === 'o') { e.preventDefault(); void openFile() }
    if (!e.shiftKey && k === 'n') { e.preventDefault(); void newFile() }
    if (!e.shiftKey && k === 'z') { e.preventDefault(); undo() }
    if (( e.shiftKey && k === 'z') || k === 'y') { e.preventDefault(); redo() }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [saveFile, saveAsFile, openFile, newFile, undo, redo])
```

`e.key.toLowerCase()` is applied to ALL shortcuts. This fixes the bug where `Ctrl+Shift+Z` produces `e.key === 'Z'` (uppercase), causing the redo branch to be missed.

`k === 'y'` (combined with `mod`) handles Ctrl+Y for Safari redo.

The `if (( e.shiftKey && k === 'z') || k === 'y')` branch intentionally does NOT require `!e.shiftKey` for the `y` case — `Ctrl+Y` never collides with any other shortcut.

### 3.5 App wiring

Destructure `canUndo`, `canRedo`, `undoLabel`, `redoLabel`, `undo`, `redo` from `useScene()` and pass to `FileMenu` and the keyboard handler:

```typescript
const {
  // ...existing...
  canUndo, canRedo, undoLabel, redoLabel, undo, redo,
} = useScene()
```

Pass to `FileMenu`:
```typescript
<FileMenu
  // ...existing props...
  canUndo={canUndo}
  canRedo={canRedo}
  undoLabel={undoLabel}
  redoLabel={redoLabel}
  onUndo={undo}
  onRedo={redo}
/>
```

---

## Section 4: Testing

### 4.1 `useScene.test.ts` — new tests (22)

Add to the existing test file. Use the existing pattern (mock worker, `renderHook`, `act`).

**History state — initial**
1. `canUndo` is false, `canRedo` is false, `undoLabel` and `redoLabel` are null on init

**onAdd + undo/redo**
2. after `onAdd`, `canUndo` is true, `undoLabel` is `"Add Board 2"`, `canRedo` is false
3. `undo()` after `onAdd` removes the part from the scene
4. `undo()` after `onAdd` clears `selectedId` if it pointed to the added part
5. `redo()` after `undo()` re-adds the part (same id)
6. after `undo()`: `canUndo` is false, `canRedo` is true, `redoLabel` is `"Add Board 2"`

**onRemove + undo/redo**
7. after `onRemove`, `canUndo` is true, `undoLabel` is `"Remove Board 1"`
8. `undo()` after `onRemove` reinserts the part at its original index
9. `redo()` after remove-undo removes the part again

**onDuplicate + undo/redo**
10. after `onDuplicate`, `canUndo` is true, `undoLabel` is `"Duplicate Board 1"`
11. `undo()` after `onDuplicate` removes the clone (leaves original)
12. `redo()` after duplicate-undo re-inserts the clone at idx+1

**onUpdate + undo/redo**
13. after `onUpdate`, `canUndo` is true, `undoLabel` is `"Update Board 1"`
14. `undo()` after `onUpdate` restores the previous property value
15. `redo()` after update-undo re-applies the update

**Coalescing**
16. two consecutive `onUpdate` calls on the same part produce one undo step
17. coalesced undo restores to the value before the first edit (not the second)
18. `onUpdate` on different parts does NOT coalesce (two undo steps)

**History limit**
19. after 50 `onAdd` calls, `pastRef` length is 50 (capped), oldest entry dropped

**replaceScene clears history**
20. after `replaceScene`, `canUndo` is false, `canRedo` is false
21. `undo()` after `replaceScene` is a no-op (does not throw)

**labelCounter after undo**
22. after `onAdd` then `undo()`, the next `onAdd` creates `"Board 2"` (not `"Board 3"`)

### 4.2 `src/ui/FileMenu.test.tsx` — new file (9 tests)

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { FileMenu } from './FileMenu'

const baseProps = {
  projectName: 'Test',
  isDirty: false,
  canUndo: false, canRedo: false,
  undoLabel: null, redoLabel: null,
  onUndo: vi.fn(), onRedo: vi.fn(),
  onNew: vi.fn(), onOpen: vi.fn(),
  onSave: vi.fn(), onSaveAs: vi.fn(),
  onProjectNameChange: vi.fn(),
}
```

1. "Undo" button is rendered
2. "Undo" button is disabled when `canUndo=false`
3. "Undo" button shows label: `Undo "Add Board 2"` when `undoLabel="Add Board 2"`
4. clicking "Undo" when enabled calls `onUndo`
5. clicking "Undo" when `canUndo=false` does NOT call `onUndo`
6. "Redo" button is disabled when `canRedo=false`
7. "Redo" button shows label: `Redo "Add Board 2"` when `redoLabel="Add Board 2"`
8. clicking "Redo" when enabled calls `onRedo`
9. "Undo" appears above "New" in the dropdown

### 4.3 `src/App.test.tsx` — new file (1 test)

```typescript
import { render, act } from '@testing-library/react'
import App from './App'

it('Ctrl+Z calls undo', async () => {
  render(<App />)
  await act(async () => {})
  const undoSpy = vi.spyOn(/* useScene result */ ...)
  // fire Ctrl+Z
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
  })
  // verify undo was invoked (via a scene mutation or mock)
})
```

**Implementation note:** Testing keyboard shortcuts in `App.tsx` requires either mocking `useScene` or verifying side effects. The simplest approach: render App with a pre-populated scene (via the file-load path or direct injection), call `onAdd` to push a history entry, then fire `Ctrl+Z` and assert the scene changed. Alternatively, mock `useScene` and assert `undo` was called.

---

## File Map

| File | Action |
|------|--------|
| `src/scene/useScene.ts` | Modify — add `HistoryEntry`, `pastRef`, `futureRef`, `undoState`, `sceneRef`, effect-based `labelCounter`, `push`, `undo`, `redo`; update `onAdd`, `onRemove`, `onDuplicate`, `onUpdate`, `replaceScene`; extend `UseSceneResult` |
| `src/scene/useScene.test.ts` | Modify — add 22 tests |
| `src/ui/FileMenu.tsx` | Modify — add undo/redo props, items at top of dropdown, fix `disabled`+`aria-disabled` on `menuItem` |
| `src/ui/FileMenu.test.tsx` | **Create** — 9 tests |
| `src/App.tsx` | Modify — wire `canUndo`/`canRedo`/`undoLabel`/`redoLabel`/`undo`/`redo` from `useScene` to `FileMenu` and keyboard handler |
| `src/App.test.tsx` | **Create** — 1 keyboard test |

---

## Implementation Notes

See `docs/superpowers/notes/2026-05-29-save-load-notes.md` for existing notes. Add undo/redo notes to a new file `docs/superpowers/notes/2026-05-29-undo-redo-notes.md` during implementation.

Key things to note during implementation:
- Why `useLayoutEffect` for `sceneRef` (synchronous ref update before paint)
- Why refs for history stacks (stable `undo`/`redo` callbacks, no listener churn)
- Why clone is created outside `setScene` in `onDuplicate` (closure capture)
- Why coalescing preserves original `undo` closure (restores to pre-edit-sequence value)
- Sidebar input sync approach chosen and why
