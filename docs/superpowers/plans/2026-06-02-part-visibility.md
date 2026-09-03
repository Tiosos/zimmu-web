# Part Visibility Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete — the feature is shipped and carries a **Done** badge in `project-structure.html`'s roadmap. Step checkboxes in this file were never ticked as the work went; the record of what landed and why is the Notes file named above.**

**Goal:** Add a per-part visibility toggle: `visible: boolean` on `BoardPart`, `onToggleVisible(id)` in `useScene` with full undo/redo, an eye icon button in the sidebar part row, Three.js mesh visibility sync in the viewport, and an `H` keyboard shortcut in `App.tsx`.

**Architecture:** `visible` is a serialized field on `BoardPart`. Old files without it default to `true` in `parseFile`. The sidebar row gains an eye button; clicking it calls `onToggleVisible`. The viewport sets `mesh.visible = part.visible` and `el.visible = part.visible` in both the create and update paths of the mesh management `useEffect`. App.tsx adds `H` to the non-modifier keyboard block and passes `onToggleVisible` to `<Sidebar>`. The CuttingList intentionally continues to show hidden parts — visibility is purely visual.

**Tech Stack:** React 19, TypeScript strict, Vitest + @testing-library/react.

**Spec:** none — plan-only; no design spec was written for this feature.

---

## File Map

| File | Change |
|------|--------|
| `src/scene/types.ts` | Add `visible: boolean` to `BoardPart` |
| `src/scene/useFile.ts` | Add `visible: p.visible ?? true` in `parseFile` |
| `src/scene/useScene.ts` | `makeDefaultBoard()` and `onAdd` literal get `visible: true`; add `onToggleVisible` to interface and implementation |
| `src/render/viewport.tsx` | Set `mesh.visible` and `el.visible` in create + update paths |
| `src/ui/sidebar.tsx` | Add `onToggleVisible` to props; add eye button; dim hidden part labels |
| `src/App.tsx` | Destructure `onToggleVisible`; add `H` shortcut; pass to `<Sidebar>`; add to deps |
| `src/scene/useScene.test.ts` | Add `visible: true` to inline board; 3 new tests |
| `src/scene/useFile.test.ts` | Add `visible: true` to three inline boards; 1 new backward-compat test |
| `src/scene/utils.test.ts` | Add `visible: true` to `board` fixture |
| `src/scene/useAddCut.test.ts` | Add `visible: true` to `mockPart` |
| `src/scene/useSnap.test.ts` | Add `visible: true` to `partA` and `partB` |
| `src/scene/snapMath.test.ts` | Add `visible: true` to `BOARD` fixture |
| `src/ui/sidebar.test.tsx` | Add `visible: true` to `makeBoard()`; add `onToggleVisible` to `props()`; 2 new tests |
| `src/ui/CuttingList.test.tsx` | Add `visible: true` to `makePart()` |
| `src/App.test.tsx` | Add `mockOnToggleVisible`; wire into mock; 1 new test |

---

## Task 1: Add `visible` field — types, backward compat, all inline fixtures, `makeDefaultBoard` and `onAdd`

**Files:**
- Modify: `src/scene/types.ts:30`
- Modify: `src/scene/useFile.ts:50`
- Modify: `src/scene/useScene.ts:61` and `src/scene/useScene.ts:267`
- Modify (fixtures only): `src/scene/utils.test.ts:16`, `src/scene/useAddCut.test.ts:17`, `src/scene/useSnap.test.ts:25,38`, `src/scene/snapMath.test.ts:41`, `src/scene/useFile.test.ts:177,219,331`, `src/scene/useScene.test.ts:179`, `src/ui/sidebar.test.tsx:19`, `src/ui/CuttingList.test.tsx:21`

### Background

`BoardPart` in `src/scene/types.ts` currently ends with `cuts: CutDef[]`. Adding `visible: boolean` (non-optional) as the next field makes TypeScript flag every inline object literal that constructs a `BoardPart` without the new field. Eleven locations across ten test files need `visible: true`. The two production initializers (`makeDefaultBoard` and the `onAdd` part literal) also need it. `parseFile` needs `visible: p.visible ?? true` so old `.zimmu` files without the field load as `visible: true`.

