# Failure containment — design

**Date:** 2026-11-08
**Status:** Approved for planning (A2 chosen by the product owner)
**Size:** small change — this is the short design
**Scope:** engineering hardening, first of two items (B: `.zimmu` contract hardening follows)

## Intent and why

The app currently renders `<App />` directly from `src/main.tsx`, and `App.tsx` renders
eleven `lazyNamed` workspaces and modals inside two `<Suspense>` blocks. There is no error
boundary anywhere in `src/`.

Two realistic failures therefore blank the whole application:

1. **A render-time exception in any child** (viewport, sidebar, a cabinet panel, a workspace,
   a modal) propagates to the React root and unmounts the tree.
2. **A dynamic import that cannot load** — an old tab after a deploy, an offline user, a
   cache mismatch — rejects inside `React.lazy` and does the same.

In both cases the user loses the entire session, including any unsaved scene. The geometry
engine already has a dedicated failure path (`occtFailure` / `retryOcct`); render failures do
not.

The goal is not to make every bug impossible. It is to contain a failure to the smallest
surface that can still show the user something useful, and to give them a way to keep their
work or get back to a working state.

## Goals

- A render or lazy-load failure never produces a blank page.
- A failing workspace or modal leaves the 3D viewport, sidebar and file menu usable.
- The main shell can offer a **valid `.zimmu` recovery download** of the current scene and
  project, without touching the saved-file state or the dirty flag.
- A chunk-load failure is identified as such and tells the user to reload.
- All fallbacks are accessible (`role="alert"`, keyboard reachable, visible focus).

## Non-goals

- No crash autosave to IndexedDB/sessionStorage (that is the deferred A3 option).
- No Sentry/telemetry, no `window.onerror` or `unhandledrejection` handler.
- No attempt to catch errors from event handlers, promises, timers or effects. React error
  boundaries do not see those; keep existing per-area handling.
- No change to `.zimmu` content, `FILE_FORMAT_VERSION`, or any generation logic.
- No conversion of existing modals to a new dialog pattern.

## Constraints

- React 19 error boundaries are still class components (`getDerivedStateFromError` /
  `componentDidCatch`). There is no function-component equivalent.
- `React.lazy` caches a rejected import for the lifetime of the page. A reset does not retry
  the import; only a full reload does. The fallback copy must reflect that.
- The UI copy is English. The design uses English strings.
- Tests run in happy-dom with Testing Library; a real browser is available through Playwright.
  `e2e/engine-failure.spec.ts` is the precedent for forcing a failed resource request.

## Approaches considered

- **A1 — root boundary only.** Wrap `<App />` in `main.tsx`; fallback offers Reload.
  Smallest possible change, but any child error still discards the session. It only replaces
  a blank page with a message. Rejected: it does not meet the containment goal.
- **A2 — root + shell + panel/modal boundaries (chosen).** Three containment levels, with
  the shell fallback able to download the current file and panel fallbacks that keep the app
  alive. Small, testable, and no new persistence.
- **A3 — A2 plus crash autosave.** Debounced snapshot of the envelope into IndexedDB or
  sessionStorage so even a root crash can offer a draft. Best protection of unsaved work, but
  adds a persistence surface (key, quota/eviction, cleanup, tests) and moves the work from
  small to medium. Deferred until there is evidence it is needed.

## Design

### 1. `src/ui/ErrorBoundary.tsx` (new)

A small class component with no app imports.

```ts
interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (error: Error, reset: () => void) => ReactNode
  resetKeys?: readonly unknown[]
  onError?: (error: Error, info: ErrorInfo) => void
}
```

- State is `{ error: Error | null }`.
- `static getDerivedStateFromError` returns `{ error }`.
- `componentDidCatch` calls the optional `onError`.
- `componentDidUpdate` compares `resetKeys` shallowly and clears the error when they change.
  Comparison is by `Object.is` per index and by length, so callers pass primitives (panel
  open flags, `fileReady`, `activeItemId`), never freshly allocated objects.
