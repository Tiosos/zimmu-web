# Company catalogue API — Keycloak setup and operation

The separate Node service provides authenticated rule/product authoring and controlled publication. The publishing editor follows in stacked PR #76. Publishing does not adopt definitions into CAD or approve production release.

## IT setup

Use one IT-managed Keycloak realm with HTTPS and RS256 access-token signing. Keep registration disabled, provision staff centrally and require your company MFA policy. Configure production hostname, TLS and backups before exposing Keycloak. The application has no embedded realm or credentials.

1. Create an OIDC API client, for example `zimmu-catalogue-api`, with interactive flows, direct access grants and service accounts disabled. Create these **client roles on the API client**:

   | Role                          | Assigned to                 | Authority                                                                |
   | ----------------------------- | --------------------------- | ------------------------------------------------------------------------ |
   | `Catalogue.RuleAdministrator` | IT rule administrators      | Create/edit/submit/publish master rules                                  |
   | `Catalogue.ProductDesigner`   | Authorised senior designers | Create/edit/submit products; review another designer's submitted product |

2. Create a separate public OIDC SPA client, for example `zimmu-catalogue-editor`: client authentication **off**, standard flow **on**, PKCE method **S256 enforced**. Disable implicit flow, direct access grants, service accounts and device authorization. Register only the exact catalogue callback and logout return URI `<site-origin>/<base-path>company-auth.html`; use `http://localhost:5173/company-auth.html` only for local development. Set Web Origins to the exact site origin. Avoid wildcard redirects/origins.
3. Create a client scope named `Catalogue.Access`, include its name in the issued `scope` claim, and attach it to the SPA as an optional scope. Add a hardcoded **Audience** mapper with Included Client Audience set to the API client ID and Add to access token enabled (not ID tokens). Use the client-role mapper to emit granted API roles in `resource_access[<api-client-id>].roles`. Disable Full Scope Allowed on the SPA and allow only these two API roles in its role scope mappings, including the requested scope. Assign roles to staff/groups centrally. Check an actual issued token: exact realm `iss`, API `aud`, SPA `azp`, payload `typ: "Bearer"`, `scope` containing `Catalogue.Access`, and only intended API client roles. Realm roles, other client roles and user-supplied attributes grant no authority here.
4. Create an IT-owned identity bindings JSON file and give the API service read access. Only IT may modify it; staff and the browser must not. Use atomic file replacement and keep backups. The API reloads it for every authenticated request, so removing a binding immediately denies that account even if its access token has not expired.

```json
{
  "issuer": "https://identity.example.invalid/realms/company",
  "companyId": "11111111-1111-1111-1111-111111111111",
  "users": [
    {
      "subject": "22222222-2222-2222-2222-222222222222",
      "staffId": "33333333-3333-3333-3333-333333333333"
    }
  ]
}
```

Values above are placeholders. `subject` is the exact Keycloak `sub`; `staffId` is the canonical immutable staff UUID. **For an existing Entra-backed database, retain the old tenant UUID as `companyId` and each verified staff member's old object UUID as `staffId`.** Confirm identity with IT records before binding. Never match by email, display name or editable user attributes. Do not issue a second canonical staff identity to the same person: that would undermine independent approval. Replace an old binding when an account is recreated; do not create another staff ID. Duplicate subjects and duplicate canonical staff IDs are rejected. An unmapped user is denied even with valid roles. Historical authors, reviewers, versions and audit stay unchanged; the transport retains `tenantId`/`objectId` field names for compatibility, now representing stable company/staff IDs.

Role changes take effect as tokens expire/refresh. Use short access-token lifetimes and revoke Keycloak sessions when appropriate; remove the identity binding for immediate catalogue access revocation. Live realm configuration has not been exercised by repository tests.

## Run the API

Use Node **22.13 or newer**. Use a durable local volume, one API instance per database, permissions limited to its service account and regular backups. Keep database, bindings and environment files out of git.

