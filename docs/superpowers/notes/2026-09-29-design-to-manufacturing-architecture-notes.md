# Design-to-manufacturing architecture — implementation notes

**Spec:** `../specs/2026-09-29-design-to-manufacturing-architecture-design.md`
**Plan:** `../plans/2026-09-29-design-to-manufacturing-architecture.md`

## 2026-09-29 — source and scope

The user accepted six product-direction decisions after a review of `zimmu-web` and comparison
with the manufacturer's Cabinet Vision product information. The latest `main` at writing includes
PR #68's production handoff packet. This is an architecture proposal and implementation sequence,
not a code migration or an assertion that any listed future feature already exists.

The prior `joinery_3d_software_plan.md` describes a broader general-purpose/open-core modeller and
a Rust/Tauri production target. Its architecture remains useful background, but a Cabinet Vision
style residential design-to-production product has a different first vertical workflow. The
browser-first choice is approved; a later platform choice requires performance evidence.

The separate operational workflow project already has decisions about JIDs, Group/Item IDs,
six-digit cutlist numbers and production tracking. The design product must reference these; it
must not issue a new cutlist number or duplicate the workflow's mutable production status.

## Alternatives and why they were not selected

- Merge CAD and workflow now: rejected for the present architecture because geometry rules and
  production status have distinct owners and release boundaries. A shared UI may be possible later.
- Start with all custom furniture and every machine format: rejected as a first delivery target;
  retain custom modelling without claiming automated manufacturing support for every operation.
- Rewrite the TypeScript prototype in Rust/Tauri immediately: rejected pending benchmarks; risks
  discarding working cabinet generation, drawings, tests and packet output without solving the
  first room/catalogue/release gaps.
- Allow live edits to flow into production: rejected; manufacturing needs a fixed approved issue.
- Copy catalogue values into every instance and auto-update them: rejected because provenance,
  overrides and release reproducibility would become ambiguous.

## Follow-up facts to obtain

Ask the user for an anonymised real kitchen example, company cabinet methods, actual machines and
controllers, catalogue/release owners, offline/collaboration constraints and an agreed integration
contract before implementing the corresponding stages. Treat any example defaults used meanwhile
as synthetic, labelled fixtures.