- `reset()` clears the error.
- When there is no error it renders `children` unchanged, so the boundary adds no DOM.

Also exported from this module:

```ts
export function isChunkLoadError(error: unknown): boolean
```

True for the known dynamic-import messages: `Failed to fetch dynamically imported module`,
`error loading dynamically imported module`, `Importing a module script failed`, and a
`ChunkLoadError` name. This is a pure function and the unit under test for the copy switch.

### 2. `src/ui/ErrorFallbacks.tsx` (new)

Three presentational components plus one shared card style. They take callbacks, not hooks,
so they are trivial to test.

- **`RootFallback`** — full-screen, `role="alert"`, a short title, the error message, and a
  **Reload** button (`window.location.reload()`). No download action: the root boundary sits
  above `App`, so it has no access to the scene.
- **`ShellFallback`** — fills the app chrome, `role="alert"`. Shows the message and two
  actions: **Download recovery snapshot** (calls the passed callback) and **Reload**. It is
  rendered *inside* `App`, which is why it can offer the download. Copy states that the
  download is the current in-memory state and that reloading opens the last saved file.
- **`PanelFallback`** — overlay, `role="alert"`, used by both panel boundaries. Actions:
  **Close panel** (calls `onDismiss`, which closes that group's open flags; the boundary
  clears through `resetKeys`) and **Reload**. When `isChunkLoadError` is true, the title
  becomes "A new version may be available" and the primary action is **Reload**; Close is
  still offered but the copy says the panel may fail again until the page reloads.

Accessibility: each fallback focuses its heading or primary action on mount with a ref
effect, so keyboard users land inside the alert. `role="alert"` gives screen readers the
message immediately. Styling follows the existing Tailwind tokens; no new dependency.

### 3. `src/scene/useFile.ts` — one new result member

Add to `UseFileResult` and the returned object:

```ts
recoverySnapshot: () => { text: string; filename: string }
```

> **Builder's call (2026-11-08):** the first draft exposed `downloadRecoverySnapshot()` and
> called `downloadBlob` from `useFile`. The plan returns the text and lets `App` deliver it,
> because `App` already imports `downloadBlob` and `src/scene/` should not gain a `src/ui/`
> dependency for a DOM action. Behaviour is unchanged.

Implementation reuses the existing private `buildEnvelope()` and `serialize()`:

- Build the current envelope exactly as `saveAsFile` would, including the current scene,
  project, name, units, version and camera.
- `filename` is `${safeName}-recovery.zimmu`; `safeName` is `projectName` with characters
  illegal in a filename (`\ / : * ? " < > |`) replaced by `-`, falling back to `Untitled`
  when empty.
- **It must not** update `lastSavedSceneRef`, `lastSavedProjectRef`, `pendingMigrationRef`,
  the file handle, or `isDirty`. It is a read-only view of current state.
- No new IDB store or key.

The dirty flag is computed from the saved snapshot, so a test asserts `isDirty` is unchanged
after the call and that the serialized text parses back to the current scene.

### 4. `src/main.tsx` — root containment

Wrap the existing tree:

```tsx
<StrictMode>
  <ErrorBoundary fallback={(error) => <RootFallback error={error} />}>
    <App />
  </ErrorBoundary>
</StrictMode>
```

This catches a throw inside `App` itself (including `useScene` / `useFile` render failures)
and lazy failures that escape the inner boundaries. It deliberately does not catch errors
thrown by `main.tsx` before React mounts.

### 5. `src/App.tsx` — shell and panel containment

- **Shell boundary** around the main layout region that contains `<Viewport>` and
  `<Sidebar>` (inside the top-level flex column, after the file menu). Fallback:
  `<ShellFallback onDownload={downloadRecoverySnapshot} />`.
  `resetKeys={[fileReady, activeItemId]}` so switching item or reopening a file clears it.
  The file menu stays outside this boundary so the user can still open another file or save.
- **Workspace boundary** around the first `<Suspense>` block (SlopedTop, Stock, GrainMatch,
  OpeningMotion, CatalogueImport, ReleaseSourceComparison). Fallback: `PanelFallback` whose
  `onDismiss` closes every open flag in that group; `resetKeys` is the group's flags.