---

- [ ] **Step 1: Add `visible: boolean` to `BoardPart` in `src/scene/types.ts`**

In `src/scene/types.ts`, replace:
```ts
  rotationOrder: 'XYZ'
  cuts: CutDef[]
}
```
With:
```ts
  rotationOrder: 'XYZ'
  cuts: CutDef[]
  visible: boolean
}
```

- [ ] **Step 2: Add `visible: p.visible ?? true` to `parseFile` in `src/scene/useFile.ts`**

In `src/scene/useFile.ts:50`, replace:
```ts
  return { ...raw, scene: { parts: parts.map((p) => ({ ...p, cuts: p.cuts ?? [] })) } }
```
With:
```ts
  return { ...raw, scene: { parts: parts.map((p) => ({ ...p, cuts: p.cuts ?? [], visible: p.visible ?? true })) } }
```

- [ ] **Step 3: Add `visible: true` to `makeDefaultBoard()` in `src/scene/useScene.ts`**

In `src/scene/useScene.ts`, replace:
```ts
    rotationOrder: 'XYZ',
    cuts: [],
  }
}

export interface UseSceneResult {
```
With:
```ts
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }
}

export interface UseSceneResult {
```

- [ ] **Step 4: Add `visible: true` to `onAdd` part literal in `src/scene/useScene.ts`**

In `src/scene/useScene.ts`, within `onAdd`, replace:
```ts
      rotationOrder: 'XYZ',
      cuts: [],
    }
    setScene((prev) => ({ parts: [...prev.parts, part] }))
```
With:
```ts
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
    }
    setScene((prev) => ({ parts: [...prev.parts, part] }))
```

- [ ] **Step 5: Add `visible: true` to `board` in `src/scene/utils.test.ts`**

Replace:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
}
```
With:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
```

- [ ] **Step 6: Add `visible: true` to `mockPart` in `src/scene/useAddCut.test.ts`**

Replace:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
}
```
With:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
```

- [ ] **Step 7: Add `visible: true` to `partA` and `partB` in `src/scene/useSnap.test.ts`**

Replace the first occurrence:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
}
const partB: Part = {
```
With:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
const partB: Part = {
```

Then replace the second occurrence:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
}

// Source face on A pointing +Z
```
With:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

// Source face on A pointing +Z
```

- [ ] **Step 8: Add `visible: true` to `BOARD` in `src/scene/snapMath.test.ts`**

Replace:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
}

function makeFace(
```
With:
```ts
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

function makeFace(
```

- [ ] **Step 9: Add `visible: true` to all three inline `mockPart`/`part` literals in `src/scene/useFile.test.ts`**

There are three locations. Each ends with `cuts: [],` followed by `}`. The first is around line 177, the second around line 219, the third around line 331. They are structurally identical — find each by its surrounding context.

First (inside `'openFile dirty + user cancels'`):
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      { initialProps: { scene: { parts: [] as Scene['parts'] } } },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(window.confirm).toHaveBeenCalled()
    expect(window.showOpenFilePicker).not.toHaveBeenCalled()
    expect(onFileLoaded).not.toHaveBeenCalled()
```

Replace (just the `cuts: [],\n    }` before `const { result, rerender } = renderHook`):
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      { initialProps: { scene: { parts: [] as Scene['parts'] } } },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(window.confirm).toHaveBeenCalled()
    expect(window.showOpenFilePicker).not.toHaveBeenCalled()
    expect(onFileLoaded).not.toHaveBeenCalled()
```
With:
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      { initialProps: { scene: { parts: [] as Scene['parts'] } } },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(window.confirm).toHaveBeenCalled()
    expect(window.showOpenFilePicker).not.toHaveBeenCalled()
    expect(onFileLoaded).not.toHaveBeenCalled()
```

Second (inside `'openFile dirty + user confirms'`):
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      { initialProps: { scene: { parts: [] as Scene['parts'] } } },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(onFileLoaded).toHaveBeenCalledWith(expect.objectContaining({ name: 'Garden Shelf' }))
```
With:
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
    }
    const { result, rerender } = renderHook(
      ({ scene }) => useFile({ scene, getCameraState: () => CAMERA, onFileLoaded }),
      { initialProps: { scene: { parts: [] as Scene['parts'] } } },
    )
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    rerender({ scene: { parts: [mockPart] } })
    await waitFor(() => expect(result.current.isDirty).toBe(true))

    await act(async () => {
      await result.current.openFile()
    })

    expect(onFileLoaded).toHaveBeenCalledWith(expect.objectContaining({ name: 'Garden Shelf' }))
```

Third (inside `'serialization rounds floats to 6 decimal places'`):
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
    }
    const { result } = renderHook(() => useFile(makeInput({ scene: { parts: [part] } })))
