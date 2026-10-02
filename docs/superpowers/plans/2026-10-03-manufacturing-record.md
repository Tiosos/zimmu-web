# Shared manufacturing records — implementation plan

Spec: ../specs/2026-10-03-manufacturing-record-design.md
Notes: ../notes/2026-10-03-manufacturing-record-notes.md
Baseline: merged #79, main 6aa6437f99f24123032d228e2cf2500c647df479.

1. Capture pre-migration CSV goldens from an anonymised synthetic four-cabinet fixture with manual board, round stock, banding and instruction. Avoid volatile IDs in golden serialized output; pin section identities in the fixture.
2. Add a scene-side typed adapter and dimension helpers using existing edge/grain/ownership functions. Return independent machining/manual/stock/provenance objects; no rates, world transforms, approval or release state.
3. Migrate existing board/dowel/band grouping to record entry points with compatibility wrappers. Preserve keys, units, row/member ordering, null-rate and pricing behaviour. Make BOM modal and impact production reuse one derived set; keep exports and packet wrappers valid.
4. Replace impact physical-fact assembly with records, preserving its canonical comparisons, operation detail rendering, placement signature and incomplete estimates. Test existing imported-version and anchored-neighbour scenarios unchanged.
5. Add regressions for exact golden CSV, save/reopen and role-stable regeneration; inspect compatible packet/reconciliation tests. Mutation-test adapter omissions/defaults and grouping branches with byte backups, predicted assertion failures and exact restoration.
6. Update architecture/README and regenerate structure; run focused and full unit tests, typecheck, lint and both builds before commit/publication. Validate exact GitHub tree, open draft and inspect CI/E2E logs. Fix failures and repeat affected gates.

Alternatives: migrating every drawing/nesting/label consumer at once rejected because that obscures parity and couples distinct local/BOM axis conventions. Importing UI CSV helpers into the scene layer rejected as a dependency inversion. Storing another authoritative scene rejected; records are derived only. Mixing rates/world placement into physical records rejected because pricing and assembly movement have different change dependencies. Company machine/drilling templates, live identity setup, signatures and release/workflow transport remain separately designed capabilities requiring their own inputs.
