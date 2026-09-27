# Face frames stage 2 — divisions and half-overlay

**Date:** 2026-09-27  
**Scope:** Stage 2 of `docs/superpowers/specs/2026-09-24-face-frames-design.md`.

## Goal

Extend the shipped Stage-1 face frame from a single opening to divided cabinets without introducing
a second description of cabinet layout.

A vertical section division produces a mid stile. A horizontal section division produces a mid
rail. Their centres align to the already-resolved carcase divisions; frame openings are then bounded
by those members. Half-overlay fronts consume those openings through the existing `frontCells`
rule.

## Architectural rule

Do **not** re-solve section sizes inside the smaller frame opening. Fixed-size and percentage
sections would drift relative to the partitions behind the frame. The carcase section resolver stays
the one source of truth.

`faceFrameGeometry` therefore receives the resolved section tree for split cabinets. Stage-1 leaf
callers remain valid without it; a split cabinet without resolved geometry declines rather than
guessing.

## In scope

- Mid stiles from vertical panel divisions using `midStileWidth`.
- Mid rails from horizontal panel/rail divisions using `midRailWidth`.
- Nested vertical/horizontal splits.
- One framed opening per leaf.
- Split-with-no-division boundaries, with no invented frame member.
- Real frame boards and reconciliation for the new member roles.
- Half-overlay/inset/full-overlay fronts consuming the new openings.
- Asymmetric tests for outer stile, outer rail, mid stile and mid rail widths.
- Frameless and Stage-1 single-opening behavior preserved.

## Explicitly out of scope

- Drawer boxes following framed openings (Stage 3).
- Adjustable/fixed shelf resizing to framed openings (Stage 3).
- Face-frame hinge plates, hinge catalogue variants, or hardware (Stage 4).
- New frame joinery kinds.
- Applied end panels or scribe overhang.

## Geometry

The outer four members are unchanged.

For a resolved division:

- vertical: member role `stile-{parentId}-{index}`, centred on the carcase division, width
  `midStileWidth`, spanning the framed rectangle of its parent section;
- horizontal: member role `rail-{parentId}-{index}`, centred on the carcase division, width
  `midRailWidth`, spanning the framed rectangle of its parent section.

The children recurse into the clear rectangles on either side. A `division: 'none'` split uses the
resolved child boundary but emits no member.

If any member consumes its parent opening, geometry returns `null`.

## Test gates

- vertical split emits one mid stile at the carcase partition centre;
- horizontal split emits one mid rail at the carcase shelf centre;
- mixed nested split proves the child member stops at its parent members;
- every leaf receives the correct opening;
- asymmetric widths prove mid members do not borrow outer member widths;
- half-overlay cells lap each generated member by half its own width less half the reveal;
- real frame regeneration emits/reconciles mid-member boards and preserves IDs;
- a drawer-front leaf still declines the frame until Stage 3;
- existing Stage-1 tests stay green;
- typecheck, lint, unit tests, production build and Playwright E2E all pass.
