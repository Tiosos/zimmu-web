# E2E Playwright Smoke Harness — Implementation Notes

**Date:** 2026-06-17
**Spec:** `docs/superpowers/specs/2026-06-17-e2e-playwright-smoke-design.md`
**Plan:** `docs/superpowers/plans/2026-06-17-e2e-playwright-smoke.md`

Living record of decisions, constraints, and known open questions for the Playwright E2E smoke harness added in Tasks 1–7.

## Status

Implemented and committed on branch `claude/jolly-tesla-nxqq6q`. CI (`.github/workflows/e2e.yml`) is the first place the smoke tests actually execute against a real browser — the local agent environment could not download the Chromium binary (see below).

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
