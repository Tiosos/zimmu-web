# Undo / Redo — Implementation Notes

## 2026-05-30

### useLayoutEffect for sceneRef — not useEffect

`sceneRef.current` must reflect the committed scene before any callback executes in the same render cycle. `useEffect` fires asynchronously after paint; `useLayoutEffect` fires synchronously after DOM mutations. If a user triggers `onRemove` immediately after a scene update in the same frame, `useEffect` could leave `sceneRef` stale. `useLayoutEffect` eliminates this race.

### Refs for history stacks — not state

`pastRef` and `futureRef` are plain refs. If they were state, every `push()` call would cause `undo` and `redo` callbacks to be recreated (new function identity), which would cause the `useEffect` keyboard listener in `App.tsx` to re-register on every scene mutation. One single `undoState` object provides the three UI-reactive values (`canUndo`, `canRedo`, `undoLabel`, `redoLabel`) without making the callbacks stale.

### clone created outside setScene in onDuplicate

The original implementation created the clone inside `setScene(prev => {...})`. Closures inside `setScene` callbacks are local to that call — inaccessible to the `push()` closures. Moving clone creation outside `setScene` (using `sceneRef.current`) makes the same `clone` object available to both the `setScene` update and the push closures.

### Coalescing preserves original undo closure

When two consecutive `onUpdate` calls share a `coalesceKey`, `push` replaces only `redo` and `label` on the existing top-of-stack entry. The `undo` closure is preserved. This means undo always jumps back to the `before` value captured by the **first** edit in the sequence — not the second.

### Sidebar isFocused ref — why not useState

A `useState` for `isFocused` would cause re-renders on every focus and blur event. Since the only consumer is the `useEffect([value])` sync guard (which reads the ref synchronously), a `useRef` is correct and avoids those extra renders.

### document → window for keyboard listener

The keyboard handler in App.tsx was changed from `document.addEventListener` to `window.addEventListener`. `App.test.tsx` dispatches events via `window.dispatchEvent(...)`. Events dispatched directly to `window` do not propagate down to `document` listeners, so tests would silently not call the handler if it were on `document`.

### labelCounter via useMemo — not useEffect + setState

The implementation uses `useMemo` to derive `labelCounter` from `scene` instead of the planned `useEffect + setLabelCounter`. `useMemo` computes synchronously during render, so after `undo()` calls `setScene()`, `labelCounter` reflects the new scene in the same render cycle. With `useEffect`, the update would require a second render cycle, making `nextLabel` stale for one render.