```sh
pnpm install --frozen-lockfile
pnpm build:catalogue
# Placeholder configuration; provision the realm/clients and identity file first.
export CATALOGUE_COMPANY_ID='<stable-company-uuid>'
export KEYCLOAK_ISSUER='https://identity.example.invalid/realms/company'
export KEYCLOAK_API_CLIENT_ID='zimmu-catalogue-api'
export KEYCLOAK_SPA_CLIENT_ID='zimmu-catalogue-editor'
export CATALOGUE_IDENTITY_MAP_PATH='/var/lib/zimmu/staff-bindings.json'
export CATALOGUE_DB_PATH='/var/lib/zimmu/company.sqlite'
pnpm start:catalogue
```

Startup rejects missing/invalid configuration, relative storage paths, in-memory databases and unavailable/invalid identity bindings. Entra variables are no longer accepted. Production issuer must be HTTPS; HTTP is allowed only for loopback development. Identity files are bounded to 1 MiB and 10,000 bindings. Incorrect issuer/company, unknown fields, malformed UUIDs or duplicates fail closed.

The API defaults to `127.0.0.1:8787`. Production needs an HTTPS reverse proxy, same-origin API routing, rate limits and a managed service lifecycle. Set `CATALOGUE_HOST`/`CATALOGUE_PORT` if needed. SQLite WAL/full synchronization, atomic mutations and immutable SQL snapshots remain unchanged. The database owner remains responsible for backups and underlying file access. No deployment is created by this PR.

## HTTP contract

All catalogue routes require `Authorization: Bearer <API access token>`. Command bodies must be `application/json`, at most 256 KiB, and contain only the documented fields. Responses are `no-store`. No cookies, role headers or unauthenticated publication path exist. `/healthz` is a minimal public health response.

| Method/path                                      | Body/action                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `GET /api/catalogue/me`                          | Verified tenant/object identity and app roles                                     |
| `GET /api/catalogue/versions`                    | All immutable published company versions; any scoped company user                 |
| `GET /api/catalogue/drafts`                      | Drafts visible under the caller's relevant app role                               |
| `GET /api/catalogue/drafts/:id`                  | One draft snapshot; relevant app role required                                    |
| `GET /api/catalogue/drafts/:id/audit`            | Ordered audit trail; relevant app role required                                   |
| `POST /api/catalogue/drafts`                     | `{kind: "rule" or "product", definitionId, content}`                              |
| `PUT /api/catalogue/drafts/:id`                  | `{expectedRevision, content}`; creator only, working draft only                   |
| `POST /api/catalogue/drafts/:id/submit`          | `{expectedRevision}`; creator only                                                |
| `POST /api/catalogue/drafts/:id/withdraw`        | `{expectedRevision}`; creator returns submission to working draft                 |
| `POST /api/catalogue/drafts/:id/request-changes` | `{expectedRevision, note}`; review note required                                  |
| `POST /api/catalogue/drafts/:id/publish`         | `{expectedRevision, note?}`; IT for rules, different senior designer for products |

Responses include draft ID, creator, revision, state, content and SHA-256 digest. Store the returned revision and send it on the next command. A `409` requires reloading/reviewing; do not silently retry with a replacement revision. A competing publication invalidates drafts made against an older latest version. Create a fresh draft deliberately based on the current version; the existing draft/audit remain available.

## Content

Rule content contains `name`, `values` and `materials`. Values include all common carcase/back/front/frame material slots, back mode, joint method, front mount and reveal; optional edge material inherits no edge band when absent. Material definitions snapshot positive finite `thickness`, optional `hasGrain` and optional `use: "edge"`. Supplier rates, contract pricing and inventory are outside this API.

Product content contains `name`, `source`, `rule` and `overrides`. Example:

```json
{
  "kind": "product",
  "definitionId": "company.base-600",
  "content": {
    "name": "Company base 600",
    "source": { "id": "starter.base-600", "version": 1 },
    "rule": { "id": "company.master", "version": 1 },
    "overrides": { "depth": 600 }
  }
}
```

