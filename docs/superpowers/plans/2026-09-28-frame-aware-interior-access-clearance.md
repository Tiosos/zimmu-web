# Frame-aware interior access & clearance

**Date:** 2026-09-28
**Base:** main at `c3881df242d21701b7d40de1e1d6d0c72eaaa25d`

## Goal

Keep installed interior geometry distinct from the front aperture through which a removable part must
pass. Independent face-frame rails/stiles must never silently resize structural interiors.

## First physical rule

Stage 1 uses a conservative, deterministic **orthogonal front insertion** test.

An adjustable shelf may be generated only when at least one physical aperture belonging to its
structural section has:

- clear width >= the shelf's manufactured width; and
- clear height >= the shelf's material thickness.

No diagonal insertion, in-cabinet rotation, flex, temporary frame removal or assembly-before-frame
is assumed. Those are future explicit strategies, not hidden allowances.

## Apertures

Face-frame geometry derives a physical-access opening for every clear leaf:
- ordinary framed section: one opening;
- legacy `pairStile`: two leaf openings;
- independent frame-zone layout: every leaf zone, even a zone with no front.

Frameless sections use their structural opening.

## Adjustable shelves

The installed shelf envelope remains the structural section intersected with the section-level outer
frame opening, with the existing 2 mm side clearance. It is **not** shrunk to an independent
front-zone aperture.

Before emission, each shelf role is checked against the physical access apertures. If none can admit
it, that loose shelf is declined. Pin rows remain section-owned because they describe installed
shelf positions, not the insertion path.

A pure access-report function exposes the same decision to UI/tests so omission is visible rather
than silent.

## Drawers

A drawer is different from a loose shelf: it operates through its assigned opening for its lifetime.
Stage 2 already binds it to `frameOpeningId` and sizes/declines `drawerBoxMetrics` from that
physical opening. This milestone pins that invariant with regression tests rather than replacing it
with the shelf rule.

## UI

For the selected structural opening, Shelving shows an amber access warning when requested
adjustable shelves cannot pass through any current physical aperture.

## Golden regression

Extend the independent drawer-over-pair manufacturing cabinet with an adjustable shelf:
- the full-width upper aperture admits the shelf => shelf remains;
- then narrow that aperture so every physical opening is narrower than the shelf => shelf is
  declined and the access report names the section;
- no structural partition is introduced in either case.

## Deferred

Diagonal/rotated insertion simulation, removable face-frame members, assembly sequencing, shelf
split strategies, and access-path analysis for non-rectangular hardware/objects.
