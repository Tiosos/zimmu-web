# Suggestion Face Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a joint suggestion outlines the two faces that joint would cut, so the three suggestions on a single corner become visually distinguishable.

**Architecture:** Two pure helpers in `src/scene/suggestJoints.ts` — `suggestionFaceRefs` maps a suggestion to the `(partId, face)` pairs it would cut, and `faceHitForDisplay` builds a render-ready `FaceHit` with a **world** `faceNormal` (which `synthHit` does not provide, and which the viewport's 1mm outline offset requires). `App.tsx` holds the hovered *suggestion* and derives both the existing board tint and the new outlines. `Viewport` draws them with two dedicated amber LineLoops, kept separate from the gesture-owned ones.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Three.js, Vitest + happy-dom + @testing-library/react. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-07-27-suggestion-face-highlight-design.md`
**Notes:** `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` (this feature's existing thread)

**Conventions (every task):**
- Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).
- `import type { … }` for type-only imports. No `any`.
- Commit messages: short imperative summary. Do **not** include model identifiers.
- Prettier auto-formats on save via a hook; its reformatting is not a deviation.

**The bug being fixed (context for every task).** `updateHighlight` in `src/render/viewport.tsx` builds an outline from `computeFaceCorners(face, part)` — which reads `face.localFaceNormal` — then offsets it 1mm clear of the surface along `face.faceNormal`, expecting a **world** normal. `synthHit` sets *both* fields to the same **local** vector. Harmless for the apply path (creators read only `localFaceNormal`), but for rendering it means outlines on rotated boards get pushed the wrong way and sink into the solid. **Do not "fix" `synthHit`** — its local/zeroed shape is what the `onAdd*` creators expect and the round-trip test asserts. Task 1 adds a separate display helper instead.

**Ordering note.** Task 2 changes `onHoverSuggestion`'s signature, which compile-couples `SuggestionsPanel` → `sidebar.tsx` → `App.tsx`; those must land in one commit or the build is red at a commit boundary. Task 1 (pure helpers) and Task 3 (viewport prop) are independently safe.

---

### Task 1: Pure helpers — `suggestionFaceRefs` and `faceHitForDisplay`

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

Pure functions, no React, no Three.js. Nothing consumes them yet — that is Task 2, not a gap.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/suggestJoints.test.ts`. Add `suggestionFaceRefs` and `faceHitForDisplay` to the **existing** `import { … } from './suggestJoints'` line rather than a duplicate import. The `board()` factory already exists in this file — reuse it.

```ts
test('suggestionFaceRefs returns the faces each joint kind would cut', () => {
  expect(
    suggestionFaceRefs({ kind: 'halflap', neighborId: 'B', partAId: 'A', partBId: 'B' }),
  ).toEqual([])

  expect(
    suggestionFaceRefs({
      kind: 'dado',
      neighborId: 'B',
      housingPartId: 'A',
      housingFace: '+Z',
      housedPartId: 'B',
      housedEnd: '+X',
    }),
  ).toEqual([
    { partId: 'A', face: '+Z' },
    { partId: 'B', face: '+X' },
  ])

  expect(
    suggestionFaceRefs({
      kind: 'mortise-tenon',
      neighborId: 'B',
      mortisePartId: 'A',
      mortiseFace: '+Z',
      tenonPartId: 'B',
      tenonEnd: '-X',
    }),
  ).toEqual([
    { partId: 'A', face: '+Z' },
    { partId: 'B', face: '-X' },
  ])

  expect(
    suggestionFaceRefs({
      kind: 'tongue-groove',
      neighborId: 'B',
      groovePartId: 'A',
      grooveEdge: '+Y',
      tonguePartId: 'B',
      tongueEdge: '-Y',
    }),
  ).toEqual([
    { partId: 'A', face: '+Y' },
    { partId: 'B', face: '-Y' },
  ])

  expect(
    suggestionFaceRefs({
      kind: 'finger',
      neighborId: 'B',
      partAId: 'A',
      endA: '+X',
      partBId: 'B',
      endB: '-X',
    }),
  ).toEqual([
    { partId: 'A', face: '+X' },
    { partId: 'B', face: '-X' },
  ])
})

test('faceHitForDisplay keeps the local normal and adds the world normal', () => {
  // Unrotated: world normal equals local normal.
  const flat = board({ id: 'F' })
  const hFlat = faceHitForDisplay(flat, '+X')
  expect(hFlat.partId).toBe('F')
  expect(hFlat.localFaceNormal).toEqual({ x: 1, y: 0, z: 0 })
  expect(hFlat.faceNormal.x).toBeCloseTo(1)
  expect(hFlat.faceNormal.y).toBeCloseTo(0)
  expect(hFlat.faceNormal.z).toBeCloseTo(0)

  // Rotated Ry=-90: local +X maps to world +Z. This is the case that catches the bug —
  // an unrotated board cannot distinguish a world normal from a local one.
  const spun = board({ id: 'R', rotation: { x: 0, y: -90, z: 0 } })
  const hSpun = faceHitForDisplay(spun, '+X')
  expect(hSpun.localFaceNormal).toEqual({ x: 1, y: 0, z: 0 })
  expect(hSpun.faceNormal.x).toBeCloseTo(0)
  expect(hSpun.faceNormal.y).toBeCloseTo(0)
  expect(hSpun.faceNormal.z).toBeCloseTo(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `suggestionFaceRefs is not a function` / `faceHitForDisplay is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/scene/suggestJoints.ts`, add both functions immediately after `synthHit` (which ends around line 64, before `const EPS = 1e-4`). `worldFaceNormal` is defined further down in the same module and is hoisted, so calling it here is fine.

```ts
export function suggestionFaceRefs(s: JointSuggestion): Array<{ partId: PartId; face: Face }> {
  switch (s.kind) {
    case 'halflap':
      return [] // crossing overlap — no single pair of faces
    case 'dado':
      return [
        { partId: s.housingPartId, face: s.housingFace },
        { partId: s.housedPartId, face: s.housedEnd },
      ]
    case 'mortise-tenon':
      return [
        { partId: s.mortisePartId, face: s.mortiseFace },
        { partId: s.tenonPartId, face: s.tenonEnd },
      ]
    case 'tongue-groove':
      return [
        { partId: s.groovePartId, face: s.grooveEdge },
        { partId: s.tonguePartId, face: s.tongueEdge },
      ]
    case 'finger':
      return [
        { partId: s.partAId, face: s.endA },
        { partId: s.partBId, face: s.endB },
      ]
    default: {
      // A new suggestion kind must declare its faces here, not silently highlight nothing.
      const _exhaustive: never = s
      throw new Error(`unhandled suggestion kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

// Render-ready hit: computeFaceCorners reads localFaceNormal, while updateHighlight's 1mm
// clearance offset reads faceNormal and needs it in WORLD space. synthHit sets both to the
// local normal, which is correct for the onAdd* creators but wrong for drawing.
export function faceHitForDisplay(part: BoardPart, face: Face): FaceHit {
  return {
    partId: part.id,
    faceNormal: worldFaceNormal(part, face),
    faceCenter: ZERO,
    localFaceNormal: FACE_NORMALS[face],
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}
```

All of `worldFaceNormal`, `FACE_NORMALS`, `ZERO`, `BoardPart`, `Face`, `FaceHit`, `PartId` already exist in this file — no new imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS — the 2 new tests plus all 17 pre-existing ones (19 total).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "feat: suggestionFaceRefs + faceHitForDisplay helpers"
```

---

### Task 2: Hover state carries the suggestion

**Files:**
- Modify: `src/ui/SuggestionsPanel.tsx`
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/SuggestionsPanel.test.tsx`

Must land as ONE commit: changing `onHoverSuggestion`'s signature compile-couples panel → sidebar → App.

`src/ui/sidebar.test.tsx` needs **no change** — its `props()` helper supplies `onHoverSuggestion: vi.fn()`, which satisfies the new signature too. Do not edit it.

- [ ] **Step 1: Update the failing tests**

In `src/ui/SuggestionsPanel.test.tsx`, the two hover tests currently assert on neighbour ids. Change the three assertions to assert on the suggestion objects themselves:

- In `each row reports its own neighbour on hover`, replace `expect(onHoverSuggestion).toHaveBeenLastCalledWith('B')` with:

```ts
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(twoNeighbors[0])
```

and replace `expect(onHoverSuggestion).toHaveBeenLastCalledWith('C')` with:

```ts
  expect(onHoverSuggestion).toHaveBeenLastCalledWith(twoNeighbors[1])
```

- In `leaving a row clears the hover`, the existing `toHaveBeenLastCalledWith(null)` is already correct — leave it unchanged.

Also rename the first test so it still describes what it asserts:

```ts
test('each row reports its own suggestion on hover', () => {
```

Asserting on distinct suggestion objects preserves the property the distinct-neighbour fixture was added for: a row reporting the *wrong* row's suggestion still fails.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: FAIL — the panel still passes `s.neighborId` (a string), so the object assertions fail.

- [ ] **Step 3: Update the panel**

In `src/ui/SuggestionsPanel.tsx`, change the prop's type in the inline props type from
`onHoverSuggestion: (id: PartId | null) => void` to:

```ts
  onHoverSuggestion: (s: JointSuggestion | null) => void
```

and change the row's enter handler from `onHoverSuggestion(s.neighborId)` to:

```tsx
          onMouseEnter={() => onHoverSuggestion(s)}
```

Leave `onMouseLeave={() => onHoverSuggestion(null)}` as-is.

`PartId` is still used by `partLabel` in this file, so keep its import.

- [ ] **Step 4: Update the sidebar's type declarations**

In `src/ui/sidebar.tsx`, `onHoverSuggestion` is declared in two type positions — `interface SidebarProps` and `EditPanel`'s inline props type. Change **both** from `(id: PartId | null) => void` to:

```ts
  onHoverSuggestion: (s: JointSuggestion | null) => void
```

The two destructures and the two render sites pass the value straight through and need no edit. `JointSuggestion` is already imported as a type in this file. Locate the sites by matching the surrounding `onApplySuggestion` declarations rather than by line number.

- [ ] **Step 5: Update App's state**

In `src/App.tsx`:

5a. Change the state declaration (currently `const [hoveredNeighborId, setHoveredNeighborId] = useState<PartId | null>(null)`) to:

```ts
  const [hoveredSuggestion, setHoveredSuggestion] = useState<JointSuggestion | null>(null)
```

5b. In `applySuggestion`, change `setHoveredNeighborId(null)` to:

```ts
      setHoveredSuggestion(null)
```

5c. Change the `<Viewport>` prop from `highlightedId={hoveredNeighborId}` to:

```tsx
          highlightedId={hoveredSuggestion?.neighborId ?? null}
```

5d. Change the `<Sidebar>` prop from `onHoverSuggestion={setHoveredNeighborId}` to:

```tsx
          onHoverSuggestion={setHoveredSuggestion}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.test.tsx`
Expected: PASS — 5 tests in the panel file, plus the existing sidebar tests.

- [ ] **Step 7: Verify the gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `pnpm build` produces `dist/` with no TypeScript errors (pre-existing opencascade externalization notices and the >500kB chunk warning are fine).

The board tint must still work at this point — `highlightedId` now derives from the suggestion, so hovering still tints the neighbour exactly as before.

- [ ] **Step 8: Commit**

```bash
git add src/ui/SuggestionsPanel.tsx src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.tsx src/App.tsx
git commit -m "refactor: hover state carries the suggestion, not just its neighbour"
```

---

### Task 3: Draw the face outlines

**Files:**
- Modify: `src/render/viewport.tsx`
- Modify: `src/App.tsx`

No test: `src/render/viewport.tsx` has no test file and the repo tests the geom seam rather than Three.js internals. Do **not** create one. Verification is the gate plus a manual check.

- [ ] **Step 1: Add the prop to `ViewportProps`**

In `src/render/viewport.tsx`, `interface ViewportProps` currently ends with `highlightedId?: PartId | null`. Add after it:

```ts
  suggestionFaces?: FaceHit[] | null
```

`FaceHit` is already imported as a type in this file.

- [ ] **Step 2: Add it to the destructure**

The `Viewport({ … })` destructure currently ends with `highlightedId,`. Add after it:

```ts
  suggestionFaces,
```

- [ ] **Step 3: Add a ref for the two loops**

Next to the existing `const hoverHighlightRef = useRef<THREE.LineLoop | null>(null)`, add:

```ts
  const suggestionHighlightRefs = useRef<(THREE.LineLoop | null)[]>([null, null])
```

- [ ] **Step 4: Create and register the loops**

In the scene-setup effect, the existing block reads:

```ts
    const sourceLoop = new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24))
    const hoverLoop = new THREE.LineLoop(emptyGeo(), snapMat(0x60a5fa))
    sourceLoop.renderOrder = 1
    hoverLoop.renderOrder = 1
    sourceLoop.visible = false
    hoverLoop.visible = false
    scene.add(sourceLoop)
    scene.add(hoverLoop)
    sourceHighlightRef.current = sourceLoop
    hoverHighlightRef.current = hoverLoop
```

Add immediately after it:

```ts
    const suggestionLoops = [
      new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24)),
      new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24)),
    ]
    for (const loop of suggestionLoops) {
      loop.renderOrder = 1
      loop.visible = false
      scene.add(loop)
    }
    suggestionHighlightRefs.current = suggestionLoops
```

Amber `0xfbbf24` matches the hovered board's edge tint, so tint and outlines read as one highlight.

- [ ] **Step 5: Dispose them**

The same effect's cleanup currently contains:

```ts
      sourceHighlightRef.current?.geometry.dispose()
      hoverHighlightRef.current?.geometry.dispose()
      scene.remove(sourceLoop)
      scene.remove(hoverLoop)
      sourceLoop.material.dispose()
      hoverLoop.material.dispose()
```

Add immediately after those lines:

```ts
      for (const loop of suggestionLoops) {
        loop.geometry.dispose()
        scene.remove(loop)
        loop.material.dispose()
      }
```

- [ ] **Step 6: Drive them from the highlight effect**

The highlight effect currently ends with:

```ts
    updateHighlight(sourceHighlightRef.current, sourceFace, 0xfbbf24)
    updateHighlight(hoverHighlightRef.current, hoveredFace, 0x60a5fa)
  }, [sourceFace, hoveredFace, snapPhase, parts])
