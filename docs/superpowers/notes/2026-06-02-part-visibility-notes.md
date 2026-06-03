# Part Visibility Toggle — Implementation Notes

## 2026-06-02

### Raycaster bug: plan assumption was wrong

The plan stated: "Three.js respects `mesh.visible = false` in the raycaster — invisible meshes return no hits, so clicking a hidden part does nothing. No changes are needed for click handling."

This is factually incorrect. `Raycaster.intersect()` (internal traversal) and `Mesh.raycast()` in Three.js r184 do **not** check `object.visible` at any point. The fix was added post-plan: both the click handler and the mousemove/RAF handler now filter the raycaster target list before calling `intersectObjects`:

```ts
Array.from(meshes.current.values()).filter(m => m.visible)
```

This applies to normal click (part selection), snap mode face-pick, and cut mode face-pick. All three handlers share the same pattern.

### Duplicate visibility reset: missed in plan

`onDuplicate` uses a spread (`{ ...orig, ... }`) to build the clone. The plan did not specify resetting `visible: true` on the clone, so a hidden original would produce a hidden clone — invisible in the viewport with no explanation.

Fix: `visible: true` added to the explicit override fields in the `onDuplicate` clone object, alongside `id`, `color`, `position`, `rotation`.

### `nowVisible` const: improvement over plan

Task 2 Step 4 in the plan used `visible: !wasVisible` inline in both the `setScene` call and the `redo` closure. Code quality review replaced this with `const nowVisible = !wasVisible` captured before the first `setScene`, so both the initial mutation and the `redo` closure read from the same captured value rather than recomputing independently. Matches the `before`/`after` snapshot pattern used by `onUpdate`.

### H shortcut guard against snap/cut mode

Post-implementation decision: `H` was initially ungated and would toggle visibility mid-snap or mid-cut. This is confusing — the part being operated on disappears. Guard added: `if (selectedId && !snapActive && !cutActive)`. H is silently suppressed while either mode is active.

### CuttingList intentionally shows hidden parts

Visibility is purely visual (a rendering concern). The CuttingList is a materials list and shows all parts regardless of `visible`. This is by design: a hidden part still needs to be cut to length.
