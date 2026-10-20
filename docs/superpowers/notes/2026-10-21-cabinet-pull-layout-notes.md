# Cabinet pull layout notes

- Starts at verified main 6a1e59c (PR147); prior 50 tasks are merged.
- Uses per-front-board metadata to support independent door leaves without changing structural opening definitions. Library layouts intentionally remain structural.
- Geometry is through-drilling only; generic fixing dimensions do not establish a compatible vendor product or screw length.
- Runtime skill applied for managed workspace/network readiness; normal inherited proxy retained.
- Spec: ../specs/2026-10-21-cabinet-pull-layout-design.md
- Plan: ../plans/2026-10-21-cabinet-pull-layout.md

- The actual board geometry is regenerated, not reimplemented for the preview. Pull pattern checks read the existing component-generated cups plus retained user cuts; through-hole instructions and SVG annotations are produced by the existing drawing path.
- Carcase regeneration previously dropped manual machining operations. It now preserves unowned manual instructions, following reconcileBoards' ownership rule; the new pull integration test verifies this alongside cuts and edge decisions.
- A configured generated front's moved duplicate must explicitly become non-driven and role-free, otherwise the existing duplication path can let it claim the original role on regeneration. This adjustment is restricted to fronts carrying pull settings; moved duplicates drop automatic pull metadata.
- Preview revalidation uses the same geometry helper as regeneration. Redundant schema/pattern checks were removed in favour of shared validation and integration tests that inspect real emitted holes. No-op comparison uses setting fields rather than object key order.
- Numeric containment checks include derived hole spacing, so tiny pitches that collapse to one floating-point position cannot emit a two-hole pattern. Drilling diameter must produce a positive representable radius.
- Manual-operation mutation initially produced a TypeError in the test rather than an AssertionError; the test now asserts the retained instruction IDs directly and was rechecked. Scratch mutations are backed up/restored and compared; no git checkout restoration.
- Validation complete: typecheck/lint pass; full units 208 files, 3,632 passed, 10 skipped; CAD and catalogue builds pass (existing CAD chunk-size warning remains).
- Mutation checks: all 37 guard/ownership/quantity checks produced the intended AssertionErrors. Numeric guards were rechecked after derived-spacing refinement; manual instructions were rechecked after correcting the test assertion. All mutations restored from compared scratch copies.
- Chromium: six workflows pass, covering paired pull staging/apply/undo/redo/removal cancel, invalid drawer drilling, knob application and BOM quantity, plus both prior Fronts & Drawers and both fixed finishing workflows.
