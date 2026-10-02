# Entra-authenticated catalogue publishing API

**Plan:** `../plans/2026-10-02-entra-catalogue-publishing.md`
**Notes:** `../notes/2026-10-02-entra-catalogue-publishing-notes.md`

## Scope

The user selected Microsoft Entra sign-in. Deliver the server boundary first, stacked on PR #74 while its browser checks run. No frontend role simulation or automatic adoption into CAD. A future MSAL editor can consume the same API after tenant/app configuration is supplied.

Single configured tenant; validate signed v2 delegated API access tokens against tenant-specific Microsoft JWKS, exact issuer/audience, expiry, tenant/object identity and `Catalogue.Access` scope. App roles `Catalogue.RuleAdministrator` and `Catalogue.ProductDesigner` determine server authority. No client-provided actor, role or approver is accepted. IT manages master construction rule drafts and publications. Authorised senior designers prepare products; a different authorised senior designer must approve publication. Only the creator edits/submits a draft. Requested changes return it to its creator. Published versions never change.

Draft → submitted → published, or submitted → draft on withdrawal/requested changes. Every command requires the exact expected draft revision. Each draft pins the latest published version at creation; publication fails if that base has been superseded. Store transitions, actor, time, role evidence and content digest atomically with versions in SQLite. Enforce publication/audit immutability in database triggers. Use durable server-side storage, never browser persistence as approval authority.

Rule versions snapshot common construction/front/material rules and thickness/grain/edge stock. Product drafts pin a published company rule version and a starter layout version, then allow scalar size/construction overrides. Resolve and validate cabinet geometry with the existing CAD validator before submission/publication. Persist the resolved recipe snapshot so starter instance IDs never change an old version at process restart. New layout authoring, company-wide CAD distribution, live MSAL UI, withdrawal of released versions and production approval are later increments.

## Runtime

Node >=22.13, native SQLite, `jose` for JWT verification. Require tenant ID, API client ID and an absolute database path at startup. Bind loopback by default; production requires an HTTPS reverse proxy with same-origin API routing. Fail closed without configuration. No tenant credentials or bearer tokens in repository/logs. API requests are bounded JSON with explicit allowlists. The API can run locally with a real Entra access token once IT registers and configures it.

## Acceptance

Cryptographically signed test tokens exercise the real verifier; reject wrong signature, tenant, audience, expired/missing expiry, ID/app-only tokens and absent delegated scope. Assert server role boundaries, creator-only edits, independent product approval, submitted snapshot freezing, stale revision/base conflicts, missing rule references and geometry rejection. Reopen a real temporary SQLite file to verify versions/audit survive and remain immutable. Exercise HTTP authentication/body validation and show publication rollback and competing store connections cannot leave partial/duplicate versions. Mutation-test critical security/concurrency guards. Keep all existing CAD tests/build and CI gates.