```

Change it to:

```ts
    updateHighlight(sourceHighlightRef.current, sourceFace, 0xfbbf24)
    updateHighlight(hoverHighlightRef.current, hoveredFace, 0x60a5fa)
    const sf = suggestionFaces ?? []
    updateHighlight(suggestionHighlightRefs.current[0], sf[0] ?? null, 0xfbbf24)
    updateHighlight(suggestionHighlightRefs.current[1], sf[1] ?? null, 0xfbbf24)
  }, [sourceFace, hoveredFace, snapPhase, parts, suggestionFaces])
```

Two loops is exactly right: `suggestionFaceRefs` returns 0 or 2 entries by construction. `updateHighlight` already hides a loop when passed `null`, so half-lap (`[]`) and no-hover (`null`) both clear with no extra branching. Do **not** modify `updateHighlight` itself.

- [ ] **Step 7: Derive the faces in App**

In `src/App.tsx`, add the imports to the **existing** `./scene/suggestJoints` import line (it currently brings in `suggestJointsFor, synthHit`):

```ts
import { suggestJointsFor, synthHit, suggestionFaceRefs, faceHitForDisplay } from './scene/suggestJoints'
```

Then add this memo immediately after the `hoveredSuggestion` state declaration:

```ts
  const suggestionFaces = useMemo(() => {
    if (!hoveredSuggestion) return null
    return suggestionFaceRefs(hoveredSuggestion).flatMap((r) => {
      const p = scene.parts.find((x) => x.id === r.partId)
      return p && p.kind === 'board' ? [faceHitForDisplay(p, r.face)] : []
    })
  }, [hoveredSuggestion, scene.parts])
