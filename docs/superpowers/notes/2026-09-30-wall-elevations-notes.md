# Wall elevations — implementation notes

2026-09-30: Design approved in brainstorming. Basic `wallElevation()` and a plain panel SVG already
existed from Stage 2 (#71); this stage adds dimensions, scale and export.

- Rejected: extending `AssemblyView` to cover walls — it would put an `if (wall)` through
  `assembly.ts`, which `CLAUDE.md` already declines for `drawing.ts`.
- Rejected: panel-only dimensions — no export and a second source of truth.
- Deferred: floor/site-level evidence and clearance annotations on the drawing, until their rules
  are decided.
- User has CNC, saw, boring and edge-bander models and catalogue owners (2026-09-30); no extra
  release approval gate beyond Designer/Draftsperson. Relevant to edge banding (next) and release.
- Order agreed: wall elevations, then edge banding with finished/cut dimensions, then
  drawing-to-cutlist reconciliation.
