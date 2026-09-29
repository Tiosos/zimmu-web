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

## 2026-09-29 — cross-check of current plans

`plan_v1.md` (current Library version 68) establishes Company -> Project -> Area -> Room -> Joinery
Item, with Kitchen/Pantry as items and cabinets below them. Q410–Q417 fix cutlist cardinality,
shared production/delivery timing and individual installation; Q391–Q400 keep project reference
files at project level in SharePoint. Its §24 gives official production release to
Designer/Draftsperson. Its §6 and §16 keep tender estimate, fixed contract value and PM-controlled
variations in workflow, so CAD costing is an engineering estimate only. The Library copy ends at
Q431; a later conversation records Q432 as Drafter and PM permitted to create orders and submission
immediately setting Ready to Order. Do not treat that later answer as already saved in Library.

The existing cabinet-placement design deliberately excluded walls as objects; this new room stage
extends the product direction without changing the shipped `Anchor` semantics. The sheet-yield
design deliberately excludes CNC export and describes free nesting for yield estimation. The
manufacturing-readiness report is explicitly report-only and cannot itself become a production
release gate. The current production packet's hash identifies captured data, not a saved or
approved revision. These are boundaries for future stages, not regressions to fix immediately.

The older broad `joinery_3d_software_plan.md` and README describe file version 18 and early
prototype scope, while the current `useFile.ts` declares version 20. Update those historical
summaries separately if they are promoted as current documentation; do not use their old version
numbers or promised Rust timeline as acceptance criteria for this plan.

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