```
With:
```ts
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
    }
    const { result } = renderHook(() => useFile(makeInput({ scene: { parts: [part] } })))
```

- [ ] **Step 10: Add `visible: true` to the board in `replaceScene` test in `src/scene/useScene.test.ts`**

Replace:
```ts
          rotationOrder: 'XYZ' as const,
          cuts: [],
        },
      ],
    }
    act(() => {
      result.current.replaceScene(replacement)
    })
```
With:
```ts
          rotationOrder: 'XYZ' as const,
          cuts: [],
          visible: true,
        },
      ],
    }
    act(() => {
      result.current.replaceScene(replacement)
    })
```

- [ ] **Step 11: Add `visible: true` to `makeBoard()` in `src/ui/sidebar.test.tsx`**

Replace:
```ts
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}
```
With:
```ts
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}
```

- [ ] **Step 12: Add `visible: true` to `makePart()` in `src/ui/CuttingList.test.tsx`**

Replace:
```ts
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}
```
With:
```ts
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}
```

- [ ] **Step 13: Add backward-compat test to `src/scene/useFile.test.ts`**

Add this test immediately after the `'defaults cuts to [] when loading a file without cut data'` test (around line 483 after the existing test ends). Insert before the closing `})` of the `describe('useFile', ...)` block:

```ts
  it('defaults visible to true when loading a file without visible data', async () => {
    const fixtureNoVisible: ZimmuFile = {
      ...FIXTURE,
      scene: {
        parts: [
          {
            kind: 'board' as const,
            id: 'board_old',
            label: 'Board 1',
            length: 200,
            width: 100,
            thickness: 25,
            color: '#d4a373',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ' as const,
            cuts: [],
            // no visible field — simulates a pre-visible file
          } as unknown as Part,
        ],
      },
    }

    const mockHandle = {
      name: 'old.zimmu',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(fixtureNoVisible)),
      }),
    } as unknown as FileSystemFileHandle
    vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)
    const onFileLoaded = vi.fn()

    const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
    await waitFor(() => expect(result.current.fileReady).toBe(true))

    const loaded = vi.mocked(onFileLoaded).mock.calls[0][0] as ZimmuFile
    expect(loaded.scene.parts[0].visible).toBe(true)
  })
```

- [ ] **Step 14: Run tests to verify all pass**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 15: Commit**

```bash
git add src/scene/types.ts src/scene/useFile.ts src/scene/useScene.ts \
  src/scene/utils.test.ts src/scene/useAddCut.test.ts src/scene/useSnap.test.ts \
  src/scene/snapMath.test.ts src/scene/useFile.test.ts src/scene/useScene.test.ts \
  src/ui/sidebar.test.tsx src/ui/CuttingList.test.tsx
git commit -m "feat: add visible field to BoardPart with backward compat"
```

---

## Task 2: `onToggleVisible` in `useScene` with undo/redo

**Files:**
- Modify: `src/scene/useScene.ts` (interface + implementation + return)
- Modify: `src/scene/useScene.test.ts` (3 new tests)

### Background

`onToggleVisible` follows the same pattern as other mutations in `useScene.ts`. It reads `part.visible` before the change (`wasVisible`), flips it with `setScene`, pushes a history entry whose `undo` restores `wasVisible` and whose `redo` applies `!wasVisible`. The label reads `'Hide Board 1'` or `'Show Board 1'`. No selection change on toggle — visibility is independent of selection.

---

- [ ] **Step 1: Write three failing tests in `src/scene/useScene.test.ts`**

Add these tests immediately after the `'undo after onDuplicate restores selection to original'` test (around line 143):

```ts
  it('onToggleVisible hides a visible part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    expect(result.current.scene.parts[0].visible).toBe(false)
  })

  it('onToggleVisible twice restores visibility', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    act(() => {
      result.current.onToggleVisible(id)
    })
    expect(result.current.scene.parts[0].visible).toBe(true)
  })

  it('undo after onToggleVisible restores original visibility', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onToggleVisible(id)
    })
    expect(result.current.scene.parts[0].visible).toBe(false)
    act(() => {
      result.current.undo()
    })
    expect(result.current.scene.parts[0].visible).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify the three new tests fail**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: the three new tests FAIL with `TypeError: result.current.onToggleVisible is not a function`.

