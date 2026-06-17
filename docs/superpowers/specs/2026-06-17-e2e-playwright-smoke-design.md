# Playwright E2E Smoke Harness — Design Spec

**Date:** 2026-06-17
**Status:** Approved (pending written-spec review)
**Author:** brainstorming session
**Scope:** Thin end-to-end smoke harness for the Zimmu browser prototype — establishes the Playwright pattern against the real OCCT WASM stack, wires a dedicated CI job, and asserts the full app → worker → mesh → render seam. Deferred: file-flow (FSAPI) tests, raycaster-driven 3D interaction tests, built-artifact (preview) testing.

---

## 1. Motivation & Context

The prototype has **374 unit tests across 25 files** (Vitest + happy-dom) but **zero browser-level workflow tests**. Every unit test mocks the OCCT worker (`vi.mock('comlink')` + stubbed `Worker`); none exercises the real WASM kernel, the real Comlink worker boundary, or the real Three.js WebGL render path. The app is now feature-rich (snap/align, rotation snap, boolean cuts, STL/STEP/SVG/DXF/PDF export) and headed for a Rust/Tauri rewrite. A regression that breaks "the app boots and renders a part" would currently pass all 374 unit tests.

This spec covers the **first, deliberately thin** E2E pass. Its job is to prove the harness works against the real WASM/worker/render stack and to establish the file/CI pattern future E2E work will extend. It is explicitly **not** comprehensive coverage.

