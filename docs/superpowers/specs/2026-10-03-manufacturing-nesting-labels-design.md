# Shared manufacturing records for nesting and sheet labels

Build on merged #80 (ab293c3). Nesting and the existing sheet part labels consume the scene-side manufacturing records. Preserve CSV schemas, visible label text, grain rotation rules, shaped masks, purchased round-stock semantics, worker cancellation and file format v27. Labels gain escaped detail text and cabinet/part identity; standalone adhesive-label printing is a later UI increment.

## Geometry contract
Boards retain finished local geometry and operations. Add a detached nesting footprint in board-local cut axes with shifted box cuts. Reuse the edge-band cut geometry helper; BOM dimensions remain grain ordered. A cut-size problem is excluded with its part ID and exact reason, never nested as its finished rectangle. Boards without usable sheet stock remain absent from nesting as before. Round stock never enters sheet jobs.

## Traceability and invalidation
Build label facts from records, retaining stable part/cabinet IDs, original text, material, finished and cut sizes, grain and edge code. Render sheet details as XML-escaped title and cabinet ID metadata, even when a narrow part cannot fit visible text. Label renaming and pricing/placement/manual instruction edits refresh labels/pricing without rerunning nesting. Geometry, stock sheet/grain and edge changes invalidate shape jobs. Preserve stale-result guards and worker termination.

## Acceptance
Pin local cut origins and notch masks against the existing adapter, grain-width rotations, invalid cuts and absent stock, nested ownership and escaped duplicate labels. Compare BOM and labels against record sizes; compare nesting inputs against legacy cut geometry across the synthetic project. Check save/reopen/regeneration and the existing packet. Test rate/placement/label/manual edits versus physical edits and worker lifecycle. Run focused and full tests, typecheck, lint, CAD and catalogue builds before push; inspect CI and Chromium on published head. No automatic merge.