The company rule reference must already be published. Product overrides currently allow dimensions (`width`, `height`, `depth`, toe-kick height/setback), `baseMode`, `hasTop`, and the existing common rule keys. Layout edits (`section`/`frame`), hardware/drilling rule authoring and per-part overrides are deferred. The published product retains its resolved parameters, category and pinned rule/layout references; neither a later rule version nor process restart rewrites it. Publication confirms company catalogue approval, **not** machine readiness or production release. Adoption into a project will continue to require the explicit preview/apply flow.

## Reference documentation

- [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter)
- [Keycloak server administration: scopes, roles and audience mappers](https://www.keycloak.org/docs/latest/server_admin/index.html)
- [Keycloak production configuration](https://www.keycloak.org/server/configuration-production)
- [jose JWT verification](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)

## Browser publishing editor (#76)

Set these public build variables to the same realm and SPA client configured above:

```sh
export VITE_KEYCLOAK_URL='https://identity.example.invalid'
export VITE_KEYCLOAK_REALM='company'
export VITE_KEYCLOAK_CLIENT_ID='zimmu-catalogue-editor'
pnpm build
```

No browser secret or token belongs in build variables. Old `VITE_ENTRA_*` variables are not supported. Missing or malformed configuration leaves sign-in unavailable while CAD remains usable. Serve the built `company-auth.html` page and assets as a real separate entry; do not rewrite it to `index.html`. HTTPS is required outside loopback development. Match any deployment base path exactly in both Keycloak redirect lists.

**File → Company catalogue…** opens a separate window with no opener link. Standard code/PKCE sign-in redirects only that window, preserving unsaved CAD work. Keycloak initializes and consumes the callback before React mounts. The API's `/me` response supplies canonical identity and roles before authoring becomes available. Access/refresh tokens stay in the SDK's memory in this window; they are not stored or sent to the CAD window. API requests refresh the token if needed; failed refresh requires explicit sign-in. Reload/reopen requires another explicit sign-in. Sign-out clears tokens and private editor data before navigating to the realm logout page. The login-status iframe is disabled; revocation outside this window is detected at token refresh/expiry or by removing the identity binding.

Route `/api/catalogue/*` on the **same site origin** to the private catalogue API. Bearer requests omit cookies, disable cache and refuse redirects. Vite development proxies to `127.0.0.1:8787`; run the configured API separately. There is no browser endpoint picker or cross-origin token sharing.

IT creates master rules/material stock and saves/submits/publishes an exact version. Senior designers create products pinned to a published rule and installed starter layout, then save/submit. A different authorised designer reviews and publishes or requests changes with a note. Creators may withdraw submissions. Published history offers Draft next version without altering an issued snapshot. There is no local role selector.

Dirty edits block submission; publication confirms the saved revision, digest, next version and pins. Conflicts/uncertain network outcomes disable commands until explicit reload/review; writes are not retried automatically. Closing dirty forms asks before discarding. Expiry/sign-out clears private data and invalidates late responses. Publication is catalogue approval; CAD adoption and production release remain separate decisions.

### Live acceptance checklist

1. Inspect a real realm token and confirm exact issuer, API audience, SPA authorized party, Bearer type, Catalogue.Access scope and API client roles. Verify PKCE enforcement, exact redirect/logout URIs, origin, MFA and disabled alternative grants.
2. Verify production HTTPS routing and callback assets. Exercise login, refresh expiry/reconnect and logout in supported browsers; confirm CAD's unsaved state survives redirects in the separate window.
3. Verify every staff account is bound to its existing canonical staff UUID before migration. Publish a rule as IT; submit as designer A and approve as designer B. A must still be denied self-approval on pre-migration drafts. Readers cannot write; unbound/wrong-realm/wrong-client accounts are denied.
4. Remove a binding and verify immediate API denial. Test stale revisions in two sessions, immutable history/audit over restart and no automatic CAD changes.

No realm credentials or service deployment are supplied. Live Keycloak acceptance is an IT deployment prerequisite and is not claimed by the local or GitHub test suites.
