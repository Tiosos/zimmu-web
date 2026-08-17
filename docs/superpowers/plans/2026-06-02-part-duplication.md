# Part Duplication — Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the part duplication feature by auto-selecting the clone after duplication, fixing undo/redo selection behavior, and adding a `Ctrl/Cmd+D` keyboard shortcut.

**Architecture:** The core `onDuplicate` function in `useScene.ts` and the sidebar `⧉` button already exist and are tested. Two gaps remain: (1) the clone isn't selected after duplication — `onDuplicate` never calls `setSelectedId(clone.id)`; and (2) there is no `Ctrl/Cmd+D` keyboard shortcut in `App.tsx`. Both gaps are narrow, self-contained fixes that follow the existing patterns in `onAdd` (which does select after adding) and the modifier-key handler block in App.tsx.

**Tech Stack:** React 19, TypeScript strict, Vitest + @testing-library/react.

**Spec:** none — plan-only; no design spec was written for this feature.

---

## File Map

| File | Change |
|------|--------|
| `src/scene/useScene.ts` | Add `setSelectedId(clone.id)` in duplicate, fix undo/redo selection |
| `src/scene/useScene.test.ts` | 2 new tests: clone selected after duplicate, undo restores to original |
| `src/App.tsx` | Add `Ctrl/Cmd+D` branch in keyboard handler; add `selectedId`, `onDuplicate` to deps |
| `src/App.test.tsx` | Add `mockOnDuplicate`, set `selectedId: 'board_test'` in mock, 1 new test |

---

## Task 1: Auto-select clone + fix undo/redo selection

**Files:**
- Modify: `src/scene/useScene.ts:315-356`
- Modify: `src/scene/useScene.test.ts` (add after existing duplicate tests, ~line 119)

### Background

`onAdd` (line 269–270 of `useScene.ts`) sets the selected part immediately after creating it:

```ts
setScene((prev) => ({ parts: [...prev.parts, part] }))
setSelectedId(part.id)
```

`onDuplicate` currently does NOT call `setSelectedId`. Its undo sets `setSelectedId((prev) => (prev === clone.id ? null : prev))` — meaning undo-while-clone-is-selected goes to `null` instead of the original. This task fixes both.

The full current `onDuplicate` (lines 315–356, included for reference — do not copy; you will edit specific lines):

```ts
const onDuplicate = useCallback(
  (id: PartId) => {
    const orig = sceneRef.current.parts.find((p) => p.id === id) as BoardPart | undefined
    if (!orig) return
    colorIndex.current += 1
    const clone: BoardPart = {
      ...orig,
      id: `board_${crypto.randomUUID()}` as PartId,
      color: PART_COLORS[colorIndex.current % PART_COLORS.length],
      position: { ...orig.position, x: orig.position.x + orig.length + 10 },
      rotation: { x: 0, y: 0, z: 0 },
      cuts: orig.cuts.map((c) => ({
        ...c,
        id: `cut_${crypto.randomUUID()}` as CutId,
        pairedCutId: undefined,
      })),
    }
    setScene((prev) => {
      const idx = prev.parts.findIndex((p) => p.id === id)
      if (idx === -1) return prev
      const parts = [...prev.parts]
      parts.splice(idx + 1, 0, clone)
      return { parts }
    })
    push({
      label: `Duplicate ${orig.label}`,
      undo: () => {
        setScene((prev) => ({ parts: prev.parts.filter((p) => p.id !== clone.id) }))
        setSelectedId((prev) => (prev === clone.id ? null : prev))
      },
      redo: () =>
        setScene((prev) => {
          const idx = prev.parts.findIndex((p) => p.id === id)
          if (idx === -1) return prev
          const parts = [...prev.parts]
          parts.splice(idx + 1, 0, clone)
          return { parts }
        }),
    })
  },
  [push],
)
```

---

- [ ] **Step 1: Write two failing tests**

Add these two tests to `src/scene/useScene.test.ts`, directly after the existing `'onDuplicate resets rotation to zero'` test (around line 119). The file structure, imports, and mock setup are already in place — just add the `it(...)` blocks:

