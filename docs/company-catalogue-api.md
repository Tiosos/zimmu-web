# Company catalogue API — Entra setup and operation

This is a server increment, separate from the browser CAD application. It provides authenticated rule/product authoring and controlled publication. The browser Company catalogue window signs in and authors/reviews company definitions. CAD does not yet adopt published company definitions. Starter examples in CAD remain examples.

## IT setup

1. Register a **single-tenant API application** in Microsoft Entra. Set `api.requestedAccessTokenVersion` to `2`. Record its Application (client) ID and your Directory (tenant) ID. The service requires v2 API access tokens with that API client ID as audience.
2. Expose the delegated scope `Catalogue.Access` on the API (for example `api://<api-client-id>/Catalogue.Access`). Require the appropriate company/admin consent. Application-only tokens and ID tokens are rejected.
3. Define API app roles with **Users/Groups** as allowed member types:

   | Role value | Assigned to | Authority |
   | --- | --- | --- |
   | `Catalogue.RuleAdministrator` | IT rule administrators | Create/edit/submit/publish master rules |
   | `Catalogue.ProductDesigner` | Authorised senior designers | Create/edit/submit products; review another designer's submitted product |

   Assign these roles to the intended users/groups on the API enterprise application. Neither directory role names nor browser-selected roles grant catalogue authority. A user with both app roles has both permissions but still cannot approve their own product.
4. Register a separate single-tenant SPA client with delegated permission to this API and company/admin consent. Expose the API scope as `api://<api-client-id>/Catalogue.Access` for this client. Register the exact SPA callback URI `<site-origin>/<base-path>company-auth.html` (development: `http://localhost:5173/company-auth.html`). The editor uses MSAL Browser authorization code flow with PKCE; no client secret belongs in a browser. Keep implicit grant disabled. Assign catalogue app roles on the API enterprise application, not the SPA registration.

Identity uses the verified tenant ID plus immutable object ID, never email/display name. Role assignment changes take effect as access tokens expire/are refreshed; immediate revocation/Conditional Access integration is a deployment follow-up. Live tenant configuration has not been exercised in this repository.

## Run the API

Use Node **22.13 or newer** (Node 24 is also supported). Native SQLite still reports its experimental warning on supported Node versions. Use a persistent local volume, one API instance per database, file permissions limited to its service account and regular backups. Do not put the database, tokens or environment files in git.

```sh
pnpm install --frozen-lockfile
pnpm build:catalogue
# Set these in your service environment; the values below are placeholders.
export ENTRA_TENANT_ID='<directory-tenant-guid>'
export ENTRA_API_CLIENT_ID='<api-application-client-guid>'
export CATALOGUE_DB_PATH='/var/lib/zimmu/company.sqlite'
pnpm start:catalogue
```

Startup refuses missing/invalid IDs, in-memory storage and relative database paths. It defaults to `127.0.0.1:8787`. Production needs an HTTPS reverse proxy, same-origin API routing, request/rate limits and a managed service lifecycle. Set `CATALOGUE_HOST`/`CATALOGUE_PORT` explicitly when your hosting requires it. No deployment or public endpoint is created by this PR. SQLite WAL and full synchronization are enabled; mutations are immediate transactions. SQL triggers prohibit published-version or audit update/deletion. These controls protect API transitions; a database owner remains responsible for backups, restore privileges and protecting the underlying files.

## HTTP contract

All catalogue routes require `Authorization: Bearer <API access token>`. Command bodies must be `application/json`, at most 256 KiB, and contain only the documented fields. Responses are `no-store`. No cookies, role headers or unauthenticated publication path exist. `/healthz` is a minimal public health response.

