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
│   ├── hiddenLine.ts    Span + subtractIntervals + EPS — the occlusion rule, stated once.
│   │                    Visible spans, then its own complement for the dashed ones
│   ├── assembly.ts      buildAssemblyViews(parts, byId, cabinet, materials) → three
│   │                    orthographic views of a whole cabinet in unscaled mm: silhouettes,
│   │                    hidden edges, the near-half cull, dimension chains, bores. Also
│   │                    the em table (RING_EM/TICK_EM/TEXT_GAP_EM/CHAR_EM) all three
│   │                    renderers size their annotation ring from
│   ├── __fixtures__/cabinetSheet.ts  cabinet + partsOfCarcase(params) — the parts a
│   │                    carcase implies, built the way regenerateComponents builds them
│   └── occt.test.ts     Smoke tests (live OCCT skipped in Node)
├── scene/
│   ├── types.ts         Canonical types: ZimmuFile, Scene, Part/BoardPart, CutDef (incl. hole-array),
│   │                    MaterialDef, HardwareItem, Joint, Component, CarcaseParams, FaceHit, CameraState
│   ├── useScene.ts      Scene state + geometry lifecycle + undo/redo + exportStep +
│   │                    cut linking + materials/hardware CRUD
│   ├── useFile.ts       File System Access API save/open/new + IDB auto-reopen
│   ├── idb.ts           IndexedDB wrapper (v4) — four stores: handles (FileSystemFileHandle),
│   │                    library (material cost rates and sheet stock), settings (tool
│   │                    clearance) and hardware (catalogue prices)
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
│   │                    its rect and bounds; sectionOpenings (every leaf, shelved or not),
│   │                    setInterior and setFrontOn for the panel; defaultInterior, seedInteriors,
│   │                    firstInterior for the migration, the presets and the legacy shim
│   ├── sectionNodes.ts  sectionNodes(openings, parts) — which opening owns which part, read
│   │                    off the role keys that already say so. The only place a role key is
│   │                    taken apart to recover the section id inside it
│   ├── carcaseOpenings.ts  carcaseOpenings(component, parts, materials) — the whole chain from a
│   │                    cabinet to which opening owns which part, or null if it cannot be
│   │                    resolved. Stated once because the scene tree and the 3D highlight both
│   │                    ask it
│   ├── hardwareCatalogue.ts  Stated key → {name, unit} for every hardware item, plus runnerKeyFor
│   │                    and hingeKeyFor. Data only — the frontMachining.ts of the BOM
│   ├── carcaseHardware.ts  carcaseHardware(scene) → HardwareLine[] — what the cabinets need
│   │                    bought, counted off the bores they already emitted
│   ├── useHardwareLibrary.ts  Loads/persists hardware prices via the idb hardware store
│   ├── frontCells.ts   frontCells(root, tree, geometry) — the section tree as rectangles on the
│   │                    cabinet's front face, reveals already taken. The one statement of the
│   │                    reveal rule, for both mounts
│   ├── frontMachining.ts  Every hinge and slide figure as a named constant, plus cupRow /
│   │                    plateScrewRows / slideScrewRow. Stated 32 mm-system values, not derived
│   ├── editSection.ts   Every change to the section tree's *shape*: splitSection, unsplitSection,
│   │                    setSectionSize. Pure and total — an id naming nothing returns the tree
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
│   ├── drawerBox.ts     RunnerFamily, DrawerParams and drawerBoxMetrics — the one statement of a
│   │                    drawer box's geometry, read by both generators so neither reads the other's
│   │                    output. Every stated figure lives here
│   ├── regenerateDrawers.ts  Pure Scene → Scene; the only pass that adds or removes components.
│   │                    Reconciles one drawer per drawer-front opening, then emits its five boards
│   ├── nearestCarcase.ts  nearestCarcase(node, byId) — which cabinet a part belongs to, asked by
│   │                    the cutting list and the hardware BOM and stated once
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
│   ├── CabinetEditor.tsx  The cabinet edit level: Section/Front/Top/End/3D subtabs over the main
│   │                    pane. Front/Top/End render CabinetProjection; 3D renders nothing —
│   │                    App shows the viewport behind it. Front/Top/End also carry the
│   │                    cabinet's own SVG and DXF export buttons
│   ├── SectionElevation.tsx  The cabinet's front elevation as interactive SVG: a clickable cell
│   │                    per leaf, a bar per division. The only opening picker
│   ├── SectionToolbar.tsx  What can be done to the selected cell — split across/down, merge,
│   │                    size — every button routed through editSection.ts
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
│   ├── CabinetProjection.tsx  One orthographic view of a cabinet, fitted to the pane. Reads
│   │                    the same AssemblyView the assembly sheet does; clickable per part
│   ├── sheetFilename.ts  Names a drawing file — shared by the drawings deck and the
│   │                    cabinet editor's own export buttons, so both agree
│   ├── download.ts      downloadBlob() — Blob + anchor click (browser-agnostic delivery)
│   └── useDebouncedCallback.ts  Debounce hook used in dimension inputs
├── components/ui/       Radix-based shadcn-style primitives (button, select, tooltip,
│                        collapsible, scroll-area, input, label, separator, …)
├── lib/utils.ts         cn() — clsx + tailwind-merge class helper
├── App.tsx              Composes useScene + useFile + useSnap + useAddCut +
│                        useMaterialLibrary + Viewport + Sidebar + FileMenu +
│                        BomModal + DrawingViewer + CabinetEditor. Owns the
│                        cabinet selection, its subtab, and the section pick
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

