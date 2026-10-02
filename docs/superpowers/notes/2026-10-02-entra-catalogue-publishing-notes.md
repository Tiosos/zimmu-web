# Entra catalogue publishing notes

**Spec:** `../specs/2026-10-02-entra-catalogue-publishing-design.md`
**Plan:** `../plans/2026-10-02-entra-catalogue-publishing.md`

- 2026-10-02: User selected Microsoft Entra company login. There is no current backend or tenant configuration in the repository. This PR introduces an API with real access-token verification; live login requires IT app registration and a subsequent MSAL UI connection. PR #74 is the dependency and remains unmerged.
- 2026-10-02: SQLite is scoped to one service instance/durable database, with transactions and immutable version/audit triggers. Managed hosting/database deployment is not inferred. Products first use pinned starter layouts plus scalar overrides; full section/frame authoring and distribution into the CAD registry are separate increments.

- 2026-10-02: Cryptographically signed RSA-token tests exercise issuer, audience, expiry, tenant/object claims, delegated scope and signature rejection. No token bypass exists in the runtime entry point. App roles are trusted only after verification; product identity is tenant + object ID.
- 2026-10-02: HTTP tests cover real verifier calls, actor-field forgery rejection, creator/reviewer policy, chunked request limits and two edits competing for one revision. Storage tests reopen a real SQLite file, enforce update/delete triggers, reject stale publication bases across two connections and verify a failed audit insert rolls back version/draft changes.
- 2026-10-02: Sixteen deliberate mutations were killed with AssertionErrors: issuer, audience, scope, signature, role, tenant, creator, independent reviewer, exact revision, publication base, submitted edit freeze, atomic audit, SQL immutability, request allowlist, complete master rules and body limit. All source backups restored and compared afterward.
- 2026-10-02: Compiled API smoke passed: missing configuration refuses startup; configured loopback health succeeds; unauthenticated catalogue read returns 401; a newly created database is mode 0600. Fake GUIDs are test configuration only, not a live company connection.
- 2026-10-02: PR #74 E2E failed on its File-menu selector; corrected to `File ▾`. The test now closes provenance before opening the modal so the later summary click consistently reopens it. Follow-ups are kept on #74 and this branch is stacked above that dependency.
- 2026-10-02: Final gates passed: 142 test files, 2,597 passed/10 skipped; typecheck; lint; browser production build; separate catalogue server build; diff check. Runtime smoke and 16 mutation checks are recorded above. No live Entra tenant configuration, browser editor or deployment is claimed.
