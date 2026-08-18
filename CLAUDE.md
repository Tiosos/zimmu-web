# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Zimmu is an open-core 3D joinery design app. React 19 + TypeScript + Vite frontend, Three.js viewport, OpenCASCADE.js (WASM) geometry kernel, Comlink-bridged Web Worker.

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. Plans at Maximum Detail (L99)

**When writing a plan, give all suggestions at L99 — maximum depth and completeness.**

- Every step must be specific enough to execute without follow-up questions.
- Include all alternatives considered, not just the chosen path.
- Surface every risk, edge case, and dependency upfront.
- Do not omit steps because they seem obvious.

L99 = the level a senior engineer would write for a team they will not be present to guide.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Commands

```bash
pnpm dev          # dev server at http://localhost:5173
pnpm test         # vitest run (all unit tests, no browser)
pnpm test:watch   # vitest in watch mode
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint .
pnpm build        # tsc + vite build (output: dist/)
pnpm coverage     # vitest coverage report
```

Run a single test file:

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. A pre-commit hook enforces typecheck automatically.

## Automated Hooks

The project has Claude Code hooks configured in `.claude/settings.json`:

- **Session start (remote only)** → `pnpm install` runs automatically so the dev server, tests, and linters are ready.
- **Write/Edit any `.ts/.tsx/.js/.jsx/.css`** → Prettier auto-formats the file.
- **Write/Edit any `*.test.ts/*.test.tsx`** → The affected test file runs automatically.
- **`git commit`** → Typecheck runs before the commit proceeds.
- **Session stop with uncommitted `.ts`/`.tsx` changes** → A reminder is printed to run the full check suite.

## Architecture

```
src/
├── geom/
│   ├── occt.ts          OCCT bootstrap (initOCCT, lazy singleton); makeBox, makeCut,
│   │                    makeShape (box + cut chain), writeStep (unnamed STEP compound), ExportSpec
│   ├── occt.worker.ts   Comlink Web Worker — exposes buildPart() + exportStep()
│   ├── mesh.ts          TopoDS_Shape → MeshData (Float32Arrays) + BufferGeometry
│   ├── transform.ts     composeWorldMatrix(part) — THREE-free world matrix, parity-tested
│   ├── stl.ts           buildBinaryStl(parts, geometries) — world-space binary STL
│   ├── drawing.ts       buildDrawingSheet(part) → DrawingView[] (Face/Edge/End orthographic
│   │                    projections with cut rects, dimension lines, and cut labels)
│   └── occt.test.ts     Smoke tests (live OCCT skipped in Node)
├── scene/
│   ├── types.ts         Canonical types: ZimmuFile, Scene, Part/BoardPart, CutDef,
│   │                    MaterialDef, HardwareItem, FaceHit, CameraState
│   ├── useScene.ts      Scene state + geometry lifecycle + undo/redo + exportStep +
│   │                    cut linking + materials/hardware CRUD
│   ├── useFile.ts       File System Access API save/open/new + IDB auto-reopen
│   ├── idb.ts           IndexedDB wrapper (v2) — two stores: handles (FileSystemFileHandle)
│   │                    and library (persistent material cost rates)
│   ├── utils.ts         shapeKey() — geometry cache key from Part dimensions + cuts
│   ├── snapMath.ts      Pure face/cut geometry math (faceAxes, computeSnapDelta) — no React
│   ├── useSnap.ts       Face-to-face snap-align interaction state machine
│   ├── useAddCut.ts     Click-a-face-to-add-joinery-cut interaction state machine
│   ├── useInteractionMode.ts  Coordinator composing the six gesture hooks into one activeMode + normalized viewport bundle
│   ├── useMaterialLibrary.ts  Loads/persists material cost rates via idb.ts library store
│   └── palette.ts       PART_COLORS preset swatches
├── render/
│   └── viewport.tsx     React-wrapped Three.js canvas + OrbitControls + raycaster (emits FaceHit)
├── ui/
│   ├── FileMenu.tsx     Top menu bar (File menu, project name, undo/redo, BOM modal, export)
│   ├── sidebar.tsx      Parts list + EditPanel (label, material, ColorControl, dims,
│   │                    position, rotation, cuts panel with cut-linking UI)
│   ├── CuttingList.tsx  Grouped cutting-list table with material cost popover + CSV export
│   ├── BomModal.tsx     Three-tab modal: Boards (cutting list), Hardware (BOM), Library
│   │                    (persistent material rates)
│   ├── HardwareTab.tsx  Hardware BOM table + inline add/edit/delete
│   ├── HardwareEditPanel.tsx  Reusable hardware item form (name, qty, unit, supplier,
│   │                    part #, unit cost, notes)
│   ├── DrawingViewer.tsx  Modal for 2D shop drawings (Face/Edge/End views) with SVG/DXF export
│   ├── buildCsv.ts      groupParts() + CSV serialization for cutting list + hardware
│   ├── buildSvg.ts      DrawingSheet → SVG (orthographic views + dimensions + cut labels)
│   ├── buildDxf.ts      DrawingSheet → DXF (CAD-friendly format)
│   ├── download.ts      downloadBlob() — Blob + anchor click (browser-agnostic delivery)
│   └── useDebouncedCallback.ts  Debounce hook used in dimension inputs
├── components/ui/       Radix-based shadcn-style primitives (button, select, tooltip,
│                        collapsible, scroll-area, input, label, separator, …)
├── lib/utils.ts         cn() — clsx + tailwind-merge class helper
├── App.tsx              Composes useScene + useFile + useSnap + useAddCut +
│                        useMaterialLibrary + Viewport + Sidebar + FileMenu +
│                        BomModal + DrawingViewer
├── main.tsx
└── vite-env.d.ts        Ambient declarations for opencascade.js
```