This task was selected from the deferred-task list in `docs/superpowers/notes/2026-06-13-drawing-export-notes.md` (item #3, "Playwright end-to-end tests"), the only unblocked item remaining on that list.

### Design decisions locked during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Thin smoke harness (1–2 tests, real WASM), wire CI | Lowest-risk pattern-setter; proves the seam before investing in fragile interaction/file tests |
| App serving | Vite dev server (`pnpm dev`) | No build step; WASM served exactly as in dev; fastest loop. Built-`preview` testing deferred |
| CI | Dedicated new workflow with one E2E job | Honors "separate CI job"; no unit-CI workflow exists to attach to (see §7) |
| Assertion strategy | DOM signals + non-blank canvas pixel check | Covers full seam with **zero** production-code changes; honest "geometry reached the screen" signal |
| Browser | Chromium only | App targets Chrome/Edge (FSAPI is Chromium-only anyway); single project keeps the harness lean |

---

## 2. Non-Goals (explicit)

- **No FSAPI / file-flow tests.** Save/Open/New open native OS pickers Playwright cannot drive. Testing them requires an FSAPI mock/shim — deferred.
- **No raycaster-driven 3D interaction tests.** Clicking a specific face in the WebGL canvas to drive snap/cut is fiddly and brittle; deferred to a later interaction-coverage pass.
- **No built-artifact (`vite build` + `vite preview`) testing.** Deferred as a future hardening step.
- **No visual-regression / screenshot-diff baselines.** The canvas check is a coarse non-blank assertion, not a pixel-perfect golden image.
- **No new unit-test CI.** The absence of unit-test CI is a real gap (see §7) but is out of scope for this task; it is recorded as future work, not fixed here.
- **No production-code changes.** The smoke test asserts only against existing DOM (the sidebar part list and the `+ Add board` button) and the existing viewport `<canvas>`. No test-only `window` hooks are added.

---

## 3. Architecture & File Layout

### New dev dependency

- `@playwright/test` (dev dependency, via pnpm).
- Chromium browser binary is **not** auto-installed on `pnpm install`. It is installed explicitly:
  - Locally: developer runs `pnpm exec playwright install chromium` once (documented in the notes file).
  - CI: an explicit `pnpm exec playwright install --with-deps chromium` step (`--with-deps` pulls the OS libraries the browser needs on the runner).

### New files

```
playwright.config.ts        repo root — Playwright config (chromium project, webServer, timeouts)
e2e/
  smoke.spec.ts             the smoke test(s)
```

### Modified files

```
package.json                add @playwright/test devDep + test:e2e / test:e2e:ui scripts
vite.config.ts              add test.exclude to stop Vitest collecting e2e/**
.github/workflows/e2e.yml   NEW dedicated workflow with one E2E job
.gitignore                  ignore Playwright outputs (test-results/, playwright-report/, /blob-report/)
```

### Test-runner isolation (critical)

Vitest's config (`vite.config.ts` → `test`) has **no explicit `include`**, so it uses Vitest's default glob `**/*.{test,spec}.?(c|m)[jt]s?(x)`. This default **matches `e2e/smoke.spec.ts`** (the `.spec.ts` suffix). Without intervention, `pnpm test` would try to run the Playwright spec under Vitest and fail (Playwright's `test`/`expect` are not Vitest's).

**Fix:** add an explicit exclude to the Vitest config:

```ts
import { defineConfig } from 'vitest/config'
// ...
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
```

> Note: setting `exclude` overrides Vitest's default exclude array, so `node_modules/**` and `dist/**` must be listed explicitly. (Importing and spreading `configDefaults.exclude` from `vitest/config` is an acceptable equivalent; the explicit list is preferred here for readability and because the default set is small and stable.)

Conversely, Playwright only collects from `testDir: 'e2e'`, so it never sees `src/**/*.test.ts`. The two runners are fully partitioned: Vitest owns `src/**`, Playwright owns `e2e/**`.

---

## 4. `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 90_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

### Rationale for each non-obvious setting

- **`fullyParallel: false` + `workers: 1`.** The OCCT WASM kernel is ~65 MB and CPU/memory-heavy to boot. Running specs serially avoids contending for memory and keeps CI runners (2 vCPU) from thrashing. With only 1–2 tests, parallelism buys nothing.
- **`retries: CI ? 1 : 0`.** One retry in CI absorbs cold-start jitter (WASM boot, runner I/O). Zero retries locally so flakes surface honestly during development.
- **`timeout: 90_000` (per-test) and `expect.timeout: 60_000`.** WASM boot dominates. The readiness assertion (`+ Add board` enabling) must tolerate a slow cold boot; 60 s expect timeout covers it, 90 s test timeout leaves headroom for the canvas screenshot + assertions.
- **`trace: 'on-first-retry'` + `screenshot: 'only-on-failure'`.** Diagnosis on failure without overhead on green runs. Combined with the HTML reporter artifact upload (§6), a CI failure is debuggable from the run page.
- **`webServer.command: 'pnpm dev'` + `reuseExistingServer: !CI`.** Playwright boots the Vite dev server and waits for `:5173`. Locally, if a dev server is already running it's reused (fast iteration); in CI a fresh server is always started. `webServer.timeout: 120_000` covers Vite cold start + dependency optimization.
- **`forbidOnly: !!CI`.** A stray `test.only` fails the CI build instead of silently skipping the rest of the suite.

---

## 5. `e2e/smoke.spec.ts`

### Stable DOM anchors (verified against current source)

- Default part label: the app seeds one board via `makeDefaultBoard()` in `src/scene/useScene.ts` → `label: 'Board 1'`. The sidebar renders this label.
- Readiness signal: `src/ui/sidebar.tsx` renders `<Button onClick={onAdd} disabled={!occtReady}>+ Add board</Button>`. The button is disabled until `occtReady` flips true (OCCT WASM booted in the worker). Its enabling is the honest "WASM is up" signal.
- Adding a board: clicking `+ Add board` calls `onAdd`, which appends a board labeled `Board 2` (next label is derived sequentially). A second part row appears.
- Viewport canvas: `src/render/viewport.tsx` mounts a Three.js renderer onto a single `<canvas>` element inside the viewport container.

### Test 1 — app boots, OCCT initializes, default board renders

```
1. await page.goto('/')
2. await expect(page.getByText('Board 1')).toBeVisible()
3. const addBtn = page.getByRole('button', { name: '+ Add board' })
   await expect(addBtn).toBeEnabled({ timeout: 60_000 })   // OCCT WASM booted
4. const canvas = page.locator('canvas').first()
   await expect(canvas).toBeVisible()
   const buf = await canvas.screenshot()
   expect(isNonBlank(buf)).toBe(true)                       // geometry reached the screen
```

### Test 2 — adding a board adds a second part

```
1. await page.goto('/')
2. const addBtn = page.getByRole('button', { name: '+ Add board' })
   await expect(addBtn).toBeEnabled({ timeout: 60_000 })    // reuse readiness wait
3. await addBtn.click()
4. await expect(page.getByText('Board 2')).toBeVisible()     // add → rebuild → render loop ran again
```

Test 2 is cheap insurance that the add→rebuild→render interaction loop runs once, without straying into deferred raycaster-click territory.

### The `isNonBlank` canvas helper

The viewport `<canvas>` is opaque to the DOM, so "did it render geometry?" is asserted by sampling pixels: a freshly-cleared canvas is one uniform color; a canvas with a rendered mesh has more than one. The check returns `true` when the sampled pixels contain more than one distinct (quantized) color beyond a small noise threshold.

There are two viable capture paths. The implementation **must spike the capture path first** (see §8 Risks) and pick whichever actually returns non-empty pixels, because this is the one genuine unknown in the design.

**Path A (preferred) — Playwright element screenshot + Node-side PNG decode.**
`await canvas.screenshot()` captures composited pixels via the browser's compositor, which does **not** depend on the WebGL context's `preserveDrawingBuffer` flag. Decode the PNG `Buffer` to RGBA with `pngjs` (a tiny, well-established dev dependency) and count distinct quantized colors. This path is robust regardless of how the existing `WebGLRenderer` is configured, at the cost of one small dev dependency.

**Path B (fallback, no new dependency) — in-browser sampling via `page.evaluate`.**
Draw the canvas into an offscreen 2D context at reduced size (e.g. 64×64), call `getImageData`, count distinct quantized colors. Avoids the `pngjs` dependency, **but** `drawImage`/`toDataURL` against a WebGL canvas only reliably reads pixels when the context was created with `preserveDrawingBuffer: true`. The current Three.js `WebGLRenderer` may not set this, in which case this path reads an empty buffer — hence it is the fallback, not the default.

**Last resort.** If neither path yields pixels, downgrade Test 1's render assertion to "canvas is visible and has non-zero dimensions" and **flag the limitation explicitly in the notes file** — never choose this silently.

The spike resolves which path is used; the chosen path (and any fallback taken) is recorded in the implementation notes.

---

## 6. CI — `.github/workflows/e2e.yml`

A dedicated workflow (no unit-test workflow exists to attach to — see §7).

```yaml
name: E2E

on:
  push:
    branches: ['**']
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Get Playwright version
        id: pw
        run: echo "version=$(pnpm ls @playwright/test --depth 0 --parseable 2>/dev/null | head -n1)" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        id: pw-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Install Playwright Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### Rationale

- **Triggers:** `push` to any branch + `pull_request` — same intent as a normal test job, ensuring the smoke test runs on the feature branch and on PRs.
- **`timeout-minutes: 20`:** generous bound covering Chromium download (cache-miss), pnpm install, Vite boot, and WASM boot, while still failing a genuinely hung run.
- **Browser cache:** keyed on `pnpm-lock.yaml` hash (which changes when `@playwright/test` version changes), avoiding a ~150 MB Chromium download on every run. The `--with-deps` install on a cache hit is fast (deps already present / quickly reconciled).
- **Artifact on failure:** uploads `playwright-report/` so failures are debuggable from the Actions run page; nothing uploaded on green runs.

> **Cache-key note:** the `Get Playwright version` step is documented for clarity but the cache key above uses `hashFiles('pnpm-lock.yaml')` directly (simpler and equivalent for our purposes since the lockfile pins the Playwright version). The implementation may drop the version-detection step. This is a minor simplification, called out so the discrepancy between the documented step and the cache key is not read as a contradiction.

---

## 7. Discovered Gap — No Unit-Test CI (out of scope, recorded)

While grounding §6, I found the repo has **no CI workflow that runs `typecheck`/`lint`/`test`**. The only existing workflow is `.github/workflows/update-project-structure.yml`, which runs on `release: published` to regenerate `project-structure.html`. The founding plan's claim that "GitHub Actions CI ✅" runs the test suite is **stale**.

**This is not fixed by this task.** This task adds only the E2E workflow. The missing unit-test CI is recorded here as future work so the gap is on record:

> **Future work (separate task):** add a `ci.yml` workflow running `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` on push/PR. This is the higher-leverage CI gap but was outside the agreed scope of the E2E task.

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Canvas pixel capture reads an empty buffer** (no `preserveDrawingBuffer`) | Medium | Spike the capture path first (§5). Prefer Playwright element screenshot (uses compositor, no `preserveDrawingBuffer` needed). Last-resort fallback: assert canvas visible + non-zero size, flagged in notes. |
| **WASM boot exceeds timeouts on slow CI runner** | Low–Medium | 60 s expect / 90 s test / 120 s webServer / 20 min job timeouts; `retries: 1` in CI. |
| **Chromium download cost per run** | Medium | Cache `~/.cache/ms-playwright` keyed on lockfile hash. |
| **Vitest collects the Playwright spec** | High (certain without fix) | Add `test.exclude: ['e2e/**', 'node_modules/**', 'dist/**']` to `vite.config.ts` (§3). |
| **Flaky readiness signal** (button enabling is async) | Low | Assertion-based waits only (`toBeEnabled` with timeout); no `waitForTimeout`. |
| **Dev server `allowedHosts` blocks the Playwright browser** | Very low | `vite.config.ts` already allows `localhost`/`127.0.0.1`/`host.docker.internal`; Playwright hits `localhost:5173`. |

---

## 9. Verification / Success Criteria

The task is complete when **all** of the following hold:

1. `pnpm test:e2e` passes locally against real Chromium + real OCCT WASM (both tests green).
2. `pnpm test` (Vitest) still runs and **does not** collect `e2e/**` (test count unchanged; no Playwright-spec errors).
3. `pnpm typecheck` is green (the config and spec are TS under strict mode).
4. `pnpm lint` is green (ESLint covers the new `.ts` files; ensure `e2e/**` and `playwright.config.ts` are linted or intentionally configured).
5. The new `e2e` CI job runs and goes green on the feature branch.
6. An implementation notes file exists at `docs/superpowers/notes/2026-06-17-e2e-playwright-smoke-notes.md` recording any deviations (especially the canvas-capture approach actually used).

---

## 10. Out-of-Scope / Future Work (consolidated)

- Add unit-test CI (`ci.yml`: typecheck/lint/test) — the higher-leverage CI gap (§7).
- FSAPI mock + file save/open/new E2E flows.
- Raycaster-driven interaction E2E (snap-align, add-cut) and export-download flows (STL/SVG/DXF/PDF blob downloads).
- Built-artifact testing against `vite preview`.
- Visual-regression baselines (golden screenshots) once the viewport is visually stable.
