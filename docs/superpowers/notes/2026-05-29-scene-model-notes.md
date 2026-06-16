# Scene Model Implementation Notes

- **PART_COLORS placement:** Spec said `App.tsx` but moved to `useScene.ts` — all part creation lives there. App.tsx has no mutation code.
- **`occtReady` detection:** Spec described a `buildBox` ping. Implementation sets ready on the first successful `buildPart` resolve instead — avoids a wasted call since the default board triggers one immediately.
- **`edgeLines` as separate scene objects:** LineSegments added directly to the scene (not as mesh children) so `recursive: false` raycasting stays clean. Both objects require position/rotation sync on every transform change.
- **`_occt` lazy singleton:** Worker not instantiated at module load — allows `vi.stubGlobal('Worker', ...)` to work in tests before any effect runs.
- **Uncontrolled dimension inputs:** `DimInput` uses `defaultValue` + `key` at the `EditPanel` level (via `key={part.id}`). Avoids cursor-jump during typing while still resetting when the selected part changes.
- **`occtReadyRef`:** A separate ref guards the `setOcctReady(true)` call inside async `.then()` to avoid stale closure over the `occtReady` state value.
- **`labelCounter` as `useMemo`:** The spec called for `labelCounter` as a useRef, but reading `ref.current` during render violates `react-hooks/refs` lint rule. The undo/redo work then settled it on `useMemo` (not `useState`) so the value is computed synchronously from `scene.parts` — this avoids a one-render-stale `nextLabel` after an undo. See `2026-05-30-undo-redo-notes.md`. The hook still never reuses label numbers after deletion.
