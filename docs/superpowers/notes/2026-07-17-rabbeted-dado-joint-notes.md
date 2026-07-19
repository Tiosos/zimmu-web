# Rabbeted (Tongue-and-Dado) Joint (JP2) — Implementation Notes

Living notes: decisions, surprises, and deviations from the spec/plan. Audience is a
future developer (or AI) who needs the *why*.

## Data model

- **`profile` field on the existing `DadoJoint`, not a new joint kind (Option A).** A
  `RabbetedDadoJoint` variant would have meant a discriminated union inside `Joint`, plus
  duplicating `housingPartId`/`housingFace`/`housedPartId`/`housedEnd`/`offset`/`depth`/
  `clearance` and every reconciler/UI branch that pattern-matches on them. The field keeps
  "upgrade a plain dado to rabbeted in place" as the UX (flip **Profile** in the sidebar,
  nothing re-created) and costs three always-present fields that are simply dormant when
  `profile === 'plain'`.
- **File format bump 4 → 5.** `parseFile` defaults legacy joints with a defaults-first
  spread — `{ profile: 'plain', tongueThickness: 6, rabbetFace: '+Z', ...j }` — so any field
  a v4 file actually has wins over the default, and any it lacks gets the plain-safe value.
  `tongueThickness: 6` is an inert placeholder: it never affects geometry while
  `profile === 'plain'`, and gets re-derived to `housedThickness / 2` the moment a joint is
  first flipped to rabbeted (same as `onAddJoint`'s creation default), so the exact legacy
  constant doesn't matter. Regression test:
  `useFile.test.ts` → "v4→v5: legacy joint without profile fields defaults to plain".

## `deriveJoint` as the generalization seam

- JP1's `reconcileJoints` called `isValidDadoSeat` / `computeDadoGroove` / `computeDadoSeat`
  directly and hardcoded "one cut on the housing, one seat on the housed board." JP2 pulls
  all of that into a single pure `deriveJoint(joint, parts): { cuts: {partId, cut}[]; seat }
  | null`, and `reconcileJoints` is now a joint-agnostic distributor: strip orphans, then for
  each joint call `deriveJoint` and scatter whatever `{partId, cut}` pairs and seat come back
  across the matching parts. The reconciler no longer knows what a dado *is* — it just moves
  cuts and positions to the part ids it's told. Any future joint variant (stopped dado, etc.)
  only has to extend `deriveJoint`; `reconcileJoints.ts` shouldn't need to change again.
- This preserved **all four JP1 invariants** — idempotence, orphan-cut cleanup,
  stale-preserves-last-good, user-cut passthrough — with no changes to their tests, which is
  exactly what a correct generalization should look like: JP1's existing
  `reconcileJoints.test.ts` cases (plain dado → one cut + one seat) kept passing unmodified
  and served as the regression net for the refactor, while new rabbeted cases were added
  alongside them.

## Tongue-centering in `computeDadoSeat`

- For a rabbeted joint, the point that must land on the groove center is the **tongue
  center**, not the housed board's geometric end-face center. The existing seat math already
  computed the end-face center in the housed board's local frame at
  `(faceCenter.x, faceCenter.y, thickness/2)`-equivalent (via `computeLocalFaceCenter`); JP2
  overwrites only the local-Z (thickness) component of that point to
  `rabbetFace === '+Z' ? t/2 : thickness - t/2` when `hasTongue(joint)`. Only the narrow-axis
  (thickness) component moves — the face-normal (seating-depth) and run-axis (offset)
  components of the seat computation are untouched, because the thickness axis is the one
  the rabbet actually removes material from. This is the one line where "seat to board center"
  becomes "seat to tongue center"; everything else in `computeDadoSeat` is shared between
  plain and rabbeted.

## Thickness-end fallback

- `hasTongue(joint) = joint.profile === 'rabbeted' && faceAxes(joint.housedEnd).depth !== 'z'`.
  If `housedEnd` resolves to the local-Z axis (a thickness end), the "rabbet" would have to
  remove material along the same axis it's supposed to leave standing — there's no sensible
  tongue to cut. Rather than special-casing this as an error, `deriveJoint` just doesn't push
  a rabbet cut in that case: a rabbeted joint on a thickness-end housedEnd silently behaves
  exactly like plain (one cut, no tongue). This is a documented v1 boundary from the design
  spec, not a bug — worth remembering if a future joint variant needs the fallback to be
  louder (e.g. a sidebar warning) rather than silent.

## `hasTongue` predicate extraction

- Originally the `profile === 'rabbeted' && faceAxes(...).depth !== 'z'` guard was inlined at
  both call sites (`computeDadoSeat` and `deriveJoint`). Code review flagged the duplication;
  it was extracted to the exported `hasTongue(joint)` predicate in `dado.ts` so the fallback
  rule has exactly one definition. `computeDadoGroove`'s width branch
  (`profile === 'rabbeted' ? tongueThickness : housed.thickness`) intentionally does **not**
  use `hasTongue` — the groove narrows based on `profile` alone regardless of the housedEnd
  axis (a narrower groove is harmless even when no tongue is cut), so reusing the predicate
  there would have been incorrect, not just redundant.

## Housed rabbet cut reuses JP1's read-only cut rendering for free

- The rabbet `BoxCut` pushed onto the housed board carries `sourceJointId` exactly like the
  housing's groove cut. JP1 already rendered any cut with `sourceJointId` as a read-only
  `"{label} (joint)"` row in the sidebar's Cuts list and had `onUpdateCut`/`onRemoveCut`/
  `onLinkCuts` reject cuts carrying `sourceJointId`. That meant the housed board's new tongue
  cut needed **zero new UI code** — it just shows up as `"{joint.label} tongue (joint)"` the
  same way the housing's groove always has. `JointsPanel.tsx` only gained controls on the
  housing side (Profile / Tongue / Rabbet side); the housed side's existing
  "Edit depth / clearance / offset from {housing}" message covers the rabbet too.

## Code review fix carried into this task (Task 5 residue)

- Two `Select onValueChange` casts in `JointsPanel.tsx` (`profile`, `rabbetFace`) initially
  restated the literal unions inline (`v as 'plain' | 'rabbeted'`, `v as '+Z' | '-Z'`) instead
  of using the codebase's indexed-access precedent (`sidebar.tsx` casts `MitreCut['end']` /
  `MitreCut['axis']`). Fixed as `v as DadoJoint['profile']` / `v as DadoJoint['rabbetFace']`
  in a follow-up commit — cosmetic (no behavior change), but keeps the type tied to the
  source of truth instead of a second copy of the union that could drift if the field's type
  ever changes.

## Verification

- Full suite green at ~528 passing / 10 skipped (up from JP1's 513 — new coverage in
  `dado.test.ts` for `computeRabbet`/`hasTongue`/`deriveJoint`, `reconcileJoints.test.ts` for
  two-sided distribution and profile-flip-back cleanup, `useScene.test.ts` for the
  single-undo-entry profile flip, and `sidebar.test.tsx` for the Tongue/Rabbet-side controls).
- No changes anywhere in the OCCT/mesh/export/drawing seam — `computeRabbet` returns an
  ordinary `BoxCut`, and `makeShape`'s `makeCut` chain doesn't know or care that a cut came
  from a joint rather than the user. This was the main payoff of materializing joints as
  regular cuts back in JP1: JP2 added a second derived cut per joint without touching
  `occt.ts`, `occt.worker.ts`, `mesh.ts`, STL/STEP export, or `drawing.ts` at all.

## Deferred (unchanged from JP1, still open)

- Centered/two-sided tongues, stopped+rabbeted combinations, tongue chamfers,
  non-orthogonal joints, cylinders — all explicitly out of scope per the JP2 design spec.
