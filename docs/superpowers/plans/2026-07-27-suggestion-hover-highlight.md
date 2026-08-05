# Suggestion Hover Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a row in the sidebar's "Suggested joints" list highlights that suggestion's neighbouring board in the 3D viewport.

**Architecture:** `App.tsx` holds a single `hoveredNeighborId: PartId | null`. `SuggestionsPanel` rows report hover in/out through a new `onHoverSuggestion` prop, threaded along the same App → Sidebar → EditPanel → SuggestionsPanel path the existing suggestion props already take. `App` passes the id to `Viewport` as a new optional `highlightedId` prop, which makes the existing edge-line colour ternary three-state. The highlight deliberately uses the edge-colour channel only — never emissive — because the flash animation's completion handler resets emissive to a hardcoded selected-or-black and would silently wipe it.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`), Three.js, Vitest + happy-dom + @testing-library/react, Tailwind v4. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-07-27-suggestion-hover-highlight-design.md`
**Notes:** `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md` (this feature's existing thread)

**Conventions (every task):**
- Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (a pre-commit hook runs typecheck).
- `import type { … }` for type-only imports. No `any`.
- Commit messages: short imperative summary. Do **not** include model identifiers.
- Prettier auto-formats on save via a hook; its reformatting is not a deviation.

**Why only three tasks.** Making `onHoverSuggestion` a *required* prop compile-couples the whole chain: the moment `SuggestionsPanel` requires it, `sidebar.tsx` fails to typecheck until it passes it, and the moment `SidebarProps` requires it, `App.tsx` fails until it does too. Splitting that chain across commits would leave the build red at a commit boundary, so Task 2 lands the panel, the threading, and the App wiring together. A required prop is preferred over an optional one here precisely because it makes a missing wire-up a compile error rather than a silent no-op.

---

### Task 1: `Viewport` highlight prop

**Files:**
- Modify: `src/render/viewport.tsx`

Self-contained: the prop is optional, so no caller changes are needed and nothing breaks. It is intentionally unused until Task 2 — that is not a gap.

There is no test for this task. `src/render/viewport.tsx` has no test file; the repo tests the geom seam rather than Three.js internals (see CLAUDE.md). Verification is `pnpm build` plus the manual check in Task 2.

- [ ] **Step 1: Add the prop to the interface**

In `src/render/viewport.tsx`, `interface ViewportProps` currently ends with `flashTarget?: { id: PartId; seq: number } | null`. Add one line after it:

```ts
  highlightedId?: PartId | null
```

- [ ] **Step 2: Add it to the destructure**

The `export function Viewport({ … })` destructure currently ends with `flashTarget,`. Add after it:

```ts
  highlightedId,
```

- [ ] **Step 3: Make the edge-line colour three-state**

Find this block (currently at `src/render/viewport.tsx:478-483`), inside the mesh-management effect:

```ts
    // Selection highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : 0x1a1a1d,
      )
    }
```

Replace it with:

```ts
    // Selection + suggestion-hover highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : id === highlightedId ? 0xfbbf24 : 0x1a1a1d,
      )
    }
```

Selection is checked first so it wins; that branch is unreachable in practice because a suggestion's neighbour is never the selected board, but the ordering makes the intent explicit. Amber `0xfbbf24` already exists in this file's palette (the snap source-face highlight).

**Do NOT touch the emissive loop** immediately below it (`for (const [id, mesh] of meshes.current)`), and **do NOT touch the flash handling** in the animation loop (around `src/render/viewport.tsx:259-280`). The highlight stays off the emissive channel on purpose — see the plan header.

- [ ] **Step 4: Add the dependency**

The same effect's dependency array is currently `}, [parts, geometries, selectedId])` (at `src/render/viewport.tsx:490`). Change it to:

```ts
  }, [parts, geometries, selectedId, highlightedId])
```

Without this the edge colour would not update when the hovered row changes.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean; `pnpm build` produces `dist/` with no TypeScript errors. Pre-existing warnings are fine (opencascade.js Node-module externalization notices, and a >500kB chunk-size warning). Do not run the dev server or a browser.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/render/viewport.tsx
git commit -m "feat: highlightedId prop tints a board's edges in the viewport"
```

---

### Task 2: Panel hover handlers and full wiring

**Files:**
- Modify: `src/ui/SuggestionsPanel.tsx`
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/SuggestionsPanel.test.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/ui/SuggestionsPanel.test.tsx`, append these two tests. `fireEvent` and `vi` are already imported at the top of the file — do not add duplicate imports.

```tsx
test('hovering a row reports that row’s neighbour', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={suggestions}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  const row = screen.getByText('Dado with Rail 2').closest('div')!
  fireEvent.mouseEnter(row)
  expect(onHoverSuggestion).toHaveBeenCalledWith('B')
})

test('leaving a row clears the hover', () => {
  const onHoverSuggestion = vi.fn()
  render(
    <SuggestionsPanel
      suggestions={suggestions}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={onHoverSuggestion}
    />,
  )
  const row = screen.getByText('Dado with Rail 2').closest('div')!
  fireEvent.mouseLeave(row)
  expect(onHoverSuggestion).toHaveBeenCalledWith(null)
})
```

The row `<div>` has no role or test id, and React's `onMouseEnter`/`onMouseLeave` do not bubble, so the events must fire on the row itself. The label `<span>`'s parent is the row `<div>`, so `.closest('div')` resolves to it.

**Also update the three existing tests in this file.** `onHoverSuggestion` is a required prop, so every existing `<SuggestionsPanel … />` render call must pass it or the file will not typecheck. Add `onHoverSuggestion={vi.fn()}` to each of the three existing renders.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx`
Expected: FAIL — the two new tests fail because no hover handler is wired (`onHoverSuggestion` is never called).

- [ ] **Step 3: Add the prop and row handlers to the panel**

In `src/ui/SuggestionsPanel.tsx`, add `onHoverSuggestion` to the component's props (both the destructure and the inline type):

```tsx
export function SuggestionsPanel({
  suggestions,
  scene,
  onApply,
  onHoverSuggestion,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (id: PartId | null) => void
}) {
```

`PartId` is already imported as a type on line 1 of this file — no import change needed.

Then add the two handlers to the row `<div>` (currently line 33):

```tsx
        <div
          key={i}
          className="flex items-center gap-1 py-0.5 border-t border-border/30"
          onMouseEnter={() => onHoverSuggestion(s.neighborId)}
          onMouseLeave={() => onHoverSuggestion(null)}
        >
```

- [ ] **Step 4: Thread the prop through the sidebar**

In `src/ui/sidebar.tsx`, add `onHoverSuggestion: (id: PartId | null) => void` in the four places `onApplySuggestion` already appears, mirroring it exactly:

1. `interface SidebarProps` — after `onApplySuggestion: (s: JointSuggestion) => void` (around line 81).
2. The `EditPanel` inline props type — after its `onApplySuggestion` entry (around line 525).
3. The `EditPanel` destructure — after `onApplySuggestion,` (around line 507).
4. The `Sidebar` destructure — after `onApplySuggestion,` (around line 848).

Then pass it at the two render sites:

- The `<SuggestionsPanel … />` inside `EditPanel` (around line 779) becomes:

```tsx
      <SuggestionsPanel
        suggestions={suggestions}
        scene={scene}
        onApply={onApplySuggestion}
        onHoverSuggestion={onHoverSuggestion}
      />
```

- The `<EditPanel … />` render inside `Sidebar` (around line 1062) gains, after `onApplySuggestion={onApplySuggestion}`:

```tsx
            onHoverSuggestion={onHoverSuggestion}
```

`PartId` is already imported as a type in `sidebar.tsx`. Locate each site by matching the surrounding `onApplySuggestion` content rather than trusting the line numbers, which will have drifted.

- [ ] **Step 5: Add the state and wiring in App**

In `src/App.tsx`:

5a. Declare the state **immediately before** `const applySuggestion = useCallback(` (currently around line 65). It must be declared before `applySuggestion` because that callback references the setter:

```ts
  const [hoveredNeighborId, setHoveredNeighborId] = useState<PartId | null>(null)
```

`useState` and the `PartId` type are already imported in this file.

5b. Clear the hover at the very top of `applySuggestion`'s body, before the `switch` — each `case` returns, so clearing before the switch is the only place it runs for every kind:

```ts
    (s: JointSuggestion) => {
      setHoveredNeighborId(null)
      switch (s.kind) {
```

Do **not** add `setHoveredNeighborId` to that `useCallback`'s dependency array. `useState` setters are stable and React's `exhaustive-deps` rule exempts them.

5c. Pass the id to `<Viewport>`, after `flashTarget={flashTarget}` (around line 339):

```tsx
          highlightedId={hoveredNeighborId}
```

5d. Pass the setter to `<Sidebar>`, after `onApplySuggestion={applySuggestion}` (around line 383):

```tsx
          onHoverSuggestion={setHoveredNeighborId}
```

The setter's type is `Dispatch<SetStateAction<PartId | null>>`, which accepts `PartId | null`; passing it where `(id: PartId | null) => void` is expected is sound under parameter contravariance, so no wrapper lambda is needed.

- [ ] **Step 6: Fix the sidebar test's props helper**

`SidebarProps` gained a required field, so `src/ui/sidebar.test.tsx`'s `props()` helper no longer typechecks. It already contains `suggestions: []` and `onApplySuggestion: vi.fn()` (around lines 100-101). Add after them:

```ts
    onHoverSuggestion: vi.fn(),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.test.tsx`
Expected: PASS — 5 tests in `SuggestionsPanel.test.tsx` (3 existing + 2 new), plus the existing sidebar tests.

- [ ] **Step 8: Verify the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `pnpm build` produces `dist/` with no TypeScript errors.

Manual check (recommended, not required — needs a browser): `pnpm dev`, add two boards positioned so a suggestion appears, select one, then hover the suggestion row. The neighbouring board's edges should turn amber and return to normal when the mouse leaves. Clicking **Add** should clear the highlight as the row disappears.

- [ ] **Step 9: Commit**

```bash
git add src/ui/SuggestionsPanel.tsx src/ui/SuggestionsPanel.test.tsx src/ui/sidebar.tsx src/ui/sidebar.test.tsx src/App.tsx
git commit -m "feat: hovering a joint suggestion highlights the neighbour board"
```

---

### Task 3: Docs

**Files:**
- Modify: `docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Append to the notes file**

Keep one thread for this feature — append to the existing notes file rather than starting a new one. Read it first to match its style (dated `##` headings, bullet entries), then append:

```markdown
## 2026-07-27 — suggestion hover highlight

- Hovering a Suggested joints row lights the neighbouring board's edges amber (`0xfbbf24`) in the
  viewport, so "Dado with Rail 2" is self-explanatory. Matters more now that one box corner can list
  Dado, Mortise & tenon and Finger joint together.
- **Edge colour only, never emissive.** Selection uses both channels, so mirroring it is the
  instinct — but the flash animation's completion handler (`viewport.tsx`, animation loop) resets a
  mesh's emissive to a hardcoded `selected ? 0x222244 : 0x000000`. An emissive-based highlight would
  be silently wiped when a flash finished on that board, and stay wiped until `parts`/`geometries`/
  `selectedId`/`highlightedId` next changed. Staying on the edge channel sidesteps it without
  touching working animation code.
- `applySuggestion` clears the hover: applying makes the row unmount, and `onMouseLeave` never fires
  on an unmounted element, which would otherwise leave the board lit indefinitely.
- `onHoverSuggestion` is deliberately a **required** prop through the whole chain, so a missing
  wire-up is a compile error. `Viewport.highlightedId` is optional (matching the existing
  `flashTarget?` convention), so that one is not compile-enforced.
- Face-level highlighting (outlining the two faces a joint would use) was considered and deferred.
  The groundwork exists: `computeFaceCorners` reads only `localFaceNormal`, which `synthHit` sets, so
  suggestion faces feed the existing `updateHighlight` LineLoops directly. Blockers were half-lap
  carrying no faces and the two LineLoops being owned by the snap/gesture modes.
```

- [ ] **Step 2: Update `project-structure.html`**

Read the file first and match its existing markup. Find the `src/ui/` table row for `SuggestionsPanel.tsx`; its description currently reads roughly "Sidebar 'Suggested joints' list with one-click Add (calls `onApplySuggestion`)." Update only that description to mention hover, e.g. append "; hovering a row highlights the neighbour board via `onHoverSuggestion`".

Change nothing else — leave the `AUTOGEN` blocks, date stamps, and all other rows untouched.

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: still green (docs-only changes). Confirm with `git status --porcelain` that only the two doc files are modified.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-07-26-auto-suggest-joints-notes.md project-structure.html
git commit -m "docs: record suggestion hover highlight"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** `hoveredNeighborId` state → Task 2 Step 5a; `onHoverSuggestion` prop + row handlers → Task 2 Steps 3; threading → Task 2 Step 4; `Viewport.highlightedId` + three-state edge colour + effect dependency → Task 1; clear-on-apply → Task 2 Step 5b; panel tests → Task 2 Step 1; `sidebar.test.tsx` props helper → Task 2 Step 6 (the spec lists this file, and it is required, not optional — adding a field to `SidebarProps` breaks the helper); "no viewport unit test" → stated explicitly in Task 1; docs → Task 3. The spec's Non-Goals (no face-level highlight, no emissive change, no engine change) are respected — no task touches `suggestJoints.ts`, the emissive loop, or the flash handler.

**Placeholder scan:** none — every step contains the literal code or an exact command.

**Type consistency:** `onHoverSuggestion: (id: PartId | null) => void` is written identically in the panel props (Task 2 Step 3), all four `sidebar.tsx` sites (Step 4), and the `sidebar.test.tsx` helper (Step 6). `highlightedId?: PartId | null` matches between the `ViewportProps` interface (Task 1 Step 1), the destructure (Step 2), its use in the ternary (Step 3), and the value passed from `App.tsx` (Task 2 Step 5c). The state variable is `hoveredNeighborId` and its setter `setHoveredNeighborId` in every reference. Verified against the live code: `SuggestionsPanel` currently takes exactly `{ suggestions, scene, onApply }` and imports `PartId` as a type on line 1; `sidebar.test.tsx` already has `suggestions`/`onApplySuggestion` in its helper at lines 100-101; `fireEvent` is already imported in `SuggestionsPanel.test.tsx` line 2; `<Viewport>` currently ends its props with `flashTarget={flashTarget}`.

**Ordering check:** Task 1 is safe alone because `highlightedId` is optional. Task 2 must land as one commit because a required `onHoverSuggestion` compile-couples panel → sidebar → App; splitting it would red the build at a commit boundary. This is stated in the plan header so an implementer does not "helpfully" split it.
