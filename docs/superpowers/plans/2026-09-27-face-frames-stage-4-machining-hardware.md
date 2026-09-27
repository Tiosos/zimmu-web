# Face frames stage 4 — machining and hardware

**Date:** 2026-09-27  
**Base:** main at `b45d32a0720e960b0daade14cb581010906964ad`  
**Scope:** Stage 4 of `docs/superpowers/specs/2026-09-24-face-frames-design.md`.

## Goal

A framed door is fully manufacturable: its cup bores exist, the matching mounting-plate bores are
on the face-frame stile that actually carries the door, and the hardware list names a face-frame
hinge variant while continuing to derive quantity from emitted cup bores.

## Standing invariants

1. **Quantity comes from machining.** One emitted cup = one hinge. A door too thin for a cup still
   quotes zero hinges.
2. **The plate is bored only into the upright the leaf hinges on.** Frameless means carcase side or
   partition. Framed means face-frame stile.
3. **One geometry authority.** Door rectangles and framed openings come from the same resolved
   section tree / `frontGeometryOf` path already used by Stages 2–3.
4. **Passes stay one-way.** `regenerateFaceFrames` derives stile machining from cabinet params and
   resolved geometry; it does not read emitted door boards.
5. **User cuts survive regeneration.** Frame-owned cuts are tagged to the FaceFrameComponent and
   reconciled through `reconcileBoards` exactly like all existing frame cuts.

## Ownership

### Door cups — carcase-owned

Remove the Stage-3 guard that suppresses `cupRow` on framed doors. The existing cup geometry and
minimum-thickness refusal remain unchanged.

### Mounting plates — frame-owned

A new face-frame plate helper emits mounting holes in the stile board's own coordinates.
`regenerateFaceFrames` attaches those cuts to the generated stile before `reconcileBoards`.

For each door leaf:

1. resolve the leaf's frame opening;
2. choose the hinged x edge from `cell.hinge`;
3. find the stile member touching that edge and covering the leaf's framed z span;
4. compute cup heights from the same generated door geometry;
5. translate those carcase-z heights into the stile's board-x coordinate;
6. emit one plate pattern per cup.

This works for outer stiles, mid stiles, nested divided frames, and two-leaf doors without parsing a
role name.

The carcase-side plate branch explicitly continues to skip framed sections so a framed door cannot
be bored in both the stile and the side panel.

## Hardware catalogue

`hingeKeyFor` gains framed/unframed context.

Frameless:
- overlay -> existing `hinge-overlay`
- inset -> existing `hinge-inset`
- half-overlay remains invalid because validation requires a frame

Framed:
- overlay -> face-frame overlay key
- half-overlay -> face-frame half-overlay key
- inset -> face-frame inset key

The hardware tally still counts only `cups_*`; it never counts plate rows and never derives a
quantity from parameters.

## Physical drilling pattern — APPROVED: Blum-backed mixed selection

The existing frameless mounting-plate pattern is a 32 mm-system side-panel row beginning 37 mm back
from the cabinet front. It cannot be reused on a stile: the stile has a different board frame and
face-frame adapter plates have their own fixing geometry.

The project spec explicitly calls face-frame hinge geometry a stated figure requiring a
woodworker/product decision.

Approved product decision: preserve Zimmu's existing frame geometry and select a documented Blum
face-frame hinge from the actual overlay at each hinged stile. Cabinet geometry does not move to
suit a SKU.

Implemented selection families:

- COMPACT BLUMOTION 38N screw-on for partial overlays covered by its stocked nominal plus published
  cam side adjustment;
- COMPACT BLUMOTION 39C screw-on for larger wraparound overlays covered by its stocked nominal plus
  published cam side adjustment;
- COMPACT BLUMOTION 38B355BF22 face-mount for overlays >= 35 mm, with its pilot line derived from
  Blum's published `X = overlay - 35 + 9` replacement rule;
- CLIP top BLUMOTION 71B3650 + 175H5030.21 for inset.

If no published application covers a requested overlay, selection returns null: no guessed hinge,
no cup, no frame plate machining, and no BOM line.

### Inset machining representation

The 175H5030.21 is selected and catalogued, but its adapter drawing carries a 12-degree installation
geometry while Zimmu's current `HoleArrayCut` drills normal to a board face. Stage 4 must not fake
that as perpendicular CNC machining. Overlay/half-overlay machining proceeds; inset adapter pilot
machining remains withheld until the project chooses either an angled-drilling primitive or an
explicit manual/template-operation representation.

## Tests

- framed door emits cups;
- too-thin framed door emits no cups and quotes no hinge;
- left-hinged framed leaf bores only the left stile;
- right-hinged framed leaf bores only the right stile;
- two-leaf framed door bores both outer stiles, never a handle-side/non-hinged stile;
- divided cabinet resolves a mid stile correctly;
- nested divided cabinet resolves the local stile correctly;
- no framed plate row remains on a carcase side;
- frameless machining remains byte/value unchanged;
- hardware keys distinguish framed overlay, half-overlay and inset;
- hinge quantity equals emitted cup count for every framed mount;
- plate-row count cannot inflate hinge quantity;
- frame regeneration preserves unowned user cuts and replaces only frame-owned machining;
- typecheck, lint, unit, production build, Playwright E2E.
