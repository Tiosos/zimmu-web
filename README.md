# Zimmu — v0.1

Open-core 3D joinery design app. **Phase 0.5 — browser prototype.**

Strategic plan: [`../joinery_3d_software_plan.md`](../joinery_3d_software_plan.md)

## What's built (Phase 0 + Phase 0.5 in progress)

The browser prototype validates the geometry seam, UX, and file format before
the full Rust/Tauri production build begins. See §6 of the plan for the
prototype-vs-production layer mapping.

**Geometry kernel:**
- `opencascade.js` (full WASM build, ~65 MB) bootstrapped via lazy dynamic import in a Comlink-bridged Web Worker
- OCCT `TopoDS_Shape` → Three.js `BufferGeometry` via `BRepMesh_IncrementalMesh`

**Viewport:**
- Three.js r184 with OrbitControls, +Z-up CAD camera, axes + grid helpers
- Per-part meshes with edge lines; emissive highlight on selection
- Raycaster for face-click (snap/cut mode), filtered for hidden parts

**Scene / parts:**
- Multiple board parts (length × width × thickness mm, color, label)
- Position and rotation (per-axis, in mm / degrees)
- Part visibility toggle (eye button in sidebar, `H` shortcut)
- Part duplication (`Ctrl+D`), removal

**Editing modes:**
- Snap/align mode (`F`) — align faces between two boards
- Cut mode (`C`) — boolean subtract a cut rectangle from a board face

**Undo/redo:**
- 50-entry history, closure-based; consecutive dimension edits coalesce into one entry
- `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`

**File I/O:**
- Save / Save As / Open / New via File System Access API (Chrome/Edge)
- `.zimmu` flat-JSON project format (`FILE_FORMAT_VERSION = 1`)
- Auto-reopen last file on startup (IndexedDB handle persistence)
- Dirty tracking (`isDirty` flag, tab title indicator)

**Testing:**
- Vitest + happy-dom + @testing-library/react
- Scene, file, keyboard shortcuts, UI integration tests

## What's not yet built

- shadcn/ui (deferred to Phase 0.5 completion)
- Cutting list / BOM panel (Phase 0.5)
- WASM performance baseline instrumentation (Phase 0.5)
- FSAPI fallback for non-Chromium browsers (Phase 0.5)
- Rust/Tauri production application shell (Phase 1)

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173 — first paint waits a few seconds on OCCT WASM
pnpm test         # smoke test
pnpm typecheck    # tsc -b --noEmit
pnpm build        # production bundle (will be large; OCCT WASM dominates)
```

First page load downloads the OCCT WASM (~65 MB). Expected; called out in the
v0.1 plan's risk table.

## Layout

```
src/
├── geom/
│   ├── occt.ts        OCCT bootstrap + box primitive
│   ├── mesh.ts        TopoDS_Shape → THREE.BufferGeometry
│   └── occt.test.ts
├── render/
│   └── viewport.tsx   React-wrapped Three.js canvas
├── App.tsx
├── main.tsx
├── index.css
└── vite-env.d.ts      ambient declarations for opencascade.js
```

## License

UNLICENSED / All Rights Reserved for the v0.1 prototype. MPL 2.0 lands at v0.5
per the founding plan §19.