- [ ] **Step 3: Add `onToggleVisible` to `UseSceneResult` interface in `src/scene/useScene.ts`**

Replace:
```ts
  onDuplicate: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
```
With:
```ts
  onDuplicate: (id: PartId) => void
  onToggleVisible: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
```

- [ ] **Step 4: Implement `onToggleVisible` in `src/scene/useScene.ts`**

Replace:
```ts
  const onUpdate = useCallback(
    (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => {
```
With:
```ts
  const onToggleVisible = useCallback(
    (id: PartId) => {
      const part = sceneRef.current.parts.find((p) => p.id === id)
      if (!part) return
      const wasVisible = part.visible
      setScene((prev) => ({
        parts: prev.parts.map((p) => (p.id === id ? { ...p, visible: !wasVisible } : p)),
      }))
      push({
        label: wasVisible ? `Hide ${part.label}` : `Show ${part.label}`,
        undo: () =>
          setScene((prev) => ({
            parts: prev.parts.map((p) => (p.id === id ? { ...p, visible: wasVisible } : p)),
          })),
        redo: () =>
          setScene((prev) => ({
            parts: prev.parts.map((p) => (p.id === id ? { ...p, visible: !wasVisible } : p)),
          })),
      })
    },
    [push],
  )

  const onUpdate = useCallback(
    (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => {
```

- [ ] **Step 5: Add `onToggleVisible` to the return statement in `src/scene/useScene.ts`**

Replace:
```ts
    onDuplicate,
    onUpdate,
```
With:
```ts
    onDuplicate,
    onToggleVisible,
    onUpdate,
```

- [ ] **Step 6: Run tests to verify all pass**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: all tests pass including the three new ones.

- [ ] **Step 7: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: add onToggleVisible to useScene with undo/redo"
```

---

## Task 3: Sidebar eye icon button

**Files:**
- Modify: `src/ui/sidebar.tsx` (SidebarProps + part row)
- Modify: `src/ui/sidebar.test.tsx` (props() + 2 new tests)

### Background

The sidebar part row currently shows: color dot | label | duplicate button | delete button. Add a visibility eye button between the label and the duplicate button. Use `●` (U+25CF filled circle) when `part.visible` is true, `○` (U+25CB hollow circle) when false. Dim the label text from `#ccc` to `#555` when hidden. The `onToggleVisible` prop is added to `SidebarProps`.

---

- [ ] **Step 1: Write two failing tests in `src/ui/sidebar.test.tsx`**

Add these after the existing `'calls onDuplicate when duplicate clicked'` test:

```ts
  it('calls onToggleVisible when visibility button clicked', () => {
    const onToggleVisible = vi.fn()
    render(<Sidebar {...props({ onToggleVisible })} />)
    fireEvent.click(screen.getByTitle('Hide'))
    expect(onToggleVisible).toHaveBeenCalledWith('board_t1')
  })

  it('shows hollow circle and Show title for hidden part', () => {
    const onToggleVisible = vi.fn()
    render(
      <Sidebar
        {...props({
          onToggleVisible,
          scene: { parts: [makeBoard({ visible: false })] },
        })}
      />,
    )
    expect(screen.getByTitle('Show')).toBeTruthy()
  })
```

- [ ] **Step 2: Add `onToggleVisible: vi.fn()` to `props()` in `src/ui/sidebar.test.tsx`**

