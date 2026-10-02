# Entra catalogue publishing implementation

**Spec:** `../specs/2026-10-02-entra-catalogue-publishing-design.md`
**Notes:** `../notes/2026-10-02-entra-catalogue-publishing-notes.md`

1. Verify #74 dependency status. Add a separate server build/typecheck target and `jose`; keep browser source independent of Node.
2. Add single-tenant Entra verification and immutable identity policy, backed by signed-token tests. Use role claims from verified access tokens only.
3. Add constrained rule/product payload validation and resolved recipe snapshots. Share CAD validation; pin published company rules and installed layout versions.
4. Persist drafts, append-only versions and audit in transactional SQLite. Enforce revision/base guards, independent product review and SQL immutability. Test persistence, rollback and concurrent store connections.
5. Expose authenticated HTTP reads/commands and fail-closed configuration. Add runtime/setup instructions with exact Entra scopes/roles and token version requirements. Leave live registration and frontend MSAL connection clearly pending.
6. Mutation-test key guards; run typecheck, lint, full tests and browser/server production builds. Publish a stacked draft PR targeting #74's branch; do not merge either PR without user review authorization.
