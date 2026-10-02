# Published catalogue import implementation plan

Spec: ../specs/2026-10-02-catalogue-import-design.md
Notes: ../notes/2026-10-02-catalogue-import-notes.md

1. Extract the existing deterministic server content validation to a browser-safe shared module; retain ApiError mapping and server SHA-256. Do not import Node auth/storage into CAD. Confirm existing API tests pass.
2. Define strict package and publication metadata checks. Recompute resolved products from exact rule dependencies and existing starter layout; compare canonical content. Verify all content hashes via WebCrypto at export/import. Use bounded file reads before parsing and generation checks after asynchronous work.
3. Implement project-local immutable merge and namespaced materials. Validate prior installed state on file boundaries. v27 adds optional scene.companyCatalogues without adopting definitions or regenerating parts on load. Reject content/version/material conflicts atomically; preserve costing fields for matching stock.
4. Extend catalogue resolution with optional project packages (default starter-only for backwards compatibility). Product baselines use their pinned rule snapshot; use installed definitions at placement, provenance, pipeline override reconciliation and preview. Never use a module-global registry. Keep custom presets independent.
5. Add authenticated publishing Export for CAD action. Reload exact /me and versions under existing run/session-generation guard; validate before download. Drafts never included. Fail without producing a partial file.
6. Add a CAD import dialog with bounded file selection, company/version/approval summary, source acknowledgement and install/cancel. Install is a single undoable scene change without regeneration; late parse result cannot install into another project. Add imported products to existing chooser with IDs independent of display names and show installed versions in cabinet detail.
7. Add focused semantic tests covering boundaries and full project lifecycle. Deliberately break each new guard, predict failures, confirm AssertionError, restore backups and rerun green. Add browser export/import acceptance where feasible; retain live realm provisioning as IT work.
8. Update README/setup/project-structure reference, regenerate tree, complete typecheck/lint/full tests/CAD+API builds/diff checks. Commit on feature branch, publish and open draft PR with scope, tests and offline trust limitation. Do not merge.

Alternatives: shared mutable registry rejected (cross-project leakage); automatic geometry adoption rejected (unreviewed changes); tokens/postMessage rejected (separate auth boundary); live CAD fetch deferred (larger authentication design); signed offline packages deferred (IT key lifecycle not established); one global rule pin rejected for company products (published products already pin distinct rule versions); silently overwriting colliding stocks rejected (would resize saved cabinets).
