# Catalogue impact implementation plan

Spec: ../specs/2026-10-03-catalogue-impact-design.md
Notes: ../notes/2026-10-03-catalogue-impact-notes.md

1. Start a feature branch from merged #78 main. Establish spec and notes before code. Inspect RulePreview's captured source, pipeline candidate, BOM calculations, material/library merge and manual operations.
2. Add a pure UI-side impact derivation accepting captured source/candidate and current pricing libraries. Build deterministic part facts using cut/finished dimensions and edge treatment. Join on stable IDs; classify additions/removals and changed fields; retain before/after machining and manual instructions, including placement changes. Exclude unchanged parts from detail.
3. Derive material quantities and price coverage from the same groupParts/groupDowels/groupEdgeBand functions as BOM; derive hardware through carcaseHardware/groupHardware, plus manual hardware cost. Keep material categories and version-qualified identities separate. Missing/invalid rates and invalid cut sizes produce explicit issues. Unknown totals stay unknown, never zero; suppress total delta until both complete.
4. Add expandable accessible impact tables and pricing scope text to RulePreviewDetails. Pass current material/hardware libraries from App through ProjectPanel/CabinetRulesPanel and directly to CabinetEditor. Compare the captured source, not a newer live scene, and leave acceptance staleness/undo untouched.
5. Add semantic tests for equal-count drilling changes, manual operations, cut/finished/edge facts, stable ID addition/removal, material/hardware quantities, project/installed-version updates, unknown/zero/current prices and no mutations. Test UI libraries on both flows and invalid previews. Extend independent-process Chromium scenario to inspect impact before accept and undo.
6. Baseline focused tests, mutation-test newly added guards with byte backups and expected AssertionError failures; restore and re-run focused tests. Run typecheck/lint/full tests and CAD/API builds before commit. Update living notes, README/API scope and architecture prose; regenerate project-structure.html.
7. Publish exact validated tree via GitHub on a feature branch, open draft PR and inspect CI/E2E on its exact head. Repair any failures and repeat applicable gates. Deliver reviewable draft; no merge or production deployment in this task.

Alternatives: cryptographic package signing deferred pending IT trust/key-lifecycle design; live CAD distribution deferred pending token isolation design; section/frame authoring deferred as a larger product/schema capability. Cost estimates based only on scene rates rejected because BOM also uses local libraries. Comparing cut counts rejected because drilling specifications can change at equal count. Copying generator/pricing logic rejected; use existing production derivations. Auto-apply and guessed rates rejected.

## PR #79 deep-review corrections

Cross-check part facts with BOM grain ordering, part-local machining/edge axes, nesting stock definitions and whole-project placement. Preserve local dimensions alongside BOM dimensions so transposing a free-grain board cannot disappear from the comparison. Show physical stock properties (thickness, sheet size, stock grain constraint and edge use) separately from prices; include colour as the BOM does. Label direct cabinet/part-record counts explicitly so indirectly moved neighbours do not contradict the manufacturing summary. Invalid or overflowing material quantities must make the estimate incomplete even at an explicit zero rate. Invalid manual quantities are unavailable; unit changes remain separate quantity lines rather than subtracting incompatible units.

The floating review height is also bounded by the space below its top offset, not only a viewport percentage. Chromium checks a 390 × 240 viewport as well as desktop, including access to explicit Apply after expanding details.