```ts
it('onDuplicate selects the clone', async () => {
  const { result } = renderHook(() => useScene())
  await waitFor(() => expect(result.current.occtReady).toBe(true))
  const origId = result.current.scene.parts[0].id
  act(() => {
    result.current.onDuplicate(origId)
  })
  const cloneId = result.current.scene.parts[1].id
  expect(result.current.selectedId).toBe(cloneId)
})

it('undo after onDuplicate restores selection to original', async () => {
  const { result } = renderHook(() => useScene())
  await waitFor(() => expect(result.current.occtReady).toBe(true))
  const origId = result.current.scene.parts[0].id
  act(() => {
    result.current.onDuplicate(origId)
  })
  act(() => {
    result.current.undo()
  })
  expect(result.current.selectedId).toBe(origId)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: the two new tests FAIL — `selectedId` is `null` after `onDuplicate`, not the clone's id.

- [ ] **Step 3: Edit `onDuplicate` in `src/scene/useScene.ts`**

Make three targeted edits:

**Edit A** — After the `setScene(...)` call that inserts the clone (the one that calls `parts.splice`), add `setSelectedId(clone.id)`:

Replace:
```ts
    setScene((prev) => {
      const idx = prev.parts.findIndex((p) => p.id === id)
      if (idx === -1) return prev
      const parts = [...prev.parts]
      parts.splice(idx + 1, 0, clone)
      return { parts }
    })
    push({
```

With:
```ts
    setScene((prev) => {
      const idx = prev.parts.findIndex((p) => p.id === id)
      if (idx === -1) return prev
      const parts = [...prev.parts]
      parts.splice(idx + 1, 0, clone)
      return { parts }
    })
    setSelectedId(clone.id)
    push({
```

**Edit B** — In the `undo` closure, change `? null : prev` to `? id : prev` so undoing while the clone is selected restores selection to the original:

Replace:
```ts
        setSelectedId((prev) => (prev === clone.id ? null : prev))
```

With:
```ts
        setSelectedId((prev) => (prev === clone.id ? id : prev))
```

**Edit C** — In the `redo` closure, add `setSelectedId(clone.id)` so redo also selects the clone. The redo currently only calls `setScene`; convert it from a concise arrow to a block body:

Replace:
```ts
      redo: () =>
        setScene((prev) => {
          const idx = prev.parts.findIndex((p) => p.id === id)
          if (idx === -1) return prev
          const parts = [...prev.parts]
          parts.splice(idx + 1, 0, clone)
          return { parts }
        }),
```

With:
```ts
      redo: () => {
        setScene((prev) => {
          const idx = prev.parts.findIndex((p) => p.id === id)
          if (idx === -1) return prev
          const parts = [...prev.parts]
          parts.splice(idx + 1, 0, clone)
          return { parts }
        })
        setSelectedId(clone.id)
      },
```

- [ ] **Step 4: Run all useScene tests to verify they pass**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: all tests PASS (the new ones now pass, and the existing duplicate/undo/redo tests remain green).

- [ ] **Step 5: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: select clone after duplicate, fix undo/redo selection"
```

---

## Task 2: Ctrl/Cmd+D keyboard shortcut

**Files:**
- Modify: `src/App.tsx` (keyboard handler in `useEffect`, ~lines 99–170)
- Modify: `src/App.test.tsx` (mock + 1 new test)

### Background

The keyboard handler in App.tsx is a `useEffect` starting at line 99. The modifier-key block (lines 124–153) already handles `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+O`, `Ctrl+N`, `Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`, and `Ctrl+Shift+E`. The `Ctrl+D` shortcut follows the same pattern: check `!e.shiftKey && k === 'd'`, guard by `selectedId`, call `onDuplicate(selectedId)`.

The `useEffect` dependency array (lines 157–170) does not include `selectedId` or `onDuplicate`. Adding `Ctrl+D` requires both to be captured — so both must be added to the array. `onDuplicate` is stable across renders (it's a `useCallback` with a stable `push` dep), so adding it costs nothing. `selectedId` changes on every selection, causing the listener to re-register on selection changes — this is the same pattern already used for `cutActive` and `snapActive`.

---

- [ ] **Step 1: Write failing test in `src/App.test.tsx`**

The existing mock at the top of `App.test.tsx` returns `selectedId: null` and has `onDuplicate: vi.fn()`. Update the mock to expose a named mock function and a non-null `selectedId`, then add the test.

**Edit the mock** — at the top of `App.test.tsx`, add `mockOnDuplicate` alongside the existing `mockUndo`/`mockRedo`:

Replace:
```ts
const mockUndo = vi.fn()
const mockRedo = vi.fn()
```

With:
```ts
const mockUndo = vi.fn()
const mockRedo = vi.fn()
const mockOnDuplicate = vi.fn()
```

**In the `vi.mock('./scene/useScene', ...)` factory**, update two lines:

Replace:
```ts
    onDuplicate: vi.fn(),
```

With:
```ts
    onDuplicate: mockOnDuplicate,
```

And replace:
```ts
    selectedId: null,
```

With:
```ts
    selectedId: 'board_test',
```

**Add the new test** inside the existing `describe('App keyboard shortcuts', ...)` block, after the `'Ctrl+Y calls redo()'` test:

```ts
  it('Ctrl+D calls onDuplicate with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }))
    })
    expect(mockOnDuplicate).toHaveBeenCalledWith('board_test')
  })
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
pnpm vitest run src/App.test.tsx
```

Expected: the new test FAILS — no `Ctrl+D` handler exists yet. The two existing tests (`Ctrl+Z`, `Ctrl+Y`) still PASS.

- [ ] **Step 3: Add the keyboard shortcut to `src/App.tsx`**

**Edit A** — In the modifier-key block, add the `Ctrl+D` branch. Insert it after the `Ctrl+Shift+E` block (after the `cuttingListOpen` line) and before the closing brace. The existing block ends with:

```ts
      if (e.shiftKey && k === 'e') {
        e.preventDefault()
        setCuttingListOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
```

Replace that portion with:

```ts
      if (e.shiftKey && k === 'e') {
        e.preventDefault()
        setCuttingListOpen(true)
      }
      if (!e.shiftKey && k === 'd') {
        if (selectedId) {
          e.preventDefault()
          onDuplicate(selectedId)
        }
      }
    }
    window.addEventListener('keydown', handler)
```

**Edit B** — Add `selectedId` and `onDuplicate` to the `useEffect` dependency array. The current array is:

```ts
  }, [
    saveFile,
    saveAsFile,
    openFile,
    newFile,
    undo,
    redo,
    handleActivateCut,
    handleActivateSnap,
    cancelCut,
    cutActive,
    cancelSnap,
    snapActive,
  ])
```

Replace with:

```ts
  }, [
    saveFile,
    saveAsFile,
    openFile,
    newFile,
    undo,
    redo,
    onDuplicate,
    selectedId,
    handleActivateCut,
    handleActivateSnap,
    cancelCut,
    cutActive,
    cancelSnap,
    snapActive,
  ])
```

- [ ] **Step 4: Run all tests**

```bash
pnpm typecheck && pnpm test
```

Expected output ends with something like:
```
Test Files  N passed (N)
     Tests  187 passed | 5 skipped (192)
```

All tests pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: Ctrl/Cmd+D keyboard shortcut for duplicate"
```
