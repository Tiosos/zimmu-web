# Catalogue rule flow implementation

**Spec:** `../specs/2026-10-02-catalogue-rule-flow-design.md`
**Notes:** `../notes/2026-10-02-catalogue-rule-flow-notes.md`

1. Define a starter construction-rule version using the current preset common defaults. Define an explicit allowlist for material slots, back mode, joints, front mount and reveal. Extract sparse recipe values without modifying preset geometry. Resolve field provenance in one pure domain API, and retain exact version lookups.
2. Store optional rule context on Scene. Adapt catalogue reconciliation to compare against the effective project baseline. Preserve metadata through parsing. Validate reference shape and each allowlisted project override. Bump to v26 and test v25 first-save and v26 round-trip. Reject unsupported field names instead of spreading untrusted JSON.
3. Extract the existing pure regeneration pipeline from the React hook for shared previews. Build project-rule and catalogue-version preview functions: preserve explicit item overrides, validate affected cabinet geometry/materials before generation, compare changed parameter fields, parts and generated hardware. Unknown source/target versions refuse the preview. Keep custom cabinets and detached parts intact.
4. Add an application action that verifies the source-scene signature and commits the generated candidate in one undo entry. Add a project-rule editor with preview/apply and a cabinet version selector for installed versions. Show validation errors and preserve a preview for inspection until accepted. Editing draft inputs invalidates its preview. A later scene edit must make the old preview inapplicable.
5. Cover precedence, optional fields, override removal, missing versions, synthetic v2 change, stable retained part IDs, incompatible materials, stale application, undo/redo and persistence. Add a browser flow for project reveal preview/apply and cabinet override preservation. Mutation-test key precedence and stale-preview guards by backing up/restoring files.
6. Run typecheck, lint, full unit suite, build and diff check. Regenerate structure trees. Publish a draft PR from merged #73 and require CI/E2E before readiness. Record implementation limitations and verification evidence.

## Alternatives and limits

- Store duplicate rule settings on every cabinet: rejected because project defaults would drift. Scene is the existing modelling aggregate and already owns project material definitions.
- Recompute project specifications at load: rejected because opening a saved design must not adopt unreviewed changes.
- Infer overrides from regenerated boards: rejected because rule resolution must precede generation; detached-part overrides remain under their existing contract.
- Merge section/frame layouts during version changes: deferred; these are atomic overrides. Section IDs for retained layouts remain stable.
- Expose an unauthenticated role dropdown as publishing authority: rejected. The second-designer approval decision is recorded for a future authenticated catalogue service.
