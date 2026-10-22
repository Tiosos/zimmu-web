# Appliance bays and service openings implementation

Spec: ../specs/2026-10-22-appliance-services-design.md
Notes: ../notes/2026-10-22-appliance-services-notes.md

1. Define bounded browser-safe bay/service recipe validators and optional typed Scene/BoardPart fields. Add raw/current parsing, format-36 pins and preservation across generator/shared reconciliation/duplication paths. Existing worktop-only ownership remains unchanged.
2. Resolve physical leaf openings through resolveCarcase and face-frame intersections, derive usable front/rear planes, body/reserve boxes and required/available dimensions. Compare all cabinet-stock bounds and sibling bays, with explicit fit issues rather than silent construction changes. Implement add/edit/delete/copy preview and exact-signature acceptance.
3. Reuse worktop rectangular/circular feature geometry behind a service-only synthetic board adapter, expand bounded slots, transform broad-face entry, and assess minimum web against real existing cuts. Add a final post-joint regeneration pass preserving last-valid cuts on errors, and expose diagnostics/ownership checks.
4. Build two accessible cabinet editors: dimensions/clearances/category/position/copy and three orthographic fit views; panel/feature selection, position/depth/face/slots/web/bay association, resolved cuts and actual cabinet projections. Inputs invalidate previews, resets/cancels do not write, applied drafts resync once.
5. Wire one callback per workspace through commitReconciled, protect normal recipe-owned cut tools, and invalidate related old preview signatures when new metadata changes.
6. Add pure model/file/pipeline/ownership/history/UI/browser regressions. Run focused green baselines and backed-up targeted mutations before full checks. Freeze source/tests during complete units and browser flows; sequence units, both builds, browser. Record actual results, regenerate project structure, remove temporary browser config and commit locally. No dependency or network publishing changes.
