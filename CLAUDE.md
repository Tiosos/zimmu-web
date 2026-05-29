# CLAUDE.md — Zimmu Web

Zimmu is an open-core 3D joinery design app. React 19 + TypeScript + Vite frontend, Three.js viewport, OpenCASCADE.js (WASM) geometry kernel, Comlink-bridged Web Worker.

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

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

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

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