```

`useMemo` is already imported. `scene.parts` is in the deps so outlines follow a board that moves while hovered.

- [ ] **Step 8: Pass it to `<Viewport>`**

Add after `highlightedId={hoveredSuggestion?.neighborId ?? null}`:

```tsx
          suggestionFaces={suggestionFaces}
```

- [ ] **Step 9: Verify**

Run: `grep -n "suggestionFaces" src/App.tsx src/render/viewport.tsx`
Expected: the memo, the prop pass, the interface entry, the destructure, and the two `updateHighlight` calls — the prop is optional, so a missing wire-up would compile silently.

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `dist/` produced with no TypeScript errors.

Manual check (needs a browser, recommended): `pnpm dev`, build two boards that produce a dado or finger suggestion, select one, hover the row. The neighbour's edges should tint amber **and** two face outlines should appear floating just clear of each board's surface. Rotate a board and re-check that the outlines still sit *outside* the solid rather than z-fighting — that is the bug this slice fixes. Hovering a half-lap row should tint only, with no outlines.

- [ ] **Step 10: Commit**

```bash
git add src/render/viewport.tsx src/App.tsx
git commit -m "feat: outline the faces a hovered suggestion would cut"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Append to the notes file**

Keep one thread for this feature — append to the existing notes file. Read it first to match its style (dated `##` headings, bullets), then append:

