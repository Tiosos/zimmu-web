# Shared nesting and label implementation plan

Spec: ../specs/2026-10-03-manufacturing-nesting-labels-design.md
Notes: ../notes/2026-10-03-manufacturing-nesting-labels-notes.md
Baseline: main ab293c3, merged #80.

1. Extract the existing local cut-footprint transformation into an edge helper shared by the compatibility cutPartOf wrapper and manufacturing records. Compute detached local nesting geometry, retaining untransformed machining/manual facts for other consumers. Preserve unchanged valid geometry and origin-shift semantics for box cuts.
2. Narrow the mask/worker input to its actual physical fields; derive material groups from records and physical stock. Keep the public scene-parts hook wrapper. Preserve grouping order, grain defaults, clearance, debounce, worker termination and stale-result rejection. Include invalid cut IDs/reasons in reports and exclude their masks.
3. Add a record-based label map with part/cabinet identity, original label and finished/cut/stock/grain/edge detail. Wire BomModal and sheet SVG details; keep visible labels and existing callers compatible. Escape every authored string and retain identity when labels do not fit.
4. Add independent parity tests for legacy valid nesting geometry and CSV bytes, local-origin shaped masks, invalid geometry, unknown/zero stock, mixed kinds, duplicate labels and nested ownership. Test label updates and shape-only invalidation, save/reopen/regeneration and packet regressions. Inspect actual worker inputs, not only wrapper equivalence.
5. Update notes/architecture and regenerate structure. Run focused tests then full unit/type/lint/build gates, inspect diff and sources; publish feature branch and draft PR after successful self-test. Verify exact-head CI and Chromium, repair failures and repeat affected gates.

Alternatives: fabricated full scene parts in worker jobs rejected because placement/provenance are unrelated to masking; BOM-axis masks rejected because grain would be applied twice; finished-size fallback on errors rejected because it falsely claims valid nesting. A separate printable label/PDF workflow is deferred; this PR migrates existing sheet labels. Global cache or App-wide record storage is deferred: useNest keeps its shape signature and labels update from current records without persisting a second scene.
