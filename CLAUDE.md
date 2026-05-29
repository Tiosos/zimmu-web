# CLAUDE.md — Zimmu Web

Zimmu is an open-core 3D joinery design app. React 19 + TypeScript + Vite frontend, Three.js viewport, OpenCASCADE.js (WASM) geometry kernel, Comlink-bridged Web Worker.

## Commands

```bash
pnpm dev          # dev server at http://localhost:5173
pnpm test         # vitest run (unit tests, no browser)
pnpm test:watch   # vitest in watch mode
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint .
pnpm build        # tsc + vite build (output: dist/)
pnpm coverage     # vitest coverage report
```

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit.

## Architecture

```
src/
├── geom/
│   ├── occt.ts          OCCT bootstrap + shape primitives
│   ├── occt.worker.ts   Comlink Web Worker wrapping the OCCT kernel
│   ├── mesh.ts          TopoDS_Shape → THREE.BufferGeometry conversion
│   └── occt.test.ts     Vitest smoke tests (OCCT skipped in Node)
├── render/
│   └── viewport.tsx     React-wrapped Three.js canvas + OrbitControls
├── App.tsx
├── main.tsx
└── vite-env.d.ts        Ambient declarations for opencascade.js
```

- **OCCT is browser-only.** Never call live OCCT APIs in tests — guard with environment checks or mock the module. The existing smoke test shows the pattern.
- **Geometry lives in `src/geom/`**, rendering in `src/render/`. Keep the seam clean; viewport code must not import OCCT directly.
- **Workers use Comlink.** Expose the OCCT API via `Comlink.expose()` in the worker and consume it with `Comlink.wrap()` in the main thread.
- **Three.js coordinate system:** +Z up (CAD convention), not Three.js default +Y up. Don't change this.

## Code conventions

- TypeScript strict mode — `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` are on.
- No `any`. Prefer explicit types over inference when the type is non-trivial.
- No comments that describe *what* the code does. Only comment *why* when the reason is non-obvious.
- Functional React components only. No class components.
- Prefer named exports over default exports for non-entry-point modules.
- Do not add abstractions or error handling for cases that cannot occur.

## Dependencies

- **Package manager:** pnpm (never npm/yarn).
- `opencascade.js` is excluded from Vite's pre-bundler (`optimizeDeps.exclude`). Do not change this.
- WASM assets are included via `assetsInclude: ['**/*.wasm']` and `vite-plugin-wasm`. Any new WASM dependency follows the same pattern.
- `stats.js` is available for performance overlays in the viewport.

## Testing

- Framework: Vitest + happy-dom + @testing-library/react.
- Tests live next to the code they test (`*.test.ts` / `*.test.tsx`).
- OCCT unit tests must skip when `typeof window === 'undefined'` or the WASM file is unavailable.
- Aim for tests on the geom seam (inputs → outputs) rather than Three.js internals.

## Git

- Development branch: `claude/vigilant-goldberg-PhwjF`
- Commit messages: short imperative summary, no ticket references needed yet.
- Do not push to `main` directly.

## License

UNLICENSED for v0.1 prototype. MPL 2.0 is planned at v0.5.
