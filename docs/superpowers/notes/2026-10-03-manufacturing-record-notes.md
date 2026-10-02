# Shared manufacturing records — implementation notes

Spec: ../specs/2026-10-03-manufacturing-record-design.md
Plan: ../plans/2026-10-03-manufacturing-record.md

- 2026-10-03: Started from merged #79 after its full review. Stage 4's shared part facts are the next useful independent increment. Stage 3's live IT setup and advanced company machining/layout authoring remain explicit separate scopes; this task introduces no company standards or machine parameters.
- 2026-10-03: Current grain-oriented CSV helpers live in ui/buildCsv; the update preview repeats physical fact extraction. Move shared facts to the scene layer while leaving UI formatting/pricing there. Preserve local axes versus BOM ordering and current round-stock purchased-length semantics.

- Captured the synthetic four-cabinet board/round-stock CSVs before migration from main. The frozen CSV bytes match exactly after adapter migration. Old grouping keys, label grouping, ordering and pricing semantics are intentionally retained; recorded cabinet IDs support later separately reviewed grouping changes.
- Compatibility wrappers filter their part kind before deriving records, avoiding work on unrelated kinds. BOM displays and each impact snapshot reuse one record set for physical facts and board/round-stock/band totals. Existing packet/export callers continue through compatible wrappers.
- The first band-omission mutation was caught by golden/physical-fact assertions, while the repricing test also dereferenced a missing row. Added explicit expected band-line count assertions before cost access, so failures describe the absent fact rather than a TypeError.

- The edge-decision mutation also exposed two legacy impact tests accessing a nonexistent changed part before asserting it existed. Added their expected single changed-part count first, retaining the original dimension/problem assertions. Missing impact facts now fail as assertions instead of dereference errors.

- All 31 final adapter/grouping mutations failed by AssertionError with no syntax or TypeError failures. Adapter and CSV sources were restored byte-for-byte after each mutation. Cases cover local/BOM orientation, cut problems, stock defaults/sheet/use, nested ownership, generation roles/overrides/pins, manual/geometric separation/copies, deterministic edge facts, round stock and compatible wrapper routing.

- Final local gates passed: typecheck, lint, 155 test files (2,729 passed / 10 skipped), CAD build and catalogue API build. Playwright discovers 33 tests across 15 files; browser execution is verified on the published PR head in GitHub Actions. Frozen pre-migration CSV parity remains exact. No persisted scene-format change or new machine/company policy is introduced.