### Data Flow

`useScene` is the single source of truth for scene state (`Scene` = `parts` + `materials` + `hardware`). It manages:

1. **Geometry lifecycle** — watches `scene.parts` for changes; calls `occt.worker.buildPart()` for any part whose `shapeKey()` changed. Geometry results are kept in a ref (`geometriesRef`) and mirrored to state. Only `shapeKey()` changes (dimensions + cuts) trigger a rebuild; position/rotation changes are applied directly in the Viewport.
2. **Undo/redo** — a 50-entry history stored in refs (`pastRef`/`futureRef`). History entries carry explicit `undo`/`redo` functions (closures over the before/after state). Consecutive `onUpdate` calls to the same part coalesce into one entry via `coalesceKey`.
3. **Cut linking** — `CutDef.pairedCutId` stores a `"{partId}:{cutId}"` reference to the matching cut on the mating part; the sidebar UI lets users pair/unpair cuts for joinery profiling.
4. **Materials + hardware** — `scene.materials` (keyed by name, carries `costPerM2`) and `scene.hardware` (array of `HardwareItem`) are managed directly in `useScene`; they serialize to the `.zimmu` file.

`useFile` manages file persistence independently:
- **Save/Open/New** — uses the File System Access API (`showSaveFilePicker`, `showOpenFilePicker`). Only works in Chrome/Edge; `supported` flag is checked in `App.tsx`.
- **Auto-reopen** — on startup, reads the last `FileSystemFileHandle` from IndexedDB (`src/scene/idb.ts`) and reopens if permission is already granted.
- **Dirty tracking** — `isDirty` is computed by comparing `JSON.stringify(scene)` against the last-saved snapshot.

`useMaterialLibrary` is independent of the file — it persists to the `library` IndexedDB store so cost rates survive across files and sessions. `App.tsx` merges library rates with per-project `scene.materials` when passing `effectiveMaterials` to the BOM modal.

`Viewport` receives `parts`, `geometries`, and `selectedId` as props. It manages Three.js objects directly in refs (no React reconciliation over meshes). Each part gets a `THREE.Mesh` + `THREE.LineSegments` for edge lines. Selection is highlighted by emissive color on the mesh and edge line color. The raycaster emits `FaceHit` (part id + world/local face normal + hit point) for the snap and cut interactions.