```markdown
## 2026-07-27 — suggestion face outlines

- Hovering a suggestion now outlines the two faces the joint would cut, in addition to tinting the
  neighbour board. This is what makes the three suggestions on one box corner distinguishable —
  Dado, Mortise & tenon and Finger joint all point at the same board but use different faces.
- **Latent bug fixed on the way.** `updateHighlight` builds the outline from `localFaceNormal` but
  offsets it 1mm clear of the surface along `faceNormal`, expecting a WORLD normal. `synthHit` sets
  both to the same LOCAL vector — harmless for the apply path (creators read only `localFaceNormal`)
  but wrong for drawing: on a rotated board the outline was pushed the wrong way, into the solid.
  Added `faceHitForDisplay` rather than changing `synthHit`, whose local/zeroed shape the `onAdd*`
  creators depend on and the round-trip test asserts. The test that pins this uses a ROTATED board;
  an unrotated one cannot tell the two apart.
- `suggestionFaceRefs` carries a `never` guard, so a sixth joint kind is a compile error rather than
  a row that silently highlights nothing.
- Dedicated LineLoops rather than reusing `sourceFace`/`hoveredFace`: those belong to the snap and
  add-joint gestures, and the sidebar stays live during a gesture, so the two would contend.
- Half-lap has no faces, so it degrades to the board tint alone — deliberate, not a gap.
- Hover state changed from `hoveredNeighborId: PartId | null` to `hoveredSuggestion: JointSuggestion
  | null` one slice after landing; the tint now derives `neighborId` from it. The feature needs the
  whole suggestion, and a second parallel callback would have been worse.
```

