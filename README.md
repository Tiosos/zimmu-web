# Zimmu — v0.1

Open-core 3D joinery design app. **Weekend 1 milestone.**

Strategic plan: [`../joinery_3d_software_plan.md`](../joinery_3d_software_plan.md)

## What's in this commit

Phase 0 kernel-to-UI seam from the founding plan, restated for a solo web build:

1. Vite + React 19 + TypeScript scaffold
2. opencascade.js (full WASM build, ~65 MB) bootstrapped via lazy dynamic import
3. Three.js viewport with OrbitControls, +Z-up CAD camera, axes + grid helpers
4. OCCT `TopoDS_Shape` → Three.js `BufferGeometry` conversion via `BRepMesh_IncrementalMesh`
5. A hardcoded 100 × 100 × 50 mm box rendered in the viewport
6. Vitest smoke test on the kernel seam (live OCCT init is browser-only and skipped in Node)

## What's not here

Everything past weekend 1 of the v0.1 plan — no UI controls, no joints, no
project model, no file I/O, no Biome (deferred — config-protection hook
blocks new lint configs), no shadcn (deferred to weekend 4).

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
