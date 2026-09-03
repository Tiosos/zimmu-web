# Playwright E2E Smoke Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete — the feature is shipped and carries a **Done** badge in `project-structure.html`'s roadmap. Step checkboxes in this file were never ticked as the work went; the record of what landed and why is the Notes file named above.**

**Goal:** Stand up a thin Playwright end-to-end smoke harness that boots the real Zimmu app (real OCCT WASM + Comlink worker + Three.js render) in headless Chromium, asserts the default board renders, and runs in a dedicated CI job — without changing any production code.

**Architecture:** Playwright drives the Vite dev server (`pnpm dev`). Two browser specs in `e2e/smoke.spec.ts` assert DOM readiness signals (the sidebar part list + the `+ Add board` button enabling once OCCT boots) and a non-blank viewport-canvas pixel check. The pixel logic is a pure function (`e2e/canvas.ts` → `isNonBlank`) unit-tested under Vitest. Vitest and Playwright are partitioned by filename convention: `*.test.ts` → Vitest, `*.spec.ts` → Playwright.

**Tech Stack:** `@playwright/test`, `pngjs` (+ `@types/pngjs`) for Node-side PNG decode, GitHub Actions for CI. Existing: Vite 8, Vitest 4, React 19, Three.js, OCCT WASM via Comlink worker.

**Spec:** `docs/superpowers/specs/2026-06-17-e2e-playwright-smoke-design.md`

**Conventions for every commit in this plan:** the repo's git hooks require commits authored as `Claude <noreply@anthropic.com>` (already configured) and every commit message must end with the two trailers:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MjFudrrajTc4yxqmaG2nJx
```

The commit commands below show the summary line only; append the trailer block to each.

**Reference spec:** `docs/superpowers/specs/2026-06-17-e2e-playwright-smoke-design.md`

---

## File Structure

| File | Responsibility | Created/Modified |
|---|---|---|
| `package.json` | Add `@playwright/test`, `pngjs`, `@types/pngjs` devDeps; add `test:e2e` / `test:e2e:ui` scripts | Modify |
| `playwright.config.ts` | Playwright config: chromium project, `webServer: pnpm dev`, `testDir: e2e`, `testMatch: **/*.spec.ts`, timeouts, retries | Create |
| `vite.config.ts` | Add `test.exclude` so Vitest never collects `e2e/**/*.spec.ts` | Modify |
| `eslint.config.js` | Add a config block giving Node globals to `e2e/**/*.ts` + `playwright.config.ts` | Modify |
| `.gitignore` | Ignore Playwright output dirs | Modify |
| `e2e/canvas.ts` | Pure helper `isNonBlank(pngBuffer): boolean` — decodes a PNG and reports >1 distinct color | Create |
| `e2e/canvas.test.ts` | Vitest unit tests for `isNonBlank` (collected by Vitest, ignored by Playwright) | Create |
| `e2e/smoke.spec.ts` | The two Playwright smoke tests (collected by Playwright, ignored by Vitest) | Create |
| `.github/workflows/e2e.yml` | Dedicated CI job running `pnpm test:e2e` on push/PR | Create |
| `docs/superpowers/notes/2026-06-17-e2e-playwright-smoke-notes.md` | Implementation notes (deviations, canvas-capture path actually used) | Create |

---

## Task 1: Install Playwright tooling, scripts, and config

**Files:**
- Modify: `package.json` (devDeps + scripts)
- Create: `playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
pnpm add -D @playwright/test pngjs @types/pngjs
```
Expected: `package.json` `devDependencies` gains `@playwright/test`, `pngjs`, `@types/pngjs`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Install the Chromium browser binary**

Run:
```bash
pnpm exec playwright install chromium
```
Expected: Chromium downloads to `~/.cache/ms-playwright`. If the environment's network policy blocks the download, stop and surface this — the harness cannot run locally without it (CI installs it separately in Task 6).

- [ ] **Step 3: Add E2E scripts to `package.json`**

In the `"scripts"` block, add these two entries (place them after `"coverage"`):
```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
```

- [ ] **Step 4: Create `playwright.config.ts`**

Create `playwright.config.ts` at the repo root:
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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

- [ ] **Step 5: Ignore Playwright output in `.gitignore`**

Append to `.gitignore`:
```
# Playwright
test-results
playwright-report
/blob-report
/playwright/.cache
```

- [ ] **Step 6: Verify the config loads**

Run:
```bash
pnpm exec playwright test --list
```
Expected: Playwright prints "Total: 0 tests in 0 files" (no spec files exist yet) and exits 0. This confirms the config parses and `testDir`/`testMatch` resolve. (If it errors that no tests were found with a non-zero exit, that is also acceptable at this stage — the key is no config parse error.)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts .gitignore
git commit -m "test(e2e): add Playwright tooling, scripts, and config"
```