- [ ] **Step 2: Update `project-structure.html`**

Read the file and match its existing markup. Update the `src/ui/` row for `SuggestionsPanel.tsx` so the hover description mentions the outlines — its `<td>` currently ends with something like "hovering a row highlights the neighbour board via `onHoverSuggestion`". Extend that to note it also outlines the joint's faces. Keep the `<tr><td><code>…</code></td><td>…</td></tr>` structure and the `<code>` tags around identifiers.

Change nothing else — leave the `AUTOGEN` blocks, date stamps, and all other rows untouched.

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: still green (docs-only). Confirm with `git status --porcelain` that only the two doc files are modified.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md project-structure.html
git commit -m "docs: record suggestion face outlines"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** `faceHitForDisplay` → Task 1; `suggestionFaceRefs` (with `never` guard) → Task 1; hover state becomes the suggestion → Task 2; `suggestionFaces` prop + two dedicated amber LineLoops + effect wiring → Task 3; the App memo deriving display hits → Task 3 Step 7; tint preserved via `hoveredSuggestion?.neighborId ?? null` → Task 2 Step 5c; tests for both helpers including the **rotated-board** case → Task 1; panel assertions updated to suggestion objects → Task 2 Step 1; "no viewport test" → stated in Task 3; "`sidebar.test.tsx` needs no change" → stated in Task 2; docs → Task 4. Spec Non-Goals respected: no task modifies `synthHit`, `updateHighlight`, the `sourceFace`/`hoveredFace` props, or any joint-generation logic.

**Placeholder scan:** none — every step carries literal code or an exact command.

**Type consistency:** `suggestionFaceRefs(s: JointSuggestion): Array<{ partId: PartId; face: Face }>` is written identically in Task 1's implementation, Task 1's tests, and Task 3's memo. `faceHitForDisplay(part: BoardPart, face: Face): FaceHit` likewise. `onHoverSuggestion: (s: JointSuggestion | null) => void` matches across the panel (Task 2 Step 3), both sidebar declaration sites (Step 4), and App's setter (Step 5d). `suggestionFaces?: FaceHit[] | null` matches between the interface (Task 3 Step 1), destructure (Step 2), the `updateHighlight` calls (Step 6), and the value passed from App (Step 8). State is `hoveredSuggestion`/`setHoveredSuggestion` in every reference.

**Verified against live code:** `synthHit` ends at line 64 with `const EPS` following; `worldFaceNormal`, `FACE_NORMALS`, `ZERO` are module-private in `suggestJoints.ts`; the viewport's LineLoop creation block and its cleanup (`sourceHighlightRef.current?.geometry.dispose()` … `hoverLoop.material.dispose()`) match the quoted text; the highlight effect's deps are `[sourceFace, hoveredFace, snapPhase, parts]`; the panel test's hover assertions currently read `toHaveBeenLastCalledWith('B')` / `('C')` / `(null)` against a `twoNeighbors` fixture.

**Ordering check:** Task 1 is pure and consumed by nothing, so it is safe alone. Task 2 must be one commit (signature change compile-couples three files). Task 3 depends on Task 1's helpers and Task 2's state, and its optional prop means a missing wire-up compiles silently — hence the explicit `grep` verification in Step 9.
