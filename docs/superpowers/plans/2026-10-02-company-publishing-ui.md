# Company publishing UI implementation plan — Keycloak

Supersedes the earlier Entra/MSAL selection after the user chose option B.

1. Publish an API replacement of merged #75 from main, preserving company/staff identities and immutable audit. Stack #76 on that branch; merge API first only when authorised later.
2. Replace MSAL with Keycloak JS, preserve unrelated lockfile packages and use a real separate catalogue entry. Explicit login redirects the catalogue window only; no custom OAuth adapter or token messaging.
3. Initialize code/PKCE callback before React, load `/me`/drafts/versions and inject server-verified initial data. Refresh request tokens in memory, fail closed on expiry, clear on logout, reject late sessions.
4. Keep existing rule/stock/product forms, creator-only commands, different-designer review, saved revision/digest/pin confirmation and reload locks. Update visible sign-in labels and optional configuration errors.
5. Rewrite browser entry/callback checks, add callback-data and Keycloak session unit tests, deliberately break each new security guard and restore originals byte-for-byte.
6. Update setup docs, architecture index and living notes. Run frozen installation, full type/lint/unit gates and both builds. Publish drafts and verify GitHub CI/E2E. Live realm acceptance remains IT's deployment prerequisite.