---

## Task 2: Partition Vitest from Playwright + ESLint Node globals

This task proves the Vitest/Playwright filename partition works by first reproducing the collision, then fixing it.

**Files:**
- Create: `e2e/smoke.spec.ts` (temporary minimal version, expanded in Tasks 4–5)
- Modify: `vite.config.ts`
- Modify: `eslint.config.js`

- [ ] **Step 1: Create a minimal Playwright spec**

Create `e2e/smoke.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('placeholder — replaced in Task 4', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.*/)
})
```

- [ ] **Step 2: Reproduce the Vitest collision**

Run:
```bash
pnpm test
```
Expected: FAIL. Vitest's default glob matches `e2e/smoke.spec.ts`; importing `@playwright/test` and calling `test()` outside the Playwright runner throws (e.g. "Playwright Test did not expect test() to be called here"). This demonstrates why the exclude is needed.

- [ ] **Step 3: Exclude `e2e/**/*.spec.ts` from Vitest**

In `vite.config.ts`, change the import on line 3 from:
```ts
import { defineConfig } from 'vitest/config'
```
to:
```ts
import { defineConfig, configDefaults } from 'vitest/config'
```
Then change the `test` block (currently lines 54–57) from:
```ts
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
  },
```
to:
```ts
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**/*.spec.ts'],
  },
```

- [ ] **Step 4: Verify Vitest now ignores the spec**

Run:
```bash
pnpm test
```
Expected: PASS. The existing suite runs (374 tests across 25 files) and `e2e/smoke.spec.ts` is no longer collected.

- [ ] **Step 5: Add Node globals for e2e/config files in ESLint**

In `eslint.config.js`, add a new config object to the array returned by `defineConfig`, immediately after the existing main `{ files: ['**/*.{ts,tsx}'], ... }` block (before the closing `])`):
```js
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
```
(`globals` is already imported at the top of the file.)

- [ ] **Step 6: Verify lint passes**

Run:
```bash
pnpm lint
```
Expected: PASS, no errors on `e2e/smoke.spec.ts`, `playwright.config.ts`.

- [ ] **Step 7: Verify Playwright still sees the spec**

Run:
```bash
pnpm exec playwright test --list
```
Expected: lists 1 test (`placeholder — replaced in Task 4`) in `e2e/smoke.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts eslint.config.js e2e/smoke.spec.ts
git commit -m "test(e2e): partition Vitest/Playwright and add Node globals"
```

---

## Task 3: `isNonBlank` canvas helper (TDD under Vitest)

The pixel logic is pure and Node-side (decodes the PNG buffer from `locator.screenshot()`), so it is unit-tested with Vitest. The file lives in `e2e/` but uses the `.test.ts` suffix so Vitest collects it and Playwright (which matches only `*.spec.ts`) ignores it.

**Files:**
- Create: `e2e/canvas.ts`
- Test: `e2e/canvas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `e2e/canvas.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { isNonBlank } from './canvas'

function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) {
    const o = i << 2
    png.data[o] = rgb[0]
    png.data[o + 1] = rgb[1]
    png.data[o + 2] = rgb[2]
    png.data[o + 3] = 255
  }
  return PNG.sync.write(png)
}

