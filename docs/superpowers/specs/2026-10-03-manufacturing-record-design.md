# Shared manufacturing part record — Stage 4 first increment

## Outcome and boundaries
Provide one pure, transient adapter for current scene parts. BOM/CSV and catalogue-update impact consume the same physical facts. Preserve current generated geometry, grouping keys, row ordering, rates, CSV schemas, drawing/packet reconciliation, save format v27 and explicit adoption/undo. This increment is Stage 4 step 1 plus its first consumers; it does not declare every Stage 3 authoring capability complete.

## Record contract
Use a discriminated board/round-stock record keyed by the existing part ID. Preserve label, material and colour, actual parent/nearest cabinet IDs and label, driven flag, generation role, explicit part overrides and exact catalogue pin where present. Retain missing/unresolved pins as references; do not infer provenance from labels or claim approval. Workflow/project/release identity is not available to the existing part/BOM adapter and must not be fabricated.

For boards, distinguish local X length/Y width/Z thickness from grain-oriented BOM finished/cut dimensions. Reuse isSwapped, cutSizeOf, edgesOf, edgeCode and bandedEdgeLengths; retain local grain, BOM grain, named local edges, distinct sorted edge materials, finished band lengths and cut-size problems without clamping. Round stock retains source length/diameter; its cuts do not silently redefine purchased stock length. Preserve physical stock thickness, grain constraint, sheet size and edge use; omit rates and sheet prices from physical facts.

Keep geometric machining definitions and manual instructions in separate arrays, retaining IDs, coordinates, references and ownership. Return detached copies so an adapter consumer cannot alter source parts, material definitions or catalogue pins. Do not claim machine readiness or generate machine files. Placement stays outside physical records; impact continues composing world placement separately. No cache/invalidation policy is introduced in this small increment.

## Consumer migration
Move dimension helpers to the scene adapter and retain buildCsv exports for callers. Add grouping entry points accepting derived records, retaining current public part-based wrappers. BOM modal and impact production derive a set once and reuse it for board, round-stock and band rows; pricing remains a separate input so the same physical records can be repriced. Other existing packet/export callers retain compatible wrappers. The impact part comparison reads record facts, while its world-placement and price-completeness rules remain unchanged.

## Acceptance
Capture golden board/round-stock CSV output from merged #79 before migration using synthetic Base/Wall/Tall and an overridden instance, explicit manual board/instruction, edge stock and round stock. Compare byte-for-byte after migration, with stable physical record IDs through save/reopen and regeneration. Test grain axes, edge subtraction/run length/code, missing edge thickness/problems, nested cabinet ownership, custom/detached provenance, unknown catalogue pins, physical stock versus prices, non-aliasing and unchanged operation details. Preserve all existing BOM, reconciliation, packet, impact and browser scenarios. Mutation-test new branch/default/ownership/operation guards. Self-test before every commit/push; verify fresh CI and Chromium before delivering a draft PR. No automatic merge.