- **Modal boundary** around the second `<Suspense>` block (BomModal, ManufacturingReadiness,
  DrawingViewer, packet verifier/comparison). Same pattern with its own flags.
- The `onDismiss` handlers live in `App` beside the existing close callbacks, so the design
  does not require a new state machine. In practice one workspace or modal is open at a time;
  closing the group is acceptable and is simpler than identifying the exact failing child.
- `recoverySnapshot` comes from `useFile`; `App` passes a small `onDownload` callback to
  `ShellFallback` that calls `recoverySnapshot()` and then `downloadBlob(text, filename,
  'application/json')`.

### 6. `CLAUDE.md` — record the rule

Add one entry under the shared-helpers / UI notes:

- Boundaries exist at root (`main.tsx`), shell and panel groups (`App.tsx`).
- They catch render and lazy-load errors only; event/async/effect errors are not theirs.
- A chunk-load failure is only truly recovered by Reload, because `React.lazy` caches the
  rejected import.
- A new workspace or modal should be mounted inside the existing group boundary, not
  directly under `App`.

## Test plan

Unit (Vitest + Testing Library):

- `ErrorBoundary.test.tsx`: renders children when healthy; shows fallback on a throw; `reset`
  restores children; a changed `resetKeys` entry clears; unchanged keys do not; `onError` is
  called with the error; no extra DOM when healthy.
- `ErrorFallbacks.test.tsx`: `role="alert"` and focus on mount; Root reload action; Shell
  download action; Panel close action; chunk-error copy and primary action.
- `isChunkLoadError`: each known message, a `ChunkLoadError`-named error, and false for an
  ordinary error.
- `useFile.test.ts`: `downloadRecoverySnapshot` serializes the current scene/project/version,
  uses `-recovery.zimmu`, leaves `isDirty` unchanged, and does not alter the saved snapshot
  (spy on `downloadBlob`; the module is already a pure delivery helper).

E2E (`e2e/error-boundary.spec.ts`, Playwright):

- Abort the dynamically imported `BomModal` chunk with `page.route`, open the BOM, and assert
  the panel fallback appears, the sidebar and viewport are still present, and Reload returns
  the app to a working state. Follows `e2e/engine-failure.spec.ts`.
- This is the only test that can prove the lazy failure path; a unit test cannot simulate
  Vite's chunk loading.

The existing suite must stay green: `pnpm typecheck && pnpm lint && pnpm check:file-casing &&
pnpm test`. No existing test is expected to change, except the `useFile` result shape (additive).

## Risks and edge cases

- **Boundaries do not catch event/async/effect errors.** A button handler that throws still
  surfaces as an unhandled error. This design deliberately does not add a global handler;
  that is a separate decision.
- **`React.lazy` caches a rejected import.** Reset + re-open the same panel re-throws without
  a page reload. Copy and test expectations must not pretend otherwise.
- **StrictMode double rendering** is fine for a class boundary; `componentDidCatch` may run
  twice in development. `onError` must be idempotent (it is only an optional log).
- **Shell reset remounts the viewport.** `viewport.tsx` is mount-once; recovering the shell
  tears down and rebuilds the renderer and meshes. Acceptable for a recovery path, but it
  should be stated in the test so nobody treats a remount as a leak.
- **The root fallback cannot download unsaved state.** That is the A3 follow-up. The copy
  must say reloading reopens the last saved file, not that work is preserved.
- **Fallback recursion.** The fallbacks are dependency-free presentational components; if a
  fallback itself throws, React has nowhere left to catch it. Keep them free of hooks tied to
  app state.

## What is left to the builder

- Exact visual treatment and copy review for the three fallbacks.
- Whether the shell boundary also wraps `FileMenu` (recommended: no — keeping it outside
  guarantees Open/Save remain reachable after a shell crash).
- The mechanical test additions and the e2e route pattern.
- One line in `CLAUDE.md` recording the boundary rule.
