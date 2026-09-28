# Production readiness checks — report-only

## Scope
Extend the shelf-access report with cabinet parameter validation, unresolved board material
thickness, missing generated cabinet/frame/drawer parts, and unresolved joinery. Hidden items are
included. Findings select the actual affected part/component and close the report; they never edit
the scene or block exports.

## Authority and limits
- Validate cabinet parameters with the existing validator and thickness resolver.
- Derive expected parts in a disposable scene with the existing frame, drawer and cabinet passes.
  Compare roles within their owning component, not cabinet-wide labels. Missing subassemblies are
  reported at the cabinet. Detached assemblies and declined generation remain explicitly unassessed.
- Check expected cabinet joints independently of adjacency. Reuse the joint checklist for other
  unresolved pairs and intentional contacts. A recorded joint is not proof its machining is valid.
- Report unknown/failed/skipped checks, never a global manufacturing-ready certification.
- Bound numeric/tree complexity before geometry work. Skip expected-part regeneration over a
  conservative 200-board estimate or 200 existing cabinet parts; skip the scene pair scan over
  200 boards. Surface checklist truncation and limit displayed findings to 200.
- Hardware suitability, detailed machining verification, structural adequacy and physical assembly
  validation remain outside this report.

## Verification
Model tests cover normal generated scenes, hidden cabinets, missing shell/frame/drawer parts,
detachment, invalid geometry/materials, removed required joints, and resource limits. UI tests cover
inspection callbacks, read-only behaviour and existing preview/sheet flows. Browser coverage includes
inspection of a flagged cabinet and recovery by editing its quantity. Run the full unit suite,
typecheck, lint, build, and GitHub E2E before marking the PR ready. Do not merge without approval.
