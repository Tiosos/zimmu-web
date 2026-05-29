# Scene Model Implementation Notes

- **PART_COLORS placement:** Spec said `App.tsx` but moved to `useScene.ts` — all part creation lives there. App.tsx has no mutation code.
- **`occtReady` detection:** Spec described a `buildBox` ping. Implementation sets ready on the first successful `buildPart` resolve instead — avoids a wasted call since the default board triggers one immediately.
- **`edgeLines` as separate scene objects:** LineSegments added directly to the scene (not as mesh children) so `recursive: false` raycasting stays clean. Both objects require position/rotation sync on every transform change.
- **`_occt` lazy singleton:** Worker not instantiated at module load — allows `vi.stubGlobal('Worker', ...)` to work in tests before any effect runs.
- **Uncontrolled dimension inputs:** `DimInput` uses `defaultValue` + `key` at the `EditPanel` level (via `key={part.id}`). Avoids cursor-jump during typing while still resetting when the selected part changes.
- **`occtReadyRef`:** A separate ref guards the `setOcctReady(true)` call inside async `.then()` to avoid stale closure over the `occtReady` state value.
- **`labelCounter` as state:** The spec called for `labelCounter` as a useRef, but reading `ref.current` during render violates `react-hooks/refs` lint rule. Changed to `useState` so `nextLabel` is derived from state (no render-phase ref read). The hook still never reuses label numbers after deletion.
