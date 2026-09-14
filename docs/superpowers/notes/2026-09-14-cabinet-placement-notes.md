# Cabinet placement — implementation notes

**Spec:** `docs/superpowers/specs/2026-09-14-cabinet-placement-design.md`
**Plan:** _(staged; written per stage)_

Living notes. The audience is whoever implements a stage and wonders why a rule is shaped the way it
is.

---

## 2026-09-14 — brainstorming session

### The opposite-face rule was wrong, and it was caught by arithmetic, not by review

The design went into the session with this rule: *anchor to the target's `front`, and the anchored
cabinet presents its `back` — which, when turned 90°, is a side in world terms.* That was asserted
from purpose and it is false. Working the corner numerically showed the return cabinet's back is a
plane of constant world **x** while the target's front is a plane of constant world **y** — they are
perpendicular, so the rule cannot place the cabinet at all.

The replacement — *the meeting face is the one whose outward normal most directly opposes the target
face's normal* — degenerates to the opposite face whenever the rotations match. **That is the whole
danger:** every straight-run fixture passes the broken rule. This is the same defect class as the
96-case symmetric sweep that `openingRect` survived, and the single-drawer fixture that index-based
reconciliation survived. A rule that is right in the symmetric case and wrong in the asymmetric one
needs an asymmetric fixture or it is not tested.

### Three things asserted in the first pass that the code contradicted

Recorded because the ratio is the point — three wrong claims in one short design, all of them
confident:

1. **"A carcase's box is `width × height × depth` straight off `CarcaseParams`."** False three ways.
   An applied back reaches `y = D + BT` (`carcaseRoles.ts:399`); an overlay front reaches `y = −FT`;
   and a toe-kick cabinet's shell starts at `z = floorZ`, so anchoring on the shell floats a Base 600
   100 mm off the floor. The last one is what forced occupied bounds.
2. **"Placement must lead the pipeline because it reads only parameters."** The premise is true and
   the conclusion does not follow. Nothing in the pipeline reads a component's position at all, so
   placement is order-independent. It leads by convention. The drawer notes record a plan that
   asserted an ordering argument it had not checked; this is the same shape, caught before it shipped.
3. **"The cycle guard in `componentTree.ts` sits beside this."** `wouldCycle` guards `parentId`. The
   anchor graph is a *different* graph over the same components. It is a model to copy, not code to
   reuse.

### `gap` alone underspecifies position by two axes

Not a subtlety — a hole. A face is two-dimensional, so a side-to-side anchor with only a `gap` has no
defined floor alignment and no defined front alignment. Fixed with a 2-vector `offset` in the target
face's plane.

The pleasing part: the local origin corner is front-bottom-left, so `offset: {0,0}` gives front-flush
and floor-flush without either being a special case. The *unpleasing* part is that this is the wrong
default for mixed depths — a 330 wall unit beside a 560 base lands front-flush rather than against
the wall. Resolved by keeping one model rule and letting the plan view's drag write a back-flush
offset when depths differ. **The user was asked and answered only the first half of that question;
the drag behaviour is my decision and is flagged as such.** If back-flush-on-drag turns out to be
wrong, it is a UI change, not a model change — which is the reason for putting it there.

### Blind corners cost one enum value

Expected to be the expensive part of the corner stage and it is not. `Section.front` is already
optional and `FrontSpec` already has `'false-front'` and `'panel'`, so a blind unit is an ordinary
carcase whose section tree has a leaf with no door. Nothing new in the generator, the front pass or
the hardware BOM.

What the corner genuinely needed was `'front'` in the anchor's face enum, so the return run can butt
into the blind portion. Worth remembering when the next "big" feature is estimated: the expensive
part was the placement rule, not the cabinetmaking.

### Why runs are derived rather than stored

A `RunComponent` was proposed and rejected. It gives a run an identity you can select and hang a
corner policy on, which is real value, but an L-shape is two runs that must still relate at the
corner — so the anchor between them has to exist anyway, and then the run is a second description of
a fact the anchors already carry. `nearestCarcase` exists because two BOM consumers each shipped
their own copy of an ownership question; this is the same trap with a component kind attached.

The cost is honest and was stated to the user: selecting "a run" means selecting something computed.
Stage 2 will have to make a derived group feel like an object.

### Deliberately not built

- **A `'top'` anchor side.** Stacking a wall unit on a base is the one real case. Asked, and the user
  confirmed it stays out. It is cheap now and expensive later, which is the argument *for* including
  it; it was excluded anyway because nothing in the three chosen layouts needs it.
- **Walls as objects.** Drawn as context, never modelled. Every anchor names a cabinet.
- **Filler strips.** A different answer to the corner question than a blind unit.

### The viewport gizmo was chosen against recommendation

Recommended deferring surface C: largest piece of new interaction code, duplicates the plan view, and
competes with `OrbitControls` for the same mouse drag. The user asked for all three surfaces. Staged
last so it blocks nothing — if it turns into a fight with the camera controls, stages 1–3 have
already shipped.

### Sourcing caveat that must not be lost

**The blind-corner dimensions are unverified.** A 900 blind unit against a 560-deep return leaves
340 mm of accessible opening. That figure is mine, from reasoning about the geometry, not from a
cabinetmaker or a catalogue. It is the same class of claim as the hinge table and the TANDEM runner
figures: a wrong number yields a perfectly self-consistent cabinet that does not work, and no test in
this repository can falsify it. The blind-width check (`blind ≥ return depth`) is a *geometric*
guard, not an ergonomic one — it says the door will not be overhung, not that anyone can reach into
the corner.