Replace:
```ts
    cutActive: false,
    onCutToggle: vi.fn(),
    ...overrides,
```
With:
```ts
    cutActive: false,
    onCutToggle: vi.fn(),
    onToggleVisible: vi.fn(),
    ...overrides,
```

- [ ] **Step 3: Run tests to verify the two new tests fail**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: the two new tests FAIL because `onToggleVisible` is not in `SidebarProps` and no eye button exists. Existing tests pass (they use `vi.fn()` for `onToggleVisible`).

- [ ] **Step 4: Add `onToggleVisible` to `SidebarProps` in `src/ui/sidebar.tsx`**

Replace:
```ts
  cutActive: boolean
  onCutToggle: () => void
}
```
With:
```ts
  cutActive: boolean
  onCutToggle: () => void
  onToggleVisible: (id: PartId) => void
}
```

- [ ] **Step 5: Destructure `onToggleVisible` in `Sidebar` function signature**

Replace:
```ts
  cutActive,
  onCutToggle,
}: SidebarProps) {
```
With:
```ts
  cutActive,
  onCutToggle,
  onToggleVisible,
}: SidebarProps) {
```

- [ ] **Step 6: Update the part row to add eye button and dim hidden label**

In `src/ui/sidebar.tsx`, replace the label span and the duplicate button in the part row:

```ts
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    color: '#ccc',
                  }}
                >
                  {part.label}
                </span>
                <button
                  style={s.iconBtn}
                  title="Duplicate"
```
With:
```ts
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    color: part.visible ? '#ccc' : '#555',
                  }}
                >
                  {part.label}
                </span>
                <button
                  style={s.iconBtn}
                  title={part.visible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisible(part.id)
                  }}
                >
                  {part.visible ? '●' : '○'}
                </button>
                <button
                  style={s.iconBtn}
                  title="Duplicate"
```

- [ ] **Step 7: Run tests to verify all pass**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: all tests pass including the two new ones.

- [ ] **Step 8: Commit**

```bash
git add src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -m "feat: add visibility eye button to sidebar part row"
```

---

## Task 4: Viewport respects `mesh.visible` and `el.visible`

**Files:**
- Modify: `src/render/viewport.tsx` (mesh management `useEffect`, create and update paths)

### Background

The mesh management `useEffect` (lines 325–404) has two paths in the `for (const part of parts)` loop:
1. **New mesh** (when `existing` is `undefined`): after adding to `meshes.current` and `edgeLines.current`, set `mesh.visible = part.visible` and `el.visible = part.visible`.
2. **Existing mesh** (the `else` branch): after copying position and rotation to both the mesh and edge lines, add `existing.visible = part.visible` and `el.visible = part.visible`.

Three.js respects `mesh.visible = false` in the raycaster (`intersectObjects`) — invisible meshes return no hits, so clicking a hidden part does nothing. No changes are needed for click handling.

The viewport has no unit tests — verify with `pnpm typecheck`.

---

- [ ] **Step 1: Add visibility sync to the new-mesh path in `src/render/viewport.tsx`**

Replace:
```ts
        scene.add(mesh)
        meshes.current.set(part.id, mesh)

        const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1d })
        const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat)
        el.position.copy(mesh.position)
        el.rotation.copy(mesh.rotation)
        scene.add(el)
        edgeLines.current.set(part.id, el)
```
With:
```ts
        scene.add(mesh)
        meshes.current.set(part.id, mesh)
        mesh.visible = part.visible

        const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1d })
        const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat)
        el.position.copy(mesh.position)
        el.rotation.copy(mesh.rotation)
        scene.add(el)
        edgeLines.current.set(part.id, el)
        el.visible = part.visible
```

- [ ] **Step 2: Add visibility sync to the existing-mesh update path in `src/render/viewport.tsx`**

Replace:
```ts
        const el = edgeLines.current.get(part.id)!
        el.position.copy(existing.position)
        el.rotation.copy(existing.rotation)
      }
    }
```
With:
```ts
        const el = edgeLines.current.get(part.id)!
        el.position.copy(existing.position)
        el.rotation.copy(existing.rotation)
        existing.visible = part.visible
        el.visible = part.visible
      }
    }
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/render/viewport.tsx
git commit -m "feat: sync mesh.visible and edgeLine.visible from part.visible"
```

