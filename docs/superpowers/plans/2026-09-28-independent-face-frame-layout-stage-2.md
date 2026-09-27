# Independent face-frame layout — Stage 2: rails and front zones

**Date:** 2026-09-28
**Base:** main at `2c8c637d5e7407c9c7289932b4b43666923f1351`

## Goal

Let the face have its own divisions without inventing structural carcase divisions. The first
end-to-end cabinet is one structural opening with an upper drawer front, an independent horizontal
rail, and a lower pair of doors with an independent centre stile.

## Model

A face-frame structural leaf may opt into a recursive frame-zone tree:

```ts
interface FrameZone {
  id: string
  size: SectionSize
  front?: FrontSpec
  content:
    | { kind: 'leaf' }
    | { kind: 'split'; axis: 'vertical' | 'horizontal'; children: FrameZone[] }
}

FaceFrameParams.layout?: Record<SectionId, FrameZone>
```

The section tree remains the sole authority for cabinet structure and interiors. Frame-zone splits
emit face-frame members and physical front openings only. They never emit a partition, shelf, joint
or new structural section.

## Identity

- Section IDs continue to own interiors.
- Frame-zone IDs own physical front openings when a layout override exists.
- Front role keys use the physical opening owner: `front-<openingId>-<leaf>`.
- Drawer components gain an optional frame-opening identity while retaining `sectionId` for
  structural ownership and old-file compatibility.

## Compatibility

- No `frame.layout`: existing section-driven frames are unchanged.
- `pairStile` remains readable and functional for Stage-1 files.
- New layouts express their own pair stile as a vertical zone split; the UI does not create a new
  `pairStile` flag.
- File format remains v20 because all fields are optional/additive.

## Geometry

Frame-zone layout resolves inside the already-resolved framed rectangle of its owning structural
leaf. Child sizes use the same fixed/percent/equal semantics as sections. Every split consumes the
configured mid-member width and emits a member centred between its child clear openings.

The resolver declines the whole frame when a member consumes an opening or sizes do not fit.

## Fronts

When a section has a frame-zone override, its `section.front` is ignored for physical front
generation. Leaf zones supply the fronts. Framed front rectangles derive from the physical clear
opening plus adjacent frame-member geometry, so inset, overlay and half-overlay do not need a
second copy of structural-side rules.

## Drawers

A drawer site is identified by structural section + optional frame opening. The drawer box fits
through the physical frame-zone opening. Carcase runner machining and hardware use that same site.

## UI

Stage-2 UI exposes one practical editor over the generic model:
- **Independent rail** toggle for the selected structural opening;
- upper-zone height;
- upper front kind;
- lower front kind;
- lower pair-door toggle.

The generated data is the generic recursive zone tree, not a special rail parameter.

## Golden fixture

One structural opening:
- upper drawer front;
- independent horizontal rail;
- lower pair doors;
- independent centre stile;
- no structural division boards.

Assert frame stock, front geometry, drawer box/site, hinge cup-driven BOM, elevation, drawings and
v20 round-trip.

## Deferred

Arbitrary drag positioning, more than two children per split, direct nested-zone editing UI, and
physical shelf insertion/access analysis through independently divided face openings.
