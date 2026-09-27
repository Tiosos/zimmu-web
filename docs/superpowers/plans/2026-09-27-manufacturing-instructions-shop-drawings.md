# Manufacturing instructions and shop drawings

**Date:** 2026-09-27
**Base:** main at `e2d96fe88d03a49c056182f0d52573ee1daacd83`
**Follows:** Face Frames Stage 4 / PR #57

## Goal

Make every manufacturing fact introduced by the cabinet generators visible in the workshop-facing
outputs without turning instructions that are not representable as geometry into fake cuts.

## Invariants

1. **Geometry stays geometry.** `CutDef` remains the only input to projected/subtractive machining.
   `ManualMachiningOperation` is annotation/manufacturing data only.
2. **One source of dimensions.** Framed opening dimensions come from `faceFrameGeometry` using the
   already-resolved section tree; the UI does not independently recalculate frame openings.
3. **One instruction, all outputs.** A board's manual operation appears on its part drawing and in
   both SVG and DXF exports from the same drawing-model string.
4. **Frameless parity.** A cabinet with no frame keeps the existing elevation cells and drawing
   output behavior.
5. **Golden fixture crosses boundaries.** The final asymmetric fixture proves regeneration,
   hardware BOM, drawings, manual machining and file round-trip agree on one cabinet.

## Slice 1 — manufacturing callouts

- Add `manufacturingNotes: string[]` to board part sheets.
- Format each `ManualMachiningOperation` in the drawing model, not in SVG/DXF.
- Render the notes in a reserved title-block note region in SVG and DXF.
- Cover-sheet cut counts remain geometric cuts only; manual operations are not counted as cuts.
- Tests pin the Blum inset adapter instruction and prove no extra projected circle/rectangle exists.

## Slice 2 — face-frame-aware elevation dimensions

- Build the resolved tree exactly as `SectionElevation` already does.
- When framed, obtain clear leaf rectangles from `faceFrameGeometry`.
- Draw dimension labels for the actual framed opening width and height on each leaf.
- When frameless, retain current cell geometry and numbering with no new frame-opening labels.
- Use asymmetric divided fixtures so mid-member mistakes cannot pass.

## Slice 3 — golden manufacturing cabinet

Create one asymmetric framed cabinet fixture containing divided openings and mixed front/interior
behavior. Assert, end to end:

- frame boards and their machining/manual operations regenerate;
- derived hardware quantity equals emitted door cup count;
- inset manual operation survives save/load;
- part drawing carries the manual callout while geometric machining remains unchanged;
- framed clear-opening dimensions come from the frame geometry;
- cutting-list/nesting behavior still treats frame stock correctly.

## Validation

Typecheck, lint, unit tests, production build and Playwright E2E. Open as a draft PR until the exact
head is green and reviewed. Do not merge without explicit user authorization.
