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
│   ├── transform.ts     composeWorldMatrix(part) + resolveWorldMatrix(part, byId) — THREE-free
│   │                    world matrix (composed through ancestor components), parity-tested
│   ├── stl.ts           buildBinaryStl(parts, geometries) — world-space binary STL
│   ├── drawing.ts       buildDrawingSheet(part) → DrawingView[] (Face/Edge/End orthographic
│   │                    projections with cut rects, dimension lines, and cut labels)
│   └── occt.test.ts     Smoke tests (live OCCT skipped in Node)
├── scene/
│   ├── types.ts         Canonical types: ZimmuFile, Scene, Part/BoardPart, CutDef (incl. hole-array),
│   │                    MaterialDef, HardwareItem, Joint, Component, CarcaseParams, FaceHit, CameraState
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
│   ├── componentTree.ts  Pure tree helpers (index, ancestor walk, descendant collection,
│   │                    cycle guard, orphan promotion) — no React, no THREE
│   ├── carcaseRoles.ts   Pure CarcaseParams → ordered RoleSpec[] (role key, dims, local
│   │                    position/rotation) — the whole geometry of a carcase. Interior
│   │                    division comes from the section tree, not from scalar parameters
│   ├── sectionTree.ts   Section tree types + resolveSections (tree → rectangles + division
│   │                    boxes), boundsOf (what encloses a section), validateSection. Pure
│   ├── sectionInterior.ts  sectionInteriors(root, tree) — every leaf that asks for shelving, with
│   │                    its rect and bounds; sectionOpenings (every leaf, shelved or not) and
│   │                    setInterior for the panel; defaultInterior, seedInteriors, firstInterior
│   │                    for the migration, the presets and the legacy shim
│   ├── migrateSections.ts  legacyToSection(dividers, fixedShelves, width, thickness) — the one
│   │                    place pre-v13 divider/shelf parameters become a tree
│   ├── resolveThickness.ts  roleThicknessFor(slots, materials, overrides) → (role) => thickness.
│   │                    The single statement of where a panel's thickness comes from
│   ├── resolveJointKind.ts  jointKindFor(joints, componentId) → (housingRole, housedRole) => kind.
│   │                    Its mirror for joinery, plus carcaseJointId — the one place a joint's
│   │                    deterministic id is spelled
│   ├── changeJointKind.ts  Converts a joint between dado and screw, checking the pairing is legal
│   ├── cutOwnership.ts  isJointOwned / isOwnedBy — asked in seven places, stated once
│   ├── regenerateComponents.ts  Pure Scene → Scene; carcases emit driven parts + driven joints,
│   │                    reconciled against existing parts by stable role key. Runs before reconcileJoints
│   ├── carcasePresets.ts  CARCASE_PRESETS — Base/Wall/Tall parameter bundles (data only)
│   ├── grain.ts         Grain convention stated in carcase axes + grainFieldFor() — the board
│   │                    field is derived from orientedPanel's axis map, never hand-tabulated
│   └── palette.ts       PART_COLORS preset swatches
├── nest/
│   ├── mask.ts          occupancyMask(part, clearance) — 1 mm occupancy bitmask in BOARD axes,
│   │                    dilated by half the clearance; carries its own `pad`
│   ├── nest.ts          allowedRotations + rotateMask + nestSheets — bottom-left first fit onto
│   │                    stock sheets, reporting placements, utilisation and `unplaced`
│   └── nest.worker.ts   Comlink worker — takes PARTS, masks and nests them in one hop
├── render/
│   └── viewport.tsx     React-wrapped Three.js canvas + OrbitControls + raycaster (emits FaceHit)
├── ui/
│   ├── FileMenu.tsx     Top menu bar (File menu, project name, undo/redo, BOM modal, export)
│   ├── sidebar.tsx      Composition shell: SceneTree + selected-node editor + mode buttons
│   ├── EditPanel.tsx    Selected-part editor (moved out of sidebar.tsx): label, material,
│   │                    ColorControl, dims, position, rotation, cuts (with cut-linking),
│   │                    joints, hole-arrays, linked hardware
│   ├── DimInput.tsx     Dimension number field with debounced commit
│   ├── SceneTree.tsx    Sidebar hierarchy over components + parts: expand/collapse, selection,
│   │                    per-node visibility, driven/detached badges
│   ├── CarcasePanel.tsx  Carcase parameter form (collapsible sections) driving regenerateComponents
│   ├── CuttingList.tsx  Grouped cutting-list table with material cost popover + CSV export
│   ├── BomModal.tsx     Three-tab modal: Boards (cutting list), Hardware (BOM), Library
│   │                    (persistent material rates)
│   ├── HardwareTab.tsx  Hardware BOM table + inline add/edit/delete
│   ├── HardwareEditPanel.tsx  Reusable hardware item form (name, qty, unit, supplier,
│   │                    part #, unit cost, notes)
│   ├── DrawingViewer.tsx  Modal for 2D shop drawings (Face/Edge/End views) with SVG/DXF export
│   ├── buildSheetSvg.ts  Placement[] → SVG of one nested sheet (origin bottom-left, y flipped)
│   ├── SheetsTab.tsx    Per-material yield: sheet count, utilisation, cost, per-sheet SVG
│   ├── buildCsv.ts      groupParts() + cutDimensions() (grain decides the length) + isNestable()
│   │                    + CSV serialization for cutting list + hardware
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

`useScene` is the single source of truth for scene state (`Scene` = `parts` + `materials` + `hardware` + `joints` + `components`). It manages:

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

**3D export** (STL + STEP) is hybrid: `resolveWorldMatrix(part, byId)` in `transform.ts` is the single source of truth for a part's world placement — it composes `composeWorldMatrix` (THREE-free, element-wise parity-tested against `THREE.Matrix4`) through every ancestor component, and equals it exactly for a top-level part. STL is built synchronously on the main thread (`buildBinaryStl`, world-space triangle soup with recomputed facet normals). STEP goes through the worker (`exportStep` → `writeStep`, an unnamed `STEPControl_Writer` compound of all solids in mm — the XCAF named-solid path is absent at runtime in opencascade.js v1.1.1, see `docs/superpowers/notes/2026-06-05-3d-export-notes.md`). Both export only **visible** parts and deliver via `downloadBlob`. If you add a `rotationOrder` other than `'XYZ'`, `composeWorldMatrix` must be revisited — it hardcodes Euler XYZ.

**2D export** (shop drawings): `buildDrawingSheet(part)` in `src/geom/drawing.ts` produces `DrawingView[]` (Face/Edge/End orthographic projections) from a single part. The `DrawingViewer` modal renders these as an SVG preview; `buildSvg.ts` and `buildDxf.ts` serialize them to downloadable formats.

### Key Invariants

- **OCCT is browser-only.** Never call live OCCT APIs in tests — guard with `typeof window === 'undefined'` or mock the module.
- **Geometry lives in `src/geom/`**, rendering in `src/render/`. The viewport must not import OCCT directly.
- **Workers use Comlink.** `expose()` in the worker, `wrap()` in `useScene` (lazy singleton so `vi.stubGlobal('Worker', ...)` works in tests).
- **Three.js coordinate system:** +Z up (CAD convention). Don't change `camera.up.set(0, 0, 1)`.
- **`shapeKey()` is the geometry cache key.** It encodes only what changes the OCCT shape — dimensions and cut positions/sizes (not position/rotation, which the Viewport applies directly). Adding a new shape type or a shape-affecting field requires updating `shapeKey()` in `src/scene/utils.ts`.
- **`ZimmuFile` serialization** rounds floats to 6 decimal places. The current file format version is `FILE_FORMAT_VERSION = 16` in `useFile.ts` (v11 added the component tree; v12 added the carcase `backSetback` parameter; v13 replaced `dividers` and `fixedShelves` with the `section` tree; v14 moved panel thickness onto the material; v15 added the `screw` joint kind; v16 moved `adjustableShelves` off the cabinet onto each section's `interior`, dropping `startHeight`).
- **A joint-owned cut may be a box **or** a hole array.** Screw fixing is the first joint whose geometry is bores, so `sourceJointId` lives on `HoleArrayCut` too and `cutOwnership.ts` states the ownership question once — seven call sites ask it. A copy that forgot a kind is how a stale bore survives its joint.
- **A cabinet is screwed together by default**, and a screwed butt joint extends no panel. `extensionFor` returns 0 for `screw`; getting that wrong lengthens every housed panel silently. A per-joint override is read *before* the layout resolves boxes, exactly as a thickness override is — `resolveJointKind.ts` mirrors `resolveThickness.ts`. Sizing that followed the cabinet default while the joint followed the override left a 6 mm hole in the cabinet.
- **Thickness comes from the material, and overrides are read before layout.** `MaterialDef.thickness` is the authority; a part may override it (`BoardPart.overrides`), and `roleThicknessFor` in `resolveThickness.ts` states the whole rule once: explicit override, else the part's own material, else the cabinet's slot for that role (`back` → `backMaterial`, everything else → `carcaseMaterial`). The layout **reads overrides before resolving boxes**, never applies them after — a 25 mm side is what makes the bottom come out at `W − 43` beside an 18 mm one. That keeps the generator a function in one direction: overrides in, boxes out. An override must never depend on a generated dimension, or the pass becomes a fixed-point iteration.
- **A fixture whose panels are all one thickness cannot test this.** Every case in the 96-case sweep is symmetric, so `openingRect` reading one side's thickness for both edges passes all of them. `panelThickness.test.ts` holds the asymmetric cases that catch it; that mutation was run and fails there and nowhere else.
- **The section tree is the only description of a cabinet's interior division.** `dividers` and `fixedShelves` are gone: splitting a section is what *creates* the partition or shelf between its children. A pre-v13 file is converted by `legacyToSection` at the `parseFile` boundary and nowhere else, so the generator never sees a legacy field. That conversion needs the carcase's **width and thickness** — a v12 divider is centred on a fraction of the gross width, while a section percentage is a share of the clear span left after divisions take their thickness, and the ratio between them depends on the panel thickness.
- **A pin row belongs to the section that needs it, not to the panel it is bored into.** `carcaseHoleArrays` asks each section what it wants and contributes those rows to the panels bounding it (`boundsOf`), so a divider between a shelved bay and a drawer bank is bored on **one face only**. Asking a panel instead — which is what a cabinet-wide `adjustableShelves` forced — bored a full-height row on both faces of every partition. A row starts `FIRST_PIN_INSET` above its **own section's floor**; there is no absolute `startHeight` any more.
- **An adjustable shelf sits on a pin the cabinet actually bored.** `pinRow(rect, spec)` in `carcaseRoles.ts` states the available pin positions once — what the section asked for, capped by what fits between its own floor and ceiling — and both the row of bores and `shelfPins` read it. Two copies of that cap would eventually seat a shelf on a pin that does not exist. Shelves spread over the **pin positions**, not over the section's height: a ten-position row covers 288 mm of a 584 mm opening.
- **A loose shelf is joined to nothing and touches nothing.** `SHELF_CLEARANCE` holds an `adj-shelf-{sectionId}-{i}` board clear of both uprights *and* of the back. A shelf flush against the back panel touches it, and a contact the generator does not name is an unjoined pair on the joinery checklist forever — twelve tests caught exactly that. `SHELF_FRONT_SETBACK` is a separate figure for a separate reason: it clears the front the cabinet will wear, which does not exist yet to be measured against.
- **Shelving is edited per opening, and an opening is chosen by id.** `sectionOpenings` lists every leaf — shelved or not, because a bare opening is the one a user wants to give shelves — and `setInterior` writes one section's spec, leaving the rest of the tree alone. `CarcasePanel` holds the pick by section id, never by index: the v12 divider shim rebuilds the tree with fresh ids on every keystroke, so an index would silently point at a different opening instead of falling back to the first. `defaultInterior` is the one statement of what a bare opening's first edit creates, and the presets read it too.
- **`useFile.ts` types `base.params` loosely, so `tsc` cannot see a file-format regression there.** When a required `CarcaseParams` field is added, the parser will still compile while producing objects that lack it, and the failure only appears when the generator dereferences it at runtime. Any change to `CarcaseParams` needs a `parseFile` test, not just a typecheck.
- **IndexedDB schema is version 3** with three object stores: `handles` (file handle persistence), `library` (material cost rates and sheet stock) and `settings` (the global tool clearance). Bumping `DB_VERSION` in `idb.ts` requires adding the new store in `onupgradeneeded`. (This DB version is unrelated to `FILE_FORMAT_VERSION`.)
- **Material library vs. project materials** — `scene.materials` is per-file; `library` (IndexedDB) is global. The app merges them at the BOM layer; never conflate the two in `useScene`.
- **The regeneration pipeline order is fixed.** `regenerateComponents(scene)` runs before `reconcileJoints(scene)`, always, via `applyPipeline` in `useScene.ts`. Carcases emit parts and joints; `reconcileJoints` derives cuts and seats from those joints. Both stages are pure and idempotent.
- **A detached part is the user's.** `driven: false` means no regeneration and no deletion — a parameter change, a role disappearing, and deleting the whole component all preserve it.
- **Grain is stated in carcase axes and derived into a board field.** `grainAxisOf(role)` names the direction; `grainFieldFor(thicknessAxis, axis)` turns it into `'length'` or `'width'` through the same map `orientedPanel` uses. The role→field table in the design doc is a *consequence* — never hand-maintain a second copy of it, and **never assume grain runs along a panel's longer dimension**: a 1200 × 400 wall unit's back and a three-bay 900's shelf both run it along the shorter one.
- **The nest runs off-thread, and only while the Sheets tab is open.** A six-cabinet job is ~4.8 s (0.4 s masking, 4.4 s placement), so running one on every scene edit would compute a figure nobody is looking at. `BomModal` drives `useNest`'s `enabled` flag from its tab state *and clears it on unmount*. Masks are built **in** the worker, never posted to it: a dilated mask for a 2100 mm panel is over a megabyte.
- **A nest mask is in board axes; a placement reports material.** `occupancyMask` is dilated by `mask.pad` on every side, so `nestSheets` positions the dilated mask and reports the undilated rectangle. Never recompute the padding formula outside `mask.ts`.
- **`resolveWorldMatrix` is the single source of world placement.** For `parentId: null` it is byte-identical to `composeWorldMatrix`; never call `composeWorldMatrix` directly outside `transform.ts`. The one remaining mention of `composeWorldMatrix` elsewhere (in `occt.ts`) is a comment describing the matrix layout, not a call, so the invariant already holds.

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
