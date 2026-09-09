# Code check by Codex

This review covered the current `zimmu-web` codebase with emphasis on correctness risks, lifecycle management, production build coverage, long-running worker behavior, file-format safety, and maintainability.

## Recommended improvements

1. **Require a production build in CI**
   - Add `pnpm build` to the main CI workflow so Vite production bundling, workers, and OpenCascade/WASM asset handling are continuously verified.

2. **Tighten OCCT geometry-build lifecycle cleanup**
   - Ensure a part removed while a geometry build is still pending cannot remain in `pendingIds` or `errors`, and cannot publish stale geometry after deletion or scene replacement.

3. **Cancel obsolete sheet-nesting work**
   - Keep the existing stale-result guard, but also terminate superseded nesting workers so multi-second obsolete jobs stop consuming CPU instead of merely having their result discarded.

4. **Add a validated `.zimmu` file boundary**
   - Treat JSON as `unknown`, validate the envelope and geometry-bearing data, migrate legacy versions explicitly, and only then expose a current `ZimmuFile`/`Scene` to the application.

5. **Split `carcaseRoles.ts` by domain responsibility**
   - Preserve behavior while separating validation, layout/boxes, joinery, contacts, cuts, and machining into focused modules. Keep a compatibility facade during migration to avoid unnecessary import churn.

## Suggested implementation order

The five changes should land independently in the order above. The first three reduce immediate production risk. The file-boundary work strengthens persistence and forward compatibility. The carcase refactor should be last and remain behavior-preserving, using the existing broad test suite as the safety net.

## Review principle

For the architectural changes, prefer mechanical extraction and explicit invariants over simultaneous cleanup. The goal is to make the next features safer to build without changing cabinet geometry or user-visible behavior during the refactor.