**2D export** (shop drawings) has two shapes. Per **part**: `buildDrawingSheet(part)` in `src/geom/drawing.ts` produces `DrawingView[]` (Face/Edge/End orthographic projections) from a single board, in board axes. Per **cabinet**: `buildAssemblyViews` in `src/geom/assembly.ts` produces three `AssemblyView`s of a whole carcase in cabinet axes, which `buildDrawingSheets` lays out as an `assembly` sheet — three views in a row, Front and End sharing a top edge so heights read straight across. The row is chosen for that alignment, **not** for the scale: once the dimension ring replaces `DIM_MARGIN + GAP`, a stacked layout reaches the same scale as a row on every preset (1:10, 1:10, 1:20). The `DrawingViewer` modal renders both as an SVG preview; `buildSvg.ts`, `buildDxf.ts` and `buildPdf.ts` serialize them, and each has to handle both kinds — a sheet that drew less in DXF than in SVG would not be the same sheet in another format.

### Key Invariants

- **OCCT is browser-only.** Never call live OCCT APIs in tests — guard with `typeof window === 'undefined'` or mock the module.
- **Geometry lives in `src/geom/`**, rendering in `src/render/`. The viewport must not import OCCT directly.
- **Workers use Comlink.** `expose()` in the worker, `wrap()` in `useScene` (lazy singleton so `vi.stubGlobal('Worker', ...)` works in tests).
- **Three.js coordinate system:** +Z up (CAD convention). Don't change `camera.up.set(0, 0, 1)`.
- **`shapeKey()` is the geometry cache key.** It encodes only what changes the OCCT shape — dimensions and cut positions/sizes (not position/rotation, which the Viewport applies directly). Adding a new shape type or a shape-affecting field requires updating `shapeKey()` in `src/scene/utils.ts`.
- **`ZimmuFile` serialization** rounds floats to 6 decimal places. The current file format version is `FILE_FORMAT_VERSION = 18` in `useFile.ts` (v11 added the component tree; v12 added the carcase `backSetback` parameter; v13 replaced `dividers` and `fixedShelves` with the `section` tree; v14 moved panel thickness onto the material; v15 added the `screw` joint kind; v16 moved `adjustableShelves` off the cabinet onto each section's `interior`, dropping `startHeight`; v17 added `frontMaterial`/`frontMount`/`frontReveal`, `Section.front` and `interior.fixedShelves`; v18 added the drawer component).
- **A joint-owned cut may be a box **or** a hole array.** Screw fixing is the first joint whose geometry is bores, so `sourceJointId` lives on `HoleArrayCut` too and `cutOwnership.ts` states the ownership question once — seven call sites ask it. A copy that forgot a kind is how a stale bore survives its joint.
- **A cabinet is screwed together by default**, and a screwed butt joint extends no panel. `extensionFor` returns 0 for `screw`; getting that wrong lengthens every housed panel silently. A per-joint override is read *before* the layout resolves boxes, exactly as a thickness override is — `resolveJointKind.ts` mirrors `resolveThickness.ts`. Sizing that followed the cabinet default while the joint followed the override left a 6 mm hole in the cabinet.
- **Thickness comes from the material, and overrides are read before layout.** `MaterialDef.thickness` is the authority; a part may override it (`BoardPart.overrides`), and `roleThicknessFor` in `resolveThickness.ts` states the whole rule once: explicit override, else the part's own material, else the cabinet's slot for that role (`back` → `backMaterial`, everything else → `carcaseMaterial`). The layout **reads overrides before resolving boxes**, never applies them after — a 25 mm side is what makes the bottom come out at `W − 43` beside an 18 mm one. That keeps the generator a function in one direction: overrides in, boxes out. An override must never depend on a generated dimension, or the pass becomes a fixed-point iteration.
- **A fixture whose panels are all one thickness cannot test this.** Every case in the 96-case sweep is symmetric, so `openingRect` reading one side's thickness for both edges passes all of them. `panelThickness.test.ts` holds the asymmetric cases that catch it; that mutation was run and fails there and nowhere else.
- **The section tree is the only description of a cabinet's interior division.** `dividers` and `fixedShelves` are gone: splitting a section is what *creates* the partition or shelf between its children. A pre-v13 file is converted by `legacyToSection` at the `parseFile` boundary and nowhere else, so the generator never sees a legacy field. That conversion needs the carcase's **width and thickness** — a v12 divider is centred on a fraction of the gross width, while a section percentage is a share of the clear span left after divisions take their thickness, and the ratio between them depends on the panel thickness.
- **A pin row belongs to the section that needs it, not to the panel it is bored into.** `carcaseHoleArrays` asks each section what it wants and contributes those rows to the panels bounding it (`boundsOf`), so a divider between a shelved bay and a drawer bank is bored on **one face only**. Asking a panel instead — which is what a cabinet-wide `adjustableShelves` forced — bored a full-height row on both faces of every partition. A row starts `FIRST_PIN_INSET` above its **own section's floor**; there is no absolute `startHeight` any more.
- **An adjustable shelf sits on a pin the cabinet actually bored.** `pinRow(rect, spec)` in `carcaseRoles.ts` states the available pin positions once — what the section asked for, capped by what fits between its own floor and ceiling — and both the row of bores and `shelfPins` read it. Two copies of that cap would eventually seat a shelf on a pin that does not exist. Shelves spread over the **pin positions**, not over the section's height: a ten-position row covers 288 mm of a 584 mm opening.
- **A loose shelf is joined to nothing and touches nothing.** `SHELF_CLEARANCE` holds an `adj-shelf-{sectionId}-{i}` board clear of both uprights *and* of the back. A shelf flush against the back panel touches it, and a contact the generator does not name is an unjoined pair on the joinery checklist forever — twelve tests caught exactly that. `SHELF_FRONT_SETBACK` is a separate figure for a separate reason: it clears the front the cabinet will wear, which does not exist yet to be measured against.
- **Shelving is edited per opening, and one selection says which.** `sectionOpenings` lists every leaf — shelved or not, because a bare opening is the one a user wants to give shelves — and `setInterior` writes one section's spec, leaving the rest of the tree alone. `CarcasePanel` holds no pick of its own: it reads `selectedSectionId` and, finding nothing, says to pick an opening rather than falling back to the first. The dropdown it replaced was a *second* selection that could disagree with the elevation's, and the fallback silently shelved the wrong bay. The elevation and the scene tree both pick an opening and both write the same `Selection`, so there are two surfaces onto one pick rather than two picks. The pick is carried by section id, never by index: the v12 divider shim rebuilds the tree with fresh ids on every keystroke, so an index would point at a different opening. `defaultInterior` is the one statement of what a bare opening's first edit creates, and the presets read it too.
- **An opening owns a part when the part's role says so, and a divider owns nothing.** `front-`, `adj-shelf-` and `fixed-shelf-` name a leaf section; `division-{parentId}-{index}` names the section that was *split*, which is always an internal node and so never an opening — so a divider belongs to the carcase, between openings rather than in one. `sectionNodes.ts` is the only place a role key is taken apart to recover the section id inside it: three modules read a role's *family* (`grain.ts`, `resolveThickness.ts`, `carcaseRoles.ts`) and none of them parses one. A second parser is how the tree and the generator come to disagree about which door closes which opening.
- **Openings are numbered in geometric order, and one array carries it.** `sectionOpenings` sorts by `rect.x0` then `rect.z0` — bottom-left first, up a column before across to the next — so the numbering cannot be recovered from the section tree's topology, and a cabinet built two ways numbers its openings the same. `SectionElevation` indexes that array and `SceneTree` indexes `carcaseOpenings`, which is `sectionNodes` over the same array in order, so neither walks a tree of its own. Two bays cannot pin this — there tree order and geometric order agree — which is why the test that does uses a full-width top over two bottom bays and reads each number off the cell it lands inside.
- **Every change to the section tree's *shape* goes through `editSection.ts`.** `splitSection`, `unsplitSection` and `setSectionSize` share one `edit` walk that rebuilds only the spine above the named node, leaving every other branch referentially identical — which is what lets the "leaves the tree alone" tests use `toEqual` honestly. All three are total: an id naming nothing returns the tree unchanged, because a selection outlives the tree it names every time the shim rebuilds one. A split's children **inherit the parent's front and interior** and the parent's own copies are cleared; `unsplitSection` adopts the first child's, so split-then-unsplit returns a section carrying what it carried before. An SVG click handler is the worst place in the codebase for a fourth copy of those rules.
- **`axis` names the division's orientation, not the stacking direction.** `axis: 'vertical'` puts children *side by side* separated by a vertical partition; `axis: 'horizontal'` *stacks* them under a horizontal shelf. So the button labelled "Split across" — which makes a shelf — passes `'horizontal'`. A child sized by its parent's axis is labelled `Width` only when that parent splits vertically; `Height` otherwise, which is wrong half the time if the label is hardcoded.
- **Carcase z runs up and SVG y runs down, and the flip happens in one function.** `toSvg` in `SectionElevation.tsx` is the only place `H - z1` is written. Two copies of it would eventually disagree, and an upside-down cabinet looks entirely plausible until one is asymmetric — which is why the test that pins it uses a lopsided fixture and reads the rendered `y` attributes rather than the component's internals.
- **The viewport is hidden, never unmounted.** `viewport.tsx` builds its renderer, camera and every mesh in a mount-once effect, so swapping it out on a tab change would tear all of that down and rebuild it. `CabinetEditor` therefore renders *nothing* for its 3D tab and `App` toggles `display` on the wrapper instead. A unit test cannot see the difference; the e2e marks the live canvas and requires the same element back after a round trip.
- **Every visible gap equals `frontReveal`, and the two mounts measure it between different things.** `frontCells.ts` states the rule once: an overlay cell reaches to the material midline on every side and gives back half a reveal; an inset cell is the section's own rectangle and gives back a full reveal where it meets carcase material, half where it meets another front. So two *overlay* fronts sit one reveal apart because they cover the division between them; two *inset* fronts sit a division plus two reveals apart, because that division stays visible and each clears it by one. Asserting a front-to-front reveal for both would pin a cabinet that does not exist.
- **An overlay front is a contact; an inset front touches nothing.** An overlay front lands on the carcase face and is hung off it — by hinges, by whatever — which is a contact, never joinery. The rule reads the *emitted boxes* (`y1 === 0`), not `frontMount`, so the box and the contact cannot drift apart. A front appears in no joint descriptor, so `extendToward` never reaches it and it comes out face-to-face sized; that claim is counted rather than asserted, in the preset case table that moves by four contacts and zero joints.
- **A shelf sits behind an inset front, and only the section wearing one pays.** `SHELF_FRONT_SETBACK` (5 mm) is the floor, never the answer: an inset front occupies `y ∈ [0, FT]`, so the setback becomes `max(SHELF_FRONT_SETBACK, insetFrontThickness + SHELF_CLEARANCE)`. Asking the cabinet instead of the section would set every shelf in the carcase back because one opening has a door.
- **Front machining is not machining *on* fronts.** `frontMachining.ts` owns three families and only one lands on the door: a cup is bored into the door, the plate screws that carry it into the upright beside it, and a drawer's slide screws into two uprights with nothing on the front at all. So `carcaseMachining` is asked **per role**, like `carcaseHoleArrays`, and answers for a side panel as readily as for a door. Plate screws go in the upright the door is *hinged on* and no other; a two-leaf pair claims both. Which upright bounds which opening is asked through the same `boundsOf`/`boundRole` the pin rows use, so the two families cannot disagree.
- **A door's board +Z is its back in both mounts, at different carcase coordinates.** `orientedPanel` maps board z → carcase y with the origin on the box min corner, so the outward face is board z = 0 whether the box is `y ∈ [−FT, 0]` (overlay, back at y = 0) or `y ∈ [0, FT]` (inset, back at y = FT). A test asserting the letters `'+Z'` proves only that the table agrees with itself — follow the face into carcase space and require it to point into the cabinet, and require the mutation to fail for **both** mounts.
- **A height carried between two panels goes through carcase space.** Board x on a door runs the height from the door's own bottom edge; board y on the upright runs it from the upright's. On a toe-kick cabinet those edges are 100 mm apart, so a plate screw height copied straight off a cup hangs the door on a slope. Read each panel's own `position.z`.
- **The hardware figures are stated, not derived.** ⌀35 cups, 22.5 mm edge distance, the hinge-count table: read off standard hardware, falsifiable by no test in this repo. A wrong figure produces a perfectly self-consistent cabinet that does not close, so treat that table as needing a woodworker's eye rather than a green suite. No vendor parameter is added — a hardware item will carry its own geometry and a parameter now would be orphaned then.
- **A fixed shelf on an `interior` is not a division.** A split with `division: 'panel'` makes a shelf *and* cuts the section in two, so each half is its own opening wanting its own front. `interior.fixedShelves` divides nothing: the section stays one leaf and wears one front, which is the only way to express a shelf *behind a door* — and why Tall 600's four shelves are interior ones under a single pair of doors. Both are housed through the same `housingsFor` table; a loose `adj-shelf-` is joined to nothing at all.
- **`useFile.ts` types `base.params` loosely, so `tsc` cannot see a file-format regression there.** When a required `CarcaseParams` field is added, the parser will still compile while producing objects that lack it, and the failure only appears when the generator dereferences it at runtime. Any change to `CarcaseParams` needs a `parseFile` test, not just a typecheck.
- **IndexedDB schema is version 4** with four object stores: `handles` (file handle persistence), `library` (material cost rates and sheet stock), `settings` (the global tool clearance) and `hardware` (hardware catalogue prices, keyed by catalogue key). Bumping `DB_VERSION` in `idb.ts` requires adding the new store in `onupgradeneeded`. (This DB version is unrelated to `FILE_FORMAT_VERSION`.)
- **Material library vs. project materials** — `scene.materials` is per-file; `library` (IndexedDB) is global. The app merges them at the BOM layer; never conflate the two in `useScene`.
- **The regeneration pipeline order is fixed, and it is three stages.** `regenerateDrawers(scene)`, then `regenerateComponents(scene)`, then `reconcileJoints(scene)`, always, via `applyPipeline` in `useScene.ts`. Drawers lead because the carcase's slide machining reads drawer *parameters* while the drawer reads nothing the carcase *emits* — its inputs are the section tree, the drawer params and the materials, all of which exist before the carcase pass. Reversed, a new drawer front needs two passes to settle: the first bores no slide screws and the second does. All three stages are pure and idempotent, and `regenerateDrawers` is the only one that adds or removes **components**.
- **A detached part is the user's.** `driven: false` means no regeneration and no deletion — a parameter change, a role disappearing, and deleting the whole component all preserve it.
- **Grain is stated in carcase axes and derived into a board field.** `grainAxisOf(role)` names the direction; `grainFieldFor(thicknessAxis, axis)` turns it into `'length'` or `'width'` through the same map `orientedPanel` uses. The role→field table in the design doc is a *consequence* — never hand-maintain a second copy of it, and **never assume grain runs along a panel's longer dimension**: a 1200 × 400 wall unit's back and a three-bay 900's shelf both run it along the shorter one.
- **The nest runs off-thread, and only while the Sheets tab is open.** A six-cabinet job is ~4.8 s (0.4 s masking, 4.4 s placement), so running one on every scene edit would compute a figure nobody is looking at. `BomModal` drives `useNest`'s `enabled` flag from its tab state *and clears it on unmount*. Masks are built **in** the worker, never posted to it: a dilated mask for a 2100 mm panel is over a megabyte.
- **A nest mask is in board axes; a placement reports material.** `occupancyMask` is dilated by `mask.pad` on every side, so `nestSheets` positions the dilated mask and reports the undilated rectangle. Never recompute the padding formula outside `mask.ts`.
- **`resolveWorldMatrix` is the single source of world placement.** For `parentId: null` it is byte-identical to `composeWorldMatrix`; never call `composeWorldMatrix` directly outside `transform.ts`. The one remaining mention of `composeWorldMatrix` elsewhere (in `occt.ts`) is a comment describing the matrix layout, not a call, so the invariant already holds.
- **A cabinet projection is one pure function with two consumers.** `buildAssemblyViews` returns **unscaled millimetres**; the pane fits them to itself and the sheet picks a standard scale. A projector that scaled would need a page size the pane does not have at render time. `drawing.ts` stays a sheet builder — merging the two would put an `if (kind === 'assembly')` through the middle of a module that does one thing.
- **Hidden-line removal here is interval subtraction, not polygon clipping.** Every generated panel is an axis-aligned box in the cabinet's frame, so an occluder covers a contiguous run of an edge. `subtractIntervals` answers both halves — `visible`, then its own complement for `hidden` — and a part is an occluder only if its eight **corners** say it is a box. Never read that off `rotation`: a board turned 180° is still axis-aligned, and a `rotation === 0` test silently exempts it. A mitred board is deliberately *not* a box: it draws as its convex hull and occludes nothing.
- **Top and End are sections; Front is not.** Pure hidden-line removal of a closed box is one solid rectangle. Measured on a Base 600 with the cull disabled: the End view shows **2 of 8** parts carrying any visible edge and Top shows **4 of 8**; with the cull, End shows 7 of 7 and Top 6 of 7. So Top and End omit everything entirely nearer than the parameter midpoint, and a part crossing the plane is drawn whole. Front is never culled — an elevation that dropped its door would be useless. The rule is stated as *a section shows the majority of what it cuts through*, never as a part count: `culled` filters parts **out**, so disabling it raises the count and any `length > 1` assertion survives the mutation.
- **A cut is through _per view_, never once per cut.** The toe-kick notch clears the side's whole thickness in End — the silhouette becomes an L — but has material behind it in Front, where the full rectangle is correct. Cuts are also built oversize on purpose (`position.z = −T/2`, `size.z = 2T`) so OCCT resolves them without a coplanar face, so a cut rectangle is clipped to its part on the way in.
- **A dimension is placed by side and ring, and sized in ems.** The projector emits neither a page offset nor a scale, because `renderDimLine` and its DXF and PDF counterparts read `offset` in sheet millimetres while start/end are already scaled — so the conversion belongs to whichever layer knows the scale, and `assemblyDimLine` in `drawing.ts` is the one place it happens. The ring itself is measured in ems from `assembly.ts`'s table, never in absolute millimetres: a ring sized in mm against a font that scaled with the cabinet clipped a Tall 600's "2100" by 71 mm, and the pane, the layout and all three renderers must agree on one statement of it. A dimension only appears in a view whose axis measures it — a toe kick is a height, so Top, whose v axis is the depth, does not carry it.
- **An open cabinet stays open while the selection lies inside it.** `App.tsx` derives `selectedCarcase` from the previously open cabinet plus the selection, not from the selection's ancestry. The narrow rule is deliberate: "the cabinet containing the selection" opens a cabinet on *any* part click, and `App` shows the viewport only while that is null or the tab is 3D — so clicking a part in the viewport would swap the viewport out for the Section elevation, and `cabinetParts` would filter 3D down to one cabinet. Both regressions are invisible at the `CabinetEditor` level, so the guard is a test that renders `App`.
- **Hardware quantity comes from the bores, and only the variant comes from the cabinet.** `carcaseHardware` counts cups for hinges, deduped `slide_` rows for runner pairs, seated `adj-shelf-` boards × the pin rows the cabinet actually bored, and `_clearance` arrays for screws — never a figure re-derived from `CarcaseParams`. That is what makes a door too thin to bore list no hinge, and a joint converted to a dado drop its screws. Only `frontMount` (which hinge) and the clear internal depth (which runner) are read from the cabinet, because no bore can distinguish an overlay hinge from an inset one — both name a *variant*, never a quantity. Counting a pin row off `adjustable.rows` looks equivalent and is not: `carcaseHoleArrays` refuses a row whose setback is inside the pin's radius while `shelfPins` seats its shelves anyway, so the parameter quotes pins for a cabinet with no pin holes in it. The pilot array is the same screws seen from the other end: counting both doubles the quote.
- **A hardware row is derived, never stored.** `scene.hardware` stays the user's hand-typed items; the generated rows are computed in `App` and priced in `BomModal`, the way the cutting list and the dowel list already are. So a hardware item needs no `driven` flag, no reconciliation and no file-format version — and a per-cabinet hardware choice, when it lands, belongs in an override bag on `CarcaseParams` rather than in a detached row.
- **A drawer's geometry is stated once and read by two generators.** `drawerBoxMetrics` in `drawerBox.ts` is a pure function of the front cell rect, the drawer's params and the materials. `regenerateDrawers` reads it to build boards; `carcaseMachining` reads it to place slide screws. Neither reads the other's output, which is the only reason the carcase and the drawer do not form a cycle through the runner height. A second copy of that height is how the box and the screws that carry it come to disagree.
- **The two runner families are not one rule with two constants.** Side-mount fixes the gap either side of the box (12.7 mm); undermount fixes the box's *interior* (opening − 42 mm at ≤ 16 mm sides, − 49 mm above), so its outside width moves with the side material. At 16 mm sides the undermount outside clearance is near 5 mm a side. Collapsing them into a per-side constant produces boxes that are wrong only for thick-sided drawers, which is the hardest kind of wrong to notice. Undermount also has no groove and needs a notched back; side-mount has a grooved bottom and a plain one.
- **A drawer box declines rather than guessing.** When `runnerKeyFor` finds no runner for the clear depth, the hardware list omits the runner *and* the drawer emits no boards. Same rule as a door too thin to bore listing no hinge.
- **`driven` on a component means what it means on a part.** Only `DrawerComponent` carries it. A detached drawer is the user's: no regeneration, no deletion. Carcases and groups deliberately do not have it, because a detached carcase has no defined meaning.
- **Which cabinet owns a part is `nearestCarcase`, never the immediate parent.** `ancestorsOf(...)[0]` is the direct parent, which is the cabinet only when the part hangs straight off it. A board under a drawer or a group answers the wrong thing. The cutting list and the hardware BOM each shipped their own version of that mistake; both now ask one function.

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

### Mutation testing

A test that cannot fail is not evidence, so every guard added should be mutation-tested: break the
rule deliberately, watch the test fail, restore. Three rules earned the hard way:

- **Back the file up first, and restore from that copy** — `cp src/…/file.ts "$SCRATCHPAD"/file.bak`,
  then `cp` it back. **Never `git checkout`** to undo a mutation: mid-group the file carries
  uncommitted work, and `git checkout` throws all of it away. That has happened, and cost a whole
  group's edits.
- **Grep after applying, and again after restoring.** A `sed` or Python replacement that matched
  nothing looks exactly like a surviving mutation — a green run you will read as proof.
- **Predict which tests should fail before running.** When fewer fail than expected, the gap is
  usually real: a mutation that broke only the placement test and not the contact test is what
  revealed that the contact rule was reading a flag instead of the geometry it was supposed to
  follow.

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
