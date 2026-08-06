# E2E Playwright Smoke Harness — Implementation Notes

**Date:** 2026-06-17
**Spec:** `docs/superpowers/specs/2026-06-17-e2e-playwright-smoke-design.md`
**Plan:** `docs/superpowers/plans/2026-06-17-e2e-playwright-smoke.md`

Living record of decisions, constraints, and known open questions for the Playwright E2E smoke harness added in Tasks 1–7.

## Status

Implemented and committed on branch `claude/jolly-tesla-nxqq6q`. CI (`.github/workflows/e2e.yml`) is the first place the smoke tests actually execute against a real browser — the local agent environment could not download the Chromium binary (see below).

## Discovered + fixed: pre-existing OCCT/WASM cold-boot bug

The harness immediately earned its keep: the first real-browser CI runs failed because **OCCT never became ready** ("+ Add board" stayed disabled). A temporary diagnostic spec (console/pageerror capture) pinned the root cause to a build-config bug that had nothing to do with the tests:

- opencascade.js's `index.js` does `import wasmFile from "./dist/opencascade.wasm.wasm"` and passes `wasmFile` to Emscripten's `locateFile` — i.e. it needs that import to resolve to the **asset URL**.
- `vite-plugin-wasm` was installed and applied to all `.wasm` (main + `worker.plugins`). It ESM-instantiates `.wasm` and exposes the instance's exports, with **no default URL export**. Under the `vite@8` + rolldown toolchain it won over `assetsInclude`, so:
  - `pnpm dev`: `[vite] Failed to resolve import "a" from ".../opencascade.wasm.wasm"` (Emscripten's `"a"` import namespace) → the worker's `import('opencascade.js')` 500s → `occtReady` never flips.
  - `pnpm build`: `[MISSING_EXPORT] "default" is not exported by ".../opencascade.wasm.wasm"`.

The unit suite never caught this because it mocks the OCCT worker, and there were no E2E tests exercising the real WASM path.

**Fix:** removed `vite-plugin-wasm` entirely (no `src` file does a direct `.wasm` instantiation import — it was only ever there "for future use") and kept `assetsInclude: ['**/*.wasm']`, so the bare `.wasm` import resolves to a URL string — exactly what opencascade.js expects. Verified locally: `pnpm build` succeeds (emits `opencascade.wasm-*.wasm` as a 65MB asset) and `pnpm dev` serves both `index.js` (200) and `opencascade.wasm.wasm` (200, `application/wasm`). `vite-plugin-wasm` was removed from `package.json`; the `assetsInclude` invariant in `CLAUDE.md` was updated to warn against re-adding it.

**Smoke-test hardening applied alongside the fix** (from the code review): the render assertion now polls `isNonBlank(screenshot)` via `expect.poll` (a frame may not be painted the instant `occtReady` flips), the OCCT-ready wait was bumped to 120s for slow CI runners (per-test `timeout` raised to 180s), and `viewportCanvas` selects the largest canvas in a single `page.evaluate` (post-layout sizes, no per-canvas round-trips).

## Canvas-capture path used

**Path A — `locator.screenshot()`** was used in `e2e/smoke.spec.ts`. Playwright composites the page and returns a PNG buffer (Node-side); the pure `isNonBlank` helper in `e2e/canvas.ts` decodes that PNG with `pngjs` and checks whether any pixel deviates from a single background color by more than `threshold=10` in any R/G/B channel.

This approach does NOT depend on the WebGL `preserveDrawingBuffer` flag. When `preserveDrawingBuffer` is false (the Three.js default), reading pixels via `canvas.getContext('webgl').getImageData()` would return all zeros; `locator.screenshot()` captures composited screen pixels instead, bypassing this limitation entirely.

**Path B — `page.evaluate` / `getImageData`** (the in-browser approach documented as a fallback in the spec) was NOT implemented. Path A is simpler and more reliable for WebGL.

**Not empirically confirmed locally.** Because the Chromium binary could not be downloaded in the dev/agent environment, the smoke tests were never actually executed before CI. If CI reveals a false-blank result (a known WebGL capture pitfall in some headless environments), the spec's last-resort fallback is to assert canvas visibility + non-zero bounding-box dimensions rather than pixel content — record that here if it happens.

## Browser blocked locally

The Chromium binary required by `@playwright/test` could not be downloaded during development. Network egress policy blocks `cdn.playwright.dev` (returns 403 "Host not in allowlist"). As a result:

- Tasks 1–6 were verified with `pnpm exec playwright test --list` (test discovery), `pnpm lint`, and `pnpm test` (Vitest unit tests).
- `pnpm test:e2e` was intentionally NOT run locally. The CI job installs Chromium via `npx playwright install --with-deps chromium` and is the first real execution.

This is a known limitation of the agent environment, not a project configuration issue. Running `pnpm test:e2e` in a standard developer environment with network access should work.

## Vitest / Playwright partition

The project now uses a filename-convention partition:

| Pattern | Runner |
|---|---|
| `*.test.ts` / `*.test.tsx` | Vitest |
| `*.spec.ts` | Playwright |

Key config changes:
- `vite.config.ts`: added `exclude: [...configDefaults.exclude, 'e2e/**/*.spec.ts']` so Vite's test runner never tries to pick up Playwright specs.
- `playwright.config.ts`: `testDir: 'e2e'` + `testMatch: '**/*.spec.ts'` so Playwright never picks up Vitest tests.

This lets `e2e/canvas.ts` (the pure `isNonBlank` helper) be unit-tested with Vitest (`e2e/canvas.test.ts`) while `e2e/smoke.spec.ts` stays Playwright-only. The helper has no browser dependency — pure Node PNG decoding — so Vitest can exercise it without launching a browser.

## stats.js workaround

In dev mode, `src/render/viewport.tsx` mounts a small stats.js FPS/memory overlay as a sibling `<canvas>` element next to the main WebGL viewport canvas. This means `page.locator('canvas')` returns multiple elements.

The smoke test selects the **largest canvas by bounding-box area** (`.evaluate()` over all canvas elements, sorting by `width * height`, returning the largest) rather than `.first()` or a CSS selector. This reliably targets the viewport canvas regardless of how many stat canvases stats.js adds.

If stats.js is ever conditionally excluded from the dev build (or the viewport canvas gains a stable `data-testid`), the largest-canvas selector can be simplified to a direct locator.

## CI workflow

`.github/workflows/e2e.yml` runs on push/PR to `main`. Key points:

- Installs Chromium only (`--with-deps chromium`), not the full browser suite, to keep CI fast.
- Starts the Vite dev server (`pnpm dev`) and waits for it to be ready before running tests (`webServer` option in `playwright.config.ts`).
- Uploads the Playwright HTML report as a CI artifact on failure for debugging.

## Future work (out of scope, recorded)

- **No unit-test CI exists.** The only other workflow is `.github/workflows/update-project-structure.yml` (runs on release). A `ci.yml` running `pnpm typecheck && pnpm lint && pnpm test` on push/PR is the highest-leverage CI gap not addressed here. This was intentionally out of scope for the E2E task.
- **FSAPI file-flow tests** — testing save/open/new via the File System Access API requires a mock or a Chromium flag; deferred from the spec.
- **Raycaster-driven 3D interaction tests** — clicking faces, triggering snaps, adding cuts. Requires stable part selectors and is expensive to set up; deferred.
- **Built-artifact testing** — running smoke tests against `vite preview` (the production build) rather than the dev server. More representative but slower; deferred.
- **Visual-regression baselines** — screenshot diffing against committed reference images. Higher maintenance cost; deferred until the UI is stable.
- **`preserveDrawingBuffer` fallback** — if CI shows Path A (locator screenshot) returns a false blank in headless Chromium, switch the pixel check to canvas visibility + non-zero dimensions. Update these notes and the spec if that happens.

## 2026-08-06 — `suggestion-highlight.spec.ts` (first hover-interaction spec)

Closes the "raycaster-driven 3D interaction tests" item above, for the hover case at least
(no face clicking yet). Drives the sidebar, hovers a suggestion row, and asserts the highlight
reaches the WebGL canvas — the seam the unit tests structurally cannot reach, since they pin
`suggestionFaceRefs`/`faceHitForDisplay` as pure functions and nothing asserts a LineLoop is drawn.

Four things bit during the build; all are load-bearing, do not "simplify" them away:

- **`changedFraction` is the wrong instrument for wireframe.** It masks colour to its high bits to
  suppress AA noise, which also erases 1px anti-aliased lines — the highlight measured *smaller*
  than the frame-to-frame churn of the dev-mode stats.js FPS counter (~0.25% of the canvas, which
  a locator screenshot captures because it overlaps the viewport). Replaced with a count of pixels
  matching the highlight's own amber (`0xfbbf24`); the FPS overlay is cyan, so it drops out.
- **The pointer sits on the suggestion row before the test asks it to.** Clicking "+ Board" leaves
  the cursor over the add-part footer; the sidebar then re-renders the new board's panel — including
  the suggestion row — under that stationary pointer, which fires `mouseenter`. The highlight was
  therefore already on in the "before" frame, the hover changed nothing, and the only visible
  transition was the *un*-hover. The spec now parks the pointer on an inert sidebar header and
  asserts amber == 0 before hovering. Worth knowing as product behaviour too, not just a test quirk.
- **Viewport height, not scrolling.** At the default 720px the suggested-joints section is below the
  fold; `scrollIntoViewIfNeeded()` reports success but the scroll does not survive the re-render
  hovering triggers, so the hover lands on nothing. The spec sets a 1100px-tall viewport instead.
- **The threshold is mutation-calibrated, not eyeballed.** A permissive floor passed with either half
  of the feature deleted. Measured: both halves 1942 amber px (bit-identical across runs), tint
  disabled 1221, outlines disabled 717, un-hovered 0. The gate sits at 1500, in the gap, and both
  mutants now fail. If a runner's AA shifts these, recalibrate against that table — lowering the
  number until it passes would silently restore the useless version.

Local-run gotcha unrelated to CI: this image ships Chromium build 1194 while the project pins
`@playwright/test` 1.61 (which wants 1228), so `pnpm test:e2e` fails to launch until the expected
path is bridged to the installed build. Do not run `playwright install`, and do not pin
`executablePath` in `playwright.config.ts` — CI installs a matching build via `--with-deps chromium`
and would break.