function twoTonePng(
  w: number,
  h: number,
  top: [number, number, number],
  bottom: [number, number, number],
): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) << 2
      const c = y < h / 2 ? top : bottom
      png.data[o] = c[0]
      png.data[o + 1] = c[1]
      png.data[o + 2] = c[2]
      png.data[o + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

describe('isNonBlank', () => {
  it('returns false for a uniform (single-color) image', () => {
    expect(isNonBlank(solidPng(64, 64, [20, 20, 30]))).toBe(false)
  })

  it('returns true for an image with two distinct color regions', () => {
    expect(isNonBlank(twoTonePng(64, 64, [20, 20, 30], [200, 160, 120]))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm vitest run e2e/canvas.test.ts
```
Expected: FAIL — `Failed to resolve import "./canvas"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `e2e/canvas.ts`:
```ts
import { PNG } from 'pngjs'

// Decodes a PNG screenshot and reports whether it contains more than one
// distinct (quantized) color. A freshly-cleared WebGL canvas is one uniform
// color; a rendered mesh produces several. The high-bit mask suppresses
// anti-aliasing noise. Sampling on a stride keeps it cheap.
export function isNonBlank(pngBuffer: Buffer): boolean {
  const { data, width, height } = PNG.sync.read(pngBuffer)
  const seen = new Set<string>()
  const step = 4
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) << 2
      const key = `${data[o] & 0xe0},${data[o + 1] & 0xe0},${data[o + 2] & 0xe0}`
      seen.add(key)
      if (seen.size > 1) return true
    }
  }
  return false
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm vitest run e2e/canvas.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Verify lint passes on the new files**

Run:
```bash
pnpm lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/canvas.ts e2e/canvas.test.ts
git commit -m "test(e2e): add isNonBlank canvas pixel helper"
```

---

## Task 4: Smoke Test 1 — app boots, OCCT initializes, default board renders

Replace the placeholder spec with the real first test. This is the task that exercises the genuine unknown (canvas capture). The viewport canvas must be distinguished from the dev-only stats.js FPS canvas by picking the largest canvas.

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Write the test**

Replace the entire contents of `e2e/smoke.spec.ts` with:
```ts
import { test, expect, type Page, type Locator } from '@playwright/test'
import { isNonBlank } from './canvas'

// Dev mode mounts a small stats.js FPS canvas as a sibling of the WebGL
// viewport canvas (src/render/viewport.tsx). Pick the largest canvas to
// reliably target the viewport rather than the overlay.
async function viewportCanvas(page: Page): Promise<Locator> {
  const canvases = page.locator('canvas')
  await expect(canvases.first()).toBeVisible()
  const count = await canvases.count()
  let best = canvases.first()
  let bestArea = -1
  for (let i = 0; i < count; i++) {
    const c = canvases.nth(i)
    const box = await c.boundingBox()
    const area = box ? box.width * box.height : 0
    if (area > bestArea) {
      bestArea = area
      best = c
    }
  }
  return best
}

test('app boots, OCCT initializes, and the default board renders', async ({ page }) => {
  await page.goto('/')

  // Default scene seeds one board labeled "Board 1" (src/scene/useScene.ts).
  await expect(page.getByText('Board 1')).toBeVisible()

  // The "+ Add board" button is disabled until occtReady flips true, i.e.
  // until the OCCT WASM kernel has booted in the worker.
  const addBoard = page.getByRole('button', { name: '+ Add board' })
  await expect(addBoard).toBeEnabled({ timeout: 60_000 })

  // Geometry reached the screen: the viewport canvas is not a uniform color.
  const canvas = await viewportCanvas(page)
  const shot = await canvas.screenshot()
  expect(isNonBlank(shot)).toBe(true)
})
```

- [ ] **Step 2: Run the test**

Run:
```bash
pnpm test:e2e
```
Expected: PASS (1 test). Playwright boots the dev server, loads the app, waits for OCCT, and the canvas pixel check passes.

- [ ] **Step 3: Handle the canvas-capture unknown (only if Step 2's pixel check fails)**

If the test fails **only** on `expect(isNonBlank(shot)).toBe(true)` while "Board 1" and the enabled button assertions pass (i.e. the app rendered but the capture came back blank):
1. First confirm it is a true blank by saving a debug screenshot — add `await canvas.screenshot({ path: 'test-results/debug-canvas.png' })` temporarily and inspect it.
2. If the screenshot is genuinely blank (a known WebGL `preserveDrawingBuffer` capture issue), apply the spec's last-resort fallback: replace the pixel assertion with a dimension check:
   ```ts
   const box = await canvas.boundingBox()
   expect(box && box.width > 100 && box.height > 100).toBe(true)
   ```
3. Record this deviation in the notes file (Task 7) — do not choose the fallback silently. Remove the temporary debug screenshot line before committing.

If Step 2 passed, skip this step entirely.

- [ ] **Step 4: Verify lint and the unit suite are unaffected**

Run:
```bash
pnpm lint && pnpm test
```
Expected: both PASS; Vitest still reports the unchanged unit-test count.

- [ ] **Step 5: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): smoke test for app boot + default board render"
```

---

## Task 5: Smoke Test 2 — adding a board appends a second part

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Append the second test**

Add this test to the end of `e2e/smoke.spec.ts` (after the existing `test(...)` block, keeping the existing imports and `viewportCanvas` helper):
```ts
test('adding a board appends a second part', async ({ page }) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Add board' })
  await expect(addBoard).toBeEnabled({ timeout: 60_000 })

  await addBoard.click()

  // labelCounter derives the next label as "Board 2" (src/scene/useScene.ts);
  // the new part appears as a row in the sidebar list.
  await expect(page.getByText('Board 2')).toBeVisible()
})
```

- [ ] **Step 2: Run the full E2E suite**

Run:
```bash
pnpm test:e2e
```
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): smoke test for adding a second board"
```

---

## Task 6: Dedicated CI workflow

No unit-test CI workflow exists (only `update-project-structure.yml`, which runs on release). This adds a standalone E2E workflow. The missing unit-test CI is recorded as future work in the notes (Task 7), not fixed here.

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/e2e.yml`:
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

      - name: Cache Playwright browsers
        uses: actions/cache@v4
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

- [ ] **Step 2: Validate the YAML locally**

Run:
```bash
node -e "import('node:fs').then(fs => { const s = fs.readFileSync('.github/workflows/e2e.yml','utf8'); if (!s.includes('pnpm test:e2e')) throw new Error('missing run step'); console.log('workflow looks well-formed'); })"
```
Expected: prints `workflow looks well-formed`. (A YAML linter is not part of the toolchain; this is a minimal sanity check. The authoritative validation is the workflow running on push in Step 4.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add dedicated Playwright E2E workflow"
```

- [ ] **Step 4: Push and confirm the job runs green**

```bash
git push -u origin claude/jolly-tesla-nxqq6q
```
Then check the Actions run for the branch (via the GitHub MCP tools — `mcp__github__actions_list` / `mcp__github__get_job_logs`). Expected: the `E2E` workflow's `e2e` job completes green. If it fails on the Chromium download or WASM boot timeouts, capture the log and adjust (see spec §8 Risks) before proceeding.

---

## Task 7: Implementation notes + final verification

**Files:**
- Create: `docs/superpowers/notes/2026-06-17-e2e-playwright-smoke-notes.md`

- [ ] **Step 1: Write the notes file**

Create `docs/superpowers/notes/2026-06-17-e2e-playwright-smoke-notes.md` with at minimum:
- Date and link to the spec.
- The canvas-capture path actually used (Path A screenshot+pngjs, or the dimension-check fallback if Task 4 Step 3 was triggered) and why.
- Confirmation of the Vitest/Playwright filename partition (`*.test.ts` vs `*.spec.ts`) and the `viewportCanvas` largest-canvas workaround for the dev-only stats.js FPS canvas.
- **Future work:** no unit-test CI exists (only the release-triggered `update-project-structure.yml`); a `ci.yml` running typecheck/lint/test on push/PR is the higher-leverage CI gap and was out of scope for this task.
- Any other deviation from the spec or plan.

- [ ] **Step 2: Run the full verification suite**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```
Expected: all four PASS. (`typecheck` ignores `e2e/**` since those files are in no `tsc` project; `test` excludes `e2e/**/*.spec.ts`; `test:e2e` runs the 2 browser tests.)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/2026-06-17-e2e-playwright-smoke-notes.md
git commit -m "docs: add E2E Playwright smoke harness implementation notes"
```

- [ ] **Step 4: Push**

```bash
git push -u origin claude/jolly-tesla-nxqq6q
```
Expected: branch updated; the E2E workflow runs again and stays green.

---

## Self-Review

**Spec coverage:**
- Thin smoke harness, real WASM → Tasks 4–5 (real dev server, real OCCT boot wait). ✓
- Vite dev server serving → `playwright.config.ts` `webServer` (Task 1). ✓
- Dedicated CI job → Task 6. ✓
- DOM signals + non-blank canvas assertion → Task 4. ✓
- Chromium only → `projects: [chromium]` (Task 1). ✓
- No production-code changes → all new code is in `e2e/`, config, CI, docs. ✓
- Vitest/Playwright isolation (spec §3) → Task 2 (`test.exclude`) + `testMatch` (Task 1). ✓
- Canvas-capture spike/fallback (spec §5, §8) → Task 4 Step 3. ✓
- No-unit-CI gap recorded, not fixed (spec §7, §10) → Task 6 preamble + Task 7 notes. ✓
- Verification criteria (spec §9) → Task 7 Step 2 runs all four commands; notes file is criterion 6. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step shows complete code; the one conditional step (Task 4 Step 3) is explicitly gated and fully specified. ✓

**Type/name consistency:** `isNonBlank(pngBuffer: Buffer): boolean` defined in Task 3, consumed identically in Task 4. `viewportCanvas(page): Promise<Locator>` defined and used within `smoke.spec.ts`. Script names `test:e2e` (Task 1) used consistently in Tasks 4–7 and CI. `testMatch: '**/*.spec.ts'` (Task 1) consistent with the Vitest exclude `e2e/**/*.spec.ts` (Task 2) and the `.test.ts`/`.spec.ts` convention. ✓