| Method/path | Body/action |
| --- | --- |
| `GET /api/catalogue/me` | Verified tenant/object identity and app roles |
| `GET /api/catalogue/versions` | All immutable published company versions; any scoped company user |
| `GET /api/catalogue/drafts` | Drafts visible under the caller's relevant app role |
| `GET /api/catalogue/drafts/:id` | One draft snapshot; relevant app role required |
| `GET /api/catalogue/drafts/:id/audit` | Ordered audit trail; relevant app role required |
| `POST /api/catalogue/drafts` | `{kind: "rule" or "product", definitionId, content}` |
| `PUT /api/catalogue/drafts/:id` | `{expectedRevision, content}`; creator only, working draft only |
| `POST /api/catalogue/drafts/:id/submit` | `{expectedRevision}`; creator only |
| `POST /api/catalogue/drafts/:id/withdraw` | `{expectedRevision}`; creator returns submission to working draft |
| `POST /api/catalogue/drafts/:id/request-changes` | `{expectedRevision, note}`; review note required |
| `POST /api/catalogue/drafts/:id/publish` | `{expectedRevision, note?}`; IT for rules, different senior designer for products |

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

- [Microsoft: validate API access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [Microsoft: validate identity and authorisation claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
- [jose: JWT verification](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)
- [Node 22: SQLite](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)

## Browser publishing editor

Set these public build variables in your build environment (GUID placeholders are intentionally not provided as working configuration):

```sh
VITE_ENTRA_TENANT_ID='<directory-tenant-guid>'
VITE_ENTRA_SPA_CLIENT_ID='<spa-application-client-guid>'
VITE_ENTRA_API_CLIENT_ID='<api-application-client-guid>'
pnpm build
```

These IDs are public application configuration. Never add a client secret or access token to a `VITE_*` variable. Missing or malformed IDs leave company sign-in unavailable while CAD remains usable. Serve the built `company-auth.html` page and its generated assets. MSAL v5 requires that callback page to run the redirect bridge independently of React/CAD and without Cross-Origin-Opener-Policy headers; do not rewrite it to `index.html`. Serve HTTPS in production; localhost is the development exception. The app requests only the configured API scope and explicitly prompts for an account. API tokens are acquired silently for requests; an interaction-required result asks the user to sign in again. MSAL uses memory storage; reload/reopen requires an explicit sign-in. Account changes require sign-out then sign-in. Browser memory is cleared locally on sign-out before the Microsoft logout popup finishes.

Route `/api/catalogue/*` on the **same site origin** to the private catalogue API. Bearer requests omit cookies, disable HTTP cache and refuse redirects. No cross-origin endpoint picker or CORS token sharing is implemented. Vite development proxies this route to `127.0.0.1:8787`; run the configured API separately. The proxy target is fixed and carries no embedded credentials.

Open **File → Company catalogue…**. IT creates master rules/material stock and saves/submits/publishes an exact version. Authorised senior designers create products pinned to a published rule and installed starter layout, save and submit; a different authorised senior designer reviews the saved snapshot and publishes or requests changes with a note. Blank product overrides inherit. A creator can withdraw their submission for editing. Published history offers **Draft next version**; it does not edit an issued snapshot. The API supplies all roles and authoritative identity; there is no local role selector. Reader accounts can browse published history.

Unsaved edits block submission. Publication requires a separate confirmation showing the exact saved revision, digest, next version and rule/layout pins. Conflict, permission error or uncertain network outcome disables commands until explicit reload/review; writes are never automatically retried. Closing dirty forms asks before discarding. Sign-out/expiry clears the editor and invalidates late responses. Publication remains catalogue approval, not production release or automatic CAD adoption.

### Live acceptance checklist for IT

1. Verify both registrations are single-tenant and the API uses v2 access tokens. Check API scope consent, SPA callback URI and API app-role assignments with real staff accounts.
2. Route same-origin HTTPS API traffic and serve callback assets with the documented header exception. Verify sign-in, refresh/interaction-required reconnect and logout in supported desktop browsers, including company popup/Conditional Access policies.
3. Use IT to publish a rule; use designer A to submit a product and designer B to approve. Confirm designer A cannot self-approve, readers cannot write, and unauthorised/other-tenant accounts are rejected by the API.
4. Open the same draft in two staff sessions; verify stale revision commands require reload. Check audit identity/time/note and immutable versions across service restart. Confirm no existing CAD scene changes on publication.

No tenant/app IDs or service deployment are supplied by the repository, so live Microsoft sign-in/consent/Conditional Access acceptance is a deployment prerequisite, not a claimed local test.

- [Microsoft: MSAL initialization](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
- [Microsoft: MSAL v5 redirect bridge for Vite](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- [Microsoft: silent API token acquisition](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token)
