# Zimmu — v0.1

> Open-core 3D joinery design app for architects and designers who specify
> built woodwork. Produces buildable, dimensioned models with a parametric
> joint library — without the engineering-CAD overhead.

**Current state:** Phase 0 / 0.5 browser prototype — validating geometry,
UX, and file format before the production Rust/Tauri build begins.
Strategic plan: [`joinery_3d_software_plan.md`](joinery_3d_software_plan.md)
· Full architecture reference: [`project-structure.html`](project-structure.html)

---

## What's built

### Geometry & viewport
- `opencascade.js` (~65 MB WASM) bootstrapped lazily in a Comlink Web Worker
- OCCT `TopoDS_Shape` → Three.js `BufferGeometry` via `BRepMesh_IncrementalMesh`
- Three.js r184 · OrbitControls · +Z-up CAD camera · edge lines · emissive selection highlight
- Face raycaster (filtered for hidden parts) driving snap and cut modes

### Parts & editing
- Board parts: label, length × width × thickness (mm), material, color, position, rotation
- Part visibility toggle (`H`), duplication (`Ctrl+D`), removal (`Delete`/`Backspace`)
- **Snap/align mode** (`F`) — click two faces to align boards
- **Cut mode** (`C`) — boolean-subtract a cut rectangle from any board face; cuts can be linked (paired) across mating parts
- **Dado joint mode** (`J`) — click a housing face then a housed board's end to create a parametric dado; the groove is generated on the housing and the housed board seated into it, staying in sync as dimensions change. Switch a joint's **Profile** to *rabbeted* (tongue-and-dado) in the sidebar to also cut a tongue on the housed end. Set **Stop A**/**Stop B** in the sidebar to make it a stopped/blind dado — the groove shortens and a matching notch is cut into the housed board's corner so the joint doesn't show through.
- **Half-lap joint mode** (`L`) — click two overlapping boards to create a parametric half-lap; each board is notched to half its thickness at the shared plane, staying in sync as dimensions change. Adjust **Split** and **Clear** in the sidebar to move the shared plane and deepen each notch.
- **Mortise & tenon joint mode** (`M`) — click the mortise face then the perpendicular tenon end to create a parametric mortise & tenon; a blind or through pocket is cut into the mortise board and a centered tenon (with up to 4 shoulder cuts) into the tenon board, staying in sync as dimensions change. Adjust **Length**, **Thk**, **Width**, and **Through** in the sidebar to size the tenon and its pocket.
- **Box / finger joint mode** (`B`) — click one board's end then the perpendicular equal-width end of another to create an interlocking right-angle corner joint; each end is cut into `N` meshing fingers, with one board auto-seated into the corner, staying in sync as dimensions change. Adjust **Fingers** and **Clear** in the sidebar to set the finger count and per-side clearance.
- **Tongue & groove joint mode** (`T`) — click one board's long edge then the facing long edge of a coplanar, equal-thickness board to create an edge-to-edge tongue & groove; a full-length groove is cut into the first board and a matching centered tongue on the second, which auto-seats into the groove and stays in sync as dimensions change. Adjust **Thk**, **Depth**, and **Clear** in the sidebar to size the tongue and its fit.
- 50-entry undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`); consecutive dimension edits coalesce into one entry
- Full shortcut reference: [`docs/keyboard-shortcuts.md`](docs/keyboard-shortcuts.md)

### File I/O
- Save / Save As / Open / New via File System Access API (Chrome/Edge)
- Graceful degradation message + disabled menus on Firefox/Safari
- `.zimmu` flat-JSON project format (`FILE_FORMAT_VERSION = 27`), with stable project/area/room/item IDs, room geometry, site/clearance assessments, edge banding and optional pinned cabinet catalogue references
- Auto-reopen last file on startup (IndexedDB handle persistence)
- Dirty tracking (`isDirty`, tab title `•` indicator)

### Bill of Materials
- BOM, catalogue-update previews, sheet nesting and sheet part labels share transient manufacturing records: stable part/cabinet provenance, local and BOM dimensions, grain/edges, geometric cuts and separate manual instructions. Nesting uses board-local cut footprints, excludes invalid cut sizes with reasons, and retains part IDs. Sheet label details carry cabinet/part references and shared sizes. Prices remain separate; existing CSV schemas and saved-file format are preserved.
- Three-tab BOM modal (`Ctrl+Shift+E`): **Boards**, **Hardware**, **Library**
- Boards tab: grouped cutting list with per-material cost popover; CSV copy + download
- Hardware tab: add/edit/delete hardware items (name, qty, unit, supplier, part#, cost, notes); items link to board parts via checkbox
- Sidebar EditPanel shows linked hardware for the selected part
- Library tab: persistent material cost rates (per-m² pricing) stored in IndexedDB; survives across files and sessions

### Exports
- **STL** — binary, world-space, visible parts only
- **STEP** — XCAF named solids via OCCT worker; falls back to unnamed `STEPControl_Writer`
- **2D shop drawings** — Face / Edge / End orthographic projections per part with dimensions and cut labels
  - SVG preview in DrawingViewer modal
  - SVG + DXF download

---

## Architecture

```
App.tsx
  ├── useScene        scene state · geometry lifecycle · undo/redo · CRUD
  ├── useFile         FSAPI save/open · IDB auto-reopen · dirty tracking
  ├── useSnap         face-to-face snap-align state machine
  ├── useAddCut       click-a-face-to-add-cut state machine
  ├── useMaterialLibrary  persistent cost rates (IDB library store)
  ├── Viewport        Three.js canvas (meshes in refs, raycaster → FaceHit)
  ├── Sidebar         parts list + EditPanel (dims, cuts, linked hardware)
  ├── FileMenu        top bar · file ops · undo/redo · exports
  ├── BomModal        three-tab BOM (boards/hardware/library)
  └── DrawingViewer   2D shop drawing modal (SVG preview + DXF/SVG export)
```

`useScene` is the single source of truth. Geometry rebuilds are triggered only
when `shapeKey(part)` changes (dimensions + cuts) — position/rotation changes
go directly to the Viewport without touching OCCT.

See [`project-structure.html`](project-structure.html) for the full source
tree, data model, data flow diagrams, and key invariants.

---

## Stack

| | Technology |
|---|---|
| UI | React 19 + TypeScript (strict) |
| Build | Vite 8 + `@vitejs/plugin-react` |
| Styling | Tailwind CSS v4 · shadcn-style Radix UI primitives |
| 3D | Three.js r184 (WebGL) |
| Geometry | opencascade.js 1.1 (WASM build of OCCT) |
| Worker bridge | Comlink 4 |
| Persistence | File System Access API + IndexedDB v2 |
| Package manager | pnpm |
| Tests | Vitest 4 + happy-dom + @testing-library/react |

---

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

First page load downloads the OCCT WASM (~65 MB). Expected — it's a known
cost called out in the strategic plan's risk table.
File save/open requires Chrome or Edge (File System Access API).

---

## Commands

```bash
pnpm dev          # dev server
pnpm test         # vitest run (all unit tests)
pnpm test:watch   # vitest watch mode
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint .
pnpm build        # production bundle → dist/
pnpm coverage     # vitest coverage report

# Run a single test file
pnpm vitest run src/scene/useScene.test.ts

# Full check suite (run before every commit)
pnpm typecheck && pnpm lint && pnpm test
```

---

## File format

Projects are saved as `.zimmu` files — flat JSON, UTF-8, floats rounded to
6 decimal places. `FILE_FORMAT_VERSION = 27`. The v21 envelope adds a `project` hierarchy around
the existing `scene`; v22 adds optional room geometry and wall placements; v23 adds signed site
levels, explicit front projection assumptions and optional room-door swings; v24 adds edge banding;
v25 adds optional pinned cabinet catalogue references and item overrides. v26 adds pinned starter construction rules and sparse project rules. Project rules and installed catalogue updates require preview and acceptance; item edits are preserved. Older files load with editable defaults. Their first save uses Save As to preserve
the original file.

```json
{
  "version": 25,
  "name": "My Cabinet",
  "appVersion": "0.0.0",
  "units": "mm",
  "camera": { "position": { "x": 500, "y": -800, "z": 600 }, "target": { "x": 0, "y": 0, "z": 0 } },
  "project": { "id": "project_…", "areas": [{ "id": "area_…", "name": "Default Area", "rooms": [{ "id": "room_…", "name": "Default Room", "items": [{ "id": "item_…", "name": "Default Joinery Item", "rootComponentIds": [], "rootPartIds": [] }] }] }] },
  "scene": {
    "parts": [{ "kind": "board", "id": "…", "label": "Side Panel", "length": 800, "width": 400, "thickness": 18, "cuts": [], "visible": true, "…": "…" }],
    "materials": { "18mm Birch Ply": { "costPerM2": 42.50 } },
    "hardware": [{ "id": "…", "name": "Hinge", "qty": 4, "unit": "pcs", "unitCost": 2.50, "linkedPartIds": [], "…": "…" }]
  }
}
```

The production `.zmu` format (zip container, binary B-Rep per part) is
designed in §14 of the strategic plan but not yet implemented.

---

## Testing

```bash
pnpm test                                   # all 60 unit-test files
pnpm vitest run src/ui/HardwareTab.test.tsx # single file
pnpm coverage                               # lcov + console report
```

Tests live next to the code they test (`*.test.ts` / `*.test.tsx`).
`vitest.setup.ts` auto-polyfills IndexedDB via `fake-indexeddb`.

OCCT unit tests skip in Node (`it.skip`) — the WASM file is unavailable
outside the browser. To mock the worker in hook tests:

```ts
vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart }),
  expose: vi.fn(),
  transfer: vi.fn((data) => data),
}))
vi.stubGlobal('Worker', vi.fn(function MockWorker() {}))
import { useScene } from './useScene'
```

---

## Contributing

- Branch from `main`; open a PR when ready
- Run `pnpm typecheck && pnpm lint && pnpm test` — the pre-commit hook
  enforces typecheck automatically
- Match existing style; touch only what the task requires
- See `CLAUDE.md` for full code conventions used in this repo

---

## License

UNLICENSED — all rights reserved for the v0.1 prototype.
MPL 2.0 planned at v0.5 per the [strategic plan](joinery_3d_software_plan.md) §19.

## Company catalogue publishing API

A separate Node service verifies Keycloak realm API access tokens and resolves them through an IT-managed map to stable company/staff identities. IT manages master rule versions; authorised senior designers maintain product drafts, with a different designer approving publication. Versions and audit transitions are immutable and stored transactionally in SQLite. See [setup and HTTP contract](docs/company-catalogue-api.md).

`pnpm build:catalogue` builds the API; `pnpm start:catalogue` requires realm/client configuration, an IT-managed identity bindings file and an absolute durable database path. Live realm setup remains pending. Signed-in catalogue readers can export published versions and their rule dependencies for CAD. Use **File → Import company catalogue…**, review the records and confirm the company source, then install into the current project. Imported products appear in **+ Cabinet**; their snapshots and exact pins are stored in v27 `.zimmu` files for offline use. Import never updates existing cabinets. Select an installed newer version in the cabinet editor, inspect before/after parts, drilling/manual instructions, material/hardware quantities and priced cost coverage, then explicitly apply it; project and item overrides remain intact. Package SHA-256 hashes check content consistency, but offline files cannot authenticate their sender or approval records. Obtain packages through your company’s trusted channel. This API does not change a saved cabinet or approve production release.

### Company catalogue publishing

Open **File → Company catalogue…** for Keycloak sign-in, IT master-rule authoring and senior-designer drafting/review/publication. The separate window preserves unsaved CAD during authentication redirects. Public build config and same-origin API deployment are required; missing configuration leaves CAD usable. Published versions do not automatically update CAD. See [setup and operation](docs/company-catalogue-api.md).