---

## Task 5: App wiring + `H` keyboard shortcut

**Files:**
- Modify: `src/App.tsx` (destructure `onToggleVisible`, pass to `<Sidebar>`, add `H` shortcut, update deps)
- Modify: `src/App.test.tsx` (add `mockOnToggleVisible`, add to mock, 1 new test)

### Background

`App.tsx` destructures `UseSceneResult` at lines 15–39. `onToggleVisible` must be added there. The keyboard handler's non-modifier block (lines 105–121) currently handles `F`, `C`, and `Escape`. Insert `H` in the same block before the final `return`. Pass `onToggleVisible` to `<Sidebar>` at line 259. Add `onToggleVisible` to the `useEffect` deps array (lines 163–178). Since `onToggleVisible` is a `useCallback` with `[push]` as its dep and `push` is stable, adding it costs nothing.

The `H` shortcut does not need `selectedId` because the shortcut is guarded by `if (selectedId)` — `selectedId` is already in the deps array from the `Ctrl+D` change.

---

- [ ] **Step 1: Write one failing test in `src/App.test.tsx`**

Add `mockOnToggleVisible` at the top:

Replace:
```ts
const mockUndo = vi.fn()
const mockRedo = vi.fn()
const mockOnDuplicate = vi.fn()
```
With:
```ts
const mockUndo = vi.fn()
const mockRedo = vi.fn()
const mockOnDuplicate = vi.fn()
const mockOnToggleVisible = vi.fn()
```

Add `onToggleVisible: mockOnToggleVisible` to the `useScene` mock. Replace:
```ts
    onDuplicate: mockOnDuplicate,
    onUpdate: vi.fn(),
```
With:
```ts
    onDuplicate: mockOnDuplicate,
    onToggleVisible: mockOnToggleVisible,
    onUpdate: vi.fn(),
```

Add the test inside `describe('App keyboard shortcuts', ...)`, after the `'Ctrl+D calls onDuplicate'` test:

```ts
  it('H calls onToggleVisible with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).toHaveBeenCalledWith('board_test')
  })
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
pnpm vitest run src/App.test.tsx
```

Expected: the new test FAILS. Existing tests (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+D`) still PASS.

- [ ] **Step 3: Add `onToggleVisible` to `useScene()` destructure in `src/App.tsx`**

Replace:
```ts
    onDuplicate,
    onUpdate,
```
With:
```ts
    onDuplicate,
    onToggleVisible,
    onUpdate,
```

- [ ] **Step 4: Add `H` shortcut to the keyboard handler non-modifier block in `src/App.tsx`**

Replace:
```ts
        if (e.key === 'Escape') {
          if (cutActive) cancelCut()
          if (snapActive) cancelSnap()
          return
        }
        return
      }
```
With:
```ts
        if (e.key === 'Escape') {
          if (cutActive) cancelCut()
          if (snapActive) cancelSnap()
          return
        }
        if (e.key.toLowerCase() === 'h') {
          if (selectedId) {
            e.preventDefault()
            onToggleVisible(selectedId)
          }
          return
        }
        return
      }
```

- [ ] **Step 5: Add `onToggleVisible` to the `useEffect` deps array in `src/App.tsx`**

Replace:
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
With:
```ts
  }, [
    saveFile,
    saveAsFile,
    openFile,
    newFile,
    undo,
    redo,
    onDuplicate,
    onToggleVisible,
    selectedId,
    handleActivateCut,
    handleActivateSnap,
    cancelCut,
    cutActive,
    cancelSnap,
    snapActive,
  ])
```

- [ ] **Step 6: Pass `onToggleVisible` to `<Sidebar>` in `src/App.tsx`**

Replace:
```ts
          onCutToggle={handleActivateCut}
        />
```
With:
```ts
          onCutToggle={handleActivateCut}
          onToggleVisible={onToggleVisible}
        />
```

- [ ] **Step 7: Run all tests**

```bash
pnpm typecheck && pnpm test
```

Expected output:
```
Test Files  N passed (N)
     Tests  N passed | N skipped (N)
```

All tests pass; no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire onToggleVisible to Sidebar and add H keyboard shortcut"
```
