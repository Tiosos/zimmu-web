# Company catalogue API — Entra setup and operation

This is a server increment, separate from the browser CAD application. It provides authenticated rule/product authoring and controlled publication. The CAD UI does not yet sign in, fetch these company definitions, or adopt published versions. Starter examples in CAD remain examples.

## IT setup

1. Register a **single-tenant API application** in Microsoft Entra. Set `api.requestedAccessTokenVersion` to `2`. Record its Application (client) ID and your Directory (tenant) ID. The service requires v2 API access tokens with that API client ID as audience.
2. Expose the delegated scope `Catalogue.Access` on the API (for example `api://<api-client-id>/Catalogue.Access`). Require the appropriate company/admin consent. Application-only tokens and ID tokens are rejected.
3. Define API app roles with **Users/Groups** as allowed member types:

   | Role value | Assigned to | Authority |
   | --- | --- | --- |
   | `Catalogue.RuleAdministrator` | IT rule administrators | Create/edit/submit/publish master rules |
   | `Catalogue.ProductDesigner` | Authorised senior designers | Create/edit/submit products; review another designer's submitted product |

   Assign these roles to the intended users/groups on the API enterprise application. Neither directory role names nor browser-selected roles grant catalogue authority. A user with both app roles has both permissions but still cannot approve their own product.
4. Register a separate single-tenant SPA client for the later editor, with SPA redirect URIs and delegated permission to this API. Use MSAL authorization code flow with PKCE; no client secret belongs in a browser. The SPA and MSAL editor are not implemented by this PR. For API verification, acquire a delegated access token for this API using an IT-approved client, then supply it as a bearer token.

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