**Face interactions** (`useSnap`, `useAddCut`) are small state machines composed in `App.tsx`, fed `FaceHit`s from the Viewport raycaster. Both apply results through `useScene.onUpdate` (so they participate in undo/redo). All their geometry math lives in `snapMath.ts` as pure, THREE-typed-but-browser-free functions — test it directly, not through the React hooks.

**3D export** (STL + STEP) is hybrid: `composeWorldMatrix(part)` in `transform.ts` is the single source of truth for a part's world placement (THREE-free, element-wise parity-tested against `THREE.Matrix4`). STL is built synchronously on the main thread (`buildBinaryStl`, world-space triangle soup with recomputed facet normals). STEP goes through the worker (`exportStep` → `writeStep`, an unnamed `STEPControl_Writer` compound of all solids in mm — the XCAF named-solid path is absent at runtime in opencascade.js v1.1.1, see `docs/superpowers/notes/2026-06-05-3d-export-notes.md`). Both export only **visible** parts and deliver via `downloadBlob`. If you add a `rotationOrder` other than `'XYZ'`, `composeWorldMatrix` must be revisited — it hardcodes Euler XYZ.

**2D export** (shop drawings): `buildDrawingSheet(part)` in `src/geom/drawing.ts` produces `DrawingView[]` (Face/Edge/End orthographic projections) from a single part. The `DrawingViewer` modal renders these as an SVG preview; `buildSvg.ts` and `buildDxf.ts` serialize them to downloadable formats.

### Key Invariants

- **OCCT is browser-only.** Never call live OCCT APIs in tests — guard with `typeof window === 'undefined'` or mock the module.
- **Geometry lives in `src/geom/`**, rendering in `src/render/`. The viewport must not import OCCT directly.
- **Workers use Comlink.** `expose()` in the worker, `wrap()` in `useScene` (lazy singleton so `vi.stubGlobal('Worker', ...)` works in tests).
- **Three.js coordinate system:** +Z up (CAD convention). Don't change `camera.up.set(0, 0, 1)`.
- **`shapeKey()` is the geometry cache key.** It encodes only what changes the OCCT shape — dimensions and cut positions/sizes (not position/rotation, which the Viewport applies directly). Adding a new shape type or a shape-affecting field requires updating `shapeKey()` in `src/scene/utils.ts`.
- **`ZimmuFile` serialization** rounds floats to 6 decimal places. The current file format version is `FILE_FORMAT_VERSION = 2` in `useFile.ts`.
- **IndexedDB schema is version 2** with two object stores: `handles` (file handle persistence) and `library` (material cost rates). Bumping `DB_VERSION` in `idb.ts` requires adding the new store in `onupgradeneeded`.
- **Material library vs. project materials** — `scene.materials` is per-file; `library` (IndexedDB) is global. The app merges them at the BOM layer; never conflate the two in `useScene`.

## Code Conventions

- TypeScript strict mode — `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- No `any`. Prefer explicit types over inference when the type is non-trivial.
- No comments that describe *what* the code does. Only comment *why* when the reason is non-obvious.
- Functional React components only. No class components.
- Prefer named exports over default exports for non-entry-point modules.
- Do not add abstractions or error handling for cases that cannot occur.

## Dependencies

- **Package manager:** pnpm (never npm/yarn).
- `opencascade.js` is excluded from Vite's pre-bundler (`optimizeDeps.exclude`). Do not change this.
- WASM assets resolve as URLs via `assetsInclude: ['**/*.wasm']` — opencascade.js's `index.js` imports its `.wasm` and passes the URL to Emscripten's `locateFile`. Do **not** add `vite-plugin-wasm`: it ESM-instantiates `.wasm` (no default URL export), which breaks opencascade's URL import in both dev and build (the WASM kernel fails to boot).
- `stats.js` renders an FPS overlay in dev mode only (`import.meta.env.DEV`).
- **Styling:** Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`). UI primitives in `src/components/ui/` are shadcn-style wrappers over Radix; compose classes with `cn()` from `src/lib/utils.ts`.

