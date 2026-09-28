# Frame-aware interior access & clearance — rotated insertion

**Date:** 2026-09-28
**Base:** main at `c3881df242d21701b7d40de1e1d6d0c72eaaa25d`

## Goal

Keep installed interior geometry distinct from the physical route through which a removable part is
installed. Independent face-frame rails/stiles must never silently resize a structural interior,
and a narrow aperture must not be treated as impossible when the part can genuinely be tilted or
rotated through it.

## Physical contract

An adjustable shelf is a rigid rectangular solid. Installation is proven only by a continuous,
sampled collision-free path from outside the cabinet to the shelf's generated installed pose.

The search may:
- translate the shelf;
- yaw, pitch and roll it;
- pass through any physical access aperture belonging to its structural section;
- rotate it back to the exact installed orientation inside the cabinet.

The search collides against:
- carcase shell panels;
- structural divisions;
- fixed shelves;
- face-frame stiles and rails.

Doors/fronts are assumed open or removed for shelf installation. Shelf pins and hardware are not
solid obstacles. Other adjustable shelves are removable and are installed independently.

No flexing, temporary face-frame removal, structural disassembly, or diagonal formula is assumed.

## Solver

`interiorAccess.ts` owns the pure rigid-body solver:
- oriented shelf box;
- axis-aligned structural/frame obstacles;
- deterministic candidate throat orientations;
- sampled outside -> aperture -> installed paths;
- OBB-vs-AABB separating-axis collision tests;
- conservative swept enclosures between every pair of sampled poses, subdividing ambiguous
  intervals and declining any interval still unresolved after 12 subdivisions;
- a witnessed result containing the aperture, maneuver type and sampled poses.

The search is deterministic: fixed angle/pose ordering, no randomness. Numerical epsilon is only a
collision tolerance, not an invented manufacturing clearance.

Straight insertion first tries the requested shelf height. This preserves clear routes above or
below fixed shelves that cross the centre of an otherwise usable opening. The rotated search then
tries the aperture centre. Changing rotation speed does not create another geometric route, so each
rotation is checked once. Sampled candidate orientations make the search incomplete: a declined
shelf means no certified route was found, not proof that every possible maneuver is impossible.

## Apertures

Face-frame geometry supplies every physical clear leaf:
- ordinary framed section: one opening;
- legacy `pairStile`: two leaf openings;
- independent frame-zone layout: every leaf zone, including one with no front.

Frameless sections use the structural opening.

## Adjustable shelves

The installed shelf remains the structural section intersected with its section-level outer frame
opening, with the existing 2 mm side clearance and existing front/back setbacks.

For each requested shelf, the generator builds its exact target box and asks the solver for an
insertion path. A shelf is emitted only when a path is witnessed. It is never narrowed to an
independent aperture.

Pin rows are emitted when at least one requested shelf is actually generated. Zero-shelf
pre-boring retains its legacy behavior.

## Drawers

Drawers remain bound to their assigned `frameOpeningId`. They operate through that aperture for
their lifetime, so Stage 2's drawer-box/runner geometry remains the authority rather than the
removable-shelf path planner.

## UI

For the selected structural opening:
- blocked requested shelves show an access warning;
- a shelf whose successful path requires rotation may show a concise installation note.

The UI consumes the same generated/access result; it does not run a second geometric rule.

## Regression strategy

Pure solver tests:
1. straight path succeeds;
2. straight path fails but a rotated path succeeds;
3. an aperture too small for any sampled rigid-body route fails;
4. a structural obstacle can invalidate an otherwise valid aperture path;
5. repeated solves return the same witnessed path.
6. a fixed shelf at the aperture centre does not block a clear route at the requested height;
7. a thin obstacle between sampled poses cannot be skipped.

Cabinet tests:
- full-width shelf behind an independent stile remains full-width and is retained when a rotated
  insertion path exists;
- drawer-over-pair cabinet still has no structural partition;
- a genuinely blocked shelf is declined and pin machining follows the emitted shelf truth;
- fixed shelves remain structural and are never subjected to the removable access rule;
- legacy frameless/framed cabinets retain their existing output.

## Deferred

Continuous analytic motion planning, arbitrary non-board objects, hardware collision envelopes,
door-swing collision during installation, removable frame members, assembly sequencing across
multiple loose parts, and interactive path animation. The witnessed pose list is deliberately
shaped so animation can be added without changing the solver contract.
