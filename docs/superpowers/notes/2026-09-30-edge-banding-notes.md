# Edge banding — implementation notes

2026-09-30: Design approved in brainstorming. Answers that shaped it: finished size is the model
size; edges derived by role rule with per-edge override; edge stock is a material (`use: 'edge'`);
no band or one material per edge; outputs are cutlist, BOM, nesting and a drawing text line.

- Rejected: stamping resolved edges onto every generated board at regeneration. It duplicates the
  truth (rule and stamped copy can disagree) and adds a field to reconcile.
- Rejected: a material-level default only, and manual-only edges.
- Rejected: a separate edge-band list in the scene. It would duplicate thickness and cost plumbing
  and need its own file-format addition.
- Deferred: shaped edges, per-edge trim allowance, graphical edge marks, a band waste allowance.
  None has a verified machine figure yet.
- `CLAUDE.md` says `FILE_FORMAT_VERSION = 21`; the code is at 23, so this stage takes it to 24.
- Reference fixture codes `1L`, `1S`, `2L2S`, `SHAPED` (`docs/superpowers/fixtures/`): `SHAPED` stays
  a manual note in this stage.
- Order agreed with the user: wall elevations (done), edge banding (this), then drawing-to-cutlist
  reconciliation.