## Testing

- Framework: Vitest + happy-dom + @testing-library/react.
- Tests live next to the code they test (`*.test.ts` / `*.test.tsx`).
- `vitest.setup.ts` imports `fake-indexeddb/auto` (polyfills IndexedDB for IDB tests) and aliases `globalThis.jest = vi` so `waitFor()` works with fake timers.
- **Mocking the OCCT worker in tests:** mock `comlink` and stub `Worker` *before* importing `useScene`:

  ```ts
  vi.mock('comlink', () => ({
    wrap: () => ({ buildPart: mockBuildPart }),
    expose: vi.fn(),
    transfer: vi.fn((data) => data),
  }))
  vi.stubGlobal('Worker', vi.fn(function MockWorker() {}))
  import { useScene } from './useScene'
  ```

- OCCT unit tests must skip when the WASM file is unavailable (`it.skip(...)`).
- Aim for tests on the geom seam (inputs → outputs) rather than Three.js internals.

## Documentation

### `docs/` directory layout

- **`docs/keyboard-shortcuts.md`** — user-facing keyboard shortcut reference; update whenever a shortcut is added or removed.
- **`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`** — design specs (what and why) written before implementation starts.
- **`docs/superpowers/plans/YYYY-MM-DD-<topic>.md`** — step-by-step implementation plans derived from the spec. A new plan is one file per topic; some existing files are **consolidated plans** (see below) that gather a related series into one document.
- **`docs/superpowers/notes/YYYY-MM-DD-<topic>-notes.md`** — living implementation notes (decisions, surprises, workarounds); see below.

`project-structure.html` at the repo root is an architecture reference. Its prose and data-flow diagrams are hand-written; the file trees, test count, and version/date are enclosed in `<!-- AUTOGEN:NAME --> … <!-- /AUTOGEN:NAME -->` markers and regenerated from disk by `scripts/update-structure-html.mjs` (run it after adding, removing, or renaming tracked files; a release workflow also runs it). Update the hand-written prose when the source tree or data-flow diagrams change significantly.

### Consolidated plan files

Several plans in `plans/` each merge a related series of formerly-separate plans into one file (e.g. `2026-06-12-dowel.md`, `2026-07-16-joints.md`, `2026-06-01-cutting-list-bom.md`, `2026-06-05-export.md`, `2026-07-26-joint-suggestions.md`). A consolidated file opens with a title, a one-line "consolidated plan" note, and a **Sections:** index listing each sub-plan with its own spec and notes paths; each section below is the original plan verbatim, its headings demoted one level to nest under the document. The per-topic specs and notes were **not** merged — they remain one file each, and a consolidated plan links every one of them from its header. When you touch a merged-away topic, edit its section inside the consolidated plan (do not recreate the old standalone file), and keep the corresponding spec/notes files' `Plan:` pointers aimed at `<consolidated-file>.md` and the named section.

### Implementation Notes

Every spec or implementation plan must be accompanied by a living implementation notes file.

- **Location:** `docs/superpowers/notes/YYYY-MM-DD-<topic>-notes.md`
- **Purpose:** Record decisions that don't belong in the spec — why an approach was rejected, unexpected constraints discovered during implementation, workarounds, deferred ideas, and anything that would surprise a future reader of the code.
- **When to update:** Any time a decision deviates from the spec, or something non-obvious is discovered during implementation.
- **Format:** Freeform. Date-stamped bullet entries are fine. The audience is a future developer (or AI) who needs to understand *why*, not just *what*.

## Git

- Develop on a feature branch (the session's assigned `claude/*` branch); never commit directly on `main`.
- Commit messages: short imperative summary, no ticket references needed yet.

## License

UNLICENSED for v0.1 prototype. MPL 2.0 is planned at v0.5.
